import { existsSync } from 'node:fs';
import { expect as baseExpect, test } from '@playwright/test';
import { STAFF_STATE } from './global-setup';
import { bookingRow, cancelBookings, createBookings, farDate, loadFixture, newRunId, staffClient, type Created, type Fixture, type Sb } from './p2-helpers';

// server-rendered pages stream after several database round trips
const expect = baseExpect.configure({ timeout: 15_000 });

const QUOTE_DATE = '2026-12-28';

test.describe('P2-02 quotes', () => {
  test.skip(!existsSync(STAFF_STATE), 'no staff credentials — NOT RUN (set E2E_STAFF_EMAIL/PASSWORD)');
  test.use({ storageState: STAFF_STATE });
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  let sb: Sb;
  let fx: Fixture;
  const run = newRunId();
  const made: string[] = [];
  let qr: Created;
  let cf: Created;

  test.beforeAll(async () => {
    sb = await staffClient();
    fx = await loadFixture(sb);
    [qr, cf] = await createBookings(sb, fx, [
      { name: `E2E P2 ${run} quote`, status: 'quote_requested', travelDate: QUOTE_DATE, quote: true },
      { name: `E2E P2 ${run} notquote`, status: 'confirmed', travelDate: QUOTE_DATE },
    ]);
    made.push(qr.id, cf.id);
  });
  test.afterAll(async () => cancelBookings(sb, made));

  test('P2-02-01 the list shows only quote statuses', async ({ page }) => {
    await page.goto(`/admin/quotes?id=${qr.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'เสนอราคา' })).toBeVisible();
    const list = page.getByTestId('quote-list');
    await expect(list).toContainText(qr.booking_no);
    await expect(list).not.toContainText(cf.booking_no);
  });

  test('P2-02-03 the detail shows the reference prices and the suggestion', async ({ page }) => {
    await page.goto(`/admin/quotes?id=${qr.id}`);
    await expect(page.getByText('คำขอราคา', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`E2E P2 ${run} quote`).first()).toBeVisible();
    await expect(page.getByText(/^ราคาอ้างอิงจากกฎ \d+/)).toBeVisible();
    const ref = page.getByTestId('quote-reference');
    for (const m of ['เหมาชั่วโมง', 'เหมาวัน', 'เหมาทริป', 'ขาเดียว']) await expect(ref.getByText(m, { exact: true })).toBeVisible();
    await expect(page.getByTestId('quote-suggested')).toHaveText(/^฿[\d,]+$/);
  });

  test('P2-02-04 the form starts from the suggestion with the default message', async ({ page }) => {
    await page.goto(`/admin/quotes?id=${qr.id}`);
    const suggested = Number((await page.getByTestId('quote-suggested').innerText()).replace(/[^\d]/g, ''));
    expect(suggested).toBeGreaterThan(0);
    await expect(page.getByLabel('ราคาเสนอ (บาท)', { exact: true })).toHaveValue(String(suggested));
    const dep = Number(await page.getByLabel('มัดจำ (บาท)', { exact: true }).inputValue());
    expect(dep).toBeGreaterThan(0);
    expect(dep).toBeLessThanOrEqual(suggested);
    const hours = page.getByRole('combobox', { name: 'โอนมัดจำภายใน' });
    await expect(hours).toHaveValue('2');
    expect(await hours.locator('option').allInnerTexts()).toEqual(['1 ชั่วโมง', '2 ชั่วโมง', '3 ชั่วโมง', '6 ชั่วโมง', '12 ชั่วโมง', '24 ชั่วโมง']);
    const msg = await page.getByRole('textbox', { name: 'ข้อความถึงลูกค้า' }).inputValue();
    expect(msg).toContain('ราคาทริป');
    expect(msg).toContain('โอนมัดจำ');
    expect(msg).toContain('ส่วนที่เหลือจ่ายคนขับหน้างานค่ะ');
  });

  test('P2-02-05 and 08 the preview follows the form and a deposit above the price is blocked', async ({ page }) => {
    await page.goto(`/admin/quotes?id=${qr.id}`);
    await page.getByLabel('ราคาเสนอ (บาท)', { exact: true }).fill('12345');
    await page.getByLabel('มัดจำ (บาท)', { exact: true }).fill('3700');
    await expect(page.getByTestId('quote-preview')).toContainText('฿12,345');
    await expect(page.getByTestId('quote-preview')).toContainText('฿3,700');
    await page.getByLabel('มัดจำ (บาท)', { exact: true }).fill('20000');
    await expect(page.getByRole('alert').filter({ hasText: 'มัดจำต้องไม่เกินราคาเสนอ' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ส่งแจ้งเตือนเสนอราคา' })).toBeDisabled();
  });

  test('P2-02-06 sending records the quote and moves the job to quoted', async ({ page }) => {
    await page.goto(`/admin/quotes?id=${qr.id}`);
    await page.getByLabel('ราคาเสนอ (บาท)', { exact: true }).fill('4200');
    await page.getByLabel('มัดจำ (บาท)', { exact: true }).fill('1260');
    await page.getByRole('combobox', { name: 'โอนมัดจำภายใน' }).selectOption('12');
    await page.getByRole('textbox', { name: 'ข้อความถึงลูกค้า' }).fill('ราคา E2E ทดสอบ');
    await page.getByRole('button', { name: 'ส่งแจ้งเตือนเสนอราคา' }).click();
    await expect(page.getByText('บันทึกราคา ฿4,200 แล้ว')).toBeVisible();
    const row = await bookingRow(sb, qr.id);
    expect(row.status).toBe('quoted');
    expect(row.quote_price).toBe(4200);
    expect(row.quote_deposit).toBe(1260);
    expect(row.quote_hours).toBe(12);
    expect(row.quote_message).toBe('ราคา E2E ทดสอบ');
    expect(new Date(row.quote_deadline!).getTime() - new Date(row.quote_sent_at!).getTime()).toBe(12 * 3_600_000);
  });

  test('P2-02-07 a quoted job can be re-quoted and the deadline restarts', async ({ page }) => {
    const before = await bookingRow(sb, qr.id);
    await page.goto(`/admin/quotes?id=${qr.id}`);
    await expect(page.getByLabel('ราคาเสนอ (บาท)', { exact: true })).toHaveValue('4200');
    await expect(page.getByRole('textbox', { name: 'ข้อความถึงลูกค้า' })).toHaveValue('ราคา E2E ทดสอบ');
    await page.getByRole('combobox', { name: 'โอนมัดจำภายใน' }).selectOption('1');
    await page.getByRole('button', { name: 'ส่งราคาใหม่และรีเซ็ตเวลามัดจำ' }).click();
    await expect(page.getByText('บันทึกราคา ฿4,200 แล้ว')).toBeVisible();
    const after = await bookingRow(sb, qr.id);
    expect(new Date(after.quote_sent_at!).getTime()).toBeGreaterThan(new Date(before.quote_sent_at!).getTime());
    expect(new Date(after.quote_deadline!).getTime() - new Date(after.quote_sent_at!).getTime()).toBe(3_600_000);
    expect(after.status).toBe('quoted');
  });

  test('P2-02-09 the API refuses a job that is not in a quote status and a deposit above the price', async ({ request }) => {
    const bad = await request.post('/api/admin/quotes/send', { data: { bookingId: cf.id, price: 3000, deposit: 900, hours: 2, message: '' } });
    expect(bad.status()).toBe(409);
    expect((await bad.json()).error.code).toBe('not_quotable');
    expect((await bookingRow(sb, cf.id)).status).toBe('confirmed');
    const over = await request.post('/api/admin/quotes/send', { data: { bookingId: qr.id, price: 1000, deposit: 2000, hours: 2, message: '' } });
    expect(over.status()).toBe(422);
    expect((await over.json()).error.code).toBe('deposit_over_price');
    const invalid = await request.post('/api/admin/quotes/send', { data: { bookingId: 'x', price: 0 } });
    expect(invalid.status()).toBe(422);
    expect((await invalid.json()).error.code).toBe('validation');
  });
});

test.describe('P2-03 assign', () => {
  test.skip(!existsSync(STAFF_STATE), 'no staff credentials — NOT RUN (set E2E_STAFF_EMAIL/PASSWORD)');
  test.use({ storageState: STAFF_STATE });
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  let sb: Sb;
  let fx: Fixture;
  const run = newRunId();
  const date = farDate(run, 5);
  const made: string[] = [];
  const offDriver = { id: '', nickname: '' };
  const busyDriver = { id: '', nickname: '' };
  let vanDriverId = '';
  let h: Created;
  let he: Created;
  let busyJob: Created;
  let dn: Created;

  test.beforeAll(async () => {
    sb = await staffClient();
    fx = await loadFixture(sb);
    const { data: drivers } = await sb.from('drivers').select('id, nickname, vehicle_key').eq('is_active', true).order('nickname');
    const sedans = (drivers ?? []).filter((d) => d.vehicle_key === 'sedan');
    const van = (drivers ?? []).find((d) => d.vehicle_key === 'van');
    if (sedans.length < 2 || !van) throw new Error('need two sedan drivers and one van driver');
    Object.assign(offDriver, { id: sedans[0].id, nickname: sedans[0].nickname });
    Object.assign(busyDriver, { id: sedans[1].id, nickname: sedans[1].nickname });
    vanDriverId = van.id;
    [h, he, busyJob, dn] = await createBookings(sb, fx, [
      { name: `E2E P2 ${run} assign-th`, status: 'confirmed', travelDate: date, time: '08:30' },
      { name: `E2E P2 ${run} assign-en`, status: 'confirmed', travelDate: date, lang: 'en', time: '10:00' },
      { name: `E2E P2 ${run} busy-job`, status: 'assigned', travelDate: date, driverId: busyDriver.id, time: '13:00' },
      { name: `E2E P2 ${run} done-job`, status: 'done', travelDate: date },
    ]);
    made.push(h.id, he.id, busyJob.id, dn.id);
    const { error } = await sb.from('driver_off_days').insert({ driver_id: offDriver.id, day: date, reason: 'E2E P2' });
    if (error) throw new Error(error.message);
  });
  test.afterAll(async () => {
    await sb.from('driver_off_days').delete().eq('driver_id', offDriver.id).eq('day', date);
    await cancelBookings(sb, made);
  });

  const driverRadio = (page: import('@playwright/test').Page, nick: string) => page.getByRole('radio', { name: new RegExp(nick) });

  test('P2-03-01 only confirmed and assigned jobs are listed', async ({ page }) => {
    await page.goto(`/admin/assign?id=${h.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'จัดคนขับ' })).toBeVisible();
    const list = page.getByTestId('assign-list');
    await expect(list).toContainText(h.booking_no);
    await expect(list).toContainText(busyJob.booking_no);
    await expect(list).not.toContainText(dn.booking_no);
  });

  test('P2-03-02 and 03 drivers: same vehicle only, off day disabled, busy day flagged', async ({ page }) => {
    await page.goto(`/admin/assign?id=${h.id}`);
    const group = page.getByRole('radiogroup');
    await expect(group.getByRole('radio')).toHaveCount((await sb.from('drivers').select('id', { count: 'exact', head: true }).eq('vehicle_key', 'sedan').eq('is_active', true)).count!);
    const off = driverRadio(page, offDriver.nickname);
    await expect(off).toBeDisabled();
    await expect(off).toContainText('ลาหยุด');
    const busy = driverRadio(page, busyDriver.nickname);
    await expect(busy).toBeEnabled();
    await expect(busy).toContainText('มีงานวันนี้แล้ว');
    await expect(group).not.toContainText('พี่เอก');
  });

  test('P2-03-04 the preview follows the customer language and the chosen driver', async ({ page }) => {
    await page.goto(`/admin/assign?id=${h.id}`);
    const msg = page.getByTestId('assign-message');
    await expect(msg).toContainText('แอ่วกัน ยืนยันการจอง');
    await expect(msg).toContainText(h.booking_no);
    await expect(msg).toContainText('ยังไม่ได้เลือกคนขับ');
    await driverRadio(page, busyDriver.nickname).click();
    await expect(msg).toContainText(busyDriver.nickname);
    await page.goto(`/admin/assign?id=${he.id}`);
    await expect(page.getByTestId('assign-message')).toContainText('is confirmed');
    await expect(page.getByTestId('assign-message')).toContainText('(select a driver)');
  });

  test('P2-03-05 the channel selector changes the confirm label and needs a driver', async ({ page }) => {
    await page.goto(`/admin/assign?id=${h.id}`);
    const confirm = page.getByRole('button', { name: /^ยืนยันคนขับ/ });
    await expect(confirm).toBeDisabled();
    await expect(confirm).toHaveText('ยืนยันคนขับและส่งลิงก์ทาง LINE');
    const channels = page.getByRole('group', { name: 'ช่องทางส่งข้อความ' });
    await channels.getByRole('button', { name: 'WhatsApp', exact: true }).click();
    await expect(confirm).toHaveText('ยืนยันคนขับและส่งลิงก์ทาง WhatsApp');
    await channels.getByRole('button', { name: 'อีเมล', exact: true }).click();
    await expect(confirm).toHaveText('ยืนยันคนขับและส่งลิงก์ทาง อีเมล');
    await channels.getByRole('button', { name: 'คัดลอก', exact: true }).click();
    await expect(confirm).toHaveText('ยืนยันคนขับและสร้างลิงก์');
  });

  test('P2-03-06 and 07 confirming assigns the driver and issues two new links', async ({ page }) => {
    await page.goto(`/admin/assign?id=${h.id}`);
    await driverRadio(page, busyDriver.nickname).click();
    await page.getByRole('button', { name: 'ยืนยันคนขับและส่งลิงก์ทาง LINE' }).click();
    const links = page.getByTestId('issued-links');
    await expect(links).toBeVisible();
    const values = await links.locator('input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    expect(values).toHaveLength(2);
    for (const v of values) expect(v).toMatch(/\/j\/[A-Za-z0-9_-]{43}$/);
    expect(values[0]).not.toBe(values[1]);

    const row = await bookingRow(sb, h.id);
    expect(row.status).toBe('assigned');
    expect(row.driver_id).toBe(busyDriver.id);
    expect(row.assigned_at).not.toBeNull();
    expect(row.assigned_by).not.toBeNull();
    const { data: live } = await sb.from('job_links').select('audience').eq('booking_id', h.id).is('revoked_at', null);
    expect((live ?? []).map((l) => l.audience).sort()).toEqual(['customer', 'driver']);
  });

  test('P2-03-08 re-assigning keeps the customer link and issues a new driver link', async ({ page }) => {
    const { data: before } = await sb.from('job_links').select('token_hash, audience').eq('booking_id', h.id).is('revoked_at', null);
    const oldCustomer = (before ?? []).find((l) => l.audience === 'customer')!.token_hash;
    const oldDriver = (before ?? []).find((l) => l.audience === 'driver')!.token_hash;
    await page.goto(`/admin/assign?id=${h.id}`);
    const confirm = page.getByRole('button', { name: 'เปลี่ยนคนขับและส่งลิงก์ใหม่ทาง LINE' });
    await driverRadio(page, busyDriver.nickname).click();
    await confirm.click();
    const links = page.getByTestId('issued-links');
    await expect(links).toBeVisible();
    await expect(links.locator('input')).toHaveCount(1); // driver link only
    await expect(links).toContainText('ลูกค้าใช้ลิงก์เดิม');
    const { data: live } = await sb.from('job_links').select('token_hash, audience').eq('booking_id', h.id).is('revoked_at', null);
    expect(live).toHaveLength(2);
    expect(live!.find((l) => l.audience === 'customer')!.token_hash).toBe(oldCustomer);
    expect(live!.find((l) => l.audience === 'driver')!.token_hash).not.toBe(oldDriver);
    const { count } = await sb.from('job_links').select('id', { count: 'exact', head: true }).eq('booking_id', h.id);
    expect(count).toBe(3);
  });

  test('P2-03-08b ticking "new customer link" replaces the customer link too', async ({ page }) => {
    const { data: before } = await sb.from('job_links').select('token_hash').eq('booking_id', h.id).is('revoked_at', null);
    await page.goto(`/admin/assign?id=${h.id}`);
    await driverRadio(page, busyDriver.nickname).click();
    await page.getByRole('checkbox', { name: /ออกลิงก์ลูกค้าใหม่/ }).check();
    await page.getByRole('button', { name: 'เปลี่ยนคนขับและส่งลิงก์ใหม่ทาง LINE' }).click();
    const links = page.getByTestId('issued-links');
    await expect(links.locator('input')).toHaveCount(2);
    const { data: live } = await sb.from('job_links').select('token_hash').eq('booking_id', h.id).is('revoked_at', null);
    const old = new Set((before ?? []).map((l) => l.token_hash));
    for (const l of live ?? []) expect(old.has(l.token_hash)).toBe(false);
  });

  test('P2-03-09 copy uses the clipboard and falls back to selecting the text', async ({ page }) => {
    await page.goto(`/admin/assign?id=${he.id}`);
    await driverRadio(page, busyDriver.nickname).click();
    await page.getByRole('button', { name: 'ยืนยันคนขับและส่งลิงก์ทาง LINE' }).click();
    const links = page.getByTestId('issued-links');
    await expect(links).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __copied: string | null }).__copied = null;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => ((window as unknown as { __copied: string }).__copied = t) } });
    });
    await links.getByRole('button', { name: 'คัดลอก' }).first().click();
    await expect(page.getByText('คัดลอกลิงก์แล้ว')).toBeVisible();
    const shown = await links.locator('input').first().inputValue();
    expect(await page.evaluate(() => (window as unknown as { __copied: string }).__copied)).toBe(shown);

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
    });
    await links.getByRole('button', { name: 'คัดลอก' }).nth(1).click();
    await expect(page.getByText('คัดลอกอัตโนมัติไม่ได้ เลือกข้อความไว้ให้แล้ว กดคัดลอกเอง')).toBeVisible();
    await expect(links.locator('input').nth(1)).toBeFocused();
  });

  test('P2-03-10 the API refuses a wrong vehicle, an off day and a job in another status', async ({ request }) => {
    const fresh = (await createBookings(sb, fx, [{ name: `E2E P2 ${run} refuse`, status: 'confirmed', travelDate: date }]))[0];
    made.push(fresh.id);
    const post = (bookingId: string, driverId: string) => request.post('/api/admin/assign', { data: { bookingId, driverId, channel: 'copy' } });

    const van = await post(fresh.id, vanDriverId);
    expect(van.status()).toBe(409);
    expect((await van.json()).error.code).toBe('vehicle_mismatch');

    const off = await post(fresh.id, offDriver.id);
    expect(off.status()).toBe(409);
    expect((await off.json()).error.code).toBe('driver_off');

    const done = await post(dn.id, busyDriver.id);
    expect(done.status()).toBe(409);
    expect((await done.json()).error.code).toBe('not_assignable');

    const row = await bookingRow(sb, fresh.id);
    expect(row.status).toBe('confirmed');
    expect(row.driver_id).toBeNull();
  });
});
