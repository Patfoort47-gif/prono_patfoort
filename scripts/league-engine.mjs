// Moteur de la ligue générale (BET-55) : classements recalculés après chaque règlement, clôture mensuelle des saisons.
// La logique de décision est dans league.js (pure, testée) ; ce fichier lit et écrit Supabase avec la clé service_role.
import { DIVISION_UNLOCKS, MASTER, closeSeason, computeStandings, divisionIndex, lastWeekend, nextSeason, seasonDates, seasonKey } from '../league.js';
import { parisDate } from '../model.js';

const lastDayOf = season => seasonDates(season).end;

export async function ensureSeason(admin, season) {
  await admin.upsert('league_seasons', [{ season }], 'season');
}

// Classement de la saison `season` : tous les joueurs de groupe, les joueurs en placement et ceux qui reviennent d'inactivité.
export async function recomputeStandings(admin, now = new Date(), season = seasonKey(now), today = parisDate(now)) {
  await ensureSeason(admin, season);
  const [players, members, entries, daily, old] = await Promise.all([
    admin.selectAll('player_league', 'select=user_id,echelon,joined_at,inactive'),
    admin.selectAll('group_members', `season=eq.${season}&select=user_id,group_id`),
    admin.selectAll('league_entries', `season=eq.${season}&league=eq.general&select=user_id,points,settled_at`),
    admin.selectAll('daily_participation', `season=eq.${season}&select=user_id,played,good,offered`),
    admin.selectAll('standings', `season=eq.${season}&select=user_id,rank,prev_rank,snapshot_date`)
  ]);
  const group = new Map(members.map(member => [member.user_id, member.group_id])), withEntries = new Set(entries.map(entry => entry.user_id));
  const roster = players.filter(player => group.has(player.user_id) || player.echelon == null || withEntries.has(player.user_id))
    .map(player => ({ user_id: player.user_id, group_id: group.get(player.user_id) ?? null, joined_at: player.joined_at }));
  const rows = computeStandings({ season, members: roster, entries, participation: Object.fromEntries(daily.map(item => [item.user_id, item])), previous: Object.fromEntries(old.map(item => [item.user_id, item])), today });
  await admin.upsert('standings', rows, 'season,user_id');
  // Un joueur inactif qui reprend ses pronos revient dans la ligue (sans groupe jusqu'à la prochaine clôture).
  const back = players.filter(player => player.inactive && withEntries.has(player.user_id)).map(player => player.user_id);
  for (const id of back) await admin.patch('player_league', `user_id=eq.${id}`, { inactive: false, updated_at: new Date().toISOString() });
  return rows.length;
}

// Éléments d'avatar débloqués en atteignant une division (acquis ensuite) ; la couronne est exclusive au Master.
export function unlockPlan(move) {
  const unlocks = [], revoke = [], reached = divisionIndex(move.to), before = move.from == null ? -1 : divisionIndex(move.from);
  for (const [division, items] of Object.entries(DIVISION_UNLOCKS)) if (Number(division) <= reached && Number(division) > before && Number(division) !== 6) unlocks.push(...items);
  if (move.to === MASTER) unlocks.push(...DIVISION_UNLOCKS[6]);
  if (move.from === MASTER && move.to !== MASTER) revoke.push(...DIVISION_UNLOCKS[6]);
  return { unlocks, revoke };
}

// Données de clôture à envoyer à apply_season_close pour la saison `season` (fonction pure, testée).
export function planClosure({ season, players, standings, groups, groupMembers, weekendPoints }) {
  const standing = new Map(standings.map(row => [row.user_id, row])), label = new Map(groups.map(group => [group.id, group.label])), member = new Map(groupMembers.map(item => [item.user_id, item.group_id]));
  const input = players.map(player => {
    const row = standing.get(player.user_id);
    return { id: player.user_id, echelon: player.echelon, group: label.get(member.get(player.user_id)) ?? '', points: Number(row?.points ?? 0), roi: Number(row?.roi ?? 0), dailyGood: Number(row?.daily_good ?? 0), joinedAt: player.joined_at, active: Number(row?.picks ?? 0) > 0, qualified: row?.qualified ?? true, protected: Boolean(player.protected) };
  });
  const result = closeSeason(input, { barrage: weekendPoints });
  const points = new Map(input.map(player => [player.id, player.points]));
  const results = result.moves.map(move => ({ user_id: move.id, from_echelon: move.from, to_echelon: move.to, outcome: move.outcome, group_rank: move.groupRank ?? null, group_size: move.groupSize ?? null, points: points.get(move.id), protected: move.protectedNext, inactive: move.inactive, barrage: Boolean(move.barrage), ...unlockPlan(move) }));
  return { season, next: nextSeason(season), results, groups: result.groups };
}

export async function closeOneSeason(admin, season) {
  await recomputeStandings(admin, new Date(), season, lastDayOf(season));
  const [players, standings, groups, groupMembers] = await Promise.all([
    admin.selectAll('player_league', 'select=user_id,echelon,joined_at,protected'),
    admin.selectAll('standings', `season=eq.${season}&select=user_id,points,roi,daily_good,picks,qualified`),
    admin.selectAll('league_groups', `season=eq.${season}&select=id,label`),
    admin.selectAll('group_members', `season=eq.${season}&select=user_id,group_id`)
  ]);
  const [saturday, sunday] = lastWeekend(season), weekend = await admin.selectAll('daily_picks', `day=gte.${saturday}&day=lte.${sunday}&select=user_id,points`), weekendPoints = {};
  for (const pick of weekend) weekendPoints[pick.user_id] = (weekendPoints[pick.user_id] ?? 0) + Number(pick.points);
  const plan = planClosure({ season, players, standings, groups, groupMembers, weekendPoints });
  return admin.rpc('apply_season_close', { p_season: season, p_next: plan.next, p_results: plan.results, p_groups: plan.groups });
}

// Ferme toutes les saisons terminées (relançable : une saison déjà close est ignorée par le serveur).
export async function closeFinishedSeasons(admin, now = new Date()) {
  const current = seasonKey(now);
  await ensureSeason(admin, current);
  const open = await admin.select('league_seasons', 'status=eq.open&select=season&order=season.asc');
  let closed = 0;
  for (const { season } of open) if (season.length === 9 && season < current && await closeOneSeason(admin, season)) closed++;
  return closed;
}
