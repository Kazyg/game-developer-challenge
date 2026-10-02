export interface GameConfigSnapshot { gameSessionTime: number; enemySpawnTime: number }
export type EndReason = 'timeExpired' | 'playerDestroyed'
export interface MatchRecord {
  matchId: string
  playerId: string
  playerName: string
  date: string
  score: number
  effectiveDuration: number
  endReason: EndReason
  gameConfig: GameConfigSnapshot
}
export type RegisterMatchRequest = MatchRecord
export interface RegisterMatchResponse { match: MatchRecord }
export interface PaginationRequest { page: number; pageSize: number }
export interface PageResponse<T> {
  items: T[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}
export interface RankingRequest extends PaginationRequest { gameConfig: GameConfigSnapshot }
export interface HistoryRequest extends PaginationRequest { playerId: string }
export interface RankingItem extends MatchRecord { rank: number }
export type RankingResponse = PageResponse<RankingItem>
export type HistoryResponse = PageResponse<MatchRecord>
export interface ApiErrorResponse { code: string; message: string }
export type ApiErrorKind = 'timeout' | 'network' | 'client' | 'server' | 'storage'
export interface PlayerIdentity { playerId: string; playerName: string }

export function validConfig(value: unknown): value is GameConfigSnapshot {
  if (!value || typeof value !== 'object') return false
  const config = value as GameConfigSnapshot
  return Number.isInteger(config.gameSessionTime) && config.gameSessionTime >= 60 && config.gameSessionTime <= 180
    && Number.isInteger(config.enemySpawnTime) && config.enemySpawnTime >= 1 && config.enemySpawnTime <= 60
}
export function validMatch(value: unknown): value is MatchRecord {
  if (!value || typeof value !== 'object') return false
  const match = value as MatchRecord
  return [match.matchId, match.playerId, match.playerName].every(item => typeof item === 'string' && item.trim().length > 0 && item.length <= 120)
    && typeof match.date === 'string' && Number.isFinite(Date.parse(match.date))
    && Number.isInteger(match.score) && match.score >= 0
    && Number.isFinite(match.effectiveDuration) && match.effectiveDuration >= 0
    && validConfig(match.gameConfig) && match.effectiveDuration <= match.gameConfig.gameSessionTime + 1
    && (match.endReason === 'timeExpired' || match.endReason === 'playerDestroyed')
}
export function sameConfig(a: GameConfigSnapshot, b: GameConfigSnapshot) {
  return a.gameSessionTime === b.gameSessionTime && a.enemySpawnTime === b.enemySpawnTime
}
