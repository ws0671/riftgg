import { describe, expect, it } from 'vitest'
import { parseRiotId, searchUrl } from '../src/features/summoner-search/riotId'

describe('Riot ID and shared URLs', () => {
  it('preserves internal spaces, case, Korean, and non-KR1 tags', () => {
    expect(parseRiotId('  Hide on 부시 # AbC  ')).toEqual({ success: true, data: { platform: 'kr', gameName: 'Hide on 부시', tagLine: 'AbC' } })
  })
  it.each(['', 'Name', 'Name#', '#KR1', 'Name#KR1#extra', 'na\nme#KR1', `${'한'.repeat(129)}#KR1`])('rejects invalid input: %s', value => {
    expect(parseRiotId(value).success).toBe(false)
  })
  it('round trips special characters without treating # as a fragment', () => {
    const result = parseRiotId('한 글 & + / ?#AbC')
    if (!result.success) throw new Error('Expected valid ID')
    const url = new URL(searchUrl(result.data), 'https://rift.example')
    expect(url.hash).toBe('')
    expect(url.searchParams.get('gameName')).toBe(result.data.gameName)
    expect(url.searchParams.get('tagLine')).toBe('AbC')
  })
})
