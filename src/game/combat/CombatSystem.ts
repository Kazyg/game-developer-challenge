import { COMBAT_CONFIG as config } from '../config/CombatConfig'
import { sweepCircle, sweepCollider } from '../collision/CollisionSystem'
import type { Projectile, VisualEffect, Weapon } from '../entities/Combat'
import type { Enemy } from '../entities/Enemy'
import type { Vector2 } from '../entities/Island'
import type { Ship } from '../movement/ShipMovement'
import type { World } from '../world/World'
import { stopRepair } from './RepairSystem'

export function addEffect(world: World, kind: VisualEffect['kind'], position: Vector2, rotation = 0) {
  const duration = kind === 'shot' ? config.effects.shotDuration
    : kind === 'impact' ? config.effects.impactDuration : kind === 'splash' ? config.effects.splashDuration : config.effects.explosionDuration
  if (kind === 'splash') world.emit({ type: 'projectileSplashed' })
  world.effects.push({ id: world.nextId('effect'), kind, position: { ...position }, rotation, age: 0, duration })
}

export function damageShip(world: World, target: Ship, damage: number, source?: Ship['team']) {
  if (world.gameOver || world.paused || !target.alive || damage <= 0) return
  if (target.team === 'player') stopRepair(target)
  world.emit({ type: 'shipDamaged' })
  target.hp = Math.max(0, target.hp - damage)
  if (target.hp > 0) return
  world.emit({ type: 'shipDestroyed' })
  target.alive = false
  if (target.team === 'enemy') {
    if (source === 'player') world.score++
    target.state = 'DEAD'
    world.spawner.scheduleRespawn(target, world.time)
  }
  world.wrecks.push({ id: world.nextId('wreck'), kind: target.team === 'player' ? 'player' : target.type,
    position: { ...target.position }, rotation: target.rotation, age: 0, duration: config.effects.sinkingDuration })
  addEffect(world, 'explosion', target.position)
  if (target.team === 'player') world.finish()
}

export function chaserContact(world: World, enemy: Enemy) {
  if (!enemy.alive || enemy.type !== 'chaser' || !world.player.alive) return
  damageShip(world, enemy, enemy.hp)
  damageShip(world, world.player, config.chaser.contactDamage)
}

export function tickWeaponCooldowns(ship: Ship, dt: number) {
  for (const weapon of ['front', 'left', 'right'] as const) {
    const remaining = ship.weaponCooldowns[weapon] - dt
    ship.weaponCooldowns[weapon] = remaining <= config.timeEpsilon ? 0 : remaining
  }
}

export function fireWeapon(world: World, ship: Ship, weapon: Weapon): boolean {
  if (world.gameOver || world.paused || !ship.alive || ship.weaponCooldowns[weapon] > 0) return false
  if (ship.team === 'enemy' && Object.values(ship.weaponCooldowns).some(value => value > 0)) return false
  world.emit({ type: 'weaponFired', weapon })
  const weaponConfig = ship.team === 'player' ? config.player : config.shooter
  ship.weaponCooldowns[weapon] = weapon === 'front' ? weaponConfig.frontCooldown : weaponConfig.sideCooldown
  const forward = { x: Math.sin(ship.rotation), y: -Math.cos(ship.rotation) }
  const right = { x: Math.cos(ship.rotation), y: Math.sin(ship.rotation) }
  const sign = weapon === 'left' ? -1 : 1
  const direction = weapon === 'front' ? forward : { x: right.x * sign, y: right.y * sign }
  const frontOffset = ship.team === 'player' ? config.weapons.playerFrontOffset : config.weapons.frontOffset
  const sideOffset = ship.team === 'player' ? config.weapons.playerSideOffset : config.weapons.sideOffset
  const offsets = weapon === 'front' ? [0] : ship.team === 'enemy'
    ? config.weapons.broadsideOffsets.slice(0, config.shooter.sideProjectileCount) : config.weapons.broadsideOffsets
  for (const offset of offsets) {
    const position = weapon === 'front'
      ? { x: ship.position.x + forward.x * frontOffset,
        y: ship.position.y + forward.y * frontOffset }
      : { x: ship.position.x + direction.x * sideOffset + forward.x * offset,
        y: ship.position.y + direction.y * sideOffset + forward.y * offset }
    const projectile: Projectile = {
      id: world.nextId('projectile'), ownerId: ship.id, team: ship.team, position, previousPosition: { ...position },
      direction: { ...direction }, speed: ship.team === 'player' ? config.projectile.playerSpeed : config.projectile.enemySpeed,
      damage: ship.team === 'player'
        ? weapon === 'front' ? config.player.damage : config.player.sideDamage
        : config.shooter.damage,
      radius: config.projectile.radius * (ship.team === 'player' && weapon === 'front'
        ? config.projectile.playerFrontSizeMultiplier : 1), age: 0, lifetime: ship.team === 'enemy' ? config.enemyVisionRange / config.projectile.enemySpeed : config.projectile.lifetime,
      distance: 0, range: ship.team === 'player' ? weapon === 'front'
        ? config.projectile.playerFrontRange : config.projectile.playerSideRange : config.enemyVisionRange,
      get collider() { return { type: 'circle' as const, position: this.position, radius: this.radius * (this.team === 'player' ? config.projectile.playerHitRadiusMultiplier : 1) } },
    }
    world.projectiles.push(projectile)
    addEffect(world, 'shot', position, Math.atan2(direction.x, -direction.y))
  }
  return true
}

