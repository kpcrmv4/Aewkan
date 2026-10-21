import { existsSync } from 'node:fs';
import { expect as baseExpect, test, type Locator, type Page } from '@playwright/test';
import { STAFF_STATE } from './global-setup';
import { cleanupP4, lookups, makeP4Job, newClient, slipByRpc, staffClient, type P4Job, type Sb } from './p4-helpers';

/** P4 staff review of slips (/admin/payments) — staff session + RLS only, no service role */
const expect = baseExpect.configure({ timeout: 15_000 });
test.skip(!existsSync(STAFF_STATE), 'NOT RUN: no staff credentials (E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD)');
test.use({ storageState: STAFF_STATE, locale: 'th-TH' });
test.describe.configure({ mode: 'serial', timeout: 90_000 });

let staff: Sb;
const made: P4Job[] = [];
let R1: P4Job; // approve in the UI
let R2: P4Job; // reject in the UI with a reason
let R3: P4Job; // quoted, rejected → back to quoted with a fair deadline
const pid: Record<string, string> = {};

test.beforeAll(async () => {
  test.setTimeout(120_000);
  staff = await staffClient();
  const cat = await lookups(staff);
  R1 = await makeP4Job(staff, cat, { label: 'rev-approve', status: 'awaiting_deposit' });
  R2 = await makeP4Job(staff, cat, { label: 'rev-reject', status: 'awaiting_deposit' });
  R3 = await makeP4Job(staff, cat, {
    label: 'rev-quote',
    status: 'quoted',
    quote: { price: 4800, deposit: 1200, deadline: new Date(Date.now() + 30 * 60_000).toISOString(), hours: 3 },
  });
  made.push(R1, R2, R3);
  for (const j of [R1, R2, R3]) {
    const r = await slipByRpc(j);
    if (r.error) throw new Error(`slip ${j.bookingNo}: ${r.error}`);
    pid[j.id] = (r.data as { payment_id: string }).payment_id;
  }
});
test.afterAll(async () => {
  await cleanupP4(staff, made);
});

const card = (page: Page, j: P4Job): Locator => page.getByTestId('slip-card').filter({ has: page.getByTestId('slip-booking').getByText(j.bookingNo, { exact: true }) });

test('P4-20 queue: the slip with its booking, due amount, preview via a signed URL and no auto-check yet', async ({ page }) => {
  await page.goto('/admin/payments');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('การเงิน');
  const c = card(page, R1);
  await expect(c).toBeVisible();
  await expect(c.getByTestId('slip-due')).toHaveText('฿900');
  await expect(c.getByTestId('slip-check')).toContainText('ยังไม่ได้ตรวจอัตโนมัติ');
  const img = c.getByTestId('slip-preview');
  await expect(img).toHaveAttribute('src', /\/storage\/v1\/object\/sign\/payment-slips\//);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await expect(card(page, R3).getByTestId('slip-due')).toHaveText('฿1,200');
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw).toBeLessThanOrEqual(iw);
});

test('P4-21 approve → payment paid, booking confirmed, customer sees the deposit paid', async ({ page }) => {
  await page.goto('/admin/payments');
  await card(page, R1).getByTestId('approve').click();
  await expect(page.getByRole('dialog')).toContainText(`การจอง ${R1.bookingNo} · ฿900`);
  await page.getByTestId('review-confirm').click();
  await expect(page.getByText('อนุมัติมัดจำแล้ว')).toBeVisible();
  await expect(card(page, R1)).toHaveCount(0);
  const { data: p } = await staff.from('payments').select('status, paid_at, verified_by').eq('id', pid[R1.id]).single();
  expect(p).toMatchObject({ status: 'paid' });
  expect(p?.paid_at).toBeTruthy();
  expect(p?.verified_by).toBeTruthy();
  expect((await staff.from('bookings').select('status').eq('id', R1.id).single()).data?.status).toBe('confirmed');
  const view = await newClient().rpc('get_job_view', { p_token: R1.customerToken });
  expect((view.data as { paid: number }).paid).toBe(900);
});

