import { z } from 'zod'
import { ApiFailure } from '../_shared/errors.ts'
import {
  matchDetailSchema,
  matchPlayerSchema,
  matchSummarySchema,
} from '../_shared/matchContracts.ts'
import { count, participantSchema, playerStats } from './riotParticipant.ts'

const riotMatchDetailSchema = z.object({
  metadata: z.object({ matchId: matchSummarySchema.shape.id }),
  info: z.object({
    gameMode: z.string(),
    participants: z.array(participantSchema.extend({
      teamId: count,
      playerSubteamId: count.optional(),
      riotIdGameName: z.string().nullish(),
      riotIdTagline: z.string().nullish(),
      summonerName: z.string().nullish(),
      totalDamageDealtToChampions: count,
      goldEarned: count,
    })).min(1),
  }),
})

export const cachedMatchDetailSchema = z.object({
  teams: z.array(matchDetailSchema.shape.teams.element.extend({
    players: z.array(matchPlayerSchema.extend({ puuid: z.string() })).min(1),
  })).min(1),
})
export type CachedMatchDetail = z.infer<typeof cachedMatchDetailSchema>

export function parseMatchDetail(
  matchId: string,
  raw: unknown,
): CachedMatchDetail {
  const parsed = riotMatchDetailSchema.safeParse(raw)
  if (!parsed.success || parsed.data.metadata.matchId !== matchId) {
    throw new ApiFailure(503, 'UPSTREAM_INVALID_RESPONSE')
  }
  const teams = new Map<number, CachedMatchDetail['teams'][number]>()
  for (const player of parsed.data.info.participants) {
    const teamId =
      parsed.data.info.gameMode === 'CHERRY' && player.playerSubteamId
        ? player.playerSubteamId
        : player.teamId
    const team = teams.get(teamId) ??
      { id: teamId, win: false, kills: 0, players: [] }
    const name = player.riotIdGameName?.trim() || player.summonerName?.trim() ||
      player.championName
    const tag = player.riotIdGameName && player.riotIdTagline?.trim()
    team.win ||= player.win
    team.kills += player.kills
    team.players.push({
      ...playerStats(player),
      puuid: player.puuid,
      name: (tag ? `${name}#${tag}` : name).slice(0, 128),
      damage: player.totalDamageDealtToChampions,
      gold: player.goldEarned,
    })
    teams.set(teamId, team)
  }
  return {
    teams: [...teams.values()].sort((left, right) => left.id - right.id),
  }
}

export function projectMatchDetail(
  detail: CachedMatchDetail,
  searchedPuuid: string,
) {
  if (
    !detail.teams.some((team) =>
      team.players.some((player) => player.puuid === searchedPuuid)
    )
  ) {
    throw new ApiFailure(404, 'MATCH_NOT_FOUND')
  }
  return {
    teams: detail.teams.map((team) => ({
      ...team,
      players: team.players.map(({ puuid, ...stats }) => ({
        ...stats,
        isSearchedPlayer: puuid === searchedPuuid,
      })),
    })),
  }
}
