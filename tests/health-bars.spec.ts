import { GAME_CONFIG } from '../src/game/config/GameConfig'
import { test, expect } from '@playwright/test'

test('health bars crop HP, follow ships without rotation, heal, cull and disappear on death', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const gamePath = '/src/game/Game.ts'
    const enemyPath = '/src/game/entities/Enemy.ts'
    const combatPath = '/src/game/combat/CombatSystem.ts'
    const repairPath = '/src/game/combat/RepairSystem.ts'
    const { Game } = await import(gamePath)
    const { createEnemy } = await import(enemyPath)
    const { damageShip, fireWeapon, updateProjectiles } = await import(combatPath)
    const { updateRepair } = await import(repairPath)
    const game = new Game(42)
    const host = document.createElement('div')
    host.style.cssText = 'width:800px;height:600px'
    document.body.append(host)
    const chaser = createEnemy('test-chaser', 'chaser', game.world.patrolAreas[0], { x: 2100, y: 2000 }, 42)
    const shooter = createEnemy('test-shooter', 'shooter', game.world.patrolAreas[0], { x: 2200, y: 2000 }, 43)
    game.world.enemies.push(chaser, shooter)
    await game.start(host)
    game.app.stop()
    const health = game.view.healthView
    const read = (id: string) => {
      const bar = health.bars.get(id)
      return { fill: bar.mask.getLocalBounds().width / (bar.width - 2 * bar.inset),
        rotation: bar.container.rotation, visible: bar.container.visible,
        x: bar.container.x, y: bar.container.y }
    }
    damageShip(game.world, game.world.player, 30)
    damageShip(game.world, chaser, 10)
    damageShip(game.world, shooter, 30)
    game.world.player.rotation = Math.PI / 2
    game.render()
    const damaged = [read(game.world.player.id), read(chaser.id), read(shooter.id)]
    updateRepair(game.world.player, true, false, 1)
    game.render()
    const healed = read(game.world.player.id)
    shooter.position = { x: 3900, y: 3900 }
    game.render()
    const offscreen = read(shooter.id).visible
    const damageView = game.view.damageView
    const lightDamage = damageView.overlays.get(shooter.id).children.at(-1).visible
    damageShip(game.world, game.world.player, 60)
    game.render()
    const heavyDamage = damageView.overlays.get(game.world.player.id).children.at(-1).visible
    damageShip(game.world, chaser, 40)
    game.render()
    const removed = !health.bars.has(chaser.id)
    damageShip(game.world, shooter, shooter.hp)
    game.render()
    const damageRemoved = !damageView.overlays.has(shooter.id)
    const explosion = game.world.effects.some((effect: { kind: string }) => effect.kind === 'explosion')
    fireWeapon(game.world, game.world.player, 'front')
    const projectile = game.world.projectiles[0]
    const island = game.world.islands[0]
    projectile.position = { ...island.position }
    updateProjectiles(game.world, 0)
    game.render()
    const feedback = game.world.effects.map((effect: { kind: string }) => effect.kind)
    const renderedEffects = [...game.view.combatView.effects.values()].filter(sprite => sprite.visible).length
    const { inViewport } = await import('/src/game/rendering/Viewport.ts')
    const expectedEffects = game.world.effects.filter(effect => inViewport(effect.position, 128,
      { x: game.camera.position.x, y: game.camera.position.y, width: 800, height: 600 })).length
    const playerPosition = { ...game.world.player.position }
    game.destroy()
    host.remove()
    return { damaged, healed, offscreen, removed, playerPosition, lightDamage, heavyDamage, damageRemoved, explosion, feedback, renderedEffects, expectedEffects }
  })
  expect(result.damaged.map(bar => bar.fill)).toEqual([0.7, 0.75, 0.5])
  expect(result.damaged.every(bar => bar.rotation === 0)).toBe(true)
  expect(result.healed.fill).toBeCloseTo(0.8)
  expect(result.healed.y).toBeCloseTo(result.playerPosition.y - 84 * GAME_CONFIG.playerSpriteScale)
  expect(result.offscreen).toBe(false)
  expect(result.removed).toBe(true)
  expect(result.lightDamage).toBe(false)
  expect(result.heavyDamage).toBe(true)
  expect(result.damageRemoved).toBe(true)
  expect(result.explosion).toBe(true)
  expect(result.feedback).toEqual(expect.arrayContaining(['shot', 'impact', 'explosion']))
  expect(result.renderedEffects).toBe(result.expectedEffects)
  await expect(page.locator('canvas')).toHaveCount(0)
})


