import { GAME_CONFIG } from '../config/GameConfig'
import type { CircleCollider, Vector2 } from './Island'
import { COMBAT_CONFIG } from '../config/CombatConfig'
import { createWeaponCooldowns } from './Combat'
import type { RepairState, WeaponCooldowns } from './Combat'

export interface Player {
  id: string
  team: 'player'
  hp: number
  maxHp: number
  alive: boolean
  weaponCooldowns: WeaponCooldowns
  repair: RepairState
  position: Vector2
  rotation: number
  readonly colliders: readonly CircleCollider[]
}

const hullCache = new WeakMap<object, { x: number; y: number; rotation: number; circles: CircleCollider[] }>()
export const SHIP_RADIUS = Math.max(...GAME_CONFIG.playerHullCircles.map(circle =>
  (Math.hypot(circle.x, circle.y) + circle.radius) * GAME_CONFIG.playerSpriteScale))

export function getPlayerColliders(player: Pick<Player, 'position' | 'rotation'>, position = player.position,
  rotation = player.rotation): CircleCollider[] {
  const cacheable = position === player.position && rotation === player.rotation
  const cached = cacheable ? hullCache.get(player) : undefined
  if (cached && cached.x === position.x && cached.y === position.y && cached.rotation === rotation) return cached.circles
  const angle = rotation + GAME_CONFIG.spriteRotationOffset
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const scale = GAME_CONFIG.playerSpriteScale
  const circles: CircleCollider[] = GAME_CONFIG.playerHullCircles.map((circle) => ({
    type: 'circle',
    position: {
      x: position.x + scale * (circle.x * cos - circle.y * sin),
      y: position.y + scale * (circle.x * sin + circle.y * cos),
    },
    radius: circle.radius * scale,
  }))
  if (cacheable) hullCache.set(player, { x: position.x, y: position.y, rotation, circles })
  return circles
}

export function createPlayer(): Player {
  return {
    id: 'player',
    team: 'player',
    hp: COMBAT_CONFIG.player.maxHp,
    maxHp: COMBAT_CONFIG.player.maxHp,
    alive: true,
    weaponCooldowns: createWeaponCooldowns(),
    repair: { active: false, elapsed: 0, healed: 0, cooldown: 0 },
    position: { x: GAME_CONFIG.worldWidth / 2, y: GAME_CONFIG.worldHeight / 2 },
    rotation: 0,
    get colliders() { return getPlayerColliders(this) },
  }
}
