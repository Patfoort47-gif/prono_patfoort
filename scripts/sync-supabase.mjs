// Synchronise les matchs avec Supabase puis règle les paris certifiés en attente (BET-52).
// Lancé par les workflows après la mise à jour de data/fixtures.json ; sans SUPABASE_SERVICE_ROLE_KEY il ne fait rien.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { analyseMatch, leaguePoints, selectionResult, settleTicket } from '../model.js';
import { createAdmin } from './supabase-admin.mjs';
import { recomputeStandings } from './league-engine.mjs';
import { recomputeSpecialStandings, settleGridPicks, syncSpecialRounds } from './special-engine.mjs';
import { awardXp } from './xp-engine.mjs';
import { updateStreaks } from './token-engine.mjs';
import { emitActivities } from './activity-engine.mjs';
import { settleDuels, syncShop } from './shop-engine.mjs';

const MARKETS = ['home', 'draw', 'away', 'over', 'btts'];
const STALE_DAYS = 10;
// Ligne de la table fixtures pour un match de data/fixtures.json.
export function fixtureRow(match, now = new Date()) {
  const odds = Object.fromEntries(MARKETS.filter(key => Number(match.odds?.[key]) > 1).map(key => [key, Number(match.odds[key])]));
  return { id: match.id, league: match.league, round: match.round ?? null, home: match.home, away: match.away, home_id: match.homeId ?? null, away_id: match.awayId ?? null,
    kickoff: match.kickoff ?? `${match.date}T12:00:00Z`, status: match.status ?? 'Programmé', completed: match.completed === true, voided: match.voided === true,
    home_score: Number.isFinite(match.homeScore) ? match.homeScore : null, away_score: Number.isFinite(match.awayScore) ? match.awayScore : null,
    odds, odds_source: Object.fromEntries(Object.keys(odds).map(key => [key, match.realOddsMarkets?.includes(key) ? 'real' : 'estimated'])), updated_at: now.toISOString() };
}
// Résultats utilisables par settleTicket : scores terminés, matchs annulés, et matchs jamais joués au bout de STALE_DAYS jours.
export function buildResults(settlements, fixtureRows = [], now = Date.now()) {
  const byId = new Map();
  for (const item of settlements ?? []) if (item.completed || item.voided) byId.set(item.id, { id: item.id, home: item.home, away: item.away, homeScore: item.homeScore, awayScore: item.awayScore, completed: item.completed === true, voided: item.voided === true });
  for (const row of fixtureRows) {
    if (byId.has(row.id)) continue;
    if (row.voided || (!row.completed && Date.parse(row.kickoff) < now - STALE_DAYS * 864e5)) byId.set(row.id, { id: row.id, voided: true });
    else if (row.completed && Number.isFinite(row.home_score) && Number.isFinite(row.away_score)) byId.set(row.id, { id: row.id, home: row.home, away: row.away, homeScore: row.home_score, awayScore: row.away_score, completed: true });
  }
  return [...byId.values()];
}
// Décisions de règlement pour les paris en attente. Les sélections sont rapprochées par identifiant de match uniquement.
export function planSettlements(bets, results) {
  const plan = [];
  for (const bet of bets) {
    const items = (bet.selections ?? []).map(({ home, away, match, ...rest }) => rest);
    const outcome = settleTicket({ betType: bet.bet_type, stake: bet.stake, items, systemLines: bet.system_lines ?? [] }, results);
    if (outcome.status === 'pending') continue;
    // Points de ligue : cote effective du ticket (une sélection annulée est retirée), 0 si remboursé. Le serveur ne les inscrit en ligue générale que si le ticket compte ; les ligues spéciales les utilisent aussi.
    const odds = outcome.status === 'won' ? outcome.payout / Number(bet.stake) : 1;
    plan.push({ id: bet.id, status: outcome.status, payout: outcome.payout, points: leaguePoints({ status: outcome.status, odds }) });
  }
  return plan;
}
export async function syncFixtures(admin, matches, now = new Date()) {
  await admin.upsert('fixtures', matches.filter(match => match.id && match.home && match.away).map(match => fixtureRow(match, now)));
  return matches.length;
}
export async function syncDailyChallenge(admin, challenge) {
  if (!challenge?.date || !challenge.picks?.length) return 0;
  await admin.upsert('daily_challenges', [{ day: challenge.date, picks: challenge.picks, updated_at: new Date().toISOString() }], 'day');
  return challenge.picks.length;
}
// Pronos du défi du jour en attente : même barème que la ligue générale (mise fixe de 10).
export function planDailySettlements(picks, results) {
  const plan = [];
  for (const pick of picks) {
    const { status } = selectionResult({ matchId: pick.match_id, key: pick.pick }, results);
    if (status !== 'pending') plan.push({ id: pick.id, status, points: leaguePoints({ status, odds: Number(pick.odd) }) });
  }
  return plan;
}
export async function settleDailyPicks(admin, results) {
  const pending = await admin.select('daily_picks', 'status=eq.pending&select=id,match_id,pick,odd&limit=2000');
  let settled = 0;
  for (const decision of planDailySettlements(pending, results))
    if (await admin.rpc('settle_daily_pick', { p_id: decision.id, p_status: decision.status, p_points: decision.points })) settled++;
  return settled;
}
export async function loadResults(admin, settlements, now = Date.now()) {
  const since = new Date(now - 60 * 864e5).toISOString();
  return buildResults(settlements, await admin.select('fixtures', `kickoff=gte.${since}&select=id,home,away,kickoff,completed,voided,home_score,away_score&limit=5000`), now);
}
// Value bets gagnés : paris simples dont la cote dépassait de plus de 3 % la probabilité du modèle au moment du règlement.
export function valueBetIds(decisions, bets, matches) {
  const byMatch = new Map(matches.map(match => [match.id, match])), ids = [];
  for (const decision of decisions) {
    const bet = bets.find(item => item.id === decision.id), item = bet?.selections?.[0], match = byMatch.get(item?.matchId);
    if (decision.status !== 'won' || bet.bet_type !== 'single' || !match?.odds) continue;
    const market = analyseMatch(match).markets.find(entry => entry.key === item.key);
    if (market && market.probability * Number(item.odd) - 1 > .03) ids.push(decision.id);
  }
  return ids;
}
export async function settleServerBets(admin, results, matches = []) {
  const pending = await admin.select('bets', 'status=eq.pending&select=id,bet_type,stake,counts_general,selections,system_lines&order=placed_at.asc&limit=1000'), accepted = [];
  for (const decision of planSettlements(pending, results))
    if (await admin.rpc('settle_bet', { p_bet_id: decision.id, p_status: decision.status, p_payout: decision.payout, p_points: decision.points })) accepted.push(decision);
  const valueIds = valueBetIds(accepted, pending, matches);
  if (valueIds.length) await admin.rpc('mark_value_bets', { p_ids: valueIds });
  return accepted.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const admin = createAdmin();
  if (!admin) { console.log('Supabase (service_role) non configuré : synchronisation des matchs et règlement des paris ignorés.'); process.exit(0); }
  const data = JSON.parse(await readFile('data/fixtures.json', 'utf8'));
  const synced = await syncFixtures(admin, data.matches ?? []);
  const shop = await syncShop(admin), rounds = await syncSpecialRounds(admin, data.matches ?? []);
  const challenge = await syncDailyChallenge(admin, data.dailyChallenge);
  const results = await loadResults(admin, data.settlements ?? []);
  const settled = await settleServerBets(admin, results, data.matches ?? []), daily = await settleDailyPicks(admin, results), grid = await settleGridPicks(admin, results);
  const repaired = await admin.rpc('repair_league_history');
  const ranked = await recomputeStandings(admin), special = await recomputeSpecialStandings(admin), xp = await awardXp(admin), streaks = await updateStreaks(admin), activities = await emitActivities(admin), duels = await settleDuels(admin);
  console.log(`${repaired} rattachements historiques réparés, ${synced} matchs synchronisés, défi du jour : ${challenge} matchs, ${settled} paris certifiés et ${daily} pronos du défi réglés, ${ranked} classements de ligue générale et ${special} de ligues spéciales recalculés, ${rounds} journées de ligues spéciales, ${grid} pronos de grille réglés, ${xp} événements d’XP, ${streaks} séries et tirelires, ${activities} événements du fil d’activité, ${shop} objets de boutique, ${duels} duels réglés.`);
}
