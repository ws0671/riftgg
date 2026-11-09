create table public.match_detail_cache (
  match_id text primary key,
  detail jsonb not null,
  expires_at timestamptz not null
);

create index match_detail_cache_expiry on public.match_detail_cache (expires_at);
alter table public.match_detail_cache enable row level security;
revoke all on public.match_detail_cache from public, anon, authenticated;
grant select, insert, update on public.match_detail_cache to service_role;

create or replace function public.cleanup_summoner_matches()
returns void language sql security definer set search_path = '' as $$
  delete from public.summoner_match_cache where expires_at <= now();
  delete from public.match_detail_cache where expires_at <= now();
$$;
