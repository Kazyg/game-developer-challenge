import { GAME_CONFIG } from '../config/GameConfig'
import { pointInPolygon } from '../collision/CollisionSystem'
import type { Vector2 } from '../entities/Island'
import { polygonArea } from './IslandShapes'
import type { IslandShape } from './IslandShapes'
import { islandSizeCategory, ISLAND_SIZE_PROFILES } from './IslandSizes'
import { SeededRandom } from './SeededRandom'

export interface StructurePiece { tile: number; x: number; y: number; rotation?: number }
export interface StructurePreset {
  name: string
  kind: 'fort' | 'wreck'
  width: number
  height: number
  scale: number
  pieces: readonly StructurePiece[]
}

// Visually verified 64px tiles: 77/78 are downward corner towers;
// rotate them by PI for upward corners. 61/62 have only one connector.
// 15/16 are straight walls, 76 is the horizontal gate, 47 points outward.
// 81/82 contain the same stranded, damaged boat; 83/84 contain its cannon/plank.
// Their sand/grass backgrounds are removed by the renderer. 85/86 are rocks,
// 87/88 foliage; 89–96 are damaged/expanded masonry, not ship fragments.
// Walk a closed orthogonal perimeter, selecting corners from their actual ports.
// Concave turns use the same corner tower rotated as a whole tile.
function fortPerimeter(vertices: readonly Vector2[]): StructurePiece[] {
  const cells: Vector2[] = []
  vertices.forEach((a, index) => {
    const b = vertices[(index + 1) % vertices.length]!
    const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
    for (let step = 0; step < length; step++) cells.push({
      x: a.x + Math.sign(b.x - a.x) * step, y: a.y + Math.sign(b.y - a.y) * step,
    })
  })
  const direction = (a: Vector2, b: Vector2) => b.y < a.y ? 0 : b.x > a.x ? 1 : b.y > a.y ? 2 : 3
  return cells.map((p, index) => {
    const ports = [direction(p, cells[(index + cells.length - 1) % cells.length]!),
      direction(p, cells[(index + 1) % cells.length]!)].sort((a, b) => a - b)
    if (ports[1]! - ports[0]! === 2) {
      return { ...p, tile: ports[0] === 0 ? 15 : p.x === 0 && p.y === Math.max(...vertices.map(v => v.y)) ? 76 : 16 }
    }
    const turns = [0, 1, 2, 3].find(turn => {
      const rotated = [(1 + turn) % 4, (2 + turn) % 4].sort((a, b) => a - b)
      return rotated[0] === ports[0] && rotated[1] === ports[1]
    })!
    return { ...p, tile: 77, rotation: turns * Math.PI / 2 }
  })
}

