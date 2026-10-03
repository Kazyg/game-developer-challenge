import { expect, test } from '@playwright/test'
import { World } from '../src/game/world/World'
import { createEnemy } from '../src/game/entities/Enemy'
import { GAME_CONFIG } from '../src/game/config/GameConfig'
import { COMBAT_CONFIG } from '../src/game/config/CombatConfig'
import { fireWeapon, updateProjectiles } from '../src/game/combat/CombatSystem'
import { FixedStep } from '../src/game/FixedStep'

function arena() {
  const world = new World(42, { combatEnabled: false })
  world.islandColliders.splice(0)
  return world
}
const idle = { up: false, left: false, right: false }
function shooter(world: World) {
  const enemy = createEnemy('test-shooter', 'shooter', world.patrolAreas[0]!, { x: 2000, y: 1900 }, 42)
  world.enemies.push(enemy)
  return enemy
}

test('relative impact hurts both ships, re-arms after small separation and has no timed contact damage', () => {
  const world = arena(), enemy = shooter(world)
  world.canPlayerPose(enemy.position, 0, GAME_CONFIG.playerSpeed)
  const first = { player: world.player.hp, enemy: enemy.hp }
  expect(first.player).toBeLessThan(100)
  expect(60 - first.enemy).toBeCloseTo(100 - first.player)
  world.time += 10
  for (let i = 0; i < 100; i++) world.canPlayerPose(enemy.position, 0, GAME_CONFIG.playerSpeed)
  expect(world.player.hp).toBe(first.player)
  expect(enemy.hp).toBe(first.enemy)
  world.player.position.y += 1
  world.update(idle, 1 / 60)
  world.canPlayerPose(enemy.position, 0, GAME_CONFIG.playerSpeed)
  expect(world.player.hp).toBeCloseTo(first.player - (100 - first.player))
  expect(enemy.hp).toBeCloseTo(first.enemy - (60 - first.enemy))
})

test('a moving Shooter hits a stationary player; opposing velocities add and separating velocity causes no damage', () => {
  for (const playerSpeed of [0, GAME_CONFIG.playerSpeed]) {
    const world = arena(), enemy = shooter(world)
    enemy.rotation = Math.PI
    world.setShipVelocity(world.player.id, 0, playerSpeed)
    world.canEnemyPose(enemy, world.player.position, Math.PI, enemy.speed)
    const expected = COMBAT_CONFIG.collision.maxDamage * (playerSpeed + enemy.speed) / (GAME_CONFIG.playerSpeed * 1.3)
    expect(world.player.hp).toBeCloseTo(100 - expected)
    expect(enemy.hp).toBeCloseTo(60 - expected)
  }
  const world = arena(), enemy = shooter(world)
  world.canEnemyPose(enemy, world.player.position, 0, enemy.speed)
  expect(world.player.hp).toBe(100)
  expect(enemy.hp).toBe(60)
})

test('minimum-speed island contacts block and never damage; Shooter impacts do not share that threshold', () => {
  const world = arena()
  world.islandColliders.push({ type: 'circle', position: { x: 2000, y: 1900 }, radius: 40 })
  expect(world.canPlayerPose({ x: 2000, y: 1900 }, 0, GAME_CONFIG.playerSpeed)).toBe(false)
  expect(world.player.hp).toBe(100)
  world.canPlayerPose({ x: 2000, y: 1900 }, 0, GAME_CONFIG.playerSpeed * 1.3)
  expect(world.player.hp).toBe(95)
  world.islandColliders.splice(0)
  const enemy = shooter(world)
  world.canPlayerPose(enemy.position, 0, 1)
  expect(enemy.hp).toBeLessThan(60)
  expect(world.player.hp).toBeLessThan(95)
})

test('fixed-step collision results agree at 30, 60 and 144 FPS', () => {
  const results = [30, 60, 144].map(fps => {
    const world = arena(), enemy = shooter(world)
    const clock = new FixedStep()
    for (let i = 0; i < fps; i++) clock.advance(1 / fps, dt => { world.update({ ...idle, up: true }, dt); return true })
    return { hp: world.player.hp, enemyHp: enemy.hp, position: world.player.position }
  })
  for (const result of results) {
    expect(result.hp).toBeCloseTo(results[0]!.hp)
    expect(result.enemyHp).toBeCloseTo(results[0]!.enemyHp)
    expect(result.position.y).toBeCloseTo(results[0]!.position.y)
  }
})

test('enlarged shot resolves terrain before ships, preserves salvo spacing and splashes only on expiry', () => {
  const world = arena(), enemy = shooter(world)
  enemy.position = { x: 2100, y: 2000 }
  fireWeapon(world, world.player, 'right')
  const shots = world.projectiles
  expect(shots[1]!.position.y - shots[0]!.position.y).toBeCloseTo(-44.8)
  expect(shots[2]!.position.y - shots[1]!.position.y).toBeCloseTo(-44.8)
  expect(shots[1]!.position.x - world.player.position.x).toBe(COMBAT_CONFIG.weapons.playerSideOffset)
  world.projectiles.splice(0, 1); world.projectiles.splice(1)
  world.islandColliders.push({ type: 'circle', position: { x: 2070, y: 2000 }, radius: 10 })
  world.projectiles[0]!.speed = 12000
  updateProjectiles(world, 1 / 60)
  expect(enemy.hp).toBe(60)
  expect(world.projectiles).toHaveLength(0)
  expect(world.effects.filter(effect => effect.kind === 'splash')).toHaveLength(0)
  expect(world.effects.filter(effect => effect.kind === 'impact')).toHaveLength(1)
  world.islandColliders.splice(0)
  fireWeapon(world, world.player, 'front')
  world.projectiles[0]!.range = 1
  updateProjectiles(world, 1 / 60)
  expect(world.effects.filter(effect => effect.kind === 'splash')).toHaveLength(1)
  updateProjectiles(world, 1 / 60)
  expect(world.effects.filter(effect => effect.kind === 'splash')).toHaveLength(1)
  const age = world.effects.at(-1)!.age
  world.paused = true
  world.update(idle, 1)
  expect(world.effects.at(-1)!.age).toBe(age)
})

test('persistent physical overlap remains latched even when centers drift apart', () => {
  const world = arena(), enemy = shooter(world)
  world.player.position.y = 1940
  enemy.rotation = Math.PI
  world.canEnemyPose(enemy, world.player.position, Math.PI, enemy.speed)
  const hp = world.player.hp
  for (let i = 0; i < 10; i++) {
    world.player.position.y += 0.1
    world.update(idle, 1 / 60)
    world.canEnemyPose(enemy, world.player.position, Math.PI, enemy.speed)
  }
  expect(world.player.hp).toBe(hp)
})
