export class SearchError extends Error {
  readonly retryAt: number
  readonly code: string
  constructor(code: string, message: string, retryAfterSeconds = 0) {
    super(message)
    this.name = 'SearchError'
    this.code = code
    this.retryAt =
      Date.now() + Math.min(86400, Math.max(0, retryAfterSeconds)) * 1000
  }
}
const messages: Record<string, string> = {
  MATCH_IN_PROGRESS: '경기 기록을 불러오는 중입니다.',
  INVALID_RIOT_ID: 'Riot ID와 태그라인을 확인해주세요.',
  UNSUPPORTED_PLATFORM: '현재 한국 서버를 지원합니다.',
  ACCOUNT_NOT_FOUND: 'Riot ID와 태그라인을 다시 확인해주세요.',
  KR_PROFILE_NOT_FOUND:
    '계정은 있지만 한국 서버의 LoL 프로필을 찾을 수 없습니다.',
  SEARCH_RATE_LIMITED: '검색이 집중되고 있습니다. 잠시 후 다시 시도해주세요.',
  RIOT_RATE_LIMITED: '데이터 조회 한도에 도달했습니다.',
  REFRESH_IN_PROGRESS:
    '소환사 정보를 조회하고 있습니다. 잠시 후 다시 시도해주세요.',
  UPSTREAM_TIMEOUT: '정보를 가져오는 데 시간이 걸리고 있습니다.',
  REFRESH_COOLDOWN: '정보 갱신은 60초에 한 번 가능합니다.',
}
export async function invokePublicFunction(
  name: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key)
    throw new SearchError(
      'NOT_CONFIGURED',
      '검색 서비스를 준비하고 있습니다. 잠시 후 다시 방문해주세요.',
    )
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
    : AbortSignal.timeout(15_000)
  let body: unknown
  try {
    const { createPublicSupabaseClient, FunctionsHttpError } =
      await import('./supabase')
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError')
    const { data, error } = await createPublicSupabaseClient(
      url,
      key,
    ).functions.invoke(name, {
      body: input,
      signal: requestSignal,
    })
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError')
    if (error instanceof FunctionsHttpError) {
      const response: Response = error.context
      const errorBody = await response.json().catch(() => null)
      const code =
        typeof errorBody?.error?.code === 'string'
          ? errorBody.error.code
          : 'SERVICE_UNAVAILABLE'
      const delay = Number(
        errorBody?.error?.retryAfterSeconds ??
          response.headers.get('Retry-After') ??
          0,
      )
      throw new SearchError(
        code,
        messages[code] ??
          '현재 정보를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.',
        Number.isFinite(delay) ? delay : 0,
      )
    }
    if (error) throw error
    body = data
  } catch (error) {
    if (signal?.aborted) throw error
    if (error instanceof SearchError) throw error
    throw new SearchError(
      'NETWORK_ERROR',
      '연결이 원활하지 않습니다. 네트워크를 확인하고 다시 시도해주세요.',
    )
  }
  return body
}
