import { ArrowRight, MapPin, Route } from 'lucide-react';
import Link from 'next/link';
import { TripBuilder } from '@/features/trip-builder/trip-builder';
import { CATEGORY_LABEL } from '@/lib/copy/common';
import { seoText } from '@/lib/copy/seo';
import { todayInBangkok } from '@/lib/format';
import type { PublicCatalogJson } from '@/lib/pricing';
import { getCatalogOrNull } from './data';
import { JsonLd } from './json-ld';
import { homeJsonLd } from './jsonld';
import { planPath, placePath, type UrlLang } from './lang-url';
import { landingPlaces } from './place-data';
import { SITE_URL } from '@/lib/env';

/**
 * Home page for one language: the trip builder plus plain server-rendered text
 * (intro, trip templates, destination links) that does not depend on the map.
 */
export async function HomeView({ lang, staff, prefill }: { lang: UrlLang; staff: boolean; prefill: string[] }) {
  const loaded = await getCatalogOrNull();
  const json: PublicCatalogJson | null = loaded?.json ?? null;
  return (
    <>
      <JsonLd data={homeJsonLd(lang, SITE_URL)} />
      <TripBuilder json={json} today={todayInBangkok()} staff={staff} prefill={prefill} />
      {loaded && <CrawlableText lang={lang} json={loaded.json} places={landingPlaces(loaded.catalog)} />}
      {!loaded && <CrawlableIntro lang={lang} />}
    </>
  );
}

function CrawlableIntro({ lang }: { lang: UrlLang }) {
  return (
    <section className="mx-auto max-w-[1180px] px-4 pb-28 lg:pb-12" aria-labelledby="seo-intro">
      <h2 id="seo-intro" className="mb-2 text-xl font-semibold text-ink">
        {seoText(lang, 'introTitle')}
      </h2>
      <p className="max-w-[72ch] text-ink-2">{seoText(lang, 'introBody')}</p>
    </section>
  );
}

function CrawlableText({ lang, json, places }: { lang: UrlLang; json: PublicCatalogJson; places: ReturnType<typeof landingPlaces> }) {
  const slugOf = new Map(json.places.map((p) => [p.id, p.slug]));
  const nameOf = (p: { name_th: string; name_en: string }) => (lang === 'en' ? p.name_en : p.name_th);
  const cats = (Object.keys(CATEGORY_LABEL) as Array<keyof typeof CATEGORY_LABEL>).filter((c) => places.some((p) => p.category === c));
  return (
    <section className="mx-auto max-w-[1180px] space-y-8 px-4 pb-28 pt-4 lg:pb-12" aria-labelledby="seo-intro">
      <div>
        <h2 id="seo-intro" className="mb-2 text-xl font-semibold text-ink">
          {seoText(lang, 'introTitle')}
        </h2>
        <p className="max-w-[72ch] text-ink-2">{seoText(lang, 'introBody')}</p>
      </div>

      {json.templates.length > 0 && (
        <div>
          <h2 className="mb-1 text-xl font-semibold text-ink">{seoText(lang, 'tplTitle')}</h2>
          <p className="mb-3 text-sm text-muted-token">{seoText(lang, 'tplLead')}</p>
          <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {json.templates.map((t) => {
              const slugs = t.stops.map((s) => slugOf.get(s.place_id)).filter((s): s is string => Boolean(s));
              return (
                <li key={t.id}>
                  <Link href={slugs.length ? planPath(lang, slugs) : lang === 'en' ? '/en' : '/'} className="flex min-h-[64px] items-start gap-3 rounded-md border border-line bg-surface px-4 py-3 transition-colors hover:border-ink">
                    <Route className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <b className="block text-sm font-semibold text-ink">{lang === 'en' ? t.name_en : t.name_th}</b>
                      <span className="block text-xs text-muted-token">
                        {lang === 'en' ? t.sub_en : t.sub_th} · {seoText(lang, 'tplStops', { n: t.stops.length })}
                        {t.round_trip ? '' : ` · ${seoText(lang, 'tplOneWay')}`}
                      </span>
                    </span>
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-ink-2" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {places.length > 0 && (
        <div>
          <h2 className="mb-1 text-xl font-semibold text-ink">{seoText(lang, 'destTitle')}</h2>
          <p className="mb-3 text-sm text-muted-token">{seoText(lang, 'destLead')}</p>
          <div className="space-y-4">
            {cats.map((c) => (
              <div key={c}>
                <h3 className="mb-2 text-sm font-semibold text-ink-2">{CATEGORY_LABEL[c][lang]}</h3>
                <ul className="flex flex-wrap gap-2">
                  {places
                    .filter((p) => p.category === c)
                    .map((p) => (
                      <li key={p.id}>
                        <Link href={placePath(lang, p.slug)} className="pill min-h-[44px] hover:border-ink">
                          <MapPin className="size-3.5 text-brand" aria-hidden />
                          {nameOf(p)}
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-xl font-semibold text-ink">{seoText(lang, 'howTitle')}</h2>
        <p className="max-w-[72ch] text-ink-2">{seoText(lang, 'howBody')}</p>
      </div>
    </section>
  );
}
