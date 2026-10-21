import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { cleanup, HAS_STAFF, lookups, makeJob, newClient, staffClient, token, TINY_JPEG, type Catalogish, type Fixture } from './p3-helpers';

test.skip(!HAS_STAFF, 'NOT RUN: needs E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD');
test.describe.configure({ mode: 'serial' });
test.use({ locale: 'th-TH' });

let staff: SupabaseClient;
let cat: Catalogish;
let assigned: Fixture; // no photos
let traveling: Fixture; // started, no drop-off photo
let revoked: Fixture;
const made: Fixture[] = [];

test.beforeAll(async () => {
  staff = await staffClient();
  cat = await lookups(staff);
  assigned = await makeJob(staff, cat, { label: 'refuse-assigned' });
  traveling = await makeJob(staff, cat, { label: 'refuse-traveling' });
  revoked = await makeJob(staff, cat, { label: 'refuse-revoked' });
  made.push(assigned, traveling, revoked);
  // put `traveling` on the road through the real RPCs
  const anon = newClient();
  const path = `${traveling.id}/pickup/${randomUUID()}.jpg`;
  expect((await anon.storage.from('job-photos').upload(path, TINY_JPEG, { contentType: 'image/jpeg' })).error).toBeNull();
  expect((await anon.rpc('job_record_photo', { p_token: traveling.driverToken, p_kind: 'pickup', p_path: path })).error).toBeNull();
  expect((await anon.rpc('job_start', { p_token: traveling.driverToken })).error).toBeNull();
  await staff.from('job_links').update({ revoked_at: new Date().toISOString() }).eq('booking_id', revoked.id).eq('audience', 'customer');
});

test.afterAll(async () => {
  await cleanup(staff, made);
});

const status = async (id: string) => (await staff.from('bookings').select('status').eq('id', id).single()).data?.status;

test.describe('unknown, malformed and revoked links', () => {
  test('P3-01 unknown well-formed token is the 404 page', async ({ page }) => {
    const res = await page.goto(`/j/${token()}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'ไม่พบลิงก์นี้', exact: true })).toBeVisible();
    await expect(page.getByText('ทีมงานกำลังจัดคนขับให้')).toHaveCount(0);
  });

  test('P3-02 malformed token is the same 404 page', async ({ page }) => {
    const res = await page.goto('/j/abc');
    expect(res?.status()).toBe(404);
    await expect(page.getByTestId('job-not-found')).toBeVisible();
  });

  test('P3-03 revoked customer link is a 404', async ({ page }) => {
    const res = await page.goto(`/j/${revoked.customerToken}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByTestId('job-not-found')).toBeVisible();
  });

  test('P3-04 the job page is noindex', async ({ page }) => {
    await page.goto(`/j/${assigned.customerToken}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});

test.describe('database refusals through the anon key', () => {
  test('P3-60 a customer token cannot start a job', async () => {
    const { error } = await newClient().rpc('job_start', { p_token: assigned.customerToken });
    expect(error?.message).toBe('driver_only');
    expect(await status(assigned.id)).toBe('assigned');
  });

  test('P3-62 a driver token cannot dismiss a return offer', async () => {
    const { error } = await newClient().rpc('job_return_dismiss', { p_token: assigned.driverToken });
    expect(error?.message).toBe('link_not_found');
  });

  test('P3-63 job_start without a pickup photo is refused', async () => {
    const { error } = await newClient().rpc('job_start', { p_token: assigned.driverToken });
    expect(error?.message).toBe('pickup_photo_required');
    expect(await status(assigned.id)).toBe('assigned');
  });

  test('P3-64 job_finish without a drop-off photo is refused', async () => {
    const { error } = await newClient().rpc('job_finish', { p_token: traveling.driverToken, p_cash: 100 });
    expect(error?.message).toBe('dropoff_photo_required');
    expect(await status(traveling.id)).toBe('traveling');
  });

  test('P3-65 job_finish on an assigned booking is refused even with a drop-off photo', async () => {
    const anon = newClient();
    const path = `${assigned.id}/dropoff/${randomUUID()}.jpg`;
    expect((await anon.storage.from('job-photos').upload(path, TINY_JPEG, { contentType: 'image/jpeg' })).error).toBeNull();
    expect((await anon.rpc('job_record_photo', { p_token: assigned.driverToken, p_kind: 'dropoff', p_path: path })).error).toBeNull();
    const { error } = await anon.rpc('job_finish', { p_token: assigned.driverToken, p_cash: 100 });
    expect(error?.message).toBe('not_traveling');
    expect(await status(assigned.id)).toBe('assigned');
  });

  test('P3-66 job_checkin while assigned is refused', async () => {
    const { error } = await newClient().rpc('job_checkin', { p_token: assigned.driverToken, p_seq: 1 });
    expect(error?.message).toBe('not_traveling');
  });

  test('P3-67 a sale rule needs the purchase amount', async () => {
    const { error } = await newClient().rpc('job_commission', { p_token: traveling.driverToken, p_seq: 2, p_sale: null });
    expect(error?.message).toBe('sale_required');
    const rows = await staff.from('commission_reports').select('seq').eq('booking_id', traveling.id).eq('seq', 2);
    expect(rows.data).toHaveLength(0);
  });

  test('P3-68 job_start twice: the second call is not_assigned', async () => {
    const { error } = await newClient().rpc('job_start', { p_token: traveling.driverToken });
    expect(error?.message).toBe('not_assigned');
  });

  test('P3-69 an unknown token cannot call any action', async () => {
    const anon = newClient();
    for (const [fn, args] of [
      ['job_start', {}],
      ['job_checkin', { p_seq: 1 }],
      ['job_finish', { p_cash: 1 }],
      ['job_commission', { p_seq: 1, p_sale: 1 }],
      ['job_return_dismiss', {}],
    ] as const) {
      const { error } = await anon.rpc(fn, { p_token: token(), ...args });
      expect(error?.message, fn).toBe('link_not_found');
    }
  });
});

test.describe('customer page has no driver controls', () => {
  test('P3-61 a customer token renders no start, finish, check-in or file input', async ({ page }) => {
    await page.goto(`/j/${assigned.customerToken}`);
    await expect(page.getByTestId('customer-view')).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.getByTestId('btn-start')).toHaveCount(0);
    await expect(page.getByTestId('btn-finish')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'ถึงแล้ว', exact: true })).toHaveCount(0);
    await expect(page.getByText('ค่าน้ำ', { exact: false })).toHaveCount(0);
  });
});