export const STRUCTURE_PRESETS: readonly StructurePreset[] = [
  { name: 'u-fort', kind: 'fort', width: 7, height: 5, scale: 0.55,
    pieces: fortPerimeter([{ x: -3, y: -2 }, { x: -1, y: -2 }, { x: -1, y: 0 },
      { x: 1, y: 0 }, { x: 1, y: -2 }, { x: 3, y: -2 }, { x: 3, y: 2 }, { x: -3, y: 2 }]) },
  { name: 'm-fort', kind: 'fort', width: 9, height: 5, scale: 0.55,
    pieces: fortPerimeter([{ x: -4, y: -2 }, { x: -2, y: -2 }, { x: -2, y: 0 }, { x: -1, y: 0 },
      { x: -1, y: -2 }, { x: 1, y: -2 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: -2 },
      { x: 4, y: -2 }, { x: 4, y: 2 }, { x: -4, y: 2 }]) },
  { name: 'c-fort', kind: 'fort', width: 5, height: 7, scale: 0.55,
    pieces: fortPerimeter([{ x: -2, y: -3 }, { x: 2, y: -3 }, { x: 2, y: -1 }, { x: 0, y: -1 },
      { x: 0, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 3 }, { x: -2, y: 3 }]) },
  { name: 'p-fort', kind: 'fort', width: 5, height: 7, scale: 0.55,
    pieces: fortPerimeter([{ x: -2, y: -3 }, { x: 2, y: -3 }, { x: 2, y: 1 }, { x: 0, y: 1 },
      { x: 0, y: 3 }, { x: -2, y: 3 }]) },
  // Two complete square courtyards are joined by an enclosed passage.
  { name: 'connected-squares', kind: 'fort', width: 11, height: 5, scale: 0.55,
    pieces: fortPerimeter([{ x: -5, y: -2 }, { x: -1, y: -2 }, { x: -1, y: -1 }, { x: 1, y: -1 },
      { x: 1, y: -2 }, { x: 5, y: -2 }, { x: 5, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 1 },
      { x: -1, y: 1 }, { x: -1, y: 2 }, { x: -5, y: 2 }]) },
  { name: 'l-fort', kind: 'fort', width: 5, height: 5, scale: 0.55,
    pieces: fortPerimeter([{ x: -2, y: -2 }, { x: 0, y: -2 }, { x: 0, y: 0 },
      { x: 2, y: 0 }, { x: 2, y: 2 }, { x: -2, y: 2 }]) },
  { name: 'horseshoe-fort', kind: 'fort', width: 3, height: 3, scale: 0.55, pieces: [
    { tile: 45, x: -1, y: -1 }, { tile: 45, x: 1, y: -1 },
    { tile: 15, x: -1, y: 0 }, { tile: 15, x: 1, y: 0 },
    { tile: 78, x: -1, y: 1, rotation: Math.PI }, { tile: 76, x: 0, y: 1 },
    { tile: 77, x: 1, y: 1, rotation: Math.PI },
  ] },
  { name: 'citadel', kind: 'fort', width: 7, height: 5, scale: 0.55, pieces: [
    { tile: 77, x: -3, y: -2 }, { tile: 78, x: 3, y: -2 },
    ...[-2, -1, 0, 1, 2].map(x => ({ tile: x === 0 ? 47 : 16, x, y: -2 })),
    ...[-1, 0, 1].flatMap(y => [{ tile: y === 0 ? 32 : 15, x: -3, y }, { tile: y === 0 ? 31 : 15, x: 3, y }]),
    { tile: 78, x: -3, y: 2, rotation: Math.PI }, { tile: 77, x: 3, y: 2, rotation: Math.PI },
    ...[-2, -1, 0, 1, 2].map(x => ({ tile: x === 0 ? 76 : 16, x, y: 2 })),
    { tile: 14, x: 0, y: 0 },
  ] },
  { name: 'coastal-fort', kind: 'fort', width: 3, height: 3, scale: 0.55, pieces: [
    { tile: 77, x: -1, y: -1 }, { tile: 47, x: 0, y: -1 }, { tile: 78, x: 1, y: -1 },
    { tile: 15, x: -1, y: 0 }, { tile: 15, x: 1, y: 0 },
    { tile: 78, x: -1, y: 1, rotation: Math.PI }, { tile: 76, x: 0, y: 1 }, { tile: 77, x: 1, y: 1, rotation: Math.PI },
  ] },
  { name: 'large-fort', kind: 'fort', width: 5, height: 4, scale: 0.55, pieces: [
    { tile: 77, x: -2, y: -1.5 }, { tile: 16, x: -1, y: -1.5 },
    { tile: 47, x: 0, y: -1.5 }, { tile: 16, x: 1, y: -1.5 }, { tile: 78, x: 2, y: -1.5 },
    { tile: 32, x: -2, y: -0.5 }, { tile: 31, x: 2, y: -0.5 },
    { tile: 15, x: -2, y: 0.5 }, { tile: 15, x: 2, y: 0.5 },
    { tile: 78, x: -2, y: 1.5, rotation: Math.PI }, { tile: 16, x: -1, y: 1.5 },
    { tile: 76, x: 0, y: 1.5 }, { tile: 16, x: 1, y: 1.5 }, { tile: 77, x: 2, y: 1.5, rotation: Math.PI },
  ] },
  { name: 'ruined-fort', kind: 'fort', width: 3, height: 3, scale: 0.55, pieces: [
    { tile: 94, x: -1, y: -1, rotation: Math.PI }, { tile: 90, x: 0, y: -1 }, { tile: 93, x: 1, y: -1, rotation: Math.PI },
    { tile: 89, x: -1, y: 0 }, { tile: 91, x: 1, y: 0 },
    { tile: 93, x: -1, y: 1 },
    { tile: 92, x: 0, y: 1 }, { tile: 94, x: 1, y: 1 },
  ] },
  { name: 'stranded-boat', kind: 'wreck', width: 1.65, height: 1.4, scale: 0.8, pieces: [
    { tile: 81, x: 0.25, y: -0.1 }, { tile: 83, x: -0.45, y: 0.25 },
  ] },
  { name: 'overgrown-wreck', kind: 'wreck', width: 1.65, height: 1.4, scale: 0.8, pieces: [
    { tile: 82, x: 0.25, y: -0.1 }, { tile: 84, x: -0.45, y: 0.25 },
  ] },
]

