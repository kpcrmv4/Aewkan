'use client';

import { Map as MapIcon, UserCog } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PublicHeader } from '@/components/public/public-header';
import { useLang } from '@/components/public/lang';
import { EmptyState } from '@/components/ui/states';
import { ErrorRetry } from '@/components/ui/error-retry';
import { tripText } from '@/lib/copy/trip';
import { baht } from '@/lib/format';
import { catalogFromJson, depositFor, type Catalog, type Mode, type PublicCatalogJson } from '@/lib/pricing';
import { BookingPanel } from './booking-panel';
import { buildModel } from './model';
import { PlaceList, TemplateRow } from './place-list';
import { PricePanel } from './price-panel';
import { applyPrefill, applyTemplate, initialState, moveStop, paxChange, toggleStop, type BuilderState } from './state';
import { SuggestPanel } from './suggest-panel';
import { TripMap } from './trip-map';
import { TripPanel } from './trip-panel';

interface Props {
  /** null = the catalog could not be loaded */
  json: PublicCatalogJson | null;
  today: string;
  staff: boolean;
  /** place slugs from `?places=` to preselect (already parsed, unknown ones are ignored later) */
  prefill?: string[];
}

/**
 * The trip in progress survives client-side navigation (Thai ↔ English are two URLs, so the
 * page remounts); a full reload starts fresh. A `?places=` link always starts its own trip.
 */
let carried: BuilderState | null = null;

function safeCatalog(json: PublicCatalogJson | null): Catalog | null {
  if (!json) return null;
  try {
    return catalogFromJson(json);
  } catch {
    return null;
  }
}

export function TripBuilder({ json, today, staff, prefill = [] }: Props) {
  const { lang } = useLang();
  const router = useRouter();
  const catalog = useMemo(() => safeCatalog(json), [json]);

  return (
    <div className="min-h-dvh">
      <PublicHeader />
      <main className="mx-auto max-w-[1180px] px-4 pb-28 pt-4 lg:pb-12">
        <h1 className="mb-2 max-w-[22ch] text-[clamp(26px,3.6vw,38px)] font-semibold text-ink">{tripText(lang, 'heroTitle')}</h1>
        <p className="mb-5 max-w-[58ch] text-ink-2">{tripText(lang, 'heroSub')}</p>
        {staff && (
          <p className="mb-4 inline-flex items-center gap-2 rounded-pill bg-brand-tint px-3 py-1.5 text-sm font-medium text-brand-on-tint" data-testid="staff-chip">
            <UserCog className="size-4" aria-hidden />
            {tripText(lang, 'staffMode')}
          </p>
        )}
        {!json ? (
          <ErrorRetry message={`${tripText(lang, 'catalogErrTitle')} · ${tripText(lang, 'catalogErrBody')}`} retryLabel={tripText(lang, 'retry')} onRetry={() => router.refresh()} />
        ) : !catalog || catalog.places.length === 0 ? (
          <EmptyState message={`${tripText(lang, 'catalogEmptyTitle')} · ${tripText(lang, 'catalogEmptyBody')}`} />
        ) : (
          // keyed by the prefill so following a "?places=" link on this page starts that trip
          <Builder key={prefill.join(',')} catalog={catalog} json={json} today={today} prefill={prefill} />
        )}
      </main>
    </div>
  );
}

