import { validMatch, validPage, validRankingItem } from './contracts'
import axios from 'axios'
import type { ApiErrorKind, ApiErrorResponse, HistoryRequest, HistoryResponse, RankingRequest, RankingResponse, RegisterMatchRequest, RegisterMatchResponse } from './contracts'

export const API_TIMEOUT = 2500
export const httpClient = axios.create({ baseURL: `${import.meta.env.BASE_URL}api`, timeout: API_TIMEOUT })
// Never send an API request to the static host when mock startup failed.
httpClient.interceptors.request.use(async request => {
  try { const { startMockApi } = await import('../mocks/browser'); await startMockApi() }
  catch { throw new ApiError('client', 'Mock API could not start. Check the service worker URL and scope, then reload.') }
  return request
})
export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message); this.name = 'ApiError'; this.kind = kind; this.status = status
  }
}
export function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return new ApiError('timeout', 'Request timed out. Please retry.')
    if (!error.response) return new ApiError('network', 'Network unavailable. Please retry.')
    const status = error.response.status
    return new ApiError(status >= 500 ? 'server' : 'client', error.response.data?.message ?? `Request failed (${status}).`, status)
  }
  return new ApiError('network', error instanceof Error ? error.message : 'Request failed.')
}
httpClient.interceptors.response.use(response => response, error => Promise.reject(normalizeError(error)))
function invalidApiResponse() {
  return new ApiError('client', 'API returned an invalid response. Check mock API startup, worker scope and deployment base URL.')
}
export async function getRanking(request: RankingRequest, signal?: AbortSignal): Promise<RankingResponse> {
  const { data } = await httpClient.get<unknown>('/ranking', { signal, params: { ...request.gameConfig, page: request.page, pageSize: request.pageSize } })
  if (!validPage(data, validRankingItem)) throw invalidApiResponse()
  return data
}
export async function getHistory(request: HistoryRequest, signal?: AbortSignal): Promise<HistoryResponse> {
  const { data } = await httpClient.get<unknown>('/matches', { signal, params: request })
  if (!validPage(data, validMatch)) throw invalidApiResponse()
  return data
}
export async function registerMatch(request: RegisterMatchRequest): Promise<RegisterMatchResponse> {
  const { data } = await httpClient.post<Partial<RegisterMatchResponse>>('/matches', request, { headers: { 'Idempotency-Key': request.matchId } })
  if (!validMatch(data?.match) || data.match.matchId !== request.matchId) throw invalidApiResponse()
  return { match: data.match }
}
