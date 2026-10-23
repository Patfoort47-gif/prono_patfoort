// Moteur des jetons (BET-58) : séries et tirelires, récompenses de fin de saison, primes mensuelles et défis.
// Calculs purs dans rewards.js ; les gains sont écrits dans token_ledger (clé unique par raison et par joueur : idempotent).
import { streakState } from '../model.js';
import { SPECIAL_MONTH_TOKENS, divisionDifficulty, featsOf, piggyBank, rankPrize, seasonReward } from '../rewards.js';
import { divisionIndex, seasonKey, seasonDates, monthKey } from '../league.js';
import { entrySequences, group } from './xp-engine.mjs';

// Séries et tirelires de la saison : une ligne par joueur et par ligue ('general' ou identifiant de ligue spéciale).
export function planStreaks({ season, sequences, specialSequences = {}, shields = {} }) {
  const rows = [], row = (user_id, league, entries) => { const shield = shields[`${user_id}|${league}`] ?? null, state = streakState(entries, shield), bank = piggyBank(entries, shield); rows.push({ user_id, league, season, current: state.current, best: state.best, multiplier: state.multiplier, piggy: bank.total, updated_at: new Date().toISOString() }); };
  for (const [user, entries] of Object.entries(sequences)) row(user, 'general', entries);
  for (const [league, perUser] of Object.entries(specialSequences)) for (const [user, entries] of Object.entries(perUser)) row(user, league, entries);
  return rows;
}

// Récompenses de fin de saison de la ligue générale pour les résultats `results` de la saison `season`.
// participation : {user_id: {played, offered}} (défis du jour) ; sequences : pronos de ligue générale de la saison par joueur.
export function planGeneralRewards({ season, results, participation, sequences }) {
  const rewards = [], ledger = [];
  for (const result of results) {
    if (result.outcome === 'INACTIF' || !result.group_size) continue;
    const played = participation[result.user_id], share = played?.offered ? played.played / played.offered : 0, division = divisionIndex(result.from_echelon ?? result.to_echelon);
    const reward = seasonReward({ piggy: piggyBank(sequences[result.user_id] ?? []).total, share, prize: rankPrize(result.group_rank, result.group_size), difficulty: divisionDifficulty(division), feats: featsOf(result) });
    rewards.push({ season, league: 'general', user_id: result.user_id, piggy: reward.piggy, regularity: reward.regularity, prize: reward.prize, difficulty: reward.difficulty, feats: reward.feats, total: reward.total });
    if (reward.total > 0) ledger.push({ user_id: result.user_id, delta: reward.total, reason: 'season', ref: `${season}:general` });
  }
  return { rewards, ledger };
}

// Récompenses de fin de compétition d'une ligue spéciale : tirelire, régularité (journées jouées depuis l'arrivée), prime de classement, difficulté de la ligue, titre de champion.
export function planSpecialRewards({ league, season, rounds, members, picks, ranked, titles }) {
  const size = ranked.filter(row => row.picks > 0).length, rewards = [], ledger = [], joined = new Map(members.map(member => [member.user_id, member]));
  for (const row of ranked.filter(item => item.picks > 0)) {
    const own = picks.filter(pick => pick.user_id === row.user_id && pick.status !== 'pending').sort((a, b) => String(a.settled_at).localeCompare(String(b.settled_at))).map(pick => ({ id: pick.id, points: pick.points, odds: Number(pick.odd) }));
    const available = rounds.filter(round => new Date(round.starts_at) >= new Date(joined.get(row.user_id)?.joined_at ?? 0)).length, playedRounds = new Set(picks.filter(pick => pick.user_id === row.user_id).map(pick => pick.round_id)).size;
    const feats = titles.some(title => title.user_id === row.user_id && title.kind === 'champion') ? ['special-champion'] : [];
    const reward = seasonReward({ piggy: piggyBank(own).total, share: available ? playedRounds / available : 0, prize: rankPrize(row.rank, size), difficulty: Number(league.difficulty) || 1, feats });
    rewards.push({ season, league: league.id, user_id: row.user_id, piggy: reward.piggy, regularity: reward.regularity, prize: reward.prize, difficulty: reward.difficulty, feats, total: reward.total });
    if (reward.total > 0) ledger.push({ user_id: row.user_id, delta: reward.total, reason: 'season', ref: `${season}:${league.id}` });
  }
  return { rewards, ledger };
}
// Petite prime mensuelle pour les 3 premiers du classement du mois d'une ligue spéciale.
export function planMonthlyPrizes({ league, month, standings }) {
  return standings.filter(row => row.picks > 0).sort((a, b) => a.rank - b.rank).slice(0, 3).map((row, index) => ({ user_id: row.user_id, delta: Math.round(SPECIAL_MONTH_TOKENS[index] * (Number(league.difficulty) || 1)), reason: 'special-month', ref: `${league.id}:${month}` }));
}

