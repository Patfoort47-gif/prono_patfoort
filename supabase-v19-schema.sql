-- BET-77 : après V18. Réparation idempotente des paris certifiés éligibles ; jamais d’import des paris du navigateur.
begin;
create or replace function public.repair_league_history(p_user uuid default null, p_league text default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_b public.bets; lm record; reason text; repaired int := 0; changed int; pts numeric;
begin
  -- Sérialise les relances du pipeline ; les insertions gardent leurs clés uniques.
  perform pg_advisory_xact_lock(770019);
  if p_league is null then
    insert into public.league_entries (bet_id, user_id, league, points, week_start, season, settled_at)
    select b.id, b.user_id, 'general', case when b.status = 'won' then round(10 * (least(10, b.payout / nullif(b.stake, 0)) - 1), 2) when b.status = 'lost' then -10 else 0 end,
      b.week_start, to_char(b.settled_at at time zone 'Europe/Paris', 'YYYY-MM'), b.settled_at
    from public.bets b
    where b.counts_general and b.bet_type <> 'multiple' and b.status in ('won','lost','void')
      and (p_user is null or b.user_id = p_user)
      and not exists (select 1 from public.league_seasons s where s.season = to_char(b.settled_at at time zone 'Europe/Paris', 'YYYY-MM') and s.status = 'closed')
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
revoke all on function public.repair_league_history(uuid, text) from public, anon, authenticated;
grant execute on function public.repair_league_history(uuid, text) to service_role;
commit;
