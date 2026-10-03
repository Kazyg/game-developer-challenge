import { test, expect } from '@playwright/test'
import { World } from '../src/game/world/World'
import { COMBAT_CONFIG as config } from '../src/game/config/CombatConfig'
import { createEnemy } from '../src/game/entities/Enemy'
import type { EnemyType } from '../src/game/entities/Enemy'
import type { Vector2 } from '../src/game/entities/Island'
import { fireWeapon, tickWeaponCooldowns, updateProjectiles, damageShip, chaserContact } from '../src/game/combat/CombatSystem'
import { stopRepair, updateRepair } from '../src/game/combat/RepairSystem'
import { updateEnemies, avoidNeighbors } from '../src/game/ai/EnemySystem'
import { circlesOverlap, canOccupyWithCircles } from '../src/game/collision/CollisionSystem'
import { SeededRandom } from '../src/game/world/SeededRandom'
import { SpawnSystem, generatePatrolAreas, sampleArea, insidePatrolArea } from '../src/game/world/SpawnSystem'

function arena() {
  const world = new World(42, { combatEnabled: false })
  world.islandColliders.splice(0)
  world.islands.splice(0)
  Object.assign(world, { spawner: new SpawnSystem(world.seed, undefined, [], world.player.position) })
  return world
}

function addEnemy(world: World, type: EnemyType, position: Vector2) {
  Object.assign(world.patrolAreas[0]!, { x: 1600, y: 1600, width: 1000, height: 1000 })
  const enemy = createEnemy(world.nextId('enemy'), type, world.patrolAreas[0]!, position, 42)
  world.enemies.push(enemy)
  return enemy
}

test('each broadside cannonball impacts independently: three hits or just one', () => {
  const all = arena()
  const target = addEnemy(all, 'shooter', { x: 2100, y: 2000 })
  fireWeapon(all, all.player, 'right')
  expect(new Set(all.projectiles.map((p) => p.id)).size).toBe(3)
  expect(new Set(all.projectiles.map((p) => p.collider)).size).toBe(3)
  for (const projectile of all.projectiles) projectile.position = { ...target.colliders[0]!.position }
  updateProjectiles(all, 0.25)
  expect(target.hp).toBe(15)
  expect(target.alive).toBe(true)
  expect(all.score).toBe(0)
  expect(all.projectiles).toHaveLength(0)
  expect(all.effects.filter((effect) => effect.kind === 'impact')).toHaveLength(3)

  const one = arena()
  const narrow = addEnemy(one, 'shooter', { x: 2100, y: 2000 })
  narrow.rotation = Math.PI / 2
  fireWeapon(one, one.player, 'right')
  const ids = one.projectiles.map((p) => p.id)
  updateProjectiles(one, 0.25)
  expect(narrow.hp).toBe(45)
  expect(one.projectiles).toHaveLength(2)
  expect(one.projectiles.map((p) => p.id)).toEqual([ids[0], ids[2]])
  updateProjectiles(one, 0.2)
  expect(narrow.hp).toBe(45)
  expect(one.projectiles).toHaveLength(2)
})

test('weapon cooldowns are independent; front and both sides can fire together', () => {
  const world = arena()
  expect(fireWeapon(world, world.player, 'front')).toBe(true)
  expect(fireWeapon(world, world.player, 'front')).toBe(false)
  expect(fireWeapon(world, world.player, 'left')).toBe(true)
  expect(fireWeapon(world, world.player, 'right')).toBe(true)
  expect(world.projectiles).toHaveLength(7)
  for (let i = 0; i < 60; i++) tickWeaponCooldowns(world.player, 1 / 60)
  expect(fireWeapon(world, world.player, 'front')).toBe(true)
  expect(fireWeapon(world, world.player, 'left')).toBe(false)
  for (let i = 0; i < 90; i++) tickWeaponCooldowns(world.player, 1 / 60)
  expect(fireWeapon(world, world.player, 'left')).toBe(true)
  expect(fireWeapon(world, world.player, 'right')).toBe(true)
})

