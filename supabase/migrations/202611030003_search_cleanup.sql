-- Supabase already provides pg_cron on supported projects; do not install extensions implicitly.
-- Plain PostgreSQL/PGlite can still call cleanup_summoner_search manually.
do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    execute $job$select cron.schedule('riftgg-search-cache-cleanup','17 3 * * *','select public.cleanup_summoner_search()')$job$;
  end if;
end $$;
