import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="border-t border-border pt-[23px] pb-[27px] mx-auto w-[min(calc(100%_-_64px),1040px)] max-[760px]:w-[calc(100%_-_40px)] max-[540px]:w-[calc(100%_-_32px)]">
      <div className="flex items-center justify-between gap-[15px] text-[11px] text-content-muted max-[540px]:flex-col max-[540px]:items-start max-[540px]:gap-[7px]">
        <Link to="/" className="text-[18px] font-[750] tracking-[-1.5px]">
          rift<span className="text-accent">.gg</span>
        </Link>
        <span>기록은 간결하게, 플레이는 더 선명하게.</span>
      </div>
      <p className="mt-[14px] max-w-[760px] text-[10px] leading-[1.8] text-content-muted">
        Rift.GG is not endorsed by Riot Games and does not reflect the views or
        opinions of Riot Games or anyone officially involved in producing or
        managing Riot Games properties. Riot Games and all associated properties
        are trademarks or registered trademarks of Riot Games, Inc.
      </p>
    </footer>
  )
}
