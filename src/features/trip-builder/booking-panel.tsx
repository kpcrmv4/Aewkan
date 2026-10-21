'use client';

import { Check, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { tripText, CHANNEL_KEY, type TripKey } from '@/lib/copy/trip';
import type { CreateBookingResponse } from '@/lib/contracts/booking';
import { rememberTrip } from '@/lib/my-trips';
import { baht, formatTripDate } from '@/lib/format';
import { depositFor } from '@/lib/pricing';
import { buildRequest, EMPTY_CONTACT, tripTitle, validateContact, type ContactErrors, type ContactForm } from './booking-request';
import { bookable, type Model } from './model';

type Step = 'trip' | 'info' | 'done';

const CHANNELS = Object.keys(CHANNEL_KEY) as Array<keyof typeof CHANNEL_KEY>;

export function BookingPanel({ m, onReset }: { m: Model; onReset: () => void }) {
  const { lang, quote, res, mode, catalog } = m;
  const router = useRouter();
  const t = (k: TripKey, v: Record<string, string | number> = {}) => tripText(lang, k, v);
  const [step, setStep] = useState<Step>('trip');
  const [form, setForm] = useState<ContactForm>(EMPTY_CONTACT);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ r: CreateBookingResponse; date: string; time: string } | null>(null);

  const sel = mode ? res.modes[mode] : null;
  const total = quote ? (res.best ? res.modes[res.best].total : 0) : (sel?.total ?? 0);
  const deposit = depositFor(catalog, total);
  const ok = bookable(m);
  const isEmail = form.channel === 'email';
  const set = <K extends keyof ContactForm>(k: K, v: ContactForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    const errs = validateContact(form);
    setErrors(errs);
    if (errs.name || errs.contact) return;
    const body = buildRequest(m, form);
    if (!body) return;
    setPending(true);
    try {
      const resp = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await resp.json().catch(() => null)) as (CreateBookingResponse & { error?: { code: string; message: string } }) | null;
      if (resp.ok && data && !data.error) {
        setDone({ r: data, date: m.state.date, time: m.state.time });
        setStep('done');
        rememberTrip({ token: data.customerPath.replace(/^\/j\//, ''), bookingNo: data.bookingNo, travelDate: m.state.date, title: tripTitle(m) });
        return;
      }
      const code = data?.error?.code;
      if (code === 'rule_changed' || code === 'price_changed') {
        toast.error(t(code === 'rule_changed' ? 'errRuleChanged' : 'errPriceChanged'));
        setStep('trip');
        router.refresh();
      } else if (code === 'server_not_configured' || data?.error?.message) {
        toast.error(data?.error?.message ?? t('errGeneric'));
      } else {
        toast.error(t('errGeneric'));
      }
    } catch {
      toast.error(t('errNetwork'));
    } finally {
      setPending(false);
    }
  }

  const stepLabels: Array<[Step, TripKey]> = [
    ['trip', 'stTrip'],
    ['info', 'stInfo'],
    ['done', 'stDone'],
  ];
  const at = stepLabels.findIndex(([s]) => s === step);

  return (
    <section className="panel" id="booking" aria-label={t('stInfo')}>
      <div className="p-4">
        <ol className="mb-4 grid grid-cols-3 gap-1.5 text-center text-xs" aria-label="steps">
          {stepLabels.map(([s, k], i) => (
            <li key={s} aria-current={i === at ? 'step' : undefined} className={`rounded-pill px-2 py-1.5 font-medium ${i === at ? 'bg-ink text-canvas' : i < at ? 'bg-status-done-bg text-status-done' : 'bg-surface-2 text-muted-token'}`}>
              {t(k)}
            </li>
          ))}
        </ol>

        {step === 'trip' && (
          <div>
            <button type="button" className="btn-primary w-full" disabled={!ok} onClick={() => setStep('info')} data-testid="book-start">
              {quote ? t('reqQuote') : t('book', { d: deposit.toLocaleString('en-US') })}
            </button>
            <p className="mt-2 text-center text-sm text-muted-token">{quote ? t('reqQuoteSub') : t('bookSub')}</p>
          </div>
        )}

        {step === 'info' && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label-base" htmlFor="bk-name">
                  {t('sName')}
                </label>
                <input id="bk-name" className="input-base" autoComplete="name" value={form.name} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'bk-name-err' : undefined} placeholder={t('phName')} onChange={(e) => set('name', e.target.value)} />
                {errors.name && (
                  <p id="bk-name-err" className="mt-1 text-sm text-urgent">
                    {t('errName')}
                  </p>
                )}
              </div>
              <div>
                <label className="label-base" htmlFor="bk-channel">
                  {t('fChannel')}
                </label>
                <select id="bk-channel" className="input-base" value={form.channel} onChange={(e) => set('channel', e.target.value as ContactForm['channel'])}>
                  {CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {t(CHANNEL_KEY[c])}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-base" htmlFor="bk-contact">
                  {t('sContact')}
                </label>
                <input
                  id="bk-contact"
                  className="input-base"
                  type={isEmail ? 'email' : 'text'}
                  inputMode={isEmail ? 'email' : undefined}
                  autoComplete={isEmail ? 'email' : undefined}
                  value={form.contact}
                  aria-invalid={Boolean(errors.contact)}
                  aria-describedby={errors.contact ? 'bk-contact-err' : isEmail ? 'bk-contact-hint' : undefined}
                  placeholder={t(isEmail ? 'phEmail' : 'phContact')}
                  onChange={(e) => set('contact', e.target.value)}
                />
                {isEmail && !errors.contact && (
                  <p id="bk-contact-hint" className="mt-1 text-sm text-muted-token" data-testid="email-hint">
                    {t('emailHint')}
                  </p>
                )}
                {errors.contact && (
                  <p id="bk-contact-err" className="mt-1 text-sm text-urgent">
                    {t(isEmail ? 'errEmail' : 'errContact')}
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="label-base" htmlFor="bk-hotel">
                  {t('sHotel')}
                </label>
                <input id="bk-hotel" className="input-base" value={form.hotel} placeholder={t('phHotel')} onChange={(e) => set('hotel', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="label-base" htmlFor="bk-note">
                  {t('sNote')}
                </label>
                <input id="bk-note" className="input-base" value={form.note} placeholder={t('phNote')} onChange={(e) => set('note', e.target.value)} />
              </div>
            </div>
            {quote && (
              <div className="mt-3">
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-ink-2">
                  <input type="checkbox" className="size-5 accent-[var(--brand-solid)]" checked={form.pushOptIn} onChange={(e) => set('pushOptIn', e.target.checked)} />
                  <span>{t('pushOpt')}</span>
                </label>
                <p className="ml-8 text-sm text-muted-token">{t('pushFallback')}</p>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn-secondary" disabled={pending} onClick={() => setStep('trip')}>
                {t('backStep')}
              </button>
              <button type="submit" className="btn-primary flex-1" disabled={pending || !ok} data-testid="book-submit">
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {pending ? t('submitting') : quote ? t('reqQuote') : t('book', { d: deposit.toLocaleString('en-US') })}
              </button>
            </div>
          </form>
        )}

        {step === 'done' && done && (
          <div className="text-center" data-testid="book-success">
            <div className="mx-auto mb-2 grid size-12 place-items-center rounded-full bg-status-done-bg text-status-done">
              <Check className="size-6" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold text-ink">{done.r.status === 'quote_requested' ? t('qrOkTitle') : t('okTitle')}</h2>
            <p className="mx-auto mt-1 max-w-[40ch] text-sm text-ink-2">{done.r.status === 'quote_requested' ? t('qrOkSub') : t('okSub', { c: t(CHANNEL_KEY[form.channel]) })}</p>
            <dl className="mx-auto my-4 inline-grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-left text-sm">
              <dt className="text-muted-token">{t('bookingNo')}</dt>
              <dd className="tnum font-semibold text-ink" data-testid="booking-no">
                {done.r.bookingNo}
              </dd>
              <dt className="text-muted-token">{t('fDate')}</dt>
              <dd className="text-ink">
                {formatTripDate(done.date, lang)} · {done.time}
              </dd>
              {done.r.deposit !== null && (
                <>
                  <dt className="text-muted-token">{t('depositDue')}</dt>
                  <dd className="tnum font-semibold text-ink" data-testid="booking-deposit">
                    {baht(done.r.deposit)}
                  </dd>
                </>
              )}
            </dl>
            {done.r.deposit !== null && <p className="mb-3 text-sm text-muted-token">{t('payByLink')}</p>}
            <div className="flex flex-col items-center gap-2">
              <Link href={done.r.customerPath} className="btn-primary" data-testid="open-job-link">
                {t('openLink')}
              </Link>
              <button type="button" className="btn-ghost" onClick={() => { setStep('trip'); setDone(null); onReset(); }}>
                {t('newTrip')}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
