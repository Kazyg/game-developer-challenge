import type { MatchRecord, PlayerIdentity } from './contracts'
import { validMatch } from './contracts'

export const STORAGE_KEYS = {
  player: 'pirate-battle-player-v1',
  pending: 'pirate-battle-pending-v1',
  confirmed: 'pirate-battle-confirmed-v1',
} as const
const memory = new Map<string, MatchRecord[]>()
export function readMatches(key: string): MatchRecord[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(value) ? [...new Map(value.filter(validMatch).map(match => [match.matchId, match])).values()] : []
  } catch { return memory.get(key) ?? [] }
}
export function writeMatches(key: string, matches: MatchRecord[]) {
  memory.set(key, matches)
  try { localStorage.setItem(key, JSON.stringify(matches)) } catch { throw new Error('Unable to persist registrations locally.') }
}
let sessionPlayer: PlayerIdentity | null = null
export function loadPlayer(): PlayerIdentity {
  try {
    const player = JSON.parse(localStorage.getItem(STORAGE_KEYS.player) ?? 'null') as PlayerIdentity | null
    if (player && typeof player.playerId === 'string' && player.playerId && typeof player.playerName === 'string' && player.playerName) return player
  } catch { /* Fall back to a new session identity if storage is unavailable. */ }
  const player = sessionPlayer ?? { playerId: crypto.randomUUID(), playerName: 'Captain' }
  sessionPlayer = player
  try { localStorage.setItem(STORAGE_KEYS.player, JSON.stringify(player)) } catch { /* Gameplay remains available. */ }
  return player
}
