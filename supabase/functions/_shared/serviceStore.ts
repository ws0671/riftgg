import { createClient } from '@supabase/supabase-js'
import type { SearchStore } from '../summoner-search/store.ts'

export const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)
export async function rpc(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await db.rpc(name, args)
  if (error) throw new Error('Database operation failed')
  return data
}

export const serviceStore: Pick<SearchStore, 'consume' | 'reserveRiot' | 'observeRiot' | 'blockRiot'> = {
  consume: async (key, maximum, seconds) =>
    Number(
      await rpc('consume_search_limit', {
        p_key: key,
        p_max: maximum,
        p_seconds: seconds,
      }),
    ),
  reserveRiot: async (scope) =>
    Number(
      await rpc('reserve_riot_call', {
        p_route: scope.route,
        p_method: scope.method,
      }),
    ),
  observeRiot: async (budgets) => {
    await rpc('observe_riot_limits', { p_budgets: budgets })
  },
  blockRiot: async (scope, seconds) => {
    await rpc('block_riot_scope', { p_scope: scope, p_seconds: seconds })
  },
}
