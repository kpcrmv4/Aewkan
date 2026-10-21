'use client';

import { CircleAlert, Clock3, CreditCard, Download, Loader2, Upload, Wallet } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useLang } from '@/components/public/lang';
import { ErrorRetry } from '@/components/ui/error-retry';
import type { PayInfoJson } from '@/lib/contracts/payment';
import { payErrorText, pt, type PayCopyKey } from '@/lib/copy/pay';
import { baht, formatDeadline } from '@/lib/format';
import { formatPromptPayId, promptPayPayload } from '@/lib/integrations/promptpay';
import { SlipError, startCheckout, uploadSlip, usePayInfo, verifySlip } from './pay-client';

export interface PayDepositProps {
  /** the raw customer job-link token from the URL */
  token: string;
  /** booking status from the job view — refetches when it changes */
  status: string;
  /** re-read the job view after a payment step (useJob().refresh) */
  onChanged?: () => void;
}

/**
 * Deposit panel for the customer job link: PromptPay QR + slip upload (works with the
 * publishable key only), card / e-wallet checkout when Stripe or Beam is set up, and the
 * "received, checking" / "not accepted" states. Renders nothing when no deposit is due.
 */
export function PayDeposit({ token, status, onChanged }: PayDepositProps) {
  const { lang } = useLang();
  const t = (k: PayCopyKey, v: Record<string, string | number> = {}) => pt(k, lang, v);
  const returning = useReturnFromCheckout();
  // after a card checkout, poll (≈1 min) until the webhook has confirmed the deposit
  const q = usePayInfo(token, status, { pollMs: returning ? 3000 : undefined, maxPolls: 20 });
  const info = q.data;

  // back from Stripe / Beam: once the webhook confirmed it, refresh the job view
  const wasOpen = useRef<boolean | null>(null);
  useEffect(() => {
    if (!info) return;
    if (wasOpen.current === true && !info.open) onChanged?.();
    wasOpen.current = info.open;
  }, [info, onChanged]);

  if (q.isPending) return <PaySkeleton />;
  if (q.isError) return <ErrorRetry onRetry={() => void q.refetch()} message={t('loadFail')} retryLabel={t('retry')} />;
  if (!info || !info.open || info.due <= 0) return null;

  const reviewing = info.status === 'deposit_review' && info.slip && (info.slip.status === 'pending' || info.slip.status === 'verifying');
  const rejected = !reviewing && info.slip?.status === 'failed';

  return (
    <section className="panel" data-testid="pay-deposit" aria-labelledby="pay-title">
      <div className="panel-head flex-wrap">
        <Wallet className="size-4" aria-hidden />
        <h2 id="pay-title" className="font-heading text-sm font-semibold" data-testid="pay-title">
          {t('payTitle', { d: baht(info.due) })}
        </h2>
        {info.deadline ? (
          <span className="ml-auto text-xs font-normal text-muted-token" data-testid="pay-deadline">
            {t('payBy', { t: formatDeadline(info.deadline, lang) })}
          </span>
        ) : null}
      </div>
      <div className="space-y-4 p-4">
        {returning ? (
          <Notice tone="progress" icon={<Loader2 className="size-5 animate-spin" aria-hidden />} title={t('returnPaid')} testId="pay-returning" />
        ) : null}
        {reviewing ? (
          <Notice
            tone="progress"
            icon={<Clock3 className="size-5" aria-hidden />}
            title={t('slipReviewTitle')}
            sub={t('slipReviewSub', { t: formatDeadline(info.slip!.uploaded_at, lang) })}
            testId="slip-review"
          />
        ) : null}
        {rejected ? (
          <Notice
            tone="urgent"
            icon={<CircleAlert className="size-5" aria-hidden />}
            title={t('slipRejectedTitle')}
            sub={`${info.slip?.note ? `${t('slipReason', { r: info.slip.note })} · ` : ''}${t('slipRejectedSub')}`}
            testId="slip-rejected"
          />
        ) : null}
        {!reviewing ? <p className="text-sm text-muted-token">{t('paySub')}</p> : null}

        {info.promptpay ? (
          reviewing ? (
            <ReplaceSlip label={t('slipReplace')}>
              <PromptPayBlock info={info} token={token} onChanged={onChanged} refetch={() => void q.refetch()} />
            </ReplaceSlip>
          ) : (
            <PromptPayBlock info={info} token={token} onChanged={onChanged} refetch={() => void q.refetch()} />
          )
        ) : null}

        {!reviewing && (info.stripe || info.beam) ? <CardButtons token={token} info={info} /> : null}

        {!reviewing && !info.promptpay && !info.stripe && !info.beam ? (
          <p className="rounded-md bg-surface-2 px-3 py-3 text-sm text-ink-2" data-testid="pay-no-method">
            {t('noMethod')}
          </p>
        ) : null}
      </div>
    </section>
  );
}

const noSubscribe = () => () => undefined;

/** back from Stripe / Beam (?paid=stripe|beam) — read on the client only, false while server-rendering */
function useReturnFromCheckout(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => /[?&]paid=(stripe|beam)(&|$)/.test(window.location.search),
    () => false,
  );
}

function Notice({ tone, icon, title, sub, testId }: { tone: 'progress' | 'urgent' | 'done'; icon: ReactNode; title: string; sub?: string; testId?: string }) {
  const cls =
    tone === 'urgent'
      ? 'border-urgent-ring bg-urgent-bg text-urgent'
      : tone === 'done'
        ? 'border-status-done-ring bg-status-done-bg text-status-done'
        : 'border-status-progress-ring bg-status-progress-bg text-status-progress';
  return (
    <div className={`flex items-start gap-3 rounded-md border p-3 ${cls}`} data-testid={testId} role="status">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {sub ? <p className="mt-0.5 text-sm">{sub}</p> : null}
      </div>
    </div>
  );
}

