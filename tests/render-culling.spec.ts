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
    game.app.stop()
    const view = game.view
    const enemy = game.world.enemies[0]
    const initialSprites = view.combatView.ships.size
    const before = { ...enemy.position }
    updateEnemies(game.world, 1 / 60)
    const simulated = enemy.position.x !== before.x || enemy.position.y !== before.y
    enemy.position = { x: 2100, y: 2000 }
    game.render()
    const sprite = view.combatView.ships.get(enemy.id)
    const visible = sprite.visible && view.damageView.overlays.get(enemy.id).visible
    enemy.position = { x: 3900, y: 3900 }
    game.render()
    const hidden = !sprite.visible && !view.damageView.overlays.get(enemy.id).visible
      && !view.healthView.bars.get(enemy.id).container.visible
    enemy.position = { x: 2100, y: 2000 }
    game.render()
    const reused = view.combatView.ships.get(enemy.id) === sprite && sprite.visible
    const ocean = { width: view.ocean.width, height: view.ocean.height }
    const population = game.world.enemies.length
    game.destroy()
    host.remove()
    return { initialSprites, simulated, visible, hidden, reused, ocean, population }
  })
  expect(result.population).toBe(48)
  expect(result.initialSprites).toBeLessThan(48)
  expect(result.simulated).toBe(true)
  expect(result.visible).toBe(true)
  expect(result.hidden).toBe(true)
  expect(result.reused).toBe(true)
  expect(result.ocean).toEqual({ width: 800, height: 600 })
})
