import { randomUUID } from 'node:crypto';
import { expect as baseExpect, test, type Page } from '@playwright/test';
import {
  cleanupP4,
  HAS_STAFF,
  lookups,
  makeP4Job,
  newClient,
  PNG_SLIP,
  PROMPTPAY_ID,
  restoreIntegrations,
  setIntegration,
  slipByRpc,
  snapshotIntegrations,
  staffClient,
  type IntegrationSnap,
  type P4Job,
  type Sb,
} from './p4-helpers';

/**
 * P4 customer deposit (PromptPay + slip) — publishable key only, no service role.
 * UI rows need PayDeposit / NotifyOptIn mounted on /j/[token] (orchestrator seam).
 */
const expect = baseExpect.configure({ timeout: 15_000 });
test.skip(!HAS_STAFF, 'NOT RUN: needs E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD');
test.describe.configure({ mode: 'serial', timeout: 90_000 });
test.use({ locale: 'th-TH' });

let staff: Sb;
let snaps: IntegrationSnap[] = [];
const made: P4Job[] = [];
let A: P4Job; // awaiting_deposit, Thai — UI upload then replace
let E: P4Job; // awaiting_deposit, English
let Q: P4Job; // quoted, deadline in 2 h, quote deposit 1500
let QE: P4Job; // quoted, deadline passed
let C: P4Job; // confirmed
let N: P4Job; // awaiting_deposit — PromptPay switched off

test.beforeAll(async () => {
  test.setTimeout(120_000);
  staff = await staffClient();
  const cat = await lookups(staff);
  snaps = await snapshotIntegrations(staff, ['promptpay', 'line']);
  await setIntegration(staff, 'promptpay', true, { id: PROMPTPAY_ID, name: 'E2E แอ่วกัน' });
  const mk = async (o: Parameters<typeof makeP4Job>[2]) => {
    const j = await makeP4Job(staff, cat, o);
    made.push(j);
    return j;
  };
  const in2h = new Date(Date.now() + 2 * 3600_000).toISOString();
  const past = new Date(Date.now() - 3600_000).toISOString();
  A = await mk({ label: 'dep-th', status: 'awaiting_deposit' });
  E = await mk({ label: 'dep-en', status: 'awaiting_deposit', lang: 'en' });
  Q = await mk({ label: 'dep-quoted', status: 'quoted', quote: { price: 5200, deposit: 1500, deadline: in2h } });
  QE = await mk({ label: 'dep-quote-late', status: 'quoted', quote: { price: 5200, deposit: 1500, deadline: past } });
  C = await mk({ label: 'dep-confirmed', status: 'confirmed' });
  N = await mk({ label: 'dep-no-method', status: 'awaiting_deposit' });
});

test.afterAll(async () => {
  await cleanupP4(staff, made);
  if (staff) await restoreIntegrations(staff, snaps);
});

const open = (page: Page, j: P4Job) => page.goto(`/j/${j.customerToken}`);
const noSideways = async (page: Page) => {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw).toBeLessThanOrEqual(iw);
};
const payments = async (j: P4Job) => {
  const { data, error } = await staff.from('payments').select('id, method, purpose, status, amount, slip_path, verify_result').eq('booking_id', j.id).order('created_at');
  expect(error).toBeNull();
  return data ?? [];
};
const bookingStatus = async (j: P4Job) => (await staff.from('bookings').select('status').eq('id', j.id).single()).data?.status;

test('P4-01 PromptPay panel: amount, QR for the ID, account, upload; no card buttons while Stripe/Beam are off', async ({ page }) => {
  await open(page, A);
  const panel = page.getByTestId('pay-deposit');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('pay-title')).toHaveText('ชำระมัดจำ ฿900');
  await expect(page.getByTestId('promptpay-amount')).toHaveText('฿900');
  await expect(page.getByTestId('promptpay-id')).toContainText('พร้อมเพย์ 081-234-5678 · E2E แอ่วกัน');
  const qr = page.getByTestId('promptpay-qr');
  await expect(qr).toHaveAttribute('src', /^data:image\/png;base64,/);
  expect(await qr.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(100);
  await expect(page.getByTestId('pay-card')).toHaveCount(0);
  await noSideways(page); // P4-10 on the phone project
});

test('P4-02 upload a slip: one pending payment for the deposit, booking → deposit_review, "checking" shown', async ({ page }) => {
  await open(page, A);
  await page.getByTestId('slip-input').setInputFiles({ name: 'slip.png', mimeType: 'image/png', buffer: PNG_SLIP });
  await expect(page.getByTestId('slip-review')).toBeVisible();
  await expect(page.getByTestId('slip-review')).toContainText('ได้รับสลิปแล้ว กำลังตรวจสอบ');
  const rows = await payments(A);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ method: 'promptpay_slip', purpose: 'deposit', status: 'pending', amount: 900 });
  expect(rows[0].slip_path).toMatch(new RegExp(`^${A.id}/[0-9a-f-]{36}\\.jpg$`));
  expect(await bookingStatus(A)).toBe('deposit_review');
  await expect(page.getByTestId('status-badge')).toHaveText('รอตรวจสลิป');
});

