import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './api/queries'

if (new URLSearchParams(location.search).get('profile') === '1') {
  const { installProfiling } = await import('./game/profiling')
  installProfiling()
}

// Start in development AND published builds before the first query.
try { const { startMockApi } = await import('./mocks/browser'); await startMockApi() } catch (error) { console.error('Mock API startup failed; gameplay remains available.', error) }
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}><App /></QueryClientProvider>
  </StrictMode>,
)
