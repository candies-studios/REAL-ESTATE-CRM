import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests. They need the app running against a local Supabase
 * (e.g. `supabase start`, migrations applied) with email auto-confirm on.
 * Run: E2E_BASE_URL=http://localhost:3000 npm run test:e2e
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    launchOptions: process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
  ],
});
