import { Shield } from 'lucide-react'
import { useState } from 'react'
import type { Rank } from '../../../../supabase/functions/_shared/contracts'

const tierNames: Record<string, string> = {
  IRON: '아이언',
  BRONZE: '브론즈',
  SILVER: '실버',
  GOLD: '골드',
  PLATINUM: '플래티넘',
  EMERALD: '에메랄드',
  DIAMOND: '다이아몬드',
  MASTER: '마스터',
  GRANDMASTER: '그랜드마스터',
  CHALLENGER: '챌린저',
}

export default function RankCard({
  title,
  rank,
  unavailable,
  updatedAt,
}: {
  title: string
  rank: Rank | null
  unavailable: boolean
  updatedAt: string | null
}) {
  const [failedEmblem, setFailedEmblem] = useState<string>()
  const tier = rank?.tier.toUpperCase()
  const knownTier = tier && Object.hasOwn(tierNames, tier) ? tier : undefined
  const emblem = knownTier && `${import.meta.env.BASE_URL}rank-emblems/${knownTier.toLowerCase()}.png`
  const games = rank ? rank.wins + rank.losses : 0
  return (
    <section
      className="min-w-0 rounded-[12px] border border-border bg-surface p-[18px] max-[540px]:p-3"
      aria-label={title}
    >
      <h3 className="mb-3 text-[12px] font-semibold text-content-muted">
        {title}
      </h3>
      {unavailable ? (
        <p className="text-[13px] text-content-muted">
          랭크 정보를 불러오지 못했습니다.
        </p>
      ) : rank ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="grid size-16 shrink-0 place-items-center rounded-[12px] bg-surface-muted text-content-muted max-[540px]:size-12"
              aria-hidden="true"
            >
              {emblem && failedEmblem !== emblem ? (
                <img
                  src={emblem}
                  alt=""
                  width={64}
                  height={64}
                  className="size-full object-contain"
                  onError={() => setFailedEmblem(emblem)}
                />
              ) : (
                <Shield size={24} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[16px] font-semibold [overflow-wrap:anywhere]">
                {knownTier ? tierNames[knownTier] : rank.tier} {rank.division}
              </p>
              <p className="text-[12px] text-content-muted">{rank.lp} LP</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap justify-between gap-1 border-t border-border pt-3 text-[11px] text-content-muted">
            <span>
              {rank.wins}승 {rank.losses}패
            </span>
            <strong className="font-semibold text-content">
              승률 {games ? `${Math.round((rank.wins / games) * 100)}%` : '-'}
            </strong>
          </div>
        </>
      ) : (
        <div>
          <p className="text-[16px] font-semibold">언랭크</p>
          <p className="mt-1 text-[11px] text-content-muted">
            이번 시즌 랭크 기록이 없습니다.
          </p>
        </div>
      )}
      {updatedAt && (
        <p className="mt-3 text-[10px] text-content-muted">
          갱신{' '}
          <time dateTime={updatedAt}>
            {new Intl.DateTimeFormat('ko-KR', {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(updatedAt))}
          </time>
        </p>
      )}
    </section>
  )
}
