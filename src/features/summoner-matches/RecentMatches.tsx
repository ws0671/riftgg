import { useInfiniteQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { matchPageSchema } from '../../../supabase/functions/_shared/matchContracts'
import type {
  MatchCursor,
  MatchSummary,
} from '../../../supabase/functions/_shared/matchContracts'
import { invokePublicFunction, SearchError } from '../../lib/publicFunction'

import { ChampionIcon, MatchItems } from './MatchImages'
import MatchDetailPanel from './MatchDetailPanel'

const queueNames: Record<number, string> = {
  400: '일반 드래프트',
  420: '솔로 랭크',
  430: '일반',
  440: '자유 랭크',
  450: '칼바람 나락',
  490: '빠른 대전',
  900: 'URF',
  1700: '아레나',
  1710: '아레나',
  2400: '칼바람 나락 아수라장',
}
const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function MatchCard({ match, assetVersion, puuid, expanded, onToggle }: {
  match: MatchSummary
  assetVersion: string | null
  puuid: string
  expanded: boolean
  onToggle: () => void
}) {
  const panelId = `match-detail-${match.id}`
  const date = new Date(match.endedAt)
  const duration = `${Math.floor(match.duration / 60)}분 ${
    match.duration % 60
  }초`
  const ratio = match.deaths
    ? ((match.kills + match.assists) / match.deaths).toFixed(2)
    : '무데스'
  const csPerMinute = match.duration
    ? (match.cs * 60 / match.duration).toFixed(1)
    : null
  return (
    <li className='min-w-0 rounded-[10px] border border-border bg-surface'>
      <div className='grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center'>
        <div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2'>
          <div className='w-[66px] shrink-0'>
            <strong className={match.win ? 'text-accent' : 'text-rose-300'}>
              {match.win ? '승리' : '패배'}
            </strong>
            <div className='text-[11px] text-content-muted'>{duration}</div>
          </div>
          <div className='size-10 shrink-0 overflow-hidden rounded-[7px] bg-surface-muted'>
            <ChampionIcon
              champion={match.champion}
              assetVersion={assetVersion}
            />
          </div>
          <div className='min-w-0'>
            <strong className='block text-[15px] tabular-nums'>
              {match.kills} / {match.deaths} / {match.assists}
            </strong>
            <span className='text-[11px] text-content-muted'>
              KDA {ratio} ·{' '}
              {queueNames[match.queueId] ?? (match.mode || '기타 모드')}
            </span>
          </div>
        </div>
        <div className='min-w-0 border-t border-border pt-2 sm:border-0 sm:pt-0'>
          <MatchItems items={match.items} assetVersion={assetVersion} />
          <p className='mt-2 text-[11px] text-content-muted'>
            {match.cs} CS{csPerMinute && ` · 분당 ${csPerMinute}`}
            <span aria-hidden='true'>·</span>
            <time dateTime={date.toISOString()}>{dateFormat.format(date)}</time>
          </p>
        </div>
        <button
          id={`${panelId}-button`}
          type='button'
          aria-controls={panelId}
          aria-expanded={expanded}
          onClick={onToggle}
          className='inline-flex items-center justify-center gap-1 rounded-[6px] border border-border px-2 py-2 text-[11px] hover:bg-surface-muted'
        >
          {expanded ? '상세 닫기' : '상세 보기'}
          <ChevronDown
            size={14}
            aria-hidden='true'
            className={`transition-transform duration-[180ms] motion-reduce:transition-none ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>
      <MatchDetailPanel
        id={panelId}
        matchId={match.id}
        puuid={puuid}
        assetVersion={assetVersion}
        expanded={expanded}
      />
    </li>
  )
}

export default function RecentMatches({ puuid }: { puuid: string }) {
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null)
  const query = useInfiniteQuery({
    queryKey: ['summoner-matches', puuid],
    initialPageParam: null as MatchCursor | null,
    queryFn: async ({ pageParam, signal }) => {
      const result = await invokePublicFunction('summoner-matches', {
        puuid,
        cursor: pageParam ?? undefined,
      }, signal)
      return matchPageSchema.parse(result)
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })
  const [now, setNow] = useState(() => Date.now())
  const retryAt = query.error instanceof SearchError ? query.error.retryAt : 0
  useEffect(() => {
    if (retryAt <= Date.now()) return
    const timer = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= retryAt) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [retryAt])
  const wait = Math.max(
    0,
    Math.ceil((retryAt - Math.max(now, query.errorUpdatedAt)) / 1000),
  )
  const pages = query.data?.pages ?? []
  const matchCount = pages.reduce(
    (count, page) => count + page.matches.length,
    0,
  )
  return (
    <section aria-labelledby='recent-matches-heading' className='mt-6'>
      <h2
        id='recent-matches-heading'
        className='mb-3 text-[14px] font-semibold'
      >
        최근 경기
      </h2>
      {query.isPending && (
        <p
          role='status'
          className='rounded-[10px] border border-border bg-surface p-4 text-content-muted'
        >
          경기 기록을 불러오고 있습니다.
        </p>
      )}
      {!query.isPending && !query.isError && matchCount === 0 &&
        !query.hasNextPage && (
        <p className='rounded-[10px] border border-border bg-surface p-4 text-content-muted'>
          표시할 최근 경기 기록이 없습니다.
        </p>
      )}
      {matchCount > 0 && (
        <ul className='grid gap-2'>
          {pages.flatMap((page) =>
            page.matches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                assetVersion={page.assetVersion}
                puuid={puuid}
                expanded={expandedMatch === match.id}
                onToggle={() =>
                  setExpandedMatch((current) =>
                    current === match.id ? null : match.id
                  )}
              />
            ))
          )}
        </ul>
      )}
      {query.isError && (
        <p role='status' className='mt-3 text-[12px] text-content-muted'>
          경기 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}
      {(query.hasNextPage || query.isError) && (
        <button
          type='button'
          className='mt-3 w-full rounded-[8px] border border-border bg-surface px-4 py-2 text-[12px] hover:bg-surface-muted disabled:opacity-60'
          disabled={query.isFetching || wait > 0}
          onClick={() => {
            if (query.isError && !query.isFetchNextPageError) {
              void query.refetch()
            } else void query.fetchNextPage()
          }}
        >
          {query.isFetchingNextPage
            ? '경기 불러오는 중'
            : query.isError
            ? (wait ? `다시 시도 · ${wait}초` : '다시 시도')
            : '더 보기'}
        </button>
      )}
    </section>
  )
}
