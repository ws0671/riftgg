import {
  searchRequestSchema,
  searchResponseSchema,
} from '../_shared/contracts.ts'
import type { Ranks, SearchResponse } from '../_shared/contracts.ts'
import { ApiFailure } from '../_shared/errors.ts'
import { readBody } from '../_shared/readBody.ts'
import {
  accountSchema,
  profileSchema,
  leagueSchema,
  createRiotClient,
} from '../_shared/riot.ts'
import { emptyRanks } from './store.ts'
import type { Account, CachedSummoner, Profile, SearchStore } from './store.ts'
export type { SearchStore } from './store.ts'

export interface Dependencies {
  store: SearchStore
  riotKey: string
  origins: string[]
  dataDragonVersion?: string
  fetcher?: typeof fetch
  now?: () => number
  clientIdentity?: (request: Request) => Promise<string | null>
  log?: (event: {
    requestId: string
    code: string
    upstreamStatus?: number
  }) => void
}
const TTL = 300_000,
  STALE_MAX = 30 * 60_000
const temporary = (error: unknown): error is ApiFailure =>
  error instanceof ApiFailure &&
  ['UPSTREAM_TIMEOUT', 'UPSTREAM_UNAVAILABLE', 'RIOT_RATE_LIMITED'].includes(
    error.code,
  )
