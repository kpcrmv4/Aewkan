import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Playwright does not read .env.local; Node 22 can (E2E_* credentials live there, never in git)
try {
  process.loadEnvFile('.env.local');
} catch {
  /* no file: specs that need credentials report "not run" */
}

// cloud containers ship one Chromium; use it instead of downloading the version this
// @playwright/test pins (kp-cross-platform: never `playwright install` there)
const PREINSTALLED = '/opt/pw-browsers/chromium';
const executablePath = process.env.PW_CHROMIUM_PATH ?? (existsSync(PREINSTALLED) ? PREINSTALLED : undefined);

/**
 * E2E against the real Supabase project (kp-e2e-playwright-real-db).
 * workers: 1 — specs share one database; no retries papering over flake.
 * Staff specs sign in once in global-setup and reuse storageState (auth rate limits).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--no-sandbox'], executablePath },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--no-sandbox'], executablePath } } },
    { name: 'phone', use: { ...devices['Pixel 7'], launchOptions: { args: ['--no-sandbox'], executablePath } } },
  ],
});
