import { test, expect } from '@playwright/test'
import { World } from '../src/game/world/World'
import { createEnemy } from '../src/game/entities/Enemy'
import { updateEnemies, leashBounds } from '../src/game/ai/EnemySystem'
import { insidePatrolArea } from '../src/game/world/SpawnSystem'
import { turnShip } from '../src/game/movement/ShipMovement'
import { canOccupyWithCircles } from '../src/game/collision/CollisionSystem'
import { damageShip, fireWeapon, updateProjectiles } from '../src/game/combat/CombatSystem'

function arena() {
  const world = new World(42)
  world.islands.splice(0)
  world.islandColliders.splice(0)
  world.enemies.splice(0)
  Object.assign(world.patrolAreas[0]!, { x: 1400, y: 1400, width: 1200, height: 1200 })
  return world
}

test('vision requires proximity and RETURN reaches the patrol region without hull contact', () => {
  const world = arena()
  const area = world.patrolAreas[0]!
  const enemy = createEnemy('enemy', 'chaser', area, { x: 2000, y: 2400 }, 42)
  world.enemies.push(enemy)
  updateEnemies(world, 0)
  expect(enemy.visionRange).toBe(345)
  expect(enemy.state).toBe('PATROL')
  world.player.position.y = 2150
  updateEnemies(world, 0)
  expect(enemy.state).toBe('CHASE')
  const bounds = leashBounds(area)
  enemy.position = { x: bounds.x - 10, y: 2000 }
  world.player.position = { x: enemy.position.x, y: 2150 }
  updateEnemies(world, 0)
  expect(enemy.state).toBe('RETURN')
  let returned = false
  for (let i = 0; i < 600; i++) {
    // 150 exceeds both reduced return vision and the combined longitudinal hulls.
    world.player.position = { x: enemy.position.x, y: enemy.position.y + 150 }
    updateEnemies(world, 1 / 60)
    if (enemy.state === 'PATROL') { returned = true; break }
    expect(enemy.state).toBe('RETURN')
  }
  expect(returned).toBe(true)
  expect(insidePatrolArea(enemy.position, area)).toBe(true)
})

test('circular patrol is seeded, stable and completes an orbit', () => {
  const world = arena()
  world.player.position = { x: 100, y: 100 }
  const area = world.patrolAreas[0]!
  const enemy = createEnemy('enemy', 'chaser', area, { x: 2000, y: 2000 }, 42)
  expect(enemy.patrol).toEqual(createEnemy('enemy', 'chaser', area, { x: 2000, y: 2000 }, 42).patrol)
  const points = JSON.stringify(enemy.patrol)
  world.enemies.push(enemy)
  const visited = new Set<number>()
  enemy.position = { x: enemy.patrol.center.x + enemy.patrol.radius, y: enemy.patrol.center.y }
  for (let i = 0; i < 1200; i++) {
    updateEnemies(world, 1 / 60)
    visited.add(Math.floor((Math.atan2(enemy.position.y - enemy.patrol.center.y, enemy.position.x - enemy.patrol.center.x) + Math.PI) / (Math.PI / 2)))
    expect(JSON.stringify(enemy.patrol)).toBe(points)
  }
  expect(visited.size).toBeGreaterThanOrEqual(4)
})

for (const mode of ['CHASE', 'APPROACH', 'RETURN'] as const) {
  test(`island avoidance makes progress around land during ${mode}`, () => {
    const world = arena()
    const area = world.patrolAreas[0]!
    if (mode === 'RETURN') Object.assign(area, { x: 2200, y: 1600, width: 600, height: 800 })
    const polygon = { type: 'polygon' as const, vertices: [
      { x: 1900, y: 1900 }, { x: 2100, y: 1900 }, { x: 2100, y: 2100 }, { x: 1900, y: 2100 },
    ] }
    world.islands.push({ id: 'obstacle', position: { x: 2000, y: 2000 }, size: 200,
      variant: 0, rotation: 0, boundingRadius: Math.SQRT2 * 100, colliders: [polygon] })
    world.islandColliders.push(polygon)
    world.player.position = mode === 'RETURN' ? { x: 100, y: 100 } : { x: 2350, y: 2000 }
    const enemy = createEnemy('enemy', mode === 'APPROACH' ? 'shooter' : 'chaser', area,
      { x: 2500, y: 2000 }, 42)
    enemy.position = { x: 1700, y: 2000 }
    enemy.rotation = Math.PI / 2
    enemy.state = mode
    world.enemies.push(enemy)
    let detoured = false
    for (let i = 0; i < 900 && enemy.alive; i++) {
      updateEnemies(world, 1 / 60)
      detoured ||= enemy.navigation.waypoint !== null
      expect(canOccupyWithCircles(enemy.colliders, world.islandColliders, world.width, world.height)).toBe(true)
      if (enemy.position.x > 2150) break
    }
    expect(detoured).toBe(true)
    expect(enemy.position.x).toBeGreaterThan(2150)
  })
}

