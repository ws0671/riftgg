import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SearchInput } from '../../../../supabase/functions/_shared/contracts'
import type { SearchResponse } from '../../../../supabase/functions/_shared/contracts'
import { searchSummoner } from '../api'

export const summonerKey = (input: SearchInput) =>
  ['summoner', input.platform, input.gameName, input.tagLine] as const
export function cacheFreshTime(
  data: SearchResponse | undefined,
  now = Date.now(),
) {
  if (!data) return 0
  const end = Math.min(
    Date.parse(data.meta.expiresAt),
    data.data.ranks.expiresAt ? Date.parse(data.data.ranks.expiresAt) : now,
  )
  return Math.max(0, Math.min(60_000, end - now))
}
export function useSummoner(input: SearchInput) {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: summonerKey(input),
    queryFn: ({ signal }) => searchSummoner(input, signal),
    staleTime: (query) => cacheFreshTime(query.state.data),
    retry: false,
    refetchOnWindowFocus: false,
  })
  const refresh = useMutation({
    mutationKey: ['refresh-summoner', ...summonerKey(input)],
    mutationFn: () => {
      const account = query.data?.data
      return searchSummoner(
        account
          ? {
              platform: 'kr',
              gameName: account.gameName,
              tagLine: account.tagLine,
            }
          : input,
        undefined,
        true,
      )
    },
    retry: false,
    onMutate: async () => {
      await client.cancelQueries({ queryKey: summonerKey(input) })
    },
    onSuccess: (data) => {
      client.setQueryData(summonerKey(input), data)
      client.setQueryData(
        summonerKey({
          platform: 'kr',
          gameName: data.data.gameName,
          tagLine: data.data.tagLine,
        }),
        data,
      )
    },
  })
  return { query, refresh }
}
