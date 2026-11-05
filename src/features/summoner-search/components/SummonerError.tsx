import { ArrowRight, Search, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SearchError } from '../api'

export default function SummonerError({
  error,
  retry,
}: {
  error: SearchError
  retry?: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const wait = Math.max(0, Math.ceil((error.retryAt - now) / 1000))
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const notFound =
    error.code === 'ACCOUNT_NOT_FOUND' || error.code === 'KR_PROFILE_NOT_FOUND'
  return (
    <section
      className="rounded-[12px] border border-border bg-surface px-5 py-[65px] text-center max-[540px]:px-[18px] max-[540px]:py-[45px]"
      role="alert"
    >
      <div className="mx-auto mb-[19px] grid size-[54px] place-items-center rounded-[14px] bg-surface-muted text-accent">
        {notFound ? (
          <Search size={25} aria-hidden="true" />
        ) : (
          <TriangleAlert size={25} aria-hidden="true" />
        )}
      </div>
      <h2 className="mb-[10px] text-[21px] font-semibold tracking-[-0.6px] max-[540px]:text-[19px]">
        {notFound ? '소환사를 찾지 못했어요.' : '잠시 확인이 필요해요.'}
      </h2>
      <p className="text-[13px] text-content-muted">{error.message}</p>
      {wait > 0 && (
        <p className="mt-2 text-[13px] text-content-muted">
          {wait}초 뒤 다시 시도할 수 있습니다.
        </p>
      )}
      {retry && !notFound && (
        <button
          className="mx-auto mt-5 block rounded-[7px] border border-border bg-surface-muted px-[17px] py-[10px] text-[12px] text-content hover:bg-surface-muted hover:text-content"
          disabled={wait > 0}
          onClick={retry}
        >
          다시 시도
        </button>
      )}
      <Link
        className="mx-auto mt-[26px] flex w-fit items-center gap-[7px] text-[12px] text-content-muted"
        to="/"
      >
        검색 화면으로 돌아가기 <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  )
}
