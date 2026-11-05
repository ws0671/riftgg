import { ArrowLeft, Check, Copy, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { SearchInput } from '../../supabase/functions/_shared/contracts'
import { SearchError } from '../features/summoner-search/api'
import { parseRiotId, searchUrl } from '../features/summoner-search/riotId'
import {
  summonerKey,
  useSummoner,
} from '../features/summoner-search/hooks/useSummoner'
import SummonerSearchForm from '../features/summoner-search/components/SummonerSearchForm'
import SummonerProfile from '../features/summoner-search/components/SummonerProfile'
import SummonerSkeleton from '../features/summoner-search/components/SummonerSkeleton'
import SummonerError from '../features/summoner-search/components/SummonerError'
import RankCard from '../features/summoner-search/components/RankCard'
import SummonerRefreshButton from '../features/summoner-search/components/SummonerRefreshButton'
import SummonerWarnings from '../features/summoner-search/components/SummonerWarnings'

function SummonerResult({
  input,
  searchIdentity,
}: {
  input: SearchInput
  searchIdentity: string
}) {
  const [copied, setCopied] = useState(false)
  const [shareError, setShareError] = useState('')
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  // A canonical URL replacement belongs to the same search. Keep its in-flight query mounted.
  const [searchInput] = useState(input)
  const { query, refresh } = useSummoner(searchInput)
  const navigate = useNavigate()
  const client = useQueryClient()
  useEffect(() => {
    const data = query.data
    if (
      !data ||
      (data.data.gameName === input.gameName &&
        data.data.tagLine === input.tagLine)
    )
      return
    const canonical: SearchInput = {
      platform: 'kr',
      gameName: data.data.gameName,
      tagLine: data.data.tagLine,
    }
    client.setQueryData(summonerKey(canonical), data)
    navigate(searchUrl(canonical), {
      replace: true,
      state: { canonicalSearchKey: searchIdentity },
    })
  }, [
    query.data,
    input.gameName,
    input.tagLine,
    client,
    navigate,
    searchIdentity,
  ])
  useEffect(() => {
    heading.current?.focus()
    document.title = `${input.gameName}#${input.tagLine} · Rift.GG`
    return () => {
      document.title = 'Rift.GG · 소환사 검색'
    }
  }, [input.gameName, input.tagLine])
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current)
    },
    [],
  )
  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setShareError('')
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2500)
    } catch {
      setShareError('주소창의 URL을 복사해 공유해주세요.')
    }
  }
  const error =
    query.error instanceof SearchError
      ? query.error
      : new SearchError(
          'UNKNOWN',
          '정보를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.',
        )
  const refreshError =
    refresh.error instanceof SearchError
      ? refresh.error
      : query.isRefetchError && query.error instanceof SearchError
        ? query.error
        : null
  const allowedAt = Math.max(
    query.data ? Date.parse(query.data.meta.refreshAllowedAt) : 0,
    refreshError?.retryAt ?? 0,
    query.data?.meta.retryAfterSeconds
      ? query.dataUpdatedAt + query.data.meta.retryAfterSeconds * 1000
      : 0,
  )
  return (
    <main className="flex-1 pt-9 pb-[90px] max-[540px]:pt-[26px] mx-auto w-[min(calc(100%_-_64px),1040px)] max-[760px]:w-[calc(100%_-_40px)] max-[540px]:w-[calc(100%_-_32px)]">
      <div className="mb-[50px] flex items-center justify-between gap-[30px] max-[760px]:items-start max-[540px]:mb-[25px] max-[540px]:flex-col max-[540px]:gap-[22px]">
        <div className="min-w-0">
          <Link
            to="/"
            className="inline-flex items-center gap-[7px] text-[12px] text-content-muted"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            새로운 검색
          </Link>
          <h1
            className="mt-[10px] text-[25px] font-semibold tracking-[-0.8px]"
            ref={heading}
            tabIndex={-1}
          >
            소환사 검색
          </h1>
        </div>
        <SummonerSearchForm
          key={`${input.gameName}#${input.tagLine}`}
          className="w-[345px] max-w-full max-[760px]:w-[300px] max-[540px]:w-full"
          initialValue={`${input.gameName}#${input.tagLine}`}
        />
      </div>
      <div className="mb-4 flex items-center justify-between max-[540px]:flex-col max-[540px]:items-start max-[540px]:gap-3">
        <span className="text-[10px] tracking-[2px] text-content-muted">
          SEARCH RESULT
        </span>
        <div className="flex flex-wrap justify-end gap-2 max-[540px]:self-end">
          {query.data && (
            <SummonerRefreshButton
              allowedAt={allowedAt}
              pending={refresh.isPending || query.isFetching}
              onRefresh={() => refresh.mutate()}
            />
          )}
          <button
            className="inline-flex items-center gap-2 rounded-[6px] border border-border bg-transparent px-3 py-[9px] text-[12px] text-content-muted hover:bg-surface-muted hover:text-content"
            onClick={share}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}{' '}
            {copied ? '복사 완료' : 'URL 공유'}
          </button>
        </div>
      </div>
      <div className="sr-only" aria-live="polite">
        {copied ? '검색 결과 주소를 복사했습니다.' : ''}
      </div>
      {shareError && (
        <p
          className="mt-[9px] min-h-5 text-[12px] text-content-muted"
          role="status"
        >
          {shareError}
        </p>
      )}
      <div aria-busy={query.isFetching || refresh.isPending} aria-live="polite">
        {query.isPending ? (
          <SummonerSkeleton />
        ) : query.data ? (
          <>
            <SummonerWarnings
              codes={query.data.meta.warningCodes}
              error={refreshError}
            />
            <div className="grid grid-cols-[222px_minmax(0,1fr)] items-start gap-6 max-[760px]:grid-cols-[190px_minmax(0,1fr)] max-[540px]:grid-cols-1">
              <aside
                className="grid gap-[14px] max-[540px]:grid-cols-2"
                aria-label="랭크 정보"
              >
                <RankCard
                  title="솔로 랭크"
                  rank={query.data.data.ranks.solo}
                  unavailable={query.data.data.ranks.status === 'unavailable'}
                  updatedAt={query.data.data.ranks.updatedAt}
                />
                <RankCard
                  title="자유 랭크"
                  rank={query.data.data.ranks.flex}
                  unavailable={query.data.data.ranks.status === 'unavailable'}
                  updatedAt={query.data.data.ranks.updatedAt}
                />
              </aside>
              <div className="min-w-0">
                <SummonerProfile
                  key={query.data.data.puuid}
                  response={query.data}
                />
                <section
                  className="mt-4 rounded-[12px] border border-border bg-surface p-5"
                  aria-label="랭크 요약"
                >
                  <h2 className="text-[14px] font-semibold">현재 시즌 랭크</h2>
                  <p className="mt-2 text-[12px] text-content-muted">
                    솔로·자유 랭크의 티어와 LP, 승패를 확인할 수 있습니다. 랭크
                    승률은 시즌 전체 기록을 기준으로 계산합니다.
                  </p>
                </section>
              </div>
            </div>
          </>
        ) : (
          <SummonerError
            error={error}
            retry={() => {
              void query.refetch()
            }}
          />
        )}
      </div>
      {query.data && (
        <div className="mt-5 flex items-center gap-[9px] text-[12px] text-content-muted max-[540px]:items-start">
          <ShieldCheck className="shrink-0" size={16} aria-hidden="true" />
          <p>Riot ID와 태그라인으로 조회한 한국 서버의 소환사 정보입니다.</p>
        </div>
      )}
    </main>
  )
}

export default function SummonerPage() {
  const location = useLocation()
  const [params] = useSearchParams()
  const parsed = parseRiotId(
    `${params.get('gameName') ?? ''}#${params.get('tagLine') ?? ''}`,
  )
  if (!parsed.success)
    return (
      <main className="mx-auto w-[min(calc(100%_-_64px),1040px)] max-[760px]:w-[calc(100%_-_40px)] max-[540px]:w-[calc(100%_-_32px)] flex-1 py-[65px]">
        <SummonerError
          error={new SearchError('INVALID_RIOT_ID', parsed.message)}
        />
      </main>
    )
  const searchIdentity =
    typeof location.state?.canonicalSearchKey === 'string'
      ? location.state.canonicalSearchKey
      : `${parsed.data.gameName}#${parsed.data.tagLine}`
  return (
    <SummonerResult
      key={searchIdentity}
      input={parsed.data}
      searchIdentity={searchIdentity}
    />
  )
}
