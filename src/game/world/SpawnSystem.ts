import { planLanes, safeRoute } from '../ai/PatrolNavigation'
import type { PatrolPlan } from '../entities/Enemy'
import { COMBAT_CONFIG as config } from '../config/CombatConfig'
import { GAME_CONFIG } from '../config/GameConfig'
import { canOccupyWithCircles } from '../collision/CollisionSystem'
import type { PatrolArea } from '../entities/Combat'
import { createEnemy } from '../entities/Enemy'
import type { Enemy, EnemyType } from '../entities/Enemy'
import { getPlayerColliders } from '../entities/Player'
import type { Island, Vector2 } from '../entities/Island'
import { validateMapNavigation } from './MapNavigation'
import { SeededRandom } from './SeededRandom'
import type { World } from './World'

export { ENEMY_HULL_RADIUS as SHIP_MARGIN } from '../entities/HullGeometry'
import { ENEMY_HULL_RADIUS as SHIP_MARGIN } from '../entities/HullGeometry'

export function insidePatrolArea(position: Vector2, area: PatrolArea, margin = SHIP_MARGIN): boolean {
  return position.x >= area.x + margin && position.x <= area.x + area.width - margin
    && position.y >= area.y + margin && position.y <= area.y + area.height - margin
}

export function sampleArea(area: PatrolArea, random: SeededRandom): Vector2 {
  return { x: random.range(area.x + SHIP_MARGIN, area.x + area.width - SHIP_MARGIN),
    y: random.range(area.y + SHIP_MARGIN, area.y + area.height - SHIP_MARGIN) }
}

const COVERAGE_SAMPLES = 7
const SECTOR_COLUMNS = 5
const SEARCH_SAMPLES = 5
const MIN_SECTOR_COVERAGE = 0.70
const MIN_FALLBACK_COVERAGE = 0.75
const FALLBACK_AREA_SIZE = 320
const SHRINK_EXTENTS = [480, FALLBACK_AREA_SIZE, 240] as const
type MapNavigation = ReturnType<typeof validateMapNavigation>

function waterCoverage(area: PatrolArea, navigation: MapNavigation | undefined, spawn: Vector2): number {
  let valid = 0
  for (let y = 0; y < COVERAGE_SAMPLES; y++) for (let x = 0; x < COVERAGE_SAMPLES; x++) {
    const p = { x: area.x + SHIP_MARGIN + x / (COVERAGE_SAMPLES - 1) * (area.width - SHIP_MARGIN * 2),
      y: area.y + SHIP_MARGIN + y / (COVERAGE_SAMPLES - 1) * (area.height - SHIP_MARGIN * 2) }
    if (!navigation || (navigation.accessible(p) && Math.hypot(p.x - spawn.x, p.y - spawn.y) >= config.spawn.playerSafeDistance)) valid++
  }
  return valid / (COVERAGE_SAMPLES ** 2)
}
function safeSpawn(lanes: readonly PatrolPlan[], spawn: Vector2): boolean {
  return lanes.every(route => Math.abs(Math.hypot(route.center.x - spawn.x, route.center.y - spawn.y) - route.radius)
    >= config.spawn.playerSafeDistance)
}
function shuffleSectors(random: SeededRandom): number[] {
  const cells = Array.from({ length: SECTOR_COLUMNS ** 2 }, (_, index) => index)
    .filter(index => index !== Math.floor(SECTOR_COLUMNS ** 2 / 2))
  for (let index = cells.length - 1; index > 0; index--) {
    const other = random.integer(0, index)
    const value = cells[index]!
    cells[index] = cells[other]!
    cells[other] = value
  }
  return cells
}

