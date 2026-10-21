'use client';

import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { tripText } from '@/lib/copy/trip';
import { bahtDelta, formatDuration } from '@/lib/format';
import { suggestAlongRoute } from '@/lib/pricing';
import { nameOf, type Model } from './model';

/** "แวะรายทาง": places near the route with the detour and the price change worked out */
export function SuggestPanel({ m, onAdd }: { m: Model; onAdd: (placeId: string, index: number) => void }) {
  const { catalog, lang, input, mode } = m;
  const rows = useMemo(() => suggestAlongRoute(catalog, input, mode), [catalog, input, mode]);
  return (
    <section className="panel" aria-labelledby="sug-title">
      <div className="panel-head">
        <span id="sug-title">{tripText(lang, 'sugTitle')}</span>
        <span className="ml-auto text-xs font-normal text-muted-token">{tripText(lang, 'sugSub')}</span>
      </div>
      {m.state.stops.length === 0 || rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-token">{tripText(lang, 'sugNone')}</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {rows.map((s) => (
            <li key={s.place.id} className="flex items-center gap-3 px-4 py-2.5" data-suggest={s.place.slug}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">
                  {nameOf(s.place, lang)}
                  {s.place.is_mountain ? ' ▲' : ''}
                </div>
                <div className="text-xs text-muted-token">
                  {tripText(lang, 'sugDetour', { k: Math.round(s.detourKm), m: formatDuration(Math.max(0, s.addedMinutes), lang) })} · {tripText(lang, 'zone')} {s.zone}
                </div>
              </div>
              <span className={`tnum text-sm font-semibold ${s.delta > 0 ? 'text-urgent' : 'text-status-done'}`}>{bahtDelta(s.delta)}</span>
              <button type="button" aria-label={`${tripText(lang, 'sugAdd')}: ${nameOf(s.place, lang)}`} onClick={() => onAdd(s.place.id, s.index)} className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-canvas transition-opacity hover:opacity-85">
                <Plus className="size-5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
