// Ligue générale (BET-55) : fonctions pures sans DOM ni réseau, utilisées par scripts/close-season.mjs, le calcul des classements et le site.
import { tieBreak } from './model.js';

export const DIVISIONS = ['District', 'Régional', 'National', 'Pro', 'Élite'];
// 17 échelons, du plus bas au plus haut : District III, II, I ... Élite III, II, I, Champions, Master.
export const ECHELONS = [...DIVISIONS.flatMap(division => ['III', 'II', 'I'].map(level => `${division} ${level}`)), 'Champions', 'Master'];
export const CHAMPIONS = 15, MASTER = 16, ELITE_I = 14, NATIONAL_I = 8, NATIONAL_III = 6;
export const SHARES = { 4: .06, 3: .12, 2: .18, 1: .24 }; // part des joueurs actifs par division (District : le reste)
export const CHAMPIONS_FROM = 300, MASTER_FROM = 500, TOP_SIZE = 20, MIN_GROUP = 10, MAX_GROUP = 20, PLACEMENT_BELOW = 100, MIN_ECHELON = 10;

export const echelonName = index => ECHELONS[index] ?? 'Placement';
export const divisionOf = index => index === MASTER ? 'Master' : index === CHAMPIONS ? 'Champions' : DIVISIONS[Math.floor(index / 3)];
export const divisionIndex = index => index >= CHAMPIONS ? index - 10 : Math.floor(index / 3);
// Chevrons d'échelon : III ▴, II ▴▴, I ▴▴▴ (aucun pour Champions et Master).
export const chevrons = index => index >= CHAMPIONS ? '' : ['▴', '▴▴', '▴▴▴'][index % 3];
export const maxEchelon = active => active >= MASTER_FROM ? MASTER : active >= CHAMPIONS_FROM ? CHAMPIONS : ELITE_I;

// Effectifs cibles par échelon pour `active` joueurs actifs ; un échelon de moins de 10 joueurs est fusionné avec son voisin du dessous.
export function targetSizes(active) {
  const sizes = Array(17).fill(0), top = maxEchelon(active);
  let left = active;
  for (const index of [MASTER, CHAMPIONS]) if (top >= index) { sizes[index] = Math.min(TOP_SIZE, left); left -= sizes[index]; }
  const spread = (division, count) => { const base = Math.floor(count / 3), extra = count - base * 3; for (let level = 0; level < 3; level++) sizes[division * 3 + level] = base + (extra > level ? 1 : 0); };
  const total = left;
  for (const division of [4, 3, 2, 1]) { const count = Math.min(left, Math.round(total * SHARES[division])); spread(division, count); left -= count; }
  spread(0, left);
  return mergeSmall(sizes);
}
function mergeSmall(sizes) {
  const result = [...sizes];
  for (let index = ELITE_I; index >= 0; index--) if (result[index] > 0 && result[index] < MIN_ECHELON) { const target = index > 0 ? index - 1 : 1; result[target] += result[index]; result[index] = 0; }
  return result;
}
// Place des joueurs classés (du meilleur au moins bon) selon les effectifs cibles. `cap` limite l'échelon atteignable.
export function allocate(ranked, active = ranked.length, cap = MASTER) {
  const sizes = targetSizes(active), assignment = new Map();
  let cursor = 0;
  for (let index = MASTER; index >= 0 && cursor < ranked.length; index--) for (let slot = 0; slot < sizes[index] && cursor < ranked.length; slot++) assignment.set(ranked[cursor++], Math.min(index, cap));
  for (; cursor < ranked.length; cursor++) assignment.set(ranked[cursor], 0);
  return assignment;
}
// Saison de placement d'un nouveau joueur : selon son rang dans la cohorte, jusqu'en National III au plus haut.
export function placementEchelon(rank, size) {
  const percentile = size > 1 ? (rank - 1) / size : 0;
  return percentile < .10 ? NATIONAL_III : percentile < .25 ? 5 : percentile < .45 ? 4 : percentile < .65 ? 3 : percentile < .85 ? 2 : 1;
}
// Groupes de 10 à 20 joueurs, recomposés en serpentin selon le classement (meilleurs d'abord) pour rester équilibrés.
export function makeGroups(ranked) {
  const count = ranked.length;
  if (!count) return [];
  let groups = Math.max(1, Math.ceil(count / MAX_GROUP));
  while (groups > 1 && count / groups < MIN_GROUP) groups--;
  const result = Array.from({ length: groups }, (_, index) => ({ label: String.fromCharCode(65 + index % 26) + (index >= 26 ? Math.floor(index / 26) : ''), members: [] }));
  ranked.forEach((id, position) => { const lap = Math.floor(position / groups), offset = position % groups; result[lap % 2 ? groups - 1 - offset : offset].members.push(id); });
  return result;
}

