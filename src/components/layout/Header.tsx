import { Link } from 'react-router-dom'

export default function Header() {
  return (
    <header className="border-b border-border">
      <div className="flex min-h-[80px] items-center gap-[30px] max-[540px]:min-h-[68px] mx-auto w-[min(calc(100%_-_64px),1040px)] max-[760px]:w-[calc(100%_-_40px)] max-[540px]:w-[calc(100%_-_32px)]">
        <Link
          to="/"
          className="text-[26px] font-[750] tracking-[-1.5px] max-[540px]:text-[24px]"
          aria-label="Rift.GG 홈"
        >
          rift<span className="text-accent">.gg</span>
        </Link>
        <span className="text-[10px] tracking-[1.2px] text-content-muted max-[540px]:hidden">
          LEAGUE OF LEGENDS
        </span>
        <span className="ml-auto flex items-center gap-[9px] text-[12px] text-content-muted">
          <span className="inline-block size-[5px] rounded-full bg-accent" />
          KR · 한국
        </span>
      </div>
    </header>
  )
}
