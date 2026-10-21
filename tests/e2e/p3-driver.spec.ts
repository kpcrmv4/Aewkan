import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { cleanup, HAS_STAFF, jpegSize, lookups, makeJob, newClient, RUN, staffClient, type Catalogish, type Fixture } from './p3-helpers';

test.skip(!HAS_STAFF, 'NOT RUN: needs E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD');
test.describe.configure({ mode: 'serial' });
test.use({ locale: 'th-TH' });

let staff: SupabaseClient;
let cat: Catalogish;
let job: Fixture;

test.beforeAll(async () => {
  staff = await staffClient();
  cat = await lookups(staff);
  job = await makeJob(staff, cat, { label: 'driver-flow', lang: 'en' });
});
test.afterAll(async () => {
  await cleanup(staff, job ? [job] : []);
});

const bookingRow = async () => (await staff.from('bookings').select('status,started_at,finished_at,cash_collected').eq('id', job.id).single()).data!;
const photoRows = async (kind: string) => (await staff.from('booking_photos').select('storage_path,taken_at').eq('booking_id', job.id).eq('kind', kind)).data ?? [];

/** a 2400x1800 JPEG drawn in the page, so the 1600 px limit is exercised */
async function bigJpeg(page: Page): Promise<Buffer> {
  const url = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 2400;
    c.height = 1800;
    const g = c.getContext('2d')!;
    g.fillStyle = '#4f6a5f';
    g.fillRect(0, 0, 2400, 1800);
    g.fillStyle = '#ffffff';
    g.fillRect(200, 200, 800, 600);
    return c.toDataURL('image/jpeg', 0.9);
  });
  return Buffer.from(url.split(',')[1], 'base64');
}

const noHorizontalScroll = async (page: Page) => {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw).toBeLessThanOrEqual(iw);
};

const heightOf = async (page: Page, testId: string) => (await page.getByTestId(testId).boundingBox())!.height;

test('P3-40 driver view shows the customer card and starts in Thai even for an English booking', async ({ page }) => {
  await page.goto(`/j/${job.driverToken}`);
  await expect(page.getByTestId('driver-view')).toBeVisible();
  await expect(page.getByText('รายละเอียดงาน', { exact: false }).first()).toBeVisible();
  const card = page.getByTestId('customer-card');
  await expect(card).toContainText(`E2E P3 ${RUN} driver-flow`);
  await expect(card).toContainText('@e2e-p3');
  await expect(card).toContainText('E2E Hotel Nimman');
  await expect(card).toContainText('E2E note: child seat');
  await expect(card).toContainText('2 คน');
  await expect(card).toContainText('ต้องการคนขับสื่อสารภาษาต่างประเทศ');
  await expect(page.getByTestId('status-badge')).toHaveText('จัดคนขับแล้ว');
  await expect(page.getByTestId('driver-card')).toHaveCount(0);
});

test('P3-41 and P3-52 start is gated by the pickup photo; phone layout has no horizontal scroll and 44 px targets', async ({ page }) => {
  await page.goto(`/j/${job.driverToken}`);
  const start = page.getByTestId('btn-start');
  await expect(start).toBeDisabled();
  await expect(start).toHaveText('แนบรูปก่อนจึงกดได้');
  await noHorizontalScroll(page);
  expect(await heightOf(page, 'btn-start')).toBeGreaterThanOrEqual(44);
  const input = page.getByTestId('photo-input-pickup');
  await expect(input).toHaveAttribute('accept', 'image/*');
  await expect(input).toHaveAttribute('capture', 'environment');
  // the action bar is pinned to the bottom of the viewport
  const bar = await page.getByTestId('driver-action-bar').boundingBox();
  const vh = page.viewportSize()!.height;
  expect(bar!.y + bar!.height).toBeGreaterThan(vh - 2);
  expect(bar!.y + bar!.height).toBeLessThanOrEqual(vh + 2);
});

