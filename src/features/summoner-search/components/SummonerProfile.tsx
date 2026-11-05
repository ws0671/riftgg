import { Check } from 'lucide-react'
import { useState } from 'react'
import type { SearchResponse } from '../../../../supabase/functions/_shared/contracts'

export default function SummonerProfile({
  response,
}: {
  response: SearchResponse
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const data = response.data
  return (
    <section
      className="overflow-hidden rounded-[12px] border border-border bg-surface"
      aria-label="소환사 검색 결과"
    >
      <div className="flex flex-wrap items-center gap-[23px] p-6 max-[760px]:p-[20px] max-[540px]:gap-4 max-[540px]:px-[18px] max-[540px]:py-[26px]">
        <div className="relative grid size-20 shrink-0 place-items-center rounded-[18px] bg-surface-muted text-[34px] font-[650] text-accent max-[540px]:size-[62px] max-[540px]:rounded-[14px]">
          {data.profileIconUrl && !imageFailed ? (
            <img
              className="size-full rounded-[inherit] object-cover"
              src={data.profileIconUrl}
              alt={`${data.gameName} 프로필`}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span>{Array.from(data.gameName)[0]}</span>
          )}
          <span className="absolute -bottom-2 rounded-[4px] px-[9px] py-px text-[10px] font-semibold bg-content text-background">
            {data.summonerLevel}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <span className="block text-[9px] font-semibold tracking-[2.7px] text-accent">
            SUMMONER FOUND
          </span>
          <h2 className="my-[6px] text-[27px] font-[650] tracking-[-0.8px] [overflow-wrap:anywhere] max-[540px]:text-[22px]">
            {data.gameName}
            <span className="ml-2 text-[20px] font-normal text-content-muted max-[540px]:text-[16px]">
              #{data.tagLine}
            </span>
          </h2>
          <p className="text-[12px] text-content-muted">
            KR 서버 · 소환사 레벨 {data.summonerLevel}
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-[6px] text-[11px] whitespace-nowrap text-accent max-[760px]:hidden">
          <Check size={14} aria-hidden="true" />
          검색 완료
        </span>
      </div>
      <div className="flex flex-wrap justify-between gap-[15px] border-t border-border px-9 py-[15px] text-[11px] text-content-muted max-[540px]:px-[18px] max-[540px]:text-[10px]">
        <span>
          마지막 조회{' '}
          <time dateTime={response.meta.updatedAt}>
            {new Intl.DateTimeFormat('ko-KR', {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(response.meta.updatedAt))}
          </time>
        </span>
        <span>한국 · KR</span>
      </div>
    </section>
  )
}