const DAY = 864e5;
export async function updateStreaks(admin, now = new Date()) {
  const season = seasonKey(now), since = `${seasonDates(season).start}T00:00:00+02:00`;
  const [entries, bets, dailyPicks, specialPicks, shieldRows] = await Promise.all([
    admin.selectAll('league_entries', `league=eq.general&season=eq.${season}&select=id,user_id,bet_id,daily_pick_id,points,settled_at`),
    admin.selectAll('bets', `settled_at=gte.${since}&select=id,odds`), admin.selectAll('daily_picks', `placed_at=gte.${since}&select=id,odd`),
    admin.selectAll('special_picks', 'status=neq.pending&select=id,league_id,user_id,odd,points,settled_at'), admin.selectAll('streak_shields', 'select=user_id,league,season,created_at')
  ]);
  const shields = Object.fromEntries(shieldRows.filter(row => row.league !== 'general' || row.season === season).map(row => [`${row.user_id}|${row.league}`, { from: row.created_at }]));
  const sequences = entrySequences(entries, new Map(bets.map(bet => [bet.id, bet])), new Map(dailyPicks.map(pick => [pick.id, pick]))), specialSequences = {};
  for (const [league, rows] of group(specialPicks, 'league_id')) specialSequences[league] = Object.fromEntries([...group(rows.sort((a, b) => String(a.settled_at).localeCompare(String(b.settled_at))), 'user_id')].map(([user, list]) => [user, list.map(pick => ({ id: pick.id, settled_at: pick.settled_at, points: pick.points, odds: Number(pick.odd) }))]));
  const rows = planStreaks({ season, sequences, specialSequences, shields });
  await admin.upsert('league_streaks', rows, 'user_id,league,season');
  return rows.length;
}

// Paie la fin de saison de la ligue générale pour les saisons closes récentes (idempotent).
export async function payGeneralSeasons(admin, now = new Date()) {
  const current = seasonKey(now), closed = (await admin.selectAll('league_seasons', 'status=eq.closed&select=season&order=season.desc&limit=3')).map(row => row.season).filter(season => season < current);
  let paid = 0;
  for (const season of closed) {
    const [results, participation, entries, bets, dailyPicks] = await Promise.all([
      admin.selectAll('season_results', `season=eq.${season}&select=user_id,from_echelon,to_echelon,outcome,group_rank,group_size,barrage`),
      admin.selectAll('daily_participation', `season=eq.${season}&select=user_id,played,offered`),
      admin.selectAll('league_entries', `league=eq.general&season=eq.${season}&select=id,user_id,bet_id,daily_pick_id,points,settled_at`),
      admin.selectAll('bets', `settled_at=gte.${new Date(Date.parse(`${season}-01T00:00:00Z`) - 3 * DAY).toISOString()}&select=id,odds`), admin.selectAll('daily_picks', `day=gte.${season}-01&select=id,odd`)
    ]);
    const sequences = entrySequences(entries, new Map(bets.map(bet => [bet.id, bet])), new Map(dailyPicks.map(pick => [pick.id, pick]))), plan = planGeneralRewards({ season, results, participation: Object.fromEntries(participation.map(item => [item.user_id, item])), sequences });
    await admin.insertIgnore('season_rewards', plan.rewards, 'season,league,user_id');
    await admin.insertIgnore('token_ledger', plan.ledger, 'user_id,reason,ref');
    paid += plan.ledger.length;
  }
  return paid;
}

// Fin de compétition des ligues spéciales et primes mensuelles.
export async function paySpecialLeagues(admin, now = new Date()) {
  const today = now.toISOString().slice(0, 10), current = monthKey(now), leagues = await admin.selectAll('special_leagues', 'open=eq.true&select=id,season_start,season_end,difficulty');
  let paid = 0;
  for (const league of leagues) {
    const standings = await admin.selectAll('special_standings', `league_id=eq.${league.id}&select=user_id,scope,picks,rank`);
    for (const month of [...new Set(standings.map(row => row.scope))].filter(scope => /^\d{4}-\d{2}$/.test(scope) && scope < current)) {
      const ledger = planMonthlyPrizes({ league, month, standings: standings.filter(row => row.scope === month) });
      await admin.insertIgnore('token_ledger', ledger, 'user_id,reason,ref'); paid += ledger.length;
    }
    if (league.season_end >= today) continue;
    const season = `${league.season_start.slice(0, 4)}-${league.season_end.slice(2, 4)}`, [rounds, members, picks, titles] = await Promise.all([
      admin.selectAll('special_rounds', `league_id=eq.${league.id}&select=id,starts_at`), admin.selectAll('league_members', `league_id=eq.${league.id}&select=user_id,joined_at`),
      admin.selectAll('special_picks', `league_id=eq.${league.id}&select=id,user_id,round_id,odd,points,status,settled_at`), admin.selectAll('special_titles', `league_id=eq.${league.id}&season=eq.${season}&select=user_id,kind`)
    ]);
    const plan = planSpecialRewards({ league, season, rounds, members, picks, titles, ranked: standings.filter(row => row.scope === 'season') });
    await admin.insertIgnore('season_rewards', plan.rewards, 'season,league,user_id');
    await admin.insertIgnore('token_ledger', plan.ledger, 'user_id,reason,ref'); paid += plan.ledger.length;
  }
  return paid;
}
