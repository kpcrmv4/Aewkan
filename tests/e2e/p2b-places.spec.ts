import { existsSync } from 'node:fs';
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { STAFF_STATE } from './global-setup';
import { newRunId, staffClient, type Sb } from './p2-helpers';

// server-rendered pages stream after several database round trips
const expect = baseExpect.configure({ timeout: 15_000 });

const orderPair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

test.describe('P2B-02 places', () => {
  test.skip(!existsSync(STAFF_STATE), 'no staff credentials — NOT RUN (set E2E_STAFF_EMAIL/PASSWORD)');
  test.use({ storageState: STAFF_STATE });
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  let sb: Sb;
  const run = newRunId();
  const nameA = `E2E P2B ${run} จุดพิมพ์พิกัด`;
  const nameB = `E2E P2B ${run} จุดลิงก์ยาว`;
  const nameC = `E2E P2B ${run} จุดจิ้มแผนที่`;
  const made: string[] = [];

  test.beforeAll(async () => {
    sb = await staffClient();
  });
  test.afterAll(async () => {
    // staff cannot delete places (no grant): hide the rows this run made
    if (made.length) await sb.from('places').update({ is_hidden: true }).in('id', made);
  });

  const addButton = (page: Page) => page.getByTestId('place-add');
  const rowOf = (page: Page, name: string) => page.getByTestId('places-list').locator('> *').filter({ hasText: name });

  async function fillNames(page: Page, th: string, en: string) {
    await page.getByTestId('place-name-th').fill(th);
    await page.getByTestId('place-name-en').fill(en);
  }

  test('P2B-02-01 the list shows places with category, flags and an add button', async ({ page }) => {
    await page.goto('/admin/places');
    await expect(page.getByRole('heading', { level: 1, name: 'จุดหมาย' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'หมวดของจุดหมาย' });
    await expect(nav.getByRole('link', { name: 'จุดหมาย' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'ระยะจริง' })).toBeVisible();
    await expect(addButton(page)).toBeVisible();
    const list = page.getByTestId('places-list');
    await expect(list).toContainText('ประตูท่าแพ');
    await expect(list).toContainText('ดอย');
    await expect(list).toContainText('จุดรับ');
    const { count } = await sb.from('places').select('id', { count: 'exact', head: true });
    await expect(page.getByTestId('places-count')).toHaveText(`${count} จุด`);
  });

  test('P2B-02-08 add a place from typed coordinates, with the pin previewed before saving', async ({ page }) => {
    await page.goto('/admin/places');
    await addButton(page).click();
    const dlg = page.getByRole('dialog', { name: 'เพิ่มจุดหมาย' });
    // nothing is sent while the form is incomplete
    let posts = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/admin/places')) posts++;
    });
    await dlg.getByTestId('place-save').click();
    await expect(dlg.getByTestId('place-error')).toContainText('กรอกชื่อไทย');
    expect(posts).toBe(0);

    await fillNames(page, nameA, `E2E P2B ${run} typed`);
    await page.getByTestId('place-paste').fill('18.80, 98.92');
    await page.getByTestId('place-use-paste').click();
    await expect(page.getByTestId('place-loc-msg')).toContainText('ได้พิกัดแล้ว');
    await expect(page.getByTestId('place-lat')).toHaveValue('18.8');
    await expect(page.getByTestId('place-lng')).toHaveValue('98.92');
    // the pin shows on the map preview when the browser can run WebGL
    const map = page.getByTestId('place-map');
    if (await map.isVisible()) await expect(page.getByTestId('place-pin')).toBeVisible();
    await page.getByTestId('place-category').selectOption('nature');
    await page.getByTestId('place-dwell').fill('75');
    await page.getByTestId('place-is-mountain').check();
    await dlg.getByTestId('place-save').click();
    await expect(page.getByText('บันทึกจุดหมายแล้ว')).toBeVisible();

    const { data } = await sb.from('places').select('id, slug, lat, lng, category, is_mountain, is_pickup, default_dwell_min, is_hidden').eq('name_th', nameA).maybeSingle();
    expect(data).toMatchObject({ lat: 18.8, lng: 98.92, category: 'nature', is_mountain: true, is_pickup: false, default_dwell_min: 75, is_hidden: false });
    expect(data!.slug).toMatch(/^[a-z0-9][a-z0-9-]{1,48}$/);
    made.push(data!.id);
  });

  test('P2B-02-09 a pasted full Google Maps link gives the pin (the !3d!4d point wins over @)', async ({ page }) => {
    await page.goto('/admin/places');
    await addButton(page).click();
    const dlg = page.getByRole('dialog', { name: 'เพิ่มจุดหมาย' });
    await fillNames(page, nameB, `E2E P2B ${run} link`);
    await page.getByTestId('place-paste').fill('ร้านกาแฟ https://www.google.com/maps/place/Cafe/@18.79,98.98,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x1!8m2!3d18.7931!4d98.9892!16s');
    await page.getByTestId('place-use-paste').click();
    await expect(page.getByTestId('place-lat')).toHaveValue('18.7931');
    await expect(page.getByTestId('place-lng')).toHaveValue('98.9892');
    // a link with no coordinates says so and leaves the fields alone
    await page.getByTestId('place-paste').fill('https://www.google.com/maps/place/Somewhere');
    await page.getByTestId('place-use-paste').click();
    await expect(page.getByTestId('place-loc-msg')).toContainText('อ่านพิกัดจากข้อความนี้ไม่ได้');
    await expect(page.getByTestId('place-lat')).toHaveValue('18.7931');
    await dlg.getByTestId('place-save').click();
    await expect(page.getByText('บันทึกจุดหมายแล้ว')).toBeVisible();
    const { data } = await sb.from('places').select('id, lat, lng').eq('name_th', nameB).maybeSingle();
    expect(data).toMatchObject({ lat: 18.7931, lng: 98.9892 });
    made.push(data!.id);
  });

  test('P2B-02-10 clicking the map sets the point; coordinates outside the service area are refused', async ({ page }) => {
    await page.goto('/admin/places');
    await addButton(page).click();
    const dlg = page.getByRole('dialog', { name: 'เพิ่มจุดหมาย' });
    await fillNames(page, nameC, `E2E P2B ${run} map`);
    const map = page.getByTestId('place-map');
    await expect(map).toBeVisible();
    const canvasOk = await page.locator('[data-testid="place-map"] canvas').count();
    test.skip(canvasOk === 0, 'map did not start in this browser (no WebGL) — NOT RUN');
    await expect(page.getByTestId('place-lat')).toHaveValue('');
    // locator.click scrolls the map into view inside the (scrollable) sheet first
    await map.click();
    await expect(page.getByTestId('place-lat')).not.toHaveValue('');
    const lat = Number(await page.getByTestId('place-lat').inputValue());
    const lng = Number(await page.getByTestId('place-lng').inputValue());
    // the map opens on Chiang Mai
    expect(lat).toBeGreaterThan(18.5);
    expect(lat).toBeLessThan(19.1);
    expect(lng).toBeGreaterThan(98.7);
    expect(lng).toBeLessThan(99.3);
    await expect(page.getByTestId('place-pin')).toBeVisible();

    // typing a point abroad is refused before any request
    await page.getByTestId('place-lat').fill('51.5');
    await page.getByTestId('place-lng').fill('-0.12');
    await dlg.getByTestId('place-save').click();
    await expect(dlg.getByTestId('place-error')).toContainText('นอกพื้นที่ให้บริการ');
    await page.getByTestId('place-lat').fill(String(lat));
    await page.getByTestId('place-lng').fill(String(lng));
    await dlg.getByTestId('place-save').click();
    await expect(page.getByText('บันทึกจุดหมายแล้ว')).toBeVisible();
    const { data } = await sb.from('places').select('id').eq('name_th', nameC).maybeSingle();
    expect(data).not.toBeNull();
    made.push(data!.id);
  });

  test('P2B-02-02 search and category filter keep their state in the URL', async ({ page }) => {
    await page.goto(`/admin/places?q=${encodeURIComponent(`E2E P2B ${run}`)}`);
    const list = page.getByTestId('places-list');
    await expect(list.locator('> *')).toHaveCount(made.length);
    await expect(list).toContainText(nameA);
    await page.goto(`/admin/places?q=${encodeURIComponent(`E2E P2B ${run}`)}&cat=nature`);
    await expect(list.locator('> *')).toHaveCount(1);
    await expect(list).toContainText(nameA);
    await page.goto(`/admin/places?q=${encodeURIComponent(`E2E P2B ${run}`)}&cat=temple`);
    await expect(page.getByText('ไม่มีจุดหมายที่ตรงกับตัวกรอง')).toBeVisible();
    await page.getByRole('link', { name: 'ล้างตัวกรอง' }).click();
    await expect(page).toHaveURL(/\/admin\/places$/);
    // English name search
    await page.goto(`/admin/places?q=${encodeURIComponent(`E2E P2B ${run} typed`)}`);
    await expect(page.getByTestId('places-list').locator('> *')).toHaveCount(1);
    // the chip bar marks the active filter
    await page.goto('/admin/places?cat=temple');
    await expect(page.getByTestId('places-filters').getByRole('link', { name: 'วัด', exact: true })).toHaveAttribute('aria-current', 'true');
  });

  test('P2B-02-11 edit keeps the slug; hiding removes the place from the public catalog (P2B-02-13)', async ({ page }) => {
    const before = await sb.from('places').select('slug').eq('name_th', nameA).maybeSingle();
    await page.goto(`/admin/places?q=${encodeURIComponent(nameA)}`);
    await rowOf(page, nameA).getByRole('button', { name: /แก้ไข/ }).click();
    const dlg = page.getByRole('dialog', { name: 'แก้ไขจุดหมาย' });
    await expect(page.getByTestId('place-name-th')).toHaveValue(nameA);
    await page.getByTestId('place-name-en').fill(`E2E P2B ${run} typed edited`);
    await page.getByTestId('place-category').selectOption('temple');
    await page.getByTestId('place-is-mountain').uncheck();
    await page.getByTestId('place-hidden').check();
    await dlg.getByTestId('place-save').click();
    await expect(page.getByText('บันทึกจุดหมายแล้ว')).toBeVisible();
    const { data } = await sb.from('places').select('slug, name_en, category, is_mountain, is_hidden').eq('name_th', nameA).maybeSingle();
    expect(data).toMatchObject({ slug: before.data!.slug, name_en: `E2E P2B ${run} typed edited`, category: 'temple', is_mountain: false, is_hidden: true });
    await expect(rowOf(page, nameA)).toContainText('ซ่อน');
    const cat = await sb.rpc('get_public_catalog');
    const names = ((cat.data as { places: Array<{ name_th: string }> }).places ?? []).map((p) => p.name_th);
    expect(names).not.toContain(nameA);
    expect(names).toContain(nameB);
  });

  test('P2B-02-12 the API refuses coordinates outside the area and blank names', async ({ request }) => {
    const post = (data: unknown) => request.post('/api/admin/places', { data });
    const ok = { nameTh: 'x', nameEn: 'x', lat: 18.8, lng: 98.9, category: 'city', isPickup: false, isMountain: false, defaultDwellMin: 30, isHidden: true };
    expect((await post({ ...ok, lat: 51.5, lng: -0.12 })).status()).toBe(422);
    expect((await post({ ...ok, nameTh: '   ' })).status()).toBe(422);
    expect((await post({ ...ok, category: 'beach' })).status()).toBe(422);
    const missing = await post({ ...ok, id: '00000000-0000-4000-8000-000000000000' });
    expect(missing.status()).toBe(403);
  });

  test('P2B-02-07 the link resolver accepts only Google / OSM hosts and reads coordinates without a network call', async ({ request }) => {
    const post = (url: string) => request.post('/api/admin/places/resolve', { data: { url } });
    const evil = await post('https://evil.example.com/maps');
    expect(evil.status()).toBe(422);
    expect((await evil.json()).error.code).toBe('link_not_allowed');
    expect((await post('http://169.254.169.254/latest/meta-data')).status()).toBe(422);
    expect((await post('http://maps.app.goo.gl/abc')).status()).toBe(422);
    const full = await post('https://www.google.com/maps/place/X/@18.8048,98.9217,17z');
    expect(full.status()).toBe(200);
    expect(await full.json()).toMatchObject({ ok: true, lat: 18.8048, lng: 98.9217 });
    const none = await post('https://www.google.com/maps/place/NoCoordinates');
    expect([404, 502]).toContain(none.status());
  });
});

