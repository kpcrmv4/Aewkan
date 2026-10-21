import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { cleanup, driveToDone, HAS_SECRET, HAS_STAFF, lookups, makeJob, staffClient, token, type Catalogish, type Fixture } from './p3-helpers';

test.skip(!HAS_STAFF, 'NOT RUN: needs E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD');
test.describe.configure({ mode: 'serial' });

let staff: SupabaseClient;
let cat: Catalogish;
const made: Fixture[] = [];
let offer: Fixture; // done one-way, offer open
let assigned: Fixture; // no offer

test.beforeAll(async () => {
  test.setTimeout(120_000);
  staff = await staffClient();
  cat = await lookups(staff);
  offer = await makeJob(staff, cat, { label: 'api-offer' });
  assigned = await makeJob(staff, cat, { label: 'api-assigned' });
  made.push(offer, assigned);
  await driveToDone(offer);
});
test.afterAll(async () => {
  await cleanup(staff, made);
});

const url = (t: string) => `/api/jobs/${t}/return`;
const body = () => ({ toId: cat.nimman, date: '2026-10-26', time: '10:00' });

test('P3-80 unknown token is 404 link_not_found, even with a broken body', async ({ request }) => {
  const res = await request.post(url(token()), { data: { nonsense: true } });
  expect(res.status()).toBe(404);
  expect((await res.json()).error.code).toBe('link_not_found');
  const short = await request.post(url('abc'), { data: body() });
  expect(short.status()).toBe(404);
});

test('P3-81 a driver token is refused', async ({ request }) => {
  const res = await request.post(url(offer.driverToken), { data: body() });
  expect(res.status()).toBe(404);
  expect((await res.json()).error.code).toBe('offer_not_available');
});

test('P3-82 a customer token without an offer is 404', async ({ request }) => {
  const res = await request.post(url(assigned.customerToken), { data: body() });
  expect(res.status()).toBe(404);
  expect((await res.json()).error.code).toBe('offer_not_available');
});

test('P3-83 a valid offer with a malformed body is 422 validation', async ({ request }) => {
  for (const data of [{}, { toId: 'x', date: '2026-10-26', time: '10:00' }, { ...body(), date: '26/10/2026' }, { ...body(), time: '25:99' }]) {
    const res = await request.post(url(offer.customerToken), { data });
    expect(res.status()).toBe(422);
    expect((await res.json()).error.code).toBe('validation');
  }
});

test('P3-84 a valid request without SUPABASE_SECRET_KEY is 503 server_not_configured and creates nothing', async ({ request }) => {
  test.skip(HAS_SECRET, 'NOT RUN: SUPABASE_SECRET_KEY is set, so this request would create a booking (see P3-85)');
  const res = await request.post(url(offer.customerToken), { data: body() });
  expect(res.status()).toBe(503);
  expect((await res.json()).error.code).toBe('server_not_configured');
  const kids = await staff.from('bookings').select('id').eq('parent_booking_id', offer.id);
  expect(kids.data).toHaveLength(0);
});

test('P3-87 a destination that is not pickup-capable is 422 bad_destination', async ({ request }) => {
  test.skip(!HAS_SECRET, 'NOT RUN: needs SUPABASE_SECRET_KEY (unit row P3-87 covers the mapping)');
  const res = await request.post(url(offer.customerToken), { data: { ...body(), toId: cat.bosang } });
  expect(res.status()).toBe(422);
  expect((await res.json()).error.code).toBe('bad_destination');
});

test('P3-85 booking the return creates an awaiting_deposit one-way linked to the parent', async ({ request }) => {
  test.skip(!HAS_SECRET, 'NOT RUN: needs SUPABASE_SECRET_KEY');
  const res = await request.post(url(offer.customerToken), { data: body() });
  expect(res.status()).toBe(200);
  const out = await res.json();
  expect(out.status).toBe('awaiting_deposit');
  expect(out.customerPath).toMatch(/^\/j\/[A-Za-z0-9_-]{43}$/);
  const kid = await staff.from('bookings').select('id,status,parent_booking_id,return_discount_pct,mode,price_total').eq('booking_no', out.bookingNo).single();
  expect(kid.data).toMatchObject({ status: 'awaiting_deposit', parent_booking_id: offer.id, return_discount_pct: 10, mode: 'oneway', price_total: out.total });
  made.push({ id: kid.data!.id, bookingNo: out.bookingNo, customerToken: '', driverToken: '' });
  const ro = await staff.from('return_offers').select('return_booking_id').eq('booking_id', offer.id).single();
  expect(ro.data!.return_booking_id).toBe(kid.data!.id);
  // the offer is now taken
  const again = await request.post(url(offer.customerToken), { data: body() });
  expect(again.status()).toBe(404);
});
