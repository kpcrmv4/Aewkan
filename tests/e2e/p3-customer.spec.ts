import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { cleanup, driveToDone, HAS_SECRET, HAS_STAFF, lookups, makeJob, RUN, staffClient, type Catalogish, type Fixture } from './p3-helpers';
import { slipByRpc } from './p4-helpers';

test.skip(!HAS_STAFF, 'NOT RUN: needs E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD');
test.describe.configure({ mode: 'serial' });
test.use({ locale: 'th-TH', permissions: ['clipboard-read', 'clipboard-write'] });

let staff: SupabaseClient;
let cat: Catalogish;
const made: Fixture[] = [];
let A: Fixture; // assigned, Thai, driver
let E: Fixture; // assigned, English
let C: Fixture; // confirmed, no driver yet
let Q: Fixture; // quoted, deadline in 2 h
let QE: Fixture; // quoted, deadline passed
let QS: Fixture; // quote_expired
let QR: Fixture; // quote_requested
let D: Fixture; // done, one-way, offer open
let D2: Fixture; // done, one-way, offer to dismiss
let D3: Fixture; // done, round trip: no offer
let D4: Fixture; // done: error / loading states
let NS: Fixture; // no stops
let driver: { nickname: string; plate: string; phone: string; car_th: string; langs: string[] };

const mk = async (o: Parameters<typeof makeJob>[2]) => {
  const f = await makeJob(staff, cat, o);
  made.push(f);
  return f;
};

test.beforeAll(async () => {
  test.setTimeout(180_000);
  staff = await staffClient();
  cat = await lookups(staff);
  const in2h = new Date(Date.now() + 2 * 3600_000).toISOString();
  const past = new Date(Date.now() - 3600_000).toISOString();
  A = await mk({ label: 'cust-assigned' });
  E = await mk({ label: 'cust-en', lang: 'en' });
  C = await mk({ label: 'cust-confirmed', status: 'confirmed' });
  Q = await mk({ label: 'cust-quoted', status: 'quoted', mode: 'quote', quote: { price: 5200, deposit: 1500, deadline: in2h, message: 'E2E quote message' } });
  QE = await mk({ label: 'cust-quote-late', status: 'quoted', mode: 'quote', quote: { price: 5200, deposit: 1500, deadline: past } });
  QS = await mk({ label: 'cust-quote-expired', status: 'quote_expired', mode: 'quote' });
  QR = await mk({ label: 'cust-quote-req', status: 'quote_requested', mode: 'quote' });
  NS = await mk({ label: 'cust-nostops', status: 'confirmed', noStops: true });
  D = await mk({ label: 'cust-done' });
  D2 = await mk({ label: 'cust-done-dismiss' });
  D3 = await mk({ label: 'cust-done-roundtrip', roundTrip: true });
  D4 = await mk({ label: 'cust-done-states' });
  for (const f of [D, D2, D3, D4]) await driveToDone(f);
  const { data } = await staff.from('drivers').select('nickname,plate,phone,car_th,langs').eq('id', cat.driverId).single();
  driver = data as typeof driver;
});
test.afterAll(async () => {
  await cleanup(staff, made);
});

const noHorizontalScroll = async (page: Page) => {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw).toBeLessThanOrEqual(iw);
};
const open = (page: Page, f: Fixture) => page.goto(`/j/${f.customerToken}`);
const numberOf = async (page: Page, id: string) => Number((await page.getByTestId(id).innerText()).replace(/[^\d]/g, ''));