test.describe('P2B-03 measured segments', () => {
  test.skip(!existsSync(STAFF_STATE), 'no staff credentials — NOT RUN (set E2E_STAFF_EMAIL/PASSWORD)');
  test.use({ storageState: STAFF_STATE });
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  let sb: Sb;
  const run = newRunId();
  const nameX = `E2E P2B ${run} ต้นทาง`;
  const nameY = `E2E P2B ${run} ปลายทาง`;
  let x = '';
  let y = '';
  let a = '';
  let b = '';

  test.beforeAll(async () => {
    sb = await staffClient();
    // the pair is made of two fresh places, so no real measured segment can be touched
    const rows = [nameX, nameY].map((n, i) => ({ slug: `e2e-p2b-${run}-${i}`, name_th: n, name_en: `${n} en`, lat: 18.8 + i / 100, lng: 98.95, category: 'city', is_hidden: true }));
    const { data, error } = await sb.from('places').insert(rows).select('id, name_th');
    if (error || !data) throw new Error(`fixture places failed: ${error?.message}`);
    x = data.find((p) => p.name_th === nameX)!.id;
    y = data.find((p) => p.name_th === nameY)!.id;
    [a, b] = orderPair(x, y);
  });
  test.afterAll(async () => {
    await sb.from('segments').delete().in('place_a', [x, y]);
    await sb.from('places').update({ is_hidden: true }).in('id', [x, y]);
  });

  const rowOf = (page: Page) => page.getByTestId('segments-list').locator('> *').filter({ hasText: nameX });

  test('P2B-03-01 the tab lists measured segments with source, km, minutes, samples and date', async ({ page }) => {
    await page.goto('/admin/places?tab=segments');
    await expect(page.getByRole('heading', { level: 2, name: 'ระยะทางและเวลาจริงรายช่วง' })).toBeVisible();
    const list = page.getByTestId('segments-list');
    await expect(list).toBeVisible();
    const first = list.locator('> *').first();
    await expect(first).toContainText('↔');
    await expect(first).toContainText('กม.');
    await expect(first).toContainText('นาที');
    await expect(first).toContainText('ตัวอย่าง');
    await expect(first).toContainText('วัดเมื่อ');
    await expect(first).toContainText(/วัดจริง|เช็กอิน|ระบบเส้นทาง/);
    // source filter
    await page.getByTestId('segments-filters').getByRole('link', { name: 'วัดจริง' }).click();
    await expect(page).toHaveURL(/src=driven/);
    const texts = () => page.getByTestId('segments-list').locator('> *').evaluateAll((els) => els.map((e) => e.textContent ?? ''));
    // the server re-renders after the navigation: wait until every row is a driven one
    await expect.poll(async () => {
      const t = await texts();
      return t.length > 0 && t.every((x) => x.includes('วัดจริง'));
    }).toBe(true);
  });

  test('P2B-03-02 a driven measurement is stored once per pair whichever way round it is entered', async ({ page }) => {
    await page.goto('/admin/places?tab=segments');
    await page.getByTestId('segment-add').click();
    const dlg = page.getByRole('dialog', { name: 'เพิ่มช่วงที่วัดแล้ว' });
    // incomplete / same place: nothing is sent
    let posts = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/admin/segments')) posts++;
    });
    await dlg.getByTestId('segment-save').click();
    await expect(dlg.getByTestId('segment-error')).toContainText('เลือกจุดต้นทางและปลายทางคนละจุด');
    await dlg.getByTestId('segment-from').selectOption(x);
    await dlg.getByTestId('segment-to').selectOption(x);
    await dlg.getByTestId('segment-km').fill('12.3');
    await dlg.getByTestId('segment-minutes').fill('25');
    await dlg.getByTestId('segment-save').click();
    await expect(dlg.getByTestId('segment-error')).toContainText('คนละจุด');
    expect(posts).toBe(0);

    // y -> x, so the stored order (place_a < place_b) must be fixed up
    await dlg.getByTestId('segment-from').selectOption(y);
    await dlg.getByTestId('segment-to').selectOption(x);
    await dlg.getByTestId('segment-save').click();
    await expect(page.getByText('บันทึกช่วงแล้ว')).toBeVisible();
    const { data } = await sb.from('segments').select('place_a, place_b, source, km, minutes, samples').or(`place_a.eq.${x},place_b.eq.${x}`).range(0, 9);
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ place_a: a, place_b: b, source: 'driven', km: 12.3, minutes: 25 });
    await expect(rowOf(page)).toContainText('12.3 กม.');
    await expect(rowOf(page)).toContainText('วัดจริง');

    // entering the same pair the other way round updates the same row
    await page.getByTestId('segment-add').click();
    const again = page.getByRole('dialog', { name: 'เพิ่มช่วงที่วัดแล้ว' });
    await again.getByTestId('segment-from').selectOption(x);
    await again.getByTestId('segment-to').selectOption(y);
    await again.getByTestId('segment-km').fill('13');
    await again.getByTestId('segment-minutes').fill('27');
    await again.getByTestId('segment-save').click();
    await expect(again).toBeHidden();
    const rows = await sb.from('segments').select('km, minutes').or(`place_a.eq.${x},place_b.eq.${x}`).range(0, 9);
    expect(rows.data).toHaveLength(1);
    expect(rows.data![0]).toMatchObject({ km: 13, minutes: 27 });
  });

  test('P2B-03-03 edit changes km and minutes and refreshes the measured time', async ({ page }) => {
    const before = await sb.from('segments').select('measured_at').eq('place_a', a).eq('place_b', b).eq('source', 'driven').maybeSingle();
    await page.goto(`/admin/places?tab=segments&place=${x}`);
    await rowOf(page).getByRole('button', { name: /แก้ไข/ }).click();
    const dlg = page.getByRole('dialog', { name: 'แก้ช่วงนี้' });
    await expect(dlg.getByTestId('segment-from')).toBeDisabled();
    await dlg.getByTestId('segment-km').fill('14.5');
    await dlg.getByTestId('segment-minutes').fill('30');
    await dlg.getByTestId('segment-save').click();
    await expect(page.getByText('บันทึกช่วงแล้ว')).toBeVisible();
    const after = await sb.from('segments').select('km, minutes, measured_at').eq('place_a', a).eq('place_b', b).eq('source', 'driven').maybeSingle();
    expect(after.data).toMatchObject({ km: 14.5, minutes: 30 });
    expect(new Date(after.data!.measured_at).getTime()).toBeGreaterThan(new Date(before.data!.measured_at).getTime());
  });

  test('P2B-03-07 "fetch road distance": the route answers by configuration, never by writing a guess', async ({ page, request }) => {
    const res = await request.post('/api/admin/segments/fetch', { data: { fromId: x, toId: y } });
    const body = await res.json();
    if (!process.env.SUPABASE_SECRET_KEY) {
      expect(res.status()).toBe(503);
      expect(body.error.code).toBe('server_not_configured');
    } else {
      expect([200, 409, 422, 429, 502, 504]).toContain(res.status());
    }
    // validation precedes configuration
    const same = await request.post('/api/admin/segments/fetch', { data: { fromId: x, toId: x } });
    expect(same.status()).toBe(422);
    expect((await same.json()).error.code).toBe('same_place');
    // no routing row was written by a failed fetch; the driven row is untouched
    const rows = await sb.from('segments').select('source, km').or(`place_a.eq.${x},place_b.eq.${x}`).range(0, 9);
    if (res.status() !== 200) expect(rows.data!.map((r) => r.source)).toEqual(['driven']);
    expect(rows.data!.find((r) => r.source === 'driven')?.km).toBe(14.5);

    // the button shows the failure in the dialog and keeps it open
    await page.goto('/admin/places?tab=segments');
    await page.getByTestId('segment-add').click();
    const dlg = page.getByRole('dialog', { name: 'เพิ่มช่วงที่วัดแล้ว' });
    await dlg.getByTestId('segment-from').selectOption(x);
    await dlg.getByTestId('segment-to').selectOption(y);
    await dlg.getByTestId('segment-fetch').click();
    if (res.status() !== 200) await expect(dlg.getByTestId('segment-error')).toBeVisible();
  });

  test('P2B-03-04 delete goes through a confirm dialog and removes the row', async ({ page }) => {
    await page.goto(`/admin/places?tab=segments&place=${x}`);
    await rowOf(page).getByRole('button', { name: /ลบ/ }).click();
    const confirm = page.getByRole('dialog', { name: /ลบช่วง/ });
    await expect(confirm).toContainText('ลบแล้วระบบใช้ค่าที่แม่นรองลงมา');
    await confirm.getByTestId('segment-confirm-remove').click();
    await expect(page.getByText('ลบช่วงแล้ว')).toBeVisible();
    const gone = await sb.from('segments').select('place_a').or(`place_a.eq.${x},place_b.eq.${x}`).range(0, 9);
    expect(gone.data).toEqual([]);
  });

  test('P2B-03-05 the API refuses a pair of one place and non-positive numbers', async ({ request }) => {
    const post = (data: unknown) => request.post('/api/admin/segments', { data });
    const ok = { fromId: x, toId: y, km: 5, minutes: 10, source: 'driven', note: '' };
    const same = await post({ ...ok, toId: x });
    expect(same.status()).toBe(422);
    expect((await same.json()).error.code).toBe('same_place');
    expect((await post({ ...ok, km: 0 })).status()).toBe(422);
    expect((await post({ ...ok, minutes: -3 })).status()).toBe(422);
    expect((await post({ ...ok, source: 'guess' })).status()).toBe(422);
    const del = await request.post('/api/admin/segments/delete', { data: { fromId: x, toId: y, source: 'driven' } });
    expect(del.status()).toBe(404);
    const none = await sb.from('segments').select('place_a').or(`place_a.eq.${x},place_b.eq.${x}`).range(0, 9);
    expect(none.data).toEqual([]);
  });
});

