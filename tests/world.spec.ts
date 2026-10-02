import { expect, test } from '@playwright/test'
import { GAME_CONFIG as config } from '../src/game/config/GameConfig'
import { World } from '../src/game/world/World'
import { Camera } from '../src/game/camera/Camera'
import { canOccupyWithCircles, overlapsCollider, circleOverlapsPolygon } from '../src/game/collision/CollisionSystem'
import { getIslandShape, ISLAND_SHAPES, transformOutline } from '../src/game/world/IslandShapes'
import { shortestAngleDifference, turnTowards } from '../src/game/entities/rotation'
import type { InputState } from '../src/game/input/InputManager'
import type { PolygonCollider } from '../src/game/entities/Island'
import { createPlayer, getPlayerColliders } from '../src/game/entities/Player'
const hullBoundingRadius = Math.max(...config.playerHullCircles.map((circle) => (Math.hypot(circle.x, circle.y) + circle.radius) * config.playerSpriteScale))

const idle: InputState = { up: false, down: false, left: false, right: false }

function advance(world: World, input: InputState, frames = 60) {
  for (let frame = 0; frame < frames; frame++) world.update(input, 1 / frames)
}

test('same seed reproduces shapes, scale, orientation and colliders; placement is safe', () => {
  expect(new World(1234, { combatEnabled: false }).islands).toEqual(new World(1234, { combatEnabled: false }).islands)
  expect(new World(1234, { combatEnabled: false }).islands).not.toEqual(new World(1235, { combatEnabled: false }).islands)
  const variants = new Set<number>()
  for (let seed = 0; seed < 100; seed++) {
    const world = new World(seed, { combatEnabled: false })
    const checks: boolean[] = []
    expect(world.islands.length).toBeGreaterThanOrEqual(config.islandMinCount)
    expect(world.islands.length).toBeLessThanOrEqual(config.islandMaxCount)
    for (const island of world.islands) {
      const position = island.position
      const radius = island.boundingRadius
      variants.add(island.variant)
      checks.push(position.x - radius >= 0, position.y - radius >= 0,
        position.x + radius <= world.width, position.y + radius <= world.height,
        Math.hypot(position.x - world.player.position.x, position.y - world.player.position.y)
          >= radius + config.spawnSafeRadius)
      const collider = island.colliders[0] as PolygonCollider
      const expected = transformOutline(getIslandShape(island).outline, position, island.size, island.rotation)
      checks.push(JSON.stringify(collider.vertices) === JSON.stringify(expected))
      for (const other of world.islands) {
        if (other.id === island.id) continue
        checks.push(Math.hypot(position.x - other.position.x, position.y - other.position.y)
          >= radius + other.boundingRadius + config.islandMinDistance)
      }
    }
    expect(checks.every(Boolean), `Invalid placement for seed ${seed}`).toBe(true)
  }
  expect(variants.size).toBe(ISLAND_SHAPES.length)
})

test('forward movement follows the bow at the same speed independent of FPS', () => {
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) {
    if (x === 0 && y === 0) continue
    const input = { ...idle, up: true }
    const a = new World(42, { combatEnabled: false })
    const b = new World(42, { combatEnabled: false })
    a.player.rotation = b.player.rotation = Math.atan2(x, -y)
    advance(a, input, 60)
    advance(b, input, 30)
    expect(a.player.position.x).toBeCloseTo(b.player.position.x, 8)
    expect(a.player.position.y).toBeCloseTo(b.player.position.y, 8)
    expect(Math.hypot(a.player.position.x - 2000, a.player.position.y - 2000)).toBeCloseTo(config.playerSpeed, 8)
    expect(Math.sign(a.player.position.x - 2000)).toBe(x)
    expect(Math.sign(a.player.position.y - 2000)).toBe(y)
  }
})

