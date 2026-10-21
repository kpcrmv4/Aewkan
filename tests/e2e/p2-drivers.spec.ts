import { existsSync } from 'node:fs';
import { expect as baseExpect, test } from '@playwright/test';
import { STAFF_STATE } from './global-setup';
import { addDaysIso, cancelBookings, createBookings, farDate, loadFixture, newRunId, staffClient, todayBkk, type Sb } from './p2-helpers';

// server-rendered pages stream after several database round trips
const expect = baseExpect.configure({ timeout: 15_000 });

test.describe('P2-04 drivers', () => {
  test.skip(!existsSync(STAFF_STATE), 'no staff credentials — NOT RUN (set E2E_STAFF_EMAIL/PASSWORD)');
  test.use({ storageState: STAFF_STATE });
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  let sb: Sb;
  const run = newRunId();
  const nick = `E2E${run}`;
  const full = `E2E P2 ${run} คนขับทดสอบ`;
  let driverId = '';
  const made: string[] = [];

  test.beforeAll(async () => {
    sb = await staffClient();
  });
  test.afterAll(async () => {
    // staff cannot delete drivers: park the row as inactive
    if (driverId) await sb.from('drivers').update({ is_active: false }).eq('id', driverId);
    await cancelBookings(sb, made);
  });

  const row = (page: import('@playwright/test').Page) => page.getByTestId('drivers-list').locator('> *').filter({ hasText: nick });

  test('P2-04-01 the list shows the sample drivers with car, plate and status', async ({ page }) => {
    await page.goto('/admin/drivers');
    await expect(page.getByRole('heading', { level: 1, name: 'คนขับและรถ' })).toBeVisible();
    const list = page.getByTestId('drivers-list');
    for (const n of ['ลุงสมบัติ', 'พี่เอก', 'น้องแม้ว', 'พี่หนุ่ม']) await expect(list).toContainText(n);
    await expect(list).toContainText('กษ 2471');
    await expect(list.getByText('ใช้งาน', { exact: true }).first()).toBeVisible();
  });

  test('P2-04-03 required fields are checked before any request', async ({ page }) => {
    let posts = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/admin/drivers')) posts++;
    });
    await page.goto('/admin/drivers');
    await page.getByRole('button', { name: 'เพิ่มคนขับ' }).click();
    const dlg = page.getByRole('dialog', { name: 'เพิ่มคนขับ' });
    await dlg.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(dlg.getByRole('alert')).toContainText('กรอกข้อมูลที่จำเป็น');
    expect(posts).toBe(0);
    expect(await dlg.getByRole('combobox', { name: 'ประเภทรถ' }).locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value).sort())).toEqual(['sedan', 'suv', 'van']);
  });

  test('P2-04-02 adding a driver stores the row and shows it', async ({ page }) => {
    await page.goto('/admin/drivers');
    await page.getByRole('button', { name: 'เพิ่มคนขับ' }).click();
    const dlg = page.getByRole('dialog', { name: 'เพิ่มคนขับ' });
    await dlg.getByLabel('ชื่อ-นามสกุล', { exact: true }).fill(full);
    await dlg.getByLabel('ชื่อเล่น', { exact: true }).fill(nick);
    await dlg.getByRole('combobox', { name: 'ประเภทรถ' }).selectOption('sedan');
    await dlg.getByLabel('รถ (ไทย)', { exact: true }).fill('โตโยต้า วีออส');
    await dlg.getByLabel('ทะเบียน', { exact: true }).fill('ทด 0001');
    await dlg.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(page.getByText('บันทึกคนขับแล้ว')).toBeVisible();
    await expect(row(page)).toBeVisible();
    const { data } = await sb.from('drivers').select('id, full_name, vehicle_key, plate, is_active').eq('nickname', nick).maybeSingle();
    expect(data).toMatchObject({ full_name: full, vehicle_key: 'sedan', plate: 'ทด 0001', is_active: true });
    driverId = data!.id;
  });

  test('P2-04-04 editing changes the stored plate', async ({ page }) => {
    await page.goto('/admin/drivers');
    await page.getByRole('button', { name: `แก้ไข ${nick}` }).click();
    const dlg = page.getByRole('dialog', { name: 'แก้ไขคนขับ' });
    await expect(dlg.getByLabel('ทะเบียน', { exact: true })).toHaveValue('ทด 0001');
    await dlg.getByLabel('ทะเบียน', { exact: true }).fill('ทด 0002');
    await dlg.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(page.getByText('บันทึกคนขับแล้ว')).toBeVisible();
    await expect.poll(async () => (await sb.from('drivers').select('plate').eq('id', driverId).maybeSingle()).data?.plate).toBe('ทด 0002');
  });

  test('P2-04-05 deactivating hides the driver from the assign screen; activating brings it back', async ({ page }) => {
    const fx = await loadFixture(sb);
    const date = farDate(run, 9);
    const [job] = await createBookings(sb, fx, [{ name: `E2E P2 ${run} drv-assign`, status: 'confirmed', travelDate: date }]);
    made.push(job.id);

    await page.goto('/admin/assign?id=' + job.id);
    await expect(page.getByRole('radio', { name: new RegExp(nick) })).toBeVisible();

    await page.goto('/admin/drivers');
    await page.getByRole('button', { name: `ปิดใช้งาน ${nick}` }).click();
    await expect(page.getByText('อัปเดตสถานะแล้ว')).toBeVisible();
    await expect.poll(async () => (await sb.from('drivers').select('is_active').eq('id', driverId).maybeSingle()).data?.is_active).toBe(false);
    await page.goto('/admin/assign?id=' + job.id);
    await expect(page.getByRole('radio').first()).toBeVisible();
    await expect(page.getByRole('radio', { name: new RegExp(nick) })).toHaveCount(0);

    await page.goto('/admin/drivers');
    await page.getByRole('button', { name: `เปิดใช้งาน ${nick}` }).click();
    await expect(page.getByText('อัปเดตสถานะแล้ว')).toBeVisible();
    await expect.poll(async () => (await sb.from('drivers').select('is_active').eq('id', driverId).maybeSingle()).data?.is_active).toBe(true);
  });

  test('P2-04-06 off days can be added, are not duplicated, and removed', async ({ page }) => {
    const day = addDaysIso(todayBkk(), 400);
    await page.goto('/admin/drivers');
    await page.getByRole('button', { name: `วันหยุด ${nick}` }).click();
    const dlg = page.getByRole('dialog', { name: `วันหยุดของ ${nick}` });
    await expect(dlg.getByText('ไม่มีวันหยุดที่กำหนดไว้')).toBeVisible();
    await dlg.getByLabel('วันที่', { exact: true }).fill(day);
    await dlg.getByLabel('เหตุผล', { exact: true }).fill('E2E ลาพักผ่อน');
    await dlg.getByRole('button', { name: 'เพิ่มวันหยุด' }).click();
    await expect(page.getByText('เพิ่มวันหยุดแล้ว')).toBeVisible();
    await expect(dlg.getByTestId('off-days')).toContainText('E2E ลาพักผ่อน');
    const { data } = await sb.from('driver_off_days').select('day, reason').eq('driver_id', driverId);
    expect(data).toEqual([{ day, reason: 'E2E ลาพักผ่อน' }]);

    await dlg.getByLabel('วันที่', { exact: true }).fill(day);
    await dlg.getByRole('button', { name: 'เพิ่มวันหยุด' }).click();
    await expect(page.getByText('มีวันหยุดวันนี้อยู่แล้ว')).toBeVisible();

    await dlg.getByRole('button', { name: /^ลบ / }).click();
    await expect(page.getByText('ลบวันหยุดแล้ว')).toBeVisible();
    await expect(dlg.getByText('ไม่มีวันหยุดที่กำหนดไว้')).toBeVisible();
    const { count } = await sb.from('driver_off_days').select('day', { count: 'exact', head: true }).eq('driver_id', driverId);
    expect(count).toBe(0);
  });

  test('P2-04-07 the API refuses a vehicle that is not in the current rules', async ({ request }) => {
    const res = await request.post('/api/admin/drivers', {
      data: { fullName: 'x', nickname: 'x', langs: [], langsEn: [], vehicleKey: 'zz-bus' },
    });
    expect(res.status()).toBe(422);
    expect((await res.json()).error.code).toBe('invalid_vehicle');
  });
});

test.describe('P2-API anonymous access', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const path of ['/api/admin/quotes/send', '/api/admin/assign', '/api/admin/bookings/status', '/api/admin/drivers']) {
    test(`P2-API-01 ${path} answers 401 JSON before validating the body`, async ({ request }) => {
      const res = await request.post(path, { data: {}, maxRedirects: 0 });
      expect(res.status()).toBe(401);
      expect(res.headers()['content-type']).toContain('application/json');
      expect((await res.json()).error.code).toBe('unauthenticated');
    });
  }
});

test.describe('P2-RESP no horizontal scroll on a small screen', () => {
  test.skip(!existsSync(STAFF_STATE), 'no staff credentials — NOT RUN (set E2E_STAFF_EMAIL/PASSWORD)');
  test.use({ storageState: STAFF_STATE });
  for (const path of ['/admin/jobs', '/admin/drivers', '/admin/quotes', '/admin/assign']) {
    test(`P2-RESP-01 ${path} fits 360px wide`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(scroll).toBeLessThanOrEqual(inner);
    });
  }
});
