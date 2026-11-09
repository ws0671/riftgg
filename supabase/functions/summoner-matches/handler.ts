import { z } from 'zod'
import { ApiFailure } from '../_shared/errors.ts'
import {
  MATCH_PAGE_SIZE,
  MAX_MATCH_OFFSET,
  matchDetailRequestSchema,
  matchPageSchema,
  matchRequestSchema,
  matchSummarySchema,
} from '../_shared/matchContracts.ts'
import type { MatchSummary } from '../_shared/matchContracts.ts'
import { count, participantSchema, playerStats } from './riotParticipant.ts'
import { projectMatchDetail, parseMatchDetail } from './matchDetail.ts'
import type { CachedMatchDetail } from './matchDetail.ts'
import { readBody } from '../_shared/readBody.ts'
import { createRiotClient } from '../_shared/riot.ts'
import type { Dependencies } from '../summoner-search/handler.ts'
import type { SearchStore } from '../summoner-search/store.ts'

type MatchStore = Pick<SearchStore, 'consume' | 'reserveRiot' | 'observeRiot' | 'blockRiot' | 'claim' | 'release'> & {
  readDetail(id: string): Promise<CachedMatchDetail | null>
  saveDetail(id: string, detail: CachedMatchDetail): Promise<void>
  readMatches(puuid: string, ids: string[]): Promise<MatchSummary[]>
  saveMatch(puuid: string, match: MatchSummary): Promise<void>
}
type MatchDependencies = Omit<Dependencies, 'store'> & { store: MatchStore }
const matchIdsSchema = z.array(matchSummarySchema.shape.id).max(MATCH_PAGE_SIZE + 1)
const detailSchema = z.object({
  metadata: z.object({ matchId: matchSummarySchema.shape.id }),
  info: z.object({
    queueId: count,
    gameMode: matchSummarySchema.shape.mode,
    gameStartTimestamp: z.number().int().positive(),
    gameEndTimestamp: z.number().int().positive().optional(),
    gameDuration: count,
    participants: z.array(z.object({ puuid: z.string() }).passthrough()),
  }),
})

function summarize(id: string, puuid: string, input: unknown): MatchSummary {
  const result = detailSchema.safeParse(input)
  if (!result.success || result.data.metadata.matchId !== id)
    throw new ApiFailure(503, 'UPSTREAM_INVALID_RESPONSE')
  const { info } = result.data
  const participant = participantSchema.safeParse(
    info.participants.find((entry) => entry.puuid === puuid),
  )
  if (!participant.success) throw new ApiFailure(503, 'UPSTREAM_INVALID_RESPONSE')
  const player = participant.data
  const duration = info.gameEndTimestamp
    ? info.gameDuration
    : Math.floor(info.gameDuration / 1000)
  return {
    id,
    ...playerStats(player),
    championId: player.championId,
    queueId: info.queueId,
    mode: info.gameMode,
    win: player.win,
    duration,
    endedAt: info.gameEndTimestamp ?? info.gameStartTimestamp + duration * 1000,
  }
}

