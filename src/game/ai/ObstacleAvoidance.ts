import { ROUTE_MARGIN } from './PatrolNavigation'
import { COMBAT_CONFIG as config } from '../config/CombatConfig'
import { canOccupyWithCircles, sweepCollider, overlapsCollider } from '../collision/CollisionSystem'
import type { Enemy } from '../entities/Enemy'
import type { Collider, Vector2 } from '../entities/Island'
import { getPlayerColliders } from '../entities/Player'
import { shortestAngleDifference } from '../entities/rotation'
import { NavigationGrid } from '../world/MapNavigation'
import type { World } from '../world/World'

const distance = (a: Vector2, b: Vector2) => Math.hypot(a.x - b.x, a.y - b.y)
const maps = new WeakMap<World, { colliders: readonly Collider[]; grid: NavigationGrid }>()

export function navigationGrid(world: World): NavigationGrid {
  let map = maps.get(world)
  if (!map || map.colliders.length !== world.islandColliders.length
    || map.colliders.some((collider, index) => collider !== world.islandColliders[index])) {
    map = { colliders: [...world.islandColliders], grid: new NavigationGrid([...world.islandColliders],
      world.width, world.height, config.obstacles.routeCell, ROUTE_MARGIN) }
    maps.set(world, map)
  }
  return map.grid
}

/** Full physical hull sweep, including orientation. Coastal ships may leave an
 * existing safety margin, but land and world boundaries remain impassable. */
export function clearPoseSegment(world: World, a: Vector2, b: Vector2, rotation: number): boolean {
  const dx = b.x - a.x, dy = b.y - a.y
  for (const circle of getPlayerColliders({ position: a, rotation, team: 'enemy' })) {
    const padded = { ...circle, radius: circle.radius + config.patrol.safetyMargin }
    const radius = world.islandColliders.some(collider => overlapsCollider(padded, collider)) ? circle.radius : padded.radius
    const end = { x: circle.position.x + dx, y: circle.position.y + dy }
    if (!canOccupyWithCircles([{ ...circle, position: end, radius }], [], world.width, world.height)
      || world.islandColliders.some(collider => sweepCollider(circle.position, end, radius, collider) !== null)) return false
  }
  return true
}

export function clearSegment(world: World, a: Vector2, b: Vector2): boolean {
  return clearPoseSegment(world, a, b, Math.atan2(b.x - a.x, -(b.y - a.y)))
}

export function canTurnTo(world: World, enemy: Enemy, goal: Vector2): boolean {
  const angle = shortestAngleDifference(enemy.rotation, Math.atan2(goal.x - enemy.position.x, -(goal.y - enemy.position.y)))
  const steps = Math.max(1, Math.ceil(Math.abs(angle) / config.obstacles.turnProbeAngle))
  for (let i = 1; i <= steps; i++) {
    const circles = getPlayerColliders(enemy, enemy.position, enemy.rotation + angle * i / steps)
    if (!canOccupyWithCircles(circles, world.islandColliders, world.width, world.height)) return false
  }
  return true
}

interface Entry { index: number; cost: number; score: number }
class Frontier {
  private readonly heap: Entry[] = []
  get length() { return this.heap.length }
  push(entry: Entry) {
    let child = this.heap.length
    this.heap.push(entry)
    while (child > 0) {
      const parent = (child - 1) >> 1
      if (this.heap[parent]!.score <= entry.score) break
      this.heap[child] = this.heap[parent]!
      child = parent
    }
    this.heap[child] = entry
  }
  pop(): Entry {
    const result = this.heap[0]!, last = this.heap.pop()!
    if (this.heap.length) {
      let parent = 0
      while (parent * 2 + 1 < this.heap.length) {
        let child = parent * 2 + 1
        if (child + 1 < this.heap.length && this.heap[child + 1]!.score < this.heap[child]!.score) child++
        if (this.heap[child]!.score >= last.score) break
        this.heap[parent] = this.heap[child]!
        parent = child
      }
      this.heap[parent] = last
    }
    return result
  }
}

export function routeCost(origin: Vector2, route: readonly Vector2[]): number {
  let cost = 0, from = origin
  for (const point of route) { cost += distance(from, point); from = point }
  return cost
}

export interface RouteResult { points: Vector2[]; cost: number; reachable: boolean }

/** A* with an explicit terminal cost. Seeing the goal adds an edge; it does not
 * end the search before all potentially cheaper alternatives are compared. */
