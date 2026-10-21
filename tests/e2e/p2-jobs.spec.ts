import { existsSync } from 'node:fs';
import { expect as baseExpect, test, type Locator, type Page } from '@playwright/test';
import { formatTripDate } from '../../src/lib/format';
import { STAFF_STATE } from './global-setup';
import {
  addDaysIso,
  bookingRow,
  cancelBookings,
  countStatus,
  createBookings,
  farDate,
  loadFixture,
  newRunId,
  staffClient,
  todayBkk,
  type Created,
  type Fixture,
  type Sb,
} from './p2-helpers';

// server-rendered pages stream after several database round trips
const expect = baseExpect.configure({ timeout: 15_000 });

const STATUS_TH: Record<string, string> = {
  quote_requested: 'รอเสนอราคา',
  quoted: 'เสนอราคาแล้ว รอมัดจำ',
  quote_expired: 'หมดเวลามัดจำ',
  awaiting_deposit: 'รอมัดจำ',
  deposit_review: 'รอตรวจสลิป',
  confirmed: 'รอจัดคนขับ',
  assigned: 'จัดคนขับแล้ว',
  traveling: 'กำลังเดินทาง',
  done: 'เสร็จสิ้น',
  cancelled: 'ยกเลิก',
};

test.describe('P2-01 jobs list and detail', () => {
  test.skip(!existsSync(STAFF_STATE), 'no staff credentials — NOT RUN (set E2E_STAFF_EMAIL/PASSWORD)');
  test.use({ storageState: STAFF_STATE });
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  let sb: Sb;
  let fx: Fixture;
  const run = newRunId();
  const name = (s: string) => `E2E P2 ${run} ${s}`;
  const made: string[] = [];
  const b: Record<string, Created> = {};
  const date = farDate(run);
  const today = todayBkk();

  test.beforeAll(async () => {
    sb = await staffClient();
    fx = await loadFixture(sb);
    const { data: drv } = await sb.from('drivers').select('id').eq('vehicle_key', 'sedan').eq('is_active', true).limit(1);
    const items = [
      { key: 'qr', status: 'quote_requested', quote: true },
      { key: 'today', status: 'confirmed', travelDate: today },
      { key: 'cf', status: 'confirmed' },
      { key: 'as', status: 'assigned', driverId: drv?.[0]?.id },
      { key: 'qe', status: 'quote_expired', quote: true },
      { key: 'dn', status: 'done' },
      { key: 'cancel', status: 'confirmed' },
      { key: 'trav', status: 'assigned', driverId: drv?.[0]?.id },
    ];
    const created = await createBookings(
      sb,
      fx,
      items.map((i) => ({ name: name(i.key), status: i.status, travelDate: i.travelDate ?? date, quote: i.quote, driverId: i.driverId })),
    );
    items.forEach((i, k) => {
      b[i.key] = created[k];
      made.push(created[k].id);
    });
    const many = await createBookings(
      sb,
      fx,
      Array.from({ length: 21 }, (_, k) => ({ name: `E2E P2 ${run} pg ${String(k).padStart(2, '0')}`, status: 'done', travelDate: addDaysIso(date, 1) })),
    );
    made.push(...many.map((m) => m.id));
  });

  test.afterAll(async () => {
    await cancelBookings(sb, made);
  });

  const kpi = (page: Page) => page.getByTestId('jobs-kpi');
  const kpiValue = async (page: Page, label: string) => {
    const cell = kpi(page).locator(':scope > div > *').filter({ has: page.getByText(label, { exact: true }) });
    const text = (await cell.first().innerText()).replace(label, '');
    return Number(text.match(/\d[\d,]*/)?.[0].replace(/,/g, ''));
  };
  const rowOf = (page: Page, key: string): Locator => page.getByTestId('jobs-list').locator('> *').filter({ hasText: name(key) });

  test('P2-01-01 page shows the title and the KPI strip', async ({ page }) => {
    await page.goto('/admin/jobs');
    await expect(page.getByRole('heading', { level: 1, name: 'งานเข้า' })).toBeVisible();
    for (const l of ['รอเสนอราคา', 'รอจัดคนขับ', 'งานวันนี้', 'ยอดจองเดือนนี้']) {
      await expect(kpi(page).getByText(l, { exact: true })).toBeVisible();
    }
  });

  test('P2-01-02 KPI รอเสนอราคา equals the quote_requested count', async ({ page }) => {
    await page.goto('/admin/jobs');
    expect(await kpiValue(page, 'รอเสนอราคา')).toBe(await countStatus(sb, 'quote_requested'));
    expect(await countStatus(sb, 'quote_requested')).toBeGreaterThanOrEqual(1);
  });

  test('P2-01-03 KPI รอจัดคนขับ equals the confirmed count', async ({ page }) => {
    await page.goto('/admin/jobs');
    expect(await kpiValue(page, 'รอจัดคนขับ')).toBe(await countStatus(sb, 'confirmed'));
  });

  test('P2-01-04 KPI งานวันนี้ counts today (Bangkok) without cancelled', async ({ page }) => {
    const { count } = await sb.from('bookings').select('id', { count: 'exact', head: true }).eq('travel_date', today).neq('status', 'cancelled');
    await page.goto('/admin/jobs');
    expect(await kpiValue(page, 'งานวันนี้')).toBe(count);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('P2-01-05 every status has a filter chip with a count and filters the list', async ({ page }) => {
    await page.goto('/admin/jobs');
    const bar = page.getByTestId('jobs-filters');
    await expect(bar.getByRole('link', { name: /^ทั้งหมด\s*\d+$/ })).toBeVisible();
    for (const label of Object.values(STATUS_TH)) {
      await expect(bar.getByRole('link', { name: new RegExp(`^${label}\\s*\\d+$`) })).toBeVisible();
    }
    await bar.getByRole('link', { name: /^รอเสนอราคา\s*\d+$/ }).click();
    await expect(page).toHaveURL(/status=quote_requested/);
    await expect(rowOf(page, 'qr')).toBeVisible();
    await expect(rowOf(page, 'cf')).toHaveCount(0);
  });

  test('P2-01-06 search by customer name and booking number keeps the status filter', async ({ page }) => {
    await page.goto('/admin/jobs');
    await page.getByRole('searchbox', { name: 'ค้นหาเลขจองหรือชื่อลูกค้า' }).fill(name('qr'));
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
    await expect(page).toHaveURL(/q=/);
    await expect(rowOf(page, 'qr')).toBeVisible();
    await expect(rowOf(page, 'cf')).toHaveCount(0);

    await page.goto('/admin/jobs');
    await page.getByRole('searchbox', { name: 'ค้นหาเลขจองหรือชื่อลูกค้า' }).fill(b.cf.booking_no);
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
    await expect(rowOf(page, 'cf')).toBeVisible();

    await page.goto('/admin/jobs?status=confirmed');
    await page.getByRole('searchbox', { name: 'ค้นหาเลขจองหรือชื่อลูกค้า' }).fill(run);
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
    await expect(page).toHaveURL(/status=confirmed/);
    await expect(page).toHaveURL(new RegExp(`q=${run}`));
    await expect(rowOf(page, 'cf')).toBeVisible();
    await expect(rowOf(page, 'qr')).toHaveCount(0);
  });

  test('P2-01-07 a row carries number, stops, customer, date, vehicle, mode, total and status', async ({ page }) => {
    await page.goto(`/admin/jobs?q=${encodeURIComponent(name('cf'))}`);
    const row = rowOf(page, 'cf');
    await expect(row).toContainText(b.cf.booking_no);
    await expect(row).toContainText('2 คน');
    await expect(row).toContainText(formatTripDate(date, 'th', { shortYear: true }));
    await expect(row).toContainText('09:00');
    await expect(row).toContainText('เหมาทริป');
    await expect(row).toContainText('฿3,000');
    await expect(row).toContainText('รอจัดคนขับ');
    await expect(row.getByRole('link').first()).toContainText(' → ');
  });

  test('P2-01-08 the row action follows the status', async ({ page }) => {
    const href = async (key: string, label: string) => {
      await page.goto(`/admin/jobs?q=${encodeURIComponent(name(key))}`);
      return rowOf(page, key).getByRole('link', { name: label, exact: true }).getAttribute('href');
    };
    expect(await href('qr', 'เสนอราคา')).toBe(`/admin/quotes?id=${b.qr.id}`);
    expect(await href('qe', 'เสนอราคาใหม่')).toBe(`/admin/quotes?id=${b.qe.id}`);
    expect(await href('cf', 'จัดคนขับ')).toBe(`/admin/assign?id=${b.cf.id}`);
    expect(await href('as', 'เปลี่ยนคนขับ')).toBe(`/admin/assign?id=${b.as.id}`);
    expect(await href('dn', 'ดูรายละเอียด')).toBe(`/admin/jobs/${b.dn.id}`);
  });

  test('P2-01-09 no match shows the empty state with a way back', async ({ page }) => {
    await page.goto('/admin/jobs?q=zzz-no-such-e2e-row');
    await expect(page.getByText('ไม่มีงานที่ตรงกับตัวกรอง')).toBeVisible();
    await page.getByRole('link', { name: 'ล้างตัวกรอง' }).click();
    await expect(page).toHaveURL(/\/admin\/jobs$/);
  });

  test('P2-01-10 the list pages at 20 rows with next and previous links', async ({ page }) => {
    const q = encodeURIComponent(`E2E P2 ${run} pg`);
    await page.goto(`/admin/jobs?q=${q}`);
    await expect(page.getByTestId('jobs-list').locator('> *')).toHaveCount(20);
    await expect(page.getByRole('link', { name: 'ก่อนหน้า' })).toHaveCount(0);
    await page.getByRole('link', { name: 'ถัดไป' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId('jobs-list').locator('> *')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'ก่อนหน้า' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'ถัดไป' })).toHaveCount(0);
  });

  test('P2-01-20 detail shows customer, stops with times, price, payments and history', async ({ page }) => {
    await page.goto(`/admin/jobs/${b.cf.id}`);
    await expect(page.getByRole('heading', { level: 1, name: `งาน ${b.cf.booking_no}` })).toBeVisible();
    await expect(page.getByText(name('cf'))).toBeVisible();
    const stops = page.getByTestId('stops').locator('li');
    await expect(stops).toHaveCount(3);
    await expect(stops.nth(0)).toContainText('09:00');
    await expect(stops.nth(1)).toContainText('09:30');
    await expect(stops.nth(2)).toContainText('11:00');
    await expect(page.getByText('ยังไม่มีรายการชำระเงิน')).toBeVisible();
    await expect(page.getByTestId('events')).toContainText('สร้างงาน');
    await expect(page.getByText('฿3,000').first()).toBeVisible();
  });

  test('P2-01-21 an unknown or malformed id is a 404', async ({ page }) => {
    const bad = await page.goto('/admin/jobs/not-a-uuid');
    expect(bad?.status()).toBe(404);
    const missing = await page.goto('/admin/jobs/00000000-0000-4000-8000-000000000000');
    expect(missing?.status()).toBe(404);
  });

  test('P2-01-23 changing status asks for confirmation and writes the new status', async ({ page }) => {
    await page.goto(`/admin/jobs/${b.trav.id}`);
    await expect(page.getByRole('button', { name: 'เปลี่ยนเป็น กำลังเดินทาง' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ยกเลิกงาน' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'เปลี่ยนเป็น เสร็จสิ้น' })).toHaveCount(0);
    await page.getByRole('button', { name: 'เปลี่ยนเป็น กำลังเดินทาง' }).click();
    const dlg = page.getByRole('dialog', { name: 'ยืนยันการเปลี่ยนสถานะ' });
    await expect(dlg).toContainText('จัดคนขับแล้ว');
    await expect(dlg).toContainText('กำลังเดินทาง');
    await dlg.getByRole('button', { name: 'ยืนยัน', exact: true }).click();
    await expect(page.getByText('เปลี่ยนสถานะแล้ว')).toBeVisible();
    await expect.poll(async () => (await bookingRow(sb, b.trav.id)).status).toBe('traveling');
    expect((await bookingRow(sb, b.trav.id)).started_at).not.toBeNull();
    await expect(page.getByRole('button', { name: 'เปลี่ยนเป็น เสร็จสิ้น' })).toBeVisible();
  });

  test('P2-01-25 cancelling is final: no further actions, history lists the move', async ({ page }) => {
    await page.goto(`/admin/jobs/${b.cancel.id}`);
    await page.getByRole('button', { name: 'ยกเลิกงาน' }).click();
    await page.getByRole('dialog', { name: 'ยืนยันการเปลี่ยนสถานะ' }).getByRole('button', { name: 'ยืนยัน', exact: true }).click();
    await expect(page.getByText('ไม่มีการเปลี่ยนสถานะที่ทำได้ในขั้นนี้').first()).toBeVisible();
    expect((await bookingRow(sb, b.cancel.id)).status).toBe('cancelled');
    await expect(page.getByTestId('events')).toContainText('รอจัดคนขับ → ยกเลิก');
  });

  test('P2-01-22 history has a status event after the change', async () => {
    const { data } = await sb.from('booking_events').select('kind, data').eq('booking_id', b.cancel.id).order('id');
    expect(data?.map((e) => e.kind)).toEqual(['created', 'status']);
    expect(data?.[1].data).toMatchObject({ from: 'confirmed', to: 'cancelled' });
  });

  test('P2-01-24 a status outside the allowed table is refused and nothing changes', async ({ request }) => {
    const res = await request.post('/api/admin/bookings/status', { data: { bookingId: b.qe.id, status: 'done' } });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe('transition_not_allowed');
    expect((await bookingRow(sb, b.qe.id)).status).toBe('quote_expired');
    const skip = await request.post('/api/admin/bookings/status', { data: { bookingId: b.cf.id, status: 'assigned' } });
    expect(skip.status()).toBe(409);
    expect((await bookingRow(sb, b.cf.id)).status).toBe('confirmed');
  });
});

test.describe('P2-01 permissions (anonymous)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const path of ['/admin/jobs', '/admin/jobs/00000000-0000-4000-8000-000000000000', '/admin/quotes', '/admin/assign', '/admin/drivers']) {
    test(`P2-01-12 ${path} sends an anonymous visitor to login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/login/);
    });
  }
});
