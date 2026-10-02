import { navigable, HULL_RADIUS, ROUTE_MARGIN } from './PatrolNavigation'
import { COMBAT_CONFIG as config } from '../config/CombatConfig'
import { fireWeapon } from '../combat/CombatSystem'
import type { Enemy } from '../entities/Enemy'
import type { Vector2 } from '../entities/Island'
import { shortestAngleDifference } from '../entities/rotation'
import { moveShip, turnShip } from '../movement/ShipMovement'
import { insidePatrolArea } from '../world/SpawnSystem'
import type { PatrolArea } from '../entities/Combat'
import type { World } from '../world/World'
import { avoidIslands, islandBlocksGoal, recordNavigationProgress } from './ObstacleAvoidance'

function normalize(vector: Vector2): Vector2 {
  const length = Math.hypot(vector.x, vector.y)
  return length === 0 ? { x: 0, y: 0 } : { x: vector.x / length, y: vector.y / length }
}

export function avoidNeighbors(enemy: Enemy, desired: Vector2, neighbors: readonly Enemy[]): Vector2 {
  const heading = normalize(desired)
  const separation = { x: 0, y: 0 }
  for (const other of neighbors) {
    if (!other.alive || other.id === enemy.id) continue
    const dx = enemy.position.x - other.position.x
    const dy = enemy.position.y - other.position.y
    const distance = Math.hypot(dx, dy)
    if (distance >= config.avoidance.neighborRange) continue
    const weight = (config.avoidance.neighborRange - distance) / config.avoidance.neighborRange
    const away = distance === 0 ? { x: enemy.id < other.id ? 1 : -1, y: 0 } : { x: dx / distance, y: dy / distance }
    separation.x += away.x * weight
    separation.y += away.y * weight
    // Pass on the right when another ship lies ahead, rather than forming a head-on pile.
    if (heading.x * -away.x + heading.y * -away.y > 0) {
      separation.x += -heading.y * weight * config.avoidance.lateralWeight
      separation.y += heading.x * weight * config.avoidance.lateralWeight
    }
  }
  return normalize({ x: heading.x + separation.x * config.avoidance.separationWeight,
    y: heading.y + separation.y * config.avoidance.separationWeight })
}

export function leashBounds(area: PatrolArea): PatrolArea {
  const margin = config.patrol.leashMargin
  return { id: area.id, x: area.x - margin, y: area.y - margin,
    width: area.width + margin * 2, height: area.height + margin * 2 }
}

function patrolGoal(enemy: Enemy, returning = false): Vector2 {
  const { center, radius, direction } = enemy.patrol
  const angle = Math.atan2(enemy.position.y - center.y, enemy.position.x - center.x)
    + (returning ? 0 : direction * Math.min(0.35, config.patrol.lookAhead / radius))
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }
}
function attack(world: World, enemy: Enemy, dt: number) {
  const target = Math.atan2(world.player.position.x - enemy.position.x, -(world.player.position.y - enemy.position.y))
  const angle = shortestAngleDifference(enemy.rotation, target)
  if (Math.abs(angle) <= config.shooter.frontAimTolerance) fireWeapon(world, enemy, 'front')
  else if (Math.abs(angle - Math.PI / 2) <= config.shooter.sideAimTolerance) fireWeapon(world, enemy, 'right')
  else if (Math.abs(angle + Math.PI / 2) <= config.shooter.sideAimTolerance) fireWeapon(world, enemy, 'left')
  else turnShip(enemy, target, dt, (position, rotation) => world.canEnemyPose(enemy, position, rotation))
}

