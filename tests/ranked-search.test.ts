import { describe, expect, it, vi } from 'vitest'
import { createSearchHandler } from '../supabase/functions/summoner-search/handler'
import type {
  CachedSummoner,
  SearchStore,
} from '../supabase/functions/summoner-search/store'
import { emptyRanks } from '../supabase/functions/summoner-search/store'
import { readRiotBudgets } from '../supabase/functions/_shared/riot'
import { createClientIdentity } from '../supabase/functions/_shared/clientIdentity'
import { cacheFreshTime } from '../src/features/summoner-search/hooks/useSummoner'
import type { SearchResponse } from '../supabase/functions/_shared/contracts'
import { ranksSchema } from '../supabase/functions/_shared/contracts'

const now = Date.parse('2026-11-03T00:10:00Z')
const date = (offset = 0) => new Date(now + offset).toISOString()
const account = {
  puuid: 'stable-player',
  gameName: 'Rift Player',
  tagLine: 'TAG',
}
const profile = {
  ...account,
  profileIconId: 1,
  summonerLevel: 100,
  updatedAt: date(-60_000),
  expiresAt: date(240_000),
}
const rank = { tier: 'DIAMOND', division: 'IV', lp: 64, wins: 87, losses: 71 }
const league = [
  {
    queueType: 'RANKED_SOLO_5x5',
    tier: 'DIAMOND',
    rank: 'IV',
    leaguePoints: 64,
    wins: 87,
    losses: 71,
  },
]
const ranks = {
  status: 'ready' as const,
  solo: rank,
  flex: null,
  updatedAt: date(-60_000),
  expiresAt: date(240_000),
}
function request(extra: Record<string, unknown> = {}) {
  return new Request('http://edge.test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      platform: 'kr',
      gameName: account.gameName,
      tagLine: account.tagLine,
      ...extra,
    }),
  })
}
function setup(
  cached: CachedSummoner = {
    profile: null,
    ranks: emptyRanks(),
    refreshAllowedAt: date(-1),
  },
) {
  const store: SearchStore = {
    consume: vi.fn().mockResolvedValue(0),
    lookup: vi.fn().mockResolvedValue(null),
    saveIdentity: vi.fn().mockResolvedValue(undefined),
    read: vi.fn().mockResolvedValue(cached),
    claim: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    reserveRefresh: vi.fn().mockResolvedValue(0),
    reserveRiot: vi.fn().mockResolvedValue(0),
    observeRiot: vi.fn().mockResolvedValue(undefined),
    blockRiot: vi.fn().mockResolvedValue(undefined),
  }
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(account))
    .mockResolvedValueOnce(Response.json(profile))
    .mockResolvedValueOnce(Response.json(league))
  const handler = createSearchHandler({
    store,
    fetcher,
    riotKey: 'test-secret',
    origins: [],
    now: () => now,
  })
  return { store, fetcher, handler }
}
describe('ranked search and manual refresh', () => {
  it('calls all three correct endpoints and maps solo/flex without inventing a rank', async () => {
    const { store, fetcher, handler } = setup()
    const response = await handler(request()),
      body = await response.json()
    expect(response.status).toBe(200)
    expect(fetcher.mock.calls[2][0]).toBe(
      'https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/stable-player',
    )
    expect(body.data.ranks).toMatchObject({
      status: 'ready',
      solo: rank,
      flex: null,
    })
    expect(body.meta.refreshAllowedAt).toBe(date(60_000))
    expect(store.save).toHaveBeenCalledWith(
      account.puuid,
      expect.any(String),
      expect.objectContaining({ puuid: account.puuid }),
      expect.objectContaining({ status: 'ready' }),
    )
  })
  it('treats a successful empty league array as unranked and persists the empty snapshot', async () => {
    const { fetcher, handler, store } = setup()
    fetcher
      .mockReset()
      .mockResolvedValueOnce(Response.json(account))
      .mockResolvedValueOnce(Response.json(profile))
      .mockResolvedValueOnce(Response.json([]))
    const body = await (await handler(request())).json()
    expect(body.data.ranks).toMatchObject({
      status: 'ready',
      solo: null,
      flex: null,
    })
    expect(store.save).toHaveBeenCalledWith(
      account.puuid,
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ solo: null, flex: null }),
    )
  })
  it('keeps a profile on league failure and never caches failure as unranked', async () => {
    const { fetcher, handler, store } = setup()
    fetcher
      .mockReset()
      .mockResolvedValueOnce(Response.json(account))
      .mockResolvedValueOnce(Response.json(profile))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
    const response = await handler(request()),
      body = await response.json()
    expect(response.status).toBe(200)
    expect(body.data.ranks.status).toBe('unavailable')
    expect(body.meta.warningCodes).toContain('RANK_UNAVAILABLE')
    expect(store.save).toHaveBeenCalledWith(
      account.puuid,
      expect.any(String),
      expect.anything(),
      null,
    )
  })
  it('refreshes expired ranks alone and preserves the successful profile timestamp', async () => {
    const { fetcher, handler, store } = setup({
      profile,
      ranks: { ...ranks, expiresAt: date(-1) },
      refreshAllowedAt: date(-1),
    })
    vi.mocked(store.lookup).mockResolvedValue({
      ...account,
      expiresAt: date(1_000),
    })
    fetcher.mockReset().mockResolvedValue(Response.json(league))
    const body = await (await handler(request())).json()
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0][0]).toContain('/league/v4/')
    expect(body.meta.updatedAt).toBe(profile.updatedAt)
    expect(store.save).toHaveBeenCalledWith(
      account.puuid,
      expect.any(String),
      null,
      expect.objectContaining({ status: 'ready' }),
    )
  })
  it('returns old ranks with a warning without extending their successful TTL', async () => {
    const old = { ...ranks, expiresAt: date(-1) }
    const { fetcher, handler, store } = setup({
      profile,
      ranks: old,
      refreshAllowedAt: date(-1),
    })
    vi.mocked(store.lookup).mockResolvedValue({
      ...account,
      expiresAt: date(1_000),
    })
    fetcher.mockReset().mockResolvedValue(new Response(null, { status: 503 }))
    const body = await (await handler(request())).json()
    expect(body.meta.source).toBe('stale')
    expect(body.meta.warningCodes).toContain('RANK_STALE')
    expect(body.data.ranks.expiresAt).toBe(old.expiresAt)
    expect(store.save).not.toHaveBeenCalled()
  })
  it('returns a recent profile after temporary failure only with a verified identity', async () => {
    const cached = {
      profile: { ...profile, expiresAt: date(-1) },
      ranks,
      refreshAllowedAt: date(-1),
    }
    const { fetcher, handler, store } = setup(cached)
    vi.mocked(store.lookup).mockResolvedValue({
      ...account,
      expiresAt: date(1000),
    })
    fetcher.mockReset().mockResolvedValue(new Response(null, { status: 503 }))
    const body = await (await handler(request())).json()
    expect(body.meta.source).toBe('stale')
    expect(body.meta.warningCodes).toContain('PROFILE_STALE')
    expect(store.save).not.toHaveBeenCalled()
  })
  it('does not return a stale alias if ACCOUNT cannot verify it', async () => {
    const { store, fetcher, handler } = setup({
      profile,
      ranks,
      refreshAllowedAt: date(-1),
    })
    vi.mocked(store.lookup).mockResolvedValue({
      ...account,
      expiresAt: date(-1),
    })
    fetcher.mockReset().mockResolvedValue(new Response(null, { status: 503 }))
    expect((await handler(request())).status).toBe(503)
    expect(store.read).not.toHaveBeenCalled()
  })
  it.each([404, 403])(
    'does not disguise upstream %s using old cached success',
    async (status) => {
      const { store, fetcher, handler } = setup({
        profile: { ...profile, expiresAt: date(-1) },
        ranks,
        refreshAllowedAt: date(-1),
      })
      vi.mocked(store.lookup).mockResolvedValue({
        ...account,
        expiresAt: date(1000),
      })
      fetcher.mockReset().mockResolvedValue(new Response(null, { status }))
      expect((await handler(request())).status).toBe(status === 404 ? 404 : 503)
    },
  )
  it('does not return a profile older than 30 minutes', async () => {
    const { store, fetcher, handler } = setup({
      profile: { ...profile, updatedAt: date(-1_800_001), expiresAt: date(-1) },
      ranks,
      refreshAllowedAt: date(-1),
    })
    vi.mocked(store.lookup).mockResolvedValue({
      ...account,
      expiresAt: date(1000),
    })
    fetcher.mockReset().mockResolvedValue(new Response(null, { status: 503 }))
    expect((await handler(request())).status).toBe(503)
  })
  it('rejects a too-early manual refresh before spending Riot calls', async () => {
    const { handler, store, fetcher } = setup({
      profile,
      ranks,
      refreshAllowedAt: date(45_000),
    })
    vi.mocked(store.lookup).mockResolvedValue({
      ...account,
      expiresAt: date(1000),
    })
    const response = await handler(request({ forceRefresh: true }))
    expect(response.status).toBe(429)
    expect((await response.json()).error).toMatchObject({
      code: 'REFRESH_COOLDOWN',
      retryAfterSeconds: 45,
    })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('re-verifies identity on manual refresh and reserves a PUUID-wide cooldown', async () => {
    const { handler, store, fetcher } = setup({
      profile,
      ranks,
      refreshAllowedAt: date(-1),
    })
    vi.mocked(store.lookup).mockResolvedValue({
      ...account,
      expiresAt: date(1000),
    })
    expect((await handler(request({ forceRefresh: true }))).status).toBe(200)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(store.reserveRefresh).toHaveBeenCalledWith(
      account.puuid,
      expect.any(String),
    )
  })
  it('uses a PUUID lease so two aliases cannot overwrite each other', async () => {
    const { handler, store, fetcher } = setup({
      profile,
      ranks: emptyRanks(),
      refreshAllowedAt: date(-1),
    })
    vi.mocked(store.lookup).mockResolvedValue({
      ...account,
      expiresAt: date(1000),
    })
    vi.mocked(store.claim).mockResolvedValue(false)
    const body = await (await handler(request())).json()
    expect(store.claim).toHaveBeenCalledWith(
      `summoner:${account.puuid}`,
      expect.any(String),
    )
    expect(body.meta.warningCodes).toContain('REFRESH_IN_PROGRESS')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('returns successful Riot data with a warning when only cache writing fails', async () => {
    const { store, handler } = setup()
    vi.mocked(store.save).mockRejectedValue(new Error('save failed'))
    const response = await handler(request()),
      body = await response.json()
    expect(response.status).toBe(200)
    expect(body.meta.warningCodes).toContain('CACHE_WRITE_FAILED')
    expect(body.data.ranks.solo.lp).toBe(64)
  })
  it('does not turn a shared limiter DB error into a successful partial result', async () => {
    const { store, handler } = setup()
    vi.mocked(store.reserveRiot)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockRejectedValueOnce(new Error('DB down'))
    expect((await handler(request())).status).toBe(503)
  })
  it('keeps apex tiers free of an invented division', async () => {
    const { fetcher, handler } = setup()
    fetcher
      .mockReset()
      .mockResolvedValueOnce(Response.json(account))
      .mockResolvedValueOnce(Response.json(profile))
      .mockResolvedValueOnce(
        Response.json([{ ...league[0], tier: 'MASTER', rank: 'I' }]),
      )
    expect(
      (await (await handler(request())).json()).data.ranks.solo.division,
    ).toBeNull()
  })
  it('applies method-specific Retry-After and preserves the partial profile', async () => {
    const { fetcher, store, handler } = setup()
    fetcher
      .mockReset()
      .mockResolvedValueOnce(Response.json(account))
      .mockResolvedValueOnce(Response.json(profile))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 429,
          headers: { 'Retry-After': '42', 'X-Rate-Limit-Type': 'method' },
        }),
      )
    const response = await handler(request()),
      body = await response.json()
    expect(response.status).toBe(200)
    expect(body.meta.retryAfterSeconds).toBe(42)
    expect(store.blockRiot).toHaveBeenCalledWith('method:kr:ranks', 42)
  })
})
describe('Riot headers and optional client identity', () => {
  it('maps app/method budgets and counts into shared scopes', () => {
    expect(
      readRiotBudgets(
        new Headers({
          'X-App-Rate-Limit': '20:1,100:120',
          'X-App-Rate-Limit-Count': '3:1,19:120',
          'X-Method-Rate-Limit': '5:10',
          'X-Method-Rate-Limit-Count': '2:10',
        }),
        { route: 'kr', method: 'ranks' },
      ),
    ).toEqual([
      { scope: 'app:kr', seconds: 1, maximum: 20, count: 3 },
      { scope: 'app:kr', seconds: 120, maximum: 100, count: 19 },
      { scope: 'method:kr:ranks', seconds: 10, maximum: 5, count: 2 },
    ])
  })
  it('ignores malformed budget headers', () => {
    expect(
      readRiotBudgets(
        new Headers({ 'X-App-Rate-Limit': 'NaN:0,-1:5,2:Infinity' }),
        { route: 'kr', method: 'ranks' },
      ),
    ).toEqual([])
  })
  it('does not trust request IP headers by default', async () => {
    expect(
      await createClientIdentity(
        undefined,
        'salt',
      )(
        new Request('http://test', {
          headers: { 'x-forwarded-for': '1.2.3.4' },
        }),
      ),
    ).toBeNull()
  })
  it('hashes a configured single address without storing raw IP and rejects lists', async () => {
    const identify = createClientIdentity('x-verified-ip', 'test-salt')
    const one = await identify(
      new Request('http://test', { headers: { 'x-verified-ip': '1.2.3.4' } }),
    )
    expect(one).toMatch(/^[a-f0-9]{64}$/)
    expect(one).not.toContain('1.2.3.4')
    await expect(
      identify(
        new Request('http://test', {
          headers: { 'x-verified-ip': '1.2.3.4, 5.6.7.8' },
        }),
      ),
    ).rejects.toThrow('Verified client address unavailable')
  })
  it('bounds browser freshness to both profile and rank expiry', () => {
    const data = {
      data: { ranks: { expiresAt: date(5_000) } },
      meta: { expiresAt: date(240_000) },
    } as SearchResponse
    expect(cacheFreshTime(data, now)).toBe(5000)
    expect(cacheFreshTime(data, now + 6000)).toBe(0)
  })
  it('rejects a successful rank snapshot without successful timestamps', () => {
    expect(ranksSchema.safeParse({ ...ranks, updatedAt: null }).success).toBe(
      false,
    )
  })
  it('rejects unavailable ranks containing a claimed rank', () => {
    expect(ranksSchema.safeParse({ ...emptyRanks(), solo: rank }).success).toBe(
      false,
    )
  })
})
