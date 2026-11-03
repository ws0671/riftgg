import { ArrowLeft, ArrowRight, Check, Copy, Search, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { parseRiotId, searchUrl } from './features/summoner-search/riotId'
import { SearchError, searchSummoner } from './features/summoner-search/api'
import type { SearchInput, SearchResponse } from '../supabase/functions/_shared/contracts'
import './App.css'

function SearchForm({ initialValue = '', large = false }: { initialValue?: string; large?: boolean }) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState('')
  const id = useId()
  const navigate = useNavigate()
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = parseRiotId(value)
    if (!parsed.success) { setError(parsed.message); return }
    setError(''); navigate(searchUrl(parsed.data))
  }
  return <form className={`search-form ${large ? 'search-form-large' : ''}`} onSubmit={submit} noValidate>
    <label className="sr-only" htmlFor={id}>Riot ID와 태그라인</label>
    <div className={`search-field ${error ? 'search-invalid' : ''}`}>
      <Search size={large ? 23 : 18} aria-hidden="true" />
      <input id={id} value={value} onChange={event => { setValue(event.target.value); setError('') }}
        onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault() }}
        placeholder="Riot ID #태그라인" autoComplete="off" spellCheck={false} maxLength={256}
        aria-invalid={Boolean(error)} aria-describedby={`${id}-help`} />
      <button type="submit" aria-label="소환사 검색"><span className="search-button-text">검색</span><ArrowRight size={20} aria-hidden="true" /></button>
    </div>
    <p className={error ? 'form-error' : 'input-help'} id={`${id}-help`} role={error ? 'alert' : undefined}>
      {error || (large ? '태그라인까지 입력해주세요. 예: Rift Player#KR1' : '')}
    </p>
  </form>
}

function HomePage() {
  return <main className="home page-width"><div className="home-content">
    <span className="eyebrow">YOUR NEXT GG</span><h1>나의 플레이,<br /><span>검색에서 시작하다.</span></h1>
    <p className="home-description">Riot ID로 소환사를 찾고, 나의 다음 플레이를 준비하세요.</p>
    <SearchForm large /><div className="home-meta"><span><span className="status-dot" />한국 서버 지원</span><span><ShieldCheck size={14} aria-hidden="true" />로그인 없이 검색</span></div>
  </div><div className="home-bottom"><span>LESS NOISE. MORE GAME.</span><span>기록은 간결하게, 플레이는 더 선명하게.</span></div></main>
}

function Skeleton() {
  return <div className="result-skeleton" role="status" aria-label="소환사 검색 중">
    <div className="skeleton-avatar skeleton" /><div className="skeleton-lines"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-subtitle" /></div><p>소환사 정보를 가져오고 있습니다.</p>
  </div>
}

function ErrorPanel({ error, retry }: { error: SearchError; retry?: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  const wait = Math.max(0, Math.ceil((error.retryAt - now) / 1000))
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const notFound = error.code === 'ACCOUNT_NOT_FOUND' || error.code === 'KR_PROFILE_NOT_FOUND'
  return <section className="error-panel" role="alert">
    <div className="error-icon">{notFound ? <Search size={25} aria-hidden="true" /> : <TriangleAlert size={25} aria-hidden="true" />}</div>
    <h2>{notFound ? '소환사를 찾지 못했어요.' : '잠시 확인이 필요해요.'}</h2><p>{error.message}</p>
    {wait > 0 && <p className="retry-wait">{wait}초 뒤 다시 시도할 수 있습니다.</p>}
    {retry && !notFound && <button className="button" disabled={wait > 0} onClick={retry}>다시 시도</button>}
    <Link className="text-link" to="/">검색 화면으로 돌아가기 <ArrowRight size={14} aria-hidden="true" /></Link>
  </section>
}

function Profile({ response }: { response: SearchResponse }) {
  const [imageFailed, setImageFailed] = useState(false)
  const data = response.data
  return <section className="profile-card" aria-label="소환사 검색 결과">
    <div className="profile-main"><div className="avatar">
      {data.profileIconUrl && !imageFailed ? <img src={data.profileIconUrl} alt={`${data.gameName} 프로필`} onError={() => setImageFailed(true)} /> : <span>{Array.from(data.gameName)[0]}</span>}
      <span className="level">{data.summonerLevel}</span>
    </div><div className="profile-identity"><span className="eyebrow">SUMMONER FOUND</span><h2>{data.gameName}<span>#{data.tagLine}</span></h2><p>KR 서버 · 소환사 레벨 {data.summonerLevel}</p></div><span className="found-badge"><Check size={14} aria-hidden="true" />검색 완료</span></div>
    <div className="profile-bottom"><span>마지막 조회 <time dateTime={response.meta.updatedAt}>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(response.meta.updatedAt))}</time></span><span>한국 · KR</span></div>
  </section>
}

