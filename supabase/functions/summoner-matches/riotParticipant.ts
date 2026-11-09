import { z } from 'zod'
import { matchSummarySchema } from '../_shared/matchContracts.ts'

export const count = z.number().int().nonnegative()
export const participantSchema = z.object({
  puuid: z.string(),
  championName: matchSummarySchema.shape.champion,
  championId: matchSummarySchema.shape.championId,
  win: z.boolean(),
  kills: count,
  deaths: count,
  assists: count,
  totalMinionsKilled: count,
  neutralMinionsKilled: count,
  item0: count,
  item1: count,
  item2: count,
  item3: count,
  item4: count,
  item5: count,
  item6: count,
})

export function playerStats(player: z.infer<typeof participantSchema>) {
  return {
    champion: player.championName,
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    cs: player.totalMinionsKilled + player.neutralMinionsKilled,
    items: [
      player.item0,
      player.item1,
      player.item2,
      player.item3,
      player.item4,
      player.item5,
      player.item6,
    ],
  }
}
