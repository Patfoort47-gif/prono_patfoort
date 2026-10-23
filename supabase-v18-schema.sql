-- BET-79 : après V17, réexécutable. Ferme les ligues de clubs sans effacer leur historique.
begin;
update public.special_leagues set open = false where kind = 'club';
create or replace function public.join_special_league(p_league text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); lg public.special_leagues; balance int;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into lg from public.special_leagues where id = p_league and open and kind = 'competition';
  if not found then raise exception 'LIGUE_FERMEE'; end if;
  perform public.ensure_player_account();
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 79));
  if exists (select 1 from public.league_members where league_id = p_league and user_id = uid) then return jsonb_build_object('joined', true); end if;
  if lg.access = 'premium' and lg.token_price > 0 and not exists (select 1 from public.token_ledger where user_id = uid and reason = 'league-entry' and ref = 'league:' || lg.id) then
    balance := public.lock_tokens(uid);
    if balance < lg.token_price then raise exception 'SOLDE_INSUFFISANT'; end if;
    insert into public.token_ledger (user_id, delta, reason, ref) values (uid, -lg.token_price, 'league-entry', 'league:' || lg.id);
  end if;
  insert into public.league_members (league_id, user_id) values (p_league, uid);
  return jsonb_build_object('joined', true);
end $$;
create or replace function public.create_private_league(p_name text, p_emblem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); league public.private_leagues;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 3 and 30 then raise exception 'NOM_INVALIDE'; end if;
  perform public.ensure_player_account();
  insert into public.private_leagues (name, emblem, owner_id, code) values (btrim(p_name), coalesce(p_emblem, 'ball'), uid, public.private_league_code()) returning * into league;
  insert into public.private_league_members (league_id, user_id) values (league.id, uid);
  return to_jsonb(league);
end $$;
create or replace function public.join_private_league(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); league public.private_leagues; clean text := upper(btrim(coalesce(p_code, '')));
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if clean ~ '^BM[A-HJ-NP-Z2-9]{4}$' then clean := 'BM-' || substr(clean, 3); end if;
  select * into league from public.private_leagues where code = clean;
  if not found then raise exception 'CODE_INVALIDE'; end if;
  if exists (select 1 from public.private_league_members where league_id = league.id and user_id = uid) then return to_jsonb(league); end if;
  if (select count(*) from public.private_league_members where league_id = league.id) >= 50 then raise exception 'LIGUE_PLEINE'; end if;
  perform public.ensure_player_account();
  insert into public.private_league_members (league_id, user_id) values (league.id, uid);
  return to_jsonb(league);
end $$;
commit;
