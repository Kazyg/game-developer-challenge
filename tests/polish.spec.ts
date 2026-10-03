import { test, expect } from '@playwright/test'
import { FixedStep } from '../src/game/FixedStep'
import { World } from '../src/game/world/World'
import { createEnemy } from '../src/game/entities/Enemy'
import { moveShip } from '../src/game/movement/ShipMovement'

const idle = { up: false, down: false, left: false, right: false }
test('slow frames retain active time and catch up with identical fixed-step simulation', () => {
  const fast = new World(42, { combatEnabled: false })
  const slow = new World(42, { combatEnabled: false })
  const clock = new FixedStep()
  for (let i = 0; i < 60; i++) fast.update({ ...idle, up: true }, 1 / 60)
  clock.advance(1, dt => slow.update({ ...idle, up: true }, dt))
  expect(slow.time).toBeCloseTo(0.2)
  for (let i = 0; i < 4; i++) clock.advance(0, dt => slow.update({ ...idle, up: true }, dt))
  expect(slow.time).toBeCloseTo(1)
  expect(slow.player.position).toEqual(fast.player.position)
})

test('enemy displacement follows current hull while turning toward desired heading', () => {
  const world = new World(42)
  const enemy = createEnemy('test', 'chaser', world.patrolAreas[0]!, { x: 1000, y: 1000 }, 42)
  moveShip(enemy, { x: 1, y: 0 }, 100, 0.1, () => true)
  expect(enemy.rotation).toBeCloseTo(Math.PI / 15)
  expect(enemy.position.x - 1000).toBeCloseTo(Math.sin(enemy.rotation) * 10)
  expect(enemy.position.y - 1000).toBeCloseTo(-Math.cos(enemy.rotation) * 10)
})

test('asset failure offers Retry and successful retry creates one canvas', async ({ page }) => {
  let fail = true
  await page.context().route('**/assets/png/default/ships/ship_1.png*', route => fail && route.request().resourceType() !== 'script' ? route.abort() : route.continue())
  await page.goto('/game?seed=42')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)
  fail = false
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.locator('canvas')).toHaveCount(1)
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('dialog traps focus, changes content focus and restores opener', async ({ page }) => {
  await page.goto('/game?seed=42')
  await expect(page.getByRole('status')).toHaveCount(0)
  const help = page.getByRole('button', { name: 'How to Play' })
  await help.click()
  const resume = page.getByRole('button', { name: 'Resume', exact: true })
  const content = page.getByRole('dialog').getByLabel('How to Play content')
  await expect(content).toBeFocused()
  await page.keyboard.press('Shift+Tab'); await expect(resume).toBeFocused()
  await page.keyboard.press('Tab'); await expect(content).toBeFocused()
  await resume.click(); await expect(help).toBeFocused()
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.getByRole('button', { name: 'Options', exact: true }).click()
  expect(await page.getByRole('dialog').evaluate(dialog => dialog.contains(document.activeElement))).toBe(true)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeFocused()
})

test('pointer actions support simultaneous movement/fire and clear on cancel, pause and blur', async ({ page }) => {
  await page.goto('/')
  const state = await page.evaluate(async () => {
    const path = '/src/game/input/InputManager.ts'
    const { InputManager } = await import(path)
    const input = new InputManager()
    input.setPointer(1, 'KeyW', true); input.setPointer(2, 'Space', true)
    const simultaneous = input.read()
    input.setPointer(2, 'Space', false)
    const cancelled = input.read()
    input.setEnabled(false); input.setPointer(3, 'KeyD', true)
    const paused = input.read()
    input.setEnabled(true); input.setPointer(4, 'KeyW', true)
    window.dispatchEvent(new Event('blur'))
    const blurred = input.read()
    input.destroy()
    return { simultaneous, cancelled, paused, blurred }
  })
  expect(state.simultaneous.up).toBe(true)
  expect(state.simultaneous.actions.front).toBe(true)
  expect(state.cancelled).toEqual({ ...idle, up: true })
  expect(state.paused).toEqual(idle); expect(state.blurred).toEqual(idle)
})

test('unavailable storage and malformed settings do not prevent startup', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked') } })
    Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('blocked') } })
  })
  await page.goto('/game?seed=42')
  await expect(page.locator('canvas')).toHaveCount(1)
  await expect(page.getByRole('status')).toHaveCount(0)
})