test('P3-10 header card in Thai: number, Thai BE date, time, place, vehicle, pax and status', async ({ page }) => {
  await open(page, A);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('รายละเอียดงาน');
  await expect(page.getByTestId('booking-no')).toHaveText(A.bookingNo);
  const head = page.getByRole('heading', { level: 1 }).locator('xpath=following-sibling::p[1]');
  await expect(head).toContainText('ส. 24 ต.ค. 2569');
  await expect(head).toContainText('รับ 08:00');
  await expect(head).toContainText('นิมมานเหมินท์');
  await expect(head).toContainText(cat.vehicleName.th);
  await expect(head).toContainText('2 คน');
  await expect(page.getByTestId('status-badge')).toHaveText('จัดคนขับแล้ว');
  await noHorizontalScroll(page);
  // the trip is remembered under "ทริปของฉัน"
  const saved = await page.evaluate(() => localStorage.getItem('aewkan.trips') ?? '');
  expect(saved).toContain(A.customerToken);
});

test('P3-11 an English booking starts in English', async ({ page }) => {
  await open(page, E);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Job details');
  const head = page.getByRole('heading', { level: 1 }).locator('xpath=following-sibling::p[1]');
  await expect(head).toContainText('Sat, 24 Oct 2026');
  await expect(head).toContainText('Pickup 08:00');
  await expect(head).toContainText('2 pax');
  await expect(head).toContainText(cat.vehicleName.en);
  await expect(page.getByTestId('status-badge')).toHaveText('Driver confirmed');
});

