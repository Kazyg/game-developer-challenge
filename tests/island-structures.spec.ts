import { expect, test } from '@playwright/test'
import { generateIslandDecorations } from '../src/game/world/IslandDecorations'
import { generateIslandStructures, insideStructureClearing, shoreDistance, structurePoint, STRUCTURE_PRESETS, STRUCTURE_TILE_IDS } from '../src/game/world/IslandStructures'
import { generateIslandShape, ISLAND_SHAPES, polygonArea } from '../src/game/world/IslandShapes'
import { ISLAND_SIZE_PROFILES } from '../src/game/world/IslandSizes'
import { generateIslands } from '../src/game/world/MapGenerator'
import { World } from '../src/game/world/World'
import { NAVIGATION_RADIUS, validateMapNavigation } from '../src/game/world/MapNavigation'
import { COMBAT_CONFIG } from '../src/game/config/CombatConfig'
import { pointInPolygon } from '../src/game/collision/CollisionSystem'

test('seeded compositions fit terrain, keep complete structures and clear surrounding foliage', () => {
  const seen = new Set<string>()
  let simple = 0
  for (const shape of ISLAND_SHAPES) for (let seed = 0; seed < 15; seed++) {
    const structures = generateIslandStructures(shape, seed, 540)
    const decorations = generateIslandDecorations(shape, seed, 540)
    expect(decorations).toEqual(generateIslandDecorations(shape, seed, 540))
    expect(decorations.filter(d => STRUCTURE_TILE_IDS.includes(d.tile))).toHaveLength(
      structures.reduce((sum, s) => sum + s.preset.pieces.length, 0))
    for (const structure of structures) {
      seen.add(structure.preset.name)
      for (let y = -structure.preset.height / 2; y <= structure.preset.height / 2 + 0.001; y += structure.preset.height / 8) {
        for (let x = -structure.preset.width / 2; x <= structure.preset.width / 2 + 0.001; x += structure.preset.width / 8) {
          const p = structurePoint(structure, x, y)
          const outline = structure.preset.kind === 'fort' ? shape.outline : shape.outline.map(p => ({ x: p.x * 1.12, y: p.y * 1.12 }))
          expect(pointInPolygon(p, outline)).toBe(true)
        }
      }
      if (structure.preset.kind === 'wreck') expect(shoreDistance(structure.position, shape.outline)).toBeLessThanOrEqual(0.055)
      for (const decoration of decorations.filter(d => !STRUCTURE_TILE_IDS.includes(d.tile))) {
        expect(insideStructureClearing(decoration.position, structure, 34 / 540)).toBe(false)
      }
    }
    const small = generateIslandStructures(shape, seed, 250)
    expect(small.some(s => s.preset.name === 'large-fort')).toBe(false)
    expect(small.length).toBeLessThanOrEqual(1)
    if (!small.length) simple++
  }
  expect(simple).toBeGreaterThan(0)
  expect(seen.has('horseshoe-fort')).toBe(true)
  expect(seen.has('large-fort')).toBe(true)
})

test('every fort wall connector joins a compatible adjacent part, including rotated corners', () => {
  // Clockwise ports: up, right, down, left, verified against the native assets.
  const ports: Record<number, number[]> = { 14: [], 15: [0, 2], 16: [1, 3], 31: [0, 2], 32: [0, 2],
    45: [2], 47: [1, 3], 76: [1, 3], 77: [1, 2], 78: [2, 3], 89: [0, 2], 90: [1, 3], 91: [0, 2],
    92: [1, 3], 93: [0, 1], 94: [0, 3] }
  const directions = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]
  const rotatedPorts = (piece: { tile: number; rotation?: number }) =>
    ports[piece.tile]!.map(port => (port + Math.round((piece.rotation ?? 0) / (Math.PI / 2))) % 4)
  for (const preset of STRUCTURE_PRESETS.filter(p => p.kind === 'fort')) {
    for (const piece of preset.pieces) for (const port of rotatedPorts(piece)) {
      const direction = directions[port]!
      const neighbor = preset.pieces.find(p => p.x === piece.x + direction.x && p.y === piece.y + direction.y)
      expect(neighbor, `${preset.name}, tile ${piece.tile} at ${piece.x},${piece.y}, port ${port}`).toBeDefined()
      expect(rotatedPorts(neighbor!)).toContain((port + 2) % 4)
    }
  }
})

// Keep each expensive navigation/route seed independently timed and reported.
for (let seed = 0; seed < 40; seed++) test(`connected patrol water and coastline complexity, seed ${seed}`, () => {
    const world = new World(seed)
    const navigation = validateMapNavigation(world.islands, world.player.position)
    expect(navigation.valid).toBe(true)
    expect(world.enemies.length).toBeGreaterThan(0)
    expect(world.enemies.length).toBeLessThanOrEqual(COMBAT_CONFIG.spawn.maxPopulation)
    for (const island of world.islands) {
      const category = island.sizeCategory!
      expect(island.shape!.outline).toHaveLength(ISLAND_SIZE_PROFILES[category].coastlinePoints)
    }
    for (const area of world.patrolAreas) {
      let water = 0
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        if (navigation.accessible({ x: area.x + NAVIGATION_RADIUS + x / 6 * (area.width - NAVIGATION_RADIUS * 2),
          y: area.y + NAVIGATION_RADIUS + y / 6 * (area.height - NAVIGATION_RADIUS * 2) })) water++
      }
      expect(water / 49).toBeGreaterThanOrEqual(0.65)
    }
})

