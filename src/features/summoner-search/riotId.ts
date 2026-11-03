import { searchInputSchema } from '../../../supabase/functions/_shared/contracts'
import type { SearchInput } from '../../../supabase/functions/_shared/contracts'

export function parseRiotId(value: string): { success: true; data: SearchInput } | { success: false; message: string } {
  const parts = value.trim().split('#')
  if (parts.length !== 2 || !parts[0]?.trim() || !parts[1]?.trim())
    return { success: false, message: 'Riot ID와 #태그라인을 함께 입력해주세요. 예: Rift Player#KR1' }
  const result = searchInputSchema.safeParse({ platform: 'kr', gameName: parts[0], tagLine: parts[1] })
  return result.success ? { success: true, data: result.data } : { success: false, message: 'Riot ID가 너무 길거나 사용할 수 없는 문자가 포함되어 있습니다.' }
}
export function searchUrl(input: SearchInput) {
  return `/summoners/kr?${new URLSearchParams({ gameName: input.gameName, tagLine: input.tagLine })}`
}
