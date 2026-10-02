import { test, expect } from '@playwright/test'
import { World } from '../src/game/world/World'
import { GAME_CONFIG } from '../src/game/config/GameConfig'
import { createEnemy } from '../src/game/entities/Enemy'
import { fireWeapon, tickWeaponCooldowns } from '../src/game/combat/CombatSystem'

function arena() {
  const world = new World(42, { combatEnabled: false })
  world.islandColliders.splice(0)
  return world
}

const forward = { up: true, left: false, right: false }

test('straight sailing accelerates from distance and loses the bonus on turns and stops', () => {
  const world = arena()
  for (let i = 0; i < 120; i++) world.update(forward, 1 / 60)
  expect(world.playerMovementSpeed).toBeCloseTo(GAME_CONFIG.playerSpeed * 1.3)
  world.update({ ...forward, right: true }, 1 / 60)
  expect(world.playerMovementSpeed).toBe(GAME_CONFIG.playerSpeed)
  for (let i = 0; i < 30; i++) world.update(forward, 1 / 60)
  expect(world.playerMovementSpeed).toBeGreaterThan(GAME_CONFIG.playerSpeed)
  world.update({ ...forward, up: false }, 1 / 60)
  expect(world.playerMovementSpeed).toBe(GAME_CONFIG.playerSpeed)
})

test('lateral shots deal fifteen damage each and reload after 1.5 seconds', () => {
  const world = arena()
  fireWeapon(world, world.player, 'left')
  expect(world.projectiles.map(p => p.damage)).toEqual([15, 15, 15])
  tickWeaponCooldowns(world.player, 1.49)
  expect(fireWeapon(world, world.player, 'left')).toBe(false)
  tickWeaponCooldowns(world.player, 0.01)
  expect(fireWeapon(world, world.player, 'left')).toBe(true)
  fireWeapon(world, world.player, 'front')
  expect(world.projectiles.at(-1)!.damage).toBe(30)
  expect(world.projectiles.at(-1)!.radius).toBe(7.2)
  expect(world.projectiles.at(-1)!.range).toBe(360)
  expect(world.projectiles[0]!.range).toBe(300)
  expect(world.projectiles[0]!.radius).toBe(4)
})

test('island impact damage scales with speed and is limited per impact interval', () => {
  const world = arena()
  world.islandColliders.push({ type: 'circle', position: { x: 2000, y: 1900 }, radius: 20 })
  const pose = { x: 2000, y: 1900 }
  world.canPlayerPose(pose, 0)
  expect(world.player.hp).toBe(100)
  world.canPlayerPose(pose, 0, GAME_CONFIG.playerSpeed * 1.3)
  expect(world.player.hp).toBe(95)
  world.canPlayerPose(pose, 0, GAME_CONFIG.playerSpeed * 1.3)
  expect(world.player.hp).toBe(95)
  world.time += 1
  world.canPlayerPose(pose, 0, GAME_CONFIG.playerSpeed * 1.3 / 2)
  expect(world.player.hp).toBe(92.5)
})

test('moving into a shooter causes damage but pose queries do not', () => {
  const world = arena()
  const enemy = createEnemy('shooter', 'shooter', world.patrolAreas[0]!, { x: 2000, y: 1900 }, 42)
  world.enemies.push(enemy)
  world.canPlayerPose(enemy.position, 0)
  expect(world.player.hp).toBe(100)
  world.canPlayerPose(enemy.position, 0, GAME_CONFIG.playerSpeed * 1.3)
  expect(world.player.hp).toBe(95)
})
