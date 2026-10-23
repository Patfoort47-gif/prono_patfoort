// Ligues spéciales (BET-56) : compétitions et clubs. Fonctions pures, sans DOM ni réseau.
// Mêmes règles que la fonction SQL special_try_pick (supabase-v9-schema.sql) : le serveur décide, ces fonctions servent à planifier les journées,
// à prévenir le joueur sur le ticket (« Ce pari compte pour ») et aux tests.
import { tieBreak, weekKey } from './model.js';

export const MAX_SPECIAL_LEAGUES = Infinity, CHAMPION_SHARE = .6, ONE_X_TWO = ['home', 'draw', 'away'];
const text = value => String(value ?? '');

// Un match appartient à une ligue compétition par son libellé de compétition, à une ligue club par l'identifiant ESPN d'une des deux équipes.
export function belongsToLeague(league, match) {
  if (league.kind === 'club') return [match.homeId ?? match.home_id, match.awayId ?? match.away_id].some(id => id != null && text(id) === text(league.team_id));
  return match.league === league.league_label;
}

// Journées d'une ligue : une journée de compétition regroupe les matchs de la même semaine (heure de Paris), une journée de club est un match.
// Le match phare est l'affiche (priorité la plus haute, puis coup d'envoi le plus tôt). 3 pronos libres, 2 en élimination directe, 1 en ligue club.
export function planRounds(league, matches) {
  const mine = matches.filter(match => belongsToLeague(league, match) && !match.voided && (match.kickoff ?? match.date)).sort((a, b) => text(a.kickoff).localeCompare(text(b.kickoff)) || text(a.id).localeCompare(text(b.id)));
  const groups = new Map();
  for (const match of mine) { const key = league.kind === 'club' ? match.id : weekKey(match.kickoff); groups.set(key, [...(groups.get(key) ?? []), match]); }
  return [...groups.entries()].map(([key, list]) => {
    const anchor = list.slice().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || text(a.kickoff).localeCompare(text(b.kickoff)) || text(a.id).localeCompare(text(b.id)))[0], knockout = list.every(match => match.knockout === true);
    return { id: `${league.id}|${key}`, league_id: league.id, label: league.kind === 'club' ? `${anchor.home} - ${anchor.away}` : `Journée du ${new Date(list[0].kickoff).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' })}`,
      starts_at: list[0].kickoff, ends_at: list.at(-1).kickoff, match_ids: list.map(match => match.id), anchor: anchor.id, knockout, free_slots: league.kind === 'club' ? 1 : knockout ? 2 : 3 };
  });
}

// Un ticket compte-t-il dans cette ligue ? selections : [{matchId, key}] ; picks : pronos déjà comptés du joueur dans la ligue [{round_id, match_ids, kind}].
// Renvoie {counts, kind: 'anchor'|'free', roundId, reason} ; reason : HORS_LIGUE, MATCH_DEJA_COMPTE, QUOTA_JOURNEE, CLUB_SIMPLE_SEULEMENT.
export function ticketFit(league, rounds, picks, selections) {
  const ids = selections.map(item => item.matchId), round = rounds.find(item => item.match_ids.includes(ids[0]));
  if (!round || ids.some(id => !round.match_ids.includes(id))) return { counts: false, reason: 'HORS_LIGUE' };
  // Un seul prono par match et par ligue, sauf en ligue club où le match du club reçoit un 1N2 et un autre marché.
  if (league.kind !== 'club' && picks.some(pick => (pick.match_ids ?? []).some(id => ids.includes(id)))) return { counts: false, reason: 'MATCH_DEJA_COMPTE' };
  const inRound = picks.filter(pick => pick.round_id === round.id), anchorTaken = inRound.some(pick => pick.kind === 'anchor'), freeUsed = inRound.filter(pick => pick.kind === 'free').length, single = selections.length === 1, key = selections[0].key;
  if (single && ids[0] === round.anchor && ONE_X_TWO.includes(key) && !anchorTaken) return { counts: true, kind: 'anchor', roundId: round.id };
  if (league.kind === 'club') {
    if (!single) return { counts: false, reason: 'CLUB_SIMPLE_SEULEMENT' };
    if (ONE_X_TWO.includes(key)) return { counts: false, reason: 'QUOTA_JOURNEE' };
  }
  return freeUsed < round.free_slots ? { counts: true, kind: 'free', roundId: round.id } : { counts: false, reason: 'QUOTA_JOURNEE' };
}

// Titre de champion : au moins 60 % des journées jouées depuis l'arrivée dans la ligue.
export function championEligible(playedRounds, roundsSinceJoining) { return roundsSinceJoining > 0 && playedRounds >= roundsSinceJoining * CHAMPION_SHARE; }
// Palier de fin de saison selon le rang parmi les joueurs classés.
export function tier(rank, size) { return size > 0 && rank <= Math.max(1, Math.ceil(size * .01)) ? 'top1' : size > 0 && rank <= Math.max(1, Math.ceil(size * .1)) ? 'top10' : null; }

// Classement d'une ligue : points des pronos réglés. picks : [{user_id, points, status, settled_at}] ; members : [{user_id, joined_at}] ; scope : 'season' ou 'AAAA-MM' (mois de Paris du règlement).
export function specialStandings(picks, members, scope = 'season', monthOf = date => String(date).slice(0, 7)) {
  const byUser = new Map();
  for (const pick of picks) if (pick.status !== 'pending' && (scope === 'season' || monthOf(pick.settled_at) === scope)) byUser.set(pick.user_id, [...(byUser.get(pick.user_id) ?? []), pick]);
  const rows = members.map(member => { const own = byUser.get(member.user_id) ?? [], points = Math.round(own.reduce((sum, pick) => sum + Number(pick.points), 0) * 100) / 100; return { user_id: member.user_id, points, picks: own.length, wins: own.filter(pick => Number(pick.points) > 0).length, roi: own.length ? Math.round(points / (own.length * 10) * 1000) / 10 : 0, joinedAt: member.joined_at }; });
  rows.sort((a, b) => tieBreak(a, b));
  return rows.map(({ joinedAt, ...row }, index) => ({ ...row, rank: index + 1 }));
}