export function findRoute(world: World, origin: Vector2, goal: Vector2, combatRadius = 0): RouteResult {
  const grid = navigationGrid(world), connectorRadius = config.obstacles.routeCell * config.obstacles.connectorCells
  const starts = grid.near(origin, connectorRadius).filter(index => grid.clear(origin, grid.point(index)))
  if (!starts.length) return { points: [], cost: Infinity, reachable: false }
  const component = grid.component(starts[0]!)
  const terminals = new Map<number, number>()
  for (const index of grid.near(goal, combatRadius || connectorRadius)) {
    if (!grid.sameComponent(starts[0]!, index)) continue
    const point = grid.point(index)
    if (combatRadius ? !world.islandColliders.some(collider => sweepCollider(point, goal,
      config.projectile.radius, collider) !== null) : clearSegment(world, point, goal))
      terminals.set(index, combatRadius ? 0 : distance(point, goal))
  }
  const reachable = terminals.size > 0
  let destination = goal
  if (!reachable) {
    // This component was exhaustively searched, rather than imposing a local
    // expansion cap and misclassifying a large/elongated island as unreachable.
    const nearest = component.reduce((best, index) => distance(grid.point(index), goal)
      < distance(grid.point(best), goal) ? index : best, component[0]!)
    destination = grid.point(nearest); terminals.set(nearest, 0)
  }
  const heuristic = (point: Vector2) => Math.max(0, distance(point, destination) - (reachable ? combatRadius : 0))
  const costs = new Float64Array(grid.length).fill(Infinity), parents = new Int32Array(grid.length).fill(-1)
  const frontier = new Frontier()
  for (const index of starts) {
    const cost = distance(origin, grid.point(index)); costs[index] = cost
    frontier.push({ index, cost, score: cost + heuristic(grid.point(index)) })
  }
  let terminal = -1, bestCost = Infinity
  while (frontier.length) {
    const current = frontier.pop()
    if (current.score >= bestCost) break
    if (current.cost !== costs[current.index]) continue
    const terminalCost = terminals.get(current.index)
    if (terminalCost !== undefined && current.cost + terminalCost < bestCost) {
      terminal = current.index; bestCost = current.cost + terminalCost
    }
    for (const next of grid.neighbors(current.index)) {
      const cost = current.cost + distance(grid.point(current.index), grid.point(next))
      if (cost >= costs[next]!) continue
      costs[next] = cost; parents[next] = current.index
      frontier.push({ index: next, cost, score: cost + heuristic(grid.point(next)) })
    }
  }
  if (terminal < 0) return { points: [], cost: Infinity, reachable: false }
  const route: Vector2[] = []
  for (let index = terminal; index >= 0; index = parents[index]!) route.unshift(grid.point(index))
  if (reachable && !combatRadius) route.push({ ...goal })
  const simplified: Vector2[] = []
  let from = origin
  while (route.length) {
    let index = route.length - 1
    while (index > 0 && !(reachable && !combatRadius && index === route.length - 1
      ? clearSegment(world, from, route[index]!) : grid.clear(from, route[index]!))) index--
    from = route[index]!
    simplified.push(from); route.splice(0, index + 1)
  }
  return { points: simplified, cost: bestCost, reachable }
}

function beginCoastalEscape(world: World, enemy: Enemy): boolean {
  const grid = navigationGrid(world), n = enemy.navigation
  for (let step = config.obstacles.escapeStep; step <= config.obstacles.escapeDistance; step += config.obstacles.escapeStep) {
    for (const sign of [1, -1]) {
      const point = { x: enemy.position.x + Math.sin(enemy.rotation) * step * sign,
        y: enemy.position.y - Math.cos(enemy.rotation) * step * sign }
      if (grid.safe(point) && clearPoseSegment(world, enemy.position, point, enemy.rotation)) {
        n.escape = { point, rotation: enemy.rotation, reverse: sign < 0 }
        n.waypoint = point; n.progressPoint = null; n.replanRequested = true; n.blockedBy = 'terrain'
        return true
      }
    }
  }
  return false
}

function routeValid(world: World, enemy: Enemy): boolean {
  const route = enemy.navigation.route, grid = navigationGrid(world)
  if (!route.length || !clearSegment(world, enemy.position, route[0]!)) return false
  for (let i = 1; i < route.length; i++) {
    if (i === route.length - 1 ? !clearSegment(world, route[i - 1]!, route[i]!)
      : !grid.clear(route[i - 1]!, route[i]!)) return false
  }
  return true
}

