import { navigable, HULL_RADIUS } from './PatrolNavigation'
import { COMBAT_CONFIG as config } from '../config/CombatConfig'
import { fireWeapon } from '../combat/CombatSystem'
import { canOccupyWithCircles } from '../collision/CollisionSystem'
import { getPlayerColliders } from '../entities/Player'
import type { Enemy } from '../entities/Enemy'
import type { Vector2 } from '../entities/Island'
import { shortestAngleDifference } from '../entities/rotation'
import { moveShip, straightSailingSpeed, straightSailingDistance } from '../movement/ShipMovement'
import { insidePatrolArea } from '../world/SpawnSystem'
import type { PatrolArea } from '../entities/Combat'
import type { World } from '../world/World'
import { avoidIslands, canTurnTo, clearSegment, navigationGrid, islandBlocksGoal, recordNavigationProgress } from './ObstacleAvoidance'

function normalize(vector: Vector2): Vector2 {
  const length = Math.hypot(vector.x, vector.y)
  return length === 0 ? { x: 0, y: 0 } : { x: vector.x / length, y: vector.y / length }
}

export function avoidNeighbors(enemy: Enemy, desired: Vector2, neighbors: readonly Enemy[], velocityOf?: (id: string) => Vector2): Vector2 {
  const heading = normalize(desired)
  const steering = { ...heading }
  for (const other of neighbors) {
    if (!other.alive || other.id === enemy.id) continue
    const relative = { x: other.position.x - enemy.position.x, y: other.position.y - enemy.position.y }
    const otherVelocity = velocityOf?.(other.id) ?? { x: Math.sin(other.rotation) * other.speed, y: -Math.cos(other.rotation) * other.speed }
    const velocity = { x: otherVelocity.x - heading.x * enemy.speed, y: otherVelocity.y - heading.y * enemy.speed }
    const t = Math.max(0, Math.min(config.avoidance.predictionSeconds,
      -(relative.x * velocity.x + relative.y * velocity.y) / (velocity.x ** 2 + velocity.y ** 2 || 1)))
    const gap = Math.hypot(relative.x, relative.y)
    const predicted = Math.hypot(relative.x + velocity.x * t, relative.y + velocity.y * t)
    if (gap > config.avoidance.neighborRange || predicted > HULL_RADIUS * 2 + config.patrol.safetyMargin) continue
    // Both head-on ships turn starboard; crossing ships use stable ID priority.
    const headOn = heading.x * Math.sin(other.rotation) - heading.y * Math.cos(other.rotation) < config.avoidance.headOnDot
    const priority = headOn || enemy.id > other.id ? 1 : config.avoidance.priorityWeight
    const weight = priority * (1 - gap / config.avoidance.neighborRange) * config.avoidance.separationWeight
    const lateral = relative.x * -heading.y + relative.y * heading.x
    const preferredSide = headOn || Math.abs(lateral) < config.patrol.safetyMargin ? 1 : lateral > 0 ? -1 : 1
    const committed = enemy.navigation.neighborSides[other.id]
    if (!committed) enemy.navigation.neighborSides[other.id] = { side: preferredSide, age: 0 }
    const side = committed?.side ?? preferredSide
    steering.x += -heading.y * weight * side
    steering.y += heading.x * weight * side
  }
  return normalize(steering)
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
function attack(world: World, enemy: Enemy) {
  if (Math.hypot(world.player.position.x - enemy.position.x, world.player.position.y - enemy.position.y)
    > config.enemyVisionRange || islandBlocksGoal(world, enemy, world.player.position)) return
  const target = Math.atan2(world.player.position.x - enemy.position.x, -(world.player.position.y - enemy.position.y))
  const angle = shortestAngleDifference(enemy.rotation, target)
  if (Math.abs(angle) <= config.shooter.frontAimTolerance) fireWeapon(world, enemy, 'front')
  else if (Math.abs(angle - Math.PI / 2) <= config.shooter.sideAimTolerance) fireWeapon(world, enemy, 'right')
  else if (Math.abs(angle + Math.PI / 2) <= config.shooter.sideAimTolerance) fireWeapon(world, enemy, 'left')
}

function combatGoal(world: World, enemy: Enemy, dt: number): Vector2 {
  const player = world.player.position, n = enemy.navigation
  const dx = player.x - enemy.position.x, dy = player.y - enemy.position.y
  const distance = Math.hypot(dx, dy)
  if (enemy.type === 'chaser') {
    const velocity = world.shipVelocity(world.player.id)
    const prediction = distance < config.chaser.impactDistance ? 0
      : Math.min(config.chaser.predictionSeconds, distance / enemy.speed)
    const target = { x: player.x + velocity.x * prediction, y: player.y + velocity.y * prediction }
    if (!n.pursuit || distance < config.chaser.impactDistance) n.pursuit = { ...player }
    const blend = 1 - Math.exp(-config.chaser.targetSmoothing * dt)
    n.pursuit.x += (target.x - n.pursuit.x) * blend
    n.pursuit.y += (target.y - n.pursuit.y) * blend
    return navigable(n.pursuit, world.islands) ? n.pursuit : player
  }
  if (enemy.state !== 'ATTACK') return player
  n.maneuverAge += dt
  const makeGoal = (side: number) => {
    const radial = (distance - config.shooter.orbitRadius) / config.shooter.orbitRadius * config.shooter.radialGain
    return { x: enemy.position.x + (dx * radial - dy * side) / (distance || 1) * config.patrol.hullLookAhead,
      y: enemy.position.y + (dy * radial + dx * side) / (distance || 1) * config.patrol.hullLookAhead }
  }
  let goal = makeGoal(n.side)
  if (n.maneuverAge >= config.shooter.maneuverSeconds && (!navigable(goal, world.islands)
    || world.enemies.some(other => other !== enemy && other.alive
      && Math.hypot(goal.x - other.position.x, goal.y - other.position.y) < HULL_RADIUS * 2))) {
    const alternative = makeGoal(-n.side)
    if (navigable(alternative, world.islands)) { n.side = n.side === 1 ? -1 : 1; goal = alternative }
    n.maneuverAge = 0
  }
  return goal
}

function selectState(world: World, enemy: Enemy, area: PatrolArea) {
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
}

export function movementDirection(world: World, enemy: Enemy, goal: Vector2): Vector2 {
  const route = avoidIslands(world, enemy, goal)
  if (enemy.navigation.escape) return { x: Math.sin(enemy.navigation.escape.rotation), y: -Math.cos(enemy.navigation.escape.rotation) }
  if (Math.hypot(route.x, route.y) <= config.timeEpsilon) return { x: 0, y: 0 }
  const separated = avoidNeighbors(enemy, route, world.enemies, id => world.shipVelocity(id))
  const probe = { x: enemy.position.x + separated.x * config.patrol.hullLookAhead,
    y: enemy.position.y + separated.y * config.patrol.hullLookAhead }
  const routeHeading = normalize(route)
  const routeProjection = routeHeading.x * separated.x + routeHeading.y * separated.y
  let direction = routeProjection > config.avoidance.minimumRouteProjection
    && clearSegment(world, enemy.position, probe) && canTurnTo(world, enemy, probe) ? separated : routeHeading
  const target = Math.atan2(direction.x, -direction.y)
  if (enemy.type === 'chaser' && enemy.state === 'CHASE' && !enemy.navigation.waypoint
    && Math.abs(shortestAngleDifference(enemy.rotation, target)) < config.chaser.headingDeadband
    && clearSegment(world, enemy.position, { x: enemy.position.x + Math.sin(enemy.rotation) * config.patrol.hullLookAhead,
      y: enemy.position.y - Math.cos(enemy.rotation) * config.patrol.hullLookAhead }))
    direction = { x: Math.sin(enemy.rotation), y: -Math.cos(enemy.rotation) }
  return direction
}

export function movementSpeed(world: World, enemy: Enemy, direction: Vector2): number {
  if (enemy.navigation.escape) {
    const escape = enemy.navigation.escape
    const remaining = Math.hypot(escape.point.x - enemy.position.x, escape.point.y - enemy.position.y)
    return Math.min(enemy.speed * config.obstacles.escapeSpeedFactor,
      remaining / Math.max(enemy.navigation.lastStep, config.timeEpsilon)) * (escape.reverse ? -1 : 1)
  }
  let speedFactor = 1
  const headingError = Math.abs(shortestAngleDifference(enemy.rotation, Math.atan2(direction.x, -direction.y)))
  speedFactor *= Math.max(0, Math.cos(headingError)) ** 2
  if (enemy.navigation.waypoint && enemy.navigation.route.length) {
    const tolerance = Math.max(navigationGrid(world).radius * config.obstacles.waypointHullRatio,
      enemy.speed * enemy.navigation.lastStep * config.obstacles.waypointStepFactor)
    const remaining = Math.hypot(enemy.navigation.waypoint.x - enemy.position.x, enemy.navigation.waypoint.y - enemy.position.y)
    speedFactor *= Math.min(1, remaining / tolerance)
  }
  for (const other of world.enemies) {
    if (!other.alive || other.id === enemy.id) continue
    const dx = other.position.x - enemy.position.x, dy = other.position.y - enemy.position.y
    const gap = Math.hypot(dx, dy)
    if (gap < config.avoidance.neighborRange && dx * Math.sin(enemy.rotation) - dy * Math.cos(enemy.rotation) > 0)
      speedFactor = Math.min(speedFactor, Math.max(config.avoidance.minimumSpeedFactor, (gap - HULL_RADIUS * 2) / config.avoidance.neighborRange))
  }
  return (enemy.type === 'chaser' ? straightSailingSpeed(enemy.speed, enemy.navigation.straightDistance, config.chaser.maxBoost) : enemy.speed) * speedFactor
}

function validateMovement(world: World, enemy: Enemy, area: PatrolArea, movementSpeed: number) {
  return (position: Vector2, rotation: number) => {
    // A ship returning from a chase can travel back into its area.
    if (enemy.state === 'PATROL' && insidePatrolArea(enemy.position, area)
      && !insidePatrolArea(position, area)) return false
    if (enemy.navigation.route.length && !enemy.navigation.escape && !navigationGrid(world).safe(position)) {
      enemy.navigation.blockedBy = 'terrain'
      return false
    }
    return world.canEnemyPose(enemy, position, rotation,
      position.x !== enemy.position.x || position.y !== enemy.position.y ? movementSpeed : 0)
  }
}

export function planEnemyMoves(world: World, dt: number): (() => void)[] {
  const moves: (() => void)[] = []
  if (world.paused) return moves
  for (const enemy of world.enemies) {
    if (world.gameOver) break
    if (!enemy.alive) continue
    const area = world.patrolAreas.find((item) => item.id === enemy.areaId)
    if (!area) continue
    for (const [id, choice] of Object.entries(enemy.navigation.neighborSides)) {
      choice.age += dt
      if (choice.age > config.avoidance.commitmentSeconds) delete enemy.navigation.neighborSides[id]
    }
    selectState(world, enemy, area)
    const goal = enemy.state === 'PATROL' ? patrolGoal(enemy) : enemy.state === 'RETURN' ? patrolGoal(enemy, true) : combatGoal(world, enemy, dt)
    enemy.navigation.lastStep = dt
    const direction = movementDirection(world, enemy, goal)
    const speed = movementSpeed(world, enemy, direction)
    world.setShipVelocity(enemy.id, enemy.rotation, Math.hypot(direction.x, direction.y) > 0 ? speed : 0)
    const valid = validateMovement(world, enemy, area, speed)
    moves.push(() => {
      if (!enemy.alive || world.gameOver || world.paused) return
      const before = { ...enemy.position }
      const rotation = enemy.rotation
      let blocked = false
      enemy.navigation.blockedBy = null
      moveShip(enemy, direction, speed, dt, (position, angle) => {
        const allowed = valid(position, angle)
        if (!allowed && enemy.navigation.blockedBy !== 'terrain') enemy.navigation.blockedBy = canOccupyWithCircles(getPlayerColliders(enemy, position, angle),
          world.islandColliders, world.width, world.height) ? 'ally' : 'terrain'
        blocked ||= !allowed
        return allowed
      })
      const turning = Math.abs(shortestAngleDifference(rotation, enemy.rotation)) > config.timeEpsilon
      enemy.navigation.straightDistance = straightSailingDistance(enemy.navigation.straightDistance,
        Math.hypot(enemy.position.x - before.x, enemy.position.y - before.y), turning, blocked || speed <= 0)
      world.setShipVelocity(enemy.id, enemy.rotation, dt > 0
        ? Math.sign(speed) * Math.hypot(enemy.position.x - before.x, enemy.position.y - before.y) / dt : 0)
      recordNavigationProgress(enemy, before, dt, turning)
      if (!world.gameOver && enemy.alive && enemy.type === 'shooter' && (enemy.state === 'ATTACK' || enemy.state === 'APPROACH')) attack(world, enemy)
    })
  }
  return moves
}

export function updateEnemies(world: World, dt: number, moves = planEnemyMoves(world, dt)) {
  for (const move of moves) move()
}

