import { GAME_CONFIG as config } from '../config/GameConfig'
import type { Island, Vector2 } from '../entities/Island'
import { ISLAND_SIZE_PROFILES } from './IslandSizes'
import type { IslandSizeCategory } from './IslandSizes'
import { SeededRandom } from './SeededRandom'

export interface IslandShape {
  name: string
  outline: readonly Vector2[]
  boundingRadius: number
  vegetation: boolean
  sizeCategory?: IslandSizeCategory
}

// Continuous outlines shared by texture masks and colliders. Textures are not stretched in X/Y.
function createShape(name: string, xRadius: number, yRadius: number, lobes: number,
  amplitude: number, vegetation: boolean, bay = 0): IslandShape {
  const outline = Array.from({ length: config.islandOutlinePoints }, (_, index) => {
    const angle = index / config.islandOutlinePoints * Math.PI * 2
    const indentation = bay * Math.exp(-Math.pow(Math.atan2(Math.sin(angle), Math.cos(angle)) / 0.42, 2))
    const radius = 1 - indentation + amplitude * Math.cos(lobes * angle) + amplitude * 0.3 * Math.sin(5 * angle)
    return { x: Math.cos(angle) * xRadius * radius, y: Math.sin(angle) * yRadius * radius }
  })
  return { name, outline, vegetation, boundingRadius: Math.max(...outline.map((p) => Math.hypot(p.x, p.y))) }
}

export const ISLAND_SHAPES: readonly IslandShape[] = [
  createShape('rounded-sand', 0.46, 0.44, 3, 0.06, false),
  createShape('long-sand', 0.52, 0.25, 2, 0.08, false),
  createShape('rounded-green', 0.44, 0.46, 3, 0.1, true),
  createShape('irregular-green', 0.45, 0.4, 3, 0.22, true),
  createShape('crescent-bay', 0.5, 0.44, 3, 0.12, true, 0.72),
  createShape('peninsula', 0.56, 0.3, 2, 0.2, true, 0.4),
  createShape('long-green', 0.52, 0.27, 3, 0.15, true),
]

export function polygonArea(outline: readonly Vector2[]): number {
  return Math.abs(outline.reduce((area, p, index) => {
    const next = outline[(index + 1) % outline.length]!
    return area + p.x * next.y - next.x * p.y
  }, 0)) / 2
}

// Every island gets its own coastline. More points and smaller coves on larger
// land masses preserve the base bay/peninsula silhouette without scaling a copy.
export function generateIslandShape(variant: number, category: IslandSizeCategory, seed: number): IslandShape {
  const base = ISLAND_SHAPES[variant]!
  const profile = ISLAND_SIZE_PROFILES[category]
  const random = new SeededRandom(seed)
  const phase = random.range(-Math.PI, Math.PI)
  const stretchX = random.range(0.94, 1.06), stretchY = random.range(0.94, 1.06)
  const outline = Array.from({ length: profile.coastlinePoints }, (_, index) => {
    const source = index / profile.coastlinePoints * base.outline.length
    const a = base.outline[Math.floor(source)]!, b = base.outline[(Math.floor(source) + 1) % base.outline.length]!
    const fraction = source - Math.floor(source)
    const angle = index / profile.coastlinePoints * Math.PI * 2
    const detail = 1 + profile.roughness * (Math.sin(7 * angle + phase)
      + 0.45 * Math.sin(11 * angle - phase) + 0.25 * Math.cos(17 * angle + phase))
    return { x: (a.x + (b.x - a.x) * fraction) * detail * stretchX,
      y: (a.y + (b.y - a.y) * fraction) * detail * stretchY }
  })
  return { name: `${base.name}-${category.toLowerCase()}`, outline, vegetation: base.vegetation,
    sizeCategory: category, boundingRadius: Math.max(...outline.map(p => Math.hypot(p.x, p.y))) }
}

export function getIslandShape(island: Island): IslandShape {
  return island.shape ?? ISLAND_SHAPES[island.variant]!
}

export function transformOutline(outline: readonly Vector2[], position: Vector2,
  size: number, rotation: number): Vector2[] {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  return outline.map((p) => ({
    x: position.x + size * (p.x * cos - p.y * sin),
    y: position.y + size * (p.x * sin + p.y * cos),
  }))
}
