import { z } from 'zod'

const part = (max: number) => z.string().transform(value => value.trim().normalize('NFC'))
  .pipe(z.string().min(1).refine(value => Array.from(value).length <= max)
    .refine(value => Array.from(value).every(char => char !== '#' && char.codePointAt(0)! >= 32 && char.codePointAt(0)! !== 127)))

export const searchInputSchema = z.object({ platform: z.literal('kr'), gameName: part(128), tagLine: part(64) }).strict()
export type SearchInput = z.infer<typeof searchInputSchema>
export const searchResponseSchema = z.object({
  data: z.object({ puuid: z.string().min(1), platform: z.literal('kr'), gameName: z.string().min(1), tagLine: z.string().min(1),
    profileIconId: z.number().int().nonnegative(), summonerLevel: z.number().int().nonnegative(), profileIconUrl: z.url().nullable(),
  }),
  meta: z.object({ source: z.enum(['cache', 'riot']), updatedAt: z.iso.datetime(), expiresAt: z.iso.datetime(), requestId: z.string() }),
})
export type SearchResponse = z.infer<typeof searchResponseSchema>
