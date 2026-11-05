import { ShieldCheck } from 'lucide-react'
import SummonerSearchForm from '../features/summoner-search/components/SummonerSearchForm'

export default function HomePage() {
  return (
    <main className="flex min-h-[650px] flex-1 flex-col max-[540px]:min-h-[580px] mx-auto w-[min(calc(100%_-_64px),1040px)] max-[760px]:w-[calc(100%_-_40px)] max-[540px]:w-[calc(100%_-_32px)]">
      <div className="m-auto w-full max-w-[660px] pt-[90px] pb-[100px] max-[760px]:py-[75px]">
        <span className="block text-[10px] font-semibold tracking-[2.7px] text-accent">
          YOUR NEXT GG
        </span>
        <h1 className="mt-[23px] mb-[21px] text-[clamp(38px,5.5vw,62px)] leading-[1.26] font-[650] tracking-[-2.8px] max-[540px]:text-[39px] max-[540px]:tracking-[-2px]">
          나의 플레이,
          <br />
          <span className="text-content-muted">검색에서 시작하다.</span>
        </h1>
        <p className="mb-[35px] text-[14px] text-content-muted max-[540px]:max-w-[265px] max-[540px]:text-[13px]">
          Riot ID로 소환사를 찾고, 나의 다음 플레이를 준비하세요.
        </p>
        <SummonerSearchForm large />
        <div className="mt-[23px] flex flex-wrap gap-[22px] text-[11px] text-content-muted max-[540px]:gap-[17px] max-[540px]:text-[10px]">
          <span className="flex items-center gap-2">
            <span className="inline-block size-[5px] rounded-full bg-accent" />
            한국 서버 지원
          </span>
          <span className="flex items-center gap-2">
            <ShieldCheck size={14} aria-hidden="true" />
            로그인 없이 검색
          </span>
        </div>
      </div>
      <div className="flex justify-between pb-[25px] text-[10px] text-content-muted max-[760px]:gap-[15px]">
        <span className="tracking-[2px]">LESS NOISE. MORE GAME.</span>
        <span className="max-[760px]:hidden">
          기록은 간결하게, 플레이는 더 선명하게.
        </span>
      </div>
    </main>
  )
}
