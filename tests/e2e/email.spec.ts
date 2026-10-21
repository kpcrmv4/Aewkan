import { existsSync } from 'node:fs';
import { expect as baseExpect, test } from '@playwright/test';
import { STAFF_STATE } from './global-setup';
import { restoreIntegrations, RUN, snapshotIntegrations, staffClient, type IntegrationSnap, type Sb } from './p4-helpers';

/** customer e-mail through Resend — settings work with the staff session; sending needs the service role */
const expect = baseExpect.configure({ timeout: 15_000 });
test.skip(!existsSync(STAFF_STATE), 'NOT RUN: no staff credentials (E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD)');
test.use({ storageState: STAFF_STATE, locale: 'th-TH' });
test.describe.configure({ mode: 'serial', timeout: 90_000 });

let staff: Sb;
let snaps: IntegrationSnap[] = [];

test.beforeAll(async () => {
  staff = await staffClient();
  snaps = await snapshotIntegrations(staff, ['email']);
  test.skip(snaps.some((s) => s.has_secret), 'NOT RUN: the e-mail integration already holds a real key');
});
test.afterAll(async () => {
  if (staff) await restoreIntegrations(staff, snaps);
});

test('EMAIL-01 the Resend card is on the integrations page', async ({ page }) => {
  await page.goto('/admin/integrations');
  const card = page.getByTestId('integ-email');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Resend');
  await expect(card.locator('input[name="fromEmail"]')).toBeVisible();
});

test('EMAIL-02 switching on needs a sender and a re_ key; a bad sender is refused', async ({ page }) => {
  const post = (data: unknown) => page.request.post('/api/admin/integrations', { data });
  const noSender = await post({ key: 'email', isEnabled: true, config: {} });
  expect(noSender.status()).toBe(422);
  expect((await noSender.json()).error.code).toBe('config_incomplete');
  const badSender = await post({ key: 'email', isEnabled: false, config: { fromEmail: 'nope' } });
  expect((await badSender.json()).error.code).toBe('bad_config');
  const noKey = await post({ key: 'email', isEnabled: true, config: { fromEmail: 'booking@aewkan.test' } });
  expect((await noKey.json()).error.code).toBe('config_incomplete');
  const badKey = await post({ key: 'email', isEnabled: false, config: { fromEmail: 'booking@aewkan.test' }, secret: 'sk_live_x' });
  expect((await badKey.json()).error.code).toBe('bad_secret');
});

test('EMAIL-03 save sender + key: key is write-only, settings persist, test answers without the service role', async ({ page }) => {
  const key = `re_e2e_${RUN}_secretvalue`;
  const res = await page.request.post('/api/admin/integrations', {
    data: { key: 'email', isEnabled: true, config: { fromEmail: 'booking@aewkan.test', fromName: `E2E ${RUN}` }, secret: key },
  });
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).not.toContain(key);
  expect(JSON.parse(body)).toMatchObject({ key: 'email', isEnabled: true, secretFields: ['apiKey'] });

  await page.goto('/admin/integrations');
  const card = page.getByTestId('integ-email');
  await expect(card.locator('input[name="fromEmail"]')).toHaveValue('booking@aewkan.test');
  await expect(card).toContainText('ตั้งค่าแล้ว');
  expect(await page.content()).not.toContain(key);

  const t = await page.request.post('/api/admin/integrations/test', { data: { key: 'email' } });
  if (process.env.SUPABASE_SECRET_KEY) {
    expect(t.status()).toBe(200); // a real send to the staff address — not asserted further
  } else {
    expect(t.status()).toBe(503);
    expect((await t.json()).error.code).toBe('server_not_configured');
  }
});