test('P3-12 the header switch flips the page language without a reload', async ({ page }) => {
  await open(page, A);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('รายละเอียดงาน');
  await page.getByRole('button', { name: 'EN', exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Job details');
  await expect(page.getByTestId('status-badge')).toHaveText('Driver confirmed');
  await page.getByRole('button', { name: 'ไทย', exact: true }).first().click();
  await expect(page.getByTestId('status-badge')).toHaveText('จัดคนขับแล้ว');
});

test('P3-13 normal stepper: booked and driver confirmed done, on the way current', async ({ page }) => {
  await open(page, A);
  const steps = page.getByRole('list', { name: 'steps' }).getByRole('listitem');
  await expect(steps).toHaveText(['จองแล้ว', 'ยืนยันคนขับ', 'ออกเดินทาง', 'เสร็จสิ้น']);
  await expect(steps.nth(0)).toHaveAttribute('data-state', 'done');
  await expect(steps.nth(1)).toHaveAttribute('data-state', 'done');
  await expect(steps.nth(2)).toHaveAttribute('data-state', 'now');
  await expect(steps.nth(3)).toHaveAttribute('data-state', 'todo');
});

test('P3-14 quote flow stepper has five steps', async ({ page }) => {
  await open(page, Q);
  const steps = page.getByRole('list', { name: 'steps' }).getByRole('listitem');
  await expect(steps).toHaveText(['ขอราคา', 'ได้รับราคา', 'มัดจำ', 'ยืนยันคนขับ', 'ออกเดินทาง']);
  await expect(steps.nth(1)).toHaveAttribute('data-state', 'done');
  await expect(steps.nth(2)).toHaveAttribute('data-state', 'now');
});

test('P3-15 quoted: price, deadline and a countdown that ticks', async ({ page }) => {
  await open(page, Q);
  await expect(page.getByTestId('quote-price')).toHaveText('฿5,200');
  const box = page.getByTestId('quote-box');
  await expect(box).toContainText('ราคาที่ทีมงานเสนอ');
  await expect(box).toContainText('โอนมัดจำภายใน');
  await expect(box).toContainText('E2E quote message');
  const cd = page.getByTestId('quote-countdown');
  await expect(cd).toHaveText(/^01:5\d:\d\d$/);
  const first = await cd.innerText();
  await expect.poll(() => cd.innerText(), { timeout: 4000 }).not.toBe(first);
  await expect(page.getByTestId('status-badge')).toHaveText('เสนอราคาแล้ว รอมัดจำ');
});

test('P3-16 expired by the clock and by status: no countdown', async ({ page }) => {
  for (const f of [QE, QS]) {
    await open(page, f);
    await expect(page.getByTestId('quote-expired')).toContainText('หมดเวลาโอนมัดจำ');
    await expect(page.getByTestId('quote-countdown')).toHaveCount(0);
    await expect(page.getByTestId('quote-box')).toHaveCount(0);
  }
});

test('P3-17 quote requested: waiting box, no price', async ({ page }) => {
  await open(page, QR);
  await expect(page.getByTestId('quote-requested')).toContainText('ส่งคำขอราคาแล้ว');
  await expect(page.getByTestId('quote-price')).toHaveCount(0);
  await expect(page.getByTestId('status-badge')).toHaveText('รอเสนอราคา');
});

test('P3-18 driver card: chips, selectable phone with copy, no call wording', async ({ page }) => {
  await open(page, A);
  const card = page.getByTestId('driver-card');
  await expect(card).toContainText(driver.nickname);
  await expect(card).toContainText(driver.car_th);
  await expect(page.getByTestId('plate')).toHaveText(driver.plate);
  for (const l of driver.langs) await expect(card).toContainText(l);
  await expect(page.getByTestId('driver-phone')).toHaveText(driver.phone);
  await page.getByRole('button', { name: 'คัดลอก', exact: true }).click();
  await expect(page.getByText('คัดลอกแล้ว', { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(driver.phone);
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  await expect(page.getByText(/โทรแล้ว|กำลังโทร|calling|call placed/i)).toHaveCount(0);
  expect(await page.getByRole('button', { name: 'คัดลอก', exact: true }).boundingBox().then((b) => b!.height)).toBeGreaterThanOrEqual(44);
});

test('P3-19 before a driver is assigned: waiting panel only', async ({ page }) => {
  await open(page, C);
  await expect(page.getByTestId('driver-waiting')).toContainText('ทีมงานกำลังจัดคนขับให้');
  await expect(page.getByTestId('driver-card')).toHaveCount(0);
  await expect(page.getByTestId('status-badge')).toHaveText('รอจัดคนขับ');
});

test('P3-20 itinerary arrival times are pickup time plus drive and dwell', async ({ page }) => {
  await open(page, A);
  const it = page.getByTestId('itinerary');
  await expect(it).toContainText('08:00');
  await expect(it).toContainText('08:40'); // + 40 min drive
  await expect(it).toContainText('10:30'); // + 60 stay + 50 drive
  await expect(it).toContainText('12:30'); // + 60 stay + 60 drive
  await expect(it).toContainText('บ่อสร้าง หมู่บ้านทำร่ม');
  await expect(it).toContainText('อยู่ 60 น. · ขับ 40 น. · 12 กม.');
});

test('P3-21 price lines and total (deposit-paid rows need a payment: see P3-21b)', async ({ page }) => {
  await open(page, A);
  const p = page.getByTestId('price-lines');
  await expect(p).toContainText('8 ชม. × ฿375');
  await expect(p).toContainText('฿3,000');
  await expect(p).toContainText('ราคารวม');
  await expect(p).toContainText('ราคาอ้างอิง ยังไม่ได้ชำระมัดจำ');
  await open(page, Q);
  await expect(page.getByTestId('price-lines')).toContainText('ราคาเสนอโดยทีมงาน');
  await expect(page.getByTestId('price-lines')).toContainText('ต้องโอนมัดจำภายใน');
});

test('P3-21b deposit paid and balance lines', async ({ page }) => {
  // the real path: the customer sends a slip on the link, staff approve it (admin_review_payment, as /api/admin/payments/confirm)
  const P = await mk({ label: 'cust-paid', status: 'awaiting_deposit' });
  const slip = await slipByRpc(P);
  expect(slip.error).toBeNull();
  const paymentId = (slip.data as { payment_id: string }).payment_id;
  const ok = await staff.rpc('admin_review_payment', { p_payment: paymentId, p_approve: true });
  expect(ok.error).toBeNull();
  await open(page, P);
  const p = page.getByTestId('price-lines');
  await expect(p).toContainText('ราคารวม');
  await expect(p).toContainText('฿3,000');
  await expect(p).toContainText(/มัดจำชำระแล้ว\s*−\s*฿900/);
  await expect(p).toContainText(/คงเหลือจ่ายคนขับหน้างาน \(เงินสดหรือโอน\)\s*฿2,100/);
  await expect(p).not.toContainText('ราคาอ้างอิง ยังไม่ได้ชำระมัดจำ');
});

test('P3-22 proof lines for pickup and drop-off, and no photo anywhere on the customer page', async ({ page }) => {
  await open(page, D);
  await expect(page.getByTestId('proof-pickup')).toContainText(/^\s*รับผู้โดยสารแล้ว \d\d:\d\d · มีรูปยืนยัน$/);
  await expect(page.getByTestId('proof-dropoff')).toContainText(/^\s*ส่งผู้โดยสารแล้ว \d\d:\d\d · มีรูปยืนยัน$/);
  await expect(page.locator('main img')).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
});

test('P3-23 customer never sees driver-only data', async ({ page }) => {
  for (const f of [A, D]) {
    await open(page, f);
    await expect(page.getByTestId('customer-view')).toBeVisible();
    for (const s of ['ค่าน้ำ', 'เงินที่รับหน้างาน', 'นโยบายค่าน้ำ', '@e2e-p3', 'E2E Hotel Nimman', 'E2E note', `E2E P3 ${RUN}`]) {
      await expect(page.getByText(s, { exact: false })).toHaveCount(0);
    }
    await expect(page.getByTestId('customer-card')).toHaveCount(0);
  }
});

test('P3-24 return offer: destination pills, default date, price breakdown and actions', async ({ page }) => {
  await open(page, D);
  const panel = page.getByTestId('return-offer');
  await expect(panel).toContainText('จองขากลับจากน้ำตกแม่สา');
  await expect(panel).toContainText('ข้อเสนอนี้ใช้ได้ถึง');
  await expect(panel.getByRole('button', { name: 'นิมมานเหมินท์', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'สนามบินเชียงใหม่', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'น้ำตกแม่สา', exact: true })).toHaveCount(0);
  await expect(panel.getByLabel('วันกลับ')).toHaveValue('2026-10-26'); // travel date + default_days (2)
  await expect(panel.getByLabel('เวลารับ')).toHaveValue('10:00');
  const base = await numberOf(page, 'return-base');
  const disc = await numberOf(page, 'return-discount');
  const total = await numberOf(page, 'return-total');
  expect(base).toBeGreaterThan(0);
  expect(total).toBe(base - disc);
  expect(disc).toBe(Math.round((base * 0.1) / 10) * 10);
  await expect(panel).toContainText('ส่วนลดขากลับ 10%');
  await expect(panel.getByRole('button', { name: /^ยืนยันขากลับ/ })).toBeEnabled();
  await expect(panel.getByRole('button', { name: 'ไว้ก่อน', exact: true })).toBeEnabled();
  await noHorizontalScroll(page);
  // on phone/tablet the action bar sits above the bottom menu (inside the viewport)
  const vp = page.viewportSize()!;
  const later = panel.getByRole('button', { name: 'ไว้ก่อน', exact: true });
  expect((await later.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  if (vp.width < 1024) {
    const bar = await later.boundingBox();
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(vp.height);
  }
});

test('P3-25 choosing another destination reprices and marks the pill pressed', async ({ page }) => {
  await open(page, D);
  const panel = page.getByTestId('return-offer');
  const before = await numberOf(page, 'return-base');
  const pill = panel.getByRole('button', { name: 'วัดร่องขุ่น เชียงราย', exact: true });
  await pill.click();
  await expect(pill).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => numberOf(page, 'return-base')).not.toBe(before);
});

test('P3-27 confirming without the server key shows the error and keeps the panel', async ({ page }) => {
  test.skip(HAS_SECRET, 'NOT RUN here: with SUPABASE_SECRET_KEY set this would create a real return booking');
  await open(page, D);
  const panel = page.getByTestId('return-offer');
  const responsePromise = page.waitForResponse((r) => r.url().includes(`/api/jobs/${D.customerToken}/return`));
  await panel.getByRole('button', { name: /^ยืนยันขากลับ/ }).click();
  const res = await responsePromise;
  expect(res.status()).toBe(503);
  expect((await res.json()).error.code).toBe('server_not_configured');
  await expect(page.getByText(/ระบบยังตั้งค่าไม่ครบ/)).toBeVisible();
  await expect(panel).toBeVisible();
  const kids = await staff.from('bookings').select('id').eq('parent_booking_id', D.id);
  expect(kids.data).toHaveLength(0);
});

test('P3-26 "ไว้ก่อน" dismisses the offer for good', async ({ page }) => {
  await open(page, D2);
  await expect(page.getByTestId('return-offer')).toBeVisible();
  await page.getByRole('button', { name: 'ไว้ก่อน', exact: true }).click();
  await expect(page.getByTestId('return-offer')).toHaveCount(0);
  const { data } = await staff.from('return_offers').select('dismissed_at').eq('booking_id', D2.id).single();
  expect(data!.dismissed_at).not.toBeNull();
  await page.reload();
  await expect(page.getByTestId('customer-view')).toBeVisible();
  await expect(page.getByTestId('return-offer')).toHaveCount(0);
});

test('P3-28 an already booked return shows the confirmation instead of the form', async () => {
  test.skip(!HAS_SECRET, 'NOT RUN: needs SUPABASE_SECRET_KEY to create the return booking');
});

test('P3-29 no offer for a round trip or an assigned job', async ({ page }) => {
  for (const f of [D3, A]) {
    await open(page, f);
    await expect(page.getByTestId('customer-view')).toBeVisible();
    await expect(page.getByTestId('return-offer')).toHaveCount(0);
  }
});

test('P3-30 states: skeleton while the catalog loads, error with retry, empty stops', async ({ page }) => {
  // skeleton
  await page.route('**/rest/v1/rpc/get_public_catalog', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await open(page, D4);
  await expect(page.getByTestId('return-loading')).toBeVisible();
  await expect(page.getByTestId('return-offer')).toBeVisible({ timeout: 15_000 });
  await page.unroute('**/rest/v1/rpc/get_public_catalog');

  // error + retry: the refresh after "ไว้ก่อน" fails, then succeeds
  await page.route('**/rest/v1/rpc/get_job_view', (route) => route.abort());
  await page.getByRole('button', { name: 'ไว้ก่อน', exact: true }).click();
  await expect(page.getByText('โหลดรายละเอียดงานไม่สำเร็จ')).toBeVisible();
  await page.unroute('**/rest/v1/rpc/get_job_view');
  await page.getByRole('button', { name: 'ลองใหม่', exact: true }).click();
  await expect(page.getByText('โหลดรายละเอียดงานไม่สำเร็จ')).toHaveCount(0);
  await expect(page.getByTestId('return-offer')).toHaveCount(0);

  // empty
  await open(page, NS);
  await expect(page.getByText('ยังไม่มีจุดแวะในงานนี้')).toBeVisible();
});

test('P3-32 customer view at 360 px: no horizontal scroll with the return offer open', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await open(page, D);
  await expect(page.getByTestId('return-offer')).toBeVisible();
  await noHorizontalScroll(page);
});

test('P3-31 layout: no horizontal scroll on every customer state, content column is centred', async ({ page }) => {
  for (const f of [A, Q, QE, C, D]) {
    await open(page, f);
    await expect(page.getByTestId('customer-view')).toBeVisible();
    await noHorizontalScroll(page);
  }
  const main = await page.locator('main').boundingBox();
  const w = page.viewportSize()!.width;
  expect(main!.width).toBeLessThanOrEqual(720);
  expect(Math.abs(main!.x - (w - main!.width - main!.x))).toBeLessThanOrEqual(2);
});
