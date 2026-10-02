import { GAME_CONFIG as config } from '../config/GameConfig'
import { canOccupyWithCircles, circlesOverlap, overlapsCollider } from '../collision/CollisionSystem'
import { COMBAT_CONFIG } from '../config/CombatConfig'
import { createPlayer, getPlayerColliders, SHIP_RADIUS } from '../entities/Player'
import type { InputState } from '../input/InputManager'
import type { Enemy } from '../entities/Enemy'
import type { Projectile, VisualEffect, Wreck } from '../entities/Combat'
import type { Vector2 } from '../entities/Island'
import { generateIslands } from './MapGenerator'
import { SpawnSystem } from './SpawnSystem'
import { moveShip, turnShip } from '../movement/ShipMovement'
import { matchDuration, MATCH_CONFIG } from '../config/MatchConfig'
import { updateEnemies } from '../ai/EnemySystem'
import { chaserContact, damageShip, fireWeapon, tickWeaponCooldowns, updateProjectiles } from '../combat/CombatSystem'
import { updateRepair } from '../combat/RepairSystem'

export class World {
  readonly seed: number
  readonly width = config.worldWidth
  readonly height = config.worldHeight
  readonly player = createPlayer()
  readonly islands
  readonly spawner: SpawnSystem
  readonly enemies: Enemy[] = []
  readonly projectiles: Projectile[] = []
  readonly effects: VisualEffect[] = []
  readonly wrecks: Wreck[] = []
  time = 0
  gameOver = false
  paused = false
  score = 0
  readonly duration: number
  endReason: 'timeExpired' | 'playerDestroyed' = 'playerDestroyed'
  get timeRemaining() { return Math.max(0, this.duration - this.time) }
  private readonly obstacles
  private readonly combatEnabled: boolean
  private entitySequence = 0
  private straightDistance = 0
  private nextCollisionDamage = 0
  get playerMovementSpeed() {
    return config.playerSpeed * (1 + config.straightSailing.maxBoost
      * Math.min(1, this.straightDistance / config.straightSailing.distanceForMaxBoost))
  }

  private collisionDamage(speed: number) {
    if (speed <= 0 || this.time < this.nextCollisionDamage) return
    const maxSpeed = config.playerSpeed * (1 + config.straightSailing.maxBoost)
    damageShip(this, this.player, COMBAT_CONFIG.collision.maxDamage * Math.min(1, speed / maxSpeed))
    this.nextCollisionDamage = this.time + COMBAT_CONFIG.collision.cooldown
    this.straightDistance = 0
  }

  constructor(seed: number, options: { combatEnabled?: boolean; duration?: number; spawnTime?: number } = {}) {
    this.duration = matchDuration(options.duration ?? MATCH_CONFIG.defaultDuration)
    this.seed = seed >>> 0
    this.islands = generateIslands(this.seed, this.player.position)
    this.obstacles = this.islands.flatMap((island) => island.colliders)
    this.spawner = new SpawnSystem(this.seed, options.spawnTime, this.islands, this.player.position)
    this.combatEnabled = options.combatEnabled ?? true
    if (this.combatEnabled) this.spawner.update(this)
  }

  get islandColliders() { return this.obstacles }
  get patrolAreas() { return this.spawner.areas }

  nextId(prefix: string): string { return `${prefix}-${this.entitySequence++}` }

  finish(reason: 'timeExpired' | 'playerDestroyed' = 'playerDestroyed') {
    if (this.gameOver) return
    this.endReason = reason
    this.gameOver = true
    this.player.hp = Math.max(0, this.player.hp)
    if (reason === 'playerDestroyed') this.player.alive = false
    this.player.repair.active = false
  }

  canPlayerPose(position: Vector2, rotation: number, impactSpeed = 0): boolean {
    const circles = getPlayerColliders(this.player, position, rotation)
    if (!canOccupyWithCircles(circles, this.obstacles, this.width, this.height)) {
      if (circles.some(circle => this.obstacles.some(obstacle => overlapsCollider(circle, obstacle)))) {
        this.collisionDamage(impactSpeed)
      }
      return false
    }
    for (const enemy of this.enemies) {
      if (Math.abs(position.x - enemy.position.x) > SHIP_RADIUS * 2
        || Math.abs(position.y - enemy.position.y) > SHIP_RADIUS * 2) continue
      if (!enemy.alive || !circles.some((circle) => enemy.colliders.some((other) => circlesOverlap(circle, other)))) continue
      if (enemy.type === 'chaser') chaserContact(this, enemy)
      else { this.collisionDamage(impactSpeed); return false }
    }
    return this.player.alive
  }

