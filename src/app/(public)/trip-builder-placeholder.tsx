'use client';

import { useMemo } from 'react';
import { PublicHeader } from '@/components/public/public-header';
import { useLang } from '@/components/public/lang';
import { MODE_LABEL } from '@/lib/copy/common';
import { baht } from '@/lib/format';
import { catalogFromJson, MODES, planTrip, priceTrip, type PublicCatalogJson, type TripInput } from '@/lib/pricing';

/** P0 wiring check — replaced by the P1 trip builder */
export function TripBuilderPlaceholder({ catalog: json }: { catalog: PublicCatalogJson }) {
  const { lang } = useLang();
  const catalog = useMemo(() => catalogFromJson(json), [json]);
  const tpl = json.templates[0];
  const input: TripInput | null = tpl
    ? {
        pickupId: catalog.basePlaceId,
        stops: tpl.stops.map((s) => ({ placeId: s.place_id, dwell: s.dwell })),
        date: '2026-10-24',
        time: '08:00',
        pax: 2,
        vehicle: tpl.vehicle_key,
        roundTrip: tpl.round_trip,
        langDriver: false,
        festival: false,
      }
    : null;
  const res = input ? priceTrip(catalog, input, planTrip(catalog, input)) : null;
  return (
    <div className="min-h-dvh">
      <PublicHeader />
      <main className="mx-auto max-w-[1180px] px-4 pb-12 pt-4">
        <h1 className="mb-2 max-w-[22ch] text-[clamp(26px,3.6vw,38px)] font-semibold text-ink">
          {lang === 'en' ? 'Draw your trip on the map and see the price instantly' : 'วางทริปของคุณบนแผนที่ แล้วเห็นราคาทันที'}
        </h1>
        <p className="mb-6 max-w-[58ch] text-ink-2">
          {lang === 'en' ? 'The trip builder arrives in phase P1.' : 'หน้าวางทริปจะพร้อมในเฟส P1'} · {json.places.length} {lang === 'en' ? 'places' : 'จุดหมาย'} · v{catalog.ruleVersion}
        </p>
        {tpl && res && (
          <section className="panel max-w-xl">
            <div className="panel-head">{lang === 'en' ? tpl.name_en : tpl.name_th}</div>
            <ul className="divide-y divide-line-soft">
              {MODES.map((m) => (
                <li key={m} className="flex justify-between px-4 py-2.5 text-sm">
                  <span>
                    {MODE_LABEL[m][lang]}
                    {res.best === m && <span className="ml-2 rounded-pill bg-hl px-2 py-0.5 text-[11px] font-bold text-hl-ink">{lang === 'en' ? 'Best value' : 'คุ้มสุด'}</span>}
                  </span>
                  <span className="num-display">{res.modes[m].ok ? baht(res.modes[m].total) : '—'}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