test('P3-42 pickup photo is compressed to <= 1600 px, uploaded and recorded', async ({ page }) => {
  await page.goto(`/j/${job.driverToken}`);
  const jpeg = await bigJpeg(page);
  await page.getByTestId('photo-input-pickup').setInputFiles({ name: 'cam.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  const img = page.getByTestId('photo-pickup');
  await expect(img).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'ถ่ายใหม่' })).toBeVisible();
  await expect(page.getByTestId('btn-start')).toBeEnabled();
  await expect(page.getByTestId('btn-start')).toHaveText('ยืนยันรับลูกค้าแล้ว เริ่มงาน');

  const rows = await photoRows('pickup');
  expect(rows).toHaveLength(1);
  expect(rows[0].storage_path).toMatch(new RegExp(`^${job.id}/pickup/[0-9a-f-]{36}\\.jpg$`));
  const dl = await newClient().storage.from('job-photos').download(rows[0].storage_path);
  expect(dl.error).toBeNull();
  const size = jpegSize(Buffer.from(await dl.data!.arrayBuffer()));
  expect(size).not.toBeNull();
  expect(Math.max(size!.w, size!.h)).toBeLessThanOrEqual(1600);
  expect(Math.max(size!.w, size!.h)).toBeGreaterThan(1000);
  expect(await bookingRow()).toMatchObject({ status: 'assigned' });
});

