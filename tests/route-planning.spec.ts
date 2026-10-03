import { test, expect } from '@playwright/test'
import { World } from '../src/game/world/World'
import { createEnemy } from '../src/game/entities/Enemy'
import { canOccupyWithCircles, circlesOverlap } from '../src/game/collision/CollisionSystem'
import { findRoute, avoidIslands, clearSegment, navigationGrid, routeCost, recordNavigationProgress } from '../src/game/ai/ObstacleAvoidance'
import { updateEnemies } from '../src/game/ai/EnemySystem'
import { tickWeaponCooldowns } from '../src/game/combat/CombatSystem'
import { COMBAT_CONFIG } from '../src/game/config/CombatConfig'
import type { Vector2 } from '../src/game/entities/Island'
import type { Enemy } from '../src/game/entities/Enemy'

function arena() {
  const world = new World(42, { combatEnabled: false })
  world.islands.splice(0); world.islandColliders.splice(0); world.enemies.splice(0)
  world.patrolAreas.splice(0, world.patrolAreas.length, { id: 'test', x: 0, y: 0, width: 4000, height: 4000 })
  return world
}
function rectangle(world: World, x: number, y: number, width: number, height: number) {
  const position = { x: x + width / 2, y: y + height / 2 }
  const collider = { type: 'polygon' as const, vertices: [{ x, y }, { x: x + width, y },
    { x: x + width, y: y + height }, { x, y: y + height }] }
  world.islands.push({ id: String(world.islands.length), position, boundingRadius: Math.hypot(width, height) / 2,
    size: Math.max(width, height), variant: 0, rotation: 0, colliders: [collider] })
  world.islandColliders.push(collider)
}
function circle(world: World, x: number, y: number, radius: number) {
  const position = { x, y }, collider = { type: 'circle' as const, position, radius }
  world.islands.push({ id: String(world.islands.length), position, boundingRadius: radius,
    size: radius * 2, variant: 0, rotation: 0, colliders: [collider] })
  world.islandColliders.push(collider)
}
function boat(world: World, id: string, type: 'chaser' | 'shooter', position: Vector2) {
  const enemy = createEnemy(id, type, world.patrolAreas[0]!, position, 42, () => true,
    { kind: 'circular', center: { x: 2000, y: 2000 }, radius: 500, direction: 1 })
  enemy.rotation = Math.PI / 2; enemy.state = type === 'chaser' ? 'CHASE' : 'APPROACH'
  world.enemies.push(enemy); return enemy
}
function safe(world: World) {
  for (const enemy of world.enemies.filter(e => e.alive)) {
    expect(canOccupyWithCircles(enemy.colliders, world.islandColliders, world.width, world.height)).toBe(true)
    for (const other of world.enemies.filter(e => e.alive && e !== enemy))
      expect(enemy.colliders.some(a => other.colliders.some(b => circlesOverlap(a, b)))).toBe(false)
  }
}
function reaches(world: World, enemy: Enemy, seconds: number, moveTarget?: (time: number) => void) {
  let elapsed = 0, detoured = false, escaped = false
  for (; elapsed < seconds; elapsed += 1 / 60) {
    moveTarget?.(elapsed)
    for (const ship of world.enemies) tickWeaponCooldowns(ship, 1 / 60)
    updateEnemies(world, 1 / 60); safe(world)
    detoured ||= enemy.navigation.route.length > 0
    escaped ||= enemy.navigation.escape !== null
    if (enemy.type === 'shooter' ? enemy.state === 'ATTACK' && !enemy.navigation.escape
      : !enemy.alive || Math.hypot(enemy.position.x - world.player.position.x, enemy.position.y - world.player.position.y) < 110) break
  }
  expect(elapsed).toBeLessThan(seconds)
  return { elapsed, detoured, escaped }
}

