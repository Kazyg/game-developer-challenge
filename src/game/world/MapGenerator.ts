import { GAME_CONFIG as config } from '../config/GameConfig'
import type { Island, Vector2 } from '../entities/Island'
import { SeededRandom } from './SeededRandom'
import { generateIslandShape, ISLAND_SHAPES, transformOutline } from './IslandShapes'
import { ISLAND_SIZE_PROFILES } from './IslandSizes'
import type { IslandSizeCategory } from './IslandSizes'
import { validateMapNavigation } from './MapNavigation'

function placementCandidates(radius: number, islands: readonly Island[], spawn: Vector2, random: SeededRandom): Vector2[] {
  const edge = radius + config.islandMinDistance / 2 + 0.5
  const right = config.worldWidth - edge, bottom = config.worldHeight - edge
  const circles = [...islands.map(island => ({ position: island.position,
    radius: radius + island.boundingRadius + config.islandMinDistance + 0.5 })),
  { position: spawn, radius: radius + config.spawnSafeRadius + 0.5 }]
  const candidates = Array.from({ length: 100 }, () => ({ x: random.range(edge, right), y: random.range(edge, bottom) }))
  candidates.push({ x: edge, y: edge }, { x: right, y: edge }, { x: edge, y: bottom }, { x: right, y: bottom })
  // Tangencies pack varied radii without shrinking the chosen geography or
  // reducing the 140px sea passages. Seeded choice keeps layouts irregular.
  for (const circle of circles) {
    for (const x of [edge, right]) {
      const offset = circle.radius ** 2 - (x - circle.position.x) ** 2
      if (offset >= 0) for (const sign of [-1, 1]) candidates.push({ x, y: circle.position.y + sign * Math.sqrt(offset) })
    }
    for (const y of [edge, bottom]) {
      const offset = circle.radius ** 2 - (y - circle.position.y) ** 2
      if (offset >= 0) for (const sign of [-1, 1]) candidates.push({ x: circle.position.x + sign * Math.sqrt(offset), y })
    }
  }
  for (let i = 0; i < circles.length; i++) for (let j = i + 1; j < circles.length; j++) {
    const a = circles[i]!, b = circles[j]!
    const dx = b.position.x - a.position.x, dy = b.position.y - a.position.y, distance = Math.hypot(dx, dy)
    if (!distance || distance > a.radius + b.radius || distance < Math.abs(a.radius - b.radius)) continue
    const along = (a.radius ** 2 - b.radius ** 2 + distance ** 2) / (2 * distance)
    const height = Math.sqrt(Math.max(0, a.radius ** 2 - along ** 2))
    for (const sign of [-1, 1]) candidates.push({ x: a.position.x + dx / distance * along - sign * dy / distance * height,
      y: a.position.y + dy / distance * along + sign * dx / distance * height })
  }
  return candidates.filter(p => p.x >= edge && p.x <= right && p.y >= edge && p.y <= bottom
    && Math.hypot(p.x - spawn.x, p.y - spawn.y) >= radius + config.spawnSafeRadius
    && islands.every(island => Math.hypot(p.x - island.position.x, p.y - island.position.y)
      >= radius + island.boundingRadius + config.islandMinDistance))
}

export function generateIslands(seed: number, spawn: Vector2): Island[] {
  const random = new SeededRandom(seed)
  const count = random.integer(config.islandMinCount, config.islandMaxCount)
  let hugeCount = 0, largeCount = 0
  // Choose the population first, then place large land masses before small ones.
  // Failed placement cannot silently turn a rare huge island into a small island.
  const plans = Array.from({ length: count }, () => {
    let roll = random.next()
    let category = (Object.keys(ISLAND_SIZE_PROFILES) as IslandSizeCategory[]).find(key => {
      roll -= ISLAND_SIZE_PROFILES[key].weight
      return roll < 0
    }) ?? 'HUGE'
    if (category === 'HUGE' && hugeCount >= 2) category = 'MEDIUM'
    if (category === 'LARGE' && largeCount >= 6) category = 'MEDIUM'
    if (category === 'HUGE') hugeCount++
    if (category === 'LARGE') largeCount++
    const profile = ISLAND_SIZE_PROFILES[category]
    const size = random.range(profile.min, profile.max)
    const variant = random.integer(0, ISLAND_SHAPES.length - 1)
    return { size, variant, sizeCategory: category,
      shape: generateIslandShape(variant, category, random.integer(0, 0xffffffff)), rotation: random.range(-Math.PI, Math.PI) }
  }).sort((a, b) => b.size * b.shape.boundingRadius - a.size * a.shape.boundingRadius)
  let failure = ''
  for (let layout = 0; layout < 24; layout++) {
    const islands: Island[] = []

    for (const { size, variant, shape, rotation, sizeCategory } of plans) {
      const radius = size * shape.boundingRadius
      const candidates = placementCandidates(radius, islands, spawn, random)
      if (!candidates.length) break
      const position = candidates[random.integer(0, candidates.length - 1)]!

      islands.push({
        id: `island-${islands.length}`,
        position,
        size,
        sizeCategory,
        shape,
        variant,
        rotation,
        boundingRadius: radius,
        colliders: [{ type: 'polygon', vertices: transformOutline(shape.outline, position, size, rotation) }],
      })
    }

    if (islands.length < count) { failure = `placed ${islands.length}/${count}`; continue }
    const navigation = validateMapNavigation(islands, spawn)
    if (navigation.valid) return islands
    failure = `water ${navigation.waterFraction}, connected ${navigation.connectedFraction}`
  }
  throw new Error(`Unable to place islands with sufficient navigable corridors for seed ${seed}: ${failure}`)
}

