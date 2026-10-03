import type { CircleCollider, Vector2 } from './Island'
import type { PatrolArea, WeaponCooldowns } from './Combat'
import { createWeaponCooldowns } from './Combat'
import { getPlayerColliders } from './Player'
import { COMBAT_CONFIG } from '../config/CombatConfig'
import { SeededRandom } from '../world/SeededRandom'

export type EnemyType = 'chaser' | 'shooter'
export type EnemyState = 'PATROL' | 'CHASE' | 'APPROACH' | 'ATTACK' | 'RETURN' | 'DEAD'
export interface PatrolPlan {
  kind: 'circular'
  center: Vector2
  radius: number
  direction: 1 | -1
}
export interface EnemyNavigation {
  islandId: string | null
  side: 1 | -1
  waypoint: Vector2 | null
  neighborSides: Record<string, { side: number; age: number }>
  escape: { point: Vector2; rotation: number; reverse: boolean } | null
  replanRequested: boolean
  planCount: number
  replanPhase: number
  routeReachable: boolean
  blockedBy: 'terrain' | 'ally' | null
  route: Vector2[]
  goal: Vector2 | null
  progressPoint: Vector2 | null
  progressDistance: number
  progressSeconds: number
  lastStep: number
  routeAge: number
  turningSeconds: number
  pursuit: Vector2 | null
  straightDistance: number
  maneuverAge: number
  stalledSeconds: number
}
export interface Enemy {
  id: string
  team: 'enemy'
  type: EnemyType
  areaId: string
  position: Vector2
  rotation: number
  hp: number
  maxHp: number
  alive: boolean
  state: EnemyState
  visionRange: number
  attackRange: number
  speed: number
  weaponCooldowns: WeaponCooldowns
  patrol: PatrolPlan
  navigation: EnemyNavigation
  readonly colliders: readonly CircleCollider[]
}
export function createEnemy(id: string, type: EnemyType, area: PatrolArea,
  position: Vector2, seed: number, validPatrolPoint: (point: Vector2) => boolean = () => true, plan?: PatrolPlan): Enemy {
  const config = COMBAT_CONFIG[type]
  const random = new SeededRandom(seed)
  const phaseSeed = Array.from(id).reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0, seed)
  const replanPhase = new SeededRandom(phaseSeed).next() * COMBAT_CONFIG.obstacles.routeRefreshSeconds
  const margin = Math.max(...getPlayerColliders({ position: { x: 0, y: 0 }, rotation: 0, team: 'enemy' })
    .map(circle => Math.hypot(circle.position.x, circle.position.y) + circle.radius))
  let center = { ...position }
  let radius = Math.max(1, Math.min(position.x - area.x, area.x + area.width - position.x,
    position.y - area.y, area.y + area.height - position.y) - margin)
  let found = !!plan
  for (let attempt = 0; !plan && attempt < COMBAT_CONFIG.patrol.destinationAttempts; attempt++) {
    const candidateRadius = Math.min(area.width, area.height) * random.range(0.15, 0.32)
    const candidate = { x: random.range(area.x + margin + candidateRadius, area.x + area.width - margin - candidateRadius),
      y: random.range(area.y + margin + candidateRadius, area.y + area.height - margin - candidateRadius) }
    if (candidateRadius + margin > Math.min(area.width, area.height) / 2) continue
    if (Array.from({ length: 64 }, (_, index) => index * Math.PI / 32).every(angle =>
      validPatrolPoint({ x: candidate.x + Math.cos(angle) * candidateRadius,
        y: candidate.y + Math.sin(angle) * candidateRadius }))) {
      center = candidate; radius = candidateRadius; found = true; break
    }
  }
  if (!found) throw new Error('No safe patrol route available')
  return {
    id, team: 'enemy', type, areaId: area.id, position, rotation: 0,
    hp: config.maxHp, maxHp: config.maxHp, alive: true, state: 'PATROL',
    visionRange: COMBAT_CONFIG.enemyVisionRange,
    attackRange: type === 'shooter' ? COMBAT_CONFIG.shooter.attackRange : 0,
    speed: config.speed, weaponCooldowns: createWeaponCooldowns(),
    patrol: plan ?? { kind: 'circular', center, radius, direction: random.next() < 0.5 ? 1 : -1 },
    navigation: { islandId: null, side: random.next() < 0.5 ? 1 : -1, waypoint: null, stalledSeconds: 0, neighborSides: {}, escape: null, replanRequested: false, planCount: 0, replanPhase, routeReachable: true, blockedBy: null, route: [], goal: null, routeAge: 0, lastStep: 0, progressPoint: null, progressDistance: 0, progressSeconds: 0, turningSeconds: 0, pursuit: null, straightDistance: 0, maneuverAge: COMBAT_CONFIG.shooter.maneuverSeconds },
    get colliders() { return getPlayerColliders(this) },
  }
}
