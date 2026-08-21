import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results/e2e',
  timeout: 45_000,
  retries: process.env.CI === 'true' ? 2 : 0,
  reporter: process.env.CI === 'true' ? [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.DSH_E2E_URL ?? 'http://127.0.0.1:3080',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 960 },
  },
})
