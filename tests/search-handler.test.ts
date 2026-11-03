import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSearchHandler } from '../supabase/functions/summoner-search/handler'
import type { SearchStore } from '../supabase/functions/summoner-search/handler'

const input = { platform: 'kr', gameName: '한 글 /', tagLine: 'TAG' }
const account = { puuid: 'player-123', gameName: '한 글 /', tagLine: 'TAG' }
const profile = { profileIconId: 23, summonerLevel: 284 }
const stamp = new Date('2026-11-03T00:00:00Z').getTime()
function request(body: unknown = input, origin = 'http://localhost:5173') {
  return new Request('http://edge.test', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) })
}
function fixture() {
  const store: SearchStore = { consume: vi.fn().mockResolvedValue(0), read: vi.fn().mockResolvedValue(null), claim: vi.fn().mockResolvedValue(true), save: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined), blockRiot: vi.fn().mockResolvedValue(undefined) }
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(account)).mockResolvedValueOnce(Response.json(profile))
  const handler = createSearchHandler({ store, fetcher, origins: ['http://localhost:5173'], riotKey: 'test-key', now: () => stamp, dataDragonVersion: '16.1.1' })
  return { store, fetcher, handler }
}
beforeEach(() => vi.restoreAllMocks())
describe('summoner-search function', () => {
  it('resolves ASIA account then KR profile, encodes paths and saves only the DTO', async () => {
    const { handler, fetcher, store } = fixture()
    const response = await handler(request())
    expect(response.status).toBe(200)
    expect(fetcher.mock.calls[0][0]).toBe('https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/%ED%95%9C%20%EA%B8%80%20%2F/TAG')
    expect(fetcher.mock.calls[1][0]).toBe('https://kr.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/player-123')
    expect(fetcher.mock.calls[0][1]?.headers).toEqual({ 'X-Riot-Token': 'test-key' })
    const body = await response.json()
    expect(body.data.summonerLevel).toBe(284)
    expect(JSON.stringify(body)).not.toContain('test-key')
    expect(store.save).toHaveBeenCalledOnce()
    expect(store.release).toHaveBeenCalledOnce()
  })
  it('returns a fresh cache without contacting Riot or acquiring a lease', async () => {
    const { handler, store, fetcher } = fixture()
    vi.mocked(store.read).mockResolvedValue({ data: { ...account, ...profile, platform: 'kr', profileIconUrl: null }, updatedAt: new Date(stamp).toISOString(), expiresAt: new Date(stamp + 1000).toISOString() })
    const response = await handler(request())
    expect((await response.json()).meta.source).toBe('cache')
    expect(fetcher).not.toHaveBeenCalled(); expect(store.claim).not.toHaveBeenCalled()
  })
  it.each([
    [404, 'ACCOUNT_NOT_FOUND', 404], [403, 'UPSTREAM_UNAVAILABLE', 503], [500, 'UPSTREAM_UNAVAILABLE', 503],
  ])('maps Riot status %i to %s', async (upstream, code, expected) => {
    const { handler, fetcher, store } = fixture()
    fetcher.mockReset().mockResolvedValue(new Response(null, { status: upstream }))
    const response = await handler(request())
    expect(response.status).toBe(expected); expect((await response.json()).error.code).toBe(code)
    expect(store.save).not.toHaveBeenCalled(); expect(store.release).toHaveBeenCalledOnce()
  })
  it('distinguishes an existing account without a KR profile', async () => {
    const { handler, fetcher } = fixture()
    fetcher.mockReset().mockResolvedValueOnce(Response.json(account)).mockResolvedValueOnce(new Response(null, { status: 404 }))
    expect((await (await handler(request())).json()).error.code).toBe('KR_PROFILE_NOT_FOUND')
  })
  it('shares the Riot Retry-After cooldown and releases the lease', async () => {
    const { handler, fetcher, store } = fixture()
    fetcher.mockReset().mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': '41' } }))
    const response = await handler(request())
    expect(response.status).toBe(429); expect(response.headers.get('Retry-After')).toBe('41')
    expect((await response.json()).error.retryAfterSeconds).toBe(41)
    expect(store.blockRiot).toHaveBeenCalledWith(41); expect(fetcher).toHaveBeenCalledOnce()
  })
  it('does not call Riot when another worker holds the lease', async () => {
    const { handler, store, fetcher } = fixture(); vi.mocked(store.claim).mockResolvedValue(false)
    expect((await handler(request())).status).toBe(409); expect(fetcher).not.toHaveBeenCalled()
    expect(store.release).not.toHaveBeenCalled()
  })
  it('fails closed when the shared limiter is unavailable', async () => {
    const { handler, store, fetcher } = fixture(); vi.mocked(store.consume).mockRejectedValue(new Error('private database detail'))
    const response = await handler(request()); expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private database detail'); expect(fetcher).not.toHaveBeenCalled()
  })
  it('handles a timeout without exposing fetch details', async () => {
    const { handler, fetcher } = fixture(); fetcher.mockReset().mockRejectedValue(new DOMException('secret URL', 'TimeoutError'))
    const response = await handler(request()); expect(response.status).toBe(504)
    expect((await response.json()).error.code).toBe('UPSTREAM_TIMEOUT')
  })
  it('rejects malformed upstream data without caching it', async () => {
    const { handler, fetcher, store } = fixture(); fetcher.mockReset().mockResolvedValue(Response.json({ invalid: true }))
    expect((await handler(request())).status).toBe(503); expect(store.save).not.toHaveBeenCalled()
  })
  it.each([{ ...input, platform: 'na1' }, { ...input, tagLine: '' }, { ...input, extra: 'bad' }])('validates direct callers', async body => {
    const { handler, fetcher } = fixture(); expect((await handler(request(body))).status).toBe(400); expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects oversized JSON', async () => { const { handler } = fixture(); expect((await handler(request({ ...input, gameName: 'a'.repeat(3000) }))).status).toBe(413) })
  it('supports preflight only for configured origins', async () => {
    const { handler } = fixture()
    const allowed = await handler(new Request('http://edge.test', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }))
    expect(allowed.status).toBe(204); expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
    const rejected = await handler(request(input, 'https://other.test')); expect(rejected.status).toBe(403)
    expect(rejected.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
