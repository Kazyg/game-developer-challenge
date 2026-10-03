import type { FullConfig } from '@playwright/test'
export default async function teardown(config: FullConfig) {
  const { testServerToken, testServerUrl } = config.metadata
  if (typeof testServerToken !== 'string' || typeof testServerUrl !== 'string') return
  try {
    await fetch(`${testServerUrl}/__test_shutdown/${testServerToken}`, {
      method: 'POST', signal: AbortSignal.timeout(2000),
    })
  } catch { /* An already stopped or reused server needs no cleanup. */ }
}
