import { test, expect } from '@playwright/test'

test('rendered route around a large seeded island reaches the target under controlled time', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1800, height: 1000 })
  await page.goto('/')
  await page.evaluate(async () => {
    const { Game } = await import('/src/game/Game.ts')
    const { createEnemy } = await import('/src/game/entities/Enemy.ts')
    const game = new Game(42, true)
    const coast = game.world.islands.filter(i => i.position.x > 800 && i.position.x < 3200
      && i.position.y > 800 && i.position.y < 3200).sort((a, b) => b.boundingRadius - a.boundingRadius)[0]!
    game.world.islands.splice(0, game.world.islands.length, coast)
    game.world.islandColliders.splice(0, game.world.islandColliders.length, ...coast.colliders)
    game.world.enemies.splice(0)
    game.world.patrolAreas.splice(0, game.world.patrolAreas.length, { id: 'test', x: 0, y: 0, width: 4000, height: 4000 })
    game.world.player.position = { x: coast.position.x + coast.boundingRadius + 180, y: coast.position.y }
    const enemy = createEnemy('visual-route', 'chaser', game.world.patrolAreas[0]!,
      { x: coast.position.x - coast.boundingRadius - 180, y: coast.position.y }, 42, () => true,
      { kind: 'circular', center: coast.position, radius: coast.boundingRadius + 180, direction: 1 })
    enemy.rotation = Math.PI / 2; enemy.state = 'CHASE'; game.world.enemies.push(enemy)
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:100'; document.body.append(host)
    await game.start(host); const control = game.testController(); control.stopClock()
    Object.assign(window, { routeGame: game, routeControl: control, routeCenter: coast.position })
  })
  let reached = false, planned = false
  for (const [index, seconds] of [0.1, 3, 5, 7, 8].entries()) {
    const result = await page.evaluate(async (seconds) => {
      const { updateEnemies } = await import('/src/game/ai/EnemySystem.ts')
      const { canOccupyWithCircles } = await import('/src/game/collision/CollisionSystem.ts')
      const { routeGame: game, routeControl: control, routeCenter: center } = window as unknown as {
        routeGame: import('../src/game/Game').Game; routeControl: ReturnType<import('../src/game/Game').Game['testController']>;
        routeCenter: { x: number; y: number }
      }
      const enemy = game.world.enemies[0]!
      let safe = true, planned = false
      for (let i = 0; i < seconds * 60; i++) {
        updateEnemies(game.world, 1 / 60)
        planned ||= enemy.navigation.route.length > 1
        safe &&= canOccupyWithCircles(enemy.colliders, game.world.islandColliders, game.world.width, game.world.height)
        for (let e = game.world.effects.length - 1; e >= 0; e--) {
          game.world.effects[e]!.age += 1 / 60
          if (game.world.effects[e]!.age >= game.world.effects[e]!.duration) game.world.effects.splice(e, 1)
        }
        if (!enemy.alive) break
      }
      control.renderAt(center.x - 900, center.y - 500, 1800, 1000)
      return { safe, planned, reached: !enemy.alive || Math.hypot(enemy.position.x - game.world.player.position.x,
        enemy.position.y - game.world.player.position.y) < 110, radius: game.world.islands[0]!.boundingRadius }
    }, seconds)
    expect(result.safe).toBe(true); expect(result.radius).toBeGreaterThan(200)
    reached ||= result.reached; planned ||= result.planned
    await page.screenshot({ path: testInfo.outputPath(`route-${index}.png`) })
    if (reached) break
  }
  expect(planned).toBe(true); expect(reached).toBe(true)
})
