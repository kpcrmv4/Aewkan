import { UserCheck } from 'lucide-react';
import Link from 'next/link';
import { hrefWith } from '@/components/ui/filter-href';
import { ListRow } from '@/components/ui/list-row';
import { EmptyState } from '@/components/ui/states';
import type { BookingStatus } from '@/lib/contracts/common';
import { ASSIGN_COPY as C, JOBS_COPY } from '@/lib/copy/admin';
import { MODE_LABEL, STATUS_LABEL } from '@/lib/copy/common';
import { baht, formatTripDate } from '@/lib/format';
import { getSupabaseServer } from '@/lib/supabase/server';
import { AssignPanel, type DriverOption } from './assign-panel';
import { loadPlaceNames, loadStopPlaceIds, loadVehicles, vehicleName } from './data';
import { hhmm, PAGE_SIZE, tripTitle, UUID_RE } from './helpers';
import { RefreshRetry } from './retry';
import { Pager, StatusBadge } from './status-badge';
import { ASSIGN_STATUSES } from './transitions';

export async function AssignView({ id, page }: { id: string | undefined; page: number }) {
  let el: React.ReactNode = null;
  let failed = false;
  try {
    el = await render(id, page);
  } catch (e) {
    console.error('[assign] failed', e instanceof Error ? e.message : e);
    failed = true;
  }
  return failed ? <RefreshRetry message={C.loadError} /> : el;
}

const Kv = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 py-1 text-sm">
    <dt className="text-muted-token">{k}</dt>
    <dd className="min-w-0 break-words">{children}</dd>
  </div>
);

async function render(wantedId: string | undefined, page: number) {
  const sb = await getSupabaseServer();
  const from = (page - 1) * PAGE_SIZE;
  const { data: rows, error, count } = await sb
    .from('bookings')
    .select('id, booking_no, status, customer_name, pax, travel_date, pickup_time, pickup_place_id, round_trip', { count: 'exact' })
    .in('status', [...ASSIGN_STATUSES])
    .order('travel_date', { ascending: true })
    .order('pickup_time', { ascending: true })
    .order('id')
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(`assign list: ${error.message}`);
  if (!rows || rows.length === 0) return <EmptyState icon={UserCheck} message={C.empty} />;

  const stopIds = await loadStopPlaceIds(sb, rows.map((r) => r.id));
  const places = await loadPlaceNames(sb, [...rows.map((r) => r.pickup_place_id), ...[...stopIds.values()].flat()]);
  const titleOf = (r: (typeof rows)[number]) => {
    const names = (stopIds.get(r.id) ?? []).map((i) => places.get(i)?.name_th ?? '').filter(Boolean);
    return tripTitle(names.length ? names : [places.get(r.pickup_place_id)?.name_th ?? ''], r.round_trip, JOBS_COPY.oneWay, JOBS_COPY.noStops);
  };
  const selectedId = wantedId && UUID_RE.test(wantedId) ? wantedId : rows[0].id;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const detail = await renderDetail(selectedId);

  return (
    <div className="space-y-4">
      <div>
        <div className="panel" data-testid="assign-list">
          <div className="panel-head">{C.listHead}</div>
          {rows.map((r) => (
            <div key={r.id} className={r.id === selectedId ? 'bg-brand-tint' : ''}>
              <ListRow
                title={
                  <Link href={`/admin/assign?id=${r.id}`} aria-current={r.id === selectedId ? 'true' : undefined} className="hover:underline">
                    <span className="tnum text-muted-token">{r.booking_no}</span> · {titleOf(r)}
                  </Link>
                }
                meta={`${r.customer_name} · ${r.pax} ${JOBS_COPY.people} · ${formatTripDate(r.travel_date, 'th', { shortYear: true })} · ${hhmm(r.pickup_time)}`}
                aside={<StatusBadge status={r.status} />}
              />
            </div>
          ))}
        </div>
        <Pager
          prevHref={page > 1 ? hrefWith('/admin/assign', {}, { page: page - 1 <= 1 ? null : page - 1 }) : null}
          nextHref={page < pages ? hrefWith('/admin/assign', {}, { page: page + 1 }) : null}
          label={JOBS_COPY.pageOf(page, pages)}
        />
      </div>
      {detail}
    </div>
  );
}

