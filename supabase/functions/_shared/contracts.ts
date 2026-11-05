import { z } from 'zod'

const part = (max: number) =>
  z
    .string()
    .transform((value) => value.trim().normalize('NFC'))
    .pipe(
      z
        .string()
        .min(1)
        .refine((value) => Array.from(value).length <= max)
        .refine((value) =>
          Array.from(value).every(
            (char) =>
              char !== '#' &&
              char.codePointAt(0)! >= 32 &&
              char.codePointAt(0)! !== 127,
          ),
        ),
    )

export const searchInputSchema = z
  .object({ platform: z.literal('kr'), gameName: part(128), tagLine: part(64) })
  .strict()
export type SearchInput = z.infer<typeof searchInputSchema>
export const searchRequestSchema = searchInputSchema.extend({
  forceRefresh: z.boolean().default(false),
})
export const rankSchema = z.object({
  tier: z.string().min(1),
  division: z.string().nullable(),
  lp: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
})
export type Rank = z.infer<typeof rankSchema>
export const ranksSchema = z
  .object({
    status: z.enum(['ready', 'unavailable']),
    solo: rankSchema.nullable(),
    flex: rankSchema.nullable(),
    updatedAt: z.iso.datetime().nullable(),
    expiresAt: z.iso.datetime().nullable(),
  })
  .superRefine((value, context) => {
    if (value.status === 'ready' && (!value.updatedAt || !value.expiresAt))
      context.addIssue({
        code: 'custom',
        message: 'Successful ranks require timestamps',
      })
    if (
      value.status === 'unavailable' &&
      (value.solo || value.flex || value.updatedAt || value.expiresAt)
    )
      context.addIssue({
        code: 'custom',
        message: 'Unavailable ranks cannot claim a successful snapshot',
      })
  })
export type Ranks = z.infer<typeof ranksSchema>
export const searchResponseSchema = z.object({
  data: z.object({
    puuid: z.string().min(1),
    platform: z.literal('kr'),
    gameName: z.string().min(1),
    tagLine: z.string().min(1),
    profileIconId: z.number().int().nonnegative(),
    summonerLevel: z.number().int().nonnegative(),
    profileIconUrl: z.url().nullable(),
    ranks: ranksSchema,
  }),
  meta: z.object({
    source: z.enum(['cache', 'riot', 'stale']),
    updatedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    requestId: z.string(),
    refreshAllowedAt: z.iso.datetime(),
    warningCodes: z.array(z.string()),
    retryAfterSeconds: z.number().int().nonnegative().optional(),
  }),
})
export type SearchResponse = z.infer<typeof searchResponseSchema>