test('projectiles ignore owner and friendly ships, stop at islands, expire and leave world', () => {
  const world = arena()
  const shooter = addEnemy(world, 'shooter', { x: 2000, y: 2100 })
  const friendly = addEnemy(world, 'shooter', { x: 2000, y: 2050 })
  fireWeapon(world, shooter, 'front')
  updateProjectiles(world, 0.4)
  expect(world.player.hp).toBe(90)
  expect(shooter.hp).toBe(60)
  expect(friendly.hp).toBe(60)
  updateProjectiles(world, 0.4)
  expect(world.player.hp).toBe(90)

  const blocked = arena()
  blocked.islandColliders.push({ type: 'polygon', vertices: [
    { x: 1990, y: 1940 }, { x: 2010, y: 1940 }, { x: 2010, y: 1942 }, { x: 1990, y: 1942 },
  ] })
  fireWeapon(blocked, blocked.player, 'front')
  updateProjectiles(blocked, 0.1)
  expect(blocked.projectiles).toHaveLength(0)
  expect(blocked.effects.some((effect) => effect.kind === 'impact')).toBe(true)
  for (const reason of ['lifetime', 'range', 'bounds'] as const) {
    const empty = arena()
    fireWeapon(empty, empty.player, 'front')
    if (reason === 'lifetime') empty.projectiles[0]!.lifetime = 0.01
    if (reason === 'range') empty.projectiles[0]!.range = 2
    if (reason === 'bounds') empty.projectiles[0]!.position.x = 4001
    updateProjectiles(empty, 0.1)
    expect(empty.projectiles).toHaveLength(0)
  }
})

test('Repair heals at the configured rate and moving or any damage starts the full cooldown', () => {
  const world = arena()
  const player = world.player
  player.hp = 10
  updateRepair(player, true, false, 0)
  for (let i = 0; i < 50; i++) updateRepair(player, false, false, 0.1)
  expect(player.hp).toBeCloseTo(60)
  expect(player.repair.active).toBe(false)
  expect(player.repair.cooldown).toBe(30)
  updateRepair(player, true, false, 0)
  expect(player.repair.active).toBe(false)

  player.repair.cooldown = 0
  updateRepair(player, true, false, 0)
  for (let i = 0; i < 10; i++) updateRepair(player, false, false, 0.1)
  const healedHp = player.hp
  updateRepair(player, false, true, 0.1)
  expect(player.hp).toBe(healedHp)
  expect(player.repair.active).toBe(false)
  expect(player.repair.cooldown).toBe(30)
  player.repair.cooldown = 0
  updateRepair(player, true, false, 0)
  updateRepair(player, false, false, 0.5)
  const beforeDamage = player.hp
  damageShip(world, player, 1)
  expect(player.hp).toBe(beforeDamage - 1)
  expect(player.repair.active).toBe(false)
  expect(player.repair.cooldown).toBe(30)
  stopRepair(player)
  player.hp = 99
  player.repair.cooldown = 0
  updateRepair(player, true, false, 0.5)
  expect(player.hp).toBe(100)
  expect(player.repair.active).toBe(false)
  updateRepair(player, true, false, 0)
  expect(player.repair.active).toBe(false)
})

test('movement attempts cancel Repair even with opposing keys; death removes all active behavior', () => {
  const world = arena()
  world.player.hp = 50
  world.update({ up: false, down: false, left: false, right: false,
    actions: { repair: true, front: false, left: false, right: false } }, 0.1)
  expect(world.player.repair.active).toBe(true)
  world.update({ up: true, down: true, left: false, right: false }, 0.1)
  expect(world.player.repair.active).toBe(false)
  expect(world.player.repair.cooldown).toBe(30)
  const hp = world.player.hp
  world.update({ up: true, down: false, left: false, right: true }, 0.1)
  expect(world.player.position.x).toBeGreaterThan(2000)
  expect(world.player.hp).toBe(hp)
  damageShip(world, world.player, 200)
  const position = { ...world.player.position }
  expect(fireWeapon(world, world.player, 'front')).toBe(false)
  world.update({ up: true, down: false, left: false, right: false }, 0.1)
  expect(world.player.position).toEqual(position)
  expect(world.player.hp).toBe(0)
})

test('Chaser switches patrol/chase and causes contact damage only once before dying', () => {
  const world = arena()
  const chaser = addEnemy(world, 'chaser', { x: 2000, y: 2060 })
  updateEnemies(world, 0.1)
  expect(world.player.hp).toBe(60)
  expect(chaser.alive).toBe(false)
  expect(chaser.state).toBe('DEAD')
  chaserContact(world, chaser)
  updateEnemies(world, 0.1)
  expect(world.player.hp).toBe(60)
  expect(world.effects.filter((effect) => effect.kind === 'explosion')).toHaveLength(1)
  expect(world.canPlayerPose(chaser.position, 0)).toBe(true)
})

