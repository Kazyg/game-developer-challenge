import type { WorldEvent } from '../entities/WorldEvent'
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
import { moveShip, turnShip, straightSailingSpeed, straightSailingDistance } from '../movement/ShipMovement'
import { matchDuration, MATCH_CONFIG } from '../config/MatchConfig'
import { planEnemyMoves, updateEnemies } from '../ai/EnemySystem'
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
  private events: WorldEvent[] = []
  emit = (event: WorldEvent) => { this.events.push(event) }
  drainEvents(): WorldEvent[] {
    const events = this.events
    this.events = []
    return events
  }
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
  private readonly contacts = new Set<string>()
  private readonly contactDistances = new Map<string, number>()
  private readonly velocities = new Map<string, Vector2>()

  setShipVelocity(id: string, rotation: number, speed: number) {
    this.velocities.set(id, { x: Math.sin(rotation) * speed, y: -Math.cos(rotation) * speed })
  }
  shipVelocity(id: string): Vector2 { return this.velocities.get(id) ?? { x: 0, y: 0 } }
  get playerMovementSpeed() {
    return straightSailingSpeed(config.playerSpeed, this.straightDistance)
  }

  private islandImpact(speed: number) {
    if (speed <= COMBAT_CONFIG.collision.islandMinDamageSpeed || this.contacts.has('island')) return
    this.contacts.add('island')
    this.emit({ type: 'collision' })
    const maxSpeed = config.playerSpeed * (1 + config.straightSailing.maxBoost)
    damageShip(this, this.player, COMBAT_CONFIG.collision.maxDamage * Math.min(1, speed / maxSpeed))
    this.straightDistance = 0
  }

  private shooterImpact(enemy: Enemy, moving: 'player' | 'enemy', speed: number) {
    if (speed === 0 || this.contacts.has(enemy.id)) return
    const dx = enemy.position.x - this.player.position.x, dy = enemy.position.y - this.player.position.y
    const length = Math.hypot(dx, dy)
    if (!length) return
    const playerVelocity = moving === 'player'
      ? { x: Math.sin(this.player.rotation) * speed, y: -Math.cos(this.player.rotation) * speed }
      : this.velocities.get(this.player.id) ?? { x: 0, y: 0 }
    const enemyVelocity = moving === 'enemy'
      ? { x: Math.sin(enemy.rotation) * speed, y: -Math.cos(enemy.rotation) * speed }
      : this.velocities.get(enemy.id) ?? { x: 0, y: 0 }
    const closing = ((playerVelocity.x - enemyVelocity.x) * dx + (playerVelocity.y - enemyVelocity.y) * dy) / length
    if (closing <= 0) return
    this.contacts.add(enemy.id)
    this.contactDistances.set(enemy.id, length)
    this.emit({ type: 'collision' })
    const damage = COMBAT_CONFIG.collision.maxDamage * closing / (config.playerSpeed * (1 + config.straightSailing.maxBoost))
    // Damage both before a lethal player hit freezes the world.
    damageShip(this, enemy, damage, 'player')
    damageShip(this, this.player, damage)
    this.straightDistance = 0
  }

  private releaseContacts() {
    const gap = COMBAT_CONFIG.collision.contactReleaseGap
    const circles = this.player.colliders
    if (!circles.some(circle => this.obstacles.some(obstacle => overlapsCollider({ ...circle, radius: circle.radius + gap }, obstacle)))) this.contacts.delete('island')
    for (const id of this.contacts) {
      if (id === 'island') continue
      const enemy = this.enemies.find(enemy => enemy.id === id && enemy.alive)
      const distance = enemy ? Math.hypot(enemy.position.x - this.player.position.x, enemy.position.y - this.player.position.y) : Infinity
      if (!enemy || (distance > (this.contactDistances.get(id) ?? Infinity) + COMBAT_CONFIG.timeEpsilon
        && !circles.some(circle => enemy.colliders.some(other => circlesOverlap(circle, other))))
        || !circles.some(circle => enemy.colliders.some(other => circlesOverlap({ ...circle, radius: circle.radius + gap }, other)))) {
        this.contacts.delete(id)
        this.contactDistances.delete(id)
      }
    }
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
        this.islandImpact(impactSpeed)
      }
      return false
    }
    for (const enemy of this.enemies) {
      if (Math.abs(position.x - enemy.position.x) > SHIP_RADIUS * 2
        || Math.abs(position.y - enemy.position.y) > SHIP_RADIUS * 2) continue
      if (!enemy.alive || !circles.some((circle) => enemy.colliders.some((other) => circlesOverlap(circle, other)))) continue
      if (enemy.type === 'chaser') chaserContact(this, enemy)
      else { this.shooterImpact(enemy, 'player', impactSpeed); return false }
      if (this.gameOver) return false
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
      else this.shooterImpact(enemy, 'enemy', impactSpeed)
      return false
    }
    return enemy.alive
  }

  update(input: InputState, deltaSeconds: number) {
    if (this.gameOver || this.paused) return
    if (!this.player.alive || this.player.hp <= 0) { this.finish(); return }
    const dt = Math.min(this.timeRemaining, Math.max(0, deltaSeconds))
    this.releaseContacts()
    this.setShipVelocity(this.player.id, this.player.rotation, input.up && !this.player.repair.active ? this.playerMovementSpeed : 0)
    this.time += dt
    if (this.timeRemaining <= 1e-9) { this.time = this.duration; this.finish('timeExpired'); return }
    this.expireVisuals(dt)
    if (this.combatEnabled) this.spawner.update(this)
    // Plan both ships' approach velocities before executing either movement.
    const enemyMoves = this.combatEnabled ? planEnemyMoves(this, dt) : []
    this.updatePlayer(input, dt)
    if (this.gameOver || !this.combatEnabled) return
    this.updateCombat(input, dt, enemyMoves)
    if (this.gameOver) return
    updateProjectiles(this, dt)
    if (this.gameOver) return
    this.removeDeadEnemies()
  }

  private expireVisuals(dt: number) {
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
  }

  private updatePlayer(input: InputState, dt: number) {
    tickWeaponCooldowns(this.player, dt)
    const attemptedMovement = input.up || input.left || input.right
    updateRepair(this.player, input.actions?.repair ?? false, attemptedMovement, dt, this.emit)
    if (this.player.alive && !this.player.repair.active) {
      const valid = (position: Vector2, rotation: number) => this.canPlayerPose(position, rotation)
      const turn = Number(input.right) - Number(input.left)
      if (turn !== 0 || !input.up) this.straightDistance = 0
      if (turn !== 0) turnShip(this.player, this.player.rotation + turn * config.playerRotationSpeed * dt, dt, valid)
      if (this.gameOver || !this.player.alive) return
      if (input.up) {
        const before = { ...this.player.position }
        const speed = this.playerMovementSpeed
        this.setShipVelocity(this.player.id, this.player.rotation, speed)
        let blocked = false
        moveShip(this.player, { x: Math.sin(this.player.rotation), y: -Math.cos(this.player.rotation) },
          speed, dt, (position, rotation) => {
            const allowed = this.canPlayerPose(position, rotation, speed)
            if (!allowed) blocked = true
            return allowed
          })
        if (this.gameOver) return
        this.straightDistance = straightSailingDistance(this.straightDistance,
          Math.hypot(this.player.position.x - before.x, this.player.position.y - before.y), turn !== 0, blocked)
      }
    } else this.straightDistance = 0
  }

  private updateCombat(input: InputState, dt: number, enemyMoves: (() => void)[]) {
    if (this.player.alive) {
      if (input.actions?.front) fireWeapon(this, this.player, 'front')
      if (input.actions?.left) fireWeapon(this, this.player, 'left')
      if (input.actions?.right) fireWeapon(this, this.player, 'right')
    }
    for (const enemy of this.enemies) tickWeaponCooldowns(enemy, dt)
    updateEnemies(this, dt, enemyMoves)
  }

  private removeDeadEnemies() {
    for (let index = this.enemies.length - 1; index >= 0; index--) {
      const enemy = this.enemies[index]
      if (enemy && !enemy.alive) {
        this.velocities.delete(enemy.id)
        this.enemies.splice(index, 1)
      }
    }
  }
}
