import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { STAFF_STATE } from './global-setup';

/** P0 — a signed-in staff member gets the shell with every section they may open */
test.describe('staff shell', () => {
  test.skip(!existsSync(STAFF_STATE), 'no staff credentials — NOT RUN (set E2E_STAFF_EMAIL/PASSWORD)');
  test.use({ storageState: STAFF_STATE });

  test('P0-ADM-03 /admin opens the first permitted section with the full nav', async ({ page, isMobile }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/jobs$/);
    await expect(page.getByRole('heading', { level: 1, name: 'งานเข้า' })).toBeVisible();
    if (isMobile) {
      await page.getByRole('button', { name: 'เพิ่มเติม' }).click();
      const sheet = page.getByRole('dialog', { name: 'เพิ่มเติม' });
      for (const label of ['คนขับและรถ', 'กฎราคา', 'จุดหมาย', 'การเชื่อมต่อ', 'ทีมงานและสิทธิ์']) {
        await expect(sheet.getByRole('link', { name: label, exact: true })).toBeVisible();
      }
    } else {
      const nav = page.getByRole('navigation', { name: 'เมนูหลัก' });
      for (const label of ['งานเข้า', 'เสนอราคา', 'จัดคนขับ', 'คนขับและรถ', 'กฎราคา', 'จุดหมาย', 'การเชื่อมต่อ', 'ทีมงานและสิทธิ์']) {
        await expect(nav.getByRole('link', { name: new RegExp(`^${label}`) })).toBeVisible();
      }
    }
  });

  test('P0-ADM-04 a signed-in visit to the login page goes to /admin', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page).toHaveURL(/\/admin\/jobs$/);
  });
});
