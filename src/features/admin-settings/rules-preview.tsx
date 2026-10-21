'use client';

import { useMemo } from 'react';
import { baht, bahtDelta } from '@/lib/format';
import { PRICING_COPY as C } from '@/lib/copy/settings';
import { MODE_LABEL } from '@/lib/copy/common';
import type { Catalog, Rules } from '@/lib/pricing';
import { priceSample, sampleTrips } from './preview-model';

/** sample trips priced with the saved rules next to the draft, client-side with the same engine the server uses */
export function RulesPreview({ catalog, draft }: { catalog: Catalog; draft: Rules }) {
  const trips = useMemo(() => sampleTrips(catalog), [catalog]);
  return (
    <section className="panel" data-testid="rules-preview">
      <div className="panel-head">{C.preview.title}</div>
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-token">{C.preview.sub}</p>
        {trips.length === 0 ? (
          <p className="text-sm text-muted-token">{C.preview.none}</p>
        ) : (
          trips.map((t) => {
            const cur = priceSample(catalog, catalog.rules, t.input);
            const dr = priceSample(catalog, draft, t.input);
            const delta = cur && dr ? dr.total - cur.total : null;
            const vehicle = catalog.rules.vehicles[t.input.vehicle];
            return (
              <div key={t.key} className="space-y-1.5 rounded-sm border border-line-soft p-3" data-testid={`sample-${t.key}`}>
                <div className="text-sm font-semibold text-ink">{C.preview.trips[t.key]}</div>
                <div className="text-xs text-muted-token">
                  {vehicle?.name_th ?? t.input.vehicle} · {C.preview.pax(t.input.pax)}
                </div>
                <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-ink-2">
                    {C.preview.current}
                    {cur ? <span className="text-muted-token"> · {MODE_LABEL[cur.mode].th}</span> : null}
                  </dt>
                  <dd className="num-display tnum" data-testid={`sample-${t.key}-current`}>
                    {cur ? baht(cur.total) : C.preview.failed}
                  </dd>
                  <dt className="text-ink-2">
                    {C.preview.draft}
                    {dr ? <span className="text-muted-token"> · {MODE_LABEL[dr.mode].th}</span> : null}
                  </dt>
                  <dd className="num-display tnum" data-testid={`sample-${t.key}-draft`}>
                    {dr ? baht(dr.total) : C.preview.failed}
                  </dd>
                  <dt className="text-ink-2">{C.preview.diff}</dt>
                  <dd className={`tnum font-semibold ${delta && delta > 0 ? 'text-urgent' : delta && delta < 0 ? 'text-status-done' : 'text-muted-token'}`} data-testid={`sample-${t.key}-delta`}>
                    {delta === null ? '—' : bahtDelta(delta)}
                  </dd>
                </dl>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
