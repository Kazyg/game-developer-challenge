import { COMBAT_CONFIG } from '../src/game/config/CombatConfig'
import { test, expect } from '@playwright/test'

test('death opens results, Play Again creates a clean world, Main Menu cleans Pixi', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.evaluate(async () => {
    const gameModule = performance.getEntriesByType('resource').map(entry => entry.name).find(name => name.includes('/src/game/Game.ts')) ?? '/src/game/Game.ts'
    const combatModule = '/src/game/combat/CombatSystem.ts'
    const { Game } = await import(gameModule)
    const { damageShip, fireWeapon } = await import(combatModule)
    const original = Game.prototype.start
    let generation = 0
    Game.prototype.start = async function(host: HTMLElement) {
      const initial = { hp: this.world.player.hp, time: this.world.time,
        enemies: this.world.enemies.length, projectiles: this.world.projectiles.length,
        repair: { ...this.world.player.repair }, weapons: { ...this.world.player.weaponCooldowns } }
      await original.call(this, host)
      if (this.disposed) return
      host.dataset.generation = String(++generation)
      host.dataset.initial = JSON.stringify(initial)
      const kill = () => {
        fireWeapon(this.world, this.world.player, 'right')
        this.world.player.repair.cooldown = 20
        damageShip(this.world, this.world.player, 100)
        this.tick()
      }
      window.addEventListener('test-defeat', kill, { once: true })
    }
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('canvas')).toHaveCount(1)
  await expect(page.locator('.game-canvas')).toHaveAttribute('data-generation', '1')
  await page.evaluate(() => window.dispatchEvent(new Event('test-defeat')))
  await expect(page).toHaveURL(/\/result$/)
  await expect(page.getByRole('heading', { name: 'Game Over' })).toBeVisible()
  await expect(page.getByText('Score', { exact: true })).toBeVisible()
  await expect(page.getByText('Time Played', { exact: true })).toBeVisible()
  await expect(page.getByText('Player Destroyed', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Player name (optional)' })).toBeVisible()
  await page.getByRole('button', { name: 'Save Result' }).click()
  await expect(page.getByRole('button', { name: 'Save Result' })).toHaveCount(0)
  await expect(page.locator('canvas')).toHaveCount(0)
  await page.getByRole('button', { name: 'Play Again' }).click()
  await expect(page).toHaveURL(/\/game$/)
  await expect(page.locator('.game-canvas')).toHaveAttribute('data-generation', '2')
  const initial = JSON.parse((await page.locator('.game-canvas').getAttribute('data-initial'))!)
  expect(initial.hp).toBe(100)
  expect(initial.time).toBe(0)
  expect(initial.enemies).toBeGreaterThan(0)
  expect(initial.enemies).toBeLessThanOrEqual(COMBAT_CONFIG.spawn.maxPopulation)
  expect(initial.projectiles).toBe(0)
  expect(initial.weapons).toEqual({ front: 0, left: 0, right: 0 })
  expect(initial.repair.active).toBe(false)
  expect(initial.repair.cooldown).toBe(0)
  await page.evaluate(() => window.dispatchEvent(new Event('test-defeat')))
  await expect(page).toHaveURL(/\/result$/)
  await page.getByRole('button', { name: 'Main Menu' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)
  expect(errors).toEqual([])
})



