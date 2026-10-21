import { existsSync } from 'node:fs';
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { STAFF_STATE } from './global-setup';
import {
  cleanupP4,
  lookups,
  makeP4Job,
  newClient,
  PROMPTPAY_ID,
  restoreIntegrations,
  RUN,
  snapshotIntegrations,
  staffClient,
  type IntegrationSnap,
  type P4Job,
  type Sb,
} from './p4-helpers';

/** P4 การเชื่อมต่อ — saving config and Vault secrets through the staff session (no service role) */
const expect = baseExpect.configure({ timeout: 15_000 });
test.skip(!existsSync(STAFF_STATE), 'NOT RUN: no staff credentials (E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD)');
test.use({ storageState: STAFF_STATE, locale: 'th-TH', permissions: ['clipboard-read', 'clipboard-write', 'notifications'] });
test.describe.configure({ mode: 'serial', timeout: 90_000 });

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
let staff: Sb;
let snaps: IntegrationSnap[] = [];
const made: P4Job[] = [];

test.beforeAll(async () => {
  staff = await staffClient();
  snaps = await snapshotIntegrations(staff, ['promptpay', 'slip', 'stripe', 'line', 'beam', 'routing']);
  const dirty = snaps.filter((s) => s.has_secret);
  // a secret that existed before cannot be restored — refuse to run instead of destroying it
  test.skip(dirty.some((s) => ['slip', 'stripe'].includes(s.key)), 'NOT RUN: slip/stripe already hold real secrets');
});
test.afterAll(async () => {
  await cleanupP4(staff, made);
  if (staff) await restoreIntegrations(staff, snaps);
});

const open = (page: Page) => page.goto('/admin/integrations');

test('P4-50 one card per integration with webhook URLs from NEXT_PUBLIC_SITE_URL', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('การเชื่อมต่อ');
  for (const k of ['promptpay', 'slip', 'stripe', 'beam', 'line', 'routing', 'push']) await expect(page.getByTestId(`integ-${k}`)).toBeVisible();
  await expect(page.getByTestId('webhook-stripe')).toHaveValue(`${SITE}/api/webhooks/stripe`);
  await expect(page.getByTestId('webhook-beam')).toHaveValue(`${SITE}/api/webhooks/beam`);
  await expect(page.getByTestId('webhook-line')).toHaveValue(`${SITE}/api/webhooks/line`);
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw).toBeLessThanOrEqual(iw);
});

test('P4-54 switching PromptPay on without an ID is refused (422 config_incomplete)', async ({ page }) => {
  await open(page);
  const pp = page.getByTestId('integ-promptpay');
  await pp.locator('input[name="id"]').fill('');
  await pp.getByTestId('toggle-promptpay').click();
  await pp.getByTestId('save-promptpay').click();
  await expect(page.getByText(/ก่อนเปิดใช้งาน/)).toBeVisible();
  const res = await page.request.post('/api/admin/integrations', { data: { key: 'promptpay', isEnabled: true, config: { id: '' } } });
  expect(res.status()).toBe(422);
  expect((await res.json()).error.code).toBe('config_incomplete');
  const bad = await page.request.post('/api/admin/integrations', { data: { key: 'nope', isEnabled: false, config: {} } });
  expect(bad.status()).toBe(422);
});

test('P4-51 save PromptPay config + toggle; it persists after reload', async ({ page }) => {
  await open(page);
  const pp = page.getByTestId('integ-promptpay');
  await pp.locator('input[name="id"]').fill(PROMPTPAY_ID);
  await pp.locator('input[name="name"]').fill(`E2E ${RUN}`);
  const toggle = pp.getByTestId('toggle-promptpay');
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await pp.getByTestId('save-promptpay').click();
  await expect(page.getByText('บันทึกการตั้งค่าแล้ว')).toBeVisible();
  await page.reload();
  const again = page.getByTestId('integ-promptpay');
  await expect(again.locator('input[name="id"]')).toHaveValue(PROMPTPAY_ID);
  await expect(again.locator('input[name="name"]')).toHaveValue(`E2E ${RUN}`);
  await expect(again.getByTestId('toggle-promptpay')).toHaveAttribute('aria-checked', 'true');
});

test('P4-55 test buttons: PromptPay is checked from config; others answer server_not_configured without the service role', async ({ page }) => {
  await open(page);
  await page.getByTestId('test-promptpay').click();
  await expect(page.getByText(/สร้าง QR ได้ · พร้อมเพย์ 081-234-5678/)).toBeVisible();
  await page.getByTestId('test-slip').click();
  await expect(page.getByText(/SUPABASE_SECRET_KEY/)).toBeVisible();
  const res = await page.request.post('/api/admin/integrations/test', { data: { key: 'stripe' } });
  expect(res.status()).toBe(503);
  expect((await res.json()).error.code).toBe('server_not_configured');
});

