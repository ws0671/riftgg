import { z } from 'zod'

export const MATCH_PAGE_SIZE = 10
export const MAX_MATCH_OFFSET = 990
export const matchCursorSchema = z.object({
  endTime: z.number().int().positive(),
  offset: z.number().int().min(10).max(MAX_MATCH_OFFSET).multipleOf(MATCH_PAGE_SIZE),
})
export const matchRequestSchema = z.object({
  puuid: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  cursor: matchCursorSchema.optional(),
})
export const matchSummarySchema = z.object({
  id: z.string().regex(/^[A-Z0-9]{2,8}_\d{1,20}$/),
  champion: z.string().regex(/^[A-Za-z0-9]{1,64}$/),
  championId: z.number().int().positive(),
  queueId: z.number().int().nonnegative(),
  mode: z.string().max(64),
  win: z.boolean(),
  kills: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  cs: z.number().int().nonnegative(),
  items: z.array(z.number().int().nonnegative()).length(7),
  duration: z.number().int().nonnegative(),
  endedAt: z.number().int().positive(),
})
export const matchPageSchema = z.object({
  matches: z.array(matchSummarySchema).max(MATCH_PAGE_SIZE),
  nextCursor: matchCursorSchema.nullable(),
  assetVersion: z.string().regex(/^\d+\.\d+\.\d+$/).nullable(),
})
export type MatchSummary = z.infer<typeof matchSummarySchema>
export type MatchCursor = z.infer<typeof matchCursorSchema>

export const matchDetailRequestSchema = matchRequestSchema.pick({ puuid: true }).extend({
  matchId: matchSummarySchema.shape.id,
})
export const matchPlayerSchema = matchSummarySchema.pick({
  champion: true, kills: true, deaths: true, assists: true, cs: true, items: true,
}).extend({
  name: z.string().min(1).max(128),
  damage: z.number().int().nonnegative(),
  gold: z.number().int().nonnegative(),
})
export const matchDetailSchema = z.object({
  teams: z.array(z.object({
    id: z.number().int().nonnegative(),
    win: z.boolean(),
    kills: z.number().int().nonnegative(),
    players: z.array(matchPlayerSchema.extend({ isSearchedPlayer: z.boolean() })).min(1),
  })).min(1),
})
export type MatchPlayer = z.infer<typeof matchPlayerSchema> & { isSearchedPlayer: boolean }
