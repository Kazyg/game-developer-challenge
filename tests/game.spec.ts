import { expect, test } from '@playwright/test'
import type { IslandShape } from '../src/game/world/IslandShapes'
import type { InputState } from '../src/game/input/InputManager'

test('game fills viewport, preserves its canvas on resize, and cleans up on navigation', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/game?seed=42')
  await expect(page.locator('canvas')).toHaveCount(1)
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.locator('.game-screen')).toHaveAttribute('data-seed', '42')
  expect(await page.locator('canvas').boundingBox()).toMatchObject({ x: 0, y: 0, width: 1280, height: 720 })
  const beforeMovement = await page.locator('canvas').screenshot()
  await page.locator('canvas').evaluate((canvas) => canvas.setAttribute('data-original', 'yes'))
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(300)
  await page.keyboard.up('KeyW')
  const afterMovement = await page.locator('canvas').screenshot()
  expect(afterMovement.equals(beforeMovement)).toBe(false)
  await page.screenshot({ path: 'test-results/pirate-battle-wide.png' })
  await page.setViewportSize({ width: 800, height: 600 })
  await expect(page.locator('canvas')).toHaveAttribute('data-original', 'yes')
  await expect.poll(async () => (await page.locator('canvas').boundingBox())?.width).toBe(800)
  await expect(page.locator('.game-screen')).toHaveAttribute('data-seed', '42')
  await page.mouse.wheel(0, 800)
  expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY,
    overflow: document.documentElement.scrollHeight > innerHeight }))).toEqual({ x: 0, y: 0, overflow: false })
  await page.screenshot({ path: 'test-results/pirate-battle.png' })
  for (let round = 0; round < 3; round++) {
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
    await expect(page.locator('canvas')).toHaveCount(0)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.locator('canvas')).toHaveCount(1)
    await expect(page.getByRole('status')).toHaveCount(0)
  }
  await page.goBack()
  await expect(page.locator('canvas')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('all island textures are a single connected land mass and collider debug follows shores', async ({ page }) => {
  await page.goto('/')
  const results = await page.evaluate(async () => {
    const gameModule = '/src/game/Game.ts'
    const shapeModule = '/src/game/world/IslandShapes.ts'
    const { Game } = await import(gameModule)
    const { ISLAND_SHAPES, transformOutline } = await import(shapeModule)
    const game = new Game(42, true)
    const fixtures = ISLAND_SHAPES.map((shape: IslandShape, index: number) => {
      const position = { x: 1500 + index * 250, y: 1850 + (index % 2) * 250 }
      const size = 210
      const rotation = index * 0.55
      return { id: `preview-${index}`, position, size, variant: index, rotation,
        boundingRadius: shape.boundingRadius * size,
        colliders: [{ type: 'polygon', vertices: transformOutline(shape.outline, position, size, rotation) }] }
    })
    game.world.islands.splice(0, game.world.islands.length, ...fixtures)
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:10'
    document.body.append(host)
    await game.start(host)
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const results = fixtures.map((_: unknown, index: number) => {
      const sprite = game.view.container.children[index + 1]
      const { pixels, width, height } = game.app.renderer.extract.pixels(sprite.texture) as {
        pixels: Uint8ClampedArray; width: number; height: number
      }
      const land = new Uint8Array(width * height)
      let total = 0
      let start = -1
      for (let i = 0; i < land.length; i++) {
        if (pixels[i * 4 + 3]! >= 128) { land[i] = 1; total++; start = i }
      }
      // Flood fill ensures there are no detached pieces or gaps splitting an island.
      const queue = [start]
      land[start] = 0
      let connected = 0
      for (let head = 0; head < queue.length; head++) {
        const point = queue[head]!
        connected++
        for (const next of [point - width, point + width,
          point % width > 0 ? point - 1 : -1,
          point % width < width - 1 ? point + 1 : -1]) {
          if (next >= 0 && next < land.length && land[next]) { land[next] = 0; queue.push(next) }
        }
      }
      return { total, connected, centerAlpha: pixels[(Math.floor(height / 2) * width + Math.floor(width / 2)) * 4 + 3],
        cornerAlpha: pixels[3] }
    })
    window.addEventListener('test-preview-cleanup', () => { game.destroy(); host.remove() }, { once: true })
    return results
  })
  for (const result of results) {
    expect(result.total).toBeGreaterThan(10000)
    expect(result.connected).toBe(result.total)
    expect(result.centerAlpha).toBe(255)
    expect(result.cornerAlpha).toBe(0)
  }
  await page.screenshot({ path: 'test-results/island-variants-debug.png' })
  await page.evaluate(() => window.dispatchEvent(new Event('test-preview-cleanup')))
  await expect(page.locator('canvas')).toHaveCount(0)
})

test('keyboard reads W/A/D, clears on blur, and removes listeners', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const modulePath = '/src/game/input/InputManager.ts'
    const { InputManager } = await import(modulePath)
    const input = new InputManager()
    const marker = document.createElement('output')
    marker.id = 'test-input'
    document.body.append(marker)
    window.addEventListener('test-input-read', () => { marker.textContent = JSON.stringify(input.read()) })
    window.addEventListener('test-input-destroy', () => input.destroy(), { once: true })
  })
  const read = async (): Promise<InputState> => {
    await page.evaluate(() => window.dispatchEvent(new Event('test-input-read')))
    return JSON.parse((await page.locator('#test-input').textContent())!) as InputState
  }
  for (const [key, field] of [['KeyW', 'up'], ['KeyA', 'left'], ['KeyD', 'right']] as const) {
    await page.keyboard.down(key)
    expect((await read())[field]).toBe(true)
    await page.keyboard.up(key)
    expect((await read())[field]).toBe(false)
  }
  await page.keyboard.down('KeyW')
  await page.keyboard.down('KeyD')
  expect(await read()).toEqual({ up: true, down: false, left: false, right: true })
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  expect(await read()).toEqual({ up: false, down: false, left: false, right: false })
  await page.keyboard.up('KeyW')
  await page.keyboard.up('KeyD')
  await page.evaluate(() => window.dispatchEvent(new Event('test-input-destroy')))
  await page.keyboard.down('KeyS')
  expect((await read()).down).toBe(false)
  await page.keyboard.up('KeyS')
})



