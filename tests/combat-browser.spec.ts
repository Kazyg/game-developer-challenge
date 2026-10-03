import { COMBAT_CONFIG } from '../src/game/config/CombatConfig'
import { test, expect } from '@playwright/test'
import type { CircleCollider, Vector2 } from '../src/game/entities/Island'
import type { WeaponCooldowns } from '../src/game/entities/Combat'

interface Snapshot {
  debug: boolean
  instructions: number
  hp: number
  repairActive: boolean
  repairCooldown: number
  position: Vector2
  weapons: WeaponCooldowns
  playerProjectiles: string[]
  projectileColliders: CircleCollider[]
  enemies: number
}

test('real bindings fire while moving, Repair cancels and destruction cleans the canvas', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.evaluate(async () => {
    const gameModule = '/src/game/Game.ts'
    const enemyModule = '/src/game/entities/Enemy.ts'
    const { Game } = await import(gameModule)
    const { createEnemy } = await import(enemyModule)
    const game = new Game(42, false)
    game.world.player.hp = 50
    const area = game.world.patrolAreas[0]
    game.world.enemies.push(createEnemy('test-shooter', 'shooter', area, { x: 2000, y: 2380 }, 42),
      createEnemy('test-chaser', 'chaser', area, { x: 2350, y: 2000 }, 43))
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;inset:0;z-index:10'
    document.body.append(host)
    await game.start(host)
    const control = game.testController()
    control.stopClock()
    const output = document.createElement('output')
    output.id = 'combat-snapshot'
    output.hidden = true
    document.body.append(output)
    const snapshot = () => {
      output.textContent = JSON.stringify({ debug: control.observe().debug,
        instructions: control.observe().debugInstructions,
        hp: game.world.player.hp, repairActive: game.world.player.repair.active,
        repairCooldown: game.world.player.repair.cooldown,
        position: game.world.player.position, weapons: game.world.player.weaponCooldowns,
        playerProjectiles: game.world.projectiles.filter((p: { team: string }) => p.team === 'player').map((p: { id: string }) => p.id),
        projectileColliders: game.world.projectiles.map((p: { collider: CircleCollider }) => p.collider),
        enemies: game.world.enemies.length,
      })
    }
    const step = () => {
      control.advance(0.1)
      snapshot()
    }
    const debug = () => control.toggleDebug()
    window.addEventListener('combat-toggle-debug', debug)
    window.addEventListener('combat-step', step)
    window.addEventListener('combat-read', snapshot)
    window.addEventListener('combat-destroy', () => {
      game.destroy()
      window.removeEventListener('combat-step', step)
      window.removeEventListener('combat-toggle-debug', debug)
      host.remove()
      window.removeEventListener('combat-read', snapshot)
    }, { once: true })
    snapshot()
  })
  const read = async (): Promise<Snapshot> => {
    await page.evaluate(() => window.dispatchEvent(new Event('combat-read')))
    return JSON.parse((await page.locator('#combat-snapshot').textContent())!) as Snapshot
  }
  const step = () => page.evaluate(() => window.dispatchEvent(new Event('combat-step')))
  expect((await read()).debug).toBe(false)
  await page.evaluate(() => window.dispatchEvent(new Event('combat-toggle-debug')))
  expect((await read()).debug).toBe(true)
  expect((await read()).instructions).toBeGreaterThan(0)
  for (const key of ['KeyW', 'Space', 'KeyQ', 'KeyE']) await page.keyboard.down(key)
  await step()
  for (const key of ['KeyW', 'Space', 'KeyQ', 'KeyE']) await page.keyboard.up(key)
  const fired = await read()
  expect(fired.position.y).toBeLessThan(2000)
  expect(fired.playerProjectiles).toHaveLength(7)
  expect(new Set(fired.playerProjectiles).size).toBe(7)
  expect(fired.projectileColliders.length).toBeGreaterThanOrEqual(7)
  expect(fired.enemies).toBeGreaterThanOrEqual(2)
  expect(fired.weapons.front).toBeCloseTo(COMBAT_CONFIG.player.frontCooldown - 5 / 60)
  expect(fired.weapons.left).toBeCloseTo(COMBAT_CONFIG.player.sideCooldown - 5 / 60)
  expect(fired.weapons.right).toBeCloseTo(COMBAT_CONFIG.player.sideCooldown - 5 / 60)
  await page.screenshot({ path: 'test-results/combat-debug.png' })
  await page.keyboard.press('KeyR')
  await step()
  expect((await read()).repairActive).toBe(true)
  expect((await read()).hp).toBeCloseTo(51)
  await page.keyboard.down('KeyD')
  await step()
  await page.keyboard.up('KeyD')
  expect((await read()).repairActive).toBe(false)
  expect((await read()).repairCooldown).toBeCloseTo(30 - 5 / 60)
  await page.evaluate(() => window.dispatchEvent(new Event('combat-toggle-debug')))
  expect((await read()).debug).toBe(false)
  await page.evaluate(() => window.dispatchEvent(new Event('combat-destroy')))
  await expect(page.locator('canvas')).toHaveCount(0)
  expect(errors).toEqual([])
})
