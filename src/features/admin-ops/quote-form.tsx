'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { QUOTES_COPY as C } from '@/lib/copy/admin';
import { baht, formatTime } from '@/lib/format';
import { postJson } from './api-client';
import { depositFromRules, type DepositRule } from './helpers';

export const QUOTE_HOURS = [1, 2, 3, 6, 12, 24] as const;

export interface QuoteDefaults {
  price: number;
  deposit: number;
  hours: number;
  message: string | null;
}

export function QuoteForm({
  bookingId,
  resend,
  pushOptIn,
  defaults,
  depositRule,
  tripTitle,
  dateLabel,
}: {
  bookingId: string;
  resend: boolean;
  pushOptIn: boolean;
  defaults: QuoteDefaults;
  depositRule: DepositRule;
  tripTitle: string;
  dateLabel: string;
}) {
  const router = useRouter();
  const [price, setPrice] = useState(String(defaults.price));
  const [deposit, setDeposit] = useState(String(defaults.deposit));
  const [depositTouched, setDepositTouched] = useState(false);
  const [hours, setHours] = useState(defaults.hours);
  const [message, setMessage] = useState(defaults.message);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(t);
  }, [hours]);

  const p = Number(price) || 0;
  const d = Number(deposit) || 0;
  const text = message ?? C.defaultMessage(tripTitle, dateLabel, baht(p), baht(d), hours);
  const error = p <= 0 ? C.priceRequired : d > p ? C.depositOverPrice : null;

  async function send() {
    if (busy || error) return;
    setBusy(true);
    const res = await postJson('/api/admin/quotes/send', { bookingId, price: p, deposit: d, hours, message: text });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(C.sent(baht(p)));
    router.refresh();
  }

  return (
    <section className="panel">
      <div className="panel-head">{C.formHead}</div>
      <div className="space-y-3 px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label-base">{C.price}</span>
            <input
              className="input-base tnum"
              type="number"
              inputMode="numeric"
              step={100}
              min={0}
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                if (!depositTouched) setDeposit(String(depositFromRules(Number(e.target.value) || 0, depositRule)));
              }}
            />
          </label>
          <label className="block">
            <span className="label-base">{C.deposit}</span>
            <input
              className="input-base tnum"
              type="number"
              inputMode="numeric"
              step={100}
              min={0}
              value={deposit}
              onChange={(e) => {
                setDeposit(e.target.value);
                setDepositTouched(true);
              }}
            />
          </label>
          <label className="block">
            <span className="label-base">{C.hours}</span>
            <select className="input-base" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {QUOTE_HOURS.map((h) => (
                <option key={h} value={h}>
                  {C.hoursOption(h)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="label-base">{C.message}</span>
          <textarea className="input-base min-h-28" value={text} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
        </label>

        <div>
          <div className="mb-1.5 text-sm text-muted-token">{C.previewHead(pushOptIn ? C.previewPush : C.previewLine)}</div>
          <div className="rounded-lg border border-line bg-surface-2 p-3 text-sm" data-testid="quote-preview">
            <div className="font-semibold">{C.previewTitle}</div>
            <div className="tnum">{C.previewBody(baht(p), baht(d))}</div>
            <div className="text-muted-token">{now ? C.previewDeadline(formatTime(now + hours * 3_600_000)) : ' '}</div>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-urgent">
            {error}
          </p>
        )}
        <button type="button" className="btn-primary w-full min-h-11" onClick={send} disabled={busy || Boolean(error)}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {resend ? C.resend : C.send}
        </button>
        <p className="text-sm text-muted-token">{C.footnote}</p>
      </div>
    </section>
  );
}