export const STRUCTURE_TILE_IDS = [...new Set(STRUCTURE_PRESETS.flatMap(p => p.pieces.map(piece => piece.tile)))]
export interface IslandStructure {
  preset: StructurePreset
  position: Vector2
  rotation: number
  role?: 'primary' | 'secondary' | 'coastal'
}

export function structurePoint(structure: IslandStructure, x: number, y: number): Vector2 {
  const unit = 64 * structure.preset.scale / GAME_CONFIG.islandTextureSize
  const cos = Math.cos(structure.rotation), sin = Math.sin(structure.rotation)
  return { x: structure.position.x + unit * (x * cos - y * sin),
    y: structure.position.y + unit * (x * sin + y * cos) }
}

export function insideStructureClearing(point: Vector2, structure: IslandStructure, padding = 0.035): boolean {
  const dx = point.x - structure.position.x, dy = point.y - structure.position.y
  const cos = Math.cos(structure.rotation), sin = Math.sin(structure.rotation)
  const unit = 64 * structure.preset.scale / GAME_CONFIG.islandTextureSize
  return Math.abs(dx * cos + dy * sin) < structure.preset.width * unit / 2 + padding
    && Math.abs(-dx * sin + dy * cos) < structure.preset.height * unit / 2 + padding
}

export function shoreDistance(point: Vector2, outline: readonly Vector2[]): number {
  let nearest = Infinity
  for (let index = 0; index < outline.length; index++) {
    const a = outline[index]!
    const b = outline[(index + 1) % outline.length]!
    const dx = b.x - a.x, dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)))
    nearest = Math.min(nearest, Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy))
  }
  return nearest
}

