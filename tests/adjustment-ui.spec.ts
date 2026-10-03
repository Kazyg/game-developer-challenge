import { expect, test } from '@playwright/test'
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`instructions, options, HUD and pause at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(60000)
    await page.setViewportSize(viewport)
    await page.goto('/?seed=42')
    await page.getByRole('button', { name: 'How to Play', exact: true }).click()
    const help = page.getByLabel('Game instructions')
    for (const key of ['A','W','D','Q','E','R','Space']) {
      const icon = help.getByRole('img', { name: `${key} key`, exact: true })
      await expect(icon).toHaveCount(1)
      expect(await icon.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/adjusted-menu-${viewport.width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await page.getByLabel('Mute sound').check()
    await page.getByLabel('Sound volume').fill('35')
    await page.screenshot({ path: `test-results/adjusted-options-${viewport.width}.png` })
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.game-input-controls small')).toHaveCount(0)
    const button = page.getByRole('button', { name: 'Front Shot', exact: true })
    const normal = await button.evaluate(element => getComputedStyle(element).backgroundImage)
    await button.hover()
    expect(await button.evaluate(element => getComputedStyle(element).backgroundImage)).toBe(normal)
    await page.screenshot({ path: `test-results/adjusted-game-${viewport.width}.png` })
    await page.getByRole('button', { name: 'How to Play', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.screenshot({ path: `test-results/adjusted-help-${viewport.width}.png` })
    await page.getByRole('button', { name: 'Resume', exact: true }).click()
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    const title = await page.getByRole('heading', { name: 'Pause Menu' }).boundingBox()
    const panel = await page.getByRole('dialog').boundingBox()
    expect(title!.x + title!.width / 2).toBeCloseTo(panel!.x + panel!.width / 2, 0)
    await page.screenshot({ path: `test-results/adjusted-pause-${viewport.width}.png` })
    await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await expect(page.getByLabel('Mute sound')).toBeChecked()
    await expect(page.getByLabel('Sound volume')).toHaveValue('35')
  })
}

test('repeated pause/result returns, focus changes and exit during startup keep the main menu mounted', async ({ page }) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => name.includes('/src/game/Game.ts')) ?? '/src/game/Game.ts'
    const { Game } = await import(path)
    const original = Game.prototype.start
    Game.prototype.start = async function(host: HTMLElement) {
      await original.call(this, host)
      if (this.disposed) return
      host.dataset.ready = 'true'
      window.addEventListener('complete-adjustment-match', () => {
        if (this.disposed) return
        this.world.paused = false
        this.world.finish('timeExpired')
        this.tick()
      }, { once: true })
    }
  })
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    if (i === 0) {
      await page.getByRole('button', { name: 'Pause', exact: true }).click()
    } else {
      await expect(page.locator('.game-canvas')).toHaveAttribute('data-ready', 'true', { timeout: 15000 })
      await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    }
    if (i < 3) expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pirate-battle-confirmed-v1') ?? '[]'))).toHaveLength(0)
    if (i === 3) {
      await page.evaluate(() => window.dispatchEvent(new Event('complete-adjustment-match')))
      await expect(page).toHaveURL('/result')
      await expect(page.getByLabel('Player name (optional)')).toBeVisible()
    }
    await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
    await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')) })
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    await expect(page.locator('canvas, [inert], .game-modal-backdrop')).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test('world construction failure offers Retry/Main Menu instead of unmounting React', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.evaluate(async () => {
    const path = '/src/game/config/GameConfig.ts'
    const { GAME_CONFIG } = await import(path)
    GAME_CONFIG.worldWidth = 100
    window.addEventListener('restore-world-size', () => { GAME_CONFIG.worldWidth = 4000 }, { once: true })
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Unable to place islands')
  await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('restore-world-size')))
  expect(errors).toEqual([])
})