function Builder({ catalog, json, today, prefill }: { catalog: Catalog; json: PublicCatalogJson; today: string; prefill: string[] }) {
  const { lang } = useLang();
  const [state, setState] = useState<BuilderState>(() => {
    if (prefill.length === 0 && carried && carried.date >= today && catalog.places.some((p) => p.id === carried!.pickupId)) return carried;
    return applyPrefill(catalog, initialState(catalog, json.templates, today), prefill);
  });
  useEffect(() => {
    carried = state;
  }, [state]);
  const [resetKey, setResetKey] = useState(0);
  const m = useMemo(() => buildModel(catalog, state, lang), [catalog, state, lang]);

  const patch = useCallback((p: Partial<BuilderState>) => setState((s) => ({ ...s, ...p })), []);
  const dwellOf = useCallback((id: string) => catalog.places.find((p) => p.id === id)?.default_dwell_min ?? 60, [catalog]);

  const toggle = useCallback((id: string) => setState((s) => toggleStop(s, id, dwellOf(id))), [dwellOf]);
  const onPax = useCallback(
    (n: number) => {
      const out = paxChange(catalog, state, n);
      setState(out.state);
      if (out.switchedTo) {
        const v = catalog.rules.vehicles[out.switchedTo];
        toast.info(tripText(lang, 'autoVeh', { n, v: lang === 'en' ? v.name_en : v.name_th }));
      }
    },
    [catalog, state, lang],
  );
  const addAt = useCallback(
    (id: string, index: number) =>
      setState((s) => {
        const stops = [...s.stops];
        stops.splice(index, 0, { placeId: id, dwell: dwellOf(id) });
        return { ...s, stops };
      }),
    [dwellOf],
  );

  const sel = m.mode ? m.res.modes[m.mode] : null;
  const barTotal = m.quote ? (m.res.best ? m.res.modes[m.res.best].total : 0) : (sel?.total ?? 0);

  return (
    <>
      <TemplateRow templates={json.templates} lang={lang} onPick={(tpl) => setState((s) => applyTemplate(catalog, s, tpl))} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="panel" aria-labelledby="map-title">
          <div className="panel-head">
            <MapIcon className="size-4" aria-hidden />
            <span id="map-title">{tripText(lang, 'mapTitle')}</span>
          </div>
          <TripMap catalog={catalog} state={state} onToggle={toggle} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line-soft px-4 py-2.5 text-xs text-ink-2">
            <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-ink" />{tripText(lang, 'legStart')}</span>
            <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-brand-solid" />{tripText(lang, 'legStop')}</span>
            <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-surface ring-2 ring-brand" />{tripText(lang, 'legMtn')}</span>
            <span>
              {catalog.rules.zones
                .filter((z) => z.max_km !== null)
                .map((z) => `${tripText(lang, 'zone')} ${z.id} ≤ ${z.max_km} ${tripText(lang, 'km')}`)
                .join(' · ')}
            </span>
          </div>
          <PlaceList m={m} onCat={(cat) => patch({ cat })} onToggle={toggle} />
        </section>

        <div className="space-y-4" key={resetKey}>
          <TripPanel
            m={m}
            today={today}
            onPatch={patch}
            onPax={onPax}
            onMove={(i, d) => setState((s) => ({ ...s, stops: moveStop(s.stops, i, d) }))}
            onDwell={(i, v) => setState((s) => ({ ...s, stops: s.stops.map((x, k) => (k === i ? { ...x, dwell: v } : x)) }))}
            onRemove={toggle}
          />
          <SuggestPanel m={m} onAdd={addAt} />
          <PricePanel m={m} onPick={(mode: Mode) => patch({ mode })} />
          <BookingPanel m={m} onReset={() => setResetKey((k) => k + 1)} />
        </div>
      </div>

      {/* phone: price + next step stay in reach, above the bottom tab bar */}
      {m.state.stops.length > 0 && barTotal > 0 && (
        <div className="fixed inset-x-0 z-20 border-t border-line bg-surface lg:hidden" style={{ bottom: 'var(--public-bottom-h, 0px)' }} data-testid="sticky-bar">
          <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="num-display tnum text-lg text-ink">{baht(barTotal)}</div>
              <div className="truncate text-xs text-muted-token">{m.quote ? tripText(lang, 'refTotalNote') : `${tripText(lang, 'depositDue')} ${baht(depositFor(catalog, barTotal))}`}</div>
            </div>
            <a href="#booking" className="btn-primary">
              {m.quote ? tripText(lang, 'reqQuote') : tripText(lang, 'stInfo')}
            </a>
          </div>
        </div>
      )}
    </>
  );
}