test('rotation limits give the player more maneuverability than either enemy', () => {
  const world = arena()
  const chaser = createEnemy('chaser', 'chaser', world.patrolAreas[0]!, { x: 2500, y: 2000 }, 42)
  const shooter = createEnemy('shooter', 'shooter', world.patrolAreas[0]!, { x: 2600, y: 2000 }, 42)
  for (const ship of [world.player, chaser, shooter]) turnShip(ship, Math.PI, 0.25, () => true)
  expect(Math.abs(world.player.rotation)).toBeCloseTo(Math.PI / 3)
  expect(Math.abs(chaser.rotation)).toBeCloseTo(Math.PI / 6)
  expect(Math.abs(shooter.rotation)).toBeCloseTo(25 * Math.PI / 180)
})

test('fatal damage immediately freezes every simulation system', () => {
  const world = arena()
  fireWeapon(world, world.player, 'right')
  const enemy = createEnemy('enemy', 'shooter', world.patrolAreas[0]!, { x: 2000, y: 2200 }, 42)
  world.enemies.push(enemy)
  damageShip(world, world.player, 100)
  const snapshot = JSON.stringify(world)
  world.update({ up: true, down: false, left: false, right: false, actions: { front: true, left: true, right: true, repair: true } }, 0.1)
  updateEnemies(world, 0.1)
  updateProjectiles(world, 0.1)
  world.spawner.update(world)
  damageShip(world, enemy, 100)
  expect(fireWeapon(world, enemy, 'front')).toBe(false)
  expect(JSON.stringify(world)).toBe(snapshot)
})

test('a fatal projectile stops the other projectiles in the same frame', () => {
  const world = arena()
  world.player.hp = 10
  const enemy = createEnemy('enemy', 'shooter', world.patrolAreas[0]!, { x: 2000, y: 2200 }, 42)
  world.enemies.push(enemy)
  fireWeapon(world, enemy, 'front')
  fireWeapon(world, world.player, 'right')
  world.projectiles[0]!.position = { ...world.player.colliders[0]!.position }
  const remaining = JSON.stringify(world.projectiles.slice(1))
  updateProjectiles(world, 0.1)
  expect(world.gameOver).toBe(true)
  expect(world.player.hp).toBe(0)
  expect(JSON.stringify(world.projectiles)).toBe(remaining)
})


test('RETURN uses reduced vision and reacquires nearby players without oscillating', () => {
  const world = arena()
  const area = world.patrolAreas[0]!
  const enemy = createEnemy('enemy', 'chaser', area, { x: 2000, y: 2000 }, 42)
  world.enemies.push(enemy)
  enemy.state = 'CHASE'
  enemy.position = { x: leashBounds(area).x - 10, y: 2000 }
  world.player.position = { x: enemy.position.x, y: 2150 }
  updateEnemies(world, 0)
  expect(enemy.state).toBe('RETURN')
  expect(enemy.visionRange).toBe(90)
  // Reduced vision can be tested beside the hull, without longitudinal overlap.
  world.player.position = { x: enemy.position.x + 80, y: enemy.position.y }
  updateEnemies(world, 0)
  expect(enemy.state).toBe('CHASE')
  expect(enemy.visionRange).toBe(345)
  updateEnemies(world, 0)
  expect(enemy.state).toBe('CHASE')
  world.player.position.y = 2150
  updateEnemies(world, 0)
  expect(enemy.state).toBe('RETURN')
  enemy.position = { x: 2000, y: 2000 }
  world.player.position = { x: 100, y: 100 }
  updateEnemies(world, 0)
  expect(enemy.state).toBe('PATROL')
  expect(enemy.visionRange).toBe(345)
})
