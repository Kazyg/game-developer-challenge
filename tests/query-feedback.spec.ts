import { test, expect } from '@playwright/test'

for (const panel of ['ranking', 'history'] as const) test(`${panel} keeps rows after failed refresh and disables repeated Retry during fetching`, async ({ page }) => {
  await page.goto('/?network=1')
  await expect(page.getByRole('tabpanel').filter({ visible: true }).getByText('Anne', { exact: true })).toBeVisible()
  if (panel === 'history') {
    await page.evaluate(async () => {
      const path = '/src/testing/api.ts'
      const { enqueuePending } = await import(path)
      const player = JSON.parse(localStorage.getItem('pirate-battle-player-v1')!)
      enqueuePending({ matchId: 'history-feedback', ...player, date: '2026-10-03T12:00:00Z', score: 9,
        effectiveDuration: 60, endReason: 'timeExpired', gameConfig: { gameSessionTime: 120, enemySpawnTime: 5 } })
    })
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pirate-battle-confirmed-v1') ?? '[]').length)).toBe(1)
    await page.getByRole('tab', { name: 'Match History' }).click()
  }
  const visible = page.getByRole('tabpanel').filter({ visible: true })
  const rows = visible.locator('tbody tr')
  await expect(rows).toHaveCount(panel === 'ranking' ? 5 : 1)
  const before = await rows.allTextContents()
  await page.evaluate(async panel => {
    const path = '/src/testing/api.ts'
    const { setScenario, queryClient } = await import(path)
    setScenario(`${panel}-failure`, { latency: 0 })
    await queryClient.invalidateQueries({ queryKey: [panel] })
  }, panel)
  await expect(visible.getByRole('alert')).toBeVisible()
  expect(await rows.allTextContents()).toEqual(before)
  await page.evaluate(async () => { const path = '/src/testing/api.ts'; (await import(path)).setScenario('slow', { latency: 800 }) })
  await visible.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(visible.getByRole('button', { name: 'Retry', exact: true })).toBeDisabled()
  await expect(visible.getByRole('status')).toHaveText('Refreshing…')
  await expect(visible.getByRole('alert')).toHaveCount(0)
  expect(await rows.allTextContents()).toEqual(before)
})

for (const width of [1280, 390]) test(`instructions omit on-screen credits at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'How to Play', exact: true }).click()
  await expect(page.getByLabel('Game instructions')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Control icons by Icons8' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Credits', exact: true })).toHaveCount(0)
})
