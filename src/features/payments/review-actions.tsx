'use client';

import { Check, Loader2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { postJson } from '@/features/admin-ops/api-client';
import { Sheet } from '@/features/admin-ops/sheet';
import type { ReviewPaymentResponse } from '@/lib/contracts/payment';
import { integErrorText, PAYMENTS_COPY as C } from '@/lib/copy/pay';

/** approve / reject one pending payment (jobs.manage) — radix confirm, spinner while saving */
export function ReviewActions({ paymentId, bookingNo, amountText }: { paymentId: string; bookingNo: string; amountText: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<'approve' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!open || busy) return;
    setBusy(true);
    const res = await postJson<ReviewPaymentResponse>('/api/admin/payments/confirm', { paymentId, approve: open === 'approve', note: open === 'reject' ? note.trim() : '' });
    setBusy(false);
    if (!res.ok) {
      toast.error(integErrorText(res.code, res.message));
      if (res.code === 'payment_already_reviewed') router.refresh();
      return;
    }
    toast.success(open === 'approve' ? C.approved : C.rejected);
    setOpen(null);
    setNote('');
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary btn-sm min-h-11" onClick={() => setOpen('approve')} data-testid="approve">
          <Check className="size-4" aria-hidden />
          {C.approve}
        </button>
        <button type="button" className="btn-danger btn-sm min-h-11" onClick={() => setOpen('reject')} data-testid="reject">
          <X className="size-4" aria-hidden />
          {C.reject}
        </button>
      </div>
      <Sheet
        open={open !== null}
        onOpenChange={(o) => !o && !busy && setOpen(null)}
        title={open === 'approve' ? C.approveTitle : C.rejectTitle}
        description={open === 'approve' ? C.approveBody(bookingNo, amountText) : C.rejectBody}
      >
        {open === 'reject' ? (
          <label className="mb-3 block">
            <span className="label-base">{C.rejectReason}</span>
            <textarea
              className="input-base min-h-20"
              maxLength={300}
              value={note}
              placeholder={C.rejectPlaceholder}
              onChange={(e) => setNote(e.target.value)}
              data-testid="reject-note"
            />
          </label>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary min-h-11" onClick={() => setOpen(null)} disabled={busy}>
            {C.cancel}
          </button>
          <button
            type="button"
            className={`${open === 'reject' ? 'btn-danger' : 'btn-primary'} min-h-11`}
            onClick={() => void run()}
            disabled={busy}
            aria-busy={busy || undefined}
            data-testid="review-confirm"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {open === 'reject' ? C.reject : C.approve}
          </button>
        </div>
      </Sheet>
    </>
  );
}