export function generateIslandStructures(shape: IslandShape, seed: number, islandSize: number): IslandStructure[] {
  const random = new SeededRandom(seed ^ 0x51f07a)
  const result: IslandStructure[] = []
  const category = shape.sizeCategory ?? islandSizeCategory(islandSize)
  const profile = ISLAND_SIZE_PROFILES[category]
  const landArea = polygonArea(shape.outline) * islandSize * islandSize
  const grass = shape.outline.map(p => ({ x: p.x * GAME_CONFIG.islandVegetationInset, y: p.y * GAME_CONFIG.islandVegetationInset }))
  // Narrow sandbars have less useful land than round islands in the same class.
  const capacity = Math.min(profile.maxInterests, Math.max(1, Math.floor(landArea / 24000)))
  const desired = category === 'SMALL' ? Number(random.next() < 0.48)
    : category === 'MEDIUM' ? random.integer(0, Math.min(2, capacity))
    : random.integer(Math.min(category === 'HUGE' ? 2 : 1, capacity), capacity)
  let occupiedArea = 0
  for (let slot = 0; slot < desired; slot++) {
    for (let variantAttempt = 0; variantAttempt < 3; variantAttempt++) {
      const kind = slot === 0 ? (random.next() < 0.8 ? 'fort' : 'wreck')
        : (random.next() < (result.some(s => s.preset.kind === 'wreck') ? 0.15 : 0.4) ? 'wreck' : 'fort')
      const primary = !result.some(s => s.preset.kind === 'fort')
      const names = kind === 'wreck' ? ['stranded-boat', 'overgrown-wreck']
        : primary && category === 'HUGE' ? ['u-fort', 'm-fort', 'c-fort', 'p-fort', 'connected-squares', 'l-fort', 'citadel', 'large-fort']
        : primary && category === 'LARGE' ? ['u-fort', 'm-fort', 'c-fort', 'p-fort', 'connected-squares', 'l-fort', 'large-fort', 'horseshoe-fort', 'coastal-fort']
        : ['horseshoe-fort', 'coastal-fort', 'ruined-fort']
      const variants = STRUCTURE_PRESETS.filter(p => names.includes(p.name))
      const base = variants[variantAttempt === 1 ? variants.length - 1 : random.integer(0, variants.length - 1)]!
      const tileSize = kind === 'fort' ? profile.fortTileSize * (primary ? 1 : 0.78) : 34
      // World-space dimensions keep forts substantial beside the ship, while
      // every tile and its grid offset receive exactly the same scale.
      const preset = { ...base, scale: tileSize / islandSize * GAME_CONFIG.islandTextureSize / 64 }
      const footprintArea = preset.width * preset.height * tileSize * tileSize
      if (occupiedArea + footprintArea > landArea * 0.36) continue
      const candidates: { structure: IslandStructure; score: number }[] = []
      for (let attempt = 0; attempt < 280; attempt++) {
        const structure: IslandStructure = { preset,
          position: { x: random.range(-shape.boundingRadius, shape.boundingRadius), y: random.range(-shape.boundingRadius, shape.boundingRadius) },
          rotation: random.integer(0, 3) * Math.PI / 2,
          role: kind === 'wreck' ? 'coastal' : primary ? 'primary' : 'secondary' }
        const position = structure.position
        if (!pointInPolygon(position, shape.outline)) continue
        // Quarter-turn rotations produce axis-aligned boxes. Include both
        // structures' entire extents, rather than checking just their centers.
        const halfExtents = (s: IslandStructure) => {
          const unit = 64 * s.preset.scale / GAME_CONFIG.islandTextureSize / 2
          const swapped = Math.abs(Math.sin(s.rotation)) > 0.5
          return { x: unit * (swapped ? s.preset.height : s.preset.width), y: unit * (swapped ? s.preset.width : s.preset.height) }
        }
        const extent = halfExtents(structure)
        const separation = 28 / islandSize
        if (result.some(other => {
          const otherExtent = halfExtents(other)
          return Math.abs(position.x - other.position.x) < extent.x + otherExtent.x + separation
            && Math.abs(position.y - other.position.y) < extent.y + otherExtent.y + separation
        })) continue
        const distance = shoreDistance(position, shape.outline)
        const beachDistance = Math.min(0.055, 30 / islandSize)
        if (kind === 'wreck' && (distance > beachDistance || (shape.vegetation && pointInPolygon(position, grass)))) continue
        let valid = true
        // Sample the complete footprint and courtyard, including a setback for forts.
        footprint: for (let y = -preset.height / 2; y <= preset.height / 2 + 0.001; y += preset.height / 8) {
          for (let x = -preset.width / 2; x <= preset.width / 2 + 0.001; x += preset.width / 8) {
            const p = structurePoint(structure, x, y)
            if (!pointInPolygon(p, shape.outline)
              || (kind === 'fort' && shoreDistance(p, shape.outline) < 16 / islandSize)) {
              valid = false
              break footprint
            }
          }
        }
        if (!valid) continue
        // Recessed shoreline points favor bays rather than exposed peninsula tips.
        const sheltered = shape.boundingRadius - Math.hypot(position.x, position.y)
        const nearest = result.length ? Math.min(...result.map(other => Math.hypot(position.x - other.position.x, position.y - other.position.y))) : 0
        const main = result.find(s => s.role === 'primary')
        const mainDistance = main ? Math.hypot(position.x - main.position.x, position.y - main.position.y) : 0
        // Secondary outposts group around the main fort; ruins and wrecks mark
        // other regions. Jitter keeps the first fort away from an identical center.
        const score = kind === 'wreck' ? sheltered - distance + nearest * 0.25
          : !primary && base.name === 'coastal-fort' && main ? distance * 0.2 - mainDistance * 0.3
          : distance * 0.35 + nearest * 0.3
        candidates.push({ structure, score: score + random.range(0, 0.12) })
      }
      candidates.sort((a, b) => b.score - a.score)
      if (candidates[0]) { result.push(candidates[0].structure); occupiedArea += footprintArea; break }
    }
  }
  return result
}
