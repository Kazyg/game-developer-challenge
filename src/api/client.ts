import axios from 'axios'
import type { ApiErrorKind, ApiErrorResponse, HistoryRequest, HistoryResponse, RankingRequest, RankingResponse, RegisterMatchRequest, RegisterMatchResponse } from './contracts'

export const API_TIMEOUT = 2500
export const httpClient = axios.create({ baseURL: `${import.meta.env.BASE_URL}api`, timeout: API_TIMEOUT })
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
export async function getRanking(request: RankingRequest, signal?: AbortSignal): Promise<RankingResponse> {
  return (await httpClient.get<RankingResponse>('/ranking', { signal, params: { ...request.gameConfig, page: request.page, pageSize: request.pageSize } })).data
}
export async function getHistory(request: HistoryRequest, signal?: AbortSignal): Promise<HistoryResponse> {
  return (await httpClient.get<HistoryResponse>('/matches', { signal, params: request })).data
}
export async function registerMatch(request: RegisterMatchRequest): Promise<RegisterMatchResponse> {
  return (await httpClient.post<RegisterMatchResponse>('/matches', request, { headers: { 'Idempotency-Key': request.matchId } })).data
}
