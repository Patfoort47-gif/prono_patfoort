// Moteur des ligues spéciales (BET-56) : journées, règlement des pronos de grille, classements et titres de fin de saison.
// Décisions pures dans special.js ; ce fichier lit et écrit Supabase avec la clé service_role.
import { leaguePoints, selectionResult } from '../model.js';
import { championEligible, planRounds, specialStandings, tier } from '../special.js';
import { monthKey } from '../league.js';

export async function syncSpecialRounds(admin, matches) {
  const leagues = await admin.selectAll('special_leagues', 'open=eq.true&select=id,kind,league_label,team_id');
  const rounds = leagues.flatMap(league => planRounds(league, matches));
  await admin.upsert('special_rounds', rounds, 'id');
  return rounds.length;
}

// Pronos de grille en attente : même barème que la ligue générale (mise fixe de 10), un match annulé vaut 0.
export function planGridSettlements(picks, results) {
  const plan = [];
  for (const pick of picks) {
    const { status } = selectionResult({ matchId: pick.match_ids[0], key: pick.key }, results);
    if (status !== 'pending') plan.push({ id: pick.id, status, points: leaguePoints({ status, odds: Number(pick.odd) }) });
  }
  return plan;
}
export async function settleGridPicks(admin, results) {
  const pending = await admin.selectAll('special_picks', 'status=eq.pending&source=eq.grid&select=id,match_ids,key,odd');
  let settled = 0;
  for (const decision of planGridSettlements(pending, results)) if (await admin.rpc('settle_special_pick', { p_id: decision.id, p_status: decision.status, p_points: decision.points })) settled++;
  return settled;
}

// Lignes de special_standings pour une ligue : classement de la saison et du mois en cours, avec les journées jouées.
export function standingRows(leagueId, members, picks, month, now = new Date()) {
  const played = new Map();
  for (const pick of picks) played.set(pick.user_id, new Set([...(played.get(pick.user_id) ?? []), pick.round_id]));
  const monthOf = date => monthKey(date);
  return [['season', specialStandings(picks, members, 'season', monthOf)], [month, specialStandings(picks, members, month, monthOf)]]
    .flatMap(([scope, rows]) => rows.map(row => ({ league_id: leagueId, scope, user_id: row.user_id, points: row.points, picks: row.picks, wins: row.wins, roi: row.roi, rank: row.rank, played_rounds: played.get(row.user_id)?.size ?? 0, updated_at: now.toISOString() })));
}
export async function recomputeSpecialStandings(admin, now = new Date()) {
  const month = monthKey(now), leagues = await admin.selectAll('special_leagues', 'open=eq.true&select=id');
  const [members, picks] = await Promise.all([admin.selectAll('league_members', 'select=league_id,user_id,joined_at'), admin.selectAll('special_picks', 'select=league_id,user_id,round_id,points,status,settled_at')]);
  let count = 0;
  for (const league of leagues) {
    const rows = standingRows(league.id, members.filter(item => item.league_id === league.id), picks.filter(item => item.league_id === league.id), month, now);
    await admin.upsert('special_standings', rows, 'league_id,scope,user_id');
    count += rows.length;
  }
  return count;
}

// Titres d'une saison de ligue spéciale terminée : champion (60 % des journées jouées depuis l'arrivée) et paliers Top 1 % / Top 10 %.
export function planTitles({ league, rounds, members, picks, season }) {
  const ranked = specialStandings(picks, members), size = ranked.filter(row => row.picks > 0).length, titles = [];
  const roundsFor = member => rounds.filter(round => new Date(round.starts_at) >= new Date(member.joined_at) && new Date(round.ends_at) <= new Date(`${league.season_end}T23:59:59Z`));
  const joined = new Map(members.map(member => [member.user_id, member]));
  const played = userId => new Set(picks.filter(pick => pick.user_id === userId && pick.status !== 'pending').map(pick => pick.round_id));
  const champion = ranked.find(row => row.picks > 0 && championEligible(played(row.user_id).size, roundsFor(joined.get(row.user_id)).length));
  if (champion) titles.push({ league_id: league.id, season, user_id: champion.user_id, kind: 'champion' });
  for (const row of ranked) { const level = row.picks > 0 ? tier(row.rank, size) : null; if (level) titles.push({ league_id: league.id, season, user_id: row.user_id, kind: level }); }
  return titles;
}
export const leagueSeasonLabel = league => `${league.season_start.slice(0, 4)}-${league.season_end.slice(2, 4)}`;
export async function awardSpecialTitles(admin, now = new Date()) {
  const today = now.toISOString().slice(0, 10), leagues = (await admin.selectAll('special_leagues', 'open=eq.true&select=id,season_start,season_end')).filter(league => league.season_end < today);
  let awarded = 0;
  for (const league of leagues) {
    const season = leagueSeasonLabel(league);
    if ((await admin.select('special_titles', `league_id=eq.${league.id}&season=eq.${season}&select=user_id&limit=1`)).length) continue;
    const [rounds, members, picks] = await Promise.all([admin.selectAll('special_rounds', `league_id=eq.${league.id}&select=id,starts_at,ends_at`), admin.selectAll('league_members', `league_id=eq.${league.id}&select=user_id,joined_at`), admin.selectAll('special_picks', `league_id=eq.${league.id}&select=user_id,round_id,points,status,settled_at`)]);
    const titles = planTitles({ league, rounds, members, picks, season });
    await admin.upsert('special_titles', titles, 'league_id,season,user_id,kind');
    awarded += titles.length;
  }
  return awarded;
}
