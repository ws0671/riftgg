import { ArrowRight, Search } from 'lucide-react'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseRiotId, searchUrl } from '../riotId'

export default function SummonerSearchForm({
  initialValue = '',
  large = false,
  className = '',
}: {
  initialValue?: string
  large?: boolean
  className?: string
}) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState('')
  const id = useId()
  const navigate = useNavigate()
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = parseRiotId(value)
    if (!parsed.success) {
      setError(parsed.message)
      return
    }
    setError('')
    navigate(searchUrl(parsed.data))
  }
  return (
    <form className={className} onSubmit={submit} noValidate>
      <label className="sr-only" htmlFor={id}>
        Riot ID와 태그라인
      </label>
      <div
        className={`flex items-center border bg-surface-muted text-content-muted focus-within:border-accent focus-within:shadow-[0_0_0_2px_#8b9aff19] ${error ? 'border-danger' : 'border-border'} ${large ? 'gap-[17px] rounded-[11px] p-[10px] pl-[22px] max-[540px]:gap-[10px] max-[540px]:pl-[15px]' : 'gap-3 rounded-[9px] px-[10px] py-2 pl-[17px]'}`}
      >
        <Search size={large ? 23 : 18} aria-hidden="true" />
        <input
          className={`min-w-0 w-full flex-1 border-0 bg-transparent px-0 py-[5px] text-content outline-none placeholder:text-content-muted max-[540px]:text-[16px] ${large ? 'text-[16px]' : 'text-[14px]'}`}
          id={id}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setError('')
          }}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              (event.nativeEvent.isComposing || event.keyCode === 229)
            )
              event.preventDefault()
          }}
          placeholder="Riot ID #태그라인"
          autoComplete="off"
          spellCheck={false}
          maxLength={256}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-help`}
        />
        <button
          className={`flex items-center justify-center gap-3 rounded-[6px] border-0 bg-accent text-accent-foreground ${large ? 'px-5 py-[14px] max-[540px]:p-[13px]' : 'p-[10px]'}`}
          type="submit"
          aria-label="소환사 검색"
        >
          <span
            className={
              large
                ? 'inline text-[13px] font-semibold max-[540px]:hidden'
                : 'hidden'
            }
          >
            검색
          </span>
          <ArrowRight size={20} aria-hidden="true" />
        </button>
      </div>
      <p
        className={`mt-[9px] min-h-5 text-[12px] ${error ? 'text-danger' : 'text-content-muted'}`}
        id={`${id}-help`}
        role={error ? 'alert' : undefined}
      >
        {error ||
          (large ? '태그라인까지 입력해주세요. 예: Rift Player#KR1' : '')}
      </p>
    </form>
  )
}
