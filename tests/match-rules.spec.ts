import { GAME_CONFIG } from '../src/game/config/GameConfig'
import { test, expect } from '@playwright/test'
import { World } from '../src/game/world/World'
import { createEnemy } from '../src/game/entities/Enemy'
import { damageShip, fireWeapon, updateProjectiles, chaserContact } from '../src/game/combat/CombatSystem'
import { COMBAT_CONFIG } from '../src/game/config/CombatConfig'

const idle = { up: false, down: false, left: false, right: false }
function arena(duration = 60) {
  const world = new World(42, { duration })
  world.islands.splice(0); world.islandColliders.splice(0)
  return world
}
test('W advances along bow, A/D only turn and movement can fire simultaneously', () => {
  const world = arena()
  world.update({ ...idle, right: true }, 0.1)
  expect(world.player.position).toEqual({ x: 2000, y: 2000 })
  expect(world.player.rotation).toBeCloseTo(24 * Math.PI / 180)
  world.update({ ...idle, left: true }, 0.1)
  expect(world.player.rotation).toBeCloseTo(0)
  world.update({ ...idle, up: true, actions: { front: true, left: true, right: true, repair: false } }, 0.1)
  expect(world.player.position.y).toBeCloseTo(2000 - GAME_CONFIG.playerSpeed * 0.1)
  expect(world.projectiles).toHaveLength(7)
  world.update({ ...idle, down: true }, 0.1)
  expect(world.player.position.y).toBeCloseTo(2000 - GAME_CONFIG.playerSpeed * 0.1)
})

test('front projectile range follows its team configuration and distant hulls receive no damage', () => {
  for (const team of ['player', 'enemy'] as const) {
    const world = arena()
    const shooter = createEnemy('enemy', 'shooter', world.patrolAreas[0]!, { x: 2000, y: 2200 }, 42)
    world.enemies.push(shooter)
    const owner = team === 'player' ? world.player : shooter
    fireWeapon(world, owner, 'front')
    const projectile = world.projectiles[0]!
    expect(projectile.range).toBe(team === 'player' ? COMBAT_CONFIG.projectile.playerFrontRange : COMBAT_CONFIG.enemyVisionRange)
    const target = team === 'player' ? shooter : world.player
    projectile.range = 4
    projectile.position = { x: 1000, y: 1000 }
    projectile.direction = { x: 1, y: 0 }
    // Only the final sample intersects the stern collider.
    target.rotation = Math.PI / 2
    target.position = { x: 1100, y: 1000 }
    const hp = target.hp
    updateProjectiles(world, 0.1)
    expect(target.hp).toBe(hp)
    expect(world.projectiles).toHaveLength(0)
    expect(projectile.distance).toBe(4)
  }
})

test('kills score once, Chaser contact never scores, and completion freezes score', () => {
  const world = arena()
  for (const type of ['chaser', 'shooter'] as const) {
    const enemy = createEnemy(type, type, world.patrolAreas[0]!, { x: 2100, y: 2000 }, 42)
    world.enemies.push(enemy)
    damageShip(world, enemy, enemy.hp, 'player')
    damageShip(world, enemy, enemy.maxHp, 'player')
  }
  expect(world.score).toBe(2)
  const suicide = createEnemy('suicide', 'chaser', world.patrolAreas[0]!, { x: 2000, y: 2000 }, 42)
  world.enemies.push(suicide)
  chaserContact(world, suicide)
  expect(world.score).toBe(2)
  expect(world.effects.filter(effect => effect.kind === 'explosion')).toHaveLength(3)
  world.finish('timeExpired')
  const enemy = createEnemy('later', 'shooter', world.patrolAreas[0]!, { x: 2100, y: 2000 }, 42)
  damageShip(world, enemy, enemy.hp, 'player')
  expect(enemy.alive).toBe(true)
  expect(world.score).toBe(2)
})

test('duration clamps to 60–180 and pause freezes all gameplay until explicit resume', () => {
  expect(arena(10).duration).toBe(60)
  expect(arena(500).duration).toBe(180)
  const world = arena(90)
  world.player.hp = 50
  world.update({ ...idle, actions: { front: true, left: false, right: false, repair: true } }, 0.1)
  world.paused = true
  const snapshot = JSON.stringify(world)
  world.update({ ...idle, up: true }, 0.1)
  updateProjectiles(world, 0.1)
  damageShip(world, world.player, 20)
  world.spawner.update(world)
  expect(fireWeapon(world, world.player, 'right')).toBe(false)
  expect(JSON.stringify(world)).toBe(snapshot)
  world.paused = false
  world.time = world.duration - 0.05
  world.update(idle, 0.1)
  expect(world.time).toBe(90)
  expect(world.timeRemaining).toBe(0)
  expect(world.endReason).toBe('timeExpired')
  expect(world.gameOver).toBe(true)
  const finished = JSON.stringify(world)
  world.update({ ...idle, up: true }, 0.1)
  expect(JSON.stringify(world)).toBe(finished)
})

