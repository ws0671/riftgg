import { z } from 'zod'
import { ApiFailure } from './errors.ts'
import type {
  RiotBudget,
  RiotScope,
  SearchStore,
} from '../summoner-search/store.ts'

export const accountSchema = z.object({
  puuid: z.string().min(1),
  gameName: z.string().min(1),
  tagLine: z.string().min(1),
})
export const profileSchema = z.object({
  profileIconId: z.number().int().nonnegative(),
  summonerLevel: z.number().int().nonnegative(),
})
export const leagueSchema = z.array(
  z.object({
    queueType: z.string(),
    tier: z.string().min(1),
    rank: z.string().optional(),
    leaguePoints: z.number().int().nonnegative(),
    wins: z.number().int().nonnegative(),
    losses: z.number().int().nonnegative(),
  }),
)

function parsePairs(value: string | null) {
  return (value ?? '')
    .split(',')
    .flatMap((pair) => {
      const [count, seconds] = pair.split(':').map(Number)
      return Number.isInteger(count) &&
        count >= 0 &&
        count <= 1_000_000 &&
        Number.isInteger(seconds) &&
        seconds > 0 &&
        seconds <= 86400
        ? [{ count, seconds }]
        : []
    })
    .slice(0, 8)
}

export function readRiotBudgets(
  headers: Headers,
  scope: RiotScope,
): RiotBudget[] {
  return (['App', 'Method'] as const).flatMap((kind) => {
    const counts = parsePairs(headers.get(`X-${kind}-Rate-Limit-Count`))
    return parsePairs(headers.get(`X-${kind}-Rate-Limit`))
      .filter((item) => item.count > 0)
      .map((item) => ({
        scope:
          kind === 'App'
            ? `app:${scope.route}`
            : `method:${scope.route}:${scope.method}`,
        seconds: item.seconds,
        maximum: item.count,
        count: counts.find((c) => c.seconds === item.seconds)?.count ?? 0,
      }))
  })
}

export function createRiotClient(options: {
  store: SearchStore
  key: string
  fetcher?: typeof fetch
  deadline: AbortSignal
  log: (code: string, upstreamStatus?: number) => void
}) {
  return async (
    scope: RiotScope,
    path: string,
    notFound: string,
  ): Promise<unknown> => {
    const wait = await options.store.reserveRiot(scope)
    if (wait > 0) throw new ApiFailure(429, 'RIOT_RATE_LIMITED', wait)
    let response: Response
    try {
      response = await (options.fetcher ?? fetch)(
        `https://${scope.route}.api.riotgames.com${path}`,
        {
          headers: { 'X-Riot-Token': options.key },
          signal: AbortSignal.any([
            options.deadline,
            AbortSignal.timeout(3000),
          ]),
        },
      )
    } catch (error) {
      if (
        options.deadline.aborted ||
        (error instanceof Error &&
          ['AbortError', 'TimeoutError'].includes(error.name))
      )
        throw new ApiFailure(504, 'UPSTREAM_TIMEOUT')
      throw new ApiFailure(503, 'UPSTREAM_UNAVAILABLE')
    }
    const budgets = readRiotBudgets(response.headers, scope)
    if (budgets.length) await options.store.observeRiot(budgets)
    if (response.status === 429) {
      const raw = Number(response.headers.get('Retry-After'))
      const seconds =
        Number.isFinite(raw) && raw > 0 ? Math.min(86400, Math.ceil(raw)) : 120
      const type = response.headers.get('X-Rate-Limit-Type')?.toLowerCase()
      const cooldown =
        type === 'application'
          ? `app:${scope.route}`
          : type === 'method' || type === 'service'
            ? `${type}:${scope.route}:${scope.method}`
            : 'global'
      await options.store.blockRiot(cooldown, seconds)
      throw new ApiFailure(429, 'RIOT_RATE_LIMITED', seconds)
    }
    if (response.status === 404) throw new ApiFailure(404, notFound)
    if (!response.ok) {
      options.log('RIOT_HTTP_ERROR', response.status)
      if (response.status === 401 || response.status === 403)
        throw new ApiFailure(503, 'UPSTREAM_AUTH_ERROR')
      throw new ApiFailure(503, 'UPSTREAM_UNAVAILABLE')
    }
    try {
      return await response.json()
    } catch (error) {
      if (
        options.deadline.aborted ||
        (error instanceof Error &&
          ['AbortError', 'TimeoutError'].includes(error.name))
      )
        throw new ApiFailure(504, 'UPSTREAM_TIMEOUT')
      throw new ApiFailure(503, 'UPSTREAM_INVALID_RESPONSE')
    }
  }
}
