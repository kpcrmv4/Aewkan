'use client';

import { Check, Flag, Play } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useLang } from '@/components/public/lang';
import { jobErrorText } from '@/lib/copy/job';
import { baht, formatTime } from '@/lib/format';
import { CommissionChip, CommissionPanel } from './commission-panel';
import { callJob } from './job-client';
import { defaultCash, latestPhoto, type JobModel } from './model';
import { HideNav } from './orchestrator-hooks';
import { BusyButton, HeaderCard, ItineraryPanel, Panel, PricePanel, useJt } from './parts';
import { PhotoSlot } from './photo-slot';

/** audience `driver`: customer card, work panel by status, check-ins, commission. Primary actions sit in a sticky bottom bar. */
export function DriverView({ job, token, vehicle, refresh }: { job: JobModel; token: string; vehicle: string; refresh: () => Promise<void> }) {
  const { lang } = useLang();
  const t = useJt();
  const [busy, setBusy] = useState<string | null>(null);
  const [cash, setCash] = useState<string>(() => String(defaultCash(job.total, job.paid)));

  const pickup = latestPhoto(job.photos, 'pickup');
  const dropoff = latestPhoto(job.photos, 'dropoff');
  const c = job.customer;

  async function run(key: string, fn: () => Promise<{ error: string | null }>, ok?: string) {
    setBusy(key);
    try {
      const { error } = await fn();
      if (error) {
        toast.error(jobErrorText(error, lang));
        await refresh();
        return;
      }
      if (ok) toast.success(ok);
      await refresh();
    } catch {
      toast.error(jobErrorText(null, lang));
    } finally {
      setBusy(null);
    }
  }

  const start = () => run('start', () => callJob('job_start', { p_token: token }), pickup ? t('pickedAt', { t: formatTime(pickup.takenAt) }) : undefined);
  const checkin = (seq: number) => run(`check-${seq}`, () => callJob('job_checkin', { p_token: token, p_seq: seq }));

  async function finish() {
    const n = Number(cash);
    if (cash.trim() === '' || !Number.isFinite(n) || n < 0) {
      toast.error(jobErrorText('cash_required', lang));
      return;
    }
    await run(
      'finish',
      async () => {
        // flat-rate commissions need no input: record them so the admin report is complete (best effort)
        for (const s of job.stops) {
          if (s.commission && s.commission.type !== 'sale' && !s.report) {
            await callJob('job_commission', { p_token: token, p_seq: s.seq, p_sale: null });
          }
        }
        return callJob('job_finish', { p_token: token, p_cash: Math.round(n) });
      },
      t('dvDoneTitle'),
    );
  }

  const uploaded = async () => {
    await refresh();
  };

  let work: ReactNode = null;
  let bar: ReactNode = null;
  if (job.status === 'assigned') {
    work = (
      <Panel title={t('dvStart')}>
        <PhotoSlot kind="pickup" bookingId={job.bookingId} token={token} photo={pickup} onUploaded={uploaded} />
      </Panel>
    );
    bar = (
      <BusyButton className="btn-primary w-full" busy={busy === 'start'} disabled={!pickup || busy !== null} onClick={start} data-testid="btn-start">
        <Play className="size-4" aria-hidden />
        {pickup ? t('dvConfirmStart') : t('dvNeedPhoto')}
      </BusyButton>
    );
  } else if (job.status === 'traveling') {
    work = (
      <Panel title={t('dvFinish')} right={job.startedAt ? t('dvStarted', { t: formatTime(job.startedAt) }) : null}>
        <PhotoSlot kind="dropoff" bookingId={job.bookingId} token={token} photo={dropoff} onUploaded={uploaded} />
        <label className="mt-3.5 block max-w-[260px]">
          <span className="label-base">{t('dvCollected')}</span>
          <input
            className="input-base tnum"
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            data-testid="cash-input"
          />
        </label>
      </Panel>
    );
    bar = (
      <BusyButton className="btn-primary w-full" busy={busy === 'finish'} disabled={!dropoff || busy !== null} onClick={finish} data-testid="btn-finish">
        <Flag className="size-4" aria-hidden />
        {dropoff ? t('dvClose') : t('dvNeedPhoto')}
      </BusyButton>
    );
  } else if (job.status === 'done') {
    work = (
      <Panel>
        <div className="py-2 text-center" data-testid="driver-done">
          <span className="mx-auto mb-2 grid size-11 place-items-center rounded-full bg-status-done-bg text-status-done">
            <Check className="size-5" aria-hidden />
          </span>
          <h2 className="text-lg font-semibold">{t('dvDoneTitle')}</h2>
          <p className="mx-auto mt-1 max-w-[44ch] text-sm text-muted-token">{t('dvDoneSub', { id: job.bookingNo })}</p>
        </div>
        <div className="mt-3 grid gap-3.5 sm:grid-cols-2">
          {pickup ? (
            <div>
              <PhotoSlot kind="pickup" bookingId={job.bookingId} token={token} photo={pickup} onUploaded={uploaded} readOnly />
              <div className="mt-1 text-sm" data-testid="done-pickup-time">{t('pickedAt', { t: formatTime(pickup.takenAt) })}</div>
            </div>
          ) : null}
          {dropoff ? (
            <div>
              <PhotoSlot kind="dropoff" bookingId={job.bookingId} token={token} photo={dropoff} onUploaded={uploaded} readOnly />
              <div className="mt-1 text-sm" data-testid="done-dropoff-time">{t('droppedAt', { t: formatTime(dropoff.takenAt) })}</div>
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex justify-between border-t border-line-soft pt-3 font-semibold">
          <span>{t('dvCollected')}</span>
          <span className="tnum" data-testid="done-cash">{baht(job.cashCollected ?? 0)}</span>
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-4" data-testid="driver-view">
      <HideNav />
      <HeaderCard job={job} vehicle={vehicle} />
      {work}
      {c ? (
        <Panel title={t('dvCust')}>
          <div className="flex items-start gap-3.5" data-testid="customer-card">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-tint font-heading font-semibold text-brand-on-tint" aria-hidden>
              {c.name.slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <div className="text-base font-semibold">{c.name}</div>
              <div className="text-muted-token">
                <span className="select-all">{c.contact}</span> · {t('pax', { n: job.pax })} · {job.langDriver ? t('dvLangNeed') : t('dvLangThai')}
              </div>
              {c.hotel ? <div className="mt-1"><span className="text-muted-token">{t('dvHotel')}: </span>{c.hotel}</div> : null}
              {c.note ? <div className="mt-1"><span className="text-muted-token">{t('dvNote')}: </span>{c.note}</div> : null}
            </div>
          </div>
        </Panel>
      ) : null}
      <ItineraryPanel
        job={job}
        renderStopExtra={(seq) => {
          const s = job.stops.find((x) => x.seq === seq)!;
          return (
            <div className="flex flex-wrap items-center gap-2">
              <CommissionChip stop={s} />
              {job.status === 'traveling' ? (
                <BusyButton
                  className="btn-secondary btn-sm mt-1.5"
                  busy={busy === `check-${seq}`}
                  disabled={busy !== null || Boolean(s.checkedInAt)}
                  onClick={() => checkin(seq)}
                  data-testid={`btn-checkin-${seq}`}
                >
                  {s.checkedInAt ? <Check className="size-4" aria-hidden /> : null}
                  {s.checkedInAt ? t('dvCheckedAt', { t: formatTime(s.checkedInAt) }) : t('dvCheck')}
                </BusyButton>
              ) : null}
            </div>
          );
        }}
      />
      <CommissionPanel job={job} token={token} canReport={job.status === 'traveling' || job.status === 'done'} onChanged={refresh} />
      <PricePanel job={job} />
      {bar ? (
        <div
          className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-canvas/95 px-4 pt-3 backdrop-blur"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
          data-testid="driver-action-bar"
        >
          {bar}
        </div>
      ) : null}
    </div>
  );
}
