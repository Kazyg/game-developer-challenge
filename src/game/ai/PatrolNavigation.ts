import { COMBAT_CONFIG as config } from '../config/CombatConfig'
import { GAME_CONFIG } from '../config/GameConfig'
import { canOccupyWithCircles, overlapsCollider } from '../collision/CollisionSystem'
import type { Collider, Island, Vector2 } from '../entities/Island'
import type { PatrolArea } from '../entities/Combat'
import type { PatrolPlan } from '../entities/Enemy'

export { ENEMY_HULL_RADIUS as HULL_RADIUS } from '../entities/HullGeometry'
import { ENEMY_HULL_RADIUS as HULL_RADIUS } from '../entities/HullGeometry'
export const ROUTE_MARGIN = HULL_RADIUS + config.patrol.safetyMargin
export const LANE_GAP = ROUTE_MARGIN * 2 + 8
const clearances = new WeakMap<Island, readonly Collider[]>()

// Shallow water is visual; only physical land blocks navigation.
export function navigationClearance(island: Island): readonly Collider[] {
  let result = clearances.get(island)
  if (!result) {
    result = island.colliders
    clearances.set(island, result)
  }
  return result
}

export function navigable(point: Vector2, islands: readonly Island[], radius = ROUTE_MARGIN): boolean {
  return canOccupyWithCircles([{ type: 'circle', position: point, radius }],
    islands.flatMap(i => [...navigationClearance(i)]), GAME_CONFIG.worldWidth, GAME_CONFIG.worldHeight)
}

export function routeDistance(a: PatrolPlan, b: PatrolPlan): number {
  const d = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y)
  return Math.max(0, d - a.radius - b.radius, Math.abs(a.radius - b.radius) - d)
}

export function safeRoute(plan: PatrolPlan, area: PatrolArea, islands: readonly Island[], existing: readonly PatrolPlan[] = []): boolean {
  const { center: c, radius: r } = plan
  if (r < config.patrol.minRadius || c.x - r - ROUTE_MARGIN + 1e-8 < Math.max(0, area.x)
    || c.y - r - ROUTE_MARGIN + 1e-8 < Math.max(0, area.y)
    || c.x + r + ROUTE_MARGIN - 1e-8 > Math.min(GAME_CONFIG.worldWidth, area.x + area.width)
    || c.y + r + ROUTE_MARGIN - 1e-8 > Math.min(GAME_CONFIG.worldHeight, area.y + area.height)
    || existing.some(other => routeDistance(plan, other) + 1e-8 < LANE_GAP)) return false
  const obstacles = islands.filter(i => {
    const distance = Math.hypot(c.x - i.position.x, c.y - i.position.y)
    const extent = i.boundingRadius * 1.12 + ROUTE_MARGIN
    return distance <= r + extent && r <= distance + extent
  }).flatMap(i => [...navigationClearance(i)])
  const start = { x: c.x + r, y: c.y }
  for (const obstacle of obstacles) {
    if (overlapsCollider({ position: start, radius: ROUTE_MARGIN }, obstacle)) return false
    if (obstacle.type === 'circle') {
      if (Math.abs(Math.hypot(c.x - obstacle.position.x, c.y - obstacle.position.y) - r)
        <= obstacle.radius + ROUTE_MARGIN) return false
      continue
    }
    // Distance to a segment is continuous. Its radial interval must not intersect
    // the annulus swept by the ship, including safety margin, at any angle.
    for (let i = 0; i < obstacle.vertices.length; i++) {
      const a = obstacle.vertices[i]!, b = obstacle.vertices[(i + 1) % obstacle.vertices.length]!
      const dx = b.x - a.x, dy = b.y - a.y
      const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
      const min = Math.hypot(c.x - a.x - t * dx, c.y - a.y - t * dy)
      const max = Math.max(Math.hypot(c.x - a.x, c.y - a.y), Math.hypot(c.x - b.x, c.y - b.y))
      if (min <= r + ROUTE_MARGIN && max >= r - ROUTE_MARGIN) return false
    }
  }
  return true
}

export function planLanes(area: PatrolArea, islands: readonly Island[], existing: readonly PatrolPlan[] = []): [PatrolPlan, PatrolPlan] | null {
  const maxRadius = Math.min(area.width, area.height) / 2 - ROUTE_MARGIN - LANE_GAP
  const centers = [{ x: area.x + area.width / 2, y: area.y + area.height / 2 }]
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) centers.push({
    x: area.x + area.width * (0.2 + x * 0.075), y: area.y + area.height * (0.2 + y * 0.075) })
  for (const center of centers) for (const radius of [...Array.from({ length: Math.max(0, Math.floor((maxRadius - config.patrol.minRadius) / 24) + 1) }, (_, i) => maxRadius - i * 24), config.patrol.minRadius]) {
    const inner: PatrolPlan = { kind: 'circular', center, radius, direction: 1 }
    const outer: PatrolPlan = { ...inner, radius: radius + LANE_GAP }
    if (safeRoute(inner, area, islands, existing) && safeRoute(outer, area, islands, [...existing, inner])) return [inner, outer]
  }
  return null
}
