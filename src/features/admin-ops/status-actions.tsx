'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import type { BookingStatus } from '@/lib/contracts/common';
import { DETAIL_COPY } from '@/lib/copy/admin';
import { STATUS_LABEL } from '@/lib/copy/common';
import { postJson } from './api-client';
import { Sheet } from './sheet';

export function StatusActions({ bookingId, from, options }: { bookingId: string; from: BookingStatus; options: BookingStatus[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<BookingStatus | null>(null);
  const [busy, setBusy] = useState(false);

  if (options.length === 0) return <p className="text-sm text-muted-token">{DETAIL_COPY.noActions}</p>;

  async function run() {
    if (!target || busy) return;
    setBusy(true);
    const res = await postJson<{ status: string }>('/api/admin/bookings/status', { bookingId, status: target });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(DETAIL_COPY.changed);
    setTarget(null);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {options.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTarget(s)}
            className={`${s === 'cancelled' ? 'btn-danger' : 'btn-secondary'} min-h-11`}
          >
            {s === 'cancelled' ? DETAIL_COPY.cancelJob : DETAIL_COPY.changeTo(STATUS_LABEL[s].th)}
          </button>
        ))}
      </div>
      <Sheet
        open={target !== null}
        onOpenChange={(o) => !o && !busy && setTarget(null)}
        title={DETAIL_COPY.confirmTitle}
        description={target ? DETAIL_COPY.confirmBody(STATUS_LABEL[from].th, STATUS_LABEL[target].th) : undefined}
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary min-h-11" onClick={() => setTarget(null)} disabled={busy}>
            {DETAIL_COPY.cancel}
          </button>
          <button type="button" className="btn-primary min-h-11" onClick={run} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {DETAIL_COPY.confirm}
          </button>
        </div>
      </Sheet>
    </>
  );
}
