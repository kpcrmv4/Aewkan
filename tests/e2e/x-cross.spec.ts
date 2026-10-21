import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { STAFF_STATE } from './global-setup';
import { bookingRow, cancelBookings, createBookings, farDate, loadFixture, newRunId, staffClient, type Fixture, type Sb } from './p2-helpers';

/**
 * Cross-worker rows (orchestrator only, WORKERS.md): a job moves from the
 * admin screens (P2) into the job links (P3) with the same data.
 * X-01 / X-03 create bookings through the public API and need SUPABASE_SECRET_KEY.
 */
const HAS_KEY = Boolean(process.env.SUPABASE_SECRET_KEY);

test.describe('cross-phase', () => {
  test.skip(!existsSync(STAFF_STATE), 'no staff credentials — NOT RUN');
  test.use({ storageState: STAFF_STATE });
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  let sb: Sb;
  let fx: Fixture;
  const made: string[] = [];
  const run = newRunId();

  test.beforeAll(async () => {
    sb = await staffClient();
    fx = await loadFixture(sb);
  });
  test.afterAll(async () => {
    await cancelBookings(sb, made);
  });

  test('X-02 assigning in admin gives a driver link that opens the driver view and a customer link that names the driver', async ({ page, request, browser }) => {
    const job = (await createBookings(sb, fx, [{ name: `E2E X ${run} assign`, status: 'confirmed', travelDate: farDate(run, 7), lang: 'en' }]))[0];
    made.push(job.id);
    const { data: driver, error } = await sb.from('drivers').select('id, nickname, name_en').eq('vehicle_key', 'sedan').eq('is_active', true).order('nickname').limit(1).maybeSingle();
    expect(error).toBeNull();
    expect(driver).not.toBeNull();

    const res = await request.post('/api/admin/assign', { data: { bookingId: job.id, driverId: driver!.id, channel: 'copy' } });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { customerPath: string; driverPath: string; message: string };
    expect(body.message).toContain(job.booking_no);

    const row = await bookingRow(sb, job.id);
    expect(row.status).toBe('assigned');
    expect(row.assigned_at).not.toBeNull(); // stamped by the database trigger

    // links are public: open them without the staff session
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const p = await anon.newPage();
    await p.goto(body.driverPath);
    await expect(p.getByTestId('booking-no')).toHaveText(job.booking_no);
    await expect(p.getByRole('navigation', { name: /^(เมนู|Menu)$/ })).toHaveCount(0); // driver view hides the customer menu
    await p.goto(body.customerPath);
    await expect(p.getByTestId('booking-no')).toHaveText(job.booking_no);
    await expect(p.locator('main')).toContainText(driver!.name_en || driver!.nickname);
    await anon.close();
    await page.close();
  });

  test('X-04 a quote sent from admin gets its deadline from the database clock', async ({ request }) => {
    const q = (await createBookings(sb, fx, [{ name: `E2E X ${run} quote`, status: 'quote_requested', travelDate: farDate(run, 9), quote: true }]))[0];
    made.push(q.id);
    const res = await request.post('/api/admin/quotes/send', { data: { bookingId: q.id, price: 5200, deposit: 1500, hours: 6, message: '' } });
    expect(res.status()).toBe(200);
    const row = await bookingRow(sb, q.id);
    expect(row.status).toBe('quoted');
    const gap = new Date(row.quote_deadline!).getTime() - new Date(row.quote_sent_at!).getTime();
    expect(gap).toBe(6 * 3_600_000);
  });

  test('X-05 a status change keeps its reason in the history', async ({ request }) => {
    const j = (await createBookings(sb, fx, [{ name: `E2E X ${run} reason`, status: 'assigned', travelDate: farDate(run, 11) }]))[0];
    made.push(j.id);
    const res = await request.post('/api/admin/bookings/status', { data: { bookingId: j.id, status: 'cancelled', reason: 'ลูกค้ายกเลิกทาง LINE' } });
    expect(res.status()).toBe(200);
    const { data: ev, error } = await sb.from('booking_events').select('data').eq('booking_id', j.id).eq('kind', 'status').order('at', { ascending: false }).limit(1).maybeSingle();
    expect(error).toBeNull();
    expect(ev?.data).toMatchObject({ from: 'assigned', to: 'cancelled', reason: 'ลูกค้ายกเลิกทาง LINE' });
  });

  test('X-01 a public booking appears in the admin jobs list with the same total', async () => {
    test.skip(!HAS_KEY, 'NOT RUN: needs SUPABASE_SECRET_KEY');
  });

  test('X-03 a return booking from the job link appears in admin as a linked job', async () => {
    test.skip(!HAS_KEY, 'NOT RUN: needs SUPABASE_SECRET_KEY');
  });
});
