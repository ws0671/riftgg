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
  const games = rank ? rank.wins + rank.losses : 0
  return (
    <section
      className="min-w-0 rounded-[12px] border border-border bg-surface p-[18px] max-[540px]:p-3"
      aria-label={title}
    >
      <h3 className="mb-4 text-[12px] font-medium text-content-muted">
        {title}
      </h3>
      {unavailable ? (
        <p className="text-[13px] text-content-muted">
          랭크 정보를 불러오지 못했습니다.
        </p>
      ) : rank ? (
        <>
          <div className="flex items-center gap-[11px] max-[540px]:flex-wrap">
            <div
              className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-surface-muted text-[20px] font-bold text-accent"
              aria-hidden="true"
            >
              {rank.tier[0]}
            </div>
            <div className="min-w-0">
              <p className="text-[16px] font-semibold [overflow-wrap:anywhere]">
                {tierNames[rank.tier] ?? rank.tier} {rank.division}
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
