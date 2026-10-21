import { Badge } from '@/components/ui/badge';
import { RefreshRetry } from '@/features/admin-ops/retry';
import { can, getStaff } from '@/lib/auth/staff';
import { PAYMENTS_COPY as C } from '@/lib/copy/pay';
import { baht } from '@/lib/format';
import { getSupabaseServer } from '@/lib/supabase/server';
import { loadSlipQueue, slipUrls } from './payments-data';
import { PAY_STATUS_TONE } from './payments-view';
import { SlipCard, stamp } from './slip-card';

/**
 * Seam for the admin job detail page (`src/app/admin/(shell)/jobs/[id]/page.tsx`):
 *   <BookingPayments bookingId={job.id} />
 * Lists the booking's payments, the deposit still owed, and any pending slip with the same
 * approve / reject actions as /admin/payments. Server Component; RLS limits rows to staff
 * with finance.read or jobs.manage (others see the empty state).
 */
export async function BookingPayments({ bookingId }: { bookingId: string }) {
  const staff = await getStaff();
  const sb = await getSupabaseServer();
  const [list, due, slips] = await Promise.all([
    sb
      .from('payments')
      .select('id, purpose, method, amount, status, created_at, paid_at, verify_result')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
      .order('id')
      .range(0, 49),
    sb.rpc('deposit_due', { p_booking: bookingId }),
    loadSlipQueue(sb, bookingId).catch(() => null),
  ]);
  if (list.error || due.error || slips === null) {
    console.error('[booking payments] load failed', (list.error ?? due.error)?.message);
    return (
      <section className="panel lg:col-span-2" data-testid="booking-payments">
        <div className="panel-head">{C.bookingPayments}</div>
        <RefreshRetry message={C.loadError} />
      </section>
    );
  }
  const urls = await slipUrls(sb, slips);
  const rows = list.data ?? [];
  return (
    <section className="panel lg:col-span-2" data-testid="booking-payments">
      <div className="panel-head">
        {C.bookingPayments}
        <span className="ml-auto text-xs font-normal text-muted-token">
          {C.dueNow} <span className="tnum font-semibold text-ink" data-testid="deposit-due">{baht(Number(due.data ?? 0))}</span>
        </span>
      </div>
      {slips.length ? (
        <div className="space-y-4 border-b border-line-soft p-4">
          {slips.map((s) => (
            <SlipCard key={s.id} row={s} url={urls.get(s.id) ?? null} canReview={can(staff, 'jobs.manage')} />
          ))}
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-token">{C.noPayments}</p>
      ) : (
        <ul>
          {rows.map((p) => {
            const note = (p.verify_result as { review?: { note?: string } } | null)?.review?.note;
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5 text-sm last:border-b-0">
                <span className="min-w-0">
                  {C.purpose[p.purpose] ?? p.purpose} · {C.method[p.method] ?? p.method} · <span className="tnum text-muted-token">{stamp(p.paid_at ?? p.created_at)}</span>
                  {note ? <span className="block text-xs text-muted-token">{C.reasonLabel}: {note}</span> : null}
                </span>
                <span className="flex items-center gap-3">
                  <span className="tnum">{baht(p.amount)}</span>
                  <Badge tone={PAY_STATUS_TONE[p.status] ?? 'pending'}>{C.status[p.status] ?? p.status}</Badge>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
