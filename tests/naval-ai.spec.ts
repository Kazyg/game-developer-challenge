import { test, expect } from '@playwright/test'
import { World } from '../src/game/world/World'
import { createEnemy } from '../src/game/entities/Enemy'
import { movementDirection, movementSpeed, updateEnemies } from '../src/game/ai/EnemySystem'
import { clearSegment, avoidIslands, recordNavigationProgress } from '../src/game/ai/ObstacleAvoidance'
import { navigable } from '../src/game/ai/PatrolNavigation'
import { canOccupyWithCircles, circlesOverlap } from '../src/game/collision/CollisionSystem'
import { fireWeapon, tickWeaponCooldowns, updateProjectiles } from '../src/game/combat/CombatSystem'
import { COMBAT_CONFIG as config } from '../src/game/config/CombatConfig'
import { moveShip, straightSailingSpeed } from '../src/game/movement/ShipMovement'
import type { Vector2 } from '../src/game/entities/Island'

function arena() {
  const world = new World(42, { combatEnabled: false })
  world.islands.splice(0); world.islandColliders.splice(0); world.enemies.splice(0)
  world.patrolAreas.splice(0, world.patrolAreas.length, { id: 'test', x: 600, y: 600, width: 2800, height: 2800 })
  return world
}
function boat(world: World, id: string, position: Vector2, type: 'shooter' | 'chaser' = 'chaser') {
  const enemy = createEnemy(id, type, world.patrolAreas[0]!, position, 42, () => true,
    { kind: 'circular', center: { x: 2000, y: 2000 }, radius: 500, direction: 1 })
  enemy.state = type === 'chaser' ? 'CHASE' : 'APPROACH'
  world.enemies.push(enemy); return enemy
}
function land(world: World, x: number, y: number, radius: number) {
  const collider = { type: 'circle' as const, position: { x, y }, radius }
  world.islands.push({ id: `island-${x}-${y}`, position: { x, y }, boundingRadius: radius,
    size: radius * 2, variant: 0, rotation: 0, colliders: [collider] })
  world.islandColliders.push(collider)
}
function safe(world: World) {
  for (const enemy of world.enemies.filter(e => e.alive)) {
    expect(canOccupyWithCircles(enemy.colliders, world.islandColliders, world.width, world.height)).toBe(true)
    for (const other of world.enemies.filter(e => e !== enemy && e.alive))
      expect(enemy.colliders.some(a => other.colliders.some(b => circlesOverlap(a, b)))).toBe(false)
  }
}

test('coastal hull clearance permits a narrow channel and traversal makes progress', () => {
  const world = arena()
  land(world, 1900, 1840, 140); land(world, 1900, 2160, 140) // 40px gap, hull beam 25.6px
  world.player.position = { x: 2450, y: 2000 }
  const enemy = boat(world, 'channel', { x: 1550, y: 2000 }); enemy.rotation = Math.PI / 2
  expect(clearSegment(world, enemy.position, world.player.position)).toBe(true)
  for (let i = 0; i < 330; i++) { updateEnemies(world, 1 / 60); safe(world) }
  expect(enemy.position.x).toBeGreaterThan(2100)
})

test('stalls request a replacement while preserving the prior route and allowing a turn', () => {
  const world = arena(), enemy = boat(world, 'stalled', { x: 1700, y: 2000 })
  enemy.navigation.goal = { x: 2400, y: 2000 }; enemy.navigation.route = [{ x: 1800, y: 1800 }]
  const side = enemy.navigation.side
  for (let i = 0; i < 60; i++) recordNavigationProgress(enemy, enemy.position, 1 / 60, true)
  expect(enemy.navigation.side).toBe(side)
  for (let i = 0; i < 160; i++) recordNavigationProgress(enemy, enemy.position, 1 / 60)
  expect(enemy.navigation.replanRequested).toBe(true)
  expect(enemy.navigation.route).toHaveLength(1)
  expect(enemy.navigation.side).toBe(side)
  land(world, 2000, 2000, 120)
  expect(avoidIslands(world, enemy, { x: 2300, y: 2000 })).not.toEqual({ x: 0, y: 0 })
  expect(enemy.navigation.route.length).toBeGreaterThan(0)
})

test('an unreachable target produces a useful navigable substitute', () => {
  const world = arena(); land(world, 2200, 2000, 120)
  const enemy = boat(world, 'substitute', { x: 1750, y: 2000 })
  avoidIslands(world, enemy, { x: 2200, y: 2000 })
  const end = enemy.navigation.route.at(-1)!
  expect(end).toBeDefined(); expect(navigable(end, world.islands, 13)).toBe(true)
  expect(Math.hypot(end.x - 2200, end.y - 2000)).toBeLessThan(450)
})

