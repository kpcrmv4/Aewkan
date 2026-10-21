'use client';

import { Bell, Coins } from 'lucide-react';
import { MODE_LABEL, priceLineText } from '@/lib/copy/common';
import { tripText, type TripKey } from '@/lib/copy/trip';
import { baht } from '@/lib/format';
import { depositFor, MODES, type Mode, type NotOkReason } from '@/lib/pricing';
import type { Model } from './model';

const REASON_KEY: Record<NotOkReason, TripKey> = { needs_one_way: 'naReturn', needs_far_zone: 'naZone', no_stops: 'noReason' };

export function PricePanel({ m, onPick }: { m: Model; onPick: (mode: Mode) => void }) {
  const { catalog, lang, res, mode, plan, state } = m;
  const r = catalog.rules;
  const t = (k: TripKey, v: Record<string, string | number> = {}) => tripText(lang, k, v);
  const sel = mode ? res.modes[mode] : null;
  const reason = lang === 'en' ? r.quote.reason_en : r.quote.reason_th;

  const why = (k: Mode): string => {
    const p = res.modes[k];
    if (k === 'hourly') return t('whyHourly', { m: r.min_hours, h: p.units });
    if (k === 'daily') return t('whyDaily', { h: r.daily_inc_hours, k: r.daily_inc_km, d: p.units });
    if (k === 'trip') return t('whyTrip');
    return plan.emptyReturnMinutes > 0 ? `${t('whyOneway')} · ${t('inclReturn')}` : t('whyOneway');
  };

  return (
    <section className="panel" aria-labelledby="price-title">
      <div className="panel-head">
        <Coins className="size-4" aria-hidden />
        <span id="price-title">{m.quote ? t('refTitle') : t('priceTitle')}</span>
        <span className="ml-auto text-xs font-normal text-muted-token">{t('jlRule', { v: `v${catalog.ruleVersion}` })}</span>
      </div>
      <div className="p-4">
        {m.quote && (
          <div role="note" data-testid="quote-banner" className="mb-3 flex items-start gap-2.5 rounded-md bg-urgent-bg px-3.5 py-3 text-sm text-urgent">
            <Bell className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <b>{t('quoteOn')}</b> · {reason}
              <br />
              {t('quoteBanner')}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          {MODES.map((k) => {
            const p = res.modes[k];
            const on = k === mode;
            return (
              <button
                key={k}
                type="button"
                data-mode={k}
                disabled={!p.ok}
                aria-pressed={on}
                onClick={() => onPick(k)}
                className={`relative min-h-[96px] rounded-md border-[1.5px] px-3 pb-3 pt-4 text-left transition-colors disabled:cursor-not-allowed ${
                  on ? 'border-ink bg-ink text-canvas' : p.ok ? 'border-line bg-surface text-ink hover:border-ink' : 'border-line-soft bg-surface-2 text-muted-token'
                }`}
              >
                {res.best === k && <span className="absolute -top-2.5 right-2.5 rounded-pill bg-hl px-2 py-0.5 text-[11px] font-bold text-hl-ink ring-1 ring-line">{t('best')}</span>}
                <div className="text-sm font-semibold">{MODE_LABEL[k][lang]}</div>
                <div className="num-display tnum mt-0.5 text-xl">{p.ok ? baht(p.total) : '—'}</div>
                <div className={`mt-1 text-xs ${on ? 'text-canvas/80' : 'text-muted-token'}`}>{p.ok ? why(k) : p.reason ? t(REASON_KEY[p.reason]) : t('na')}</div>
              </button>
            );
          })}
        </div>

        {sel && state.stops.length > 0 && (
          <div className="mt-4 divide-y divide-line-soft border-t border-line-soft" data-testid="price-lines">
            {sel.lines.map((l, i) => (
              <div key={`${l.key}-${i}`} className="flex justify-between gap-3 py-2 text-sm text-ink-2">
                <span>{priceLineText(l.key, l.vars, lang)}</span>
                <span className="tnum shrink-0">{baht(l.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-3 py-2.5 text-base font-semibold text-ink" data-testid="price-total">
              <span>{t('lTotal')}</span>
              <span className="num-display tnum shrink-0">{baht(sel.total)}</span>
            </div>
            {m.quote ? (
              <div className="py-2 text-sm text-muted-token">{t('refPrice')}</div>
            ) : (
              <div className="flex justify-between gap-3 py-2 text-sm text-ink-2" data-testid="price-deposit">
                <span>{t('lDeposit', { p: r.deposit_pct })}</span>
                <span className="tnum shrink-0 font-semibold">{baht(depositFor(catalog, sel.total))}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
