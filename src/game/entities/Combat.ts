import type { CircleCollider, Vector2 } from './Island'

export type Team = 'player' | 'enemy'
export type Weapon = 'front' | 'left' | 'right'
export type WeaponCooldowns = Record<Weapon, number>

export interface MatchResult {
  outcome: 'defeat' | 'finished'
  seed: number
  elapsedSeconds: number
  score: number
  reason: 'timeExpired' | 'playerDestroyed'
}

export function createWeaponCooldowns(): WeaponCooldowns {
  return { front: 0, left: 0, right: 0 }
}

export interface RepairState {
  active: boolean
  elapsed: number
  healed: number
  cooldown: number
}

export interface Projectile {
  id: string
  ownerId: string
  team: Team
  position: Vector2
  previousPosition: Vector2
  direction: Vector2
  speed: number
  damage: number
  radius: number
  age: number
  lifetime: number
  distance: number
  range: number
  readonly collider: CircleCollider
}

export interface VisualEffect {
  id: string
  kind: 'shot' | 'impact' | 'explosion' | 'splash'
  position: Vector2
  rotation: number
  age: number
  duration: number
}

export interface PatrolArea {
  id: string
  x: number
  y: number
  width: number
  height: number
}

// A death snapshot used only by rendering; it never participates in gameplay.
export interface Wreck {
  id: string
  kind: 'player' | 'chaser' | 'shooter'
  position: Vector2
  rotation: number
  age: number
  duration: number
}