export function createMatchHandler(deps: MatchDependencies) {
  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID()
    const origin = request.headers.get('Origin')
    const headers = new Headers({
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      Vary: 'Origin',
    })
    const log = (code: string, upstreamStatus?: number) =>
      deps.log?.({ requestId, code, upstreamStatus })
    let lease: string | undefined
    try {
      if (origin) {
        if (!deps.origins.includes(origin)) throw new ApiFailure(403, 'ORIGIN_NOT_ALLOWED')
        headers.set('Access-Control-Allow-Origin', origin)
        headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
        headers.set('Access-Control-Allow-Headers', 'content-type, apikey, authorization, x-client-info')
        headers.set('Access-Control-Expose-Headers', 'Retry-After')
      }
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
      if (request.method !== 'POST') {
        headers.set('Allow', 'POST, OPTIONS')
        throw new ApiFailure(405, 'METHOD_NOT_ALLOWED')
      }
      if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))
        throw new ApiFailure(415, 'UNSUPPORTED_MEDIA_TYPE')
      const body = await readBody(request, 'INVALID_MATCH_QUERY')
      const isDetail = body !== null && typeof body === 'object' && 'matchId' in body
      const detailInput = matchDetailRequestSchema.safeParse(body)
      const input = matchRequestSchema.safeParse(body)
      if (isDetail && !detailInput.success)
        throw new ApiFailure(400, 'INVALID_MATCH_QUERY')
      const now = Math.floor((deps.now ?? Date.now)() / 1000)
      if (!input.success || (input.data.cursor && input.data.cursor.endTime > now))
        throw new ApiFailure(400, 'INVALID_MATCH_QUERY')
      const { puuid, cursor } = input.data
      const offset = cursor?.offset ?? 0
      const endTime = cursor?.endTime ?? now
      const store = deps.store
      async function limit(key: string, max: number) {
        const wait = await store.consume(key, max, 60)
        if (wait > 0) throw new ApiFailure(429, 'SEARCH_RATE_LIMITED', wait)
      }
      await limit('matches:global', 60)
      await limit(`matches:player:${puuid}`, 12)
      const client = await deps.clientIdentity?.(request)
      if (client) await limit(`client:${client}`, 30)
      if (!deps.riotKey) throw new ApiFailure(503, 'SERVICE_UNAVAILABLE')
      const detailId = isDetail && detailInput.success ? detailInput.data.matchId : null
      const cachedDetail = detailId ? await store.readDetail(detailId) : null
      if (cachedDetail) return Response.json(projectMatchDetail(cachedDetail, puuid), { headers })
      const leaseKey = detailId ? `match-detail:${detailId}` : `matches:${puuid}:${offset}`
      if (!(await store.claim(leaseKey, requestId)))
        throw new ApiFailure(409, 'MATCH_IN_PROGRESS', 2)
      lease = leaseKey
      const deadline = AbortSignal.timeout(10_000)
      const riot = createRiotClient({ store, key: deps.riotKey, fetcher: deps.fetcher, deadline, log })
      if (detailId) {
        const existing = await store.readDetail(detailId)
        if (existing) return Response.json(projectMatchDetail(existing, puuid), { headers })
        const detail = parseMatchDetail(detailId, await riot(
          { route: 'asia', method: 'match-detail' },
          `/lol/match/v5/matches/${detailId}`,
          'MATCH_NOT_FOUND',
        ))
        const response = projectMatchDetail(detail, puuid)
        await store.saveDetail(detailId, detail).catch(() => log('MATCH_CACHE_WRITE_FAILED'))
        return Response.json(response, { headers })
      }
      const params = new URLSearchParams({
        start: String(offset), count: String(MATCH_PAGE_SIZE + 1), endTime: String(endTime),
      })
      const list = matchIdsSchema.safeParse(await riot(
        { route: 'asia', method: 'match-list' },
        `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${params}`,
        'MATCH_HISTORY_NOT_FOUND',
      ))
      if (!list.success) throw new ApiFailure(503, 'UPSTREAM_INVALID_RESPONSE')
      const ids = [...new Set(list.data.slice(0, MATCH_PAGE_SIZE))]
      const matches = new Map((await store.readMatches(puuid, ids)).map((match) => [match.id, match]))
      const missing = ids.filter((id) => !matches.has(id))
      // The shared ASIA budget starts at eight calls per second, including the ID list.
      for (let index = 0; index < missing.length; index += 5) {
        if (index) await new Promise((resolve) => setTimeout(resolve, 1050))
        if (deadline.aborted) throw new ApiFailure(504, 'UPSTREAM_TIMEOUT')
        const batch = await Promise.allSettled(missing.slice(index, index + 5).map(async (id) => {
          try {
            const match = summarize(id, puuid, await riot(
              { route: 'asia', method: 'match-detail' },
              `/lol/match/v5/matches/${id}`,
              'MATCH_NOT_FOUND',
            ))
            matches.set(id, match)
            await store.saveMatch(puuid, match).catch(() => log('MATCH_CACHE_WRITE_FAILED'))
          } catch (error) {
            if (!(error instanceof ApiFailure && error.code === 'MATCH_NOT_FOUND')) throw error
          }
        }))
        for (const result of batch) if (result.status === 'rejected') throw result.reason
      }
      const response = matchPageSchema.parse({
        matches: ids.flatMap((id) => matches.get(id) ?? []),
        nextCursor: list.data.length > MATCH_PAGE_SIZE && offset < MAX_MATCH_OFFSET
          ? { offset: offset + MATCH_PAGE_SIZE, endTime }
          : null,
        assetVersion: /^\d+\.\d+\.\d+$/.test(deps.dataDragonVersion ?? '') ? deps.dataDragonVersion : null,
      })
      return Response.json(response, { headers })
    } catch (error) {
      const failure = error instanceof ApiFailure ? error : new ApiFailure(503, 'SERVICE_UNAVAILABLE')
      if (failure.retryAfter) headers.set('Retry-After', String(failure.retryAfter))
      log(failure.code)
      return Response.json({
        error: { code: failure.code, requestId, retryAfterSeconds: failure.retryAfter || undefined },
      }, { status: failure.status, headers })
    } finally {
      if (lease) await deps.store.release(lease, requestId).catch(() => log('MATCH_LEASE_RELEASE_FAILED'))
    }
  }
}
