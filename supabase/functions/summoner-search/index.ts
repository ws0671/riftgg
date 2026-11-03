import { createClient } from '@supabase/supabase-js'
import { createSearchHandler } from './handler.ts'
import type { SearchStore } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const origins = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:5173').split(',').map(value => value.trim()).filter(Boolean)

// No request-supplied Authorization header is applied to this service client.
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args)
  if (error) throw new Error('Database operation failed')
  return data
}
const store: SearchStore = {
  consume: async (key, maximum, seconds) => Number(await rpc('consume_search_limit', { p_key: key, p_max: maximum, p_seconds: seconds })),
  read: async key => {
    const { data, error } = await db.from('summoner_search_cache').select('snapshot').eq('cache_key', key).maybeSingle()
    if (error) throw new Error('Cache unavailable')
    return data?.snapshot ?? null
  },
  claim: async (key, owner) => Boolean(await rpc('claim_summoner_search', { p_key: key, p_owner: owner })),
  save: async (key, owner, snapshot) => {
    const saved = await rpc('save_summoner_search', { p_key: key, p_owner: owner, p_snapshot: snapshot })
    if (!saved) throw new Error('Search lease expired')
  },
  release: async (key, owner) => { await rpc('release_summoner_search', { p_key: key, p_owner: owner }) },
  blockRiot: async seconds => { await rpc('block_riot_search', { p_seconds: seconds }) },
}
Deno.serve(createSearchHandler({ store, origins, riotKey: Deno.env.get('RIOT_API_KEY') ?? '',
  dataDragonVersion: Deno.env.get('DDRAGON_VERSION'), log: event => console.warn(JSON.stringify(event)),
}))