function findWaterArea(initial: PatrolArea, cell: number, navigation: MapNavigation | undefined,
  coverage: (area: PatrolArea) => number): PatrolArea | null {
  let area = initial
  const { x, y, width: size } = initial
  const columns = SECTOR_COLUMNS
  const cellWidth = GAME_CONFIG.worldWidth / columns
  const cellHeight = GAME_CONFIG.worldHeight / columns
  if (navigation && coverage(area) < MIN_SECTOR_COVERAGE) {
    let found = false
    for (const extent of [size, ...SHRINK_EXTENTS]) {
      let best = area, bestCoverage = -1
      // Reposition within the same sector first, keeping the established spread.
      for (let row = 0; row < SEARCH_SAMPLES; row++) for (let column = 0; column < SEARCH_SAMPLES; column++) {
        const candidate = { id: area.id,
          x: cell % columns * cellWidth + column / (SEARCH_SAMPLES - 1) * (cellWidth - extent),
          y: Math.floor(cell / columns) * cellHeight + row / (SEARCH_SAMPLES - 1) * (cellHeight - extent), width: extent, height: extent }
        const candidateCoverage = coverage(candidate)
        if (candidateCoverage > bestCoverage) { best = candidate; bestCoverage = candidateCoverage }
      }
      if (bestCoverage >= MIN_SECTOR_COVERAGE) { area = best; found = true; break }
    }
    if (!found) {
      // Rare deeply occupied sectors use the closest connected open-water patch.
      const center = { x: x + size / 2, y: y + size / 2 }
      const points = [...navigation.reachablePoints].sort((a, b) =>
        Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y))
      for (const p of points) {
        const candidate = { id: area.id, x: Math.max(0, Math.min(GAME_CONFIG.worldWidth - FALLBACK_AREA_SIZE, p.x - FALLBACK_AREA_SIZE / 2)),
          y: Math.max(0, Math.min(GAME_CONFIG.worldHeight - FALLBACK_AREA_SIZE, p.y - FALLBACK_AREA_SIZE / 2)), width: FALLBACK_AREA_SIZE, height: FALLBACK_AREA_SIZE }
        if (coverage(candidate) >= MIN_FALLBACK_COVERAGE) { area = candidate; found = true; break }
      }
      if (!found) return null
    }
  }
  return area
}

export function generatePatrolAreas(seed: number, islands: readonly Island[] = [], spawn: Vector2 = { x: GAME_CONFIG.worldWidth / 2, y: GAME_CONFIG.worldHeight / 2 }): PatrolArea[] {
  const random = new SeededRandom(seed ^ config.spawn.seedSalt)
  const areas: PatrolArea[] = []
  const routes: PatrolPlan[] = []
  const size = config.spawn.areaSize
  const navigation = islands.length ? validateMapNavigation(islands, spawn) : undefined
  const coverage = (area: PatrolArea) => waterCoverage(area, navigation, spawn)
  const columns = SECTOR_COLUMNS
  const cellWidth = GAME_CONFIG.worldWidth / columns
  const cellHeight = GAME_CONFIG.worldHeight / columns
  const cells = shuffleSectors(random)
  for (const cell of cells.slice(0, config.spawn.areaCount)) {
    const x = cell % columns * cellWidth + random.range(0, cellWidth - size)
    const y = Math.floor(cell / columns) * cellHeight + random.range(0, cellHeight - size)
    let area: PatrolArea = { id: `area-${areas.length}`, x, y, width: size, height: size }
    const waterArea = findWaterArea(area, cell, navigation, coverage)
    if (!waterArea) continue
    area = waterArea
    let lanes = planLanes(area, islands, routes)
    if (lanes && !safeSpawn(lanes, spawn)) lanes = null
    if (!lanes) {
      for (let attempt = 0; attempt < config.spawn.areaAttempts; attempt++) {
        const candidate = { id: area.id, x: random.range(0, GAME_CONFIG.worldWidth - size),
          y: random.range(0, GAME_CONFIG.worldHeight - size), width: size, height: size }
        if (coverage(candidate) < MIN_SECTOR_COVERAGE) continue
        const planned = planLanes(candidate, islands, routes)
        if (planned && safeSpawn(planned, spawn)) { area = candidate; lanes = planned; break }
      }
    }
    if (!lanes) continue
    routes.push(...lanes)
    areas.push(area)
  }
  return areas
}

