import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const db = new PGlite()
beforeAll(async () => {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
  await db.exec(await readFile(new URL('../supabase/migrations/202611030001_summoner_search.sql', import.meta.url), 'utf8'))
})
afterAll(() => db.close())
describe('PostgreSQL search migration', () => {
  it('enforces quota in the database and reports a positive retry time', async () => {
    expect((await db.query<{ wait: number }>("select public.consume_search_limit('test', 1, 60) as wait")).rows[0].wait).toBe(0)
    expect((await db.query<{ wait: number }>("select public.consume_search_limit('test', 1, 60) as wait")).rows[0].wait).toBeGreaterThan(0)
  })
  it('allows only the lease owner to save or release', async () => {
    const owner = '00000000-0000-0000-0000-000000000001', other = '00000000-0000-0000-0000-000000000002'
    expect((await db.query<{ ok: boolean }>('select public.claim_summoner_search($1, $2) as ok', ['key', owner])).rows[0].ok).toBe(true)
    expect((await db.query<{ ok: boolean }>('select public.claim_summoner_search($1, $2) as ok', ['key', other])).rows[0].ok).toBe(false)
    expect((await db.query<{ ok: boolean }>("select public.save_summoner_search($1, $2, '{}'::jsonb) as ok", ['key', other])).rows[0].ok).toBe(false)
    await db.query('select public.release_summoner_search($1, $2)', ['key', other])
    expect((await db.query<{ ok: boolean }>("select public.save_summoner_search($1, $2, '{}'::jsonb) as ok", ['key', owner])).rows[0].ok).toBe(true)
    await db.query('select public.release_summoner_search($1, $2)', ['key', owner])
    expect((await db.query<{ ok: boolean }>('select public.claim_summoner_search($1, $2) as ok', ['key', other])).rows[0].ok).toBe(true)
  })
  it('does not let an expired worker overwrite data', async () => {
    const owner = '00000000-0000-0000-0000-000000000003'
    await db.query('select public.claim_summoner_search($1,$2)', ['expired', owner])
    await db.exec("update public.summoner_search_cache set lease_until = now() - interval '1 second' where cache_key = 'expired'")
    expect((await db.query<{ ok: boolean }>("select public.save_summoner_search($1,$2,'{}') as ok", ['expired', owner])).rows[0].ok).toBe(false)
  })
  it('shares cooldown across Riot request scopes without blocking cache traffic', async () => {
    await db.exec('select public.block_riot_search(30)')
    expect((await db.query<{ wait: number }>("select public.consume_search_limit('riot:second',8,1) as wait")).rows[0].wait).toBeGreaterThan(0)
    expect((await db.query<{ wait: number }>("select public.consume_search_limit('search:other',8,60) as wait")).rows[0].wait).toBe(0)
  })
  it.each(['anon', 'authenticated'])('denies %s direct access to tables and privileged RPCs', async role => {
    await db.exec(`set role ${role}`)
    try {
      await expect(db.query('select * from public.summoner_search_cache')).rejects.toThrow(/permission denied/)
      await expect(db.query("select public.consume_search_limit('bypass',999,1)")).rejects.toThrow(/permission denied/)
      await expect(db.query("select public.claim_summoner_search('bypass','00000000-0000-0000-0000-000000000001')")).rejects.toThrow(/permission denied/)
    } finally { await db.exec('reset role') }
  })
})
