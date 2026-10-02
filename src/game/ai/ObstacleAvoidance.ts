import { navigationClearance, navigable, ROUTE_MARGIN } from './PatrolNavigation'
import { COMBAT_CONFIG as config } from '../config/CombatConfig'
import { overlapsCollider } from '../collision/CollisionSystem'
import type { Enemy } from '../entities/Enemy'
import type { Island, Vector2 } from '../entities/Island'
import { SHIP_MARGIN } from '../world/SpawnSystem'
import type { World } from '../world/World'

function blocker(world: World, enemy: Enemy, goal: Vector2): Island | null {
  const dx = goal.x - enemy.position.x
  const dy = goal.y - enemy.position.y
  const length = Math.hypot(dx, dy)
  if (length <= config.obstacles.goalReleaseDistance) return null
  const probeRadius = ROUTE_MARGIN
  const distance = Math.max(0, length - SHIP_MARGIN)
  const end = { x: enemy.position.x + dx / length * distance, y: enemy.position.y + dy / length * distance }
  const segmentLengthSquared = distance * distance
  const candidates = world.islands.filter((island) => {
    const t = segmentLengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
      ((island.position.x - enemy.position.x) * (end.x - enemy.position.x)
        + (island.position.y - enemy.position.y) * (end.y - enemy.position.y)) / segmentLengthSquared))
    return Math.hypot(island.position.x - enemy.position.x - t * (end.x - enemy.position.x),
      island.position.y - enemy.position.y - t * (end.y - enemy.position.y)) < island.boundingRadius * 1.12 + probeRadius
  })
  if (candidates.length === 0) return null
  const steps = Math.max(1, Math.ceil(distance / config.obstacles.probeStep))
  for (let step = 1; step <= steps; step++) {
    const position = { x: enemy.position.x + (end.x - enemy.position.x) * step / steps,
      y: enemy.position.y + (end.y - enemy.position.y) * step / steps }
    const island = candidates.find((item) => navigationClearance(item).some((collider) => overlapsCollider({ position, radius: probeRadius }, collider)))
    if (island) return island
  }
  return null
}

export function avoidIslands(world: World, enemy: Enemy, goal: Vector2): Vector2 {
  const navigation = enemy.navigation
  const ahead = { x: enemy.position.x + Math.sin(enemy.rotation) * config.patrol.hullLookAhead,
    y: enemy.position.y - Math.cos(enemy.rotation) * config.patrol.hullLookAhead }
  const island = blocker(world, enemy, ahead) ?? blocker(world, enemy, goal)
  if (!island) {
    navigation.islandId = null
    navigation.waypoint = null
    return { x: goal.x - enemy.position.x, y: goal.y - enemy.position.y }
  }
  if (navigation.islandId !== island.id) {
    navigation.islandId = island.id
    navigation.stalledSeconds = 0
  }
  const radius = island.boundingRadius * 1.12 + ROUTE_MARGIN + config.obstacles.clearance
  const fromCenter = { x: enemy.position.x - island.position.x, y: enemy.position.y - island.position.y }
  const angle = Math.atan2(fromCenter.y, fromCenter.x)
  const radialEscape = Math.hypot(fromCenter.x, fromCenter.y) < radius - config.obstacles.clearance / 2
  // Persist the side until genuinely stalled, rather than alternating every frame.
  const offsets = radialEscape ? [0, navigation.side, -navigation.side]
    : [navigation.side, navigation.side * 2, -navigation.side, -navigation.side * 2]
  for (const offset of offsets) {
    const targetAngle = angle + offset * config.obstacles.orbitStep
    const waypoint = { x: island.position.x + Math.cos(targetAngle) * radius,
      y: island.position.y + Math.sin(targetAngle) * radius }
    if (!navigable(waypoint, world.islands)) continue
    navigation.waypoint = waypoint
    return { x: waypoint.x - enemy.position.x, y: waypoint.y - enemy.position.y }
  }
  navigation.waypoint = null
  // Terrain still validates this sidestep; it cannot force the ship through land.
  return { x: -fromCenter.y * navigation.side, y: fromCenter.x * navigation.side }
}

export function islandBlocksGoal(world: World, enemy: Enemy, goal: Vector2): boolean {
  return blocker(world, enemy, goal) !== null
}

export function recordNavigationProgress(enemy: Enemy, before: Vector2, dt: number) {
  const moved = Math.hypot(enemy.position.x - before.x, enemy.position.y - before.y)
  if (moved < enemy.speed * dt * config.obstacles.progressSpeedRatio) enemy.navigation.stalledSeconds += dt
  else enemy.navigation.stalledSeconds = 0
  if (enemy.navigation.stalledSeconds >= config.obstacles.stuckSeconds) {
    enemy.navigation.side = enemy.navigation.side === 1 ? -1 : 1
    enemy.navigation.stalledSeconds = 0
    enemy.navigation.waypoint = null
  }
}
