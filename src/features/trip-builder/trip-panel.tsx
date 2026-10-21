'use client';

import { AlertTriangle, ArrowDown, ArrowUp, Clock, Home, MapPin, X } from 'lucide-react';
import { formatClock, whatIfRemove } from '@/lib/pricing';
import { tripText, type TripKey } from '@/lib/copy/trip';
import { bahtDelta, formatTripDate } from '@/lib/format';
import { nameOf, type Model } from './model';
import { maxSeats, pickupPlaces, type BuilderState } from './state';

const DWELLS = [0, 30, 45, 60, 90, 120, 150, 180];
const hours = (min: number) => (min / 60).toFixed(1).replace(/\.0$/, '');

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label-base">{label}</span>
      {children}
    </label>
  );
}

interface Props {
  m: Model;
  today: string;
  onPatch: (p: Partial<BuilderState>) => void;
  onPax: (n: number) => void;
  onMove: (i: number, d: -1 | 1) => void;
  onDwell: (i: number, v: number) => void;
  onRemove: (placeId: string) => void;
}

export function TripPanel({ m, today, onPatch, onPax, onMove, onDwell, onRemove }: Props) {
  const { catalog, lang, state, plan, input, mode, warnings } = m;
  const t = (k: TripKey, v: Record<string, string | number> = {}) => tripText(lang, k, v);
  const r = catalog.rules;
  const pickup = catalog.places.find((p) => p.id === state.pickupId);
  const vehicleName = (k: string) => (lang === 'en' ? r.vehicles[k]?.name_en : r.vehicles[k]?.name_th) ?? k;
  const seats = maxSeats(catalog);

  return (
    <section className="panel" aria-labelledby="trip-title">
      <div className="panel-head">
        <MapPin className="size-4" aria-hidden />
        <span id="trip-title">{t('tripTitle')}</span>
        <span className="ml-auto text-xs font-normal text-muted-token">{formatTripDate(state.date, lang)}</span>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('fDate')}>
            <input className="input-base" type="date" min={today} value={state.date} onChange={(e) => e.target.value && onPatch({ date: e.target.value })} />
          </Field>
          <Field label={t('fTime')}>
            <input className="input-base" type="time" step={900} value={state.time} onChange={(e) => e.target.value && onPatch({ time: e.target.value })} />
          </Field>
          <Field label={t('fPax')}>
            <select className="input-base" value={state.pax} onChange={(e) => onPax(Number(e.target.value))}>
              {Array.from({ length: seats }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('fVehicle')}>
            <select className="input-base" value={state.vehicle} onChange={(e) => onPatch({ vehicle: e.target.value })}>
              {Object.entries(r.vehicles)
                .sort((a, b) => a[1].sort - b[1].sort)
                .map(([k]) => (
                  <option key={k} value={k}>
                    {vehicleName(k)}
                  </option>
                ))}
            </select>
          </Field>
          <div className="col-span-2">
            <Field label={t('fPickup')}>
              <select className="input-base" value={state.pickupId} onChange={(e) => onPatch({ pickupId: e.target.value })}>
                {pickupPlaces(catalog).map((p) => (
                  <option key={p.id} value={p.id}>
                    {nameOf(p, lang)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <ol className="mt-4 divide-y divide-line-soft" aria-label={t('tripTitle')}>
          <li className="flex items-center gap-3 py-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-canvas">
              <MapPin className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">{pickup ? nameOf(pickup, lang) : ''}</div>
              <div className="tnum text-xs text-muted-token">
                {t('start')} {state.time}
              </div>
            </div>
          </li>
          {state.stops.length === 0 && <li className="py-6 text-center text-sm text-muted-token">{t('noStops')}</li>}
          {plan.legs.map((L, i) => (
            <li key={`${L.to.id}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5" data-stop={L.to.slug}>
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-solid text-xs font-semibold text-on-brand">{i + 1}</span>
              <div className="min-w-0 flex-1 basis-40">
                <div className="truncate text-sm font-semibold text-ink">{nameOf(L.to, lang)}</div>
                <div className="tnum text-xs text-muted-token">
                  {formatClock(L.arrive)}–{formatClock(L.depart)} · {t('drive')} {Math.round(L.minutes)} {t('min')} · {Math.round(L.km)} {t('km')}{' '}
                  <span className={`chip ${L.measured ? 'bg-status-done-bg text-status-done ring-status-done-ring' : 'bg-surface-2 text-ink-2 ring-line'}`}>{L.measured ? t('measured') : t('estimated')}</span>
                  {' · '}
                  {t('zone')} {L.zone}
                  {L.to.is_mountain ? ' ▲' : ''}
                  {' · '}
                  <span className="font-medium">{t('removeDelta', { d: bahtDelta(whatIfRemove(catalog, input, i, mode)) })}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <select
                  className="input-base !w-auto !min-h-[44px] !py-1 text-sm"
                  aria-label={`${t('stay')} ${nameOf(L.to, lang)}`}
                  value={DWELLS.includes(L.dwell) ? L.dwell : String(L.dwell)}
                  onChange={(e) => onDwell(i, Number(e.target.value))}
                >
                  {!DWELLS.includes(L.dwell) && <option value={L.dwell}>{`${t('stay')} ${L.dwell} ${t('min')}`}</option>}
                  {DWELLS.map((d) => (
                    <option key={d} value={d}>
                      {d ? `${t('stay')} ${d} ${t('min')}` : t('dropOnly')}
                    </option>
                  ))}
                </select>
                <IconBtn label={t('up')} disabled={i === 0} onClick={() => onMove(i, -1)} icon={<ArrowUp className="size-4" />} />
                <IconBtn label={t('down')} disabled={i === state.stops.length - 1} onClick={() => onMove(i, 1)} icon={<ArrowDown className="size-4" />} />
                <IconBtn label={`${t('remove')} ${nameOf(L.to, lang)}`} onClick={() => onRemove(L.to.id)} icon={<X className="size-4" />} />
              </div>
            </li>
          ))}
          {plan.ret && (
            <li className="flex items-center gap-3 py-2.5" data-testid="return-leg">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-canvas">
                <Home className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{t('back')}</div>
                <div className="tnum text-xs text-muted-token">
                  {formatClock(plan.ret.arrive)} · {Math.round(plan.ret.minutes)} {t('min')} · {Math.round(plan.ret.km)} {t('km')}{' '}
                  <span className={`chip ${plan.ret.measured ? 'bg-status-done-bg text-status-done ring-status-done-ring' : 'bg-surface-2 text-ink-2 ring-line'}`}>{plan.ret.measured ? t('measured') : t('estimated')}</span>
                </div>
              </div>
            </li>
          )}
        </ol>

        <div className="mt-2 space-y-1">
          <Check label={t('optReturn')} checked={state.roundTrip} onChange={(v) => onPatch({ roundTrip: v })} />
          <Check label={t('optLang', { fee: r.lang_driver_fee })} checked={state.langDriver} onChange={(v) => onPatch({ langDriver: v })} />
          <Check label={t('optSeason', { pct: r.season_pct })} checked={state.festival} onChange={(v) => onPatch({ festival: v })} />
        </div>

        {state.stops.length > 0 && (
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center" data-testid="totals">
            <Total n={`${Math.round(plan.km)} ${t('km')}`} l={t('tKm')} />
            <Total n={`${hours(plan.driveMinutes)} ${t('hr')}`} l={t('tDrive')} />
            <Total n={`${hours(plan.totalMinutes)} ${t('hr')}`} l={`${t('tTotal')} · ${t('endAt')} ${formatClock(plan.end)}`} />
          </dl>
        )}

        <div className="mt-3 space-y-2" aria-live="polite">
          {warnings.map((w) => {
            const bad = w.kind !== 'tight_day';
            const text =
              w.kind === 'too_many_pax'
                ? t('warnPax', { n: w.pax, s: w.seats, v: vehicleName(state.vehicle) })
                : w.kind === 'over_day'
                  ? t('warnLong', { h: hours(w.hours * 60), m: w.max })
                  : t('warnTight', { h: hours(w.hours * 60) });
            return (
              <p key={w.kind} role="alert" data-warning={w.kind} className={`flex items-start gap-2 rounded-sm px-3 py-2 text-sm ${bad ? 'bg-urgent-bg text-urgent' : 'bg-status-pending-bg text-status-pending'}`}>
                {bad ? <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />}
                <span>{text}</span>
              </p>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function IconBtn({ label, icon, onClick, disabled }: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid size-11 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-35">
      {icon}
    </button>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-ink-2">
      <input type="checkbox" className="size-5 shrink-0 accent-[var(--brand-solid)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Total({ n, l }: { n: string; l: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-2 py-2.5">
      <dd className="num-display tnum text-lg text-ink">{n}</dd>
      <dt className="text-xs text-muted-token">{l}</dt>
    </div>
  );
}
