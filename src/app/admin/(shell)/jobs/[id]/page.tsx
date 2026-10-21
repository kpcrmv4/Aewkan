import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shell/page-header';
import { loadPlaceNames, loadVehicles, vehicleName } from '@/features/admin-ops/data';
import { hhmm, plannedTimes, UUID_RE } from '@/features/admin-ops/helpers';
import { RefreshRetry } from '@/features/admin-ops/retry';
import { StatusActions } from '@/features/admin-ops/status-actions';
import { StatusBadge } from '@/features/admin-ops/status-badge';
import { nextStatuses } from '@/features/admin-ops/transitions';
import { can } from '@/lib/auth/staff';
import { requirePerm } from '@/lib/auth/require';
import type { BookingStatus } from '@/lib/contracts/common';
import { DETAIL_COPY } from '@/lib/copy/admin';
import { MODE_LABEL, priceLineText, STATUS_LABEL } from '@/lib/copy/common';
import { baht, formatTime, formatTripDate } from '@/lib/format';
import { getSupabaseServer } from '@/lib/supabase/server';

export const metadata = { title: 'รายละเอียดงาน' };

interface PriceLine {
  key: string;
  vars?: Record<string, string | number>;
  amount: number;
}

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 py-1.5 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
    <dt className="text-muted-token">{k}</dt>
    <dd className="min-w-0 break-words text-ink">{children}</dd>
  </div>
);

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePerm('jobs.read');
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const sb = await getSupabaseServer();
  const [b, stops, pays, events] = await Promise.all([
    sb.from('bookings').select('*').eq('id', id).maybeSingle(),
    sb.from('booking_stops').select('seq, place_id, dwell_min, planned_minutes, checked_in_at').eq('booking_id', id).order('seq').range(0, 99),
    sb.from('payments').select('id, purpose, method, amount, status, created_at, paid_at').eq('booking_id', id).order('created_at', { ascending: false }).range(0, 49),
    sb.from('booking_events').select('id, kind, data, actor, at').eq('booking_id', id).order('at', { ascending: false }).order('id', { ascending: false }).range(0, 99),
  ]);
  const failed = b.error ?? stops.error ?? pays.error ?? events.error;
  if (failed) {
    console.error('[job detail] load failed', failed.message);
    return (
      <>
        <PageHeader title="รายละเอียดงาน" />
        <RefreshRetry message={DETAIL_COPY.loadError} />
      </>
    );
  }
  if (!b.data) notFound();
  const job = b.data;

  const [places, vehicles, driver] = await Promise.all([
    loadPlaceNames(sb, [job.pickup_place_id, ...(stops.data ?? []).map((s) => s.place_id)]),
    loadVehicles(sb),
    job.driver_id ? sb.from('drivers').select('nickname, full_name, plate').eq('id', job.driver_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  const status = job.status as BookingStatus;
  const canManage = can(staff, 'jobs.manage');
  const options = canManage ? [...nextStatuses(status)] : [];
  const times = plannedTimes(job.pickup_time, stops.data ?? []);
  const lines = (Array.isArray(job.price_lines) ? job.price_lines : []) as unknown as PriceLine[];
  const total = job.quote_price ?? job.price_total;
  const label = (s: unknown) => STATUS_LABEL[s as BookingStatus]?.th ?? String(s);

  return (
    <>
      <PageHeader
        title={`งาน ${job.booking_no}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={job.status} />
            <span>{MODE_LABEL[job.mode as keyof typeof MODE_LABEL]?.th ?? job.mode}</span>
          </span>
        }
        action={
          <Link href="/admin/jobs" className="btn-ghost min-h-11">
            <ArrowLeft className="size-4" />
            {DETAIL_COPY.back}
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel">
          <div className="panel-head">{DETAIL_COPY.customer}</div>
          <dl className="px-4 py-2">
            <Row k={DETAIL_COPY.customer}>
              {job.customer_name} · {job.pax} คน
            </Row>
            <Row k={DETAIL_COPY.contact}>{job.customer_contact}</Row>
            <Row k={DETAIL_COPY.pickup}>
              {formatTripDate(job.travel_date, 'th')} · {hhmm(job.pickup_time)} · {places.get(job.pickup_place_id)?.name_th ?? ''}
            </Row>
            {job.hotel && <Row k={DETAIL_COPY.hotel}>{job.hotel}</Row>}
            <Row k="รถ">{vehicleName(vehicles, job.vehicle_key)}</Row>
            <Row k={DETAIL_COPY.language}>{job.customer_lang === 'en' ? 'English' : 'ไทย'}</Row>
            <Row k={DETAIL_COPY.driver}>{driver.data ? `${driver.data.nickname} · ${driver.data.plate}` : DETAIL_COPY.noDriver}</Row>
            <Row k={DETAIL_COPY.rulesVersion}>{job.rule_version}</Row>
            {job.note && <Row k={DETAIL_COPY.note}>{job.note}</Row>}
          </dl>
        </section>

        <section className="panel">
          <div className="panel-head">{DETAIL_COPY.route}</div>
          <ol className="px-4 py-2" data-testid="stops">
            <li className="flex gap-3 py-1.5 text-sm">
              <span className="tnum w-12 shrink-0 text-muted-token">{hhmm(job.pickup_time)}</span>
              <span>
                {DETAIL_COPY.pickupLabel} · {places.get(job.pickup_place_id)?.name_th ?? ''}
              </span>
            </li>
            {(stops.data ?? []).map((s, i) => (
              <li key={s.seq} className="flex gap-3 py-1.5 text-sm">
                <span className="tnum w-12 shrink-0 text-muted-token">{times[i]}</span>
                <span className="min-w-0">
                  {places.get(s.place_id)?.name_th ?? ''} <span className="text-muted-token">· {DETAIL_COPY.stopDwell(s.dwell_min)}</span>
                  {s.checked_in_at && <span className="text-muted-token"> · เช็กอิน {formatTime(s.checked_in_at)}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel">
          <div className="panel-head">{DETAIL_COPY.price}</div>
          <div className="px-4 py-2">
            {lines.map((l, i) => (
              <div key={i} className="flex justify-between gap-3 py-1.5 text-sm">
                <span>{priceLineText(l.key, l.vars ?? {}, 'th')}</span>
                <span className="tnum">{baht(l.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t border-line-soft pt-2 font-semibold">
              <span>{DETAIL_COPY.total}</span>
              <span className="num-display tnum">{total ? baht(total) : '—'}</span>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">{DETAIL_COPY.payments}</div>
          {(pays.data ?? []).length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-token">{DETAIL_COPY.noPayments}</p>
          ) : (
            <ul>
              {(pays.data ?? []).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5 text-sm last:border-b-0">
                  <span>
                    {DETAIL_COPY.paymentPurpose[p.purpose] ?? p.purpose} · {DETAIL_COPY.paymentMethod[p.method] ?? p.method}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tnum">{baht(p.amount)}</span>
                    <span className="chip text-status-pending bg-status-pending-bg ring-status-pending-ring">{DETAIL_COPY.paymentStatus[p.status] ?? p.status}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel lg:col-span-2">
          <div className="panel-head">{DETAIL_COPY.statusActions}</div>
          <div className="px-4 py-3">
            {canManage ? <StatusActions bookingId={job.id} from={status} options={options} /> : <p className="text-sm text-muted-token">{DETAIL_COPY.noActions}</p>}
          </div>
        </section>

        <section className="panel lg:col-span-2">
          <div className="panel-head">{DETAIL_COPY.history}</div>
          {(events.data ?? []).length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-token">{DETAIL_COPY.noHistory}</p>
          ) : (
            <ul data-testid="events">
              {(events.data ?? []).map((e) => {
                const d = (e.data ?? {}) as Record<string, unknown>;
                return (
                  <li key={e.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b border-line-soft px-4 py-2.5 text-sm last:border-b-0">
                    <span>
                      {DETAIL_COPY.eventKind[e.kind] ?? e.kind}
                      {e.kind === 'status' && ` · ${DETAIL_COPY.eventStatus(label(d.from), label(d.to))}`}
                      {e.kind === 'created' && d.status ? ` · ${label(d.status)}` : ''}
                    </span>
                    <span className="tnum text-muted-token">
                      {formatTripDate(new Date(e.at).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }), 'th', { shortYear: true })} {formatTime(e.at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