test('P4-52 a secret is write-only: badge "ตั้งค่าแล้ว", empty input, never in the HTML or any response; clear removes it', async ({ page }) => {
  const secret = `e2e-slip-key-${RUN}-do-not-leak`;
  await open(page);
  const slip = page.getByTestId('integ-slip');
  await expect(slip.getByTestId('secret-state-slip-apiKey')).toHaveText('ยังไม่ได้ตั้ง');
  await slip.getByTestId('secret-slip-apiKey').fill(secret);
  const resp = page.waitForResponse((r) => r.url().endsWith('/api/admin/integrations') && r.request().method() === 'POST');
  await slip.getByTestId('save-slip').click();
  const body = await (await resp).text();
  expect(body).not.toContain(secret);
  expect(JSON.parse(body)).toMatchObject({ key: 'slip', secretFields: ['apiKey'] });
  await expect(slip.getByTestId('secret-state-slip-apiKey')).toHaveText('ตั้งค่าแล้ว');
  await expect(slip.getByTestId('secret-slip-apiKey')).toHaveValue('');
  // stored in Vault: the row says so, the page source does not carry it
  expect((await staff.from('integrations').select('has_secret').eq('key', 'slip').single()).data?.has_secret).toBe(true);
  await page.reload();
  expect(await page.content()).not.toContain(secret);
  await expect(page.getByTestId('integ-slip').getByTestId('secret-state-slip-apiKey')).toHaveText('ตั้งค่าแล้ว');
  // and staff cannot read it back through the API either
  const direct = await staff.rpc('get_integration_secret', { p_key: 'slip' });
  expect(direct.error).not.toBeNull();
  // clear
  await page.getByTestId('integ-slip').getByTestId('secret-clear-slip-apiKey').click();
  await expect(page.getByTestId('integ-slip').getByTestId('secret-state-slip-apiKey')).toHaveText('จะล้างเมื่อบันทึก');
  await page.getByTestId('integ-slip').getByTestId('save-slip').click();
  await expect(page.getByTestId('integ-slip').getByTestId('secret-state-slip-apiKey')).toHaveText('ยังไม่ได้ตั้ง');
  expect((await staff.from('integrations').select('has_secret').eq('key', 'slip').single()).data?.has_secret).toBe(false);
});

test('P4-53 multi-field secret (Stripe): fields merge in SQL — replacing one keeps the other', async ({ page }) => {
  const post = (secrets: Record<string, string>) => page.request.post('/api/admin/integrations', { data: { key: 'stripe', isEnabled: false, config: {}, secrets } });
  let r = await post({ secretKey: 'sk_test_e2eA', webhookSecret: 'whsec_e2eA' });
  expect(r.status()).toBe(200);
  expect((await r.json()).secretFields.sort()).toEqual(['secretKey', 'webhookSecret']);
  r = await post({ secretKey: 'sk_test_e2eB' });
  expect((await r.json()).secretFields.sort()).toEqual(['secretKey', 'webhookSecret']);
  r = await post({ webhookSecret: '' });
  expect((await r.json()).secretFields).toEqual(['secretKey']);
  const fields = await staff.rpc('integration_secret_fields');
  expect((fields.data as Record<string, string[]>).stripe).toEqual(['secretKey']);
  r = await post({ secretKey: 'pk_live_wrong' });
  expect(r.status()).toBe(422);
  r = await post({ secretKey: '' });
  expect((await r.json()).secretFields).toEqual([]);
  const text = await r.text();
  expect(text).not.toContain('sk_test_e2e');
});

test('P4-56 VAPID keys: generated once on the server, public key shown, a second generate needs rotate', async ({ page }) => {
  await open(page);
  const card = page.getByTestId('integ-push');
  if (await card.getByTestId('push-generate').isVisible()) {
    await card.getByTestId('push-generate').click();
    await expect(page.getByText('สร้างกุญแจแล้ว')).toBeVisible();
  }
  await expect(card.getByTestId('push-public-key')).toHaveValue(/^[A-Za-z0-9_-]{87}$/);
  const again = await page.request.post('/api/admin/integrations/push', { data: { action: 'generate' } });
  expect(again.status()).toBe(409);
  expect((await again.json()).error.code).toBe('push_keys_exist');
  const cfg = await staff.rpc('get_push_config');
  expect(Object.keys(cfg.data as object).sort()).toEqual(['created_at', 'is_enabled', 'public_key', 'subject', 'updated_at']);
  const priv = await staff.rpc('get_push_private_key');
  expect(priv.error).not.toBeNull();
});

test('P4-44 push opt-in on the customer link once keys exist; job_push_subscribe stores a subscription', async ({ page }) => {
  const cat = await lookups(staff);
  const j = await makeP4Job(staff, cat, { label: 'push', status: 'confirmed' });
  made.push(j);
  await page.goto(`/j/${j.customerToken}`);
  await expect(page.getByTestId('notify-opt-in')).toBeVisible();
  await expect(page.getByTestId('push-opt-in')).toContainText('รับแจ้งเตือนบนเครื่องนี้');
  const info = await newClient().rpc('job_pay_info', { p_token: j.customerToken });
  expect((info.data as { push_key: string }).push_key).toMatch(/^[A-Za-z0-9_-]{87}$/);
  const sub = await newClient().rpc('job_push_subscribe', {
    p_token: j.customerToken,
    p_endpoint: `https://push.example.invalid/e2e/${RUN}/${j.bookingNo}`,
    p_p256dh: 'BOr' + 'A'.repeat(84),
    p_auth: 'e2e-auth-secret-1',
  });
  expect(sub.error).toBeNull();
});
