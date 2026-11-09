import { test, expect } from '@playwright/test'

function result(name: string, tag = 'KR1') {
  return {
    data: {
      platform: 'kr',
      puuid: name,
      gameName: name,
      tagLine: tag,
      profileIconId: 1,
      summonerLevel: 284,
      profileIconUrl: null,
      ranks: {
        status: 'ready',
        solo: { tier: 'DIAMOND', division: 'IV', lp: 64, wins: 87, losses: 71 },
        flex: null,
        updatedAt: '2026-11-03T00:00:00Z',
        expiresAt: '2026-11-03T00:05:00Z',
      },
    },
    meta: {
      source: 'riot',
      updatedAt: '2026-11-03T00:00:00Z',
      expiresAt: '2026-11-03T00:05:00Z',
      refreshAllowedAt: '2026-11-03T00:00:00Z',
      warningCodes: [],
      requestId: 'fixture',
    },
  }
}
test.beforeEach(async ({ page }) => {
  await page.route('**/functions/v1/summoner-matches', (route) =>
    route.fulfill({ json: { matches: [], nextCursor: null, assetVersion: null } }),
  )
})

test('searches, shows loading, shares URL and restores it after reload', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.route('**/functions/v1/summoner-search', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400))
    const input = route.request().postDataJSON()
    await route.fulfill({ json: result(input.gameName, input.tagLine) })
  })
  await page.goto('/')
  await page.screenshot({
    path: 'output/screenshots/search-home.png',
    fullPage: true,
  })
  await page.getByRole('textbox').fill('한 글#ABC')
  await page.getByRole('textbox').press('Enter')
  await expect(
    page.getByRole('status', { name: '소환사 검색 중' }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: '소환사 검색 결과' }),
  ).toContainText('한 글#ABC')
  await page.screenshot({
    path: 'output/screenshots/search-result.png',
    fullPage: true,
  })
  expect(new URL(page.url()).searchParams.get('gameName')).toBe('한 글')
  await page.getByRole('button', { name: 'URL 공유' }).click()
  await expect(page.getByRole('button', { name: '복사 완료' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    page.url(),
  )
  await page.reload()
  await expect(
    page.getByRole('region', { name: '소환사 검색 결과' }),
  ).toContainText('한 글#ABC')
  await page.getByRole('link', { name: '새로운 검색' }).click()
  await expect(page).toHaveURL('/')
  await page.goBack()
  await expect(
    page.getByRole('region', { name: '소환사 검색 결과' }),
  ).toBeVisible()
})
test('handles not found and rate limiting with retry cooldown', async ({
  page,
}) => {
  await page.route('**/functions/v1/summoner-search', async (route) => {
    const input = route.request().postDataJSON()
    await route.fulfill({
      status: input.gameName === 'Missing' ? 404 : 429,
      json: {
        error: {
          code:
            input.gameName === 'Missing'
              ? 'ACCOUNT_NOT_FOUND'
              : 'RIOT_RATE_LIMITED',
          retryAfterSeconds: 30,
        },
      },
    })
  })
  await page.goto('/summoners/kr?gameName=Missing&tagLine=KR1')
  await expect(page.getByRole('alert')).toContainText('소환사를 찾지 못했어요')
  await page.getByRole('textbox').fill('Limited#KR1')
  await page.getByRole('button', { name: '소환사 검색' }).click()
  await expect(page.getByRole('alert')).toContainText('조회 한도')
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeDisabled()
})
test('does not let a slow previous search replace the current account', async ({
  page,
}) => {
  let release: () => void = () => {}
  const slow = new Promise<void>((resolve) => {
    release = resolve
  })
  let firstSeen: () => void = () => {}
  const seen = new Promise<void>((resolve) => {
    firstSeen = resolve
  })
  await page.route('**/functions/v1/summoner-search', async (route) => {
    const input = route.request().postDataJSON()
    if (input.gameName === 'Slow') {
      firstSeen()
      await slow
    }
    await route.fulfill({ json: result(input.gameName) }).catch(() => {})
  })
  await page.goto('/summoners/kr?gameName=Slow&tagLine=KR1')
  await seen
  await page.getByRole('textbox').fill('Fast#KR1')
  await page.getByRole('textbox').press('Enter')
  await expect(
    page.getByRole('region', { name: '소환사 검색 결과' }),
  ).toContainText('Fast#KR1')
  release()
  await expect(
    page.getByRole('region', { name: '소환사 검색 결과' }),
  ).toContainText('Fast#KR1')
})
test('keeps a long profile and search form within a 320px viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 820 })
  await page.route('**/functions/v1/summoner-search', (route) =>
    route.fulfill({ json: result('아주긴소환사이름테스트'.repeat(3)) }),
  )
  await page.goto('/')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.getByRole('textbox').fill('테스트#KR1')
  await page.getByRole('textbox').press('Enter')
  await expect(
    page.getByRole('region', { name: '소환사 검색 결과' }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: 'output/screenshots/search-mobile.png',
    fullPage: true,
  })
})

