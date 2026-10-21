import { expect, test, type Page } from '@playwright/test';
import { CATEGORY_LABEL, MODE_LABEL, priceLineText } from '../../src/lib/copy/common';
import { baht, bahtDelta } from '../../src/lib/format';
import {
  depositFor,
  formatClock,
  MODES,
  planTrip,
  priceTrip,
  suggestAlongRoute,
  tripWarnings,
  vehicleFor,
  whatIfAdd,
  whatIfRemove,
  type Catalog,
  type PublicCatalogJson,
} from '../../src/lib/pricing';
import { firstScreen, loadCatalog, openBuilder, QUOTE_DATE } from './p1-helpers';

let json: PublicCatalogJson;
let catalog: Catalog;
test.beforeAll(async () => {
  ({ json, catalog } = await loadCatalog());
});

const slugOf = (id: string) => catalog.places.find((p) => p.id === id)!.slug;
const stopSlugs = (page: Page) => page.locator('[data-stop]').evaluateAll((els) => els.map((e) => e.getAttribute('data-stop')));
const hours = (min: number) => (min / 60).toFixed(1).replace(/\.0$/, '');

test('P1-MAP-01 map region is there with pins or a notice', async ({ page }) => {
  await openBuilder(page);
  await expect(page.getByTestId('trip-map')).toBeAttached();
  await expect.poll(async () => (await page.locator('[data-pin]').count()) + (await page.getByRole('status').count()), { timeout: 15000 }).toBeGreaterThan(0);
});

test('P1-MAP-02 tile failure does not break the place list', async ({ page }) => {
  await page.route(/tile\.openstreetmap\.org/, (r) => r.abort());
  await openBuilder(page);
  const f = firstScreen(catalog, json);
  const free = catalog.places.find((p) => p.category !== 'pickup' && !f.input.stops.some((s) => s.placeId === p.id))!;
  await page.locator(`[data-place="${free.slug}"]`).click();
  await expect(page.locator(`[data-place="${free.slug}"]`)).toHaveAttribute('aria-pressed', 'true');
  expect(await stopSlugs(page)).toContain(free.slug);
});

test('P1-MAP-03 zone legend comes from the rule set', async ({ page }) => {
  await openBuilder(page);
  for (const z of catalog.rules.zones.filter((x) => x.max_km !== null)) {
    await expect(page.getByText(`โซน ${z.id} ≤ ${z.max_km} กม.`, { exact: false }).first()).toBeVisible();
  }
});

test('P1-TPL-01 templates row loads a template', async ({ page }) => {
  test.skip(json.templates.length < 2, 'NOT RUN: needs two templates');
  await openBuilder(page);
  for (const t of json.templates) await expect(page.getByRole('listitem').filter({ hasText: t.name_th }).first()).toBeVisible();
  await page.getByRole('listitem').filter({ hasText: json.templates[1].name_th }).first().click();
  expect(await stopSlugs(page)).toEqual(json.templates[1].stops.map((s) => slugOf(s.place_id)));
});

test('P1-CAT-01 category pills filter the place list', async ({ page }) => {
  await openBuilder(page);
  const cat = 'temple' as const;
  const total = await page.locator('[data-place]').count();
  await page.getByRole('button', { name: CATEGORY_LABEL[cat].th, exact: true }).click();
  const expected = catalog.places.filter((p) => p.category === cat).length;
  await expect(page.locator('[data-place]')).toHaveCount(expected);
  await page.getByRole('button', { name: 'ทั้งหมด', exact: true }).click();
  await expect(page.locator('[data-place]')).toHaveCount(total);
});

test('P1-LIST-01 place cards show the price change', async ({ page }) => {
  await openBuilder(page);
  const f = firstScreen(catalog, json);
  const free = catalog.places.find((p) => p.category !== 'pickup' && !f.input.stops.some((s) => s.placeId === p.id))!;
  const add = whatIfAdd(catalog, f.input, free, f.mode).delta;
  await expect(page.locator(`[data-place="${free.slug}"]`)).toContainText(bahtDelta(add));
  const sel = f.input.stops[0];
  await expect(page.locator(`[data-place="${slugOf(sel.placeId)}"]`)).toContainText(bahtDelta(whatIfRemove(catalog, f.input, 0, f.mode)));
});

