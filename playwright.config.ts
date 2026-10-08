import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  retries: 0,

  // Role isolation is intentional: each role project owns exactly one worker.
  // This prevents a worker from authenticating as multiple roles and makes
  // auth/data contamination diagnosable. Cross-role stateful suites are tagged
  // @student and therefore run in the single Student worker as their coordinator.
  workers: process.env.CI ? 4 : undefined,

  use: {
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },

  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run preview',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },

  projects: [
    {
      name: 'student',
      workers: 1,
      grep: /@student\b/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'parent',
      workers: 1,
      grep: /@parent\b/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'staff',
      workers: 1,
      grep: /@staff\b/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'admin',
      workers: 1,
      grep: /@admin\b/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
