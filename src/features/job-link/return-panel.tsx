'use client';

import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useLang } from '@/components/public/lang';
import { Skeleton } from '@/components/ui/states';
import { ErrorRetry } from '@/components/ui/error-retry';
import { baht, formatDuration, formatTripDate, todayInBangkok } from '@/lib/format';
import { jt, jobErrorText } from '@/lib/copy/job';
import { addDays, returnQuote, type Catalog } from '@/lib/pricing';
import { callJob, useCatalog } from './job-client';
import { name, outboundInput, returnOfferState, type JobModel } from './model';
import { withOfferPct } from './return-map';
import { BusyButton, Panel, useJt } from './parts';

/** the return-trip offer: open → form, booked → confirmation, dismissed / expired / none → nothing */
export function ReturnOffer({ job, token, onChanged }: { job: JobModel; token: string; onChanged: () => void }) {
  const o = job.returnOffer;
  const { lang } = useLang();
  const t = useJt();
  const cat = useCatalog();
  if (!o) return null;
  const state = returnOfferState(o, todayInBangkok());

  if (state === 'booked') {
    return (
      <Panel>
        <div className="py-2 text-center" data-testid="return-booked">
          <span className="mx-auto mb-2 grid size-11 place-items-center rounded-full bg-status-done-bg text-status-done">
            <Check className="size-5" aria-hidden />
          </span>
          <h2 className="text-lg font-semibold">{t('retDoneTitle')}</h2>
          <p className="mx-auto mt-1 max-w-[44ch] text-sm text-muted-token">{t('retDoneSub', { id: o.returnBookingNo ?? '' })}</p>
        </div>
      </Panel>
    );
  }
  if (state !== 'open') return null;

  if (cat.isPending) {
    return (
      <Panel>
        <div className="space-y-3" aria-busy data-testid="return-loading">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Panel>
    );
  }
  if (cat.isError || !cat.data) return <ErrorRetry onRetry={() => cat.refetch()} message={jt('loadFail', lang)} retryLabel={jt('retry', lang)} />;

  const fromPlace = cat.data.catalog.places.find((p) => p.id === o.fromId);
  const from = fromPlace ? name({ nameTh: fromPlace.name_th, nameEn: fromPlace.name_en }, lang) : '';
  return <ReturnForm job={job} token={token} onChanged={onChanged} catalog={withOfferPct(cat.data.catalog, o.discountPct)} fromName={from} />;
}

function ReturnForm({ job, token, onChanged, catalog, fromName }: { job: JobModel; token: string; onChanged: () => void; catalog: Catalog; fromName: string }) {
  const { lang } = useLang();
  const t = useJt();
  const o = job.returnOffer!;
  const dests = useMemo(() => catalog.places.filter((p) => p.is_pickup && p.id !== o.fromId), [catalog, o.fromId]);
  const [toId, setToId] = useState<string>(() => dests.find((p) => p.id === job.pickup.id)?.id ?? dests[0]?.id ?? '');
  const [date, setDate] = useState(() => addDays(job.travelDate, catalog.rules.return_offer.default_days));
  const [time, setTime] = useState('10:00');
  const [busy, setBusy] = useState<'book' | 'later' | null>(null);

  const rq = useMemo(
    () => (toId && /^\d{2}:\d{2}$/.test(time) ? returnQuote(catalog, outboundInput(job), { fromId: o.fromId, toId, date, time }) : null),
    [catalog, job, o.fromId, toId, date, time],
  );
  const dateOk = date >= job.travelDate;
  const priced = rq && rq.total > 0 && dateOk;

  async function book() {
    setBusy('book');
    try {
      const res = await fetch(`/api/jobs/${token}/return`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toId, date, time }),
      });
      const body = (await res.json().catch(() => null)) as { bookingNo?: string; error?: { code: string; message: string } } | null;
      if (!res.ok) {
        toast.error(body?.error?.message ?? jt('genericError', lang));
        return;
      }
      toast.success(t('retBooked', { id: body?.bookingNo ?? '' }));
      onChanged();
    } catch {
      toast.error(jt('genericError', lang));
    } finally {
      setBusy(null);
    }
  }

  async function later() {
    setBusy('later');
    const { error } = await callJob('job_return_dismiss', { p_token: token });
    setBusy(null);
    if (error) {
      toast.error(jobErrorText(error, lang));
      return;
    }
    toast.success(t('retDismissed'));
    onChanged();
  }

  const to = catalog.places.find((p) => p.id === toId);
  return (
    <section data-testid="return-offer">
      <div className="panel border-brand-solid">
        <div className="panel-head">
          <h2 className="font-heading text-sm font-semibold">{t('retTitle', { from: fromName })}</h2>
          <span className="ml-auto text-xs font-normal text-muted-token">{t('retValid', { d: formatTripDate(o.validUntil, lang) })}</span>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-sm text-muted-token">{t('retSub')}</p>
          <div>
            <div className="mb-1.5 text-sm text-muted-token">{t('retTo')}</div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('retTo')}>
              {dests.map((p) => (
                <button key={p.id} type="button" aria-pressed={toId === p.id} onClick={() => setToId(p.id)} className="pill min-h-11">
                  {name({ nameTh: p.name_th, nameEn: p.name_en }, lang)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="label-base">{t('retDate')}</span>
              <input className="input-base" type="date" value={date} min={job.travelDate} onChange={(e) => setDate(e.target.value || date)} />
            </label>
            <label>
              <span className="label-base">{t('retTime')}</span>
              <input className="input-base" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value || time)} />
            </label>
          </div>
          <div className="space-y-1.5 border-t border-line-soft pt-3 text-sm" data-testid="return-price">
            {priced && rq ? (
              <>
                <div className="text-muted-token">
                  {fromName} → {to ? name({ nameTh: to.name_th, nameEn: to.name_en }, lang) : ''} ·{' '}
                  {t('retRoute', { km: Math.round(rq.plan.km), h: formatDuration(rq.plan.totalMinutes, lang) })}
                </div>
                <PriceRow label={t('retBase')} value={baht(rq.base)} testid="return-base" />
                <PriceRow label={t('retDisc', { p: o.discountPct })} value={`− ${baht(rq.discount)}`} tone="done" testid="return-discount" />
                <PriceRow label={t('retTotal')} value={baht(rq.total)} strong testid="return-total" />
                <PriceRow label={t('retDepositLine', { d: baht(rq.deposit) })} value="" />
              </>
            ) : (
              <p className="text-muted-token">{t('retNoPrice')}</p>
            )}
          </div>
        </div>
      </div>
      <div className="sticky bottom-[var(--public-bottom-h,0px)] z-20 -mx-4 flex flex-wrap gap-2 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-lg lg:static lg:border-0 lg:bg-transparent lg:px-0">
        <BusyButton className="btn-primary flex-1" busy={busy === 'book'} disabled={!priced || busy !== null} onClick={book}>
          {t('retConfirm', { d: rq ? rq.deposit.toLocaleString('en-US') : '0' })}
        </BusyButton>
        <BusyButton className="btn-secondary" busy={busy === 'later'} disabled={busy !== null} onClick={later}>
          {t('retLater')}
        </BusyButton>
      </div>
    </section>
  );
}

function PriceRow({ label, value, strong, tone, testid }: { label: string; value: string; strong?: boolean; tone?: 'done'; testid?: string }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'border-t border-line-soft pt-1.5 font-semibold' : ''} ${tone === 'done' ? 'text-status-done' : ''}`}>
      <span>{label}</span>
      <span className="tnum" data-testid={testid}>
        {value}
      </span>
    </div>
  );
}
