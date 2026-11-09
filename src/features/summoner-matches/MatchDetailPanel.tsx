import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { matchDetailSchema } from '../../../supabase/functions/_shared/matchContracts'
import type { MatchPlayer } from '../../../supabase/functions/_shared/matchContracts'
import { invokePublicFunction, SearchError } from '../../lib/publicFunction'
import { ChampionIcon, MatchItems } from './MatchImages'

const formatNumber = new Intl.NumberFormat('ko-KR')
const teamNames: Record<number, string> = { 100: '블루팀', 200: '레드팀' }

function PlayerStats(
  { player, maxDamage }: { player: MatchPlayer; maxDamage: number },
) {
  return (
    <div className='grid grid-cols-2 gap-2 text-[11px]'>
      <div>
        <p className='text-content-muted'>피해량</p>
        <p className='font-semibold tabular-nums'>
          {formatNumber.format(player.damage)}
        </p>
        <div
          className='mt-1 h-1 overflow-hidden rounded-full bg-surface-muted'
          aria-hidden='true'
        >
          <div
            className='h-full rounded-full bg-accent'
            style={{ width: `${player.damage / maxDamage * 100}%` }}
          />
        </div>
      </div>
      <div>
        <p className='text-content-muted'>골드</p>
        <p className='font-semibold tabular-nums'>
          {formatNumber.format(player.gold)}
        </p>
      </div>
    </div>
  )
}

export default function MatchDetailPanel(
  { id, matchId, puuid, assetVersion, expanded }: {
    id: string
    matchId: string
    puuid: string
    assetVersion: string | null
    expanded: boolean
  },
) {
  const [view, setView] = useState<'basic' | 'comparison'>('basic')
  const [retryReadyAt, setRetryReadyAt] = useState(0)
  const query = useQuery({
    queryKey: ['match-detail', matchId, puuid],
    queryFn: async ({ signal }) =>
      matchDetailSchema.parse(
        await invokePublicFunction(
          'summoner-matches',
          { matchId, puuid },
          signal,
        ),
      ),
    enabled: expanded,
    staleTime: Infinity,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const retryAt = query.error instanceof SearchError ? query.error.retryAt : 0
  useEffect(() => {
    if (!retryAt) return
    const timer = window.setTimeout(
      () => setRetryReadyAt(retryAt),
      Math.max(0, retryAt - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [retryAt])
  const teams = query.data?.teams
  const maxDamage = Math.max(
    1,
    ...(teams?.flatMap((team) => team.players.map((player) => player.damage)) ??
      []),
  )

  return (
    <div
      id={id}
      role='region'
      aria-labelledby={`${id}-button`}
      aria-hidden={!expanded}
      inert={!expanded}
      className={`grid transition-[grid-template-rows] duration-[180ms] ease-out motion-reduce:transition-none ${
        expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      }`}
    >
      <div className='min-h-0 overflow-hidden'>
        <div
          className={`grid gap-3 border-t border-border p-3 ${
            expanded ? 'motion-safe:animate-match-detail-in' : ''
          }`}
        >
          {query.isPending && (
            <p role='status' className='text-[12px] text-content-muted'>
              경기 상세를 불러오고 있습니다.
            </p>
          )}
          {query.isError && (
            <div className='flex flex-wrap items-center gap-2'>
              <p role='status' className='text-[12px] text-content-muted'>
                경기 상세를 불러오지 못했습니다.
              </p>
              <button
                type='button'
                className='rounded-[6px] border border-border px-2 py-1 text-[12px] disabled:opacity-60'
                disabled={query.isFetching || retryAt > retryReadyAt}
                onClick={() => void query.refetch()}
              >
                다시 시도
              </button>
            </div>
          )}
          {teams && (
            <>
              <div
                className='flex gap-1 lg:hidden'
                role='group'
                aria-label='경기 상세 보기 방식'
              >
                <button
                  type='button'
                  aria-pressed={view === 'basic'}
                  onClick={() => setView('basic')}
                  className='rounded-[6px] border border-border px-3 py-2 text-[12px] aria-pressed:bg-surface-muted'
                >
                  기본 기록
                </button>
                <button
                  type='button'
                  aria-pressed={view === 'comparison'}
                  onClick={() => setView('comparison')}
                  className='rounded-[6px] border border-border px-3 py-2 text-[12px] aria-pressed:bg-surface-muted'
                >
                  피해량·골드
                </button>
              </div>
              {teams.map((team) => (
                <section
                  key={team.id}
                  className='overflow-hidden rounded-[8px] border border-border'
                >
                  <h3 className='flex flex-wrap items-center gap-2 bg-surface-muted px-3 py-2 text-[12px]'>
                    {teamNames[team.id] ?? `팀 ${team.id}`}
                    <span
                      className={team.win ? 'text-accent' : 'text-rose-300'}
                    >
                      {team.win ? '승리' : '패배'}
                    </span>
                    <span className='font-normal text-content-muted'>
                      총 {team.kills}킬
                    </span>
                  </h3>
                  {team.players.map((player, index) => (
                    <div
                      key={index}
                      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-border px-3 py-2 lg:grid-cols-[minmax(0,1fr)_100px_180px_90px_90px] ${
                        player.isSearchedPlayer ? 'bg-accent/10' : ''
                      }`}
                    >
                      <div className='col-span-2 flex min-w-0 items-center gap-2 lg:col-span-1'>
                        <div className='size-8 shrink-0 overflow-hidden rounded-[5px] bg-surface-muted'>
                          <ChampionIcon
                            champion={player.champion}
                            assetVersion={assetVersion}
                          />
                        </div>
                        <div className='min-w-0'>
                          <p className='text-[12px] font-semibold [overflow-wrap:anywhere]'>
                            {player.name}
                          </p>
                          {player.isSearchedPlayer && (
                            <p className='text-[10px] text-accent'>
                              조회한 소환사
                            </p>
                          )}
                        </div>
                      </div>
                      <div
                        className={`col-span-2 gap-2 lg:col-span-2 lg:grid lg:grid-cols-[100px_minmax(0,1fr)] ${
                          view === 'basic' ? 'grid' : 'hidden'
                        }`}
                      >
                        <p className='text-[11px] tabular-nums'>
                          {player.kills} / {player.deaths} / {player.assists}
                          <span className='ml-2 text-content-muted'>
                            {player.cs} CS
                          </span>
                        </p>
                        <MatchItems
                          items={player.items}
                          assetVersion={assetVersion}
                          compact
                        />
                      </div>
                      <div
                        className={`col-span-2 min-w-0 lg:block ${
                          view === 'comparison' ? 'block' : 'hidden'
                        }`}
                      >
                        <PlayerStats player={player} maxDamage={maxDamage} />
                      </div>
                    </div>
                  ))}
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
