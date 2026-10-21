import { describe, expect, it } from 'vitest';
import { homeJsonLd, jsonLdString, placeJsonLd } from '@/features/seo/jsonld';
import { homeMetadata, placeMetadata } from '@/features/seo/metadata';
import { buildPlaceLanding } from '@/features/seo/place-data';
import { buildRobots, buildSitemap } from '@/features/seo/sitemap';
import { makeCatalog } from './fixtures/catalog';

const SITE = 'https://aewkan.example';
const landing = buildPlaceLanding(makeCatalog(), 'suthep')!;

describe('SEO-META-05 metadata builders', () => {
  it('home: canonical, hreflang, Open Graph locales', () => {
    const th = homeMetadata('th', SITE);
    expect(th.alternates?.canonical).toBe(`${SITE}/`);
    expect(th.alternates?.languages).toEqual({ th: `${SITE}/`, en: `${SITE}/en`, 'x-default': `${SITE}/` });
    expect(th.openGraph).toMatchObject({ locale: 'th_TH', alternateLocale: ['en_US'] });
    expect(String((th.title as { absolute: string }).absolute)).toContain('รถพร้อมคนขับ เชียงใหม่');
    const en = homeMetadata('en', SITE);
    expect(en.alternates?.canonical).toBe(`${SITE}/en`);
    expect(en.openGraph).toMatchObject({ locale: 'en_US', alternateLocale: ['th_TH'] });
    expect(String((en.title as { absolute: string }).absolute)).toMatch(/Chiang Mai Private Driver/);
    expect(en.twitter).toMatchObject({ card: 'summary_large_image' });
  });

  it('place: own canonical per language, same alternates, price in the title', () => {
    const th = placeMetadata('th', SITE, landing);
    const en = placeMetadata('en', SITE, landing);
    expect(th.alternates?.canonical).toBe(`${SITE}/places/suthep`);
    expect(en.alternates?.canonical).toBe(`${SITE}/en/places/suthep`);
    expect(en.alternates?.languages).toEqual(th.alternates?.languages);
    expect(th.alternates?.languages).toMatchObject({ 'x-default': `${SITE}/places/suthep` });
    expect(String((th.title as { absolute: string }).absolute)).toContain(`฿${landing.fromPrice!.toLocaleString('en-US')}`);
  });
});

describe('SEO-ROB-01 / SEO-MAP-02 robots and sitemap', () => {
  it('robots allows / and blocks private areas', () => {
    const r = buildRobots(`${SITE}/`);
    expect(r.rules).toEqual([{ userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/j/', '/trips'] }]);
    expect(r.sitemap).toBe(`${SITE}/sitemap.xml`);
  });

  it('sitemap lists both languages with alternates; empty catalog keeps the home URLs', () => {
    const urls = buildSitemap(SITE, ['pai']).map((e) => e.url);
    expect(urls).toEqual([`${SITE}/`, `${SITE}/en`, `${SITE}/places/pai`, `${SITE}/en/places/pai`]);
    const first = buildSitemap(SITE, ['pai'])[0];
    expect(first.alternates?.languages).toEqual({ th: `${SITE}/`, en: `${SITE}/en`, 'x-default': `${SITE}/` });
    expect(buildSitemap(SITE, []).map((e) => e.url)).toEqual([`${SITE}/`, `${SITE}/en`]);
  });
});

describe('SEO-LD structured data', () => {
  it('SEO-LD-01 home has a business and a website', () => {
    const g = (homeJsonLd('th', SITE) as { '@graph': Array<Record<string, unknown>> })['@graph'];
    const biz = g.find((n) => Array.isArray(n['@type']) && (n['@type'] as string[]).includes('LocalBusiness'))!;
    expect(biz).toMatchObject({ name: 'แอ่วกัน', priceRange: expect.any(String), url: `${SITE}/`, areaServed: { name: 'Chiang Mai' } });
    expect(g.some((n) => n['@type'] === 'WebSite')).toBe(true);
  });

  it('SEO-LD-02 place has breadcrumbs and a THB offer equal to the lowest price', () => {
    const g = (placeJsonLd('en', SITE, landing) as { '@graph': Array<Record<string, unknown>> })['@graph'];
    const crumbs = g.find((n) => n['@type'] === 'BreadcrumbList') as { itemListElement: unknown[] };
    expect(crumbs.itemListElement).toHaveLength(2);
    const trip = g.find((n) => n['@type'] === 'TouristTrip') as { offers: Record<string, unknown> };
    expect(trip.offers).toMatchObject({ '@type': 'Offer', priceCurrency: 'THB', price: landing.fromPrice });
  });

  it('SEO-LD-03 escapes < so the script tag cannot be closed', () => {
    const s = jsonLdString({ name: '</script><script>alert(1)</script>' });
    expect(s).not.toContain('<');
    expect(JSON.parse(s).name).toBe('</script><script>alert(1)</script>');
  });
});
