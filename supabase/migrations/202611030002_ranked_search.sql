-- Additive upgrade: the initial migration and its data remain intact.
create table public.riot_id_lookup_cache (
  lookup_key text primary key,
  puuid text not null,
  game_name text not null,
  tag_line text not null,
  expires_at timestamptz not null
);
create table public.summoners (
  platform text not null check(platform = 'kr'), puuid text not null,
  game_name text not null, tag_line text not null,
  profile_icon_id integer not null check(profile_icon_id >= 0), summoner_level integer not null check(summoner_level >= 0),
  updated_at timestamptz not null, expires_at timestamptz not null,
  primary key(platform, puuid)
);
create table public.rank_cache_state (
  platform text not null check(platform = 'kr'), puuid text not null,
  updated_at timestamptz not null, expires_at timestamptz not null,
  primary key(platform, puuid)
);
create table public.rank_entries (
  platform text not null check(platform = 'kr'), puuid text not null,
  queue_type text not null check(queue_type in ('solo','flex')),
  tier text not null, division text, lp integer not null check(lp >= 0),
  wins integer not null check(wins >= 0), losses integer not null check(losses >= 0),
  primary key(platform, puuid, queue_type),
  foreign key(platform, puuid) references public.rank_cache_state(platform, puuid) on delete cascade
);
create table public.summoner_refresh_state (puuid text primary key, allowed_at timestamptz not null);
create table public.riot_api_limits (
  scope text not null, seconds integer not null check(seconds > 0), maximum integer not null check(maximum > 0),
  used integer not null default 0, window_start timestamptz not null default clock_timestamp(),
  primary key(scope, seconds)
);
create table public.riot_api_cooldowns(scope text primary key, blocked_until timestamptz not null);

do $$ declare name text; begin
  foreach name in array array['riot_id_lookup_cache','summoners','rank_cache_state','rank_entries','summoner_refresh_state','riot_api_limits','riot_api_cooldowns'] loop
    execute format('alter table public.%I enable row level security', name);
    execute format('revoke all on public.%I from public, anon, authenticated', name);
    execute format('grant all on public.%I to service_role', name);
  end loop;
end $$;

