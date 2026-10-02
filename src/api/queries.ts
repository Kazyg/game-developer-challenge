import { QueryClient, queryOptions } from '@tanstack/react-query'
import { ApiError, getHistory, getRanking } from './client'
import type { GameConfigSnapshot, HistoryRequest, RankingRequest } from './contracts'

export const queryClient = new QueryClient({ defaultOptions: {
  queries: { staleTime: 15_000, gcTime: 300_000, refetchOnMount: 'always', refetchOnWindowFocus: true,
    retry: (count, error) => count < 1 && !(error instanceof ApiError && error.kind === 'client'), retryDelay: 200 },
  mutations: { retry: false },
} })
export const queryKeys = {
  ranking: (config: GameConfigSnapshot) => ['ranking', config] as const,
  rankingPage: (request: RankingRequest) => ['ranking', request.gameConfig, request.page, request.pageSize] as const,
  history: (playerId: string) => ['history', playerId] as const,
  historyPage: (request: HistoryRequest) => ['history', request.playerId, request.page, request.pageSize] as const,
}
export const rankingOptions = (request: RankingRequest) => queryOptions({
  queryKey: queryKeys.rankingPage(request), queryFn: ({ signal }) => getRanking(request, signal),
})
export const historyOptions = (request: HistoryRequest) => queryOptions({
  queryKey: queryKeys.historyPage(request), queryFn: ({ signal }) => getHistory(request, signal),
})