test('heading turns smoothly along the shortest path across PI, and idle keeps position and angle', () => {
  expect(shortestAngleDifference(Math.PI - 0.05, -Math.PI + 0.05)).toBeCloseTo(0.1)
  expect(shortestAngleDifference(-Math.PI + 0.05, Math.PI - 0.05)).toBeCloseTo(-0.1)
  expect(turnTowards(Math.PI - 0.05, -Math.PI + 0.05, 0.02)).toBeCloseTo(Math.PI - 0.03)
  expect(turnTowards(-Math.PI + 0.05, Math.PI - 0.05, 0.02)).toBeCloseTo(-Math.PI + 0.03)
  const world = new World(42, { combatEnabled: false })
  world.update({ ...idle, right: true }, 0.1)
  expect(world.player.position.x).toBe(2000)
  expect(world.player.rotation).toBeCloseTo(config.playerRotationSpeed * 0.1)
  advance(world, { ...idle, right: true })
  expect(world.player.rotation).toBeCloseTo(-1.675516081914556)
  const before = JSON.stringify(world.player)
  world.update(idle, 0.1)
  world.update({ ...idle, left: true, right: true }, 0.1)
  expect(JSON.stringify(world.player)).toBe(before)
  const a = new World(42, { combatEnabled: false })
  const b = new World(42, { combatEnabled: false })
  advance(a, { ...idle, down: true }, 60)
  advance(b, { ...idle, down: true }, 30)
  expect(a.player.rotation).toBeCloseTo(b.player.rotation, 8)
  // Native bow points south: offset converts north/east/south/west logical headings.
  for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const spriteRotation = heading + config.spriteRotationOffset
    expect(-Math.sin(spriteRotation)).toBeCloseTo(Math.sin(heading))
    expect(Math.cos(spriteRotation)).toBeCloseTo(-Math.cos(heading))
  }
})

test('polygon collision follows concave shores without blocking empty bounding-circle water', () => {
  const concave: PolygonCollider = { type: 'polygon', vertices: [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 },
    { x: 40, y: 40 }, { x: 40, y: 100 }, { x: 0, y: 100 },
  ] }
  expect(circleOverlapsPolygon({ position: { x: 75, y: 75 }, radius: 10 }, concave)).toBe(false)
  expect(circleOverlapsPolygon({ position: { x: 35, y: 75 }, radius: 10 }, concave)).toBe(true)
  expect(circleOverlapsPolygon({ position: { x: 45, y: 45 }, radius: 10 }, concave)).toBe(true)
  for (const shape of ISLAND_SHAPES) {
    const polygon: PolygonCollider = { type: 'polygon', vertices: transformOutline(shape.outline, { x: 500, y: 500 }, 300, 0.7) }
    expect(circleOverlapsPolygon({ position: { x: 500, y: 500 }, radius: 1 }, polygon)).toBe(true)
    expect(circleOverlapsPolygon({ position: { x: 800, y: 800 }, radius: 1 }, polygon)).toBe(false)
  }
})

test('player cannot cross any island side, can slide diagonally, and stays inside world edges', () => {
  const world = new World(42, { combatEnabled: false })
  const obstacles = world.islands.flatMap((island) => island.colliders)
  for (const variant of ISLAND_SHAPES.keys()) {
    const island = world.islands.find((item) => item.variant === variant
      && item.position.x > 400 && item.position.x < 3600 && item.position.y > 400 && item.position.y < 3600)!
    expect(island).toBeDefined()
    const polygon = island.colliders[0] as PolygonCollider
    for (const direction of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
      const vertex = polygon.vertices.reduce((best, p) =>
        p.x * direction.x + p.y * direction.y > best.x * direction.x + best.y * direction.y ? p : best)
      world.player.position = {
        x: vertex.x + direction.x * (hullBoundingRadius + 2),
        y: vertex.y + direction.y * (hullBoundingRadius + 2),
      }
      const input = { up: direction.y > 0, down: direction.y < 0, left: direction.x > 0, right: direction.x < 0 }
      for (let frame = 0; frame < 60; frame++) {
        world.update(input, 1 / 60)
        expect(world.player.colliders.some((circle) => obstacles.some((collider) => overlapsCollider(circle, collider)))).toBe(false)
      }
      const before = { ...world.player.position }
      const diagonal = direction.x === 0 ? { ...input, right: true } : { ...input, down: true }
      advance(world, diagonal)
      expect(Math.hypot(world.player.position.x - before.x, world.player.position.y - before.y)).toBeLessThanOrEqual(config.playerSpeed + 0.001)
      expect(canOccupyWithCircles(world.player.colliders, obstacles, world.width, world.height)).toBe(true)
    }
  }
  for (const edge of [
    { x: 8.01, y: 26.51, up: true, left: true, down: false, right: false },
    { x: 3991.99, y: 3977.49, up: false, left: false, down: true, right: true },
  ]) {
    world.player.rotation = 0
    world.player.position = { x: edge.x, y: edge.y }
    advance(world, edge)
    expect(world.player.position).toEqual({ x: edge.x, y: edge.y })
  }
})

