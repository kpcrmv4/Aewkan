import { existsSync } from 'node:fs';
import { expect as baseExpect, test } from '@playwright/test';
import { STAFF_STATE } from './global-setup';
import { newRunId, staffClient, type Sb } from './p2-helpers';

// server-rendered pages stream after several database round trips
const expect = baseExpect.configure({ timeout: 15_000 });

async function currentRules(sb: Sb) {
  const { data, error } = await sb.from('pricing_rule_sets').select('version, rules, note, is_current, created_by').eq('is_current', true).maybeSingle();
  if (error || !data) throw new Error(`current rules read failed: ${error?.message}`);
  return data;
}

test.describe('P2B-01 pricing rules', () => {
  test.skip(!existsSync(STAFF_STATE), 'no staff credentials — NOT RUN (set E2E_STAFF_EMAIL/PASSWORD)');
  test.use({ storageState: STAFF_STATE });
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  let sb: Sb;
  const run = newRunId();

  test.beforeAll(async () => {
    sb = await staffClient();
  });

  test('P2B-01-01 the page shows the version, the tabs and the values of the current rules', async ({ page }) => {
    const cur = await currentRules(sb);
    await page.goto('/admin/pricing');
    await expect(page.getByRole('heading', { level: 1, name: 'กฎราคา' })).toBeVisible();
    await expect(page.getByTestId('rules-version')).toContainText(`v${cur.version}`);
    const nav = page.getByRole('navigation', { name: 'หมวดของกฎราคา' });
    for (const t of ['กฎราคา', 'ค่าน้ำ', 'ประวัติเวอร์ชัน']) await expect(nav.getByRole('link', { name: t })).toBeVisible();
    const rules = cur.rules as { vehicles: Record<string, { hourly: number }>; deposit_pct: number; quote: { reason_th: string }; zones: Array<{ surcharge: number }> };
    await expect(page.getByTestId('veh-sedan-hourly')).toHaveValue(String(rules.vehicles.sedan.hourly));
    await expect(page.getByTestId('rule-deposit_pct')).toHaveValue(String(rules.deposit_pct));
    await expect(page.getByTestId('zone-2-surcharge')).toHaveValue(String(rules.zones[1].surcharge));
    await expect(page.getByTestId('quote-reason-th')).toHaveValue(rules.quote.reason_th);
    for (const id of ['rules-zones', 'rules-vehicles', 'rules-modes', 'rules-extras', 'rules-quote', 'rules-return', 'rules-commission']) await expect(page.getByTestId(id)).toBeVisible();
  });

  test('P2B-01-02 sample trips: equal before editing, the draft moves when a rate changes (no API call)', async ({ page }) => {
    let posts = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST') posts++;
    });
    await page.goto('/admin/pricing');
    const samples = page.locator('[data-testid^="sample-"][data-testid$="s"], [data-testid="sample-temples"], [data-testid="sample-mountain"], [data-testid="sample-province"]');
    await expect(samples.first()).toBeVisible();
    expect(await samples.count()).toBeGreaterThanOrEqual(2);
    const deltas = page.locator('[data-testid$="-delta"]');
    for (const t of await deltas.allTextContents()) expect(t).toBe('±฿0');

    const hourly = page.getByTestId('veh-sedan-hourly');
    const daily = page.getByTestId('veh-sedan-daily');
    const perKm = page.getByTestId('veh-sedan-per_km');
    await hourly.fill(String(Number(await hourly.inputValue()) + 150));
    await daily.fill(String(Number(await daily.inputValue()) + 700));
    await perKm.fill(String(Number(await perKm.inputValue()) + 5));
    await expect.poll(async () => (await deltas.allTextContents()).some((t) => t !== '±฿0' && t !== '—')).toBe(true);
    const texts = await deltas.allTextContents();
    expect(texts.some((t) => t.startsWith('+฿'))).toBe(true);
    expect(posts).toBe(0);
  });

  test('P2B-01-03 publish needs a change; reset clears the draft', async ({ page }) => {
    await page.goto('/admin/pricing');
    const publish = page.getByTestId('rules-publish');
    const reset = page.getByTestId('rules-reset');
    await expect(page.getByTestId('rules-bar-status')).toContainText('ตรงกับกฎที่ใช้อยู่');
    await expect(publish).toBeDisabled();
    await expect(reset).toBeDisabled();
    const before = await page.getByTestId('rule-mountain_fee').inputValue();
    await page.getByTestId('rule-mountain_fee').fill(String(Number(before) + 50));
    await expect(publish).toBeEnabled();
    await expect(page.getByTestId('rules-bar-status')).toContainText('ยังไม่เผยแพร่');
    await reset.click();
    await expect(page.getByTestId('rule-mountain_fee')).toHaveValue(before);
    await expect(publish).toBeDisabled();
  });

  test('P2B-01-09 quote window: "every day" disables the dates, an inverted window blocks publishing', async ({ page }) => {
    await page.goto('/admin/pricing');
    await page.getByTestId('quote-use-range').selectOption('0');
    await expect(page.getByTestId('quote-from')).toBeDisabled();
    await expect(page.getByTestId('quote-to')).toBeDisabled();
    await page.getByTestId('quote-use-range').selectOption('1');
    await expect(page.getByTestId('quote-from')).toBeEnabled();
    await page.getByTestId('quote-from').fill('2031-02-01');
    await page.getByTestId('quote-to').fill('2031-01-01');
    await expect(page.getByTestId('rules-bar-status')).toContainText('ยังเผยแพร่ไม่ได้');
    await expect(page.getByTestId('rules-publish')).toBeDisabled();
  });

  test('P2B-01-06 the server validates the rules: 422 and no new version', async ({ request }) => {
    const cur = await currentRules(sb);
    const rules = cur.rules as Record<string, unknown>;
    const post = (data: unknown) => request.post('/api/admin/pricing/publish', { data });
    const bad1 = await post({ rules: { ...rules, deposit_pct: 500 }, note: 'E2E P2B bad' });
    expect(bad1.status()).toBe(422);
    expect((await bad1.json()).error.code).toBe('invalid_rules');
    const { vehicles: _drop, ...noVehicles } = rules;
    void _drop;
    const bad2 = await post({ rules: noVehicles, note: 'E2E P2B bad' });
    expect(bad2.status()).toBe(422);
    expect((await bad2.json()).error.code).toBe('invalid_rules');
    const bad3 = await post({ rules: { ...rules, vehicles: {} } });
    expect(bad3.status()).toBe(422);
    const bad4 = await post({ note: 'no rules' });
    expect(bad4.status()).toBe(422);
    expect((await bad4.json()).error.code).toBe('validation');
    expect((await currentRules(sb)).version).toBe(cur.version);
  });

  test('P2B-01-04/05 publishing from the UI makes the next version current; bookings keep their version', async ({ page }) => {
    const before = await currentRules(sb);
    const bookingsOnOld = await sb.from('bookings').select('id', { count: 'exact', head: true }).eq('rule_version', before.version);
    expect(bookingsOnOld.error).toBeNull();

    // the UI flow runs for real; the request body is swapped for an identical copy of the
    // current rules so live prices do not change (the version number and note do)
    const note = `E2E P2B ${run} identical copy`;
    await page.route('**/api/admin/pricing/publish', (route) => route.continue({ postData: JSON.stringify({ rules: before.rules, note }) }));

    await page.goto('/admin/pricing');
    await page.getByTestId('rule-mountain_fee').fill(String(Number(await page.getByTestId('rule-mountain_fee').inputValue()) + 50));
    await page.getByTestId('rules-publish').click();
    const dlg = page.getByRole('dialog', { name: 'เผยแพร่กฎราคาใหม่' });
    await expect(dlg).toContainText(`v${before.version + 1}`);
    await dlg.getByLabel('หมายเหตุ (ไม่บังคับ)').fill(note);
    await dlg.getByRole('button', { name: 'ยืนยันเผยแพร่' }).click();
    await expect(page.getByText(`เผยแพร่กฎราคา v${before.version + 1} แล้ว`)).toBeVisible();
    await expect(page.getByTestId('rules-version')).toContainText(`v${before.version + 1}`);
    await expect(page.getByTestId('rules-bar-status')).toContainText('ตรงกับกฎที่ใช้อยู่');

    const after = await currentRules(sb);
    expect(after.version).toBe(before.version + 1);
    expect(after.note).toBe(note);
    expect(after.created_by).not.toBeNull();
    expect(after.rules).toEqual(before.rules);
    const old = await sb.from('pricing_rule_sets').select('is_current').eq('version', before.version).maybeSingle();
    expect(old.data?.is_current).toBe(false);
    const bookingsAfter = await sb.from('bookings').select('id', { count: 'exact', head: true }).eq('rule_version', before.version);
    expect(bookingsAfter.count).toBe(bookingsOnOld.count);
  });

  test('P2B-01-08 history lists versions with note, time and who published', async ({ page }) => {
    const cur = await currentRules(sb);
    await page.goto('/admin/pricing?tab=history');
    const list = page.getByTestId('rules-history');
    await expect(list).toBeVisible();
    const first = list.locator('> *').first();
    await expect(first).toContainText(`v${cur.version}`);
    await expect(first).toContainText('ใช้อยู่');
    await expect(first).toContainText('E2E P2B');
    await expect(first).toContainText('โดย');
    await expect(first).toContainText(/\d{1,2}:\d{2}/);
    await expect(list).toContainText('v1');
  });
});

