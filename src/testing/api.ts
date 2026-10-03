// Explicit development instrumentation, shared by browser regression tests.
import { httpClient, ApiError } from '../api/client'
import { enqueuePending, getPending } from '../api/pending'
import { setScenario } from '../mocks/scenarios'
export { enqueuePending, getPending, setScenario }
export { queryClient, queryKeys, rankingOptions, historyOptions } from '../api/queries'
let attempts = 0
let active = 0
let maxActive = 0
export function observeRequests() { return { attempts, active, maxActive } }
export function useRegistrationResponses(mode: 'fail' | 'success', delayMs = 0) {
  if (!import.meta.env.DEV) throw new Error('Test instrumentation is only available in development.')
  httpClient.defaults.adapter = async config => {
    if (config.method !== 'post') throw new ApiError('server', 'Query unavailable.', 500)
    attempts++
    active++
    maxActive = Math.max(maxActive, active)
    try {
      if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs))
      if (mode === 'fail') throw new ApiError('client', 'Registration rejected.', 400)
      return { data: { match: JSON.parse(config.data as string) }, status: 200, statusText: 'OK', headers: {}, config }
    } finally { active-- }
  }
}
