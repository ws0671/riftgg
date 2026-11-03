import { z } from 'zod'
import { searchInputSchema, searchResponseSchema } from '../_shared/contracts.ts'
import type { SearchResponse } from '../_shared/contracts.ts'

type Snapshot = Omit<SearchResponse, 'meta'> & { updatedAt: string; expiresAt: string }
export interface SearchStore {
  consume(key: string, maximum: number, seconds: number): Promise<number>
  read(key: string): Promise<Snapshot | null>
  claim(key: string, owner: string): Promise<boolean>
  save(key: string, owner: string, snapshot: Snapshot): Promise<void>
  release(key: string, owner: string): Promise<void>
  blockRiot(seconds: number): Promise<void>
}
export interface Dependencies {
  store: SearchStore
  riotKey: string
  origins: string[]
  dataDragonVersion?: string
  fetcher?: typeof fetch
  now?: () => number
  log?: (event: { requestId: string; code: string }) => void
}
class ApiFailure extends Error {
  status: number
  code: string
  retryAfter: number
  constructor(status: number, code: string, retryAfter = 0) { super(code); this.status = status; this.code = code; this.retryAfter = retryAfter }
}
const accountSchema = z.object({ puuid: z.string().min(1), gameName: z.string().min(1), tagLine: z.string().min(1) })
const profileSchema = z.object({ profileIconId: z.number().int().nonnegative(), summonerLevel: z.number().int().nonnegative() })

async function readBody(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw new ApiFailure(400, 'INVALID_RIOT_ID')
  const chunks: Uint8Array[] = []; let length = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    length += chunk.value.byteLength
    if (length > 2048) { await reader.cancel(); throw new ApiFailure(413, 'BODY_TOO_LARGE') }
    chunks.push(chunk.value)
  }
  const bytes = new Uint8Array(length); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { return JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new ApiFailure(400, 'INVALID_RIOT_ID') }
}

export function createSearchHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID()
    const origin = request.headers.get('Origin')
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' })
    if (origin && deps.origins.includes(origin)) {
      headers.set('Access-Control-Allow-Origin', origin)
      headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
      headers.set('Access-Control-Allow-Headers', 'content-type, apikey, authorization, x-client-info')
      headers.set('Access-Control-Expose-Headers', 'Retry-After')
    }
    function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers }) }
    let lease: { key: string; owner: string } | undefined
    try {
      if (origin && !deps.origins.includes(origin)) throw new ApiFailure(403, 'ORIGIN_NOT_ALLOWED')
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
      if (request.method !== 'POST') { headers.set('Allow', 'POST, OPTIONS'); throw new ApiFailure(405, 'METHOD_NOT_ALLOWED') }
      if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new ApiFailure(415, 'UNSUPPORTED_MEDIA_TYPE')
      const body = await readBody(request)
      if (body && typeof body === 'object' && 'platform' in body && body.platform !== 'kr') throw new ApiFailure(400, 'UNSUPPORTED_PLATFORM')
      const parsed = searchInputSchema.safeParse(body)
      if (!parsed.success) throw new ApiFailure(400, 'INVALID_RIOT_ID')
      if (!deps.riotKey) throw new ApiFailure(503, 'SERVICE_UNAVAILABLE')
      const input = parsed.data
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)))
      const key = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('')
      async function consume(scope: string, maximum: number, seconds: number, code = 'SEARCH_RATE_LIMITED') {
        const wait = await deps.store.consume(scope, maximum, seconds)
        if (wait > 0) throw new ApiFailure(429, code, wait)
      }
      await consume('search:global', 120, 60)
      await consume(`search:${key}`, 12, 60)
      const now = deps.now ?? Date.now
      const cached = await deps.store.read(key)
      if (cached && Date.parse(cached.expiresAt) > now()) {
        return json(searchResponseSchema.parse({ data: cached.data, meta: { source: 'cache', updatedAt: cached.updatedAt, expiresAt: cached.expiresAt, requestId } }))
      }
      if (!await deps.store.claim(key, requestId)) throw new ApiFailure(409, 'REFRESH_IN_PROGRESS', 2)
      lease = { key, owner: requestId }
      // Each outbound request reserves shared quota; cache hits do not consume Riot quota.
      const deadline = AbortSignal.timeout(10_000)
      async function riot(path: string, notFound: string) {
        await consume('riot:second', 8, 1, 'RIOT_RATE_LIMITED')
        await consume('riot:window', 30, 120, 'RIOT_RATE_LIMITED')
        let response: Response
        try {
          response = await (deps.fetcher ?? fetch)(path, { headers: { 'X-Riot-Token': deps.riotKey }, signal: AbortSignal.any([deadline, AbortSignal.timeout(3500)]) })
        } catch (error) {
          if (deadline.aborted || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))) throw new ApiFailure(504, 'UPSTREAM_TIMEOUT')
          throw new ApiFailure(503, 'UPSTREAM_UNAVAILABLE')
        }
        if (response.status === 404) throw new ApiFailure(404, notFound)
        if (response.status === 429) {
          const raw = Number(response.headers.get('Retry-After'))
          const wait = Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : 120
          await deps.store.blockRiot(wait)
          throw new ApiFailure(429, 'RIOT_RATE_LIMITED', wait)
        }
        if (!response.ok) throw new ApiFailure(503, 'UPSTREAM_UNAVAILABLE')
        try { return await response.json() } catch { throw new ApiFailure(503, 'UPSTREAM_INVALID_RESPONSE') }
      }
      const account = accountSchema.safeParse(await riot(`https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(input.gameName)}/${encodeURIComponent(input.tagLine)}`, 'ACCOUNT_NOT_FOUND'))
      if (!account.success) throw new ApiFailure(503, 'UPSTREAM_INVALID_RESPONSE')
      const profile = profileSchema.safeParse(await riot(`https://kr.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(account.data.puuid)}`, 'KR_PROFILE_NOT_FOUND'))
      if (!profile.success) throw new ApiFailure(503, 'UPSTREAM_INVALID_RESPONSE')
      const version = deps.dataDragonVersion
      const snapshot: Snapshot = {
        data: { ...account.data, ...profile.data, platform: 'kr', profileIconUrl: version && /^\d+\.\d+\.\d+$/.test(version) ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${profile.data.profileIconId}.png` : null },
        updatedAt: new Date(now()).toISOString(), expiresAt: new Date(now() + 300_000).toISOString(),
      }
      const result = searchResponseSchema.parse({ data: snapshot.data, meta: { source: 'riot', updatedAt: snapshot.updatedAt, expiresAt: snapshot.expiresAt, requestId } })
      await deps.store.save(key, requestId, snapshot)
      return json(result)
    } catch (error) {
      const failure = error instanceof ApiFailure ? error : new ApiFailure(503, 'SERVICE_UNAVAILABLE')
      deps.log?.({ requestId, code: failure.code })
      if (failure.retryAfter) headers.set('Retry-After', String(failure.retryAfter))
      return json({ error: { code: failure.code, message: '검색 요청을 처리하지 못했습니다.', requestId, ...(failure.retryAfter ? { retryAfterSeconds: failure.retryAfter } : {}) } }, failure.status)
    } finally {
      if (lease) await deps.store.release(lease.key, lease.owner).catch(() => { deps.log?.({ requestId, code: 'LEASE_RELEASE_FAILED' }) })
    }
  }
}