test('shows solo/flex rank and refreshes without blanking the profile', async ({
  page,
}) => {
  let refreshes = 0
  await page.route('**/functions/v1/summoner-search', async (route) => {
    const input = route.request().postDataJSON()
    const payload = result(input.gameName, input.tagLine)
    if (input.forceRefresh) {
      refreshes++
      await new Promise((resolve) => setTimeout(resolve, 400))
      payload.data.ranks.solo.lp = 65
      payload.meta.refreshAllowedAt = new Date(
        Date.now() + 60_000,
      ).toISOString()
    }
    await route.fulfill({ json: payload })
  })
  await page.goto('/summoners/kr?gameName=Player&tagLine=KR1')
  await expect(page.getByRole('region', { name: '솔로 랭크' })).toContainText(
    '다이아몬드 IV',
  )
  const emblem = page.getByRole('region', { name: '솔로 랭크' }).locator('img')
  await expect(emblem).toHaveAttribute('src', '/rank-emblems/diamond.png')
  await expect.poll(() => emblem.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect(page.getByRole('region', { name: '솔로 랭크' })).toContainText(
    '승률 55%',
  )
  await expect(page.getByRole('region', { name: '자유 랭크' })).toContainText(
    '언랭크',
  )
  await page.getByRole('button', { name: '정보 갱신' }).click()
  await expect(
    page.getByRole('region', { name: '소환사 검색 결과' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '정보 갱신' })).toBeDisabled()
  await expect(page.getByRole('region', { name: '솔로 랭크' })).toContainText(
    '65 LP',
  )
  await expect(page.getByRole('button', { name: '정보 갱신' })).toContainText(
    '초',
  )
  expect(refreshes).toBe(1)
})

test('keeps prior results when manual refresh fails and respects Retry-After', async ({
  page,
}) => {
  await page.route('**/functions/v1/summoner-search', async (route) => {
    const input = route.request().postDataJSON()
    if (input.forceRefresh)
      await route.fulfill({
        status: 429,
        json: { error: { code: 'REFRESH_COOLDOWN', retryAfterSeconds: 60 } },
      })
    else await route.fulfill({ json: result(input.gameName, input.tagLine) })
  })
  await page.goto('/summoners/kr?gameName=Player&tagLine=KR1')
  await expect(
    page.getByRole('region', { name: '소환사 검색 결과' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '정보 갱신' }).click()
  await expect(page.getByText(/갱신 실패:/)).toBeVisible()
  await expect(
    page.getByRole('region', { name: '소환사 검색 결과' }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: '솔로 랭크' })).toContainText(
    '64 LP',
  )
  await expect(page.getByRole('button', { name: '정보 갱신' })).toBeDisabled()
})

test('distinguishes unavailable ranks from unranked and preserves the profile', async ({
  page,
}) => {
  await page.route('**/functions/v1/summoner-search', async (route) => {
    const input = route.request().postDataJSON()
    const payload = result(input.gameName, input.tagLine)
    await route.fulfill({
      json: {
        ...payload,
        data: {
          ...payload.data,
          ranks: {
            status: 'unavailable',
            solo: null,
            flex: null,
            updatedAt: null,
            expiresAt: null,
          },
        },
        meta: { ...payload.meta, warningCodes: ['RANK_UNAVAILABLE'] },
      },
    })
  })
  await page.goto('/summoners/kr?gameName=Player&tagLine=KR1')
  await expect(
    page.getByRole('region', { name: '소환사 검색 결과' }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: '솔로 랭크' })).toContainText(
    '불러오지 못했습니다',
  )
  await expect(page.getByText('언랭크', { exact: true })).toHaveCount(0)
})

test('replaces canonical URL without re-fetching even for stale partial data', async ({
  page,
}) => {
  let calls = 0
  await page.route('**/functions/v1/summoner-search', async (route) => {
    calls++
    const payload = result('Canonical Player', 'TAG')
    await route.fulfill({
      json: {
        ...payload,
        meta: {
          ...payload.meta,
          source: 'stale',
          warningCodes: ['PROFILE_STALE'],
        },
      },
    })
  })
  await page.goto('/summoners/kr?gameName=canonical+player&tagLine=tag')
  await expect(page.getByRole('textbox')).toHaveValue('Canonical Player#TAG')
  await expect(
    page.getByRole('region', { name: '소환사 검색 결과' }),
  ).toContainText('Canonical Player#TAG')
  expect(new URL(page.url()).searchParams.get('gameName')).toBe(
    'Canonical Player',
  )
  await page.waitForLoadState('networkidle')
  expect(calls).toBe(1)
  await expect(page.getByText(/이전 정보를 표시합니다/)).toBeVisible()
})

