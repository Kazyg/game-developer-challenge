import { COMBAT_CONFIG } from '../src/game/config/CombatConfig'
import { test, expect } from '@playwright/test'
import { getPlayerColliders } from '../src/game/entities/Player'

test('hull cache follows in-place movement, rotation and alternate poses', () => {
  const ship = { position: { x: 100, y: 100 }, rotation: 0 }
  const original = getPlayerColliders(ship)
  expect(getPlayerColliders(ship)).toBe(original)
  ship.position.x += 20
  const moved = getPlayerColliders(ship)
  expect(moved[0]!.position.x).toBe(original[0]!.position.x + 20)
  ship.rotation = Math.PI / 2
  const rotated = getPlayerColliders(ship)
  expect(rotated).not.toEqual(moved)
  getPlayerColliders(ship, { x: 800, y: 800 }, 0)
  expect(getPlayerColliders(ship)).toBe(rotated)
})

test('offscreen ships skip graphics, reappear without losing sprites and continue simulation', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { Game } = await import('/src/game/Game.ts')
    const { updateEnemies } = await import('/src/game/ai/EnemySystem.ts')
    const game = new Game(42)
    const host = document.createElement('div')
    host.style.cssText = 'width:800px;height:600px'
    document.body.append(host)
    await game.start(host)
    const control = game.testController()
    control.stopClock()
    const enemy = game.world.enemies[0]
    const initialSprites = control.observe().combat.ships
    const before = { ...enemy.position }
    updateEnemies(game.world, 1 / 60)
    const simulated = enemy.position.x !== before.x || enemy.position.y !== before.y
    enemy.position = { x: 2100, y: 2000 }
    control.render()
    const sprite = control.observe().combat.shipDisplays.find((display: {id: string}) => display.id === enemy.id)
    const visible = sprite.visible && control.observe().damage.find((display: {id: string}) => display.id === enemy.id).visible
    enemy.position = { x: 3900, y: 3900 }
    control.render()
    const hidden = !control.observe().combat.shipDisplays.find((display: {id: string}) => display.id === enemy.id).visible && !control.observe().damage.find((display: {id: string}) => display.id === enemy.id).visible
      && !control.observe().health.find((display: {id: string}) => display.id === enemy.id).visible
    enemy.position = { x: 2100, y: 2000 }
    control.render()
    const returned = control.observe().combat.shipDisplays.find((display: {id: string}) => display.id === enemy.id)
    const reused = returned.uid === sprite.uid && returned.visible
    const ocean = control.observe().ocean
    const population = game.world.enemies.length
    game.destroy()
    host.remove()
    return { initialSprites, simulated, visible, hidden, reused, ocean, population }
  })
  expect(result.population).toBeGreaterThan(0)
  expect(result.population).toBeLessThanOrEqual(COMBAT_CONFIG.spawn.maxPopulation)
  expect(result.initialSprites).toBeLessThan(result.population)
  expect(result.simulated).toBe(true)
  expect(result.visible).toBe(true)
  expect(result.hidden).toBe(true)
  expect(result.reused).toBe(true)
  expect(result.ocean).toEqual({ width: 800, height: 600 })
})