test('P4-03 a second slip replaces the pending one on the same row (old path kept)', async () => {
  const before = (await payments(A))[0];
  const r = await slipByRpc(A);
  expect(r.error).toBeNull();
  expect(r.data).toMatchObject({ payment_id: before.id, amount: 900, replaced: true });
  const rows = await payments(A);
  expect(rows).toHaveLength(1);
  expect(rows[0].slip_path).toBe(r.path);
  expect((rows[0].verify_result as { replaced: string[] }).replaced).toEqual([before.slip_path]);
  // the same call again is a no-op (retried request)
  const again = await newClient().rpc('job_pay_slip', { p_token: A.customerToken, p_path: r.path });
  expect(again.error).toBeNull();
  expect(again.data).toMatchObject({ replaced: false });
});

test('P4-04 quoted: due is the quote deposit with the deadline; after the slip the quote can no longer expire', async ({ page }) => {
  await open(page, Q);
  await expect(page.getByTestId('pay-title')).toHaveText('ชำระมัดจำ ฿1,500');
  await expect(page.getByTestId('pay-deadline')).toContainText('(เวลาไทย)');
  const r = await slipByRpc(Q);
  expect(r.error).toBeNull();
  expect(r.data).toMatchObject({ amount: 1500 });
  expect(await bookingStatus(Q)).toBe('deposit_review');
});

test('P4-05 no deposit after the deadline or once confirmed: no panel, RPC not_payable, upload refused', async ({ page }) => {
  for (const j of [QE, C]) {
    await open(page, j);
    await expect(page.getByTestId('booking-no')).toHaveText(j.bookingNo);
    await expect(page.getByTestId('pay-skeleton')).toHaveCount(0);
    await expect(page.getByTestId('pay-deposit')).toHaveCount(0);
    const up = await newClient().storage.from('payment-slips').upload(`${j.id}/${randomUUID()}.jpg`, PNG_SLIP, { contentType: 'image/png' });
    expect(up.error).not.toBeNull();
    const rpc = await newClient().rpc('job_pay_slip', { p_token: j.customerToken, p_path: `${j.id}/${randomUUID()}.jpg` });
    expect(rpc.error?.message).toBe('not_payable');
  }
});

test('P4-06 storage policy: malformed or foreign paths refused; slips cannot be read or listed anonymously', async () => {
  const anon = newClient();
  for (const path of [`${A.id}/not-a-uuid.jpg`, `${randomUUID()}/${randomUUID()}.jpg`, `${A.id}/${randomUUID()}.pdf`, `${A.id}/x/${randomUUID()}.jpg`]) {
    const up = await anon.storage.from('payment-slips').upload(path, PNG_SLIP, { contentType: 'image/png' });
    expect(up.error, path).not.toBeNull();
  }
  const slip = (await payments(A))[0].slip_path!;
  const dl = await anon.storage.from('payment-slips').download(slip);
  expect(dl.data).toBeNull();
  const list = await anon.storage.from('payment-slips').list(A.id);
  expect(list.data ?? []).toHaveLength(0);
  // a path that is not for this booking is refused by the RPC even if the object exists
  const rpc = await anon.rpc('job_pay_slip', { p_token: E.customerToken, p_path: slip });
  expect(rpc.error?.message).toBe('bad_path');
});

test('P4-07 a driver link has no deposit: job_pay_info null, job_pay_slip link_not_found', async () => {
  const anon = newClient();
  const info = await anon.rpc('job_pay_info', { p_token: A.driverToken });
  expect(info.error).toBeNull();
  expect(info.data).toBeNull();
  const rpc = await anon.rpc('job_pay_slip', { p_token: A.driverToken, p_path: `${A.id}/${randomUUID()}.jpg` });
  expect(rpc.error?.message).toBe('link_not_found');
});

test('P4-09 English booking: the pay panel speaks English with Thailand time', async ({ page }) => {
  await open(page, E);
  await expect(page.getByTestId('pay-title')).toHaveText('Pay the deposit ฿900');
  await expect(page.getByTestId('promptpay')).toContainText('Scan to pay with PromptPay');
  await expect(page.getByTestId('promptpay')).toContainText('Attach the transfer slip');
});

test('P4-40 LINE OA: "add our LINE" deep link carries the booking number and this job link', async ({ page }) => {
  await setIntegration(staff, 'line', true, { basicId: '@e2eaewkan' }, JSON.stringify({ channelSecret: '0'.repeat(32), channelAccessToken: 'e2e' }));
  await open(page, E);
  const add = page.getByTestId('line-add');
  await expect(add).toBeVisible();
  const href = (await add.getAttribute('href')) ?? '';
  expect(href.startsWith('https://line.me/R/oaMessage/%40e2eaewkan/?')).toBe(true);
  const text = decodeURIComponent(href.split('/?')[1]);
  expect(text).toContain(`Aewkan booking ${E.bookingNo}`);
  expect(text).toContain(`/j/${E.customerToken}`);
  await setIntegration(staff, 'line', false, {}, '');
  await page.reload();
  await expect(page.getByTestId('pay-deposit')).toBeVisible();
  await expect(page.getByTestId('line-add')).toHaveCount(0);
});

test('P4-08 PromptPay switched off: the panel says the team will contact the customer', async ({ page }) => {
  await setIntegration(staff, 'promptpay', false, { id: PROMPTPAY_ID, name: 'E2E แอ่วกัน' });
  await open(page, N);
  await expect(page.getByTestId('pay-no-method')).toContainText('ทีมงานจะติดต่อคุณ');
  await expect(page.getByTestId('promptpay')).toHaveCount(0);
});