test.describe('P2B-04 commission (ค่าน้ำ)', () => {
  test.skip(!existsSync(STAFF_STATE), 'no staff credentials — NOT RUN (set E2E_STAFF_EMAIL/PASSWORD)');
  test.use({ storageState: STAFF_STATE });
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  let sb: Sb;
  let placeId = '';
  let placeName = '';

  test.beforeAll(async () => {
    sb = await staffClient();
    const [places, rules] = await Promise.all([
      sb.from('places').select('id, name_th').order('name_th').range(0, 199),
      sb.from('commission_rules').select('place_id').range(0, 499),
    ]);
    const used = new Set((rules.data ?? []).map((r) => r.place_id));
    const free = (places.data ?? []).find((p) => !used.has(p.id));
    if (!free) throw new Error('no place without a commission rule');
    placeId = free.id;
    placeName = free.name_th;
  });
  test.afterAll(async () => {
    if (placeId) await sb.from('commission_rules').delete().eq('place_id', placeId);
  });

  test('P2B-04-01 the table lists the seeded rules with type, amount, split and note', async ({ page }) => {
    await page.goto('/admin/pricing?tab=commission');
    const list = page.getByTestId('commission-list');
    await expect(list).toBeVisible();
    const { data } = await sb.from('commission_rules').select('place_id').range(0, 499);
    expect((await list.locator('> *').count())).toBe(data!.length);
    await expect(list).toContainText('฿100/คน');
    await expect(list).toContainText('10% ของยอดซื้อ');
    await expect(list).toContainText('฿150/ทริป');
  });

  test('P2B-04-02 add, edit and (P2B-04-04) delete a place rule', async ({ page }) => {
    await page.goto('/admin/pricing?tab=commission');
    await page.getByTestId('comm-add').click();
    const dlg = page.getByRole('dialog', { name: 'เพิ่มค่าน้ำ' });
    // required fields are checked before any request
    let posts = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/admin/commission')) posts++;
    });
    await dlg.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(dlg.getByRole('alert')).toContainText('เลือกจุด');
    expect(posts).toBe(0);

    await dlg.getByTestId('comm-place').selectOption(placeId);
    await dlg.getByLabel('จำนวน', { exact: true }).fill('25');
    await dlg.getByLabel('การแบ่ง').selectOption('half');
    await dlg.getByLabel('หมายเหตุถึงคนขับ').fill(`E2E P2B ค่าน้ำ`);
    await dlg.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(page.getByText('บันทึกค่าน้ำแล้ว')).toBeVisible();
    const row = page.getByTestId('commission-list').locator('> *').filter({ hasText: placeName });
    await expect(row).toContainText('฿25/คน');
    const { data } = await sb.from('commission_rules').select('type, amount, split_key, note').eq('place_id', placeId).maybeSingle();
    expect(data).toMatchObject({ type: 'head', amount: 25, split_key: 'half', note: 'E2E P2B ค่าน้ำ' });

    // edit: the place is fixed, type and amount change
    await row.getByRole('button', { name: new RegExp(`แก้ไข ${placeName}`) }).click();
    const edit = page.getByRole('dialog', { name: 'แก้ค่าน้ำ' });
    await expect(edit.getByTestId('comm-place')).toBeDisabled();
    await edit.getByLabel('ประเภท').selectOption('booking');
    await edit.getByLabel('จำนวน', { exact: true }).fill('200');
    await edit.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(page.getByText('บันทึกค่าน้ำแล้ว')).toBeVisible();
    await expect(row).toContainText('฿200/ทริป');
    const edited = await sb.from('commission_rules').select('type, amount').eq('place_id', placeId).maybeSingle();
    expect(edited.data).toMatchObject({ type: 'booking', amount: 200 });
    // one rule per place
    const count = await sb.from('commission_rules').select('place_id', { count: 'exact', head: true }).eq('place_id', placeId);
    expect(count.count).toBe(1);

    // delete through the confirm dialog
    await row.getByRole('button', { name: new RegExp(`ลบ ${placeName}`) }).click();
    const confirm = page.getByRole('dialog', { name: new RegExp(`ลบค่าน้ำของ ${placeName}`) });
    await confirm.getByTestId('comm-confirm-remove').click();
    await expect(page.getByText('ลบค่าน้ำแล้ว')).toBeVisible();
    await expect(row).toHaveCount(0);
    const gone = await sb.from('commission_rules').select('place_id').eq('place_id', placeId).maybeSingle();
    expect(gone.data).toBeNull();
  });

  test('P2B-04-03 the API refuses a % over 100, an unknown split and an unknown place', async ({ request }) => {
    const post = (data: unknown) => request.post('/api/admin/commission', { data });
    const over = await post({ placeId, type: 'sale', amount: 150, splitKey: 'half', note: '' });
    expect(over.status()).toBe(422);
    const split = await post({ placeId, type: 'head', amount: 10, splitKey: 'nope', note: '' });
    expect(split.status()).toBe(422);
    expect((await split.json()).error.code).toBe('invalid_split');
    const place = await post({ placeId: '00000000-0000-4000-8000-000000000000', type: 'head', amount: 10, splitKey: 'half', note: '' });
    expect([403, 422]).toContain(place.status());
    const none = await sb.from('commission_rules').select('place_id').eq('place_id', placeId).maybeSingle();
    expect(none.data).toBeNull();
    const del = await request.post('/api/admin/commission/delete', { data: { placeId } });
    expect(del.status()).toBe(404);
  });
});

test.describe('P2B-01/04 permissions (anonymous)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('P2B-01-11 /admin/pricing sends an anonymous visitor to login', async ({ page }) => {
    await page.goto('/admin/pricing');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  for (const path of ['/api/admin/pricing/publish', '/api/admin/commission', '/api/admin/commission/delete']) {
    test(`P2B-01-11 POST ${path} answers 401 before it looks at the body`, async ({ request }) => {
      const res = await request.post(path, { data: {} });
      expect(res.status()).toBe(401);
      expect((await res.json()).error.code).toBe('unauthenticated');
    });
  }
});
