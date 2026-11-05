import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const db = new PGlite()
beforeAll(async () => {
  await db.exec(
    'create role anon; create role authenticated; create role service_role bypassrls;',
  )
  await db.exec(
    await readFile(
      new URL(
        '../supabase/migrations/202611030001_summoner_search.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  await db.exec(
    await readFile(
      new URL(
        '../supabase/migrations/202611030002_ranked_search.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  await db.exec(
    await readFile(
      new URL(
        '../supabase/migrations/202611030003_search_cleanup.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
})
afterAll(() => db.close())
const rankedOwner = '10000000-0000-0000-0000-000000000001'
const rankedProfile = {
  puuid: 'ranked-player',
  gameName: 'Player',
  tagLine: 'TAG',
  profileIconId: 1,
  summonerLevel: 100,
  updatedAt: '2026-11-03T00:00:00.000Z',
  expiresAt: '2026-11-03T00:05:00.000Z',
}
const rankedSnapshot = {
  status: 'ready',
  solo: { tier: 'GOLD', division: 'II', lp: 42, wins: 10, losses: 10 },
  flex: null,
  updatedAt: rankedProfile.updatedAt,
  expiresAt: rankedProfile.expiresAt,
}
describe('PostgreSQL search migration', () => {
  it('enforces quota in the database and reports a positive retry time', async () => {
    expect(
      (
        await db.query<{ wait: number }>(
          "select public.consume_search_limit('test', 1, 60) as wait",
        )
      ).rows[0].wait,
    ).toBe(0)
    expect(
      (
        await db.query<{ wait: number }>(
          "select public.consume_search_limit('test', 1, 60) as wait",
        )
      ).rows[0].wait,
    ).toBeGreaterThan(0)
  })
  it('allows only the lease owner to save or release', async () => {
    const owner = '00000000-0000-0000-0000-000000000001',
      other = '00000000-0000-0000-0000-000000000002'
    expect(
      (
        await db.query<{ ok: boolean }>(
          'select public.claim_summoner_search($1, $2) as ok',
          ['key', owner],
        )
      ).rows[0].ok,
    ).toBe(true)
    expect(
      (
        await db.query<{ ok: boolean }>(
          'select public.claim_summoner_search($1, $2) as ok',
          ['key', other],
        )
      ).rows[0].ok,
    ).toBe(false)
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select public.save_summoner_search($1, $2, '{}'::jsonb) as ok",
          ['key', other],
        )
      ).rows[0].ok,
    ).toBe(false)
    await db.query('select public.release_summoner_search($1, $2)', [
      'key',
      other,
    ])
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select public.save_summoner_search($1, $2, '{}'::jsonb) as ok",
          ['key', owner],
        )
      ).rows[0].ok,
    ).toBe(true)
    await db.query('select public.release_summoner_search($1, $2)', [
      'key',
      owner,
    ])
    expect(
      (
        await db.query<{ ok: boolean }>(
          'select public.claim_summoner_search($1, $2) as ok',
          ['key', other],
        )
      ).rows[0].ok,
    ).toBe(true)
  })
  it('does not let an expired worker overwrite data', async () => {
    const owner = '00000000-0000-0000-0000-000000000003'
    await db.query('select public.claim_summoner_search($1,$2)', [
      'expired',
      owner,
    ])
    await db.exec(
      "update public.summoner_search_cache set lease_until = now() - interval '1 second' where cache_key = 'expired'",
    )
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select public.save_summoner_search($1,$2,'{}') as ok",
          ['expired', owner],
        )
      ).rows[0].ok,
    ).toBe(false)
  })
  it('shares cooldown across Riot request scopes without blocking cache traffic', async () => {
    await db.exec('select public.block_riot_search(30)')
    expect(
      (
        await db.query<{ wait: number }>(
          "select public.consume_search_limit('riot:second',8,1) as wait",
        )
      ).rows[0].wait,
    ).toBeGreaterThan(0)
    expect(
      (
        await db.query<{ wait: number }>(
          "select public.consume_search_limit('search:other',8,60) as wait",
        )
      ).rows[0].wait,
    ).toBe(0)
  })
  it.each(['anon', 'authenticated'])(
    'denies %s direct access to tables and privileged RPCs',
    async (role) => {
      await db.exec(`set role ${role}`)
      try {
        await expect(
          db.query('select * from public.summoner_search_cache'),
        ).rejects.toThrow(/permission denied/)
        await expect(
          db.query("select public.consume_search_limit('bypass',999,1)"),
        ).rejects.toThrow(/permission denied/)
        await expect(
          db.query(
            "select public.claim_summoner_search('bypass','00000000-0000-0000-0000-000000000001')",
          ),
        ).rejects.toThrow(/permission denied/)
      } finally {
        await db.exec('reset role')
      }
    },
  )
})

