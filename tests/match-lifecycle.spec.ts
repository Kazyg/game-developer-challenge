import { test, expect } from '@playwright/test'

test('pause/help/focus freeze gameplay, resume clears input, seed and restart lifecycle', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => name.includes('/src/game/Game.ts')) ?? '/src/game/Game.ts'
    const { Game } = await import(path)
    const original = Game.prototype.start
    const active: { game?: typeof Game.prototype } = {}
    let generation = 0
    let initialTime = 0
    const output = document.createElement('output')
    output.id = 'match-readout'; output.hidden = true; document.body.append(output)
    Game.prototype.start = async function(host: HTMLElement) {
      generation++
      initialTime = this.world.time
      await original.call(this, host)
      if (!this.disposed) active.game = this
    }
    window.addEventListener('match-read', () => {
      if (!active.game) return
      output.textContent = JSON.stringify({ seed: active.game.world.seed, paused: active.game.world.paused,
        generation, initialTime,
        duration: active.game.world.duration, spawnTime: active.game.world.spawner.spawnTime, time: active.game.world.time, score: active.game.world.score,
        position: active.game.world.player.position, repair: active.game.world.player.repair,
        cooldowns: active.game.world.player.weaponCooldowns, projectiles: active.game.world.projectiles,
        enemies: active.game.world.enemies.map(enemy => ({ id: enemy.id, position: enemy.position,
          rotation: enemy.rotation, hp: enemy.hp, state: enemy.state })), debug: active.game.testController().observe().debug })
    })
    window.addEventListener('match-expire', () => { if (active.game) active.game.world.time = active.game.world.duration - 0.001 })
    window.addEventListener('match-hidden', () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('canvas')).toHaveCount(1)
  const read = async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('match-read')))
    return JSON.parse((await page.locator('#match-readout').textContent()) || 'null')
  }
  await expect.poll(async () => (await read())?.seed).toBeTruthy()
  const seed = (await read()).seed
  await page.keyboard.down('KeyW')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Pause Menu' })).toBeVisible()
  const frozen = await read()
  await page.keyboard.down('Space')
  await page.waitForTimeout(150)
  expect(await read()).toEqual(frozen)
  const debug = (await read()).debug
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await page.waitForTimeout(100)
  const resumed = await read()
  expect(resumed.position).toEqual(frozen.position)
  expect(resumed.projectiles).toHaveLength(0)
  expect(resumed.time).toBeGreaterThan(frozen.time)
  await page.keyboard.up('KeyW'); await page.keyboard.up('Space')
  await page.getByRole('button', { name: 'How to Play' }).click()
  await expect(page.getByRole('dialog', { name: 'How to Play' })).toBeVisible()
  const help = await read()
  await page.waitForTimeout(100)
  expect(await read()).toEqual(help)
  expect(help.debug).toBe(debug)
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.getByRole('dialog', { name: 'Pause Menu' })).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  expect((await read()).paused).toBe(true)
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await page.evaluate(() => window.dispatchEvent(new Event('match-hidden')))
  await expect(page.getByRole('dialog', { name: 'Pause Menu' })).toBeVisible()
  expect((await read()).paused).toBe(true)
  await page.getByRole('button', { name: 'Options', exact: true }).click()
  await page.getByRole('slider', { name: 'Game Session Time: 120s' }).fill('180')
  expect((await read()).duration).toBe(120)
  await page.getByRole('spinbutton', { name: 'Enemy Spawn Time in seconds' }).fill('9')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  expect((await read()).spawnTime).toBe(5)
  const previousGeneration = (await read()).generation
  await page.getByRole('button', { name: 'Restart Match' }).click()
  await expect.poll(async () => (await read()).generation).toBeGreaterThan(previousGeneration)
  expect((await read()).initialTime).toBe(0)
  expect((await read()).seed).toBe(seed)
  expect((await read()).duration).toBe(120)
  await page.evaluate(() => window.dispatchEvent(new Event('match-expire')))
  await expect(page).toHaveURL(/\/result$/)
  await expect(page.getByText('Time Expired', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Play Again' }).click()
  await expect(page.locator('canvas')).toHaveCount(1)
  await expect.poll(async () => (await read()).seed).not.toBe(seed)
  const again = (await read()).seed
  expect((await read()).duration).toBe(180)
  expect((await read()).spawnTime).toBe(9)
  await page.reload()
  await expect(page.locator('.game-screen')).toHaveAttribute('data-seed', String(again))
  await expect(page.getByRole('status')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.game-screen')).not.toHaveAttribute('data-seed', String(again))
  expect(errors).toEqual([])
})