const byRank = (a, b) => (b.qualified - a.qualified) || tieBreak(a, b);
// Rangs dans les groupes : 1 = premier du groupe.
function withGroupRanks(players) {
  const groups = new Map();
  for (const player of players) { const key = `${player.echelon}|${player.group ?? ''}`; groups.set(key, [...(groups.get(key) ?? []), player]); }
  const ranks = new Map();
  for (const members of groups.values()) members.sort(byRank).forEach((player, index) => ranks.set(player.id, { groupRank: index + 1, groupSize: members.length }));
  return ranks;
}
// Sélection d'un nombre de places : les premiers de chaque groupe d'abord, puis les meilleurs deuxièmes, troisièmes... tous groupes confondus.
function pickPlaces(players, ranks, places, fromBottom = false) {
  const rows = players.map(player => ({ player, depth: fromBottom ? ranks.get(player.id).groupSize - ranks.get(player.id).groupRank : ranks.get(player.id).groupRank - 1 }));
  rows.sort((a, b) => a.depth - b.depth || (fromBottom ? byRank(b.player, a.player) : byRank(a.player, b.player)));
  const groupCount = new Set(players.map(player => player.group ?? '')).size;
  return rows.slice(0, Math.max(groupCount, places)).map(row => row.player);
}

// Clôture d'une saison. players : [{id, echelon (null = placement), group, points, roi, dailyGood, joinedAt, active, qualified, protected}].
// barrage : {id: points des défis du dernier week-end}. Renvoie {moves, groups} ; moves : {id, from, to, outcome, groupRank, groupSize, protectedNext, inactive}.
// Idempotent : même entrée, même sortie.
export function closeSeason(players, { barrage = {} } = {}) {
  const activePlayers = players.filter(player => player.active), top = maxEchelon(activePlayers.length), moves = new Map();
  const move = (player, to, outcome, extra = {}) => moves.set(player.id, { id: player.id, from: player.echelon, to, outcome, protectedNext: false, inactive: false, ...extra });
  const placed = activePlayers.filter(player => player.echelon != null), fresh = activePlayers.filter(player => player.echelon == null);
  const ranks = withGroupRanks(placed);
  const rank = player => ranks.get(player.id) ?? { groupRank: 0, groupSize: 0 };

  // Joueurs inactifs : un échelon de moins, hors des groupes jusqu'au retour.
  for (const player of players.filter(item => !item.active && item.echelon != null)) move(player, Math.max(0, player.echelon - 1), 'INACTIF', { inactive: true });
  for (const player of players.filter(item => !item.active && item.echelon == null)) move(player, 0, 'INACTIF', { inactive: true });

  // Premier classement : tous les joueurs actifs sans échelon sont placés ensemble ; sinon placement par cohorte.
  if (!placed.length && fresh.length) {
    const ordered = fresh.slice().sort(byRank), assignment = allocate(ordered.map(player => player.id), ordered.length);
    for (const [index, player] of ordered.entries()) move(player, assignment.get(player.id), 'PLACE', { groupRank: index + 1, groupSize: ordered.length });
  } else {
    const ordered = fresh.slice().sort(byRank);
    ordered.forEach((player, index) => move(player, placementEchelon(index + 1, ordered.length), 'PLACE', { groupRank: index + 1, groupSize: ordered.length }));
  }

  const inEchelon = new Map();
  for (const player of placed) inEchelon.set(player.echelon, [...(inEchelon.get(player.echelon) ?? []), player]);
  const up = new Map(), down = new Map(), barrageUp = new Map(), barrageDown = new Map();
  for (const [echelon, list] of inEchelon) {
    const size = list.length, divisionTop = echelon === CHAMPIONS || echelon === MASTER || echelon % 3 === 2, divisionBottom = echelon === CHAMPIONS || echelon === MASTER || echelon % 3 === 0;
    const places = Math.round(size * .2);
    // Montées : à l'intérieur d'une division par places de groupe, vers la division du dessus : 3 premiers + barrage.
    if (echelon < MASTER && echelon + 1 <= top) {
      const eligible = list.filter(player => player.qualified);
      if (divisionTop) { const ordered = eligible.slice().sort(byRank); ordered.slice(0, 3).forEach(player => up.set(player.id, 'division')); if (ordered[3]) barrageUp.set(ordered[3].id, echelon); }
      else pickPlaces(eligible, ranks, places).forEach(player => up.set(player.id, 'echelon'));
    }
    // Descentes : mêmes règles, jamais sous District III, jamais pour un joueur en saison de découverte.
    if (echelon > 0) {
      const exposed = list.filter(player => !player.protected);
      if (divisionBottom) { const ordered = exposed.slice().sort(byRank).reverse(); ordered.slice(0, 3).forEach(player => down.set(player.id, 'division')); if (ordered[3]) barrageDown.set(ordered[3].id, echelon); }
      else pickPlaces(exposed, ranks, places, true).forEach(player => down.set(player.id, 'echelon'));
    }
  }
  // Barrages : le 4e de l'échelon haut de la division inférieure contre le 4e en partant du bas de la division supérieure.
  const score = id => Number(barrage[id] ?? 0), byId = new Map(placed.map(player => [player.id, player]));
  const resolved = new Set();
  for (const [upId, lowEchelon] of barrageUp) {
    const downId = [...barrageDown].find(([, high]) => high === lowEchelon + 1)?.[0];
    if (downId == null) { if (!down.has(upId)) up.set(upId, 'barrage'); resolved.add(upId); continue; }
    const challenger = byId.get(upId), holder = byId.get(downId);
    const winner = score(upId) !== score(downId) ? (score(upId) > score(downId) ? challenger : holder) : [challenger, holder].sort(byRank)[0];
    if (winner === challenger) { up.set(upId, 'barrage'); down.set(downId, 'barrage'); } else { up.delete(upId); down.delete(downId); }
    resolved.add(upId); resolved.add(downId);
  }
  for (const [downId] of barrageDown) if (!resolved.has(downId)) resolved.add(downId);

  for (const player of placed) {
    const { groupRank, groupSize } = rank(player), extra = { groupRank, groupSize };
    let to = player.echelon, outcome = 'MAINTENU';
    if (up.has(player.id) && !down.has(player.id)) {
      to = Math.min(player.echelon + 1, top); outcome = 'PROMU';
      // Montée directe : jusqu'en National, le champion d'un groupe saute un échelon.
      if (up.get(player.id) === 'echelon' && groupRank === 1 && player.echelon < NATIONAL_I) to = Math.min(player.echelon + 2, NATIONAL_I);
    } else if (down.has(player.id) && !up.has(player.id)) { to = Math.max(player.echelon - 1, 0); outcome = 'RELEGUE'; }
    if (to > top) to = top;
    if (to < player.echelon && player.echelon > top) outcome = 'RELEGUE';
    move(player, to, outcome, { ...extra, barrage: up.get(player.id) === 'barrage' && outcome === 'PROMU', protectedNext: divisionIndex(to) > divisionIndex(player.echelon) });
  }

  // Fusion des échelons trop petits (hors Champions et Master), puis nouveaux groupes en serpentin.
  const finalEchelon = new Map([...moves.values()].filter(item => !item.inactive).map(item => [item.id, item.to]));
  for (let echelon = ELITE_I; echelon >= 0; echelon--) {
    const members = [...finalEchelon].filter(([, value]) => value === echelon).map(([id]) => id);
    if (members.length && members.length < MIN_ECHELON) { const target = echelon > 0 ? echelon - 1 : 1; for (const id of members) finalEchelon.set(id, target); }
  }
  // Une fusion peut annuler une montée ou une descente : le résultat suit l'échelon final.
  for (const [id, to] of finalEchelon) { const item = moves.get(id), settled = item.from == null || item.outcome === 'PLACE'; Object.assign(item, { to, barrage: Boolean(item.barrage) && to > item.from, outcome: settled ? item.outcome : to > item.from ? 'PROMU' : to < item.from ? 'RELEGUE' : 'MAINTENU', protectedNext: !settled && divisionIndex(to) > divisionIndex(item.from) }); }
  const data = new Map(players.map(player => [player.id, player])), groups = [];
  for (let echelon = 0; echelon <= MASTER; echelon++) {
    const members = [...finalEchelon].filter(([, value]) => value === echelon).map(([id]) => data.get(id)).sort(byRank).map(player => player.id);
    for (const group of makeGroups(members)) groups.push({ echelon, label: group.label, members: group.members });
  }
  return { moves: [...moves.values()], groups };
}