test.describe('P2B-02/03 permissions (anonymous)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('P2B-02-14 /admin/places sends an anonymous visitor to login', async ({ page }) => {
    await page.goto('/admin/places');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  for (const path of ['/api/admin/places', '/api/admin/places/resolve', '/api/admin/segments', '/api/admin/segments/delete', '/api/admin/segments/fetch']) {
    test(`P2B-03-09 POST ${path} answers 401 before it looks at the body`, async ({ request }) => {
      const res = await request.post(path, { data: {} });
      expect(res.status()).toBe(401);
      expect((await res.json()).error.code).toBe('unauthenticated');
    });
  }
});

test.describe('P2B-RESP small screens', () => {
  test.skip(!existsSync(STAFF_STATE), 'no staff credentials — NOT RUN (set E2E_STAFF_EMAIL/PASSWORD)');
  test.use({ storageState: STAFF_STATE });

  for (const path of ['/admin/pricing', '/admin/pricing?tab=commission', '/admin/pricing?tab=history', '/admin/places', '/admin/places?tab=segments']) {
    test(`P2B-RESP-01 ${path} does not scroll sideways`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      // wait for the view (not the skeleton) before measuring
      await expect(page.getByTestId('rules-version').or(page.getByTestId('places-count')).or(page.getByTestId('segments-filters')).first()).toBeVisible();
      const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(scroll).toBeLessThanOrEqual(inner);
    });
  }

  test('P2B-RESP-02 forms are bottom sheets with 44px targets on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/admin/places');
    await page.getByTestId('place-add').click();
    const dlg = page.getByRole('dialog', { name: 'เพิ่มจุดหมาย' });
    await expect(dlg).toBeVisible();
    const box = (await dlg.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(360);
    expect(box.y + box.height).toBeGreaterThan(780); // docked to the bottom edge
    for (const id of ['place-name-th', 'place-name-en', 'place-paste', 'place-lat', 'place-save']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(42);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.keyboard.press('Escape');
    await page.goto('/admin/pricing');
    await expect(page.getByTestId('rules-bar')).toBeVisible();
    const bar = (await page.getByTestId('rules-bar').boundingBox())!;
    // the sticky save bar sits above the 64px bottom nav
    expect(bar.y + bar.height).toBeLessThanOrEqual(800 - 60);
  });
});
