import { db, rpc, serviceStore } from '../_shared/serviceStore.ts'
import { createSearchHandler } from './handler.ts'
import type { SearchStore } from './store.ts'
import { createClientIdentity } from '../_shared/clientIdentity.ts'

const store: SearchStore = {
  ...serviceStore,
  lookup: async (key) => {
    const { data, error } = await db
      .from('riot_id_lookup_cache')
      .select('*')
      .eq('lookup_key', key)
      .maybeSingle()
    if (error) throw new Error('Lookup unavailable')
    return data
      ? {
          puuid: data.puuid,
          gameName: data.game_name,
          tagLine: data.tag_line,
          expiresAt: data.expires_at,
        }
      : null
  },
  saveIdentity: async (key, owner, identity) => {
    if (
      !(await rpc('save_riot_identity', {
        p_key: key,
        p_owner: owner,
        p_identity: identity,
      }))
    )
      throw new Error('Identity lease expired')
  },
  read: async (puuid) => await rpc('read_ranked_summoner', { p_puuid: puuid }),
  claim: async (key, owner) =>
    Boolean(await rpc('claim_summoner_search', { p_key: key, p_owner: owner })),
  save: async (puuid, owner, profile, ranks) => {
    if (
      !(await rpc('save_ranked_summoner', {
        p_puuid: puuid,
        p_owner: owner,
        p_profile: profile,
        p_ranks: ranks,
      }))
    )
      throw new Error('Profile lease expired')
  },
  release: async (key, owner) => {
    await rpc('release_summoner_search', { p_key: key, p_owner: owner })
  },
  reserveRefresh: async (puuid, owner) =>
    Number(
      await rpc('reserve_summoner_refresh', { p_puuid: puuid, p_owner: owner }),
    ),
}
Deno.serve(
  createSearchHandler({
    store,
    origins: (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:5173')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    riotKey: Deno.env.get('RIOT_API_KEY') ?? '',
    dataDragonVersion: Deno.env.get('DDRAGON_VERSION'),
    clientIdentity: createClientIdentity(
      Deno.env.get('VERIFIED_CLIENT_IP_HEADER'),
      Deno.env.get('CLIENT_IP_HASH_SALT'),
    ),
    log: (event) => console.warn(JSON.stringify(event)),
  }),
)
