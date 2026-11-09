import { createClientIdentity } from '../_shared/clientIdentity.ts'
import { matchSummarySchema } from '../_shared/matchContracts.ts'
import { db, rpc, serviceStore } from '../_shared/serviceStore.ts'
import { cachedMatchDetailSchema } from './matchDetail.ts'
import { createMatchHandler } from './handler.ts'

Deno.serve(createMatchHandler({
  store: {
    ...serviceStore,
    claim: async (key, owner) =>
      Boolean(await rpc('claim_summoner_search', { p_key: key, p_owner: owner })),
    release: async (key, owner) => {
      await rpc('release_summoner_search', { p_key: key, p_owner: owner })
    },
    readDetail: async (id) => {
      const { data, error } = await db.from('match_detail_cache')
        .select('detail').eq('match_id', id)
        .gt('expires_at', new Date().toISOString()).maybeSingle()
      if (error) throw new Error('Match detail cache unavailable')
      return data ? cachedMatchDetailSchema.parse(data.detail) : null
    },
    saveDetail: async (id, detail) => {
      const { error } = await db.from('match_detail_cache').upsert({
        match_id: id,
        detail,
        expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
      }, { onConflict: 'match_id' })
      if (error) throw new Error('Match detail cache write failed')
    },
    readMatches: async (puuid, ids) => {
      if (!ids.length) return []
      const { data, error } = await db.from('summoner_match_cache')
        .select('summary').eq('puuid', puuid).in('match_id', ids)
        .gt('expires_at', new Date().toISOString())
      if (error) throw new Error('Match cache unavailable')
      return data.map((row) => matchSummarySchema.parse(row.summary))
    },
    saveMatch: async (puuid, match) => {
      const { error } = await db.from('summoner_match_cache').upsert({
        puuid,
        match_id: match.id,
        summary: match,
        expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
      }, { onConflict: 'puuid,match_id' })
      if (error) throw new Error('Match cache write failed')
    },
  },
  origins: (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:5173')
    .split(',').map((value) => value.trim()).filter(Boolean),
  riotKey: Deno.env.get('RIOT_API_KEY') ?? '',
  dataDragonVersion: Deno.env.get('DDRAGON_VERSION'),
  clientIdentity: createClientIdentity(
    Deno.env.get('VERIFIED_CLIENT_IP_HEADER'),
    Deno.env.get('CLIENT_IP_HASH_SALT'),
  ),
  log: (event) => console.warn(JSON.stringify(event)),
}))