export function avoidIslands(world: World, enemy: Enemy, goal: Vector2): Vector2 {
  const n = enemy.navigation, grid = navigationGrid(world)
  const tolerance = Math.max(ROUTE_MARGIN * config.obstacles.waypointHullRatio,
    enemy.speed * n.lastStep * config.obstacles.waypointStepFactor)
  if (n.escape) {
    if (distance(enemy.position, n.escape.point) <= config.obstacles.escapeStep / 2 && grid.safe(enemy.position)) {
      n.escape = null; n.progressPoint = null; n.replanRequested = true
    } else { n.waypoint = n.escape.point; return { x: n.escape.point.x - enemy.position.x, y: n.escape.point.y - enemy.position.y } }
  }
  if (clearSegment(world, enemy.position, goal) && canTurnTo(world, enemy, goal)) {
    n.route = []; n.goal = { ...goal }; n.waypoint = null; n.islandId = null; n.routeReachable = true
    return { x: goal.x - enemy.position.x, y: goal.y - enemy.position.y }
  }
  if (!grid.safe(enemy.position) && (!clearSegment(world, enemy.position, goal) || !canTurnTo(world, enemy, goal))) {
    if (beginCoastalEscape(world, enemy)) return { x: n.escape!.point.x - enemy.position.x, y: n.escape!.point.y - enemy.position.y }
  }
  while (n.route.length > 1 && grid.clear(enemy.position, n.route[1]!)
    && canTurnTo(world, enemy, n.route[1]!)) n.route.shift()
  const valid = routeValid(world, enemy)
  const movedGoal = !n.goal || distance(n.goal, goal) >= config.obstacles.goalMoveThreshold
  if (!n.goal || !valid || n.replanRequested || movedGoal || n.routeAge >= config.obstacles.routeRefreshSeconds) {
    const result = findRoute(world, enemy.position, goal,
      enemy.type === 'shooter' && enemy.state === 'APPROACH' ? config.shooter.orbitRadius : 0)
    const previousCost = routeCost(enemy.position, n.route)
    const changedGoal = !n.goal || distance(n.goal, goal) >= config.obstacles.goalMoveThreshold
    if (result.points.length && (!valid || changedGoal || n.replanRequested
      || result.cost < previousCost * (1 - config.obstacles.routeSwitchRatio)
        && previousCost - result.cost >= config.obstacles.routeSwitchDistance)) {
      n.route = result.points; n.goal = { ...goal }; n.routeReachable = result.reachable
    }
    n.routeAge = n.planCount++ === 0 ? n.replanPhase : 0
    n.replanRequested = false
    if (!valid && !result.points.length) n.route = [] // never invent a direction through terrain
  }
  n.waypoint = n.route[0] ?? null
  n.islandId = world.islands.find(island => island.colliders.some(collider =>
    sweepCollider(enemy.position, goal, ROUTE_MARGIN, collider) !== null))?.id ?? null
  if (n.waypoint && !canTurnTo(world, enemy, n.waypoint) && beginCoastalEscape(world, enemy)) n.waypoint = n.escape!.point
  if (!n.routeReachable && n.route.length === 1 && n.waypoint && distance(enemy.position, n.waypoint) <= tolerance)
    return { x: 0, y: 0 }
  const target = n.waypoint ?? enemy.position
  return { x: target.x - enemy.position.x, y: target.y - enemy.position.y }
}

export function islandBlocksGoal(world: World, enemy: Enemy, goal: Vector2): boolean {
  return world.islandColliders.some(collider => sweepCollider(enemy.position, goal, config.projectile.radius, collider) !== null)
}

export function recordNavigationProgress(enemy: Enemy, before: Vector2, dt: number, turning = false) {
  const n = enemy.navigation
  n.routeAge += dt; n.lastStep = dt
  n.turningSeconds = turning ? n.turningSeconds + dt : 0
  const remaining = n.escape ? distance(enemy.position, n.escape.point) : routeCost(enemy.position, n.route)
  const hasRoute = !!n.escape || n.route.length > 0
  if (hasRoute) {
    if (!n.progressPoint || remaining < n.progressDistance - config.obstacles.progressDistance) {
      n.progressPoint = { ...enemy.position }; n.progressDistance = remaining; n.progressSeconds = 0
    } else n.progressSeconds += dt // rotation/oscillation is not route progress
  } else { n.progressPoint = null; n.progressSeconds = 0 }
  if (distance(enemy.position, before) < enemy.speed * dt * config.obstacles.progressSpeedRatio) {
    if (!turning || n.turningSeconds > config.obstacles.turnGraceSeconds) n.stalledSeconds += dt
  } else n.stalledSeconds = 0
  if (n.stalledSeconds >= config.obstacles.stuckSeconds || n.progressSeconds >= config.obstacles.stuckSeconds) {
    n.replanRequested = true
    if (n.blockedBy === 'ally') for (const choice of Object.values(n.neighborSides)) { choice.side *= -1; choice.age = 0 }
    n.stalledSeconds = 0; n.progressSeconds = 0; n.progressPoint = null
    // Keep a still-valid route until a replacement has actually been found.
  }
}
