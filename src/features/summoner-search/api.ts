import { searchResponseSchema } from '../../../supabase/functions/_shared/contracts'
import type { SearchInput } from '../../../supabase/functions/_shared/contracts'

import { invokePublicFunction, SearchError } from '../../lib/publicFunction'

export { SearchError }

export async function searchSummoner(
  input: SearchInput,
  signal?: AbortSignal,
  forceRefresh = false,
) {
  const body = await invokePublicFunction('summoner-search', { ...input, forceRefresh }, signal)
  const parsed = searchResponseSchema.safeParse(body)
  if (!parsed.success)
    throw new SearchError(
      'INVALID_RESPONSE',
      '정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.',
    )
  return parsed.data
}
