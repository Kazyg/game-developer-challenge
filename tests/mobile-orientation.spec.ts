import { expect, test } from '@playwright/test'
import type { Game } from '../src/game/Game'

declare global { interface Window { __pirateGameTest: ReturnType<Game['testController']> } }

test('dismissible suggestion, live rotation, retained world and paused rotation', async ({ browser }) => {
  test.setTimeout(90000)
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  await page.goto('/?seed=42&test')
  await page.evaluate(async () => {
    const path = '/src/game/Game.ts'
    const { Game } = await import(path)
    const start = Game.prototype.start
    Game.prototype.start = async function(host: HTMLElement) {
      await start.call(this, host)
      window.__pirateGameTest = this.testController()
    }
  })
  await page.getByRole('button', { name: 'Play', exact: true }).tap()
  const suggestion = page.getByLabel('Orientation suggestion', { exact: true })
  await expect(suggestion).toContainText('For a wider view, try rotating your phone.')
  await expect(page.getByRole('button', { name: 'Forward', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Dismiss orientation suggestion' }).tap()
  await expect(suggestion).toHaveCount(0)
  await page.evaluate(() => {
    Object.assign(window, { retainedWorld: window.__pirateGameTest.world, retainedPlayer: window.__pirateGameTest.world.player })
  })
  const cdp = await context.newCDPSession(page)
  const forward = page.getByRole('button', { name: 'Forward', exact: true })
  const box = (await forward.boundingBox())!
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 }] })
  await expect(forward).toHaveAttribute('data-active', 'true')
  const before = await page.evaluate(() => window.__pirateGameTest.observe())
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.locator('canvas')).toHaveJSProperty('clientWidth', 844)
  await expect(forward).toHaveAttribute('data-active', 'false')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('canvas')).toHaveJSProperty('clientWidth', 390)
  await expect(suggestion).toHaveCount(0)
  const after = await page.evaluate(() => window.__pirateGameTest.observe())
  expect(after.seed).toBe(before.seed)
  expect(after.time).toBeGreaterThanOrEqual(before.time)
  expect(after.paused).toBe(false)
  expect(await page.evaluate(() => {
    const saved = window as unknown as { retainedWorld: unknown; retainedPlayer: unknown }
    return saved.retainedWorld === window.__pirateGameTest.world && saved.retainedPlayer === window.__pirateGameTest.world.player
  })).toBe(true)
  await page.getByRole('button', { name: 'Pause', exact: true }).tap()
  const paused = await page.evaluate(() => window.__pirateGameTest.observe())
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.getByRole('dialog', { name: 'Pause Menu' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeInViewport({ ratio: 1 })
  expect((await page.evaluate(() => window.__pirateGameTest.observe())).time).toBe(paused.time)
  expect((await page.evaluate(() => window.__pirateGameTest.observe())).paused).toBe(true)
  await page.screenshot({ path: 'test-results/rotation-paused-landscape.png' })
  await page.getByRole('button', { name: 'Resume', exact: true }).tap()
  await page.getByRole('button', { name: 'How to Play', exact: true }).tap()
  await page.getByRole('button', { name: 'Resume', exact: true }).tap()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(suggestion).toHaveCount(0)
  await page.evaluate(() => window.__pirateGameTest.finish())
  await expect(page).toHaveURL(/\/result$/)
  await page.screenshot({ path: 'test-results/rotation-result-portrait.png' })
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.getByRole('button', { name: 'Main Menu', exact: true })).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: 'test-results/rotation-result-landscape.png' })
  await page.getByRole('button', { name: 'Play Again', exact: true }).tap()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(forward).toBeEnabled()
  await expect(suggestion).toHaveCount(0)
  await context.close()
})
