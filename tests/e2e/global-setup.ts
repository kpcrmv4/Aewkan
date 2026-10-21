import { chromium, type FullConfig } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';

/**
 * Sign each staff role in ONCE and persist its storageState
 * (per-test logins hit Supabase Auth's rate limit).
 * Credentials come from the environment only: E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD.
 * Missing → staff specs must report "did not run", never pass empty.
 */
export default async function globalSetup(config: FullConfig) {
  mkdirSync('tests/e2e/.auth', { recursive: true });
  const email = process.env.E2E_OWNER_EMAIL;
  const password = process.env.E2E_OWNER_PASSWORD;
  if (!email || !password) {
    console.warn('[e2e] E2E_OWNER_EMAIL/PASSWORD not set — staff specs will be skipped and reported as not run');
    return;
  }
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://127.0.0.1:3100';
  const executablePath = process.env.PW_CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const browser = await chromium.launch({ args: ['--no-sandbox'], executablePath });
  const page = await browser.newPage({ baseURL });
  await page.goto('/admin/login');
  await page.getByLabel('อีเมล').fill(email);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await page.waitForURL(/\/admin\/(?!login)/);
  await page.context().storageState({ path: 'tests/e2e/.auth/owner.json' });
  await browser.close();
}
