import { useState } from 'react'

function MatchIcon({ src, label }: { src: string | null; label: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <span
        className='grid size-full place-items-center text-[10px] leading-none text-content-muted'
        title={label}
      >
        {label}
      </span>
    )
  }
  return (
    <img
      className='size-full object-cover'
      src={src}
      alt={label}
      loading='lazy'
      onError={() => setFailed(true)}
    />
  )
}

export function ChampionIcon({ champion, assetVersion }: {
  champion: string
  assetVersion: string | null
}) {
  const name = champion === 'FiddleSticks' ? 'Fiddlesticks' : champion
  const src = assetVersion
    ? `https://ddragon.leagueoflegends.com/cdn/${assetVersion}/img/champion/${name}.png`
    : null
  return <MatchIcon key={src} src={src} label={name} />
}

export function MatchItems({ items, assetVersion, compact = false }: {
  items: number[]
  assetVersion: string | null
  compact?: boolean
}) {
  return (
    <div className='flex flex-wrap gap-1' aria-label='사용 아이템'>
      {items.map((item, slot) => {
        const src = assetVersion
          ? `https://ddragon.leagueoflegends.com/cdn/${assetVersion}/img/item/${item}.png`
          : null
        return (
          <div
            key={slot}
            className={`${
              compact ? 'size-5' : 'size-7'
            } shrink-0 overflow-hidden rounded-[5px] border border-border bg-surface-muted`}
          >
            {item > 0 && <MatchIcon key={src} src={src} label={String(item)} />}
          </div>
        )
      })}
    </div>
  )
}