test('camera clamps at both edges, and resize does not modify simulation', () => {
  const world = new World(42, { combatEnabled: false })
  const before = JSON.stringify(world)
  const camera = new Camera()
  camera.follow(world.player.position, 1280, 720, world.width, world.height)
  expect(camera.position).toEqual({ x: 1360, y: 1640 })
  camera.follow(world.player.position, 800, 600, world.width, world.height)
  expect(JSON.stringify(world)).toBe(before)
  camera.follow({ x: 0, y: 0 }, 800, 600, world.width, world.height)
  expect(camera.position).toEqual({ x: 0, y: 0 })
  camera.follow({ x: 4000, y: 4000 }, 800, 600, world.width, world.height)
  expect(camera.position).toEqual({ x: 3200, y: 3400 })
})


test('hull circles rotate with sprite heading and block contact at the bow', () => {
  const player = createPlayer()
  expect(player.colliders.length).toBe(config.playerHullCircles.length)
  const north = getPlayerColliders(player, { x: 100, y: 100 }, 0)
  const east = getPlayerColliders(player, { x: 100, y: 100 }, Math.PI / 2)
  for (let index = 0; index < north.length; index++) {
    const a = north[index]!
    const b = east[index]!
    expect(b.position.x - 100).toBeCloseTo(-(a.position.y - 100))
    expect(b.position.y - 100).toBeCloseTo(a.position.x - 100)
    expect(b.radius).toBe(a.radius)
  }
  const obstacle = { type: 'circle' as const, position: { x: 100, y: 74 }, radius: 2 }
  expect(canOccupyWithCircles(north, [obstacle], 4000, 4000)).toBe(false)
  expect(canOccupyWithCircles(east, [obstacle], 4000, 4000)).toBe(true)
  const world = new World(42, { combatEnabled: false })
  world.player.position = { x: 16 * config.playerSpriteScale + 0.01, y: 2000 }
  world.update({ ...idle, left: true }, 0.1)
  expect(world.player.rotation).toBe(0)
  expect(canOccupyWithCircles(world.player.colliders, [], world.width, world.height)).toBe(true)
})


test('compound hull slides diagonally along a flat shore', () => {
  const world = new World(42, { combatEnabled: false })
  const polygon = world.islands[0]!.colliders[0] as PolygonCollider
  polygon.vertices = [
    { x: 1800, y: 1600 }, { x: 2200, y: 1600 },
    { x: 2200, y: 1800 }, { x: 1800, y: 1800 },
  ]
  world.player.position = { x: 2000, y: 1840 }
  advance(world, { ...idle, up: true })
  const before = { ...world.player.position }
  advance(world, { ...idle, up: true, right: true })
  expect(world.player.position.x - before.x).toBeGreaterThan(50)
  expect(world.player.colliders.some((circle) => circleOverlapsPolygon(circle, polygon))).toBe(false)
})