create function public.save_riot_identity(p_key text, p_owner uuid, p_identity jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.summoner_search_cache where cache_key = 'identity:' || p_key and lease_owner = p_owner and lease_until > clock_timestamp() for update;
  if not found then return false; end if;
  insert into public.riot_id_lookup_cache values(p_key,p_identity->>'puuid',p_identity->>'gameName',p_identity->>'tagLine',(p_identity->>'expiresAt')::timestamptz)
  on conflict(lookup_key) do update set puuid=excluded.puuid,game_name=excluded.game_name,tag_line=excluded.tag_line,expires_at=excluded.expires_at;
  return true;
end $$;

create function public.read_ranked_summoner(p_puuid text)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'profile', (select jsonb_build_object('puuid',puuid,'gameName',game_name,'tagLine',tag_line,'profileIconId',profile_icon_id,'summonerLevel',summoner_level,'updatedAt',to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'expiresAt',to_char(expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) from public.summoners where platform='kr' and puuid=p_puuid),
    'ranks', coalesce((select jsonb_build_object('status','ready','updatedAt',to_char(s.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'expiresAt',to_char(s.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'solo',(select jsonb_build_object('tier',tier,'division',division,'lp',lp,'wins',wins,'losses',losses) from public.rank_entries where platform='kr' and puuid=p_puuid and queue_type='solo'),
      'flex',(select jsonb_build_object('tier',tier,'division',division,'lp',lp,'wins',wins,'losses',losses) from public.rank_entries where platform='kr' and puuid=p_puuid and queue_type='flex')) from public.rank_cache_state s where s.platform='kr' and s.puuid=p_puuid), '{"status":"unavailable","solo":null,"flex":null,"updatedAt":null,"expiresAt":null}'::jsonb),
    'refreshAllowedAt', coalesce((select to_char(allowed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') from public.summoner_refresh_state where puuid=p_puuid),'1970-01-01T00:00:00.000Z')
  );
$$;

create function public.reserve_summoner_refresh(p_puuid text, p_owner uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare allowed timestamptz; stamp timestamptz := clock_timestamp();
begin
  perform 1 from public.summoner_search_cache where cache_key='summoner:' || p_puuid and lease_owner=p_owner and lease_until>stamp for update;
  if not found then raise exception 'Lease expired'; end if;
  insert into public.summoner_refresh_state values(p_puuid,stamp) on conflict do nothing;
  select allowed_at into allowed from public.summoner_refresh_state where puuid=p_puuid for update;
  if allowed > stamp then return greatest(1,ceil(extract(epoch from allowed-stamp))::integer); end if;
  update public.summoner_refresh_state set allowed_at=stamp+interval '60 seconds' where puuid=p_puuid;
  return 0;
end $$;

create function public.save_ranked_summoner(p_puuid text,p_owner uuid,p_profile jsonb,p_ranks jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare queue text; item jsonb;
begin
  perform 1 from public.summoner_search_cache where cache_key='summoner:' || p_puuid and lease_owner=p_owner and lease_until>clock_timestamp() for update;
  if not found then return false; end if;
  if p_profile is not null and p_profile <> 'null'::jsonb then
    if p_profile->>'puuid' <> p_puuid then raise exception 'Identity mismatch'; end if;
    insert into public.summoners values('kr',p_puuid,p_profile->>'gameName',p_profile->>'tagLine',(p_profile->>'profileIconId')::integer,(p_profile->>'summonerLevel')::integer,(p_profile->>'updatedAt')::timestamptz,(p_profile->>'expiresAt')::timestamptz)
    on conflict(platform,puuid) do update set game_name=excluded.game_name,tag_line=excluded.tag_line,profile_icon_id=excluded.profile_icon_id,summoner_level=excluded.summoner_level,updated_at=excluded.updated_at,expires_at=excluded.expires_at;
    insert into public.summoner_refresh_state values(p_puuid,(p_profile->>'updatedAt')::timestamptz+interval '60 seconds')
    on conflict(puuid) do update set allowed_at=greatest(public.summoner_refresh_state.allowed_at,excluded.allowed_at);
  end if;
  if p_ranks is not null and p_ranks <> 'null'::jsonb then
    if p_ranks->>'status' <> 'ready' then raise exception 'Only successful snapshots can be saved'; end if;
    insert into public.rank_cache_state values('kr',p_puuid,(p_ranks->>'updatedAt')::timestamptz,(p_ranks->>'expiresAt')::timestamptz)
    on conflict(platform,puuid) do update set updated_at=excluded.updated_at,expires_at=excluded.expires_at;
    delete from public.rank_entries where platform='kr' and puuid=p_puuid;
    foreach queue in array array['solo','flex'] loop
      item := p_ranks->queue;
      if item is not null and item <> 'null'::jsonb then
        insert into public.rank_entries values('kr',p_puuid,queue,item->>'tier',item->>'division',(item->>'lp')::integer,(item->>'wins')::integer,(item->>'losses')::integer);
      end if;
    end loop;
  end if;
  return true;
end $$;

create function public.reserve_riot_call(p_route text,p_method text)
returns integer language plpgsql security definer set search_path = '' as $$
declare stamp timestamptz := clock_timestamp(); blocked timestamptz; bucket public.riot_api_limits;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('riftgg:riot-limits',0));
  select max(blocked_until) into blocked from public.riot_api_cooldowns where scope in ('global','app:'||p_route,'method:'||p_route||':'||p_method,'service:'||p_route||':'||p_method);
  if blocked>stamp then return greatest(1,ceil(extract(epoch from blocked-stamp))::integer); end if;
  insert into public.riot_api_limits(scope,seconds,maximum) values('app:'||p_route,1,8),('app:'||p_route,120,30) on conflict do nothing;
  update public.riot_api_limits set used=0,window_start=stamp where scope in ('app:'||p_route,'method:'||p_route||':'||p_method) and window_start+make_interval(secs=>seconds)<=stamp;
  for bucket in select * from public.riot_api_limits where scope in ('app:'||p_route,'method:'||p_route||':'||p_method) loop
    if bucket.used>=bucket.maximum then return greatest(1,ceil(extract(epoch from bucket.window_start+make_interval(secs=>bucket.seconds)-stamp))::integer); end if;
  end loop;
  update public.riot_api_limits set used=used+1 where scope in ('app:'||p_route,'method:'||p_route||':'||p_method);
  return 0;
end $$;

create function public.observe_riot_limits(p_budgets jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare b jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('riftgg:riot-limits',0));
  for b in select value from jsonb_array_elements(p_budgets) loop
    insert into public.riot_api_limits(scope,seconds,maximum,used) values(b->>'scope',(b->>'seconds')::integer,(b->>'maximum')::integer,(b->>'count')::integer)
    on conflict(scope,seconds) do update set maximum=least(public.riot_api_limits.maximum,excluded.maximum),used=greatest(public.riot_api_limits.used,excluded.used);
  end loop;
end $$;

create function public.block_riot_scope(p_scope text,p_seconds integer)
returns void language sql security definer set search_path = '' as $$
  insert into public.riot_api_cooldowns values(p_scope,clock_timestamp()+make_interval(secs=>p_seconds))
  on conflict(scope) do update set blocked_until=greatest(public.riot_api_cooldowns.blocked_until,excluded.blocked_until);
$$;

create function public.cleanup_summoner_search()
returns void language sql security definer set search_path = '' as $$
  delete from public.riot_id_lookup_cache where expires_at<now()-interval '1 day';
  delete from public.summoner_search_limits where window_start<now()-interval '1 day' and coalesce(blocked_until,'-infinity')<now();
  delete from public.summoner_search_cache where coalesce(lease_until,'-infinity')<now()-interval '1 day';
  delete from public.riot_api_cooldowns where blocked_until<now()-interval '1 day';
  delete from public.summoner_refresh_state where allowed_at<now()-interval '1 day';
  delete from public.rank_cache_state where expires_at<now()-interval '7 days';
  delete from public.summoners where expires_at<now()-interval '7 days';
$$;

do $$ declare fn text; begin
  foreach fn in array array['save_riot_identity(text,uuid,jsonb)','read_ranked_summoner(text)','reserve_summoner_refresh(text,uuid)','save_ranked_summoner(text,uuid,jsonb,jsonb)','reserve_riot_call(text,text)','observe_riot_limits(jsonb)','block_riot_scope(text,integer)','cleanup_summoner_search()'] loop
    execute 'revoke all on function public.'||fn||' from public, anon, authenticated';
    execute 'grant execute on function public.'||fn||' to service_role';
  end loop;
end $$;
