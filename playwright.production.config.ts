import { defineConfig } from '@playwright/test'
import { randomUUID } from 'node:crypto'
const testServerToken = randomUUID()

export default defineConfig({
  metadata: { testServerToken, testServerUrl: 'http://127.0.0.1:4173' },
  globalTeardown: './tests/server-teardown.ts',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-production' }]],
  testDir: './tests/production',
  outputDir: 'test-results-production',
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1280, height: 900 }, trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/test-server.mjs --preview',
    env: { TEST_SERVER_TOKEN: testServerToken },
    url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI,
  },
})