async function renderDetail(id: string) {
  const sb = await getSupabaseServer();
  const [b, vehicles] = await Promise.all([sb.from('bookings').select('*').eq('id', id).maybeSingle(), loadVehicles(sb)]);
  if (b.error) throw new Error(`booking: ${b.error.message}`);
  if (!b.data || !(ASSIGN_STATUSES as readonly string[]).includes(b.data.status)) return <EmptyState icon={UserCheck} message={C.pickPrompt} />;
  const job = b.data;

  const [dr, stops] = await Promise.all([
    sb.from('drivers').select('id, nickname, full_name, name_en, car_th, car_en, plate, langs').eq('vehicle_key', job.vehicle_key).eq('is_active', true).order('nickname').order('id').range(0, 199),
    sb.from('booking_stops').select('place_id').eq('booking_id', id).order('seq').range(0, 99),
  ]);
  if (dr.error) throw new Error(`drivers: ${dr.error.message}`);
  if (stops.error) throw new Error(`stops: ${stops.error.message}`);
  const driverIds = (dr.data ?? []).map((d) => d.id);

  const [offRes, busyRes, places] = await Promise.all([
    driverIds.length ? sb.from('driver_off_days').select('driver_id').eq('day', job.travel_date).in('driver_id', driverIds).order('driver_id').range(0, 199) : Promise.resolve({ data: [], error: null }),
    driverIds.length
      ? sb.from('bookings').select('driver_id').eq('travel_date', job.travel_date).in('status', ['assigned', 'traveling']).in('driver_id', driverIds).neq('id', id).order('id').range(0, 499)
      : Promise.resolve({ data: [], error: null }),
    loadPlaceNames(sb, [job.pickup_place_id, ...(stops.data ?? []).map((s) => s.place_id)]),
  ]);
  if (offRes.error) throw new Error(`off days: ${offRes.error.message}`);
  if (busyRes.error) throw new Error(`busy: ${busyRes.error.message}`);
  const off = new Set((offRes.data ?? []).map((r) => r.driver_id));
  const busy = new Set((busyRes.data ?? []).map((r) => r.driver_id));

  const drivers: DriverOption[] = (dr.data ?? []).map((d) => ({
    id: d.id,
    nickname: d.nickname,
    fullName: d.full_name,
    nameEn: d.name_en,
    carTh: d.car_th,
    carEn: d.car_en,
    plate: d.plate,
    langs: d.langs,
    state: off.has(d.id) ? 'off' : busy.has(d.id) ? 'busy' : 'free',
  }));
  const names = (stops.data ?? []).map((s) => places.get(s.place_id)?.name_th ?? '').filter(Boolean);
  const title = tripTitle(names.length ? names : [places.get(job.pickup_place_id)?.name_th ?? ''], job.round_trip, JOBS_COPY.oneWay, JOBS_COPY.noStops);
  const lang = job.customer_lang === 'en' ? 'en' : 'th';
  const amount = job.quote_price ?? job.price_total;

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          {C.listHead}
          <span className="ml-auto">
            <StatusBadge status={job.status} />
          </span>
        </div>
        <div className="px-4 py-3">
          <div className="mb-1.5 font-semibold">
            <span className="tnum text-muted-token">{job.booking_no}</span> · {title}
          </div>
          <dl className="grid gap-x-6 md:grid-cols-2">
            <Kv k={C.customer}>
              {job.customer_name} · {job.pax} {JOBS_COPY.people}
            </Kv>
            <Kv k={C.contact}>{job.customer_contact}</Kv>
            <Kv k={C.pickup}>
              {formatTripDate(job.travel_date, 'th')} · {hhmm(job.pickup_time)} · {places.get(job.pickup_place_id)?.name_th ?? ''}
            </Kv>
            <Kv k={C.price}>
              <span className="tnum">{amount ? baht(amount) : '—'}</span> ({MODE_LABEL[job.mode as keyof typeof MODE_LABEL]?.th ?? job.mode}) · {vehicleName(vehicles, job.vehicle_key)}
            </Kv>
            <Kv k="สถานะ">{STATUS_LABEL[job.status as BookingStatus].th}</Kv>
          </dl>
        </div>
      </section>
      <div className="text-sm font-semibold text-ink-2">{C.driversHead(formatTripDate(job.travel_date, 'th'))}</div>
      <AssignPanel
        key={job.id}
        ctx={{
          bookingId: job.id,
          bookingNo: job.booking_no,
          date: job.travel_date,
          time: job.pickup_time,
          lang,
          pickupName: (lang === 'en' ? places.get(job.pickup_place_id)?.name_en : places.get(job.pickup_place_id)?.name_th) ?? '',
          customerName: job.customer_name,
          assigned: job.status === 'assigned',
          currentDriverId: job.driver_id,
        }}
        drivers={drivers}
        vehicleLabel={vehicleName(vehicles, job.vehicle_key)}
      />
    </>
  );
}