function impact(world: World, projectile: Projectile, end: Vector2): boolean {
  const start = projectile.previousPosition
  const hitRadius = projectile.radius * (projectile.team === 'player' ? config.projectile.playerHitRadiusMultiplier : 1)
  let first = Infinity
  let target: Ship | undefined
  const accept = (time: number | null, ship?: Ship) => {
    if (time !== null && time < first) { first = time; target = ship }
  }
  // The world boundary competes with islands and ships for the earliest hit.
  for (const axis of ['x', 'y'] as const) {
    const max = (axis === 'x' ? world.width : world.height) - hitRadius
    const delta = end[axis] - start[axis]
    if (start[axis] < hitRadius || start[axis] > max) accept(0)
    else if (end[axis] < hitRadius) accept((hitRadius - start[axis]) / delta)
    else if (end[axis] > max) accept((max - start[axis]) / delta)
  }
  for (const collider of world.islandColliders) accept(sweepCollider(start, end, hitRadius, collider))
  const targets: Ship[] = projectile.team === 'player' ? world.enemies : [world.player]
  for (const ship of targets) {
    if (!ship.alive || ship.id === projectile.ownerId || ship.team === projectile.team) continue
    for (const circle of ship.colliders) accept(sweepCircle(start, end, hitRadius, circle), ship)
  }
  const time = Number.isFinite(first) ? first : 1
  projectile.position = { x: start.x + (end.x - start.x) * time, y: start.y + (end.y - start.y) * time }
  if (!Number.isFinite(first)) return false
  if (target) damageShip(world, target, projectile.damage, projectile.team)
  if (!target) world.emit({ type: 'collision' })
  addEffect(world, 'impact', projectile.position)
  return true
}

export function updateProjectiles(world: World, dt: number) {
  if (world.gameOver || world.paused) return
  const remaining: Projectile[] = []
  for (let index = 0; index < world.projectiles.length; index++) {
    const projectile = world.projectiles[index]!
    if (projectile.age >= projectile.lifetime || projectile.distance >= projectile.range) { addEffect(world, 'splash', projectile.position); continue }
    projectile.previousPosition = { ...projectile.position }
    const time = Math.min(dt, projectile.lifetime - projectile.age)
    const distance = Math.min(projectile.speed * time, projectile.range - projectile.distance)
    const end = { x: projectile.position.x + projectile.direction.x * distance,
      y: projectile.position.y + projectile.direction.y * distance }
    const hit = impact(world, projectile, end)
    projectile.distance += Math.hypot(projectile.position.x - projectile.previousPosition.x,
      projectile.position.y - projectile.previousPosition.y)
    if (world.gameOver) {
      world.projectiles.splice(0, world.projectiles.length, ...remaining, ...world.projectiles.slice(index + 1))
      return
    }
    projectile.age += time
    if (!hit && projectile.age < projectile.lifetime && projectile.distance < projectile.range - config.timeEpsilon) remaining.push(projectile)
    else if (!hit) addEffect(world, 'splash', projectile.position)
  }
  world.projectiles.splice(0, world.projectiles.length, ...remaining)
}
