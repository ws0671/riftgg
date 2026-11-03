// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App'

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
function mount(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><App /></QueryClientProvider></MemoryRouter>)
}
function apiSetup() {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://api.test'); vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'public-key')
}
const payload = { data: { puuid: '123', platform: 'kr', gameName: '한 글', tagLine: 'TAG', profileIconId: 1, summonerLevel: 42, profileIconUrl: null }, meta: { source: 'riot', updatedAt: '2026-11-03T00:00:00Z', expiresAt: '2026-11-03T00:05:00Z', requestId: 'test' } }
describe('search UI', () => {
  it('validates missing tagline before calling the server', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); mount()
    await userEvent.type(screen.getByRole('textbox'), 'Name')
    await userEvent.click(screen.getByRole('button', { name: '소환사 검색' }))
    expect(screen.getByRole('alert')).toHaveTextContent('#태그라인'); expect(fetcher).not.toHaveBeenCalled()
  })
  it('does not submit while composing Korean text', () => {
    mount(); const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '한 글#TAG' } })
    expect(fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229 })).toBe(false)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('나의 플레이')
  })
  it('supports Enter search and displays an accessible loading state', async () => {
    apiSetup(); vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))); mount()
    await userEvent.type(screen.getByRole('textbox'), '한 글#TAG{Enter}')
    expect(await screen.findByRole('status', { name: '소환사 검색 중' })).toBeInTheDocument()
  })
  it('loads a shared URL directly and renders the returned profile', async () => {
    apiSetup(); const fetcher = vi.fn().mockResolvedValue(Response.json(payload)); vi.stubGlobal('fetch', fetcher)
    mount('/summoners/kr?gameName=%ED%95%9C+%EA%B8%80&tagLine=TAG')
    expect(await screen.findByRole('region', { name: '소환사 검색 결과' })).toHaveTextContent('한 글#TAG')
    expect(screen.getByText('KR 서버 · 소환사 레벨 42')).toBeInTheDocument()
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ platform: 'kr', gameName: '한 글', tagLine: 'TAG' })
  })
  it('shows account not found and keeps the input available', async () => {
    apiSetup(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { code: 'ACCOUNT_NOT_FOUND' } }, { status: 404 })))
    mount('/summoners/kr?gameName=Missing&tagLine=TAG')
    expect(await screen.findByRole('alert')).toHaveTextContent('소환사를 찾지 못했어요')
    expect(screen.getByRole('textbox')).toHaveValue('Missing#TAG')
  })
  it('validates malformed shared URLs without a request', () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); mount('/summoners/kr?gameName=Name')
    expect(screen.getByRole('alert')).toHaveTextContent('#태그라인'); expect(fetcher).not.toHaveBeenCalled()
  })
})
