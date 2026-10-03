import { expect, test } from '@playwright/test'
import { Camera } from '../src/game/camera/Camera'
import type { Page } from '@playwright/test'
const cases = [
  { width: 320, height: 568, mobile: true },
  { width: 430, height: 932, mobile: true },
  { width: 568, height: 320, mobile: true },
  { width: 480, height: 280, mobile: true },
  { width: 932, height: 430, mobile: true },
  { width: 1180, height: 540, mobile: true },
  { width: 1280, height: 900, mobile: false, touch: true },
  { width: 1280, height: 900, mobile: false },
]
async function scrollOwners(page: Page, selector: string) {
  return page.locator(selector).evaluate(root => [...root.querySelectorAll<HTMLElement>('*'), root as HTMLElement]
    .filter(node => ['auto', 'scroll'].includes(getComputedStyle(node).overflowY)).length)
}
for (const size of cases) {
  test(`framed scrolling, buttons, camera and controls ${size.width}x${size.height}${size.touch ? " touchscreen" : ""}`, async ({ browser }) => {
    test.setTimeout(90000)
    const context = await browser.newContext({ viewport: size, hasTouch: size.mobile || !!size.touch, isMobile: size.mobile })
    const page = await context.newPage()
    await page.goto('/?seed=42')
    await expect(page.locator('.menu-actions button')).toHaveCount(3)
    const styles = await page.locator('.menu-actions button').evaluateAll(buttons => buttons.map(button => {
      const style = getComputedStyle(button)
      return [style.backgroundImage, style.color, style.fontWeight, style.borderRadius]
    }))
    expect(styles).toHaveLength(3)
    expect(styles[1]).toEqual(styles[0]); expect(styles[2]).toEqual(styles[0])
    await page.screenshot({ path: `test-results/layout-menu-${size.width}.png` })
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    expect(await scrollOwners(page, '.screen-scroll')).toBe(1)
    const frame = await page.locator('.screen-scroll').boundingBox()
    const content = await page.locator('.screen-content').boundingBox()
    expect(content!.x - frame!.x).toBeGreaterThanOrEqual(24)
    expect(frame!.x + frame!.width - content!.x - content!.width).toBeGreaterThanOrEqual(24)
    await page.getByLabel('Sound volume').focus()
    await page.getByLabel('Sound volume').evaluate(element => element.scrollIntoView({ block: 'center' }))
    const slider = await page.getByLabel('Sound volume').boundingBox()
    expect(slider!.y).toBeGreaterThanOrEqual(content!.y)
    expect(slider!.y + slider!.height).toBeLessThanOrEqual(content!.y + content!.height)
    expect(await page.locator('.screen-scroll').boundingBox()).toEqual(frame)
    await page.screenshot({ path: `test-results/layout-options-${size.width}.png` })
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('button', { name: 'How to Play', exact: true }).click()
    expect(await scrollOwners(page, '.screen-scroll')).toBe(1)
    await page.locator('.screen-content').evaluate(element => { element.scrollTop = element.scrollHeight })
    const last = page.getByLabel('Game instructions').locator('p').last()
    await expect(last).toBeInViewport({ ratio: 1 })
    const lastBox = await last.boundingBox(), helpBox = await page.locator('.screen-content').boundingBox()
    expect(lastBox!.y + lastBox!.height).toBeLessThan(helpBox!.y + helpBox!.height)
    await page.screenshot({ path: `test-results/layout-help-${size.width}.png` })
    await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
    expect(await page.evaluate(() => getComputedStyle(document.body).overflowY)).not.toBe('hidden')
    await page.evaluate(async () => {
      const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => name.includes('/src/game/Game.ts')) ?? '/src/game/Game.ts'
      const { Game } = await import(path)
      const start = Game.prototype.start
      Game.prototype.start = async function(host: HTMLElement) {
        Object.assign(window, { uiGame: this })
        await start.call(this, host)
      }
    })
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.locator('canvas')).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('button', { name: 'Forward', exact: true })).toBeEnabled()
    const zoom = await page.evaluate(() => (window as unknown as { uiGame: { camera: { zoom: number } } }).uiGame.camera.zoom)
    expect(zoom).toBe(size.mobile ? 0.7 : 1)
    const rendered = await page.evaluate(() => {
      const game = (window as unknown as { uiGame: { camera: { zoom: number; position: {x: number; y: number} }; view: { container: { scale: {x: number}; position: {x: number; y: number} }; viewport: { width: number; height: number } } } }).uiGame
      return { scale: game.view.container.scale.x, x: game.view.container.position.x,
        cameraX: game.camera.position.x, width: game.view.viewport.width, height: game.view.viewport.height }
    })
    expect(rendered.scale).toBe(zoom)
    expect(rendered.x).toBeCloseTo(-rendered.cameraX * zoom)
    expect(rendered.width).toBeCloseTo(size.width / zoom)
    expect(rendered.height).toBeCloseTo(size.height / zoom)
    if (size.mobile) {
      if (size.width > size.height) await expect(page.getByLabel('Orientation suggestion', { exact: true })).toHaveCount(0)
      for (const button of await page.locator('.game-input-controls button, .game-hud-actions button').all()) {
        await expect(button).toBeInViewport({ ratio: 1 })
        const box = (await button.boundingBox())!
        expect(box.width).toBeGreaterThanOrEqual(44)
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
      const movement = page.getByRole('group', { name: 'Movement controls', exact: true })
      const attack = page.getByRole('group', { name: 'Attack controls', exact: true })
      const mb = await movement.boundingBox(), ab = await attack.boundingBox()
      expect(mb!.x + mb!.width).toBeLessThan(ab!.x)
      const forward = await page.getByRole('button', { name: 'Forward', exact: true }).boundingBox()
      const left = await page.getByRole('button', { name: 'Rotate Left', exact: true }).boundingBox()
      expect(forward!.y + forward!.height).toBeLessThan(left!.y)
      expect(forward!.width).toBeGreaterThanOrEqual(48)
      expect(await page.locator('.counter-label').first().isVisible()).toBe(false)
      const hud = await page.locator('.game-hud-info').boundingBox()
      expect(hud!.x + hud!.width / 2).toBeCloseTo(size.width / 2, 0)
    } else {
      expect(await page.locator('.counter-label').first().isVisible()).toBe(true)
    }
    await page.screenshot({ path: `test-results/layout-game-${size.width}.png` })
    await page.getByRole('button', { name: 'How to Play', exact: true }).click()
    expect(await scrollOwners(page, '.game-modal')).toBe(1)
    if (size.mobile) {
      const cdp = await context.newCDPSession(page)
      const area = (await page.locator('.screen-content').boundingBox())!
      await page.locator('.screen-content').evaluate(element => { element.scrollTop = 0 })
      const x = Math.round(area.x + area.width / 2), startY = Math.round(area.y + area.height * 0.8)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 9, x, y: startY }] })
      for (let delta = 10; delta <= Math.min(160, Math.floor(area.height / 2)); delta += 10) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 9, x, y: startY - delta }] })
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await expect.poll(() => page.locator('.screen-content').evaluate(element => element.scrollTop)).toBeGreaterThan(0)
      expect(await page.evaluate(() => scrollY)).toBe(0)
    }
    await page.locator('.screen-content').evaluate(element => { element.scrollTop = element.scrollHeight })
    await expect(page.getByLabel('Game instructions').locator('p').last()).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: `test-results/layout-modal-help-${size.width}.png` })
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeInViewport({ ratio: 1 })
    await page.getByRole('button', { name: 'Resume', exact: true }).click()
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    if (size.height <= 500) {
      for (const button of await page.locator('.pause-actions button').all()) await expect(button).toBeInViewport({ ratio: 1 })
    }
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    expect(await scrollOwners(page, '.game-modal')).toBe(1)
    await page.locator('.screen-content').evaluate(element => { element.scrollTop = element.scrollHeight })
    await page.screenshot({ path: `test-results/layout-game-options-${size.width}.png` })
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
    await context.close()
  })
}

