import type { Ranks } from '../_shared/contracts.ts'

export type Account = { puuid: string; gameName: string; tagLine: string }
export type Identity = Account & { expiresAt: string }
export type Profile = Account & {
  profileIconId: number
  summonerLevel: number
  updatedAt: string
  expiresAt: string
}
export type CachedSummoner = {
  profile: Profile | null
  ranks: Ranks
  refreshAllowedAt: string
}
export type RiotScope = {
  route: 'asia' | 'kr'
  method: 'account' | 'profile' | 'ranks' | 'match-list' | 'match-detail'
}
export type RiotBudget = {
  scope: string
  seconds: number
  maximum: number
  count: number
}
export interface SearchStore {
  consume(key: string, maximum: number, seconds: number): Promise<number>
  lookup(key: string): Promise<Identity | null>
  saveIdentity(key: string, owner: string, identity: Identity): Promise<void>
  read(puuid: string): Promise<CachedSummoner>
  claim(key: string, owner: string): Promise<boolean>
  save(
    puuid: string,
    owner: string,
    profile: Profile | null,
    ranks: Ranks | null,
  ): Promise<void>
  release(key: string, owner: string): Promise<void>
  reserveRefresh(puuid: string, owner: string): Promise<number>
  reserveRiot(scope: RiotScope): Promise<number>
  observeRiot(budgets: RiotBudget[]): Promise<void>
  blockRiot(scope: string, seconds: number): Promise<void>
}
export const emptyRanks = (): Ranks => ({
  status: 'unavailable',
  solo: null,
  flex: null,
  updatedAt: null,
  expiresAt: null,
})
