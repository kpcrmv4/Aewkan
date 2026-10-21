import { expect, test, type Page } from '@playwright/test';
import { buildPlaceLanding, landingPlaces } from '../../src/features/seo/place-data';
import { baht } from '../../src/lib/format';
import { loadCatalog } from './p1-helpers';

/** SEO — one language per URL, metadata, place landing pages, crawlable text (run against `next start`) */

const meta = (page: Page, sel: string) => page.locator(sel).first().getAttribute('content');
const href = (page: Page, sel: string) => page.locator(sel).first().getAttribute('href');

async function waitHydrated(page: Page) {
  await page.waitForFunction(() => Object.keys(document.querySelector('header a') ?? {}).some((k) => k.startsWith('__reactProps')));
}

test('SEO-LANG-01 Thai home', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('วางทริปของคุณบนแผนที่ แล้วเห็นราคาทันที');
  expect(await meta(page, 'meta[property="og:locale"]')).toBe('th_TH');
});

test('SEO-LANG-02 English home', async ({ page }) => {
  await page.goto('/en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Draw your trip on the map and see the price instantly');
  expect(await meta(page, 'meta[property="og:locale"]')).toBe('en_US');
});

test('SEO-LANG-03 the cookie never overrides the URL', async ({ page, context }) => {
  const url = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100';
  await context.addCookies([{ name: 'lang', value: 'en', url }]);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('วางทริป');
  await context.addCookies([{ name: 'lang', value: 'th', url }]);
  await page.goto('/en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Draw your trip');
});