// Écran de fin de saison : emblème avant et après, libellé affiché une seule fois.
export function outcomeLabel(move) { return move.outcome === 'PROMU' ? 'PROMU' : move.outcome === 'RELEGUE' ? 'RELÉGUÉ' : move.outcome === 'PLACE' ? 'PLACÉ' : move.outcome === 'INACTIF' ? 'INACTIF' : 'MAINTENU'; }
// Éléments d'avatar débloqués par une division atteinte (restent acquis après une descente, la couronne du Master est exclusive).
export const DIVISION_UNLOCKS = { 2: ['socle argent'], 3: ['maillot or'], 4: ['cheveux vert citron'], 6: ['couronne'] };
export const unlocksFor = division => DIVISION_UNLOCKS[division] ?? [];

// BET-78 : saison de football de la ligue générale, du 1er juillet au 30 juin (Paris).
// Les anciennes clés mensuelles restent lisibles pour les archives.
const parisDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
export const monthKey = date => parisDay.format(new Date(date)).slice(0, 7);
export const seasonKey = date => { const [year, month] = monthKey(date).split('-').map(Number), start = month >= 7 ? year : year - 1; return `${start}-${start + 1}`; };
export const nextSeason = season => { const [year, end] = season.split('-').map(Number); return end > 100 ? `${year + 1}-${end + 1}` : end === 12 ? `${year + 1}-01` : `${year}-${String(end + 1).padStart(2, '0')}`; };
export const previousSeason = season => { const [year, end] = season.split('-').map(Number); return end > 100 ? `${year - 1}-${end - 1}` : end === 1 ? `${year - 1}-12` : `${year}-${String(end - 1).padStart(2, '0')}`; };
export const seasonDates = season => { const [year, end] = season.split('-').map(Number); return end > 100 ? { start: `${year}-07-01`, end: `${end}-06-30` } : { start: `${season}-01`, end: new Date(Date.UTC(year, end, 0)).toISOString().slice(0, 10) }; };
export const seasonLabel = season => season?.length === 9 ? `Saison ${season.replace('-', ' / ')}` : new Date(`${season}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export function lastWeekend(season) {
  const last = new Date(`${seasonDates(season).end}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() - last.getUTCDay());
  const sunday = new Date(last), saturday = new Date(last);
  saturday.setUTCDate(saturday.getUTCDate() - 1);
  return [saturday.toISOString().slice(0, 10), sunday.toISOString().slice(0, 10)];
}

