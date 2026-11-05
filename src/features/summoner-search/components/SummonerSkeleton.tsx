export default function SummonerSkeleton() {
  return (
    <div
      role="status"
      aria-label="소환사 검색 중"
      className="grid grid-cols-[222px_minmax(0,1fr)] gap-6 max-[760px]:grid-cols-[190px_minmax(0,1fr)] max-[540px]:grid-cols-1"
    >
      <div
        className="grid content-start gap-[14px] max-[540px]:grid-cols-2"
        aria-hidden="true"
      >
        {[0, 1].map((index) => (
          <div
            key={index}
            className="animate-skeleton h-[170px] rounded-[12px] border border-border bg-surface-muted motion-reduce:animate-none"
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-[23px] rounded-[12px] border border-border bg-surface p-9 max-[540px]:gap-4 max-[540px]:px-[18px] max-[540px]:py-[25px]">
        <div className="size-20 rounded-[18px] max-[540px]:size-[62px] animate-skeleton bg-surface-muted motion-reduce:animate-none" />
        <div className="flex-1">
          <div className="animate-skeleton bg-surface-muted motion-reduce:animate-none h-7 w-[min(70%,250px)] rounded-[5px]" />
          <div className="animate-skeleton bg-surface-muted motion-reduce:animate-none mt-[15px] h-3 w-[min(55%,160px)] rounded-[3px]" />
        </div>
        <p className="w-full text-[12px] text-content-muted">
          소환사 정보를 가져오고 있습니다.
        </p>
      </div>
    </div>
  )
}
