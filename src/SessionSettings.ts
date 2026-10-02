import { MATCH_CONFIG } from './game/config/MatchConfig'
export const SETTINGS_LIMITS = { minSpawnTime: 1, maxSpawnTime: 60, defaultSpawnTime: 5 } as const
export interface SessionSettings { duration: number; spawnTime: number }
export function validSettings(value: SessionSettings): boolean {
  return Number.isInteger(value.duration) && value.duration >= MATCH_CONFIG.minDuration && value.duration <= MATCH_CONFIG.maxDuration
    && Number.isInteger(value.spawnTime) && value.spawnTime >= SETTINGS_LIMITS.minSpawnTime && value.spawnTime <= SETTINGS_LIMITS.maxSpawnTime
}
let memory: SessionSettings = { duration: MATCH_CONFIG.defaultDuration, spawnTime: SETTINGS_LIMITS.defaultSpawnTime }
export function loadSettings(): SessionSettings {
  try {
  const duration = Number(localStorage.getItem('pirate-battle-duration') ?? MATCH_CONFIG.defaultDuration)
  const spawnTime = Number(localStorage.getItem('pirate-battle-spawn-time') ?? SETTINGS_LIMITS.defaultSpawnTime)
  const settings = { duration, spawnTime }
  return validSettings(settings) ? settings : memory
  } catch { return memory }
}
export function saveSettings(settings: SessionSettings) {
  if (!validSettings(settings)) throw new Error('Choose a session time of 60–180s and a spawn time of 1–60s.')
  memory = { ...settings }
  try {
  localStorage.setItem('pirate-battle-duration', String(settings.duration))
  localStorage.setItem('pirate-battle-spawn-time', String(settings.spawnTime))
  } catch { /* Use session settings when persistence is unavailable. */ }
}