for (const type of ['chaser', 'shooter'] as const) {
  test(`${type} reaches its useful destination beyond a large island`, () => {
    const world = arena(); circle(world, 2000, 2000, 380)
    world.player.position = { x: 2700, y: 2000 }
    const enemy = boat(world, type, type, { x: 1300, y: 2000 })
    const route = findRoute(world, enemy.position, world.player.position, type === 'shooter' ? 190 : 0)
    expect(route.reachable).toBe(true)
    const result = reaches(world, enemy, route.cost / enemy.speed * 2 + 7)
    expect(result.detoured).toBe(true)
    if (type === 'shooter') {
      expect(Math.hypot(enemy.position.x - world.player.position.x, enemy.position.y - world.player.position.y)).toBeLessThanOrEqual(enemy.attackRange)
      expect(clearSegment(world, enemy.position, world.player.position)).toBe(true)
      let broadsides = 0
      for (let i = 0; i < 480; i++) {
        world.projectiles.splice(0); tickWeaponCooldowns(enemy, 1 / 60); updateEnemies(world, 1 / 60); safe(world)
        broadsides += world.projectiles.filter(p => Math.abs(p.direction.x * Math.sin(enemy.rotation)
          - p.direction.y * Math.cos(enemy.rotation)) < 0.001).length
      }
      expect(broadsides).toBeGreaterThan(0)
    }
  })

  test(`${type} navigates multiple islands rather than stopping after the first detour`, () => {
    const world = arena()
    circle(world, 1900, 1900, 200); circle(world, 2250, 2200, 200); circle(world, 2450, 1800, 140)
    world.player.position = { x: 2900, y: 2000 }
    const enemy = boat(world, type, type, { x: 1400, y: 2000 })
    const route = findRoute(world, enemy.position, world.player.position, type === 'shooter' ? 190 : 0)
    expect(route.reachable).toBe(true)
    expect(reaches(world, enemy, route.cost / enemy.speed * 2 + 8).detoured).toBe(true)
  })
}

test('asymmetric elongated island selects the cheaper complete route and reaches the player', () => {
  const world = arena(); rectangle(world, 1900, 1200, 300, 1200)
  world.player.position = { x: 2500, y: 2150 }
  const enemy = boat(world, 'short', 'chaser', { x: 1600, y: 2150 })
  const result = findRoute(world, enemy.position, world.player.position)
  expect(result.reachable).toBe(true)
  expect(result.points.some(p => p.y > 2400)).toBe(true)
  expect(result.points.every(p => p.y > 1900)).toBe(true)
  const upperAlternative = [{ x: 1820, y: 1100 }, { x: 2280, y: 1100 }, world.player.position]
  expect(result.cost).toBeLessThan(routeCost(enemy.position, upperAlternative) * 0.7)
  reaches(world, enemy, result.cost / enemy.speed * 2 + 7)
})

test('A* terminal costs match independent exhaustive Dijkstra on the same graph', () => {
  const world = arena(); rectangle(world, 1840, 1900, 300, 300)
  const start = { x: 1650, y: 2050 }, goal = { x: 2320, y: 2050 }, grid = navigationGrid(world)
  const connectors = COMBAT_CONFIG.obstacles.connectorCells * COMBAT_CONFIG.obstacles.routeCell
  const costs = new Map<number, number>(), queue: { index: number; cost: number }[] = []
  for (const index of grid.near(start, connectors).filter(i => grid.clear(start, grid.point(i)))) {
    const p = grid.point(index), cost = Math.hypot(p.x - start.x, p.y - start.y)
    costs.set(index, cost); queue.push({ index, cost })
  }
  const terminals = new Set(grid.near(goal, connectors).filter(index => clearSegment(world, grid.point(index), goal)))
  let minimum = Infinity
  while (queue.length) {
    queue.sort((a, b) => b.cost - a.cost)
    const current = queue.pop()!
    if (current.cost >= minimum) break
    if (costs.get(current.index) !== current.cost) continue
    const point = grid.point(current.index)
    if (terminals.has(current.index)) minimum = Math.min(minimum, current.cost + Math.hypot(point.x - goal.x, point.y - goal.y))
    for (const next of grid.neighbors(current.index)) {
      const p = grid.point(next), cost = current.cost + Math.hypot(p.x - point.x, p.y - point.y)
      if (cost >= (costs.get(next) ?? Infinity)) continue
      costs.set(next, cost); queue.push({ index: next, cost })
    }
  }
  expect(findRoute(world, start, goal).cost).toBeCloseTo(minimum, 6)
})