interface SpawnSlot {
  area: PatrolArea
  type: EnemyType
  nextSpawn: number
  random: SeededRandom
}

export class SpawnSystem {
  readonly areas: PatrolArea[]
  private readonly slots: SpawnSlot[]
  readonly lanes = new Map<string, [PatrolPlan, PatrolPlan]>()
  readonly spawnTime: number

  constructor(seed: number, spawnTime: number = config.spawn.respawnInterval, islands: readonly Island[] = [], spawn?: Vector2) {
    this.spawnTime = Math.max(1, spawnTime)
    this.areas = generatePatrolAreas(seed, islands, spawn)
    const routes: PatrolPlan[] = []
    for (const area of this.areas) {
      const lanes = planLanes(area, islands, routes)
      if (lanes) { this.lanes.set(area.id, lanes); routes.push(...lanes) }
    }
    this.slots = this.areas.flatMap((area, index) => (['chaser', 'shooter'] as const).map((type, typeIndex) => ({
      area, type, nextSpawn: 0,
      random: new SeededRandom(seed ^ config.spawn.seedSalt ^ (index * 2 + typeIndex + 1)),
    }))).slice(0, config.spawn.maxPopulation)
  }

  scheduleRespawn(enemy: Enemy, time: number) {
    const slot = this.slots.find((item) => item.area.id === enemy.areaId && item.type === enemy.type)
    if (slot) slot.nextSpawn = time + this.spawnTime
  }

  update(world: World) {
    if (world.gameOver || world.paused) return
    if (world.enemies.filter(enemy => enemy.alive).length >= config.spawn.maxPopulation) return
    for (const slot of this.slots) {
      if (world.enemies.filter(enemy => enemy.alive).length >= config.spawn.maxPopulation) break
      if (world.time < slot.nextSpawn || world.enemies.some((enemy) =>
        enemy.alive && enemy.areaId === slot.area.id && enemy.type === slot.type)) continue
      let reserved = this.lanes.get(slot.area.id)
      if (reserved && !reserved.every(route => safeRoute(route, slot.area, world.islands))) {
        const others = [...this.lanes.entries()].filter(([id]) => id !== slot.area.id).flatMap(([, routes]) => routes)
        reserved = planLanes(slot.area, world.islands, others) ?? undefined
        if (reserved) this.lanes.set(slot.area.id, reserved)
        else this.lanes.delete(slot.area.id)
      }
      const plan = this.lanes.get(slot.area.id)?.[slot.type === 'chaser' ? 0 : 1]
      if (!plan) continue
      const obstacles = [...world.islandColliders,
        ...world.enemies.filter((enemy) => enemy.alive).flatMap((enemy) => enemy.colliders),
        ...(world.player.alive ? world.player.colliders : [])]
      let position: Vector2 | null = null
      for (let attempt = 0; attempt < config.spawn.positionAttempts; attempt++) {
        const angle = slot.random.range(0, Math.PI * 2)
        const candidate = { x: plan.center.x + Math.cos(angle) * plan.radius,
          y: plan.center.y + Math.sin(angle) * plan.radius }
        if (!insidePatrolArea(candidate, slot.area)) continue
        if (world.player.alive && Math.hypot(candidate.x - world.player.position.x,
          candidate.y - world.player.position.y) < config.spawn.playerSafeDistance) continue
        const circles = getPlayerColliders({ position: candidate, rotation: 0, team: 'enemy' })
        if (canOccupyWithCircles(circles, obstacles, world.width, world.height)) { position = candidate; break }
      }
      if (position) {
        const enemy = createEnemy(world.nextId('enemy'), slot.type, slot.area, position,
          slot.random.integer(0, 0xffffffff), () => true, plan)
        const angle = Math.atan2(position.y - plan.center.y, position.x - plan.center.x)
        enemy.rotation = angle + (plan.direction === 1 ? Math.PI : 0)
        world.enemies.push(enemy)
      } else {
        slot.nextSpawn = world.time + config.spawn.retryInterval
      }
    }
  }
}

