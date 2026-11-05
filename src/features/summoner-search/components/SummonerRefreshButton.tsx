import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function SummonerRefreshButton({
  allowedAt,
  pending,
  onRefresh,
}: {
  allowedAt: number
  pending: boolean
  onRefresh: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const wait = Math.max(0, Math.ceil((allowedAt - now) / 1000))
  return (
    <button
      className="inline-flex items-center justify-center gap-2 rounded-[7px] bg-accent px-[14px] py-[10px] text-[12px] font-semibold text-accent-foreground disabled:cursor-not-allowed"
      disabled={pending || wait > 0}
      onClick={onRefresh}
      aria-label="정보 갱신"
    >
      <RefreshCw
        size={14}
        className={pending ? 'animate-spin motion-reduce:animate-none' : ''}
        aria-hidden="true"
      />
      {pending ? '갱신 중' : wait > 0 ? `정보 갱신 · ${wait}초` : '정보 갱신'}
    </button>
  )
}
