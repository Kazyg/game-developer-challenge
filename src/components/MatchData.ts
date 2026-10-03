export type DataPage<T> =
  | { status: 'loading' | 'empty' | 'error'; message?: string; refreshing?: boolean }
  | { status: 'data'; items: readonly T[]; hasNext: boolean; refreshing?: boolean; message?: string }
export interface RankingEntry { id: string; rank: number; playerName: string; score: number; playerId?: string; matchId?: string; duration?: number }
export interface HistoryEntry { id: string; date: string; score: number; duration: number; reason: 'timeExpired' | 'playerDestroyed' }
export type { RegistrationStatus } from '../api/contracts'
export const endReasonLabel = (reason: HistoryEntry['reason']) => reason === 'timeExpired' ? 'Time Expired' : 'Player Destroyed'
