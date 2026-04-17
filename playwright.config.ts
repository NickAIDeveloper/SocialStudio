import { defineConfig, devices } from 'playwright/test';

// Playwright config for the Performance hub + Smart Posts E2E smoke.
// Vitest already owns unit tests under src/**; these tests live under
// tests/e2e so the two runners cannot pick up each other's files.
//
// Run locally:  npm run test:e2e
// Required env: E2E_USER_EMAIL, E2E_USER_PASSWORD (see tests/e2e/README.md).

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
