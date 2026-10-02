import { pointInPolygon } from '../collision/CollisionSystem'
import type { Vector2 } from '../entities/Island'
import type { IslandShape } from './IslandShapes'
import { SeededRandom } from './SeededRandom'
import { generateIslandStructures, insideStructureClearing, structurePoint } from './IslandStructures'
import { islandSizeCategory, ISLAND_SIZE_PROFILES } from './IslandSizes'
import { GAME_CONFIG } from '../config/GameConfig'
export interface IslandDecoration { tile: number; position: Vector2; scale: number; rotation: number; region: 'interior' | 'coast' }
export function generateIslandDecorations(shape: IslandShape, seed: number, islandSize = 300): IslandDecoration[] {
  const random = new SeededRandom(seed)
  const inner = shape.outline.map(p => ({ x: p.x * 0.66, y: p.y * 0.66 }))
  const coast = shape.outline.map(p => ({ x: p.x * 0.92, y: p.y * 0.92 }))
  const beach = shape.outline.map(p => ({ x: p.x * 0.78, y: p.y * 0.78 }))
  const category = shape.sizeCategory ?? islandSizeCategory(islandSize)
  const profile = ISLAND_SIZE_PROFILES[category]
  const clusterCount = { SMALL: 1, MEDIUM: 2, LARGE: 4, HUGE: 6 }[category]
  const clusters = Array.from({ length: clusterCount }, () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const p = { x: random.range(-shape.boundingRadius, shape.boundingRadius), y: random.range(-shape.boundingRadius, shape.boundingRadius) }
      if (pointInPolygon(p, inner)) return p
    }
    return { x: 0, y: 0 }
  })
  const result: IslandDecoration[] = []
  const structures = generateIslandStructures(shape, seed, islandSize)
  // A jittered grid with inland clusters; rocks follow the beach band.
  const spacing = profile.decorationSpacing / islandSize
  const pixelScale = GAME_CONFIG.islandTextureSize / (64 * islandSize)
  for (let y = -shape.boundingRadius; y < shape.boundingRadius; y += spacing) {
    for (let x = -shape.boundingRadius; x < shape.boundingRadius; x += spacing) {
      const position = { x: x + random.range(-spacing * 0.22, spacing * 0.22), y: y + random.range(-spacing * 0.22, spacing * 0.22) }
      if (!pointInPolygon(position, coast)) continue
      // Include each decoration's visible radius in the courtyard/beach clearing.
      if (structures.some(structure => insideStructureClearing(position, structure, 34 / islandSize))) continue
      const interior = shape.vegetation && pointInPolygon(position, inner)
      if (interior) {
        const nearCluster = clusters.some(center => Math.hypot(position.x - center.x, position.y - center.y) < 75 / islandSize)
        if (random.range(0, 1) > (nearCluster ? 0.85 : 0.4)) continue
        result.push({ tile: nearCluster ? [70, 72][random.integer(0, 1)]! : [87, 88][random.integer(0, 1)]!, position,
          scale: (nearCluster ? random.range(26, 36) : random.range(10, 16)) * pixelScale, rotation: random.range(-0.3, 0.3), region: 'interior' })
      } else if (!pointInPolygon(position, beach) && random.range(0, 1) < 0.16) {
        result.push({ tile: [49, 51][random.integer(0, 1)]!, position, scale: random.range(12, 20) * pixelScale, rotation: random.range(-0.5, 0.5), region: 'coast' })
      }
    }
  }
  for (const structure of structures) {
    for (const piece of structure.preset.pieces) {
      result.push({ tile: piece.tile, position: structurePoint(structure, piece.x, piece.y),
        scale: structure.preset.scale, rotation: structure.rotation + (piece.rotation ?? 0),
        region: structure.preset.kind === 'fort' ? 'interior' : 'coast' })
    }
  }
  return result
}
