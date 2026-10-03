import { playSound } from './AudioManager'
import type { WorldEvent } from '../entities/WorldEvent'
export function playWorldEvents(events: readonly WorldEvent[]) {
  for (const event of events) {
    switch (event.type) {
      case 'collision': playSound('ship_collision'); break
      case 'shipDamaged': playSound('ship_wood_hit_1'); break
      case 'shipDestroyed': playSound('ship_explosion_1'); break
      case 'projectileSplashed': playSound('cannonball_water_hit_1'); break
      case 'repairStarted': playSound('ship_recover'); break
      case 'weaponFired': playSound(event.weapon === 'front' ? 'cannon_fire_1' : 'cannon_broadside'); break
    }
  }
}