export function updateEnemies(world: World, dt: number) {
  if (world.paused) return
  for (const enemy of world.enemies) {
    if (world.gameOver) break
    if (!enemy.alive) continue
    const area = world.patrolAreas.find((item) => item.id === enemy.areaId)
    if (!area) continue
    const toPlayer = { x: world.player.position.x - enemy.position.x, y: world.player.position.y - enemy.position.y }
    const distance = Math.hypot(toPlayer.x, toPlayer.y)
    const returning = enemy.state === 'RETURN'
    const aggro = enemy.state === 'CHASE' || enemy.state === 'APPROACH' || enemy.state === 'ATTACK'
    if (returning) {
      if (insidePatrolArea(enemy.position, area)) enemy.state = 'PATROL'
      else if (distance <= config.enemyReturnVisionRange) enemy.state = enemy.type === 'chaser' ? 'CHASE' : 'APPROACH'
    } else if (aggro && distance > config.enemyReturnVisionRange && !insidePatrolArea(enemy.position, leashBounds(area), 0)) {
      enemy.state = 'RETURN'
    } else if (aggro || distance <= enemy.visionRange) {
      enemy.state = enemy.type === 'chaser' ? 'CHASE'
        : distance <= enemy.attackRange && !islandBlocksGoal(world, enemy, world.player.position) ? 'ATTACK' : 'APPROACH'
    } else enemy.state = 'PATROL'
    enemy.visionRange = enemy.state === 'RETURN' ? config.enemyReturnVisionRange : config.enemyVisionRange
    const goal = enemy.state === 'PATROL' ? patrolGoal(enemy)
      : enemy.state === 'RETURN' ? patrolGoal(enemy, true) : world.player.position
    let desired = enemy.state === 'ATTACK' ? { x: 0, y: 0 } : { x: goal.x - enemy.position.x, y: goal.y - enemy.position.y }
    const separated = avoidNeighbors(enemy, desired, world.enemies)
    // Apply terrain avoidance after separation so neighbors cannot steer into coast.
    const direction = enemy.state === 'ATTACK' ? separated : avoidIslands(world, enemy, {
      x: enemy.position.x + separated.x * Math.max(config.patrol.hullLookAhead, Math.hypot(desired.x, desired.y)),
      y: enemy.position.y + separated.y * Math.max(config.patrol.hullLookAhead, Math.hypot(desired.x, desired.y)) })
    desired = direction
    let speedFactor = 1
    const headingError = Math.abs(shortestAngleDifference(enemy.rotation, Math.atan2(desired.x, -desired.y)))
    speedFactor *= Math.max(0, Math.cos(headingError)) ** 2
    for (const other of world.enemies) {
      if (!other.alive || other.id === enemy.id) continue
      const dx = other.position.x - enemy.position.x, dy = other.position.y - enemy.position.y
      const gap = Math.hypot(dx, dy)
      if (gap < config.avoidance.neighborRange && dx * Math.sin(enemy.rotation) - dy * Math.cos(enemy.rotation) > 0)
        speedFactor = Math.min(speedFactor, Math.max(0, (gap - HULL_RADIUS * 2) / config.avoidance.neighborRange))
    }
    const valid = (position: Vector2, rotation: number) => {
      // A ship returning from a chase can travel back into its area.
      if (enemy.state === 'PATROL' && area && insidePatrolArea(enemy.position, area)
        && !insidePatrolArea(position, area)) return false
      const moved = position.x !== enemy.position.x || position.y !== enemy.position.y
      if (moved && !navigable(position, world.islands, ROUTE_MARGIN)) {
        // A returning ship already inside clearance may only move outward.
        const clearance = (p: Vector2) => Math.min(...world.islands.map(i =>
          Math.hypot(p.x - i.position.x, p.y - i.position.y) - i.boundingRadius * 1.12))
        if (navigable(enemy.position, world.islands, ROUTE_MARGIN) || clearance(position) <= clearance(enemy.position)) return false
      }
      return world.canEnemyPose(enemy, position, rotation,
        position.x !== enemy.position.x || position.y !== enemy.position.y ? enemy.speed : 0)
    }
    const before = { ...enemy.position }
    moveShip(enemy, direction, enemy.speed * speedFactor * (enemy.state === 'ATTACK' ? config.avoidance.attackSpeedFactor : 1), dt, valid)
    if (enemy.state !== 'ATTACK') recordNavigationProgress(enemy, before, dt)
    if (!world.gameOver && enemy.alive && enemy.state === 'ATTACK') attack(world, enemy, dt)
  }
}

