-- Public schema for service-client access, with no browser grants or RLS policies.
create table public.summoner_search_cache (
  cache_key text primary key,
  snapshot jsonb,
  lease_owner uuid,
  lease_until timestamptz
);
create table public.summoner_search_limits (
  scope text primary key,
  window_start timestamptz not null default now(),
  used integer not null default 0,
  blocked_until timestamptz
);
alter table public.summoner_search_cache enable row level security;
alter table public.summoner_search_limits enable row level security;
revoke all on public.summoner_search_cache, public.summoner_search_limits from anon, authenticated;
grant all on public.summoner_search_cache, public.summoner_search_limits to service_role;

create function public.consume_search_limit(p_key text, p_max integer, p_seconds integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare bucket public.summoner_search_limits; cooldown timestamptz; stamp timestamptz := clock_timestamp();
begin
  if p_max < 1 or p_seconds < 1 or length(p_key) > 128 then raise exception 'Invalid limit'; end if;
  if p_key like 'riot:%' then
    select blocked_until into cooldown from public.summoner_search_limits where scope = 'riot:cooldown';
    if cooldown > stamp then return greatest(1, ceil(extract(epoch from cooldown - stamp))::integer); end if;
  end if;
  insert into public.summoner_search_limits(scope) values(p_key) on conflict do nothing;
  select * into bucket from public.summoner_search_limits where scope = p_key for update;
  if bucket.window_start + make_interval(secs => p_seconds) <= stamp then
    update public.summoner_search_limits set window_start = stamp, used = 1 where scope = p_key;
    return 0;
  end if;
  if bucket.used >= p_max then
    return greatest(1, ceil(extract(epoch from bucket.window_start + make_interval(secs => p_seconds) - stamp))::integer);
  end if;
  update public.summoner_search_limits set used = used + 1 where scope = p_key;
  return 0;
end $$;

create function public.block_riot_search(p_seconds integer)
returns void language sql security definer set search_path = '' as $$
  insert into public.summoner_search_limits(scope, blocked_until)
  values ('riot:cooldown', clock_timestamp() + make_interval(secs => greatest(1, p_seconds)))
  on conflict(scope) do update set blocked_until = greatest(public.summoner_search_limits.blocked_until, excluded.blocked_until);
$$;

create function public.claim_summoner_search(p_key text, p_owner uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  insert into public.summoner_search_cache(cache_key) values(p_key) on conflict do nothing;
  update public.summoner_search_cache set lease_owner = p_owner, lease_until = clock_timestamp() + interval '20 seconds'
  where cache_key = p_key and (lease_until is null or lease_until < clock_timestamp());
  get diagnostics changed = row_count;
  return changed = 1;
end $$;

create function public.save_summoner_search(p_key text, p_owner uuid, p_snapshot jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  update public.summoner_search_cache set snapshot = p_snapshot
  where cache_key = p_key and lease_owner = p_owner and lease_until > clock_timestamp();
  get diagnostics changed = row_count;
  return changed = 1;
end $$;

create function public.release_summoner_search(p_key text, p_owner uuid)
returns void language sql security definer set search_path = '' as $$
  update public.summoner_search_cache set lease_owner = null, lease_until = null
  where cache_key = p_key and lease_owner = p_owner;
$$;

revoke all on function public.consume_search_limit(text, integer, integer), public.block_riot_search(integer), public.claim_summoner_search(text, uuid), public.save_summoner_search(text, uuid, jsonb), public.release_summoner_search(text, uuid) from public, anon, authenticated;
grant execute on function public.consume_search_limit(text, integer, integer), public.block_riot_search(integer), public.claim_summoner_search(text, uuid), public.save_summoner_search(text, uuid, jsonb), public.release_summoner_search(text, uuid) to service_role;

-- Optional daily cleanup using Supabase Cron; keep it outside the request path:
-- delete from public.summoner_search_cache where coalesce(lease_until, '-infinity') < now() and (snapshot is null or (snapshot->>'expiresAt')::timestamptz < now() - interval '1 day');
-- delete from public.summoner_search_limits where window_start < now() - interval '1 day' and coalesce(blocked_until, '-infinity') < now();