for (const coast of [false, true]) test(`head-on allies pass with progress${coast ? ' beside an island' : ''}`, () => {
  const world = arena(); if (coast) land(world, 2000, 1800, 100)
  const a = boat(world, 'a', { x: 1780, y: 2000 }), b = boat(world, 'b', { x: 2220, y: 2000 })
  a.rotation = Math.PI / 2; b.rotation = -Math.PI / 2
  world.player.position = { x: 100, y: 100 }
  const goals = [{ x: 2650, y: 2000 }, { x: 1350, y: 2000 }]
  for (let i = 0; i < 480; i++) {
    const moves = [a, b].map((enemy, index) => {
      const direction = movementDirection(world, enemy, goals[index]!)
      const speed = movementSpeed(world, enemy, direction)
      world.setShipVelocity(enemy.id, enemy.rotation, speed)
      return () => moveShip(enemy, direction, speed, 1 / 60,
        (position, rotation) => world.canEnemyPose(enemy, position, rotation))
    })
    for (const move of moves) move()
    safe(world)
  }
  expect(a.position.x).toBeGreaterThan(2250)
  expect(b.position.x).toBeLessThan(1750)
})

test('several converging allies keep moving without crossing terrain or each other', () => {
  const world = arena(); land(world, 2000, 1900, 100)
  world.player.position = { x: 2300, y: 2200 }
  const starts = [{ x: 1800, y: 2100 }, { x: 1800, y: 2250 }, { x: 1950, y: 2400 }, { x: 2100, y: 2500 }]
  const enemies = starts.map((p, i) => boat(world, String(i), { ...p }, 'shooter'))
  for (let i = 0; i < 600; i++) { updateEnemies(world, 1 / 60); safe(world) }
  for (const [i, enemy] of enemies.entries())
    expect(Math.hypot(enemy.position.x - starts[i]!.x, enemy.position.y - starts[i]!.y)).toBeGreaterThan(100)
})

test('Shooter sails and fires actual broadside axes with a shared cooldown', () => {
  const world = arena(); world.player.position = { x: 2000, y: 2000 }
  const enemy = boat(world, 'shooter', { x: 2190, y: 2000 }, 'shooter')
  const start = { ...enemy.position }; let sideShots = 0, travel = 0
  for (let i = 0; i < 720; i++) {
    const before = { ...enemy.position }; tickWeaponCooldowns(enemy, 1 / 60); updateEnemies(world, 1 / 60)
    travel += Math.hypot(enemy.position.x - before.x, enemy.position.y - before.y)
    for (const shot of world.projectiles) {
      const dot = shot.direction.x * Math.sin(enemy.rotation) - shot.direction.y * Math.cos(enemy.rotation)
      if (Math.abs(dot) < 0.01) sideShots++
      expect(Math.abs(dot) < 0.01 || Math.abs(dot - 1) < 0.01).toBe(true)
    }
    world.projectiles.splice(0); safe(world)
  }
  expect(sideShots).toBeGreaterThanOrEqual(6); expect(travel).toBeGreaterThan(500)
  expect(Math.hypot(enemy.position.x - start.x, enemy.position.y - start.y)).toBeGreaterThan(50)
  enemy.weaponCooldowns = { front: 0, left: 0, right: 0 }
  expect(fireWeapon(world, enemy, 'right')).toBe(true); expect(fireWeapon(world, enemy, 'front')).toBe(false)
})

test('expanded detection and projectile lifetime reach a player at the perception edge', () => {
  const world = arena(); world.player.position = { x: 2000, y: 2000 }
  const enemy = boat(world, 'range', { x: 2000, y: 2000 + config.enemyVisionRange }, 'shooter')
  updateEnemies(world, 0); expect(enemy.state).toBe('APPROACH')
  expect(world.projectiles).toHaveLength(1) // opportunistic frontal shot while approaching
  expect(world.projectiles[0]!.range).toBe(345)
  expect(world.projectiles[0]!.speed * world.projectiles[0]!.lifetime).toBeCloseTo(345)
  updateProjectiles(world, 1); expect(world.player.hp).toBe(90); expect(world.projectiles).toHaveLength(0)
})

test('Chaser accumulates shared straight boost and progresses against a zigzag player', () => {
  const world = arena(), enemy = boat(world, 'pursuit', { x: 1700, y: 2400 })
  enemy.rotation = 0
  for (let i = 0; i < 240; i++) {
    world.player.position = { x: 1700 + Math.sin(i / 25) * 5, y: 1500 - i * 0.4 }
    world.setShipVelocity('player', 0, 24)
    updateEnemies(world, 1 / 60); safe(world)
  }
  expect(enemy.navigation.straightDistance).toBeGreaterThan(300)
  expect(straightSailingSpeed(enemy.speed, enemy.navigation.straightDistance, config.chaser.maxBoost)).toBe(156)
  expect(enemy.position.y).toBeLessThan(1900)
})

test('fixed elapsed time preserves movement across update rates and pause freezes navigation', () => {
  const positions = []
  for (const fps of [30, 60, 120]) {
    const world = arena(), enemy = boat(world, 'fps', { x: 1700, y: 2400 })
    enemy.rotation = 0; world.player.position = { x: 1700, y: 1200 }
    for (let i = 0; i < fps * 3; i++) updateEnemies(world, 1 / fps)
    positions.push(enemy.position.y)
    world.paused = true
    const snapshot = JSON.stringify(world)
    updateEnemies(world, 1); updateProjectiles(world, 1)
    expect(JSON.stringify(world)).toBe(snapshot)
  }
  expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(1)
})

