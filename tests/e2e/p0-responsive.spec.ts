import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { STAFF_STATE } from './global-setup';

/** P0 — small screens get a bottom menu, desktop does not; nothing scrolls sideways at 360px */
const noSideScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

test.describe('customer bottom menu', () => {
  test('P0-RSP-01 phone shows the tab bar; desktop hides it', async ({ page, isMobile }) => {
    await page.goto('/trips');
    const nav = page.getByRole('navigation', { name: /^(เมนู|Menu)$/ });
    if (isMobile) {
      await expect(nav).toBeVisible();
      await expect(nav.getByRole('link', { name: /ทริปของฉัน|My trips/ })).toHaveAttribute('aria-current', 'page');
    } else {
      await expect(nav).toBeHidden();
    }
  });

  test('P0-RSP-02 my trips: empty state, then a remembered trip, then removed', async ({ page }) => {
    await page.goto('/trips');
    await expect(page.getByRole('link', { name: /วางทริป|Plan a trip/ }).first()).toBeVisible();
    await page.evaluate(() =>
      localStorage.setItem(
        'aewkan.trips',
        JSON.stringify([{ token: 'x'.repeat(43), bookingNo: '20261100001', travelDate: '2026-11-02', title: 'ดอยสุเทพ', savedAt: '' }]),
      ),
    );
    await page.reload();
    const row = page.getByRole('link', { name: /ดอยสุเทพ/ });
    await expect(row).toHaveAttribute('href', `/j/${'x'.repeat(43)}`);
    await page.getByRole('button', { name: /ลบออกจากเครื่องนี้|Remove from this device/ }).click();
    await expect(row).toHaveCount(0);
  });

  test('P0-RSP-03 language tab switches the menu language', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'tab bar is phone-only');
    await page.goto('/trips');
    const nav = page.getByRole('navigation', { name: /^(เมนู|Menu)$/ });
    const before = await nav.getByRole('link').nth(1).innerText();
    await nav.getByRole('button').click();
    await expect(nav.getByRole('link').nth(1)).not.toHaveText(before);
  });

  test('P0-RSP-04 no sideways scroll at 360px on public pages', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    for (const path of ['/', '/trips', '/admin/login']) {
      await page.goto(path);
      await noSideScroll(page);
    }
  });
});

test.describe('admin at 360px', () => {
  test.skip(!existsSync(STAFF_STATE), 'no staff credentials — NOT RUN (set E2E_STAFF_EMAIL/PASSWORD)');
  test.use({ storageState: STAFF_STATE, viewport: { width: 360, height: 740 } });

  test('P0-RSP-05 admin uses the bottom menu and never scrolls sideways', async ({ page }) => {
    await page.goto('/admin/jobs');
    await expect(page.getByRole('navigation', { name: 'เมนูมือถือ' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'เมนูหลัก' })).toBeHidden();
    for (const path of ['/admin/jobs', '/admin/pricing', '/admin/integrations']) {
      await page.goto(path);
      await noSideScroll(page);
    }
  });
});
