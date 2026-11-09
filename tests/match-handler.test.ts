import { expect, it, vi } from 'vitest'
import { createMatchHandler } from '../supabase/functions/summoner-matches/handler'

it('uses a fixed page cutoff, serves cached summaries in order and fetches only missing details', async () => {
  const now = 1760000000000
  const ids = Array.from({ length: 11 }, (_, index) => `KR_${index + 1}`)
  const cached = ids.slice(1, 10).reverse().map((id) => ({
    id, champion: 'Ahri', championId: 103, queueId: 420, mode: 'CLASSIC',
    win: true, kills: 1, deaths: 1, assists: 1, cs: 42,
    items: [0, 0, 0, 0, 0, 0, 0], duration: 1800, endedAt: now,
  }))
  const fetcher = vi.fn<typeof fetch>(async (url) => {
    const path = new URL(String(url))
    expect(path.hostname).toBe('asia.api.riotgames.com')
    if (path.pathname.endsWith('/ids')) {
      expect(path.searchParams.get('count')).toBe('11')
      expect(path.searchParams.get('endTime')).toBe(String(now / 1000))
      return Response.json(path.searchParams.get('start') === '0' ? ids : [])
    }
    expect(path.pathname).toBe('/lol/match/v5/matches/KR_1')
    return Response.json({
      metadata: { matchId: 'KR_1' },
      info: {
        queueId: 420, gameMode: 'CLASSIC', gameStartTimestamp: now - 1200000,
        gameEndTimestamp: now, gameDuration: 1200,
        participants: [{
          puuid: 'player', championName: 'Ahri', championId: 103, win: true,
          kills: 8, deaths: 3, assists: 11, totalMinionsKilled: 140, neutralMinionsKilled: 20,
          item0: 1056, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 3340,
        }],
      },
    })
  })
  const saveMatch = vi.fn(async () => {})
  const handler = createMatchHandler({
    now: () => now, riotKey: 'fixture', origins: [], fetcher,
    store: {
      consume: async () => 0, claim: async () => true, release: async () => {},
      reserveRiot: async () => 0, observeRiot: async () => {}, blockRiot: async () => {},
      readDetail: async () => null, saveDetail: async () => {},
      readMatches: async (_puuid, requested) => cached.filter(({ id }) => requested.includes(id)),
      saveMatch,
    },
  })
  const invoke = (cursor?: unknown) => handler(new Request('https://local.test/matches', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ puuid: 'player', cursor }),
  }))
  const first = await invoke()
  expect(first.status).toBe(200)
  const page = await first.json()
  expect(page.matches.map(({ id }: { id: string }) => id)).toEqual(ids.slice(0, 10))
  expect(page.matches[0]).toMatchObject({ cs: 160, duration: 1200, endedAt: now, items: [1056, 0, 0, 0, 0, 0, 3340] })
  expect(page.nextCursor).toEqual({ offset: 10, endTime: now / 1000 })
  expect(saveMatch).toHaveBeenCalledOnce()
  expect(await (await invoke(page.nextCursor)).json()).toMatchObject({ matches: [], nextCursor: null })
  expect(fetcher).toHaveBeenCalledTimes(3)
})

it('groups team detail, highlights each requester from one cache entry and omits participant IDs', async () => {
  const base = {
    championName: 'Ahri', championId: 103, win: true, teamId: 100,
    kills: 8, deaths: 3, assists: 11, totalMinionsKilled: 140, neutralMinionsKilled: 20,
    totalDamageDealtToChampions: 25123, goldEarned: 13100,
    item0: 1056, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 3340,
  }
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({
    metadata: { matchId: 'KR_1' },
    info: {
      gameMode: 'CLASSIC',
      participants: [
        { ...base, puuid: 'player', riotIdGameName: 'Player', riotIdTagline: 'KR1' },
        { ...base, puuid: 'ally', summonerName: 'Ally', kills: 2 },
        { ...base, puuid: 'opponent', summonerName: 'Opponent', teamId: 200, win: false },
      ],
    },
  }))
  let cached: import('../supabase/functions/summoner-matches/matchDetail').CachedMatchDetail | null = null
  const handler = createMatchHandler({
    riotKey: 'fixture', origins: [], fetcher,
    store: {
      consume: async () => 0, claim: async () => true, release: async () => {},
      reserveRiot: async () => 0, observeRiot: async () => {}, blockRiot: async () => {},
      readMatches: async () => [], saveMatch: async () => {},
      readDetail: async () => cached, saveDetail: async (_id, detail) => { cached = detail },
    },
  })
  const invoke = (puuid: string) => handler(new Request('https://local.test/matches', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ puuid, matchId: 'KR_1' }),
  }))
  const first = await invoke('player')
  expect(first.status).toBe(200)
  const page = await first.json()
  expect(page.teams[0]).toMatchObject({ id: 100, win: true, kills: 10 })
  expect(page.teams[1]).toMatchObject({ id: 200, win: false, kills: 8 })
  expect(page.teams[0].players[0]).toMatchObject({
    name: 'Player#KR1', isSearchedPlayer: true, damage: 25123, gold: 13100,
  })
  expect(page.teams[0].players[0]).not.toHaveProperty('puuid')
  const second = await (await invoke('opponent')).json()
  expect(second.teams[0].players[0].isSearchedPlayer).toBe(false)
  expect(second.teams[1].players[0].isSearchedPlayer).toBe(true)
  expect((await invoke('nonparticipant')).status).toBe(404)
  expect(fetcher).toHaveBeenCalledOnce()
})