function SummonerResult({ input }: { input: SearchInput }) {
  const [copied, setCopied] = useState(false)
  const [shareError, setShareError] = useState('')
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const query = useQuery({ queryKey: ['summoner', input.platform, input.gameName, input.tagLine],
    queryFn: ({ signal }) => searchSummoner(input, signal), staleTime: 60_000, retry: false, refetchOnWindowFocus: false })
  useEffect(() => {
    heading.current?.focus(); document.title = `${input.gameName}#${input.tagLine} · Rift.GG`
    return () => { document.title = 'Rift.GG · 소환사 검색' }
  }, [input.gameName, input.tagLine])
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current) }, [])
  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href); setCopied(true); setShareError('')
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2500)
    } catch { setShareError('주소창의 URL을 복사해 공유해주세요.') }
  }
  const error = query.error instanceof SearchError ? query.error : new SearchError('UNKNOWN', '정보를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.')
  return <main className="results page-width">
    <div className="results-top"><div><Link to="/" className="back-link"><ArrowLeft size={14} aria-hidden="true" />새로운 검색</Link><h1 ref={heading} tabIndex={-1}>소환사 검색</h1></div><SearchForm initialValue={`${input.gameName}#${input.tagLine}`} /></div>
    <div className="result-label"><span>SEARCH RESULT</span><button className="share-button" onClick={share}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? '복사 완료' : 'URL 공유'}</button></div>
    <div className="sr-only" aria-live="polite">{copied ? '검색 결과 주소를 복사했습니다.' : ''}</div>{shareError && <p className="input-help" role="status">{shareError}</p>}
    <div aria-busy={query.isFetching} aria-live="polite">{query.isPending ? <Skeleton /> : query.data ? <Profile key={query.data.data.puuid} response={query.data} /> : <ErrorPanel error={error} retry={() => { void query.refetch() }} />}</div>
    {query.data && <div className="result-note"><ShieldCheck size={16} aria-hidden="true" /><p>Riot ID와 태그라인으로 조회한 한국 서버의 소환사 정보입니다.</p></div>}
  </main>
}

function SummonerPage() {
  const [params] = useSearchParams()
  const parsed = parseRiotId(`${params.get('gameName') ?? ''}#${params.get('tagLine') ?? ''}`)
  if (!parsed.success) return <main className="page-width invalid-route"><ErrorPanel error={new SearchError('INVALID_RIOT_ID', parsed.message)} /></main>
  return <SummonerResult key={`${parsed.data.gameName}#${parsed.data.tagLine}`} input={parsed.data} />
}

function App() {
  return <div className="app-shell"><header className="header"><div className="header-inner page-width"><Link to="/" className="brand" aria-label="Rift.GG 홈">rift<span>.gg</span></Link><span className="game-label">LEAGUE OF LEGENDS</span><span className="region"><span className="status-dot" />KR · 한국</span></div></header>
    <Routes><Route path="/" element={<HomePage />} /><Route path="/summoners/kr" element={<SummonerPage />} /><Route path="*" element={<main className="page-width invalid-route"><ErrorPanel error={new SearchError('NOT_FOUND', '페이지 주소를 확인해주세요. 현재 한국 서버 검색을 지원합니다.')} /></main>} /></Routes>
    <footer className="footer page-width"><div><Link to="/" className="brand">rift<span>.gg</span></Link><span>기록은 간결하게, 플레이는 더 선명하게.</span></div><p>Rift.GG is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.</p></footer>
  </div>
}
export default App
