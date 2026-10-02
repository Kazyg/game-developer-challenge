import { defineConfig } from '@playwright/test'

const port = process.env.TEST_PORT ?? '5173'
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests',
  testIgnore: '**/production/**',
  use: { baseURL, viewport: { width: 1280, height: 720 } },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
})
