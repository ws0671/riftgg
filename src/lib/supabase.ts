import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
export { FunctionsHttpError } from '@supabase/supabase-js'
let cached: { url: string; key: string; client: SupabaseClient } | undefined

export function createPublicSupabaseClient(url: string, key: string) {
  if (cached?.url === url && cached.key === key) return cached.client
  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    // Resolve fetch at call time so cancellation and isolated test transports work consistently.
    global: { fetch: (input, init) => fetch(input, init) },
  })
  cached = { url, key, client }
  return client
}