function ReplaceSlip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group rounded-md border border-line">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-ink-2">
        <Upload className="size-4" aria-hidden />
        {label}
      </summary>
      <div className="border-t border-line-soft p-3">{children}</div>
    </details>
  );
}

function PromptPayBlock({ info, token, onChanged, refetch }: { info: PayInfoJson; token: string; onChanged?: () => void; refetch: () => void }) {
  const { lang } = useLang();
  const t = (k: PayCopyKey, v: Record<string, string | number> = {}) => pt(k, lang, v);
  const pp = info.promptpay!;
  const [qr, setQr] = useState<{ payload: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const payload = useMemo(() => {
    try {
      return promptPayPayload(pp.id, info.due);
    } catch {
      return null;
    }
  }, [pp.id, info.due]);

  useEffect(() => {
    if (!payload) return;
    let live = true;
    QRCode.toDataURL(payload, { margin: 1, width: 288, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (live) setQr({ payload, url });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [payload]);
  const qrUrl = qr && qr.payload === payload ? qr.url : null;

  async function onFile(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    try {
      await uploadSlip(token, info.booking_id, file);
      toast.success(t('slipSent'));
      refetch();
      onChanged?.();
      // check right away when a provider is set up; 503 = staff will check, nothing to tell
      const v = await verifySlip(token);
      if (v.ok && v.data.result === 'paid') {
        toast.success(t('slipAutoOk'));
        onChanged?.();
        refetch();
      }
    } catch (e) {
      const code = e instanceof SlipError ? e.code : 'upload';
      toast.error(code === 'not_image' ? t('notImage') : code === 'too_big' ? t('tooBig') : payErrorText(code, lang));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start" data-testid="promptpay">
      {/* the QR image carries its own light quiet zone, so it scans in dark mode too */}
      <div className="mx-auto w-full max-w-[240px] rounded-md border border-line bg-surface p-2 sm:mx-0">
        {qrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a generated data: URL, nothing to optimise
          <img src={qrUrl} alt={t('qrAlt', { d: baht(info.due) })} className="block aspect-square w-full" data-testid="promptpay-qr" />
        ) : (
          <div className="aspect-square w-full animate-pulse rounded-xs bg-line-soft" aria-hidden />
        )}
      </div>
      <div className="min-w-0 space-y-2">
        <h3 className="font-semibold">{t('qrTitle')}</h3>
        <p className="num-display text-2xl" data-testid="promptpay-amount">
          {baht(info.due)}
        </p>
        <p className="text-sm text-ink-2" data-testid="promptpay-id">
          {t('qrAccount', { id: formatPromptPayId(pp.id) })}
          {pp.name ? ` · ${pp.name}` : ''}
        </p>
        <p className="text-sm text-muted-token">{t('qrStep')}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <label className={`btn-primary min-h-11 cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`} aria-busy={busy || undefined}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
            {busy ? t('slipUploading') : t('slipUpload')}
            <input
              ref={input}
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={busy}
              data-testid="slip-input"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
          {qrUrl ? (
            <a href={qrUrl} download={`aewkan-${info.booking_no}-promptpay.png`} className="btn-ghost min-h-11 border border-line">
              <Download className="size-4" aria-hidden />
              {t('qrSave')}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CardButtons({ token, info }: { token: string; info: PayInfoJson }) {
  const { lang } = useLang();
  const t = (k: PayCopyKey) => pt(k, lang);
  const [busy, setBusy] = useState<'stripe' | 'beam' | null>(null);

  async function go(method: 'stripe' | 'beam') {
    if (busy) return;
    setBusy(method);
    const r = await startCheckout(token, method);
    if (r.ok) {
      toast.message(t('redirecting'));
      window.location.assign(r.data.url);
      return; // keep the spinner while the browser leaves
    }
    toast.error(payErrorText(r.code, lang));
    setBusy(null);
  }

  return (
    <div className="space-y-2 border-t border-line-soft pt-4" data-testid="pay-card">
      <p className="text-sm font-medium text-ink-2">{t('cardTitle')}</p>
      <div className="flex flex-wrap gap-2">
        {info.stripe ? (
          <button type="button" className="btn-secondary min-h-11" disabled={busy !== null} aria-busy={busy === 'stripe' || undefined} onClick={() => void go('stripe')} data-testid="pay-stripe">
            {busy === 'stripe' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CreditCard className="size-4" aria-hidden />}
            {t('payStripe')}
          </button>
        ) : null}
        {info.beam ? (
          <button type="button" className="btn-secondary min-h-11" disabled={busy !== null} aria-busy={busy === 'beam' || undefined} onClick={() => void go('beam')} data-testid="pay-beam">
            {busy === 'beam' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wallet className="size-4" aria-hidden />}
            {t('payBeam')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PaySkeleton() {
  return (
    <section className="panel" aria-busy="true" data-testid="pay-skeleton">
      <div className="panel-head">
        <span className="h-4 w-40 animate-pulse rounded-xs bg-line-soft" />
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-[240px_minmax(0,1fr)]">
        <div className="mx-auto aspect-square w-full max-w-[240px] animate-pulse rounded-md bg-line-soft" />
        <div className="space-y-2">
          <div className="h-4 w-1/2 animate-pulse rounded-xs bg-line-soft" />
          <div className="h-7 w-1/3 animate-pulse rounded-xs bg-line-soft" />
          <div className="h-4 w-2/3 animate-pulse rounded-xs bg-line-soft" />
          <div className="h-11 w-44 animate-pulse rounded-pill bg-line-soft" />
        </div>
      </div>
    </section>
  );
}
