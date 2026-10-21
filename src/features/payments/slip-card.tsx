import { ExternalLink, ImageOff } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/features/admin-ops/status-badge';
import { PAYMENTS_COPY as C, VERIFY_REASON } from '@/lib/copy/pay';
import { baht, formatTime, formatTripDate } from '@/lib/format';
import { ReviewActions } from './review-actions';

export interface SlipRow {
  id: string;
  amount: number;
  status: string;
  slip_path: string | null;
  verify_result: unknown;
  updated_at: string;
  booking: { id: string; booking_no: string; customer_name: string; status: string } | null;
}

interface Check {
  result?: string;
  reason?: string;
  facts?: { amount?: number | null; transRef?: string | null; receiverName?: string | null } | null;
}

export const stamp = (iso: string) => `${formatTripDate(new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }), 'th', { shortYear: true })} ${formatTime(iso)}`;

/** one slip waiting for review: preview through a signed URL, due vs slip amount, auto-check result, actions */
export function SlipCard({ row, url, canReview }: { row: SlipRow; url: string | null; canReview: boolean }) {
  const vr = (row.verify_result ?? {}) as { check?: Check; replaced?: unknown[] };
  const check = vr.check;
  const replaced = Array.isArray(vr.replaced) ? vr.replaced.length : 0;
  const slipAmount = check?.facts?.amount;
  const pending = row.status === 'pending' || row.status === 'verifying';
  return (
    <article className="panel" data-testid="slip-card" data-payment={row.id}>
      <div className="panel-head flex-wrap">
        {row.booking ? (
          <Link href={`/admin/jobs/${row.booking.id}`} className="tnum hover:underline" data-testid="slip-booking">
            {row.booking.booking_no}
          </Link>
        ) : null}
        <span className="min-w-0 truncate font-normal text-ink-2">{row.booking?.customer_name}</span>
        <span className="ml-auto flex items-center gap-2">{row.booking ? <StatusBadge status={row.booking.status} /> : null}</span>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="group block" aria-label={C.openSlip}>
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket */}
              <img src={url} alt={C.openSlip} className="max-h-72 w-full rounded-md border border-line bg-surface-2 object-contain" data-testid="slip-preview" />
              <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-token group-hover:underline">
                <ExternalLink className="size-3.5" aria-hidden />
                {C.openSlip}
              </span>
            </a>
          ) : (
            <div className="grid aspect-[3/4] place-items-center rounded-md border border-line bg-surface-2 text-sm text-muted-token">
              <span className="flex flex-col items-center gap-1">
                <ImageOff className="size-5" aria-hidden />
                {C.noPreview}
              </span>
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-3">
          <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-token">{C.due}</dt>
            <dd className="num-display text-lg" data-testid="slip-due">
              {baht(row.amount)}
            </dd>
            <dt className="text-muted-token">{C.slipAmount}</dt>
            <dd className={`tnum ${typeof slipAmount === 'number' && slipAmount < row.amount ? 'font-semibold text-urgent' : ''}`}>
              {typeof slipAmount === 'number' ? baht(slipAmount) : '—'}
            </dd>
            <dt className="text-muted-token">{C.uploaded}</dt>
            <dd className="tnum">{stamp(row.updated_at)}</dd>
          </dl>
          <p className="text-sm" data-testid="slip-check">
            {!check ? (
              <span className="text-muted-token">{C.verifyNone}</span>
            ) : check.result === 'paid' ? (
              <Badge tone="done">{C.verifyOk}</Badge>
            ) : (
              <Badge tone="urgent">{C.verifyReview.replace('{r}', VERIFY_REASON[check.reason ?? ''] ?? check.reason ?? '')}</Badge>
            )}
            {replaced ? <span className="ml-2 text-xs text-muted-token">{C.replacedSlips(replaced)}</span> : null}
          </p>
          {canReview && pending && row.booking ? (
            <ReviewActions paymentId={row.id} bookingNo={row.booking.booking_no} amountText={baht(row.amount)} />
          ) : null}
        </div>
      </div>
    </article>
  );
}