test('P1-LIST-02 a card toggles its stop', async ({ page }) => {
  await openBuilder(page);
  const f = firstScreen(catalog, json);
  const free = catalog.places.find((p) => p.category !== 'pickup' && !f.input.stops.some((s) => s.placeId === p.id))!;
  const card = page.locator(`[data-place="${free.slug}"]`);
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  expect(await stopSlugs(page)).toContain(free.slug);
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'false');
});

test('P1-PICK-01 pickup select lists the pickup places', async ({ page }) => {
  await openBuilder(page);
  const names = await page.getByLabel('จุดรับ', { exact: true }).locator('option').allTextContents();
  expect(names.sort()).toEqual(catalog.places.filter((p) => p.is_pickup).map((p) => p.name_th).sort());
});

test('P1-DATE-01 pickup time moves the end clock', async ({ page }) => {
  await openBuilder(page);
  await page.getByLabel('เวลารับ', { exact: true }).fill('10:00');
  const f = firstScreen(catalog, json);
  const plan = planTrip(catalog, { ...f.input, time: '10:00' });
  await expect(page.getByTestId('totals')).toContainText(`จบทริปประมาณ ${formatClock(plan.end)}`);
});

test('P1-PAX-01 more passengers than seats switches vehicle with a toast', async ({ page }) => {
  await openBuilder(page);
  const f = firstScreen(catalog, json);
  const seats = catalog.rules.vehicles[f.input.vehicle].seats;
  const pax = seats + 1;
  const v = vehicleFor(catalog, pax);
  test.skip(!v, 'NOT RUN: no vehicle seats that many');
  await page.getByLabel('ผู้โดยสาร', { exact: true }).selectOption(String(pax));
  await expect(page.getByLabel('ประเภทรถ', { exact: true })).toHaveValue(v!);
  await expect(page.getByText(`ผู้โดยสาร ${pax} คน ระบบเปลี่ยนเป็น`)).toBeVisible();
});

test('P1-VEH-01 vehicle select reprices', async ({ page }) => {
  await openBuilder(page);
  const f = firstScreen(catalog, json);
  const other = Object.keys(catalog.rules.vehicles).find((k) => k !== f.input.vehicle && catalog.rules.vehicles[k].seats >= f.input.pax)!;
  await page.getByLabel('ประเภทรถ', { exact: true }).selectOption(other);
  const input = { ...f.input, vehicle: other };
  const res = priceTrip(catalog, input, planTrip(catalog, input));
  for (const k of MODES) if (res.modes[k].ok) await expect(page.locator(`[data-mode="${k}"]`)).toContainText(baht(res.modes[k].total));
});

test('P1-OPT-01 return to pickup off drops the return leg', async ({ page }) => {
  await openBuilder(page);
  const f = firstScreen(catalog, json);
  test.skip(!f.input.roundTrip, 'NOT RUN: first template is already one-way');
  await expect(page.getByTestId('return-leg')).toBeVisible();
  await page.getByLabel('กลับมาส่งที่จุดรับเมื่อจบทริป').uncheck();
  await expect(page.getByTestId('return-leg')).toHaveCount(0);
  const input = { ...f.input, roundTrip: false };
  const res = priceTrip(catalog, input, planTrip(catalog, input));
  await expect(page.locator('[data-mode="oneway"]')).toHaveJSProperty('disabled', !res.modes.oneway.ok);
});

for (const [id, label, key] of [
  ['P1-OPT-02', /ต้องการคนขับที่สื่อสาร/, 'langDriver'],
  ['P1-OPT-03', /เดินทางช่วงเทศกาล/, 'festival'],
] as const) {
  test(`${id} option ${key} is in the price`, async ({ page }) => {
    await openBuilder(page);
    const f = firstScreen(catalog, json);
    await page.getByLabel(label).check();
    const input = { ...f.input, [key]: true };
    const res = priceTrip(catalog, input, planTrip(catalog, input));
    const mode = f.mode!;
    await expect(page.locator(`[data-mode="${mode}"]`)).toContainText(baht(res.modes[mode].total));
  });
}

