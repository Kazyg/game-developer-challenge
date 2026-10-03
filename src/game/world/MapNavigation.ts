import { GAME_CONFIG } from '../config/GameConfig'
import { NavigationGrid } from './NavigationGrid'
export { NavigationGrid } from './NavigationGrid'
import type { Island, Vector2 } from '../entities/Island'

export const NAVIGATION_RADIUS = Math.max(...GAME_CONFIG.playerHullCircles.map(p =>
  (Math.hypot(p.x, p.y) + p.radius) * GAME_CONFIG.playerSpriteScale))

// Generation and runtime share the grid implementation. Generation preserves
// its original player clearance, 64px sampling and cardinal traversal order.
export function validateMapNavigation(islands: readonly Island[], spawn: Vector2) {
  const grid = new NavigationGrid(islands.flatMap(island => island.colliders),
    GAME_CONFIG.worldWidth, GAME_CONFIG.worldHeight, 64, NAVIGATION_RADIUS, true)
  const { columns, rows, stepX, stepY } = grid
  const point = (index: number) => grid.point(index)
  const free = Uint8Array.from({ length: grid.length }, (_, index) => Number(grid.free(index)))
  const reachable = new Uint8Array(free.length)
  const indexAt = (p: Vector2) => Math.max(0, Math.min(rows - 1, Math.floor(p.y / stepY))) * columns
    + Math.max(0, Math.min(columns - 1, Math.floor(p.x / stepX)))
  const start = indexAt(spawn)
  const queue: number[] = free[start] ? [start] : []
  if (free[start]) reachable[start] = 1
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!
    for (const next of grid.neighbors(current)) {
      if (Math.abs(next - current) !== columns && Math.floor(next / columns) !== Math.floor(current / columns)) continue
      if (reachable[next]) continue
      reachable[next] = 1
      queue.push(next)
    }
  }
  const freeCount = free.reduce((sum, value) => sum + value, 0)
  return { waterFraction: freeCount / free.length, connectedFraction: queue.length / Math.max(1, freeCount),
    valid: freeCount / free.length >= 0.60 && queue.length / Math.max(1, freeCount) >= 0.98,
    reachablePoints: queue.map(point),
    accessible: (p: Vector2) => grid.safe(p) && reachable[indexAt(p)] === 1 }
}