test('size classes change coastline complexity, area and density', () => {
  const counts = { SMALL: 0, MEDIUM: 0, LARGE: 0, HUGE: 0 }
  for (let seed = 0; seed < 40; seed++) {
    for (const island of generateIslands(seed, { x: 2000, y: 2000 })) counts[island.sizeCategory!]++
  }
  expect(counts.HUGE).toBeGreaterThan(0)
  expect(counts.HUGE).toBeLessThan(counts.LARGE)
  expect(counts.LARGE).toBeLessThan(counts.MEDIUM)
  expect(counts.LARGE).toBeLessThan(counts.SMALL)
  const small = generateIslandShape(4, 'SMALL', 42), huge = generateIslandShape(4, 'HUGE', 42)
  expect(huge.outline).not.toEqual(small.outline)
  const interests = new Set<string>()
  let complex = 0
  for (let seed = 0; seed < 20; seed++) {
    const shape = generateIslandShape(seed % 7, 'HUGE', seed)
    const structures = generateIslandStructures(shape, seed, 800)
    if (structures.length >= 3) complex++
    structures.forEach(s => interests.add(s.preset.name))
    const occupied = structures.reduce((sum, s) => sum + s.preset.width * s.preset.height * (64 * s.preset.scale / 512) ** 2, 0)
    expect(occupied / polygonArea(shape.outline)).toBeLessThanOrEqual(0.36)
    expect(structures.length).toBeLessThanOrEqual(5)
  }
  expect(complex).toBeGreaterThan(0)
  expect(interests.has('citadel')).toBe(true)
  expect(interests.has('u-fort')).toBe(true)
  expect(generateIslandDecorations(huge, 42, 800).length).toBeGreaterThan(generateIslandDecorations(small, 42, 230).length)
})

test('U fort is generated and renders as a connected recessed perimeter', async ({ page }) => {
  let match: { seed: number; islandIndex: number } | undefined
  for (let seed = 0; seed < 30 && !match; seed++) {
    const islands = generateIslands(seed, { x: 2000, y: 2000 })
    for (const [islandIndex, island] of islands.entries()) {
      if (island.sizeCategory !== 'LARGE' && island.sizeCategory !== 'HUGE') continue
      const structures = generateIslandStructures(island.shape!, seed ^ ((islandIndex + 1) * 0x45d9f3b), island.size)
      if (structures.some(s => s.preset.name === 'u-fort')) { match = { seed, islandIndex }; break }
    }
  }
  expect(match).toBeDefined()
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await page.evaluate(async ({ seed, islandIndex }) => {
    const gamePath = '/src/game/Game.ts'
    const { Game } = await import(gamePath)
    const game = new Game(seed)
    game.world.paused = true
    game.world.enemies.splice(0)
    game.world.player.alive = false
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;inset:0;z-index:100'
    document.body.append(host)
    await game.start(host)
    const control = game.testController()
    control.stopClock()
    const island = game.world.islands[islandIndex]
    control.renderAt(island.position.x - 640, island.position.y - 450, 1280, 900)
    window.addEventListener('u-review-cleanup', () => { game.destroy(); host.remove() }, { once: true })
  }, match!)
  await page.screenshot({ path: 'test-results/u-fort-review.png' })
  await page.evaluate(() => window.dispatchEvent(new Event('u-review-cleanup')))
})

for (const seed of [2, 42, 1234]) {
  test(`visual review of actual island categories and complexes, seed ${seed}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    const categories = await page.evaluate(async seed => {
      const gamePath = '/src/game/Game.ts'
      const { Game } = await import(gamePath)
      const game = new Game(seed)
      game.world.paused = true
      game.world.enemies.splice(0)
      game.world.spawner.areas.splice(0)
      game.world.player.alive = false
      const host = document.createElement('div')
      host.style.cssText = 'position:fixed;inset:0;z-index:100'
      document.body.append(host)
      await game.start(host)
      const control = game.testController()
      control.stopClock()
      window.addEventListener('island-review', event => {
        const category = (event as CustomEvent<string>).detail
        const island = game.world.islands.find((i: { sizeCategory: string }) => i.sizeCategory === category)
        const position = { x: island.position.x - 640, y: island.position.y - 450 }
        control.renderAt(position.x, position.y, 1280, 900)
      })
      window.addEventListener('review-debug', () => control.toggleDebug())
      window.addEventListener('review-cleanup', () => { game.destroy(); host.remove() }, { once: true })
      return [...new Set(game.world.islands.map((i: { sizeCategory: string }) => i.sizeCategory))] as string[]
    }, seed)
    for (const category of categories) {
      await page.evaluate(category => window.dispatchEvent(new CustomEvent('island-review', { detail: category })), category)
      await page.screenshot({ path: `test-results/island-review-${seed}-${category}.png` })
    }
    await page.evaluate(category => {
      window.dispatchEvent(new Event('review-debug'))
      window.dispatchEvent(new CustomEvent('island-review', { detail: category }))
    }, categories[0])
    await page.screenshot({ path: `test-results/island-review-${seed}-debug.png` })
    await page.evaluate(() => window.dispatchEvent(new Event('review-cleanup')))
  })
}

test('structure textures load in the game without rendering errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/game?seed=42')
  await expect(page.locator('canvas')).toHaveCount(1, { timeout: 15000 })
  await expect(page.getByRole('status')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('all new fort types appear in deterministic large-island generation', () => {
  const seen = new Set<string>()
  for (let seed = 0; seed < 120; seed++) {
    const shape = generateIslandShape(seed % ISLAND_SHAPES.length, 'HUGE', seed)
    for (const structure of generateIslandStructures(shape, seed, 860)) seen.add(structure.preset.name)
  }
  for (const name of ['m-fort','c-fort','p-fort','connected-squares']) expect(seen.has(name), name).toBe(true)
})