test('P1-STOP-01 reorder up and down', async ({ page }) => {
  await openBuilder(page);
  const f = firstScreen(catalog, json);
  test.skip(f.input.stops.length < 2, 'NOT RUN: needs two stops in the first template');
  const before = f.input.stops.map((s) => slugOf(s.placeId));
  await expect(page.getByRole('button', { name: 'เลื่อนขึ้น' }).first()).toBeDisabled();
  await expect(page.getByRole('button', { name: 'เลื่อนลง' }).last()).toBeDisabled();
  await page.getByRole('button', { name: 'เลื่อนลง' }).first().click();
  const after = await stopSlugs(page);
  expect(after.slice(0, 2)).toEqual([before[1], before[0]]);
});

test('P1-STOP-02 dwell select changes the end clock', async ({ page }) => {
  await openBuilder(page);
  const f = firstScreen(catalog, json);
  await page.locator('[data-stop]').first().locator('select').selectOption('120');
  const stops = f.input.stops.map((s, i) => (i === 0 ? { ...s, dwell: 120 } : s));
  const plan = planTrip(catalog, { ...f.input, stops });
  await expect(page.getByTestId('totals')).toContainText(`จบทริปประมาณ ${formatClock(plan.end)}`);
});

test('P1-STOP-03 remove shows the price drop and removes', async ({ page }) => {
  await openBuilder(page);
  const f = firstScreen(catalog, json);
  const row = page.locator('[data-stop]').first();
  await expect(row).toContainText(`ตัดออก ${bahtDelta(whatIfRemove(catalog, f.input, 0, f.mode))}`);
  await row.getByRole('button', { name: /^ลบ/ }).click();
  await expect(page.locator('[data-stop]')).toHaveCount(f.input.stops.length - 1);
});

test('P1-STOP-04 empty trip shows the hint and disables booking', async ({ page }) => {
  await openBuilder(page);
  while (await page.locator('[data-stop]').count()) await page.locator('[data-stop]').first().getByRole('button', { name: /^ลบ/ }).click();
  await expect(page.getByText('ยังไม่มีจุดหมาย แตะจุดบนแผนที่')).toBeVisible();
  await expect(page.getByTestId('book-start')).toBeDisabled();
});

test('P1-LEG-01 legs are tagged measured or estimate', async ({ page }) => {
  await openBuilder(page);
  const f = firstScreen(catalog, json);
  for (const [i, leg] of f.plan.legs.entries()) {
    await expect(page.locator('[data-stop]').nth(i)).toContainText(leg.measured ? 'วัดจริง' : 'ประมาณ');
  }
  if (f.plan.ret) await expect(page.getByTestId('return-leg')).toContainText(f.plan.ret.measured ? 'วัดจริง' : 'ประมาณ');
});

test('P1-TOT-01 totals match the plan', async ({ page }) => {
  await openBuilder(page);
  const { plan } = firstScreen(catalog, json);
  const t = page.getByTestId('totals');
  await expect(t).toContainText(`${Math.round(plan.km)} กม.`);
  await expect(t).toContainText(`${hours(plan.driveMinutes)} ชม.`);
  await expect(t).toContainText(`${hours(plan.totalMinutes)} ชม.`);
});

test('P1-WARN-01 a vehicle too small for the pax warns and blocks booking', async ({ page }) => {
  await openBuilder(page);
  const sorted = Object.entries(catalog.rules.vehicles).sort((a, b) => a[1].sort - b[1].sort);
  const pax = sorted[0][1].seats + 1;
  test.skip(!vehicleFor(catalog, pax), 'NOT RUN: no larger vehicle');
  await page.getByLabel('ผู้โดยสาร', { exact: true }).selectOption(String(pax));
  await page.getByLabel('ประเภทรถ', { exact: true }).selectOption(sorted[0][0]);
  await expect(page.locator('[data-warning="too_many_pax"]')).toBeVisible();
  await expect(page.getByTestId('book-start')).toBeDisabled();
});

test('P1-WARN-02 selecting every place shows the long-day warning the engine returns', async ({ page }) => {
  await openBuilder(page);
  const f = firstScreen(catalog, json);
  const picked = [...f.input.stops];
  for (const p of catalog.places.filter((x) => x.category !== 'pickup')) {
    if (picked.some((s) => s.placeId === p.id)) continue;
    await page.locator(`[data-place="${p.slug}"]`).click();
    picked.push({ placeId: p.id, dwell: p.default_dwell_min });
  }
  const input = { ...f.input, stops: picked };
  const w = tripWarnings(catalog, input, planTrip(catalog, input)).filter((x) => x.kind !== 'too_many_pax');
  for (const kind of ['over_day', 'tight_day'] as const) {
    const loc = page.locator(`[data-warning="${kind}"]`);
    if (w.some((x) => x.kind === kind)) await expect(loc).toBeVisible();
    else await expect(loc).toHaveCount(0);
  }
});

