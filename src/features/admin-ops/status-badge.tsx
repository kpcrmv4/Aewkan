import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { BookingStatus } from '@/lib/contracts/common';
import { STATUS_LABEL } from '@/lib/copy/common';
import { JOBS_COPY } from '@/lib/copy/admin';

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status as BookingStatus];
  return <Badge tone={s?.tone ?? 'pending'}>{s?.th ?? status}</Badge>;
}

export function Pager({ prevHref, nextHref, label }: { prevHref: string | null; nextHref: string | null; label: string }) {
  if (!prevHref && !nextHref) return null;
  return (
    <nav aria-label="แบ่งหน้า" className="mt-4 flex items-center justify-between gap-3">
      {prevHref ? (
        <Link href={prevHref} className="btn-secondary min-h-11">
          {JOBS_COPY.prev}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-token">{label}</span>
      {nextHref ? (
        <Link href={nextHref} className="btn-secondary min-h-11">
          {JOBS_COPY.next}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
