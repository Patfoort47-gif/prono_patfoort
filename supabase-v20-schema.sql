-- BET-78 : après V19, transaction réexécutable ; archives mensuelles conservées.
begin;
create or replace function public.football_season(p_date timestamptz default now())
returns text language sql stable set search_path = public as $$
  select y::text || '-' || (y + 1)::text from
    (select extract(year from p_date at time zone 'Europe/Paris')::int - case when extract(month from p_date at time zone 'Europe/Paris') < 7 then 1 else 0 end as y) t;
$$;
alter table public.league_seasons drop constraint if exists league_seasons_season_check;
alter table public.league_seasons add constraint league_seasons_season_check
  check (season ~ '^[0-9]{4}-[0-9]{2}$' or (season ~ '^[0-9]{4}-[0-9]{4}$' and split_part(season,'-',2)::int = split_part(season,'-',1)::int + 1));

-- Reprend le dernier groupe mensuel et les points de l’année sportive courante.
-- Les instantanés standings/season_results mensuels restent inchangés pour la consultation.
do $$
declare current_season text := public.football_season(); old_season text;
begin
  if not exists (select 1 from public.league_seasons where season = current_season) then
    select max(season) into old_season from public.league_seasons where status = 'open' and length(season) = 7;
    insert into public.league_seasons(season, started_at) values(current_season, (split_part(current_season,'-',1) || '-07-01')::timestamp at time zone 'Europe/Paris');
    insert into public.league_groups(season,echelon,label)
      select current_season,echelon,label from public.league_groups where season = old_season on conflict do nothing;
    insert into public.group_members(season,group_id,user_id)
      select current_season, ng.id, m.user_id from public.group_members m join public.league_groups g on g.id = m.group_id
        join public.league_groups ng on ng.season = current_season and ng.echelon = g.echelon and ng.label = g.label
      where m.season = old_season on conflict do nothing;
    update public.league_entries set season = current_season where league = 'general' and public.football_season(settled_at) = current_season;
    update public.league_seasons set status = 'closed', closed_at = now() where status = 'open' and length(season) = 7;
  end if;
end $$;
create or replace function public.settle_bet(p_bet_id uuid, p_status text, p_payout numeric, p_points numeric default 0)
returns boolean language plpgsql security definer set search_path = public as $$
declare b public.bets; paid numeric := round(coalesce(p_payout, 0), 2);
begin
  if p_status not in ('won','lost','void') or paid < 0 then raise exception 'REGLEMENT_INVALIDE'; end if;
  update public.bets set status = p_status, payout = case when p_status = 'lost' then 0 else paid end, settled_at = now()
  where id = p_bet_id and status = 'pending' returning * into b;
  if b.id is null then return false; end if;
  if p_status <> 'lost' then
    update public.player_accounts set bankroll = bankroll + paid, updated_at = now() where user_id = b.user_id;
  end if;
  if b.counts_general then
    insert into public.league_entries (bet_id, user_id, league, points, week_start, season, settled_at)
    values (b.id, b.user_id, 'general', round(coalesce(p_points, 0), 2), b.week_start, public.football_season(now()), now())
    on conflict (bet_id, league) do nothing;
  end if;
  update public.special_picks set status = p_status, points = case when p_status = 'void' then 0 else round(coalesce(p_points, 0), 2) end, settled_at = now()
  where bet_id = b.id and status = 'pending';
  return true;
end $$;
create or replace function public.settle_daily_pick(p_id bigint, p_status text, p_points numeric)
returns boolean language plpgsql security definer set search_path = public as $$
declare d public.daily_picks;
begin
  if p_status not in ('won','lost','void') then raise exception 'REGLEMENT_INVALIDE'; end if;
  update public.daily_picks set status = p_status, points = case when p_status = 'void' then 0 else round(coalesce(p_points, 0), 2) end, settled_at = now()
  where id = p_id and status = 'pending' returning * into d;
  if d.id is null then return false; end if;
  insert into public.league_entries (daily_pick_id, user_id, league, points, week_start, season, settled_at)
  values (d.id, d.user_id, 'general', d.points, date_trunc('week', d.placed_at at time zone 'Europe/Paris')::date,
          public.football_season(now()), now())
  on conflict do nothing;
  return true;
end $$;
create or replace function public.enrol_player_league()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.player_league (user_id, echelon, joined_season) values (new.user_id, null, public.football_season(now()))
  on conflict (user_id) do nothing;
  return new;