test('P1-SUG-01 along-route suggestion matches the engine', async ({ page }) => {
  await openBuilder(page);
  const f = firstScreen(catalog, json);
  const s = suggestAlongRoute(catalog, f.input, f.mode)[0];
  const row = page.locator(`[data-suggest="${s.place.slug}"]`);
  await expect(row).toBeVisible();
  await expect(row).toContainText(`อ้อม ${Math.round(s.detourKm)} กม.`);
  await expect(row).toContainText(bahtDelta(s.delta));
  await expect(page.locator('[data-suggest]').first()).toHaveAttribute('data-suggest', s.place.slug);
});

test('P1-SUG-02 adding a suggestion inserts it at the best position', async ({ page }) => {
  await openBuilder(page);
  const f = firstScreen(catalog, json);
  const s = suggestAlongRoute(catalog, f.input, f.mode)[0];
  await page.locator(`[data-suggest="${s.place.slug}"]`).getByRole('button').click();
  const expected = f.input.stops.map((x) => slugOf(x.placeId));
  expected.splice(s.index, 0, s.place.slug);
  expect(await stopSlugs(page)).toEqual(expected);
});

test('P1-PRICE-01 four cards with the best badge', async ({ page }) => {
  await openBuilder(page);
  const { res } = firstScreen(catalog, json);
  for (const k of MODES) {
    const card = page.locator(`[data-mode="${k}"]`);
    await expect(card).toContainText(MODE_LABEL[k].th);
    await expect(card).toContainText(res.modes[k].ok ? baht(res.modes[k].total) : '—');
    if (res.best === k) await expect(card).toContainText('คุ้มสุด');
    else await expect(card).not.toContainText('คุ้มสุด');
  }
});

