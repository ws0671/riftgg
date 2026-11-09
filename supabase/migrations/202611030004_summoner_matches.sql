create table public.summoner_match_cache (
  puuid text not null,
  match_id text not null,
  summary jsonb not null,
  expires_at timestamptz not null,
  primary key (puuid, match_id)
);

create index summoner_match_cache_expiry on public.summoner_match_cache (expires_at);
alter table public.summoner_match_cache enable row level security;
revoke all on public.summoner_match_cache from public, anon, authenticated;
grant select, insert, update on public.summoner_match_cache to service_role;

create function public.cleanup_summoner_matches()
returns void language sql security definer set search_path = '' as $$
  delete from public.summoner_match_cache where expires_at <= now();
$$;

revoke all on function public.cleanup_summoner_matches() from public, anon, authenticated;
grant execute on function public.cleanup_summoner_matches() to service_role;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $job$select cron.schedule('riftgg-match-cache-cleanup','27 3 * * *','select public.cleanup_summoner_matches()')$job$;
  end if;
end $$;