describe('normalized ranked search database', () => {
  it('persists profile and rank data and reads a coherent DTO', async () => {
    await db.query('select public.claim_summoner_search($1,$2)', [
      'summoner:ranked-player',
      rankedOwner,
    ])
    const saved = await db.query<{ ok: boolean }>(
      'select public.save_ranked_summoner($1,$2,$3,$4) as ok',
      [
        'ranked-player',
        rankedOwner,
        JSON.stringify(rankedProfile),
        JSON.stringify(rankedSnapshot),
      ],
    )
    expect(saved.rows[0].ok).toBe(true)
    const result = await db.query<{ data: any }>(
      'select public.read_ranked_summoner($1) as data',
      ['ranked-player'],
    )
    expect(result.rows[0].data.profile).toEqual(rankedProfile)
    expect(result.rows[0].data.ranks).toEqual(rankedSnapshot)
  })
  it('atomically replaces a ranked snapshot with an empty successful snapshot', async () => {
    const empty = { ...rankedSnapshot, solo: null }
    await db.query('select public.save_ranked_summoner($1,$2,null,$3)', [
      'ranked-player',
      rankedOwner,
      JSON.stringify(empty),
    ])
    const result = await db.query<{ data: any }>(
      'select public.read_ranked_summoner($1) as data',
      ['ranked-player'],
    )
    expect(result.rows[0].data.ranks).toEqual(empty)
    expect(
      (
        await db.query('select * from public.rank_entries where puuid=$1', [
          'ranked-player',
        ])
      ).rows,
    ).toHaveLength(0)
  })
  it('does not accept failure as an empty rank snapshot', async () => {
    await expect(
      db.query('select public.save_ranked_summoner($1,$2,null,$3)', [
        'ranked-player',
        rankedOwner,
        JSON.stringify({ status: 'unavailable' }),
      ]),
    ).rejects.toThrow(/successful snapshots/)
    const result = await db.query<{ data: any }>(
      'select public.read_ranked_summoner($1) as data',
      ['ranked-player'],
    )
    expect(result.rows[0].data.ranks.status).toBe('ready')
  })
  it('rolls back the profile too when rank constraints fail', async () => {
    const invalidRank = {
      ...rankedSnapshot,
      solo: { ...rankedSnapshot.solo, wins: -1 },
    }
    await expect(
      db.query('select public.save_ranked_summoner($1,$2,$3,$4)', [
        'ranked-player',
        rankedOwner,
        JSON.stringify({ ...rankedProfile, summonerLevel: 999 }),
        JSON.stringify(invalidRank),
      ]),
    ).rejects.toThrow()
    const result = await db.query<{ data: any }>(
      'select public.read_ranked_summoner($1) as data',
      ['ranked-player'],
    )
    expect(result.rows[0].data.profile.summonerLevel).toBe(100)
  })
  it('rejects writes from a different or expired lease owner', async () => {
    expect(
      (
        await db.query<{ ok: boolean }>(
          'select public.save_ranked_summoner($1,$2,$3,null) as ok',
          [
            'ranked-player',
            '10000000-0000-0000-0000-000000000002',
            JSON.stringify(rankedProfile),
          ],
        )
      ).rows[0].ok,
    ).toBe(false)
  })
  it('enforces PUUID-wide manual cooldown and requires a lease', async () => {
    await db.exec(
      "update public.summoner_refresh_state set allowed_at=now()-interval '1 second' where puuid='ranked-player'",
    )
    expect(
      (
        await db.query<{ wait: number }>(
          'select public.reserve_summoner_refresh($1,$2) as wait',
          ['ranked-player', rankedOwner],
        )
      ).rows[0].wait,
    ).toBe(0)
    expect(
      (
        await db.query<{ wait: number }>(
          'select public.reserve_summoner_refresh($1,$2) as wait',
          ['ranked-player', rankedOwner],
        )
      ).rows[0].wait,
    ).toBeGreaterThan(0)
    await expect(
      db.query('select public.reserve_summoner_refresh($1,$2)', [
        'ranked-player',
        '10000000-0000-0000-0000-000000000002',
      ]),
    ).rejects.toThrow(/Lease expired/)
  })
  it('requires an identity lease to save aliases', async () => {
    const identity = {
      puuid: rankedProfile.puuid,
      gameName: 'Renamed',
      tagLine: 'TAG',
      expiresAt: rankedProfile.expiresAt,
    }
    expect(
      (
        await db.query<{ ok: boolean }>(
          'select public.save_riot_identity($1,$2,$3) as ok',
          ['lookup', rankedOwner, JSON.stringify(identity)],
        )
      ).rows[0].ok,
    ).toBe(false)
    await db.query('select public.claim_summoner_search($1,$2)', [
      'identity:lookup',
      rankedOwner,
    ])
    expect(
      (
        await db.query<{ ok: boolean }>(
          'select public.save_riot_identity($1,$2,$3) as ok',
          ['lookup', rankedOwner, JSON.stringify(identity)],
        )
      ).rows[0].ok,
    ).toBe(true)
  })
  it('uses observed method budgets without blocking unrelated methods', async () => {
    await db.query('select public.observe_riot_limits($1)', [
      JSON.stringify([
        { scope: 'method:kr:ranks', seconds: 60, maximum: 1, count: 0 },
      ]),
    ])
    expect(
      (
        await db.query<{ wait: number }>(
          "select public.reserve_riot_call('kr','ranks') as wait",
        )
      ).rows[0].wait,
    ).toBe(0)
    expect(
      (
        await db.query<{ wait: number }>(
          "select public.reserve_riot_call('kr','ranks') as wait",
        )
      ).rows[0].wait,
    ).toBeGreaterThan(0)
    expect(
      (
        await db.query<{ wait: number }>(
          "select public.reserve_riot_call('kr','profile') as wait",
        )
      ).rows[0].wait,
    ).toBe(0)
  })
  it('shares a route application cooldown but not with other routes', async () => {
    await db.exec("select public.block_riot_scope('app:kr',30)")
    expect(
      (
        await db.query<{ wait: number }>(
          "select public.reserve_riot_call('kr','profile') as wait",
        )
      ).rows[0].wait,
    ).toBeGreaterThan(0)
    expect(
      (
        await db.query<{ wait: number }>(
          "select public.reserve_riot_call('asia','account') as wait",
        )
      ).rows[0].wait,
    ).toBe(0)
  })
  it.each(['anon', 'authenticated'])(
    'denies %s normalized cache reads, writes, cooldown and cleanup RPCs',
    async (role) => {
      await db.exec(`set role ${role}`)
      try {
        for (const table of [
          'summoners',
          'rank_entries',
          'rank_cache_state',
          'riot_id_lookup_cache',
          'summoner_refresh_state',
          'riot_api_limits',
        ]) {
          await expect(
            db.query(`select * from public.${table}`),
          ).rejects.toThrow(/permission denied/)
        }
        await expect(
          db.query("select public.read_ranked_summoner('ranked-player')"),
        ).rejects.toThrow(/permission denied/)
        await expect(
          db.query("select public.reserve_riot_call('kr','profile')"),
        ).rejects.toThrow(/permission denied/)
        await expect(
          db.query('select public.cleanup_summoner_search()'),
        ).rejects.toThrow(/permission denied/)
      } finally {
        await db.exec('reset role')
      }
    },
  )
})