// Classement d'une saison. members : [{user_id, group_id, joined_at}] ; entries : [{user_id, points, settled_at}] ;
// participation : {user_id: {played, good, offered}} ; previous : {user_id: {rank, snapshot_date}} ; today : AAAA-MM-JJ.
// Un joueur est qualifié s'il a joué au moins 50 % des défis proposés dans le mois. Rang dans son groupe (ou dans la cohorte de placement).
export function computeStandings({ season, members, entries, participation = {}, previous = {}, today }) {
  const byUser = new Map();
  for (const entry of entries) byUser.set(entry.user_id, [...(byUser.get(entry.user_id) ?? []), entry]);
  const rows = members.map(member => {
    const own = (byUser.get(member.user_id) ?? []).slice().sort((a, b) => String(b.settled_at).localeCompare(String(a.settled_at))), played = participation[member.user_id] ?? { played: 0, good: 0, offered: 0 };
    const points = own.reduce((sum, entry) => sum + Number(entry.points), 0), wins = own.filter(entry => Number(entry.points) > 0).length;
    return { season, user_id: member.user_id, group_id: member.group_id ?? null, points: Math.round(points * 100) / 100, picks: own.length, wins, roi: own.length ? Math.round(points / (own.length * 10) * 1000) / 10 : 0,
      form: own.slice(0, 5).map(entry => Number(entry.points) > 0 ? 'V' : Number(entry.points) < 0 ? 'D' : 'N').join(''), daily_good: Number(played.good) || 0,
      qualified: !Number(played.offered) || Number(played.played) >= Number(played.offered) * .5, joinedAt: member.joined_at };
  });
  const cohorts = new Map();
  for (const row of rows) cohorts.set(row.group_id, [...(cohorts.get(row.group_id) ?? []), row]);
  for (const cohort of cohorts.values()) cohort.sort((a, b) => tieBreak({ points: a.points, roi: a.roi, dailyGood: a.daily_good, joinedAt: a.joinedAt }, { points: b.points, roi: b.roi, dailyGood: b.daily_good, joinedAt: b.joinedAt })).forEach((row, index) => { row.rank = index + 1; });
  return rows.map(({ joinedAt, ...row }) => {
    const before = previous[row.user_id], newDay = !before || before.snapshot_date !== today;
    return { ...row, prev_rank: before ? (newDay ? before.rank : before.prev_rank ?? before.rank) : null, snapshot_date: newDay ? today : before.snapshot_date, updated_at: new Date().toISOString() };
  });
}
