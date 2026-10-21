import { expect, test } from '@playwright/test';
import { cleanupP4, HAS_SECRET, HAS_STAFF, lookups, makeP4Job, slipByRpc, staffClient, token, type P4Job, type Sb } from './p4-helpers';

/**
 * P4 route guards and the "no service role" answers. Token / signature / cron secret are
 * checked first; anything that must read Vault then answers 503 server_not_configured.
 * When SUPABASE_SECRET_KEY is set these 503 rows do not apply (they are skipped, not passed).
 */
test.describe.configure({ mode: 'serial', timeout: 60_000 });

let staff: Sb | undefined;
const made: P4Job[] = [];
let J: P4Job;

test.beforeAll(async () => {
  if (!HAS_STAFF) return;
  staff = await staffClient();
  J = await makeP4Job(staff, await lookups(staff), { label: 'routes', status: 'awaiting_deposit' });
  made.push(J);
  const r = await slipByRpc(J);
  if (r.error) throw new Error(r.error);
});
test.afterAll(async () => {
  await cleanupP4(staff, made);
});

for (const m of ['verify', 'stripe', 'beam'] as const) {
  test(`P4-14/P4-33 /pay/${m}: unknown or malformed token → 404 first`, async ({ request }) => {
    for (const t of [token(), 'abc']) {
      const r = await request.post(`/api/jobs/${t}/pay/${m}`, { data: {} });
      expect(r.status()).toBe(404);
      expect((await r.json()).error.code).toBe('link_not_found');
    }
  });

  test(`P4-14/P4-33 /pay/${m}: real customer token without the service role → 503`, async ({ request }) => {
    test.skip(!HAS_STAFF, 'NOT RUN: needs E2E staff credentials to create the booking');
    test.skip(HAS_SECRET, 'service role configured: covered by the provider rows instead');
    const r = await request.post(`/api/jobs/${J.customerToken}/pay/${m}`, { data: {} });
    expect(r.status()).toBe(503);
    expect((await r.json()).error.code).toBe('server_not_configured');
  });
}

test('P4-33 a driver token cannot start a payment (404)', async ({ request }) => {
  test.skip(!HAS_STAFF, 'NOT RUN: needs E2E staff credentials');
  const r = await request.post(`/api/jobs/${J.driverToken}/pay/stripe`, { data: {} });
  expect(r.status()).toBe(404);
});

for (const p of ['stripe', 'beam', 'line'] as const) {
  test(`P4-34 webhook ${p} without the service role → 503 (the provider retries)`, async ({ request }) => {
    test.skip(HAS_SECRET, 'service role configured: signature rows apply instead');
    const r = await request.post(`/api/webhooks/${p}`, { data: '{"id":"evt_x"}', headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=00' } });
    expect(r.status()).toBe(503);
    expect((await r.json()).error.code).toBe('server_not_configured');
  });
}

test('cron: no / wrong bearer → 401; right bearer without the service role → 503', async ({ request }) => {
  expect((await request.get('/api/cron/notify')).status()).toBe(401);
  expect((await request.get('/api/cron/notify', { headers: { authorization: 'Bearer wrong' } })).status()).toBe(401);
  test.skip(!process.env.CRON_SECRET || HAS_SECRET, 'needs CRON_SECRET and no service role');
  const r = await request.get('/api/cron/notify', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(r.status()).toBe(503);
});

test('admin integration routes: 401 without a session', async ({ request }) => {
  for (const path of ['/api/admin/integrations', '/api/admin/integrations/test', '/api/admin/integrations/push', '/api/admin/payments/confirm']) {
    const r = await request.post(path, { data: {} });
    expect(r.status(), path).toBe(401);
  }
});

test('public/sw.js is served, has push + notificationclick and no fetch handler', async ({ request }) => {
  const r = await request.get('/sw.js');
  expect(r.status()).toBe(200);
  const src = await r.text();
  expect(src).toContain("addEventListener('push'");
  expect(src).toContain("addEventListener('notificationclick'");
  expect(src).not.toContain("addEventListener('fetch'");
});