test('Shooter approaches, attacks by relative angle with all three weapon categories, and patrols outside vision', () => {
  const world = arena()
  const shooter = addEnemy(world, 'shooter', { x: 2000, y: 2280 })
  updateEnemies(world, 0.1)
  expect(shooter.state).toBe('APPROACH')
  expect(shooter.position.y).toBeLessThan(2280)
  shooter.position = { x: 2000, y: 2200 }
  shooter.rotation = 0
  updateEnemies(world, 0.1)
  expect(shooter.state).toBe('ATTACK')
  expect(world.projectiles).toHaveLength(1)
  shooter.position = { x: 1800, y: 2000 }
  shooter.rotation = 0
  updateEnemies(world, 0.1)
  expect(world.projectiles).toHaveLength(1) // shared enemy cooldown prevents alternating weapons
  shooter.weaponCooldowns = { front: 0, left: 0, right: 0 }
  shooter.rotation = 0
  updateEnemies(world, 0)
  expect(world.projectiles).toHaveLength(4)
  shooter.position = { x: 2200, y: 2000 }
  shooter.weaponCooldowns = { front: 0, left: 0, right: 0 }
  shooter.rotation = 0
  updateEnemies(world, 0)
  expect(world.projectiles).toHaveLength(7)
  const area = world.patrolAreas[0]!
  shooter.position = { x: area.x + area.width / 2, y: area.y + area.height / 2 }
  world.player.position = { x: 0, y: 0 }
  shooter.state = 'PATROL'
  updateEnemies(world, 0.1)
  expect(shooter.state).toBe('PATROL')
  expect(shooter.patrol.kind).toBe('circular')
  expect(insidePatrolArea(shooter.patrol.center, area)).toBe(true)
})

test('spawn areas and enemy destinations are deterministic, and each area caps one enemy per type', () => {
  expect(generatePatrolAreas(42)).toEqual(generatePatrolAreas(42))
  expect(generatePatrolAreas(42)).not.toEqual(generatePatrolAreas(43))
  const a = arena()
  const b = arena()
  a.spawner.update(a); b.spawner.update(b)
  expect(a.enemies).toEqual(b.enemies)
  const initialPopulation = Math.min(config.spawn.maxPopulation, a.patrolAreas.length * 2)
  expect(a.enemies).toHaveLength(initialPopulation)
  for (const area of a.patrolAreas) {
    expect(a.enemies.filter(enemy => enemy.areaId === area.id && enemy.type === 'chaser').length).toBeLessThanOrEqual(1)
    expect(a.enemies.filter(enemy => enemy.areaId === area.id && enemy.type === 'shooter').length).toBeLessThanOrEqual(1)
  }
  a.time = 3
  const dead = a.enemies.slice(0, 3)
  for (const enemy of dead) damageShip(a, enemy, enemy.hp)
  a.time += a.spawner.spawnTime - 0.01
  a.spawner.update(a)
  expect(a.enemies.filter(enemy => enemy.alive)).toHaveLength(initialPopulation - 3)
  a.time += 0.01
  a.spawner.update(a)
  expect(a.enemies.filter(enemy => enemy.alive)).toHaveLength(initialPopulation)
  for (const enemy of dead) {
    const replacement = a.enemies.find(item => item.alive && item.areaId === enemy.areaId && item.type === enemy.type)!
    expect(replacement.id).not.toBe(enemy.id)
    expect(insidePatrolArea(replacement.position, a.patrolAreas.find(area => area.id === enemy.areaId)!)).toBe(true)
  }

})

test('spawn tries other positions in the same area and defers only when all candidates are blocked', () => {
  const world = arena()
  const area = world.patrolAreas[0]!
  Object.assign(area, { x: 1400, y: 1400, width: 1200, height: 1200 })
  const first = sampleArea(area, new SeededRandom(world.seed ^ config.spawn.seedSalt ^ 1))
  world.player.position = first
  world.time = world.spawner.spawnTime
  world.spawner.update(world)
  world.time += world.spawner.spawnTime
  world.spawner.update(world)
  const spawned = world.enemies.filter((enemy) => enemy.areaId === area.id)
  expect(spawned).toHaveLength(2)
  for (const enemy of spawned) {
    expect(enemy.position).not.toEqual(first)
    expect(insidePatrolArea(enemy.position, area)).toBe(true)
    expect(Math.hypot(enemy.position.x - first.x, enemy.position.y - first.y)).toBeGreaterThanOrEqual(config.spawn.playerSafeDistance)
  }
  const blocked = arena()
  for (const area of blocked.patrolAreas.slice(1)) Object.assign(area, { x: -2000, y: -2000 })
  const small = blocked.patrolAreas[0]!
  Object.assign(small, { x: 1920, y: 1920, width: 160, height: 160 })
  blocked.time = blocked.spawner.spawnTime
  blocked.spawner.update(blocked)
  expect(blocked.enemies.filter((enemy) => enemy.areaId === small.id)).toHaveLength(0)
  blocked.player.position = { x: 100, y: 100 }
  for (let i = 0; i < blocked.patrolAreas.length * 2; i++) {
    blocked.time += blocked.spawner.spawnTime
    blocked.spawner.update(blocked)
  }
  // A 160px area cannot hold two safe orbital lanes, even after the player leaves.
  expect(blocked.enemies.filter((enemy) => enemy.areaId === small.id)).toHaveLength(0)
})