test('rendered naval maneuver uses controlled time and captures successive frames', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const { Game } = await import('/src/game/Game.ts')
    const { createEnemy } = await import('/src/game/entities/Enemy.ts')
    const game = new Game(42, true)
    game.world.islands.splice(0); game.world.islandColliders.splice(0); game.world.enemies.splice(0)
    game.world.patrolAreas.splice(0, game.world.patrolAreas.length, { id: 'test', x: 600, y: 600, width: 2800, height: 2800 })
    game.world.enemies.push(createEnemy('visual', 'shooter', game.world.patrolAreas[0], { x: 2190, y: 2000 }, 42, () => true,
      { kind: 'circular', center: { x: 2000, y: 2000 }, radius: 500, direction: 1 }))
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:100'; document.body.append(host)
    await game.start(host); const control = game.testController(); control.stopClock()
    Object.assign(window, { navalGame: game, navalControl: control })
    control.render()
  })
  for (const seconds of [0, 2, 3]) {
    const state = await page.evaluate(async (seconds) => {
      const { updateEnemies } = await import('/src/game/ai/EnemySystem.ts')
      const { tickWeaponCooldowns, updateProjectiles } = await import('/src/game/combat/CombatSystem.ts')
      const { navalGame: game, navalControl: control } = window as unknown as {
        navalGame: import('../src/game/Game').Game; navalControl: ReturnType<import('../src/game/Game').Game['testController']>
      }
      for (let i = 0; i < seconds * 60; i++) {
        tickWeaponCooldowns(game.world.enemies[0]!, 1 / 60); updateEnemies(game.world, 1 / 60); updateProjectiles(game.world, 1 / 60)
        for (let e = game.world.effects.length - 1; e >= 0; e--) {
          game.world.effects[e]!.age += 1 / 60
          if (game.world.effects[e]!.age >= game.world.effects[e]!.duration) game.world.effects.splice(e, 1)
        }
      }
      control.render()
      return { position: game.world.enemies[0]!.position, alive: game.world.enemies[0]!.alive }
    }, seconds)
    expect(state.alive).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`maneuver-${seconds}.png`) })
  }
})

test('rendered Chaser rounds a generated island without entering its physical terrain', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const { Game } = await import('/src/game/Game.ts')
    const { createEnemy } = await import('/src/game/entities/Enemy.ts')
    const game = new Game(42, true)
    const coast = game.world.islands.filter(i => i.position.x > 500 && i.position.x < 3500
      && i.position.y > 500 && i.position.y < 3500).sort((a, b) => a.boundingRadius - b.boundingRadius)[0]!
    game.world.islands.splice(0, game.world.islands.length, coast)
    game.world.islandColliders.splice(0, game.world.islandColliders.length, ...coast.colliders)
    game.world.enemies.splice(0)
    game.world.patrolAreas.splice(0, game.world.patrolAreas.length, { id: 'test', x: 0, y: 0, width: 4000, height: 4000 })
    game.world.player.position = { x: coast.position.x + coast.boundingRadius + 180, y: coast.position.y }
    const enemy = createEnemy('visual-chaser', 'chaser', game.world.patrolAreas[0]!,
      { x: coast.position.x - coast.boundingRadius - 180, y: coast.position.y }, 42, () => true,
      { kind: 'circular', center: coast.position, radius: coast.boundingRadius + 180, direction: 1 })
    enemy.rotation = Math.PI / 2; enemy.state = 'CHASE'; game.world.enemies.push(enemy)
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:100'; document.body.append(host)
    await game.start(host); const control = game.testController(); control.stopClock()
    Object.assign(window, { coastGame: game, coastControl: control, coastStart: { ...enemy.position } })
    control.render()
  })
  for (const [index, seconds] of [0, 3, 3].entries()) {
    const result = await page.evaluate(async (seconds) => {
      const { updateEnemies } = await import('/src/game/ai/EnemySystem.ts')
      const { canOccupyWithCircles } = await import('/src/game/collision/CollisionSystem.ts')
      const { coastGame: game, coastControl: control, coastStart: start } = window as unknown as {
        coastGame: import('../src/game/Game').Game; coastControl: ReturnType<import('../src/game/Game').Game['testController']>; coastStart: Vector2
      }
      const enemy = game.world.enemies[0]!
      let safe = true
      for (let i = 0; i < seconds * 60; i++) {
        updateEnemies(game.world, 1 / 60)
        safe &&= canOccupyWithCircles(enemy.colliders, game.world.islandColliders, game.world.width, game.world.height)
      }
      control.render()
      return { safe, progress: Math.hypot(enemy.position.x - start.x, enemy.position.y - start.y) }
    }, seconds)
    expect(result.safe).toBe(true)
    if (index === 2) expect(result.progress).toBeGreaterThan(250)
    await page.screenshot({ path: testInfo.outputPath(`coast-${index}.png`) })
  }
})