test('scaled camera conversions round-trip and clamp every arena edge', () => {
  const camera = new Camera()
  camera.zoom = 0.7
  const width = 430 / camera.zoom, height = 932 / camera.zoom
  for (const position of [{ x: 0, y: 0 }, { x: 4000, y: 4000 }, { x: 2000, y: 2000 }]) {
    camera.follow(position, width, height, 4000, 4000)
    expect(camera.position.x).toBeGreaterThanOrEqual(0)
    expect(camera.position.y).toBeGreaterThanOrEqual(0)
    expect(camera.position.x + width).toBeLessThanOrEqual(4000)
    expect(camera.position.y + height).toBeLessThanOrEqual(4000)
    const point = { x: 123, y: 456 }
    const recovered = camera.worldToScreen(camera.screenToWorld(point))
    expect(recovered.x).toBeCloseTo(point.x, 8)
    expect(recovered.y).toBeCloseTo(point.y, 8)
  }
})
test('real three-finger touch moves, turns and fires; capture, release, cancel and orientation remain correct', async ({ browser }) => {
  test.setTimeout(90000)
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  await page.goto('/?seed=42')
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => name.includes('/src/game/Game.ts')) ?? '/src/game/Game.ts'
    const { Game } = await import(path)
    const start = Game.prototype.start
    Game.prototype.start = async function(host: HTMLElement) {
      Object.assign(window, { touchGame: this })
      await start.call(this, host)
      this.world.enemies = []
    }
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Forward', exact: true })).toBeEnabled()
  const buttons = [page.getByRole('button', { name: 'Forward', exact: true }), page.getByRole('button', { name: 'Rotate Left', exact: true }), page.getByRole('button', { name: 'Front Shot', exact: true })]
  const touchPoints = await Promise.all(buttons.map(async (button, id) => {
    const box = (await button.boundingBox())!
    return { id, x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }))
  const initial = await page.evaluate(() => {
    const game = (window as unknown as { touchGame: { world: { player: { position: {x: number; y: number}; rotation: number } } } }).touchGame
    return { ...game.world.player.position, rotation: game.world.player.rotation }
  })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints })
  for (const button of buttons) await expect(button).toHaveAttribute('data-active', 'true')
  await expect.poll(() => page.evaluate(() => {
    const game = (window as unknown as { touchGame: { world: { player: { position: {x: number; y: number}; rotation: number }; projectiles: unknown[] } } }).touchGame
    return { ...game.world.player.position, rotation: game.world.player.rotation, shots: game.world.projectiles.length }
  })).toMatchObject({ shots: 1 })
  const current = await page.evaluate(() => (window as unknown as { touchGame: { world: { player: { position: {x: number; y: number}; rotation: number } } } }).touchGame.world.player)
  expect(Math.hypot(current.position.x - initial.x, current.position.y - initial.y)).toBeGreaterThan(1)
  expect(current.rotation).not.toBe(initial.rotation)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoints.map(point => ({ ...point, y: point.y - 100 })) })
  for (const button of buttons) await expect(button).toHaveAttribute('data-active', 'true')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...touchPoints[1]!, y: touchPoints[1]!.y - 100 }] })
  await expect(buttons[1]!).toHaveAttribute('data-active', 'false')
  await expect(buttons[0]!).toHaveAttribute('data-active', 'true')
  await expect(buttons[2]!).toHaveAttribute('data-active', 'true')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  for (const button of buttons) await expect(button).toHaveAttribute('data-active', 'false')
  expect(await page.evaluate(() => scrollY)).toBe(0)
  await page.setViewportSize({ width: 932, height: 430 })
  await expect(page.locator('canvas')).toHaveJSProperty('clientWidth', 932)
  expect(await page.evaluate(() => (window as unknown as { touchGame: { camera: { zoom: number } } }).touchGame.camera.zoom)).toBe(0.7)
  await page.screenshot({ path: 'test-results/layout-orientation-touch.png' })
  await context.close()
})