test('moving player triggers replanning and the pursuer reaches the new region', () => {
  const world = arena(); circle(world, 2000, 2000, 280)
  world.player.position = { x: 2600, y: 2000 }
  const enemy = boat(world, 'moving', 'chaser', { x: 1400, y: 2000 })
  const result = reaches(world, enemy, 35, time => {
    if (time > 3) world.player.position = { x: 2650, y: 2400 }
  })
  expect(result.detoured).toBe(true)
  expect(enemy.navigation.planCount).toBeGreaterThan(3)
})

test('nearby allies share immutable terrain and both reach a useful combat region', () => {
  const world = arena(); circle(world, 2000, 2000, 250)
  world.player.position = { x: 2650, y: 2050 }
  const a = boat(world, 'a', 'shooter', { x: 1400, y: 1930 })
  const b = boat(world, 'b', 'shooter', { x: 1400, y: 2070 })
  const grid = navigationGrid(world), reached = new Set<string>()
  for (let i = 0; i < 2400 && reached.size < 2; i++) {
    updateEnemies(world, 1 / 60); safe(world)
    for (const enemy of [a, b]) if (enemy.state === 'ATTACK') reached.add(enemy.id)
  }
  expect(reached.size).toBe(2)
  expect(navigationGrid(world)).toBe(grid)
})

test('coastal start reverses with physical collision enabled before turning and reaching the target', () => {
  const world = arena(); rectangle(world, 1900, 1700, 350, 600)
  world.player.position = { x: 2650, y: 2000 }
  const enemy = boat(world, 'coast', 'chaser', { x: 1883, y: 2000 })
  enemy.rotation = 0 // broadside nearly touching the west coast; rotation cannot fit
  safe(world)
  const result = reaches(world, enemy, 38)
  expect(result.escaped).toBe(true)
})

test('enclosed destination is classified after connectivity search and gets a reachable substitute', () => {
  const world = arena()
  rectangle(world, 1800, 1700, 600, 80); rectangle(world, 1800, 2220, 600, 80)
  rectangle(world, 1800, 1700, 80, 600); rectangle(world, 2320, 1700, 80, 600)
  world.player.position = { x: 2100, y: 2000 }
  const enemy = boat(world, 'unreachable', 'chaser', { x: 1500, y: 2000 })
  const result = findRoute(world, enemy.position, world.player.position)
  expect(result.reachable).toBe(false)
  const destination = result.points.at(-1)!
  expect(navigationGrid(world).safe(destination)).toBe(true)
  for (let i = 0; i < 900; i++) { updateEnemies(world, 1 / 60); safe(world) }
  expect(Math.hypot(enemy.position.x - destination.x, enemy.position.y - destination.y)).toBeLessThan(80)
  expect(enemy.navigation.routeReachable).toBe(false)
})

