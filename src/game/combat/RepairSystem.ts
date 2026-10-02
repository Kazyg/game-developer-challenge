import { COMBAT_CONFIG as config } from '../config/CombatConfig'
import type { Player } from '../entities/Player'

export function stopRepair(player: Player) {
  if (!player.repair.active) return
  player.repair.active = false
  player.repair.cooldown = config.repair.cooldown
}

export function updateRepair(player: Player, requested: boolean, attemptedMovement: boolean, dt: number) {
  const repair = player.repair
  const remainingCooldown = repair.cooldown - dt
  repair.cooldown = remainingCooldown <= config.timeEpsilon ? 0 : remainingCooldown
  if (!player.alive) { stopRepair(player); return }
  if (repair.active && attemptedMovement) { stopRepair(player); return }
  if (requested && !attemptedMovement && !repair.active && repair.cooldown === 0 && player.hp < player.maxHp) {
    repair.active = true
    repair.elapsed = 0
    repair.healed = 0
  }
  if (!repair.active) return
  const remainingTime = Math.max(0, config.repair.duration - repair.elapsed)
  const remainingHealing = Math.max(0, config.repair.maxHealing - repair.healed)
  const time = Math.min(dt, remainingTime, remainingHealing / config.repair.rate)
  const healing = Math.min(config.repair.rate * time, player.maxHp - player.hp, remainingHealing)
  player.hp += healing
  repair.elapsed += time
  repair.healed += healing
  if (repair.elapsed >= config.repair.duration - config.timeEpsilon || repair.healed >= config.repair.maxHealing - config.timeEpsilon
    || player.hp >= player.maxHp) stopRepair(player)
}
