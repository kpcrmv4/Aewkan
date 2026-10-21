import { expect, test } from '@playwright/test';
import { openBuilder } from './p1-helpers';

/** SEO-EM-01 (phone): choosing the e-mail channel shows the hint and an invalid address blocks the submit */
test('SEO-EM-01 e-mail channel: hint shows, invalid address blocks the booking', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone project only');
  let posted = false;
  await page.route('**/api/bookings', (route) => {
    posted = true;
    return route.abort();
  });
  await openBuilder(page);
  await page.getByTestId('book-start').click();
  await page.locator('#bk-channel').selectOption('email');
  const contact = page.locator('#bk-contact');
  await expect(contact).toHaveAttribute('type', 'email');
  await expect(contact).toHaveAttribute('inputmode', 'email');
  await expect(contact).toHaveAttribute('autocomplete', 'email');
  await expect(page.getByTestId('email-hint')).toHaveText('เราจะส่งยืนยันการจองและลิงก์ทริปไปที่อีเมลนี้');
  await page.getByLabel('ชื่อผู้จอง').fill('ทดสอบ');
  await contact.fill('not-an-email');
  await page.getByTestId('book-submit').click();
  await expect(page.locator('#bk-contact-err')).toContainText('อีเมลให้ถูกต้อง');
  await expect(page.getByTestId('book-submit')).toBeVisible();
  expect(posted).toBe(false);
});
