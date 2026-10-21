'use client';

import { Check, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { CATEGORY_LABEL } from '@/lib/copy/common';
import { tripText } from '@/lib/copy/trip';
import { bahtDelta } from '@/lib/format';
import { whatIfAdd, whatIfRemove, zoneOf, type TripTemplate } from '@/lib/pricing';
import { nameOf, type Model } from './model';

export function TemplateRow({ templates, lang, onPick }: { templates: TripTemplate[]; lang: 'th' | 'en'; onPick: (t: TripTemplate) => void }) {
  if (!templates.length) return <p className="mb-4 text-sm text-muted-token">{tripText(lang, 'noTemplates')}</p>;
  return (
    <div className="no-scrollbar -mx-4 mb-4 flex gap-2.5 overflow-x-auto px-4" role="list" aria-label={tripText(lang, 'tplTitle')}>
      {templates.map((t) => (
        <button
          key={t.id}
          type="button"
          role="listitem"
          onClick={() => onPick(t)}
          className="flex min-h-[56px] shrink-0 flex-col items-start rounded-md border border-line bg-surface px-4 py-2 text-left transition-colors hover:border-ink"
        >
          <b className="text-sm font-semibold text-ink">{lang === 'en' ? t.name_en : t.name_th}</b>
          <span className="text-xs text-muted-token">{lang === 'en' ? t.sub_en : t.sub_th}</span>
        </button>
      ))}
    </div>
  );
}

export function PlaceList({ m, onCat, onToggle }: { m: Model; onCat: (c: string) => void; onToggle: (id: string) => void }) {
  const { catalog, lang, state, input, mode } = m;
  const cats = useMemo(() => {
    const present = new Set(catalog.places.filter((p) => p.category !== 'pickup').map((p) => p.category));
    return (Object.keys(CATEGORY_LABEL) as Array<keyof typeof CATEGORY_LABEL>).filter((c) => c !== 'pickup' && present.has(c));
  }, [catalog]);

  const rows = useMemo(
    () =>
      catalog.places
        .filter((p) => p.category !== 'pickup' && (state.cat === 'all' || p.category === state.cat))
        .map((p) => {
          const idx = input.stops.findIndex((s) => s.placeId === p.id);
          const delta = idx >= 0 ? whatIfRemove(catalog, input, idx, mode) : p.id === input.pickupId ? 0 : whatIfAdd(catalog, input, p, mode).delta;
          return { p, sel: idx >= 0, delta, zone: zoneOf(catalog, p) };
        }),
    [catalog, input, mode, state.cat],
  );

  return (
    <div className="border-t border-line-soft">
      <div className="flex flex-wrap gap-2 px-4 py-3" role="group" aria-label={tripText(lang, 'tplTitle')}>
        {(['all', ...cats] as const).map((c) => (
          <button key={c} type="button" className="pill min-h-[44px]" aria-pressed={state.cat === c} onClick={() => onCat(c)}>
            {c === 'all' ? tripText(lang, 'catAll') : CATEGORY_LABEL[c][lang]}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-token">{tripText(lang, 'noPlaces')}</p>
      ) : (
        <ul className="grid gap-2 px-4 pb-4 sm:grid-cols-2">
          {rows.map(({ p, sel, delta, zone }) => (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={sel}
                data-place={p.slug}
                onClick={() => onToggle(p.id)}
                className={`flex min-h-[48px] w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${sel ? 'border-brand bg-brand-tint' : 'border-line bg-surface hover:border-ink'}`}
              >
                {sel ? <Check className="size-4 shrink-0 text-brand" aria-hidden /> : <Plus className="size-4 shrink-0 text-ink-2" aria-hidden />}
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{nameOf(p, lang)}</span>
                <span className="chip shrink-0 bg-surface-2 text-ink-2 ring-line">
                  {tripText(lang, 'zone')} {zone}
                  {p.is_mountain ? ' ▲' : ''}
                </span>
                <span className={`tnum shrink-0 text-sm font-semibold ${delta > 0 ? 'text-urgent' : delta < 0 ? 'text-status-done' : 'text-muted-token'}`}>{bahtDelta(delta)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
