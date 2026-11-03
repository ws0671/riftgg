import { searchResponseSchema } from '../../../supabase/functions/_shared/contracts'
import type { SearchInput } from '../../../supabase/functions/_shared/contracts'

export class SearchError extends Error {
  readonly retryAt: number
  readonly code: string
  constructor(code: string, message: string, retryAfterSeconds = 0) {
    super(message); this.name = 'SearchError'; this.code = code
    this.retryAt = Date.now() + Math.min(3600, Math.max(0, retryAfterSeconds)) * 1000
  }
}
const messages: Record<string, string> = {
  INVALID_RIOT_ID: 'Riot ID와 태그라인을 확인해주세요.', UNSUPPORTED_PLATFORM: '현재 한국 서버를 지원합니다.',
  ACCOUNT_NOT_FOUND: 'Riot ID와 태그라인을 다시 확인해주세요.', KR_PROFILE_NOT_FOUND: '계정은 있지만 한국 서버의 LoL 프로필을 찾을 수 없습니다.',
  SEARCH_RATE_LIMITED: '검색이 집중되고 있습니다. 잠시 후 다시 시도해주세요.', RIOT_RATE_LIMITED: '데이터 조회 한도에 도달했습니다.',
  REFRESH_IN_PROGRESS: '소환사 정보를 조회하고 있습니다. 잠시 후 다시 시도해주세요.', UPSTREAM_TIMEOUT: '정보를 가져오는 데 시간이 걸리고 있습니다.',
}
export async function searchSummoner(input: SearchInput, signal?: AbortSignal) {
  const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new SearchError('NOT_CONFIGURED', '검색 서비스를 준비하고 있습니다. 잠시 후 다시 방문해주세요.')
  let response: Response
  try {
    response = await fetch(`${url}/functions/v1/summoner-search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key }, body: JSON.stringify(input),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new SearchError('NETWORK_ERROR', '연결이 원활하지 않습니다. 네트워크를 확인하고 다시 시도해주세요.')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const code = typeof body?.error?.code === 'string' ? body.error.code : 'SERVICE_UNAVAILABLE'
    const delay = Number(body?.error?.retryAfterSeconds ?? response.headers.get('Retry-After') ?? 0)
    throw new SearchError(code, messages[code] ?? '현재 정보를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.', Number.isFinite(delay) ? delay : 0)
  }
  const parsed = searchResponseSchema.safeParse(body)
  if (!parsed.success) throw new SearchError('INVALID_RESPONSE', '정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.')
  return parsed.data
}