const iso = (time: number) => new Date(time).toISOString()
async function digest(value: string) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(hash), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('')
}
export function createSearchHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID(),
      now = deps.now ?? Date.now
    const log = (code: string, upstreamStatus?: number) =>
      deps.log?.({
        requestId,
        code,
        ...(upstreamStatus ? { upstreamStatus } : {}),
      })
    const origin = request.headers.get('Origin')
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    })
    if (origin && deps.origins.includes(origin)) {
      headers.set('Access-Control-Allow-Origin', origin)
      headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
      headers.set(
        'Access-Control-Allow-Headers',
        'content-type, apikey, authorization, x-client-info',
      )
      headers.set('Access-Control-Expose-Headers', 'Retry-After')
    }
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers })
    const leases: string[] = [],
      warnings: string[] = []
    const fresh = (expiry: string | null | undefined) =>
      Boolean(expiry && Date.parse(expiry) > now())
    const recent = (updated: string | null | undefined) =>
      Boolean(
        updated &&
        now() - Date.parse(updated) <= STALE_MAX &&
        Date.parse(updated) <= now(),
      )
    let retryAfter: number | undefined
    const rankFallback = (ranks: Ranks) => {
      if (ranks.status === 'ready' && recent(ranks.updatedAt)) {
        if (!fresh(ranks.expiresAt)) warnings.push('RANK_STALE')
        return ranks
      }
      warnings.push('RANK_UNAVAILABLE')
      return emptyRanks()
    }
    function reply(
      profile: Profile,
      ranks: Ranks,
      account: Account,
      source: SearchResponse['meta']['source'],
      allowedAt: string,
    ) {
      const version = deps.dataDragonVersion
      return json(
        searchResponseSchema.parse({
          data: {
            ...account,
            platform: 'kr',
            profileIconId: profile.profileIconId,
            summonerLevel: profile.summonerLevel,
            profileIconUrl:
              version && /^\d+\.\d+\.\d+$/.test(version)
                ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${profile.profileIconId}.png`
                : null,
            ranks,
          },
          meta: {
            source,
            updatedAt: profile.updatedAt,
            expiresAt: profile.expiresAt,
            refreshAllowedAt: allowedAt,
            requestId,
            warningCodes: [...new Set(warnings)],
            ...(retryAfter ? { retryAfterSeconds: retryAfter } : {}),
          },
        }),
      )
    }
    async function claim(key: string) {
      if (!(await deps.store.claim(key, requestId))) return false
      leases.push(key)
      return true
    }
    try {
      if (origin && !deps.origins.includes(origin))
        throw new ApiFailure(403, 'ORIGIN_NOT_ALLOWED')
      if (request.method === 'OPTIONS')
        return new Response(null, { status: 204, headers })
      if (request.method !== 'POST') {
        headers.set('Allow', 'POST, OPTIONS')
        throw new ApiFailure(405, 'METHOD_NOT_ALLOWED')
      }
      if (
        !request.headers
          .get('Content-Type')
          ?.toLowerCase()
          .startsWith('application/json')
      )
        throw new ApiFailure(415, 'UNSUPPORTED_MEDIA_TYPE')
      const body = await readBody(request)
      if (
        body &&
        typeof body === 'object' &&
        'platform' in body &&
        body.platform !== 'kr'
      )
        throw new ApiFailure(400, 'UNSUPPORTED_PLATFORM')
      const parsed = searchRequestSchema.safeParse(body)
      if (!parsed.success) throw new ApiFailure(400, 'INVALID_RIOT_ID')
      const { forceRefresh, ...input } = parsed.data
      const key = await digest(JSON.stringify(input))
      async function consume(scope: string, maximum: number, seconds: number) {
        const wait = await deps.store.consume(scope, maximum, seconds)
        if (wait > 0) throw new ApiFailure(429, 'SEARCH_RATE_LIMITED', wait)
      }
      await consume('search:global', 120, 60)
      await consume(`search:${key}`, 12, 60)
      const client = await deps.clientIdentity?.(request)
      if (client) await consume(`client:${client}`, 30, 60)
      if (!deps.riotKey) throw new ApiFailure(503, 'SERVICE_UNAVAILABLE')
      const riot = createRiotClient({
        store: deps.store,
        key: deps.riotKey,
        fetcher: deps.fetcher,
        deadline: AbortSignal.timeout(10_000),
        log,
      })
      let identity = await deps.store.lookup(key)
      // A fresh lookup can reject a repeated manual refresh before spending ACCOUNT quota.
      if (forceRefresh && identity && fresh(identity.expiresAt)) {
        const previous = await deps.store.read(identity.puuid)
        if (fresh(previous.refreshAllowedAt))
          throw new ApiFailure(
            429,
            'REFRESH_COOLDOWN',
            Math.max(
              1,
              Math.ceil((Date.parse(previous.refreshAllowedAt) - now()) / 1000),
            ),
          )
      }
      if (forceRefresh || !identity || !fresh(identity.expiresAt)) {
        if (!(await claim(`identity:${key}`)))
          throw new ApiFailure(409, 'REFRESH_IN_PROGRESS', 2)
        const latest = await deps.store.lookup(key)
        if (!forceRefresh && latest && fresh(latest.expiresAt))
          identity = latest
        else {
          const account = accountSchema.safeParse(
            await riot(
              { route: 'asia', method: 'account' },
              `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(input.gameName)}/${encodeURIComponent(input.tagLine)}`,
              'ACCOUNT_NOT_FOUND',
            ),
          )
          if (!account.success)
            throw new ApiFailure(503, 'UPSTREAM_INVALID_RESPONSE')
          identity = { ...account.data, expiresAt: iso(now() + TTL) }
          try {
            await deps.store.saveIdentity(key, requestId, identity)
          } catch {
            warnings.push('CACHE_WRITE_FAILED')
            log('CACHE_WRITE_FAILED')
          }
        }
      }
      // Identity is fresh or verified by ACCOUNT during this request. Expired aliases never bypass ACCOUNT.
      const account: Account = {
        puuid: identity.puuid,
        gameName: identity.gameName,
        tagLine: identity.tagLine,
      }
      let cached: CachedSummoner = await deps.store.read(account.puuid)
      if (
        !forceRefresh &&
        cached.profile &&
        fresh(cached.profile.expiresAt) &&
        cached.ranks.status === 'ready' &&
        fresh(cached.ranks.expiresAt)
      )
        return reply(
          cached.profile,
          cached.ranks,
          account,
          'cache',
          cached.refreshAllowedAt,
        )
      if (!(await claim(`summoner:${account.puuid}`))) {
        if (cached.profile && recent(cached.profile.updatedAt)) {
          warnings.push('REFRESH_IN_PROGRESS')
          retryAfter = 2
          const ranks = rankFallback(cached.ranks)
          return reply(
            cached.profile,
            ranks,
            account,
            fresh(cached.profile.expiresAt) && !warnings.includes('RANK_STALE')
              ? 'cache'
              : 'stale',
            cached.refreshAllowedAt,
          )
        }
        throw new ApiFailure(409, 'REFRESH_IN_PROGRESS', 2)
      }
      // Re-read after acquiring the lease: another worker may have just committed its result.
      cached = await deps.store.read(account.puuid)
      if (
        !forceRefresh &&
        cached.profile &&
        fresh(cached.profile.expiresAt) &&
        cached.ranks.status === 'ready' &&
        fresh(cached.ranks.expiresAt)
      )
        return reply(
          cached.profile,
          cached.ranks,
          account,
          'cache',
          cached.refreshAllowedAt,
        )
      let allowedAt = cached.refreshAllowedAt
      if (forceRefresh) {
        const wait = await deps.store.reserveRefresh(account.puuid, requestId)
        if (wait > 0) throw new ApiFailure(429, 'REFRESH_COOLDOWN', wait)
        allowedAt = iso(now() + 60_000)
      }
      let profile = cached.profile,
        profileToSave: Profile | null = null,
        ranksToSave: Ranks | null = null
      if (forceRefresh || !profile || !fresh(profile.expiresAt)) {
        try {
          const result = profileSchema.safeParse(
            await riot(
              { route: 'kr', method: 'profile' },
              `/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(account.puuid)}`,
              'KR_PROFILE_NOT_FOUND',
            ),
          )
          if (!result.success)
            throw new ApiFailure(503, 'UPSTREAM_INVALID_RESPONSE')
          profile = profileToSave = {
            ...account,
            ...result.data,
            updatedAt: iso(now()),
            expiresAt: iso(now() + TTL),
          }
          allowedAt = iso(Math.max(Date.parse(allowedAt), now() + 60_000))
        } catch (error) {
          if (!temporary(error) || !profile || !recent(profile.updatedAt))
            throw error
          warnings.push('PROFILE_STALE')
          retryAfter = error.retryAfter || undefined
          return reply(
            profile,
            rankFallback(cached.ranks),
            account,
            'stale',
            allowedAt,
          )
        }
      }
      let ranks = cached.ranks
      if (forceRefresh || ranks.status !== 'ready' || !fresh(ranks.expiresAt)) {
        try {
          const result = leagueSchema.safeParse(
            await riot(
              { route: 'kr', method: 'ranks' },
              `/lol/league/v4/entries/by-puuid/${encodeURIComponent(account.puuid)}`,
              'RANK_NOT_FOUND',
            ),
          )
          if (!result.success)
            throw new ApiFailure(503, 'UPSTREAM_INVALID_RESPONSE')
          const rank = (queue: string) => {
            const row = result.data.find((entry) => entry.queueType === queue)
            return row
              ? {
                  tier: row.tier,
                  division: ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(
                    row.tier,
                  )
                    ? null
                    : (row.rank ?? null),
                  lp: row.leaguePoints,
                  wins: row.wins,
                  losses: row.losses,
                }
              : null
          }
          ranks = ranksToSave = {
            status: 'ready',
            solo: rank('RANKED_SOLO_5x5'),
            flex: rank('RANKED_FLEX_SR'),
            updatedAt: iso(now()),
            expiresAt: iso(now() + TTL),
          }
        } catch (error) {
          if (!(error instanceof ApiFailure)) throw error // shared DB/limiter failure is not an upstream partial success
          warnings.push('RANK_UNAVAILABLE')
          log(error.code)
          retryAfter = error.retryAfter || undefined
          ranks = rankFallback(cached.ranks)
        }
      }
      if (!profile) throw new ApiFailure(503, 'SERVICE_UNAVAILABLE')
      if (profileToSave || ranksToSave) {
        try {
          await deps.store.save(
            account.puuid,
            requestId,
            profileToSave,
            ranksToSave,
          )
        } catch {
          warnings.push('CACHE_WRITE_FAILED')
          log('CACHE_WRITE_FAILED')
        }
      }
      return reply(
        profile,
        ranks,
        account,
        warnings.includes('RANK_STALE') ? 'stale' : 'riot',
        allowedAt,
      )
    } catch (error) {
      const failure =
        error instanceof ApiFailure
          ? error
          : new ApiFailure(503, 'SERVICE_UNAVAILABLE')
      log(failure.code)
      if (failure.retryAfter)
        headers.set('Retry-After', String(failure.retryAfter))
      return json(
        {
          error: {
            code: failure.code,
            message: '검색 요청을 처리하지 못했습니다.',
            requestId,
            ...(failure.retryAfter
              ? { retryAfterSeconds: failure.retryAfter }
              : {}),
          },
        },
        failure.status,
      )
    } finally {
      for (const key of leases.reverse())
        await deps.store
          .release(key, requestId)
          .catch(() => log('LEASE_RELEASE_FAILED'))
    }
  }
}