test('loads ten recent matches and appends the next page after a retry', async ({ page }) => {
  let attempts = 0
  const cursor = { offset: 10, endTime: 1760000000 }
  await page.route('**/functions/v1/summoner-search', (route) =>
    route.fulfill({ json: result('Player') }),
  )
  await page.route('**/functions/v1/summoner-matches', async (route) => {
    const input = route.request().postDataJSON()
    expect(input.puuid).toBe('Player')
    if (input.cursor) {
      expect(input.cursor).toEqual(cursor)
      if (++attempts === 1) {
        await route.fulfill({ status: 503, json: { error: { code: 'UPSTREAM_UNAVAILABLE' } } })
        return
      }
    }
    await route.fulfill({
      json: {
        assetVersion: null,
        nextCursor: input.cursor ? null : cursor,
        matches: Array.from({ length: 10 }, (_, index) => ({
          id: `KR_${(input.cursor?.offset ?? 0) + index + 1}`,
          champion: 'Ahri',
          championId: 103,
          queueId: 420,
          mode: 'CLASSIC',
          win: true,
          kills: 8,
          deaths: 3,
          assists: 11,
          cs: 180,
          items: [1056, 3020, 0, 0, 0, 0, 3340],
          duration: 1500,
          endedAt: 1760000000000,
        })),
      },
    })
  })
  await page.setViewportSize({ width: 320, height: 750 })
  await page.goto('/summoners/kr?gameName=Player&tagLine=KR1')
  const history = page.getByRole('region', { name: '최근 경기' })
  const cards = history.getByRole('listitem')
  await expect(cards).toHaveCount(10)
  await expect(cards.first()).toContainText('180 CS · 분당 7.2')
  await expect(cards.first()).toContainText('1056')
  await history.getByRole('button', { name: '더 보기' }).click()
  await expect(
    history.getByText('경기 기록을 불러오지 못했습니다.', { exact: false }),
  ).toBeVisible()
  await expect(cards).toHaveCount(10)
  await expect(page.getByRole('region', { name: '소환사 검색 결과' })).toBeVisible()
  await history.getByRole('button', { name: '다시 시도' }).click()
  await expect(cards).toHaveCount(20)
  await expect(history.getByRole('button', { name: '더 보기' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
})

test('opens one match detail on demand and reuses it when reopened', async ({ page }) => {
  const requests: string[] = []
  const match = {
    champion: 'Ahri', championId: 103, queueId: 420, mode: 'CLASSIC', win: true,
    kills: 8, deaths: 3, assists: 11, cs: 180, items: [1056, 0, 0, 0, 0, 0, 3340],
    duration: 1500, endedAt: 1760000000000,
  }
  await page.route('**/functions/v1/summoner-search', (route) =>
    route.fulfill({ json: result('Player') }),
  )
  await page.route('**/functions/v1/summoner-matches', (route) => {
    const { matchId } = route.request().postDataJSON()
    if (!matchId) {
      return route.fulfill({
        json: {
          matches: [{ ...match, id: 'KR_1' }, { ...match, id: 'KR_2' }],
          assetVersion: null, nextCursor: null,
        },
      })
    }
    requests.push(matchId)
    return route.fulfill({
      json: {
        teams: [
          {
            id: 100, win: true, kills: 8,
            players: [{ ...match, name: `Player#${matchId}`, isSearchedPlayer: true, damage: 25123, gold: 13100 }],
          },
          {
            id: 200, win: false, kills: 3,
            players: [{ ...match, name: 'Opponent#KR1', isSearchedPlayer: false, damage: 10000, gold: 12000 }],
          },
        ],
      },
    })
  })
  await page.setViewportSize({ width: 320, height: 750 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/summoners/kr?gameName=Player&tagLine=KR1')
  const cards = page.getByRole('region', { name: '최근 경기' }).getByRole('listitem')
  await expect(cards).toHaveCount(2)
  expect(requests).toEqual([])
  const first = cards.first()
  const second = cards.nth(1)
  await first.getByRole('button', { name: '상세 보기' }).click()
  await expect(first.getByText('Player#KR_1')).toBeVisible()
  await expect(first.getByText('조회한 소환사')).toBeVisible()
  await expect(first.getByText('블루팀')).toBeVisible()
  await expect(first.getByText('레드팀')).toBeVisible()
  await expect(first.getByText('25,123')).toBeHidden()
  await first.getByRole('button', { name: '피해량·골드' }).click()
  await expect(first.getByText('25,123')).toBeVisible()
  await expect(first.getByText('13,100')).toBeVisible()
  expect(await first.getByRole('region', { name: '상세 닫기' }).evaluate((panel) =>
    getComputedStyle(panel).transitionDuration,
  )).toBe('0s')
  await second.getByRole('button', { name: '상세 보기' }).click()
  await expect(first.getByRole('button', { name: '상세 보기' })).toHaveAttribute('aria-expanded', 'false')
  await expect(second.getByText('Player#KR_2')).toBeVisible()
  await first.getByRole('button', { name: '상세 보기' }).click()
  await expect(first.getByText('Player#KR_1')).toBeVisible()
  expect(requests).toEqual(['KR_1', 'KR_2'])
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(first.getByText('25,123')).toBeVisible()
  await expect(first.getByText('180 CS', { exact: true }).first()).toBeVisible()
  await expect(first.getByRole('button', { name: '피해량·골드' })).toBeHidden()
})
