import { ChevronRight, Clock, MapPin, Mountain, Route, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { PublicHeader } from '@/components/public/public-header';
import { CATEGORY_LABEL, MODE_LABEL } from '@/lib/copy/common';
import { MODE_NOTE_KEY, seoText } from '@/lib/copy/seo';
import { baht, formatDuration } from '@/lib/format';
import { homePath, placePath, planPath, type UrlLang } from './lang-url';
import { JsonLd } from './json-ld';
import { placeJsonLd } from './jsonld';
import { placeName } from './metadata';
import type { PlaceLanding } from './place-data';
import { SITE_URL } from '@/lib/env';

/** one place landing page, in one language (the URL decides which) */
export function PlaceView({ lang, l }: { lang: UrlLang; l: PlaceLanding }) {
  const name = placeName(l, lang);
  const baseName = lang === 'en' ? l.base.name_en : l.base.name_th;
  const vehicle = lang === 'en' ? l.vehicle.name_en : l.vehicle.name_th;
  const cat = CATEGORY_LABEL[l.place.category as keyof typeof CATEGORY_LABEL]?.[lang] ?? l.place.category;
  const plan = planPath(lang, [l.place.slug]);
  const stats = [
    { Icon: Route, label: seoText(lang, 'statKm'), value: `${Math.round(l.oneWayKm)} ${lang === 'en' ? 'km' : 'กม.'}` },
    { Icon: Clock, label: seoText(lang, 'statTime'), value: formatDuration(l.oneWayMinutes, lang) },
    { Icon: MapPin, label: seoText(lang, 'statRound'), value: formatDuration(l.roundMinutes, lang) },
  ];

  return (
    <div className="min-h-dvh">
      <JsonLd data={placeJsonLd(lang, SITE_URL, l)} />
      <PublicHeader />
      <main className="mx-auto max-w-[1180px] px-4 pb-32 pt-3 lg:pb-12">
        <nav aria-label={seoText(lang, 'breadcrumbAria')} className="mb-3">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-token">
            <li>
              <Link href={homePath(lang)} className="hover:text-ink">
                {seoText(lang, 'home')}
              </Link>
            </li>
            <li aria-hidden>
              <ChevronRight className="size-3.5" />
            </li>
            <li aria-current="page" className="font-medium text-ink-2">
              {name}
            </li>
          </ol>
        </nav>

        <h1 className="mb-2 max-w-[28ch] text-[clamp(26px,3.6vw,38px)] font-semibold text-ink">{seoText(lang, 'placeH1', { name })}</h1>
        <p className="mb-2 max-w-[64ch] text-ink-2">{seoText(lang, 'placeLead', { name, base: baseName, vehicle, seats: l.vehicle.seats, dwell: l.dwell })}</p>
        <p className="mb-5 flex flex-wrap items-center gap-2 text-sm text-ink-2">
          <span className="chip bg-surface-2 text-ink-2 ring-line">{seoText(lang, 'catLine', { cat, zone: l.zone })}</span>
          {l.place.is_mountain && (
            <span className="inline-flex items-center gap-1.5">
              <Mountain className="size-4 text-brand" aria-hidden />
              {seoText(lang, 'mountainNote', { fee: l.mountainFee })}
            </span>
          )}
        </p>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <section className="panel" aria-labelledby="price-title">
            <div className="panel-head">
              <Sparkles className="size-4" aria-hidden />
              <h2 id="price-title" className="text-sm font-semibold">
                {seoText(lang, 'priceTitle', { name })}
              </h2>
            </div>
            <p className="px-4 pt-3 text-sm text-ink-2">{seoText(lang, 'priceSub', { base: baseName, vehicle })}</p>
            {l.rows.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-token">{seoText(lang, 'noPrice')}</p>
            ) : (
              <table className="w-full text-left text-sm" data-testid="price-table">
                <thead>
                  <tr className="text-xs text-muted-token">
                    <th scope="col" className="px-4 py-2 font-medium">
                      {seoText(lang, 'colMode')}
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      {seoText(lang, 'colPrice')}
                    </th>
                    <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">
                      {seoText(lang, 'colNote')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {l.rows.map((r) => (
                    <tr key={r.mode} className="border-t border-line-soft align-top" data-mode={r.mode}>
                      <th scope="row" className="px-4 py-3 font-medium text-ink">
                        {MODE_LABEL[r.mode][lang]}
                        {r.best && <span className="chip ml-2 bg-brand-tint text-brand-on-tint ring-line">{seoText(lang, 'best')}</span>}
                        <span className="mt-0.5 block text-xs font-normal text-muted-token sm:hidden">{seoText(lang, MODE_NOTE_KEY[r.mode], { u: r.units })}</span>
                      </th>
                      <td className="tnum px-2 py-3 text-right text-base font-semibold text-ink" data-price={r.total}>
                        {baht(r.total)}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-muted-token sm:table-cell">{seoText(lang, MODE_NOTE_KEY[r.mode], { u: r.units })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="border-t border-line-soft px-4 py-3 text-xs text-muted-token">{seoText(lang, 'priceDisclaimer', { v: l.ruleVersion })}</p>
          </section>

          <aside className="space-y-4">
            <section className="panel" aria-label={seoText(lang, 'statKm')}>
              <dl className="divide-y divide-line-soft">
                {stats.map(({ Icon, label, value }) => (
                  <div key={label} className="flex items-center gap-3 px-4 py-3">
                    <Icon className="size-4 shrink-0 text-ink-2" aria-hidden />
                    <dt className="flex-1 text-sm text-ink-2">{label}</dt>
                    <dd className="tnum text-sm font-semibold text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="panel p-4">
              <p className="mb-3 text-sm text-ink-2">{seoText(lang, 'ctaSub')}</p>
              <Link href={plan} className="btn-primary w-full" data-testid="plan-cta">
                {seoText(lang, 'ctaPlan')}
              </Link>
            </section>
          </aside>
        </div>

        {l.nearby.length > 0 && (
          <section className="mt-8" aria-labelledby="nearby-title">
            <h2 id="nearby-title" className="mb-3 text-xl font-semibold text-ink">
              {seoText(lang, 'nearbyTitle')}
            </h2>
            <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4" data-testid="nearby">
              {l.nearby.map(({ place, km }) => (
                <li key={place.id}>
                  <Link href={placePath(lang, place.slug)} className="flex min-h-[64px] flex-col justify-center rounded-md border border-line bg-surface px-4 py-3 transition-colors hover:border-ink">
                    <b className="text-sm font-semibold text-ink">{lang === 'en' ? place.name_en : place.name_th}</b>
                    <span className="text-xs text-muted-token">{seoText(lang, 'nearbyKm', { km: Math.max(1, Math.round(km)) })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {/* phone: the primary action stays in reach, above the bottom tab bar */}
      <div className="fixed inset-x-0 z-20 border-t border-line bg-surface lg:hidden" style={{ bottom: 'var(--public-bottom-h, 0px)' }}>
        <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            {l.fromPrice !== null && <div className="num-display tnum text-lg text-ink">{baht(l.fromPrice)}</div>}
            <div className="truncate text-xs text-muted-token">{name}</div>
          </div>
          <Link href={plan} className="btn-primary">
            {seoText(lang, 'ctaPlan')}
          </Link>
        </div>
      </div>
    </div>
  );
}
