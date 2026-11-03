import { test, expect } from '@playwright/test'

function result(name: string, tag = 'KR1') {
  return { data: { platform: 'kr', puuid: name, gameName: name, tagLine: tag, profileIconId: 1, summonerLevel: 284, profileIconUrl: null }, meta: { source: 'riot', updatedAt: '2026-11-03T00:00:00Z', expiresAt: '2026-11-03T00:05:00Z', requestId: 'fixture' } }
}
test('searches, shows loading, shares URL and restores it after reload', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.route('https://search-test.invalid/**', async route => {
    await new Promise(resolve => setTimeout(resolve, 400))
    const input = route.request().postDataJSON()
    await route.fulfill({ json: result(input.gameName, input.tagLine) })
  })
  await page.goto('/')
  await page.screenshot({ path: 'output/screenshots/search-home.png', fullPage: true })
  await page.getByRole('textbox').fill('한 글#ABC')
  await page.getByRole('textbox').press('Enter')
  await expect(page.getByRole('status', { name: '소환사 검색 중' })).toBeVisible()
  await expect(page.getByRole('region', { name: '소환사 검색 결과' })).toContainText('한 글#ABC')
  await page.screenshot({ path: 'output/screenshots/search-result.png', fullPage: true })
  expect(new URL(page.url()).searchParams.get('gameName')).toBe('한 글')
  await page.getByRole('button', { name: 'URL 공유' }).click()
  await expect(page.getByRole('button', { name: '복사 완료' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url())
  await page.reload()
  await expect(page.getByRole('region', { name: '소환사 검색 결과' })).toContainText('한 글#ABC')
  await page.getByRole('link', { name: '새로운 검색' }).click()
  await expect(page).toHaveURL('/')
  await page.goBack()
  await expect(page.getByRole('region', { name: '소환사 검색 결과' })).toBeVisible()
})
test('handles not found and rate limiting with retry cooldown', async ({ page }) => {
  await page.route('https://search-test.invalid/**', async route => {
    const input = route.request().postDataJSON()
    await route.fulfill({ status: input.gameName === 'Missing' ? 404 : 429, json: { error: { code: input.gameName === 'Missing' ? 'ACCOUNT_NOT_FOUND' : 'RIOT_RATE_LIMITED', retryAfterSeconds: 30 } } })
  })
  await page.goto('/summoners/kr?gameName=Missing&tagLine=KR1')
  await expect(page.getByRole('alert')).toContainText('소환사를 찾지 못했어요')
  await page.getByRole('textbox').fill('Limited#KR1')
  await page.getByRole('button', { name: '소환사 검색' }).click()
  await expect(page.getByRole('alert')).toContainText('조회 한도')
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeDisabled()
})
test('does not let a slow previous search replace the current account', async ({ page }) => {
  let release: () => void = () => {}
  const slow = new Promise<void>(resolve => { release = resolve })
  let firstSeen: () => void = () => {}
  const seen = new Promise<void>(resolve => { firstSeen = resolve })
  await page.route('https://search-test.invalid/**', async route => {
    const input = route.request().postDataJSON()
    if (input.gameName === 'Slow') { firstSeen(); await slow }
    await route.fulfill({ json: result(input.gameName) }).catch(() => {})
  })
  await page.goto('/summoners/kr?gameName=Slow&tagLine=KR1'); await seen
  await page.getByRole('textbox').fill('Fast#KR1'); await page.getByRole('textbox').press('Enter')
  await expect(page.getByRole('region', { name: '소환사 검색 결과' })).toContainText('Fast#KR1')
  release()
  await expect(page.getByRole('region', { name: '소환사 검색 결과' })).toContainText('Fast#KR1')
})
test('keeps a long profile and search form within a 320px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 })
  await page.route('https://search-test.invalid/**', route => route.fulfill({ json: result('아주긴소환사이름테스트'.repeat(3)) }))
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('textbox').fill('테스트#KR1'); await page.getByRole('textbox').press('Enter')
  await expect(page.getByRole('region', { name: '소환사 검색 결과' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'output/screenshots/search-mobile.png', fullPage: true })
})
