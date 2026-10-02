import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)
export const startMockApi = () => worker.start({
  serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  onUnhandledFrame: 'bypass', quiet: true,
})