end $$;
create or replace function public.buy_shield(p_league text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_season text; balance int; sl public.special_leagues;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_league = 'general' then v_season := public.football_season(now());
  else
    select * into sl from public.special_leagues where id = p_league and open;
    if not found or not exists (select 1 from public.league_members where league_id = p_league and user_id = uid) then raise exception 'LIGUE_INCONNUE'; end if;
    v_season := to_char(sl.season_start, 'YYYY') || '-' || to_char(sl.season_end, 'YY');
  end if;
  balance := public.lock_tokens(uid);
  if exists (select 1 from public.streak_shields where user_id = uid and league = p_league and season = v_season) then raise exception 'BOUCLIER_DEJA'; end if;
  if balance < 800 then raise exception 'SOLDE_INSUFFISANT'; end if;
  insert into public.streak_shields (user_id, league, season) values (uid, p_league, v_season);
  insert into public.token_ledger (user_id, delta, reason, ref) values (uid, -800, 'shield', 'shield:' || p_league || ':' || v_season);
end $$;
create or replace function public.private_league_ranking(p_league uuid, p_season text default null)
returns table (user_id uuid, nickname text, avatar text, avatar_config jsonb, points numeric, picks bigint, wins bigint, roi numeric, rank bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_season text := coalesce(p_season, public.football_season(now()));
begin
  if not public.is_private_member(p_league) then raise exception 'MEMBRE_REQUIS'; end if;
  return query
  select r.user_id, r.nickname, r.avatar, r.avatar_config, r.points, r.picks, r.wins, r.roi, row_number() over (order by r.points desc, r.roi desc, r.wins desc, r.joined_at, r.user_id)
  from (
    select m.user_id, p.nickname, p.avatar, p.avatar_config, coalesce(sum(e.points), 0)::numeric as points, count(e.id) as picks, count(e.id) filter (where e.points > 0) as wins,
           case when count(e.id) > 0 then round(coalesce(sum(e.points), 0) / (count(e.id) * 10) * 100, 1) else 0 end as roi, m.joined_at
    from public.private_league_members m
    join public.profiles p on p.user_id = m.user_id
    left join public.league_entries e on e.user_id = m.user_id and e.league = 'general' and e.season = v_season
    where m.league_id = p_league
    group by m.user_id, p.nickname, p.avatar, p.avatar_config, m.joined_at
  ) r
  order by 9;
end $$;
create or replace function public.repair_league_history(p_user uuid default null, p_league text default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_b public.bets; lm record; reason text; repaired int := 0; changed int; pts numeric;
begin
  -- Sérialise les relances du pipeline ; les insertions gardent leurs clés uniques.
  perform pg_advisory_xact_lock(770019);
  if p_league is null then
    insert into public.league_entries (bet_id, user_id, league, points, week_start, season, settled_at)
    select b.id, b.user_id, 'general', case when b.status = 'won' then round(10 * (least(10, b.payout / nullif(b.stake, 0)) - 1), 2) when b.status = 'lost' then -10 else 0 end,
      b.week_start, public.football_season(b.settled_at), b.settled_at
    from public.bets b
    where b.counts_general and b.bet_type <> 'multiple' and b.status in ('won','lost','void')
      and (p_user is null or b.user_id = p_user)
      and not exists (select 1 from public.league_seasons s where s.season = public.football_season(b.settled_at) and s.status = 'closed')
    on conflict (bet_id, league) do nothing;
    get diagnostics changed = row_count; repaired := repaired + changed;
  end if;
  for lm in select m.user_id, m.league_id, l.season_start, l.season_end
    from public.league_members m join public.special_leagues l on l.id = m.league_id
    where l.open and l.kind = 'competition' and (p_user is null or m.user_id = p_user) and (p_league is null or m.league_id = p_league)
  loop
    -- Chronologie de placement : mêmes quotas et unicité par match que les nouveaux paris.
    for v_b in select * from public.bets b where b.user_id = lm.user_id and b.bet_type <> 'multiple'
      and (b.placed_at at time zone 'Europe/Paris')::date between lm.season_start and lm.season_end
      and exists (select 1 from public.special_rounds r where r.league_id = lm.league_id
        and (r.starts_at at time zone 'Europe/Paris')::date >= lm.season_start
        and (r.ends_at at time zone 'Europe/Paris')::date <= lm.season_end
        and r.match_ids @> (select jsonb_agg(s->>'matchId') from jsonb_array_elements(b.selections) s))
      and not exists (select 1 from public.special_picks sp where sp.bet_id = b.id and sp.league_id = lm.league_id)
      order by b.placed_at, b.id
    loop
      reason := public.special_try_pick(v_b.user_id, lm.league_id, v_b.selections, 'bet', v_b.id, v_b.odds);
      if reason is null then
        pts := case when v_b.status = 'won' then round(10 * (least(10, v_b.payout / nullif(v_b.stake, 0)) - 1), 2) when v_b.status = 'lost' then -10 else 0 end;
        update public.special_picks set status = v_b.status, points = pts, placed_at = v_b.placed_at, settled_at = v_b.settled_at
          where bet_id = v_b.id and league_id = lm.league_id;
        repaired := repaired + 1;
      end if;
    end loop;
  end loop;
  return repaired;
end $$;
create or replace view public.public_ranking_season as
select e.user_id, p.nickname, p.avatar, p.avatar_config, pl.echelon, p.heart_club_id,
       sum(e.points)::numeric(12,2) as points, count(*) as picks, count(*) filter (where e.points > 0) as wins,
       rank() over (order by sum(e.points) desc, count(*) filter (where e.points > 0) desc, e.user_id) as rank
from public.league_entries e join public.profiles p on p.user_id = e.user_id left join public.player_league pl on pl.user_id = e.user_id
where e.league = 'general' and e.season = public.football_season(now())
group by e.user_id, p.nickname, p.avatar, p.avatar_config, pl.echelon, p.heart_club_id;
create or replace view public.public_player_stats as
select b.user_id,
  public.stats_obj(count(*) filter (where b.settled_at >= now() - interval '1 day'), count(*) filter (where b.settled_at >= now() - interval '1 day' and b.status = 'won'),
    sum(b.stake) filter (where b.settled_at >= now() - interval '1 day'), sum(b.payout) filter (where b.settled_at >= now() - interval '1 day'),
    max(b.odds) filter (where b.settled_at >= now() - interval '1 day' and b.status = 'won')) as day,
  public.stats_obj(count(*) filter (where b.settled_at >= now() - interval '7 days'), count(*) filter (where b.settled_at >= now() - interval '7 days' and b.status = 'won'),
    sum(b.stake) filter (where b.settled_at >= now() - interval '7 days'), sum(b.payout) filter (where b.settled_at >= now() - interval '7 days'),
    max(b.odds) filter (where b.settled_at >= now() - interval '7 days' and b.status = 'won')) as week,
  public.stats_obj(count(*) filter (where b.settled_at >= now() - interval '30 days'), count(*) filter (where b.settled_at >= now() - interval '30 days' and b.status = 'won'),
    sum(b.stake) filter (where b.settled_at >= now() - interval '30 days'), sum(b.payout) filter (where b.settled_at >= now() - interval '30 days'),
    max(b.odds) filter (where b.settled_at >= now() - interval '30 days' and b.status = 'won')) as month,
  public.stats_obj(count(*) filter (where b.settled_at >= (split_part(public.football_season(), '-', 1) || '-07-01')::timestamp at time zone 'Europe/Paris'),
    count(*) filter (where b.settled_at >= (split_part(public.football_season(), '-', 1) || '-07-01')::timestamp at time zone 'Europe/Paris' and b.status = 'won'),
    sum(b.stake) filter (where b.settled_at >= (split_part(public.football_season(), '-', 1) || '-07-01')::timestamp at time zone 'Europe/Paris'),
    sum(b.payout) filter (where b.settled_at >= (split_part(public.football_season(), '-', 1) || '-07-01')::timestamp at time zone 'Europe/Paris'),
    max(b.odds) filter (where b.settled_at >= (split_part(public.football_season(), '-', 1) || '-07-01')::timestamp at time zone 'Europe/Paris' and b.status = 'won')) as season,
  public.stats_obj(count(*), count(*) filter (where b.status = 'won'), sum(b.stake), sum(b.payout), max(b.odds) filter (where b.status = 'won')) as "all"
from public.bets b
where b.status in ('won','lost')
group by b.user_id;
create or replace view public.daily_participation as
select m.user_id, m.season, m.played, m.good, coalesce(o.offered,0) as offered
from (select user_id, public.football_season(day::timestamp at time zone 'Europe/Paris') as season, count(*) as played, count(*) filter(where status = 'won') as good
      from public.daily_picks group by user_id, public.football_season(day::timestamp at time zone 'Europe/Paris')
      union all
      select user_id, to_char(day,'YYYY-MM'), count(*), count(*) filter(where status = 'won') from public.daily_picks group by user_id,to_char(day,'YYYY-MM')) m
left join (select public.football_season(day::timestamp at time zone 'Europe/Paris') as season, sum(jsonb_array_length(picks)) as offered from public.daily_challenges group by public.football_season(day::timestamp at time zone 'Europe/Paris')
      union all select to_char(day,'YYYY-MM'), sum(jsonb_array_length(picks)) from public.daily_challenges group by to_char(day,'YYYY-MM')) o on o.season = m.season;
commit;
