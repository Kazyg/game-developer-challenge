import { defineConfig } from '@playwright/test'
import { randomUUID } from 'node:crypto'

const port = process.env.TEST_PORT ?? '5173'
const baseURL = `http://127.0.0.1:${port}`
const testServerToken = randomUUID()

export default defineConfig({
  metadata: { testServerToken, testServerUrl: baseURL },
  globalTeardown: './tests/server-teardown.ts',
  reporter: [['list'], ['html', { open: 'never' }]],
  testDir: './tests',
  testIgnore: '**/production/**',
  expect: { timeout: 15000 },
  use: { baseURL, viewport: { width: 1280, height: 720 }, trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/test-server.mjs',
    env: { TEST_PORT: port, TEST_SERVER_TOKEN: testServerToken },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
})
