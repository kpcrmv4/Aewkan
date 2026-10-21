import { expect, test } from '@playwright/test';
import { baht } from '../../src/lib/format';
import { depositFor, type Catalog, type PublicCatalogJson } from '../../src/lib/pricing';
import { firstScreen, hasKey, loadCatalog, NEEDS_KEY, NORMAL_DATE, openBuilder, QUOTE_DATE } from './p1-helpers';

let json: PublicCatalogJson;
let catalog: Catalog;
test.beforeAll(async () => {
  ({ json, catalog } = await loadCatalog());
});

function body(over: Record<string, unknown> = {}, tripOver: Record<string, unknown> = {}, date = NORMAL_DATE) {
  const f = firstScreen(catalog, json, date);
  return {
    trip: {
      pickupId: f.input.pickupId,
      stops: f.input.stops.map((s) => ({ placeId: s.placeId, dwell: s.dwell })),
      date,
      time: f.input.time,
      pax: f.input.pax,
      vehicle: f.input.vehicle,
      roundTrip: f.input.roundTrip,
      langDriver: false,
      festival: false,
      ...tripOver,
    },
    mode: f.mode,
    customer: { name: 'E2E ทดสอบ', contact: '@e2e-test', channel: 'line', lang: 'th', hotel: '', note: 'playwright', pushOptIn: false },
    ruleVersion: catalog.ruleVersion,
    expectedTotal: f.res.modes[f.mode!].total,
    ...over,
  };
}

const post = (request: import('@playwright/test').APIRequestContext, data: unknown) => request.post('/api/bookings', { data });

test('P1-API-01 an invalid body is a 422 before anything else', async ({ request }) => {
  const r = await post(request, { trip: {} });
  expect(r.status()).toBe(422);
  expect((await r.json()).error.code).toBe('validation');
});

test('P1-API-02 without the secret key a valid body is a 503', async ({ request }) => {
  test.skip(hasKey, 'NOT RUN: only meaningful without SUPABASE_SECRET_KEY');
  const r = await post(request, body());
  expect(r.status()).toBe(503);
  expect((await r.json()).error.code).toBe('server_not_configured');
});

test('P1-API-03 a stale rule version is a 409 rule_changed', async ({ request }) => {
  test.skip(!hasKey, NEEDS_KEY);
  const r = await post(request, body({ ruleVersion: catalog.ruleVersion + 999 }));
  expect(r.status()).toBe(409);
  expect((await r.json()).error.code).toBe('rule_changed');
});

test('P1-API-04 a different expected total is a 409 price_changed', async ({ request }) => {
  test.skip(!hasKey, NEEDS_KEY);
  const r = await post(request, body({ expectedTotal: 10 }));
  expect(r.status()).toBe(409);
  expect((await r.json()).error.code).toBe('price_changed');
});

test('P1-API-05 mode must be valid for the trip', async ({ request }) => {
  test.skip(!hasKey, NEEDS_KEY);
  const none = await post(request, body({ mode: null, expectedTotal: null }));
  expect(none.status()).toBe(422);
  expect((await none.json()).error.code).toBe('mode_required');
  const f = firstScreen(catalog, json);
  test.skip(!f.input.roundTrip, 'NOT RUN: first template is one-way');
  const bad = await post(request, body({ mode: 'oneway', expectedTotal: null }));
  expect(bad.status()).toBe(422);
  expect((await bad.json()).error.code).toBe('mode_unavailable');
});

test('P1-API-06 seats and vehicle are checked', async ({ request }) => {
  test.skip(!hasKey, NEEDS_KEY);
  const seats = Math.max(...Object.values(catalog.rules.vehicles).map((v) => v.seats));
  const many = await post(request, body({ expectedTotal: null }, { pax: Math.min(15, seats + 1) }));
  test.skip(seats >= 15, 'NOT RUN: a vehicle seats 15');
  expect(many.status()).toBe(422);
  expect((await many.json()).error.code).toBe('too_many_pax');
  const veh = await post(request, body({ expectedTotal: null }, { vehicle: 'zz' }));
  expect(veh.status()).toBe(422);
  expect((await veh.json()).error.code).toBe('unknown_vehicle');
});

async function fillContact(page: import('@playwright/test').Page) {
  await page.getByTestId('book-start').click();
  await page.getByLabel('ชื่อผู้จอง').fill('E2E ทดสอบ');
  await page.getByLabel('LINE / WhatsApp / โทรศัพท์').fill('@e2e-test');
}

test('P1-BOOK-03 booking shows number, deposit and the job link', async ({ page }) => {
  test.skip(!hasKey, NEEDS_KEY);
  await openBuilder(page);
  const { res, mode } = firstScreen(catalog, json);
  await fillContact(page);
  await page.getByTestId('book-submit').click();
  const ok = page.getByTestId('book-success');
  await expect(ok).toBeVisible();
  await expect(page.getByTestId('booking-no')).toHaveText(/^\d{9,}$/);
  await expect(page.getByTestId('booking-deposit')).toHaveText(baht(depositFor(catalog, res.modes[mode!].total)));
  await expect(ok).toContainText('ช่องทางชำระมัดจำจะส่งให้ในลิงก์รายละเอียดงาน');
  await expect(page.getByTestId('open-job-link')).toHaveAttribute('href', /^\/j\/[A-Za-z0-9_-]{40,60}$/);
});

test('P1-BOOK-04 quote request has no deposit', async ({ page }) => {
  test.skip(!hasKey, NEEDS_KEY);
  test.skip(!catalog.rules.quote.enabled, 'NOT RUN: quote mode disabled');
  await openBuilder(page, QUOTE_DATE);
  await fillContact(page);
  await page.getByTestId('book-submit').click();
  await expect(page.getByRole('heading', { name: 'ส่งคำขอราคาแล้ว' })).toBeVisible();
  await expect(page.getByTestId('booking-deposit')).toHaveCount(0);
});
