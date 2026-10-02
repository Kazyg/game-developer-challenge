import { GAME_CONFIG as config } from '../config/GameConfig'
import { COMBAT_CONFIG } from '../config/CombatConfig'
import { turnTowards } from '../entities/rotation'
import type { Vector2 } from '../entities/Island'
import type { Player } from '../entities/Player'
import type { Enemy } from '../entities/Enemy'

export type Ship = Player | Enemy
export type PoseValidator = (position: Vector2, rotation: number) => boolean

export function turnShip(ship: Ship, target: number, dt: number, valid: PoseValidator) {
  const speed = ship.team === 'player' ? config.playerRotationSpeed : COMBAT_CONFIG[ship.type].rotationSpeed
  const rotation = turnTowards(ship.rotation, target, speed * dt)
  if (valid(ship.position, rotation) && ship.alive) ship.rotation = rotation
}

export function moveShip(ship: Ship, direction: Vector2, speed: number, dt: number, valid: PoseValidator) {
  const length = Math.hypot(direction.x, direction.y)
  if (!ship.alive || length === 0) return
  const unit = { x: direction.x / length, y: direction.y / length }
  turnShip(ship, Math.atan2(unit.x, -unit.y), dt, valid)
  if (!ship.alive) return
  const distance = speed * dt
  const stepSize = Math.min(config.movementStep, ...ship.colliders.map((circle) => circle.radius))
  const steps = Math.max(1, Math.ceil(distance / stepSize))
  const dx = Math.sin(ship.rotation) * distance / steps
  const dy = -Math.cos(ship.rotation) * distance / steps
  for (let step = 0; step < steps && ship.alive; step++) {
    const position = ship.position
    if (ship.team === 'player') {
      const nextX = { x: position.x + dx, y: position.y }
      if (valid(nextX, ship.rotation) && ship.alive) position.x = nextX.x
      if (!ship.alive) break
      const nextY = { x: position.x, y: position.y + dy }
      if (valid(nextY, ship.rotation) && ship.alive) position.y = nextY.y
      continue
    }
    const next = { x: position.x + dx, y: position.y + dy }
    if (!valid(next, ship.rotation) || !ship.alive) break
    position.x = next.x
    position.y = next.y
  }
}
