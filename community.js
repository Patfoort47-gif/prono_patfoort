// Communauté (BET-60, BET-61) : règles pures partagées par le site et les tests, sans DOM ni réseau.
// Ligues privées : code BM-XXXX (alphabet sans I, O, 0 ni 1), sans limite de ligues par joueur, 50 membres au plus.
export const PRIVATE_LIMITS = { leaguesPerPlayer: Infinity, members: 50, nameMin: 3, nameMax: 30 };
export const PRIVATE_EMBLEMS = [['ball', '⚽'], ['trophy', '🏆'], ['star', '⭐'], ['bolt', '⚡'], ['shield', '🛡️'], ['flame', '🔥'], ['crown', '👑'], ['target', '🎯'], ['rocket', '🚀'], ['lion', '🦁'], ['eagle', '🦅'], ['wolf', '🐺']];
export const emblemOf = key => PRIVATE_EMBLEMS.find(([name]) => name === key)?.[1] ?? '⚽';
// Accepte « bm-ab2c », « BMAB2C » ou « BM-AB2C » : renvoie le code normalisé ou null.
export function normalizeCode(value) {
  const raw = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''), match = /^BM([A-HJ-NP-Z2-9]{4})$/.exec(raw);
  return match ? `BM-${match[1]}` : null;
}
export const privateLink = (code, base) => `${base}#ligue-privee-${code}`;
export function parsePrivateHash(hash) {
  const match = /^#ligue-privee-(.+)$/.exec(String(hash ?? ''));
  return match ? normalizeCode(decodeURIComponent(match[1])) : null;
}
export const validLeagueName = value => { const name = String(value ?? '').trim(); return name.length >= PRIVATE_LIMITS.nameMin && name.length <= PRIVATE_LIMITS.nameMax; };
// Avant d'envoyer : une ligue de plus est-elle possible, la ligue est-elle pleine ?
export const canCreateOrJoin = leaguesJoined => leaguesJoined < PRIVATE_LIMITS.leaguesPerPlayer;
export const isFull = members => members >= PRIVATE_LIMITS.members;
// Nouveau propriétaire quand le propriétaire quitte : le plus ancien membre restant (égalité : identifiant le plus petit). null = ligue supprimée.
export function nextOwner(members, leaving) {
  return members.filter(member => member.user_id !== leaving).sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at) || String(a.user_id).localeCompare(String(b.user_id)))[0]?.user_id ?? null;
}

// Fil d'activité (BET-60) : phrases en français, jamais de bankroll ni de mise. kind : combo-win, promotion, title, badge, level, private-join, overtake.
import { echelonName, divisionIndex } from './league.js';
import { BADGES } from './rewards.js';
import { levelFromXp } from './model.js';
export function activityText(kind, payload = {}, nickname = 'Un joueur') {
  const who = String(nickname);
  if (kind === 'combo-win') return `${who} a gagné un combiné de ${payload.legs} matchs à la cote ${Number(payload.odds).toFixed(2)}`;
  if (kind === 'promotion') return `${who} est promu en ${echelonName(payload.to)}`;
  if (kind === 'title') return `${who} est champion de ${payload.league}`;
  if (kind === 'badge') return `${who} a obtenu le trophée « ${BADGES.find(item => item.id === payload.badge)?.name ?? 'surprise'} »`;
  if (kind === 'level') return `${who} passe niveau ${payload.level}`;
  if (kind === 'private-join') return `${who} a rejoint une ligue privée`;
  if (kind === 'overtake') return `${who} grimpe à la ${payload.rank}${payload.rank === 1 ? 're' : 'e'} place de son groupe`;
  return `${who} a une nouvelle activité`;
}
// Événements du fil à enregistrer (clé unique par joueur : rejouer le calcul ne crée aucun doublon). Les événements datés plus anciens que `days` jours sont ignorés.
export function planActivities({ now = new Date(), days = 7, bets = [], seasonResults = [], titles = [], badges = [], xpMap = {}, privateJoins = [], standings = [], today = now.toISOString().slice(0, 10) }) {
  const rows = [], since = now.getTime() - days * 864e5, recent = date => !date || new Date(date).getTime() >= since, add = (actor_id, event_key, kind, payload, created_at = now.toISOString()) => rows.push({ actor_id, event_key, kind, payload, created_at });
  for (const bet of bets) if (bet.status === 'won' && bet.bet_type === 'combined' && Number(bet.odds) >= 5 && recent(bet.settled_at)) add(bet.user_id, `combo:${bet.id}`, 'combo-win', { odds: Number(bet.odds), legs: bet.legs ?? 2 }, bet.settled_at);
  for (const result of seasonResults) if (result.outcome === 'PROMU' && recent(result.created_at)) add(result.user_id, `promo:${result.season}`, 'promotion', { to: result.to_echelon, season: result.season }, result.created_at);
  for (const title of titles) if (title.kind === 'champion' && recent(title.awarded_at)) add(title.user_id, `title:${title.league_id}:${title.season}`, 'title', { league: title.league_name ?? title.league_id }, title.awarded_at);
  for (const badge of badges) if (recent(badge.earned_at)) add(badge.user_id, `badge:${badge.badge}`, 'badge', { badge: badge.badge }, badge.earned_at);
  for (const [user, xp] of Object.entries(xpMap)) { const milestone = Math.floor(levelFromXp(xp).level / 50) * 50; if (milestone >= 50) add(user, `level:${milestone}`, 'level', { level: milestone }); }
  for (const join of privateJoins) if (recent(join.joined_at)) add(join.user_id, `private:${join.league_id}`, 'private-join', {}, join.joined_at);
  for (const row of standings) if (row.prev_rank != null && row.prev_rank > row.rank && Number(row.picks) > 0) add(row.user_id, `overtake:${row.season}:${today}`, 'overtake', { rank: row.rank, from: row.prev_rank });
  return rows;
}
// Joueurs à suivre : profils publics qui ne sont ni vous ni déjà suivis, classés par échelon (+2), division (+1) et club de cœur (+2) communs.
export function suggestPlayers(profiles, me, followed = new Set(), limit = 8) {
  const scored = profiles.filter(profile => profile.is_public !== false && profile.user_id !== me.user_id && !followed.has(profile.user_id)).map(profile => {
    let score = 0;
    if (me.echelon != null && profile.echelon != null) { if (profile.echelon === me.echelon) score += 2; else if (divisionIndex(profile.echelon) === divisionIndex(me.echelon)) score += 1; }
    if (me.heart_club_id && profile.heart_club_id === me.heart_club_id) score += 2;
    return { profile, score };
  }).filter(item => item.score > 0);
  return scored.sort((a, b) => b.score - a.score || a.profile.nickname.localeCompare(b.profile.nickname, 'fr')).slice(0, limit).map(item => item.profile);
}
