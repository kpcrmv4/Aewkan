'use client';

import { Clock3, TimerOff } from 'lucide-react';
import { useLang } from '@/components/public/lang';
import { baht } from '@/lib/format';
import { formatRemain, quoteState, remainingMs, type JobModel } from './model';
import { deadlineClock, useJt } from './parts';

/** quote stage before the deposit: waiting / quoted with a live countdown / expired */
export function QuoteBox({ job, now }: { job: JobModel; now: number }) {
  const t = useJt();
  const { lang } = useLang();
  const state = quoteState(job, now);
  if (!state) return null;

  if (state === 'requested') {
    return (
      <section className="panel" data-testid="quote-requested">
        <div className="px-4 py-6 text-center">
          <span className="mx-auto mb-2 grid size-11 place-items-center rounded-full bg-status-progress-bg text-status-progress">
            <Clock3 className="size-5" aria-hidden />
          </span>
          <h2 className="text-lg font-semibold">{t('qrOkTitle')}</h2>
          <p className="mx-auto mt-1 max-w-[42ch] text-sm text-muted-token">{t('qrOkSub')}</p>
        </div>
      </section>
    );
  }

  if (state === 'expired') {
    return (
      <section className="panel border-urgent-ring bg-urgent-bg text-urgent" data-testid="quote-expired">
        <div className="flex items-start gap-3 p-4">
          <TimerOff className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <h2 className="text-base font-semibold">{t('expiredTitle')}</h2>
            <p className="mt-1 text-sm">{t('expiredSub')}</p>
          </div>
        </div>
      </section>
    );
  }

  const q = job.quote!;
  const rem = q.deadline ? remainingMs(q.deadline, now) : 0;
  return (
    <section className="rounded-lg bg-hl p-4 text-hl-ink shadow-e1" data-testid="quote-box">
      <div className="text-sm opacity-85">{t('quoteTitle')}</div>
      <div className="mt-1.5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="num-display text-3xl" data-testid="quote-price">
            {baht(q.price)}
          </div>
          <div className="text-sm">{t('quoteTotal')} · {t('quoteDepositDue', { d: baht(q.deposit) })}</div>
        </div>
        <div className="text-right">
          <div className="num-display text-3xl" data-testid="quote-countdown" role="timer" aria-live="off">
            {formatRemain(rem)}
          </div>
          <div className="text-sm">{t('quoteDeadline', { t: q.deadline ? deadlineClock(q.deadline, lang) : '—' })}</div>
        </div>
      </div>
      {q.message ? <p className="mt-3 text-sm">{q.message}</p> : null}
    </section>
  );
}