for (const status of ['Pending', 'Failed', 'Saved', 'Saving'] as const) {
  test(`completed result restores ${status} without the pending queue`, async ({ page }) => {
    await page.goto('/')
    await page.evaluate(status => {
      localStorage.setItem('pirate-battle-lastCompletedMatch-v1', JSON.stringify({ status, seed: 42,
        error: status === 'Failed' ? 'Registration unavailable' : undefined,
        match: { matchId: 'completed-fixture', playerId: 'captain', playerName: 'Captain',
          date: '2026-10-02T12:00:00Z', score: 17, effectiveDuration: 76,
          endReason: 'playerDestroyed', gameConfig: { gameSessionTime: 120, enemySpawnTime: 5 } } }))
      localStorage.removeItem('pirate-battle-pending-v1')
    }, status)
    await page.goto('/result')
    await expect(page.getByRole('status')).toHaveText('Saved')
    await expect(page.getByText('17', { exact: true })).toBeVisible()
    await expect(page.getByText('76s', { exact: true })).toBeVisible()
    await expect(page.getByText('Player Destroyed', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('status')).toHaveText('Saved')
    await expect(page.getByRole('button', { name: 'Retry Registration' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible()
  })
}

test('mobile controls move and fire together, cancel clears inputs and layouts fit safe areas', async ({ browser }) => {
  test.setTimeout(90000)
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 844, height: 390 } })
  const page = await context.newPage()
  await page.goto('/?seed=42')
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(e => e.name).find(name => name.includes('/src/game/Game.ts')) ?? '/src/game/Game.ts'
    const { Game } = await import(path)
    const original = Game.prototype.start
    const output = document.createElement('output'); output.id = 'touch-read'; output.hidden = true; document.body.append(output)
    Game.prototype.start = async function(host: HTMLElement) {
      await original.call(this, host)
      if (this.disposed) return
      window.addEventListener('touch-read', () => { if (!this.disposed) output.textContent = JSON.stringify({ position: this.world.player.position, rotation: this.world.player.rotation, projectiles: this.world.projectiles.length }) })
    }
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('canvas')).toHaveCount(1)
  await expect(page.getByRole('status')).toHaveCount(0)
  const read = async () => { await page.evaluate(() => window.dispatchEvent(new Event('touch-read'))); return JSON.parse((await page.locator('#touch-read').textContent())!) }
  const before = await read()
  const forward = (await page.getByRole('button', { name: 'Forward', exact: true }).boundingBox())!
  const fire = (await page.getByRole('button', { name: 'Right Broadside', exact: true }).boundingBox())!
  const rotate = (await page.getByRole('button', { name: 'Rotate Left', exact: true }).boundingBox())!
  const session = await context.newCDPSession(page)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
    { x: forward.x + forward.width / 2, y: forward.y + forward.height / 2, id: 1 },
    { x: fire.x + fire.width / 2, y: fire.y + fire.height / 2, id: 2 },
    { x: rotate.x + rotate.width / 2, y: rotate.y + rotate.height / 2, id: 3 },
  ] })
  await expect.poll(async () => (await read()).projectiles).toBeGreaterThan(0)
  await expect.poll(async () => (await read()).position.y).toBeLessThan(before.position.y)
  await expect.poll(async () => (await read()).rotation).toBeLessThan(before.rotation)
  await expect(page.getByRole('button', { name: 'Right Broadside', exact: true }).locator('.command-cooldown')).toBeVisible()
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  const cancelled = await read()
  await page.waitForTimeout(120)
  expect((await read()).position).toEqual(cancelled.position)
  await page.screenshot({ path: 'test-results/mobile-landscape-polish.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByLabel('Orientation suggestion', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Orientation suggestion', { exact: true })).toContainText('For a wider view, try rotating your phone.')
  await page.getByRole('button', { name: 'Dismiss orientation suggestion' }).click()
  await expect(page.getByLabel('Orientation suggestion', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Forward', exact: true })).toBeEnabled()
  const controls = await page.locator('.game-input-controls').boundingBox()
  expect(controls!.x + controls!.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'test-results/mobile-portrait-polish.png' })
  await context.close()
})

test('malformed storage uses defaults and preserves startup', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('pirate-battle-duration', 'broken')
    localStorage.setItem('pirate-battle-spawn-time', '{')
    localStorage.setItem('pirate-battle-lastCompletedMatch-v1', '{')
    localStorage.setItem('pirate-battle-player-v1', '{')
    sessionStorage.setItem('pirate-battle-seed', 'broken')
  })
  await page.goto('/game')
  await expect(page.locator('canvas')).toHaveCount(1)
  await expect(page.getByRole('status')).toHaveCount(0)
})
