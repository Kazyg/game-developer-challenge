import { expect, test } from '@playwright/test'
import { LANE_GAP, navigationClearance, planLanes, routeDistance, safeRoute } from '../src/game/ai/PatrolNavigation'
import { createEnemy } from '../src/game/entities/Enemy'
import { avoidIslands } from '../src/game/ai/ObstacleAvoidance'
import { updateEnemies } from '../src/game/ai/EnemySystem'
import { canOccupyWithCircles } from '../src/game/collision/CollisionSystem'
import { World } from '../src/game/world/World'
import type { Island } from '../src/game/entities/Island'

const area = { id: 'test', x: 800, y: 800, width: 960, height: 960 }
function island(size: number): Island {
  return { id: 'coast', position: { x: 850, y: 1120 }, size, variant: 0, rotation: 0,
    boundingRadius: size / 2, colliders: [{ type: 'circle', position: { x: 850, y: 1120 }, radius: size / 2 }] }
}

for (const size of [100, 220, 340]) test(`adjusts circles near a ${size}px island and separates lanes`, () => {
  const islands = [island(size)]
  const original = { kind: 'circular' as const, center: { x: 1120, y: 1120 }, radius: 250, direction: 1 as const }
  expect(safeRoute(original, area, islands)).toBe(false)
  const lanes = planLanes(area, islands)
  expect(lanes).not.toBeNull()
  expect(planLanes(area, islands)).toEqual(lanes)
  for (const lane of lanes!) expect(safeRoute(lane, area, islands)).toBe(true)
  expect(routeDistance(...lanes!)).toBeGreaterThanOrEqual(LANE_GAP - 1e-8)
  const next = planLanes({ ...area, id: 'next', x: 1250 }, islands, lanes!)
  if (next) for (const a of next) for (const b of lanes!) expect(routeDistance(a, b)).toBeGreaterThanOrEqual(LANE_GAP)
})

test('rejects unavailable routes and keeps clearance separate from land', () => {
  const coast = island(2000)
  const physical = JSON.stringify(coast.colliders)
  expect(planLanes(area, [coast])).toBeNull()
  expect(navigationClearance(coast).length).toBeGreaterThan(coast.colliders.length)
  expect(JSON.stringify(coast.colliders)).toBe(physical)
  expect(() => createEnemy('invalid', 'chaser', area, { x: 1120, y: 1120 }, 42, () => false)).toThrow()
})

test('two lanes complete repeated patrol cycles without entering land or colliding', () => {
  const world = new World(42, { combatEnabled: false })
  world.enemies.splice(0)
  world.islands.splice(0, world.islands.length, island(220))
  world.islandColliders.splice(0, world.islandColliders.length, ...world.islands[0]!.colliders)
  world.patrolAreas.splice(0, world.patrolAreas.length, { ...area })
  world.player.position = { x: 100, y: 100 }
  const lanes = planLanes(area, world.islands)!
  for (const [index, type] of (['chaser', 'shooter'] as const).entries()) {
    const plan = lanes[index]!
    const enemy = createEnemy(type, type, area, { x: plan.center.x + plan.radius, y: plan.center.y }, 42, () => true, plan)
    enemy.rotation = Math.PI
    world.enemies.push(enemy)
  }
  const sectors = [new Set<number>(), new Set<number>()]
  for (let frame = 0; frame < 7200; frame++) {
    updateEnemies(world, 1 / 60)
    for (const [index, enemy] of world.enemies.entries()) {
      expect(canOccupyWithCircles(enemy.colliders, world.islandColliders, world.width, world.height)).toBe(true)
      expect(canOccupyWithCircles(enemy.colliders, world.enemies.filter(e => e !== enemy).flatMap(e => e.colliders), world.width, world.height)).toBe(true)
      sectors[index]!.add(Math.floor((Math.atan2(enemy.position.y - enemy.patrol.center.y,
        enemy.position.x - enemy.patrol.center.x) + Math.PI) / (Math.PI / 2)))
    }
  }
  for (const visited of sectors) expect(visited.size).toBeGreaterThanOrEqual(4)
})

 test('coast avoidance uses hull look-ahead and releases its waypoint in open water', () => {
  const world = new World(42, { combatEnabled: false })
  const coast = island(220)
  world.islands.splice(0, world.islands.length, coast)
  world.islandColliders.splice(0, world.islandColliders.length, ...coast.colliders)
  const enemy = createEnemy('probe', 'chaser', area, { x: 1100, y: 1120 }, 42)
  enemy.position = { x: 1040, y: 1120 }
  enemy.rotation = -Math.PI / 2
  avoidIslands(world, enemy, { x: 1400, y: 1120 })
  expect(enemy.navigation.islandId).toBe(coast.id)
  expect(enemy.navigation.waypoint).not.toBeNull()
  enemy.position = { x: 1400, y: 1400 }
  enemy.rotation = Math.PI / 2
  const direction = avoidIslands(world, enemy, { x: 1700, y: 1400 })
  expect(enemy.navigation.waypoint).toBeNull()
  expect(direction).toEqual({ x: 300, y: 0 })
})

test('a patrol ship slows while catching another ship ahead', () => {
  const world = new World(42, { combatEnabled: false })
  world.islands.splice(0)
  world.islandColliders.splice(0)
  world.patrolAreas.splice(0, world.patrolAreas.length, { ...area })
  world.player.position = { x: 100, y: 100 }
  const plan = planLanes(area, [])![0]
  const enemy = createEnemy('fast', 'chaser', area, { x: plan.center.x + plan.radius, y: plan.center.y }, 42, () => true, plan)
  const other = createEnemy('slow', 'shooter', area, { x: enemy.position.x, y: enemy.position.y + 90 }, 42, () => true, plan)
  enemy.rotation = other.rotation = Math.PI
  world.enemies.push(enemy, other)
  const before = { ...enemy.position }
  updateEnemies(world, 1 / 60)
  expect(Math.hypot(enemy.position.x - before.x, enemy.position.y - before.y)).toBeLessThan(enemy.speed / 60 * 0.5)
})
