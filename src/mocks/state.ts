import type { GameConfigSnapshot, MatchRecord, PageResponse, PaginationRequest, RankingItem } from '../api/contracts'
import { sameConfig } from '../api/contracts'
import { readMatches, STORAGE_KEYS, writeMatches } from '../api/storage'
import { fixtures } from './fixtures'

const textOrder = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
export const rankingOrder = (a: MatchRecord, b: MatchRecord) => b.score - a.score
  || a.effectiveDuration - b.effectiveDuration || Date.parse(a.date) - Date.parse(b.date) || textOrder(a.matchId, b.matchId)
export const historyOrder = (a: MatchRecord, b: MatchRecord) => Date.parse(b.date) - Date.parse(a.date) || textOrder(a.matchId, b.matchId)
export function paginate<T>(items: T[], { page, pageSize }: PaginationRequest): PageResponse<T> {
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, totalItems: items.length, totalPages: Math.ceil(items.length / pageSize) }
}
export function allMatches(includeFixtures = true) {
  return [...new Map([...(includeFixtures ? fixtures : []), ...readMatches(STORAGE_KEYS.confirmed)].map(match => [match.matchId, match])).values()]
}
export function ranking(matches: MatchRecord[], config: GameConfigSnapshot): RankingItem[] {
  return matches.filter(match => sameConfig(match.gameConfig, config)).sort(rankingOrder).map((match, index) => ({ ...match, rank: index + 1 }))
}
export function history(matches: MatchRecord[], playerId: string) {
  return matches.filter(match => match.playerId === playerId).sort(historyOrder)
}
export function confirmMatch(match: MatchRecord): MatchRecord {
  const existing = allMatches().find(record => record.matchId === match.matchId)
  if (existing) return existing
  const records = readMatches(STORAGE_KEYS.confirmed)
  writeMatches(STORAGE_KEYS.confirmed, [...records, match])
  return match
}