test('P4-42 notifyBooking without the service role logs "skipped · server_not_configured" (after the response)', async () => {
  await expect
    .poll(async () => {
      const { data } = await staff.from('notification_log').select('channel, kind, status, error').eq('booking_id', R1.id);
      return data ?? [];
    })
    .toEqual(
      expect.arrayContaining([
        { channel: 'push', kind: 'confirmed', status: 'skipped', error: 'server_not_configured' },
        { channel: 'line', kind: 'confirmed', status: 'skipped', error: 'server_not_configured' },
      ]),
    );
});

test('P4-22 reject with a reason → payment failed, booking awaiting_deposit, the customer sees why', async ({ page }) => {
  await page.goto('/admin/payments');
  await card(page, R2).getByTestId('reject').click();
  await page.getByTestId('reject-note').fill('ยอดไม่ครบ');
  await page.getByTestId('review-confirm').click();
  await expect(page.getByText('บันทึกว่าสลิปไม่ผ่านแล้ว')).toBeVisible();
  const { data: p } = await staff.from('payments').select('status, verify_result').eq('id', pid[R2.id]).single();
  expect(p?.status).toBe('failed');
  expect((p?.verify_result as { review: { note: string; approve: boolean } }).review).toMatchObject({ note: 'ยอดไม่ครบ', approve: false });
  expect((await staff.from('bookings').select('status').eq('id', R2.id).single()).data?.status).toBe('awaiting_deposit');
  const info = await newClient().rpc('job_pay_info', { p_token: R2.customerToken });
  expect(info.data).toMatchObject({ open: true, due: 900, slip: { status: 'failed', note: 'ยอดไม่ครบ' } });
  await page.goto(`/j/${R2.customerToken}`);
  await expect(page.getByTestId('slip-rejected')).toContainText('สลิปไม่ผ่านการตรวจ');
  await expect(page.getByTestId('slip-rejected')).toContainText('เหตุผล: ยอดไม่ครบ');
});

test('P4-23 rejecting a quote deposit gives the quote back with at least quote_hours left', async ({ page }) => {
  const res = await page.request.post('/api/admin/payments/confirm', { data: { paymentId: pid[R3.id], approve: false, note: 'สลิปไม่ชัด' } });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ status: 'failed', booking_status: 'quoted' });
  const { data: b } = await staff.from('bookings').select('status, quote_deadline').eq('id', R3.id).single();
  expect(b?.status).toBe('quoted');
  expect(Date.parse(b!.quote_deadline!)).toBeGreaterThan(Date.now() + 3 * 3600_000 - 5 * 60_000);
});

test('P4-24 a payment cannot be reviewed twice', async ({ page }) => {
  const res = await page.request.post('/api/admin/payments/confirm', { data: { paymentId: pid[R1.id], approve: false } });
  expect(res.status()).toBe(409);
  expect((await res.json()).error.code).toBe('payment_already_reviewed');
});

test('P4-25 route guards: no session → 401 before the body is read; bad body → 422', async ({ page, playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const r401 = await anon.post('/api/admin/payments/confirm', { data: { nonsense: true } });
  expect(r401.status()).toBe(401);
  await anon.dispose();
  const r422 = await page.request.post('/api/admin/payments/confirm', { data: { paymentId: 'not-a-uuid', approve: 'yes' } });
  expect(r422.status()).toBe(422);
});

test('P4-26 all payments: method / status filters and booking search', async ({ page }) => {
  await page.goto(`/admin/payments?tab=all&method=promptpay_slip&status=paid&q=${R1.bookingNo}`);
  const list = page.getByTestId('payments-list');
  await expect(list).toContainText(R1.bookingNo);
  await expect(list).toContainText('รับแล้ว');
  await expect(list).not.toContainText(R2.bookingNo);
  await page.goto(`/admin/payments?status=failed&q=${R2.bookingNo}`);
  await expect(page.getByTestId('payments-list')).toContainText(R2.bookingNo);
  await expect(page.getByTestId('pay-tabs').getByRole('link', { name: 'รายการทั้งหมด' })).toHaveAttribute('aria-current', 'page');
});

test('P4-27 empty states: nothing matches a filter → message + clear link', async ({ page }) => {
  await page.goto('/admin/payments?tab=all&q=000000000');
  await expect(page.getByText('ไม่พบรายการตามตัวกรองนี้')).toBeVisible();
  await expect(page.getByRole('link', { name: 'ล้างตัวกรอง' })).toBeVisible();
});
