import { expect, test } from '@playwright/test';

/** P0 — public site loads and the admin gate holds (no credentials needed) */

test('P0-PUB-01 home page renders the catalog-backed hero', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('group', { name: /ภาษา|Language/ })).toBeVisible();
});

test('P0-PUB-02 language switch flips the hero to English and back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Draw your trip on the map and see the price instantly');
  await page.getByRole('button', { name: 'ไทย', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('วางทริปของคุณบนแผนที่ แล้วเห็นราคาทันที');
});

test('P0-ADM-01 an anonymous visit to /admin/jobs lands on the login page', async ({ page }) => {
  await page.goto('/admin/jobs');
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fjobs/);
  await expect(page.getByRole('heading', { name: 'เข้าสู่ระบบทีมงาน' })).toBeVisible();
});

test('P0-ADM-02 the service worker path is never redirected to login', async ({ request }) => {
  const res = await request.get('/sw.js', { maxRedirects: 0 });
  expect(res.status()).not.toBe(307);
});

test('P0-API-01 setup API answers JSON, never the login page', async ({ request }) => {
  const res = await request.post('/api/admin/setup', { data: {}, maxRedirects: 0 });
  expect([404, 422, 503]).toContain(res.status());
  const body = await res.json();
  expect(body.error.code).toMatch(/not_found|validation|server_not_configured/);
});