  canEnemyPose(enemy: Enemy, position: Vector2, rotation: number, impactSpeed = 0): boolean {
    const circles = getPlayerColliders(enemy, position, rotation)
    if (!canOccupyWithCircles(circles, this.obstacles, this.width, this.height)) return false
    for (const other of this.enemies) {
      if (Math.abs(position.x - other.position.x) > SHIP_RADIUS * 2
        || Math.abs(position.y - other.position.y) > SHIP_RADIUS * 2) continue
      if (!other.alive || other.id === enemy.id) continue
      if (circles.some((circle) => other.colliders.some((collider) => circlesOverlap(circle, collider)))) return false
    }
    if (this.player.alive && circles.some((circle) => this.player.colliders.some((other) => circlesOverlap(circle, other)))) {
      if (enemy.type === 'chaser') chaserContact(this, enemy)
      else this.collisionDamage(impactSpeed)
      return false
    }
    return enemy.alive
  }

  update(input: InputState, deltaSeconds: number) {
    if (this.gameOver || this.paused) return
    if (!this.player.alive || this.player.hp <= 0) { this.finish(); return }
    const dt = Math.min(this.timeRemaining, Math.max(0, deltaSeconds))
    this.time += dt
    if (this.timeRemaining <= 1e-9) { this.time = this.duration; this.finish('timeExpired'); return }
    for (let index = this.effects.length - 1; index >= 0; index--) {
      const effect = this.effects[index]!
      effect.age += dt
      if (effect.age >= effect.duration) this.effects.splice(index, 1)
    }
    for (let index = this.wrecks.length - 1; index >= 0; index--) {
      const wreck = this.wrecks[index]!
      wreck.age += dt
      if (wreck.age >= wreck.duration) this.wrecks.splice(index, 1)
    }
    tickWeaponCooldowns(this.player, dt)
    const attemptedMovement = input.up || input.left || input.right
    updateRepair(this.player, input.actions?.repair ?? false, attemptedMovement, dt)
    if (this.player.alive && !this.player.repair.active) {
      const valid = (position: Vector2, rotation: number) => this.canPlayerPose(position, rotation)
      const turn = Number(input.right) - Number(input.left)
      if (turn !== 0 || !input.up) this.straightDistance = 0
      if (turn !== 0) turnShip(this.player, this.player.rotation + turn * config.playerRotationSpeed * dt, dt, valid)
      if (input.up) {
        const before = { ...this.player.position }
        const speed = this.playerMovementSpeed
        let blocked = false
        moveShip(this.player, { x: Math.sin(this.player.rotation), y: -Math.cos(this.player.rotation) },
          speed, dt, (position, rotation) => {
            const allowed = this.canPlayerPose(position, rotation, speed)
            if (!allowed) blocked = true
            return allowed
          })
        if (blocked || turn !== 0) this.straightDistance = 0
        else this.straightDistance += Math.hypot(this.player.position.x - before.x, this.player.position.y - before.y)
      }
    } else this.straightDistance = 0
    if (this.gameOver || !this.combatEnabled) return
    if (this.player.alive) {
      if (input.actions?.front) fireWeapon(this, this.player, 'front')
      if (input.actions?.left) fireWeapon(this, this.player, 'left')
      if (input.actions?.right) fireWeapon(this, this.player, 'right')
    }
    this.spawner.update(this)
    for (const enemy of this.enemies) tickWeaponCooldowns(enemy, dt)
    updateEnemies(this, dt)
    if (this.gameOver) return
    updateProjectiles(this, dt)
    if (this.gameOver) return
    for (let index = this.enemies.length - 1; index >= 0; index--) {
      if (!this.enemies[index]!.alive) this.enemies.splice(index, 1)
    }
  }
}
