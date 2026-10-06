import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests run the real app against `e2e/fake-opencode-server.mjs`,
 * which implements the slice of the OpenCode HTTP API Remote uses (including
 * the `/global/event` SSE stream). Three projects:
 *
 *  - `dev`     the Vite dev server, desktop viewport
 *  - `mobile`  the same dev server, Pixel 7 viewport (drawer layout)
 *  - `prod`    the production build served by `vite preview`, pointed at the
 *              fake server through VITE_OPENCODE_URL at build time
 */
const FAKE = 'http://127.0.0.1:4096'
const DEV = 'http://127.0.0.1:5173'
const PREVIEW = 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 7_000 },

  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'dev',
      testMatch: /app\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: DEV },
    },
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 7'], baseURL: DEV },
    },
    {
      name: 'prod',
      testMatch: /prod\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: PREVIEW },
    },
  ],

  webServer: [
    {
      command: `node e2e/fake-opencode-server.mjs --port 4096`,
      url: `${FAKE}/global/health`,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      timeout: 30_000,
    },
    {
      command: `npm run dev -- --port 5173 --strictPort --host 127.0.0.1`,
      url: DEV,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      timeout: 120_000,
    },
    {
      command: `VITE_OPENCODE_URL=${FAKE} npm run build && npm run preview -- --port 4173 --strictPort --host 127.0.0.1`,
      url: PREVIEW,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      timeout: 240_000,
    },
  ],
})