test('SEO-LANG-04 the toggle navigates between / and /en and keeps the query', async ({ page }) => {
  await page.goto('/?staff=1');
  await waitHydrated(page);
  const en = page.getByRole('link', { name: 'EN', exact: true });
  await expect(en).toHaveAttribute('href', '/en?staff=1');
  await en.click();
  await expect(page).toHaveURL(/\/en\?staff=1$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('staff-chip')).toBeVisible();
  await page.getByRole('link', { name: 'ไทย', exact: true }).click();
  await expect(page).toHaveURL(/\/\?staff=1$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
});

test('SEO-LANG-05 / SEO-LANG-06 place page toggle, and the choice reaches /trips', async ({ page }) => {
  const { catalog } = await loadCatalog();
  const slug = landingPlaces(catalog)[0].slug;
  await page.goto(`/places/${slug}`);
  await waitHydrated(page);
  await page.getByRole('link', { name: 'EN', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/en/places/${slug}$`));
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('/trips');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/My trips/i);
});

test('SEO-META-01 canonical and hreflang on home and place pages', async ({ page }) => {
  const { catalog } = await loadCatalog();
  const slug = landingPlaces(catalog)[0].slug;
  for (const [path, own] of [
    ['/', '/'],
    ['/en', '/en'],
    [`/places/${slug}`, `/places/${slug}`],
    [`/en/places/${slug}`, `/en/places/${slug}`],
  ] as const) {
    await page.goto(path);
    const canon = new URL((await href(page, 'link[rel="canonical"]'))!);
    expect(canon.pathname).toBe(own);
    const th = new URL((await href(page, 'link[rel="alternate"][hreflang="th"]'))!);
    const en = new URL((await href(page, 'link[rel="alternate"][hreflang="en"]'))!);
    const def = new URL((await href(page, 'link[rel="alternate"][hreflang="x-default"]'))!);
    expect(en.pathname).toBe(th.pathname === '/' ? '/en' : `/en${th.pathname}`);
    expect(def.pathname).toBe(th.pathname);
  }
});

test('SEO-META-02 / SEO-META-03 Open Graph, Twitter and titles', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/รถพร้อมคนขับ เชียงใหม่/);
  expect(await meta(page, 'meta[property="og:title"]')).toContain('รถพร้อมคนขับ');
  expect(await meta(page, 'meta[property="og:image"]')).toContain('/opengraph-image');
  expect(await meta(page, 'meta[property="og:locale:alternate"]')).toBe('en_US');
  expect(await meta(page, 'meta[name="twitter:card"]')).toBe('summary_large_image');
  await page.goto('/en');
  await expect(page).toHaveTitle(/Chiang Mai Private Driver/);
  expect(await meta(page, 'meta[property="og:locale:alternate"]')).toBe('th_TH');
});

test('SEO-META-04 only the landing pages are indexable', async ({ page }) => {
  await page.goto('/trips');
  expect(await meta(page, 'meta[name="robots"]')).toContain('noindex');
  for (const p of ['/', '/en']) {
    await page.goto(p);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  }
});

test('SEO-ROB-01 robots.txt', async ({ request }) => {
  const body = await (await request.get('/robots.txt')).text();
  for (const line of ['Allow: /', 'Disallow: /admin', 'Disallow: /api', 'Disallow: /j/', 'Disallow: /trips']) expect(body).toContain(line);
  expect(body).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
});

test('SEO-MAP-01 sitemap lists both languages for every place', async ({ request }) => {
  const { catalog } = await loadCatalog();
  const xml = await (await request.get('/sitemap.xml')).text();
  expect(xml).toMatch(/<loc>[^<]*\/<\/loc>/);
  expect(xml).toMatch(/<loc>[^<]*\/en<\/loc>/);
  for (const p of landingPlaces(catalog)) {
    expect(xml).toMatch(new RegExp(`<loc>[^<]*/places/${p.slug}</loc>`));
    expect(xml).toMatch(new RegExp(`<loc>[^<]*/en/places/${p.slug}</loc>`));
  }
  expect(xml).toContain('hreflang="x-default"');
});

test('SEO-PLC-01 / SEO-PLC-02 / SEO-LD-02 Thai place page and its prices', async ({ page }) => {
  const { catalog } = await loadCatalog();
  const place = landingPlaces(catalog).find((p) => p.is_mountain) ?? landingPlaces(catalog)[0];
  const exp = buildPlaceLanding(catalog, place.slug)!;
  const res = await page.goto(`/places/${place.slug}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`รถพร้อมคนขับไป${place.name_th} จากตัวเมืองเชียงใหม่`);
  await expect(page.getByRole('navigation', { name: 'เส้นทางหน้า' })).toContainText(place.name_th);
  for (const r of exp.rows) await expect(page.locator(`[data-mode="${r.mode}"] [data-price]`)).toHaveText(baht(r.total));
  await expect(page.getByText('ราคาประมาณ อาจเปลี่ยนตามช่วงเทศกาล')).toBeVisible();
  await expect(page.getByTestId('nearby').getByRole('link')).toHaveCount(4);
  await expect(page.getByTestId('plan-cta').first()).toHaveAttribute('href', `/?places=${place.slug}`);

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const graph = blocks.flatMap((b) => (JSON.parse(b) as { '@graph': Array<Record<string, unknown>> })['@graph']);
  expect(graph.some((n) => n['@type'] === 'BreadcrumbList')).toBe(true);
  const trip = graph.find((n) => n['@type'] === 'TouristTrip') as { offers: { price: number; priceCurrency: string } };
  expect(trip.offers).toMatchObject({ price: exp.fromPrice, priceCurrency: 'THB' });
});

test('SEO-PLC-03 English place page', async ({ page }) => {
  const { catalog } = await loadCatalog();
  const place = landingPlaces(catalog)[0];
  await page.goto(`/en/places/${place.slug}`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Private driver to ${place.name_en} from Chiang Mai city`);
  expect(new URL((await href(page, 'link[rel="canonical"]'))!).pathname).toBe(`/en/places/${place.slug}`);
  await expect(page.getByTestId('plan-cta').first()).toHaveAttribute('href', `/en?places=${place.slug}`);
});

test('SEO-PLC-04 unknown, pickup-point and hidden slugs answer 404', async ({ request }) => {
  for (const p of ['/places/nope-nothing', '/en/places/nope-nothing', '/places/tp', '/en/places/airport']) {
    expect((await request.get(p)).status(), p).toBe(404);
  }
});

test('SEO-PLC-06 no sideways scroll at 360px', async ({ page }) => {
  const { catalog } = await loadCatalog();
  await page.setViewportSize({ width: 360, height: 740 });
  for (const p of ['/', '/en', `/places/${landingPlaces(catalog)[0].slug}`]) {
    await page.goto(p);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), p).toBe(true);
  }
});

test('SEO-LD-01 home structured data parses', async ({ page }) => {
  await page.goto('/');
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const graph = blocks.flatMap((b) => (JSON.parse(b) as { '@graph': Array<Record<string, unknown>> })['@graph']);
  expect(graph.some((n) => n['@type'] === 'WebSite')).toBe(true);
  expect(graph.some((n) => Array.isArray(n['@type']) && (n['@type'] as string[]).includes('LocalBusiness'))).toBe(true);
});

test('SEO-HTML-01 the server HTML carries the crawlable text', async ({ request }) => {
  const { json, catalog } = await loadCatalog();
  for (const [path, lang] of [['/', 'th'], ['/en', 'en']] as const) {
    const html = await (await request.get(path)).text();
    expect(html).toMatch(/<h1[^>]*>[^<]+/);
    expect(html).toContain(lang === 'th' ? 'แอ่วกันให้บริการรถพร้อมคนขับในเชียงใหม่' : 'AewKan is a private car-with-driver service');
    for (const t of json.templates) expect(html).toContain(lang === 'th' ? t.name_th : t.name_en);
    for (const p of landingPlaces(catalog)) expect(html).toContain(`href="${lang === 'en' ? '/en' : ''}/places/${p.slug}"`);
  }
});

test('SEO-PRE-01 / SEO-PRE-03 ?places= preselects stops in both languages, ?staff=1 still works', async ({ page }) => {
  const { catalog } = await loadCatalog();
  const [a, b] = landingPlaces(catalog);
  for (const [path, nameKey] of [[`/?places=${a.slug},ghost,${b.slug}&staff=1`, 'name_th'], [`/en?places=${a.slug},${b.slug}`, 'name_en']] as const) {
    await page.goto(path);
    const selected = page.locator('[data-place][aria-pressed="true"]');
    await expect(selected).toHaveCount(2);
    await expect(page.locator(`[data-place="${a.slug}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(`[data-place="${b.slug}"]`)).toContainText(b[nameKey]);
  }
  await page.goto(`/?places=${a.slug}&staff=1`);
  await expect(page.getByTestId('staff-chip')).toBeVisible();
});

test('SEO-IMG-01 OG image, icons and manifest', async ({ request }) => {
  const og = await request.get('/opengraph-image');
  expect(og.headers()['content-type']).toContain('image/png');
  const buf = await og.body();
  expect(buf.readUInt32BE(16)).toBe(1200);
  expect(buf.readUInt32BE(20)).toBe(630);
  const mf = (await (await request.get('/manifest.webmanifest')).json()) as { icons: Array<{ src: string; sizes: string }> } & Record<string, unknown>;
  expect(mf).toMatchObject({ lang: 'th' });
  expect(mf.icons.map((i) => i.sizes)).toEqual(['192x192', '512x512']);
  for (const src of [...mf.icons.map((i) => i.src), '/brand/aewkan-icon-180.png', '/brand/aewkan-logo-480.webp']) {
    expect((await request.get(src)).status(), src).toBe(200);
  }
  for (const k of ['name', 'short_name', 'description']) expect(typeof mf[k]).toBe('string');
});