test('enemy avoidance and physical collision prevent crossing during patrol, chase and approach/attack', () => {
  for (const mode of ['patrol', 'approach', 'attack'] as const) {
    const world = arena()
    const area = world.patrolAreas[0]!
    Object.assign(area, { x: 1600, y: 1600, width: 1000, height: 1000 })
    world.player.position = mode === 'patrol' ? { x: 100, y: 100 } : { x: 2000, y: 1900 }
    const y = mode === 'approach' ? 2180 : 2100
    const a = addEnemy(world, mode === 'attack' ? 'shooter' : 'chaser', { x: 1985, y })
    const b = addEnemy(world, 'shooter', { x: 2015, y })

    const desired = { x: 0, y: -1 }
    expect(avoidNeighbors(a, desired, world.enemies).x).toBeLessThan(0)
    expect(world.canEnemyPose(a, b.position, a.rotation)).toBe(false)
    for (let frame = 0; frame < 30; frame++) {
      updateEnemies(world, 1 / 60)
      expect(a.colliders.some((circle) => b.colliders.some((other) => circlesOverlap(circle, other)))).toBe(false)
      expect(canOccupyWithCircles(a.colliders, world.islandColliders, world.width, world.height)).toBe(true)
    }
    expect(a.state).toBe(mode === 'patrol' ? 'PATROL' : mode === 'approach' ? 'CHASE' : 'ATTACK')
    expect(b.state).toBe(mode === 'patrol' ? 'PATROL' : mode === 'approach' ? 'APPROACH' : 'ATTACK')
  }
})

test('a projectile immediately interrupts Repair, retaining prior healing and starting 30s cooldown', () => {
  const world = arena()
  world.player.hp = 50
  updateRepair(world.player, true, false, 0)
  updateRepair(world.player, false, false, 1)
  const shooter = addEnemy(world, 'shooter', { x: 2000, y: 2200 })
  fireWeapon(world, shooter, 'front')
  world.projectiles[0]!.position = { ...world.player.colliders[0]!.position }
  updateProjectiles(world, 0)
  expect(world.player.hp).toBe(50)
  expect(world.player.repair.active).toBe(false)
  expect(world.player.repair.healed).toBe(10)
  expect(world.player.repair.cooldown).toBe(30)
})

test('spawn rejects land-covering patrol areas and enemy movement cannot cross islands', () => {
  const world = arena()
  const area = world.patrolAreas[0]!
  Object.assign(area, { x: 1800, y: 2300, width: 300, height: 300 })
  const polygon = { type: 'polygon' as const, vertices: [
    { x: 1750, y: 2250 }, { x: 2150, y: 2250 }, { x: 2150, y: 2650 }, { x: 1750, y: 2650 },
  ] }
  world.islandColliders.push(polygon)
  world.spawner.update(world)
  expect(world.enemies.filter((enemy) => enemy.areaId === area.id)).toHaveLength(0)
  world.enemies.splice(0)
  const chaser = addEnemy(world, 'chaser', { x: 1950, y: 2700 })
  world.player.position = { x: 1950, y: 2150 }
  for (let frame = 0; frame < 120; frame++) {
    updateEnemies(world, 1 / 60)
    expect(canOccupyWithCircles(chaser.colliders, world.islandColliders, world.width, world.height)).toBe(true)
  }
  expect(chaser.position.y).toBeGreaterThan(2650)
  expect(world.player.hp).toBe(100)
})

test('same seed and input sequence reproduce the running combat simulation', () => {
  const a = new World(123)
  const b = new World(123)
  for (let frame = 0; frame < 90; frame++) {
    const input = { up: false, down: false, left: false, right: frame < 30,
      actions: { front: true, left: frame % 10 === 0, right: false, repair: false } }
    a.update(input, 1 / 60)
    b.update(input, 1 / 60)
  }
  expect(JSON.stringify(a)).toBe(JSON.stringify(b))
})






test('population respects the reduced spawn limit across seeds and respawn settings', () => {
  for (const seed of [1, 42, 123, 999, 2026]) {
    const world = new World(seed, { spawnTime: 5 })
    expect(world.time).toBe(0)
    const initialPopulation = world.enemies.length
    expect(initialPopulation).toBeLessThanOrEqual(config.spawn.maxPopulation)
    expect(initialPopulation).toBeGreaterThan(0)
    for (const area of world.patrolAreas) {
      expect(world.enemies.filter(enemy => enemy.areaId === area.id).length).toBeLessThanOrEqual(2)
    }
    const enemy = world.enemies[0]!
    damageShip(world, enemy, enemy.hp)
    world.time = 4.99
    world.spawner.update(world)
    expect(world.enemies.filter(enemy => enemy.alive)).toHaveLength(initialPopulation - 1)
    world.time = 5
    world.spawner.update(world)
    expect(world.enemies.filter(enemy => enemy.alive)).toHaveLength(initialPopulation)
  }
})
