// Fil d'activité (BET-60) : alimenté uniquement par le serveur, jamais de bankroll ni de mise. Calculs purs dans community.js (planActivities).
import { planActivities } from '../community.js';
import { seasonKey } from '../league.js';
import { parisDate } from '../model.js';

export async function emitActivities(admin, now = new Date()) {
  const since = new Date(now.getTime() - 8 * 864e5).toISOString(), season = seasonKey(now);
  const [bets, seasonResults, titles, leagues, badges, xp, joins, standings] = await Promise.all([
    admin.selectAll('bets', `status=eq.won&bet_type=eq.combined&odds=gte.5&settled_at=gte.${since}&select=id,user_id,bet_type,odds,status,settled_at,selections`),
    admin.selectAll('season_results', `outcome=eq.PROMU&created_at=gte.${since}&select=season,user_id,outcome,to_echelon,created_at`),
    admin.selectAll('special_titles', `kind=eq.champion&awarded_at=gte.${since}&select=league_id,season,user_id,kind,awarded_at`),
    admin.selectAll('special_leagues', 'select=id,name'),
    admin.selectAll('user_badges', `earned_at=gte.${since}&select=user_id,badge,earned_at`),
    admin.selectAll('public_xp', 'select=user_id,xp'),
    admin.selectAll('private_league_members', `joined_at=gte.${since}&select=user_id,league_id,joined_at`),
    admin.selectAll('standings', `season=eq.${season}&select=season,user_id,rank,prev_rank,picks`)
  ]);
  const names = new Map(leagues.map(league => [league.id, league.name]));
  const rows = planActivities({ now, today: parisDate(now),
    bets: bets.map(bet => ({ ...bet, legs: bet.selections?.length ?? 2 })), seasonResults, titles: titles.map(title => ({ ...title, league_name: names.get(title.league_id) })), badges,
    xpMap: Object.fromEntries(xp.map(item => [item.user_id, item.xp])), privateJoins: joins, standings });
  await admin.insertIgnore('activities', rows, 'actor_id,event_key');
  return rows.length;
}
