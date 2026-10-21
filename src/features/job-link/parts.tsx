'use client';

import { Check, Copy, Loader2, UserPlus } from 'lucide-react';
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { useLang } from '@/components/public/lang';
import { STATUS_LABEL, priceLineText } from '@/lib/copy/common';
import { jt, type JobCopyKey } from '@/lib/copy/job';
import { baht, formatDeadline, formatDuration, formatTripDate, TZ_NOTE } from '@/lib/format';
import type { BookingStatus } from '@/lib/contracts/common';
import { isQuoteFlow, name, plannedArrivals, stepperFor, tripTotals, type JobModel, type Lang } from './model';

/** translate with the page language: const t = useJt(); t('jlTitle') */
export function useJt() {
  const { lang } = useLang();
  return (key: JobCopyKey, vars: Record<string, string | number> = {}) => jt(key, lang, vars);
}

/** a button that disables itself and shows a spinner while `busy` */
export function BusyButton({
  busy,
  children,
  className = 'btn-primary',
  ...rest
}: { busy?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest} disabled={busy || rest.disabled} aria-busy={busy || undefined} className={`${className} min-h-11`}>
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Panel({ title, right, children, id }: { title?: ReactNode; right?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="panel" id={id}>
      {title ? (
        <div className="panel-head">
          <h2 className="font-heading text-sm font-semibold">{title}</h2>
          {right ? <span className="ml-auto text-xs font-normal text-muted-token">{right}</span> : null}
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function useVehicleName(vehicleKey: string, vehicles: Record<string, { name_th: string; name_en: string }> | undefined, lang: Lang) {
  const v = vehicles?.[vehicleKey];
  return v ? (lang === 'en' ? v.name_en : v.name_th) : vehicleKey;
}

export function HeaderCard({ job, vehicle, showRule }: { job: JobModel; vehicle: string; showRule?: boolean }) {
  const { lang } = useLang();
  const t = useJt();
  const label = STATUS_LABEL[job.status as BookingStatus];
  const stepper = stepperFor(job.status, isQuoteFlow(job));
  return (
    <section className="panel">
      <div className="p-4">
        <div className="mb-3.5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">
              {t('jlTitle')} · <span data-testid="booking-no">{job.bookingNo}</span>
            </h1>
            <p className="mt-1 text-sm text-muted-token">
              {formatTripDate(job.travelDate, lang)} · {t('start')} {job.pickupTime} ({TZ_NOTE[lang]}) · {name(job.pickup, lang)} · {vehicle} · {t('pax', { n: job.pax })}
            </p>
            {showRule ? <p className="mt-0.5 text-xs text-muted-token">{t('jlRule', { v: job.ruleVersion })}</p> : null}
          </div>
          {label ? (
            <span data-testid="status-badge">
              <Badge tone={label.tone}>{label[lang]}</Badge>
            </span>
          ) : null}
        </div>
        {stepper ? (
          <ol className="grid auto-cols-fr grid-flow-col gap-1.5" aria-label="steps">
            {stepper.keys.map((k, i) => (
              <li
                key={k}
                data-state={stepper.states[i]}
                aria-current={stepper.states[i] === 'now' ? 'step' : undefined}
                className={`rounded-sm px-1 py-2 text-center text-xs leading-4 ${
                  stepper.states[i] === 'done'
                    ? 'bg-status-done-bg font-semibold text-status-done'
                    : stepper.states[i] === 'now'
                      ? 'bg-brand-tint font-semibold text-brand-on-tint ring-1 ring-brand-tint-strong'
                      : 'bg-surface-2 text-muted-token'
                }`}
              >
                {stepper.states[i] === 'done' ? <Check className="mx-auto mb-0.5 size-3.5" aria-hidden /> : null}
                {t(k)}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  );
}

export function PlateChip({ plate }: { plate: string }) {
  return (
    <span
      data-testid="plate"
      className="inline-block shrink-0 rounded-sm border-2 border-ink bg-surface px-2.5 py-1 font-heading text-base font-semibold tracking-wide text-ink"
    >
      {plate}
    </span>
  );
}

export function CopyButton({ text }: { text: string }) {
  const t = useJt();
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      toast.success(t('jlCopied'));
      setTimeout(() => setDone(false), 2000);
    } catch {
      toast.error(t('jlCopyFail'));
    }
  }
  return (
    <button type="button" onClick={copy} className="btn-ghost min-h-11 border border-line">
      {done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {done ? t('jlCopied') : t('jlCopy')}
    </button>
  );
}

export function DriverCard({ job }: { job: JobModel }) {
  const { lang } = useLang();
  const t = useJt();
  const d = job.driver;
  return (
    <Panel title={t('jlDriver')}>
      {d ? (
        <div data-testid="driver-card">
          <div className="flex items-start gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-tint font-heading font-semibold text-brand-on-tint" aria-hidden>
              {d.nickname.slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">
                {lang === 'en' ? d.nameEn || d.nickname : d.nickname} <span className="text-sm font-normal text-muted-token">· {d.fullName}</span>
              </div>
              <div className="text-sm text-muted-token">
                {lang === 'en' ? d.carEn : d.carTh} · ★ {d.rating} · {t('years', { n: d.years })}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(lang === 'en' ? d.langsEn : d.langs).map((l) => (
                  <span key={l} className="pill py-0.5 text-xs">
                    {l}
                  </span>
                ))}
              </div>
            </div>
            <PlateChip plate={d.plate} />
          </div>
          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            <span className="text-sm text-muted-token">{t('jlContact')}</span>
            <span data-testid="driver-phone" className="select-all font-heading text-base font-semibold tnum">
              {d.phone}
            </span>
            <CopyButton text={d.phone} />
            {d.lineId ? <span className="pill text-xs">LINE {d.lineId}</span> : null}
          </div>
        </div>
      ) : (
        <div className="px-2 py-4 text-center text-sm text-muted-token" data-testid="driver-waiting">
          <UserPlus className="mx-auto mb-2 size-6" aria-hidden />
          <p className="mx-auto max-w-[46ch]">{t('jlWaiting')}</p>
        </div>
      )}
    </Panel>
  );
}

export function ItineraryPanel({ job, renderStopExtra }: { job: JobModel; renderStopExtra?: (seq: number) => ReactNode }) {
  const { lang } = useLang();
  const t = useJt();
  const arrivals = plannedArrivals(job.pickupTime, job.stops);
  const totals = tripTotals(job.stops);
  const summary = job.stops.length ? `${totals.km} ${t('km')} · ${formatDuration(totals.minutes, lang)}` : null;
  return (
    <Panel title={t('jlItin')} right={summary}>
      <ol className="space-y-0" data-testid="itinerary">
        <Row time={job.pickupTime} title={name(job.pickup, lang)} sub={t('start')} start />
        {job.stops.map((s, i) => (
          <Row
            key={s.seq}
            time={arrivals[i]}
            title={`${i + 1}. ${name(s, lang)}`}
            sub={`${s.dwell ? `${t('stay')} ${s.dwell} ${t('min')} · ` : ''}${t('drive')} ${Math.round(s.plannedMinutes)} ${t('min')} · ${Math.round(s.plannedKm)} ${t('km')}`}
          >
            {renderStopExtra?.(s.seq)}
          </Row>
        ))}
        {job.roundTrip && job.stops.length ? <Row time={job.returnArrive ?? '—'} title={t('back')} start /> : null}
      </ol>
      {!job.stops.length ? <p className="text-sm text-muted-token">{t('jlNoStops')}</p> : null}
    </Panel>
  );
}

function Row({ time, title, sub, start, children }: { time: string; title: string; sub?: string; start?: boolean; children?: ReactNode }) {
  return (
    <li className="group grid grid-cols-[3.25rem_1rem_1fr] gap-x-2.5 pb-3.5 last:pb-0">
      <span className="tnum pt-0.5 text-sm font-semibold text-ink">{time}</span>
      <span className="relative flex justify-center" aria-hidden>
        <span className="absolute top-2 bottom-[-14px] w-px bg-line group-last:hidden" />
        <i className={`relative mt-1.5 size-2.5 rounded-full ${start ? 'bg-brand-solid' : 'border-2 border-brand-solid bg-surface'}`} />
      </span>
      <div className="min-w-0">
        <div className="font-medium">{title}</div>
        {sub ? <div className="text-sm text-muted-token">{sub}</div> : null}
        {children}
      </div>
    </li>
  );
}

export function PricePanel({ job }: { job: JobModel }) {
  const { lang } = useLang();
  const t = useJt();
  // a quoted booking is priced by staff: one line, whatever the reference lines say
  const lines = job.quote && isQuoteFlow(job) ? [{ key: 'price.quote', vars: {}, amount: job.quote.price }] : job.priceLines;
  const afterDeposit = job.paid > 0;
  return (
    <Panel title={t('jlPrice')} right={t('jlRule', { v: job.ruleVersion })}>
      <div className="space-y-1.5 text-sm" data-testid="price-lines">
        {lines.map((l, i) => (
          <Line key={`${l.key}-${i}`} label={priceLineText(l.key, l.vars, lang)} amount={l.amount} />
        ))}
        <Line label={t('lTotal')} amount={job.total} strong />
        {afterDeposit ? (
          <>
            <Line label={t('jlPaid')} amount={-job.paid} tone="done" />
            <Line label={t('jlRest')} amount={Math.max(0, job.total - job.paid)} strong />
          </>
        ) : job.status === 'quoted' && job.quote ? (
          <Line label={t('jlDue', { t: job.quote.deadline ? deadlineClock(job.quote.deadline, lang) : '—' })} amount={job.quote.deposit} strong />
        ) : (
          <p className="pt-1 text-muted-token">{t('refPrice')}</p>
        )}
      </div>
    </Panel>
  );
}

export const deadlineClock = (iso: string, lang: 'th' | 'en') => formatDeadline(iso, lang);

function Line({ label, amount, strong, tone }: { label: string; amount: number; strong?: boolean; tone?: 'done' }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? 'border-t border-line-soft pt-1.5 font-semibold' : ''} ${tone === 'done' ? 'text-status-done' : ''}`}>
      <span className="min-w-0">{label}</span>
      <span className="tnum shrink-0">{amount < 0 ? `− ${baht(-amount)}` : baht(amount)}</span>
    </div>
  );
}
