import { Clock3 } from 'lucide-react'
import { useState } from 'react'
import type { SearchResponse } from '../../../../supabase/functions/_shared/contracts'

export default function SummonerProfile({
  response,
}: {
  response: SearchResponse
}) {
  const [failedImage, setFailedImage] = useState<string>()
  const data = response.data
  return (
    <section
      className="overflow-hidden rounded-[12px] border border-border bg-surface"
      aria-label="소환사 검색 결과"
    >
      <div className="flex items-center gap-6 bg-gradient-to-br from-accent/10 to-transparent p-7 max-[540px]:gap-4 max-[540px]:p-4">
        <div className="grid size-20 shrink-0 place-items-center rounded-[16px] bg-surface-muted text-[34px] font-semibold text-accent ring-1 ring-border max-[540px]:size-14 max-[540px]:text-[24px]">
          {data.profileIconUrl && data.profileIconUrl !== failedImage ? (
            <img
              className="size-full rounded-[inherit] object-cover"
              src={data.profileIconUrl}
              alt={`${data.gameName} 프로필`}
              onError={() => setFailedImage(data.profileIconUrl ?? undefined)}
            />
          ) : (
            <span aria-hidden="true">{Array.from(data.gameName)[0]}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[30px] leading-tight font-semibold tracking-[-0.8px] [overflow-wrap:anywhere] max-[540px]:text-[22px]">
            {data.gameName}
            <span className="ml-2 text-[20px] font-normal text-content-muted max-[540px]:text-[16px]">
              #{data.tagLine}
            </span>
          </h2>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-content-muted">
            <span className="rounded-full border border-border bg-surface px-2 py-1">
              KR 서버
            </span>
            <span className="rounded-full border border-border bg-surface px-2 py-1">
              소환사 레벨 {data.summonerLevel}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-border px-7 py-3 text-[11px] text-content-muted max-[540px]:px-4">
        <Clock3 size={14} className="shrink-0" aria-hidden="true" />
        <span>
          마지막 갱신{' '}
          <time dateTime={response.meta.updatedAt}>
            {new Intl.DateTimeFormat('ko-KR', {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(response.meta.updatedAt))}
          </time>
        </span>
      </div>
    </section>
  )
}
