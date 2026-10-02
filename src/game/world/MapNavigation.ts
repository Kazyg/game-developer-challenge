import { GAME_CONFIG } from '../config/GameConfig'
import { canOccupyWithCircles, sweepCollider } from '../collision/CollisionSystem'
import type { Island, Vector2 } from '../entities/Island'

export const NAVIGATION_RADIUS = Math.max(...GAME_CONFIG.playerHullCircles.map(p =>
  (Math.hypot(p.x, p.y) + p.radius) * GAME_CONFIG.playerSpriteScale))

// This is generation validation, not a new runtime obstacle or navigation mesh.
// Cardinal links are swept with a complete rotating ship's clearance.
export function validateMapNavigation(islands: readonly Island[], spawn: Vector2) {
  const columns = Math.floor(GAME_CONFIG.worldWidth / 64), rows = Math.floor(GAME_CONFIG.worldHeight / 64)
  const stepX = GAME_CONFIG.worldWidth / columns, stepY = GAME_CONFIG.worldHeight / rows
  const point = (index: number) => ({ x: (index % columns + 0.5) * stepX, y: (Math.floor(index / columns) + 0.5) * stepY })
  const nearby = (p: Vector2, padding = NAVIGATION_RADIUS) => islands.filter(island =>
    Math.abs(p.x - island.position.x) <= island.boundingRadius + padding
      && Math.abs(p.y - island.position.y) <= island.boundingRadius + padding)
  const safe = (p: Vector2) => canOccupyWithCircles([{ type: 'circle', position: p, radius: NAVIGATION_RADIUS }],
    nearby(p).flatMap(island => island.colliders), GAME_CONFIG.worldWidth, GAME_CONFIG.worldHeight)
  const free = Uint8Array.from({ length: columns * rows }, (_, index) => Number(safe(point(index))))
  const reachable = new Uint8Array(free.length)
  const indexAt = (p: Vector2) => Math.max(0, Math.min(rows - 1, Math.floor(p.y / stepY))) * columns
    + Math.max(0, Math.min(columns - 1, Math.floor(p.x / stepX)))
  const start = indexAt(spawn)
  const queue: number[] = free[start] ? [start] : []
  if (free[start]) reachable[start] = 1
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!, a = point(current)
    for (const next of [current - columns, current + columns,
      current % columns ? current - 1 : -1, current % columns < columns - 1 ? current + 1 : -1]) {
      if (next < 0 || next >= free.length || !free[next] || reachable[next]) continue
      const b = point(next)
      const obstacles = nearby(a, NAVIGATION_RADIUS + Math.max(stepX, stepY)).flatMap(island => island.colliders)
      if (obstacles.some(collider => sweepCollider(a, b, NAVIGATION_RADIUS, collider) !== null)) continue
      reachable[next] = 1
      queue.push(next)
    }
  }
  const freeCount = free.reduce((sum, value) => sum + value, 0)
  return { waterFraction: freeCount / free.length, connectedFraction: queue.length / Math.max(1, freeCount),
    valid: freeCount / free.length >= 0.60 && queue.length / Math.max(1, freeCount) >= 0.98,
    reachablePoints: queue.map(point),
    accessible: (p: Vector2) => safe(p) && reachable[indexAt(p)] === 1 }
}