test('P1-PRICE-02 selected card is inverted and clicking moves the selection', async ({ page }) => {
  await openBuilder(page);
  const { res, mode } = firstScreen(catalog, json);
  await expect(page.locator(`[data-mode="${mode}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`[data-mode="${mode}"]`)).toHaveClass(/bg-ink/);
  const other = MODES.find((k) => k !== mode && res.modes[k].ok);
  test.skip(!other, 'NOT RUN: only one valid mode');
  await page.locator(`[data-mode="${other}"]`).click();
  await expect(page.locator(`[data-mode="${other}"]`)).toHaveClass(/bg-ink/);
  await expect(page.getByTestId('price-total')).toContainText(baht(res.modes[other!].total));
});

test('P1-PRICE-03 a not-ok card is disabled with its reason', async ({ page }) => {
  await openBuilder(page);
  const { res } = firstScreen(catalog, json);
  const bad = MODES.find((k) => !res.modes[k].ok);
  test.skip(!bad, 'NOT RUN: all four modes valid for the first template');
  const card = page.locator(`[data-mode="${bad}"]`);
  await expect(card).toBeDisabled();
  const reason = { needs_one_way: 'ปิดตัวเลือก "กลับมาส่งที่จุดรับ" ก่อน', needs_far_zone: 'ปลายทางต้องอยู่โซน 3 ขึ้นไป', no_stops: 'ยังไม่มีจุดหมาย' }[res.modes[bad!].reason!];
  await expect(card).toContainText(reason);
});

test('P1-PRICE-04 breakdown lines, total and deposit', async ({ page }) => {
  await openBuilder(page);
  const { res, mode } = firstScreen(catalog, json);
  const sel = res.modes[mode!];
  const lines = page.getByTestId('price-lines');
  for (const l of sel.lines) await expect(lines).toContainText(`${priceLineText(l.key, l.vars, 'th')}${baht(l.amount)}`);
  await expect(page.getByTestId('price-total')).toContainText(baht(sel.total));
  await expect(page.getByTestId('price-deposit')).toContainText(baht(depositFor(catalog, sel.total)));
});

test('P1-QUOTE-01 quote dates show the banner and request button', async ({ page }) => {
  test.skip(!catalog.rules.quote.enabled, 'NOT RUN: quote mode disabled');
  await openBuilder(page, QUOTE_DATE);
  await expect(page.getByTestId('quote-banner')).toBeVisible();
  await expect(page.getByText('ราคาอ้างอิง 4 แบบ')).toBeVisible();
  await expect(page.getByTestId('book-start')).toHaveText('ส่งคำขอราคา');
  await expect(page.getByTestId('price-deposit')).toHaveCount(0);
});

test('P1-QUOTE-02 normal dates book with the deposit', async ({ page }) => {
  await openBuilder(page);
  const { res, mode } = firstScreen(catalog, json);
  await expect(page.getByTestId('quote-banner')).toHaveCount(0);
  await expect(page.getByTestId('book-start')).toHaveText(`จองและมัดจำ ${baht(depositFor(catalog, res.modes[mode!].total))}`);
});

test('P1-LANG-01 English switch', async ({ page }) => {
  await openBuilder(page);
  const { res, mode } = firstScreen(catalog, json);
  // on "/" the switch is a link to "/en" (one language per URL); the builder reloads there
  await page.getByRole('link', { name: 'EN', exact: true }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator('[data-mode="hourly"]')).toContainText(MODE_LABEL.hourly.en);
  await expect(page.getByTestId('book-start')).toHaveText(`Book with ${baht(depositFor(catalog, res.modes[mode!].total))} deposit`);
  const first = catalog.places.find((p) => p.category !== 'pickup')!;
  await expect(page.locator(`[data-place="${first.slug}"]`)).toContainText(first.name_en);
});

test('P1-BOOK-01 empty contact form shows errors', async ({ page }) => {
  await openBuilder(page);
  await page.getByTestId('book-start').click();
  await page.getByTestId('book-submit').click();
  await expect(page.getByText('กรุณากรอกชื่อผู้จอง')).toBeVisible();
  await expect(page.getByText('กรุณากรอกช่องทางติดต่ออย่างน้อย 3 ตัวอักษร')).toBeVisible();
});

test('P1-BOOK-02 push opt-in exists only in quote mode', async ({ page }) => {
  await openBuilder(page);
  await page.getByTestId('book-start').click();
  await expect(page.getByLabel('รับแจ้งเตือนราคาบนเครื่องนี้ (push)')).toHaveCount(0);
  test.skip(!catalog.rules.quote.enabled, 'NOT RUN: quote mode disabled');
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click();
  await page.getByLabel('วันเดินทาง').fill(QUOTE_DATE);
  await page.getByTestId('book-start').click();
  await expect(page.getByLabel('รับแจ้งเตือนราคาบนเครื่องนี้ (push)')).toBeVisible();
});

test('P1-BOOK-05 without the secret key the submit reports not configured', async ({ page }) => {
  test.skip(Boolean(process.env.SUPABASE_SECRET_KEY), 'NOT RUN: only meaningful without SUPABASE_SECRET_KEY');
  await openBuilder(page);
  await page.getByTestId('book-start').click();
  await page.getByLabel('ชื่อผู้จอง').fill('ทดสอบ');
  await page.getByLabel('LINE / WhatsApp / โทรศัพท์').fill('@test123');
  await page.getByTestId('book-submit').click();
  await expect(page.getByText('ระบบยังตั้งค่าไม่ครบ').first()).toBeVisible();
  await expect(page.getByTestId('book-submit')).toBeEnabled();
});

test('P1-STAFF-01 staff chip only with ?staff=1', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByTestId('staff-chip')).toHaveCount(0);
  await page.goto('/?staff=1');
  await expect(page.getByTestId('staff-chip')).toBeVisible();
});

test('P1-RSP-01 no sideways scroll', async ({ page }) => {
  await openBuilder(page);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('P1-RSP-02 sticky price bar sits above the tab bar on phones only', async ({ page, isMobile }) => {
  await openBuilder(page);
  const bar = page.getByTestId('sticky-bar');
  if (!isMobile) {
    await expect(bar).toBeHidden();
    return;
  }
  await expect(bar).toBeVisible();
  const nav = page.getByRole('navigation', { name: /^(เมนู|Menu)$/ });
  const b = await bar.boundingBox();
  const n = await nav.boundingBox();
  expect(b!.y + b!.height).toBeLessThanOrEqual(n!.y + 1);
});