test('periodic replanning is staggered, stable for tiny target movements and anticipates large changes', () => {
  const world = arena(); circle(world, 2000, 2000, 350)
  const goal = { x: 2700, y: 2000 }
  const a = boat(world, 'period-a', 'chaser', { x: 1300, y: 1800 }), b = boat(world, 'period-b', 'chaser', { x: 1300, y: 2200 })
  world.player.position = goal
  updateEnemies(world, 0)
  expect(a.navigation.replanPhase).not.toBe(b.navigation.replanPhase)
  const phase = a.navigation.replanPhase, route = JSON.stringify(a.navigation.route)
  a.navigation.routeAge = 0; b.navigation.routeAge = 0
  world.player.position = { x: 2701, y: 2000 }
  updateEnemies(world, 0)
  expect(a.navigation.planCount).toBe(1); expect(JSON.stringify(a.navigation.route)).toBe(route)
  a.navigation.routeAge = COMBAT_CONFIG.obstacles.routeRefreshSeconds; updateEnemies(world, 0)
  expect(a.navigation.planCount).toBe(2); expect(b.navigation.planCount).toBe(1)
  expect(a.navigation.replanPhase).toBe(phase)
  world.player.position = { x: 2750, y: 2200 }
  a.navigation.pursuit = { ...world.player.position }
  updateEnemies(world, 0); expect(a.navigation.planCount).toBe(3)
})

test('oscillation and continuous turning do not reset the route progress window', () => {
  const world = arena(), enemy = boat(world, 'oscillating', 'chaser', { x: 1300, y: 2000 })
  enemy.navigation.route = [{ x: 1700, y: 2000 }, { x: 2700, y: 2000 }]
  for (let i = 0; i < 180; i++) {
    const before = { ...enemy.position }
    enemy.position.y = 2000 + Math.sin(i) * 2
    recordNavigationProgress(enemy, before, 1 / 60, true)
  }
  expect(enemy.navigation.replanRequested).toBe(true)
})

test('grid diagonals cannot jump across blocked cardinal corners', () => {
  const world = arena(), grid = navigationGrid(world), columns = grid.columns
  const start = 60 * columns + 60, p = grid.point(start), diagonal = start + columns + 1
  rectangle(world, p.x + 58, p.y - 20, 4, 4)
  const updated = navigationGrid(world)
  expect(updated.free(start)).toBe(true)
  expect(updated.free(diagonal)).toBe(true)
  expect(updated.free(start + 1)).toBe(false)
  expect(updated.clear(updated.point(start), updated.point(diagonal))).toBe(true)
  expect(updated.neighbors(start)).not.toContain(diagonal)
})

for (const type of ['chaser', 'shooter'] as const) test(`${type} finds and traverses a narrow channel requiring bends`, () => {
  const world = arena()
  rectangle(world, 1800, 1500, 600, 452); rectangle(world, 1800, 2048, 600, 452)
  world.player.position = { x: 2800, y: 2250 }
  const enemy = boat(world, `channel-${type}`, type, { x: 1400, y: 1750 })
  const route = findRoute(world, enemy.position, world.player.position, type === 'shooter' ? 190 : 0)
  expect(route.reachable).toBe(true)
  expect(route.points.some(p => p.y > 1952 && p.y < 2048)).toBe(true)
  reaches(world, enemy, route.cost / enemy.speed * 2 + 8)
})


test('a waypoint already passed is skipped instead of steering back into an orbit', () => {
  const world = arena(); circle(world, 2000, 2000, 250)
  world.player.position = { x: 2600, y: 2000 }
  const enemy = boat(world, 'passed', 'chaser', { x: 1900, y: 1680 })
  enemy.navigation.route = [{ x: 1880, y: 1680 }, { x: 2400, y: 1680 }, world.player.position]
  enemy.navigation.goal = { ...world.player.position }
  const direction = avoidIslands(world, enemy, world.player.position)
  expect(direction.x).toBeGreaterThan(0)
  expect(enemy.navigation.waypoint!.x).toBeGreaterThan(enemy.position.x)
})

test('reverse coastal movement still uses relative closing speed for contact damage', () => {
  const world = arena()
  world.player.position = { x: 2000, y: 2000 }
  const enemy = boat(world, 'reverse', 'shooter', { x: 2000, y: 1850 })
  enemy.rotation = 0
  world.setShipVelocity(world.player.id, 0, 0)
  const hp = world.player.hp
  expect(world.canEnemyPose(enemy, { x: 2000, y: 1960 }, 0, -40)).toBe(false)
  expect(world.player.hp).toBeLessThan(hp)
})