test('P3-43 and P3-51 start moves the job to traveling; the button is busy while the call runs', async ({ page }) => {
  await page.route('**/rest/v1/rpc/job_start', async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  await page.goto(`/j/${job.driverToken}`);
  const start = page.getByTestId('btn-start');
  await start.click();
  await expect(start).toBeDisabled();
  await expect(start).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText(/^รับผู้โดยสารแล้ว \d\d:\d\d$/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('status-badge')).toHaveText('กำลังเดินทาง');
  const row = await bookingRow();
  expect(row.status).toBe('traveling');
  expect(row.started_at).not.toBeNull();
});

test('P3-44 check-in per stop stamps the stop and disables the button', async ({ page }) => {
  await page.goto(`/j/${job.driverToken}`);
  const btn = page.getByTestId('btn-checkin-1');
  await expect(btn).toHaveText('ถึงแล้ว');
  expect(await heightOf(page, 'btn-checkin-1')).toBeGreaterThanOrEqual(44);
  await btn.click();
  await expect(btn).toHaveText(/^ถึงแล้ว \d\d:\d\d$/);
  await expect(btn).toBeDisabled();
  const { data } = await staff.from('booking_stops').select('seq,checked_in_at').eq('booking_id', job.id).order('seq');
  expect(data![0].checked_in_at).not.toBeNull();
  expect(data![1].checked_in_at).toBeNull();
});

test('P3-45 commission chips, estimates, totals and policy text', async ({ page }) => {
  await page.goto(`/j/${job.driverToken}`);
  await expect(page.getByTestId('comm-chip-1')).toHaveText('ค่าน้ำ ฿100/คน');
  await expect(page.getByTestId('comm-chip-2')).toHaveText('ค่าน้ำ 10% ของยอดซื้อ');
  await expect(page.getByTestId('comm-chip-3')).toHaveText('ไม่มีค่าน้ำ');
  await expect(page.getByTestId('comm-driver-1')).toHaveText('฿200');
  await expect(page.getByTestId('comm-driver-2')).toHaveText('ประมาณ ฿80');
  await expect(page.getByTestId('comm-total-driver')).toHaveText('฿280');
  await expect(page.getByTestId('comm-total-company')).toHaveText('฿80');
  await expect(page.getByTestId('comm-policy')).toContainText('รับค่าน้ำได้เฉพาะจุดที่อยู่ในตารางนี้');
});

test('P3-46 a sale rule without an amount is refused with a toast', async ({ page }) => {
  await page.goto(`/j/${job.driverToken}`);
  await page.getByTestId('comm-save-2').click();
  await expect(page.getByText('กรอกยอดซื้อจริงก่อน', { exact: true })).toBeVisible();
  const rows = await staff.from('commission_reports').select('seq').eq('booking_id', job.id).eq('seq', 2);
  expect(rows.data).toHaveLength(0);
});

test('P3-47 reporting the purchase amount stores the shares and updates the totals', async ({ page }) => {
  await page.goto(`/j/${job.driverToken}`);
  await page.getByTestId('comm-sale-2').fill('2000');
  await page.getByTestId('comm-save-2').click();
  await expect(page.getByText('บันทึกค่าน้ำแล้ว', { exact: true })).toBeVisible();
  await expect(page.getByTestId('comm-driver-2')).toHaveText('฿100');
  await expect(page.getByTestId('comm-total-driver')).toHaveText('฿300');
  const { data } = await staff.from('commission_reports').select('sale_amount,total,driver_share,company_share').eq('booking_id', job.id).eq('seq', 2).single();
  expect(data).toEqual({ sale_amount: 2000, total: 200, driver_share: 100, company_share: 100 });
});

test('P3-48 finish is gated by the drop-off photo; cash defaults to total minus paid', async ({ page }) => {
  await page.goto(`/j/${job.driverToken}`);
  const finish = page.getByTestId('btn-finish');
  await expect(finish).toBeDisabled();
  await expect(finish).toHaveText('แนบรูปก่อนจึงกดได้');
  await expect(page.getByTestId('cash-input')).toHaveValue('3000');
  await noHorizontalScroll(page);
});

test('P3-49 drop-off photo + cash finishes the job and opens the return offer', async ({ page }) => {
  await page.goto(`/j/${job.driverToken}`);
  await page.getByTestId('photo-input-dropoff').setInputFiles({ name: 'drop.jpg', mimeType: 'image/jpeg', buffer: await bigJpeg(page) });
  await expect(page.getByTestId('photo-dropoff')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('cash-input').fill('2500');
  const finish = page.getByTestId('btn-finish');
  await expect(finish).toBeEnabled();
  await expect(finish).toHaveText('ปิดงานและส่งรายงาน');
  await finish.click();
  await expect(page.getByTestId('driver-done')).toBeVisible({ timeout: 15_000 });
  const row = await bookingRow();
  expect(row).toMatchObject({ status: 'done', cash_collected: 2500 });
  expect(row.finished_at).not.toBeNull();
  const offer = await staff.from('return_offers').select('booking_id,discount_pct,dismissed_at,return_booking_id').eq('booking_id', job.id).maybeSingle();
  expect(offer.data).toMatchObject({ discount_pct: 10, dismissed_at: null, return_booking_id: null });
  // flat-rate commission recorded on finish
  const rep = await staff.from('commission_reports').select('seq,driver_share').eq('booking_id', job.id).eq('seq', 1).maybeSingle();
  expect(rep.data).toMatchObject({ seq: 1, driver_share: 200 });
});

test('P3-53 driver view at 360 px: no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`/j/${job.driverToken}`);
  await expect(page.getByTestId('driver-view')).toBeVisible();
  await noHorizontalScroll(page);
});

test('P3-50 done summary shows both photos, their times and the cash', async ({ page }) => {
  await page.goto(`/j/${job.driverToken}`);
  await expect(page.getByRole('heading', { name: 'ปิดงานแล้ว' })).toBeVisible();
  await expect(page.getByTestId('done-pickup-time')).toHaveText(/^รับผู้โดยสารแล้ว \d\d:\d\d$/);
  await expect(page.getByTestId('done-dropoff-time')).toHaveText(/^ส่งผู้โดยสารแล้ว \d\d:\d\d$/);
  await expect(page.getByTestId('done-cash')).toHaveText('฿2,500');
  for (const k of ['photo-pickup', 'photo-dropoff']) {
    const img = page.getByTestId(k);
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBeGreaterThan(0);
  }
  await expect(page.getByTestId('driver-action-bar')).toHaveCount(0);
  await noHorizontalScroll(page);
});
