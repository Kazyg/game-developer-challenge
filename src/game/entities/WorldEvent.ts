import type { Weapon } from './Combat'
export type WorldEvent =
  | { type: 'collision' | 'shipDamaged' | 'shipDestroyed' | 'projectileSplashed' | 'repairStarted' }
  | { type: 'weaponFired'; weapon: Weapon }
