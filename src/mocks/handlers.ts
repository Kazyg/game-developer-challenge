import { delay, http, HttpResponse } from 'msw'
import type { ApiErrorResponse, GameConfigSnapshot, PaginationRequest, RegisterMatchResponse } from '../api/contracts'
import { validConfig, validMatch } from '../api/contracts'
import { API_TIMEOUT } from '../api/client'
import { allMatches, confirmMatch, history, paginate, ranking } from './state'
import { nextScenario } from './scenarios'

const error = (status: number, message: string) => HttpResponse.json<ApiErrorResponse>({ code: `HTTP_${status}`, message }, { status })
function pagination(url: URL): PaginationRequest | null {
  const page = Number(url.searchParams.get('page') ?? 1)
  const pageSize = Number(url.searchParams.get('pageSize') ?? 5)
  return Number.isInteger(page) && page >= 1 && Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 100 ? { page, pageSize } : null
}
async function responseFailure(kind: 'ranking' | 'history' | 'register', snapshot: ReturnType<typeof nextScenario>) {
  await delay(snapshot.delay)
  const scenario = snapshot.scenario
  if (scenario === 'timeout') { await delay(API_TIMEOUT + 500); return error(504, 'Request timed out.') }
  if (scenario === 'network-error') return HttpResponse.error()
  if (scenario === 'http-400') return error(400, 'Simulated invalid request.')
  if (scenario === 'http-500') return error(500, 'Simulated server error.')
  if (scenario === `${kind}-failure` || (kind === 'register' && scenario === 'unavailable-on-match-end')) return error(503, 'Service temporarily unavailable.')
  return null
}
export const handlers = [
  http.get('*/api/ranking', async ({ request }) => {
    const snapshot = nextScenario()
    const failed = await responseFailure('ranking', snapshot)
    if (failed) return failed
    const url = new URL(request.url)
    const page = pagination(url)
    const config: GameConfigSnapshot = { gameSessionTime: Number(url.searchParams.get('gameSessionTime')), enemySpawnTime: Number(url.searchParams.get('enemySpawnTime')) }
    if (!page || !validConfig(config)) return error(400, 'Invalid pagination or game configuration.')
    return HttpResponse.json(paginate(ranking(allMatches(snapshot.scenario !== 'empty'), config), page))
  }),
  http.get('*/api/matches', async ({ request }) => {
    const snapshot = nextScenario()
    const failed = await responseFailure('history', snapshot)
    if (failed) return failed
    const url = new URL(request.url)
    const page = pagination(url)
    const playerId = url.searchParams.get('playerId')
    if (!page || !playerId) return error(400, 'Player and valid pagination are required.')
    return HttpResponse.json(paginate(history(allMatches(snapshot.scenario !== 'empty'), playerId), page))
  }),
  http.post('*/api/matches', async ({ request }) => {
    const snapshot = nextScenario()
    const failed = await responseFailure('register', snapshot)
    if (failed) return failed
    let payload: unknown
    try { payload = await request.json() } catch { return error(400, 'Invalid JSON.') }
    if (!validMatch(payload) || request.headers.get('Idempotency-Key') !== payload.matchId) return error(400, 'Invalid completed match or idempotency key.')
    try {
      const match = confirmMatch(payload)
      // Commit BEFORE withholding the response: retry must find the same record.
      if (snapshot.scenario === 'timeout-after-register') await delay(API_TIMEOUT + 500)
      return HttpResponse.json<RegisterMatchResponse>({ match })
    } catch { return error(500, 'Unable to persist match.') }
  }),
]
