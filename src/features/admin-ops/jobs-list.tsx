import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { hrefWith } from '@/components/ui/filter-href';
import { ListRow } from '@/components/ui/list-row';
import { ListToolbar, type FilterChip } from '@/components/ui/list-toolbar';
import { Metric, MetricBar } from '@/components/ui/metric';
import { EmptyState } from '@/components/ui/states';
import { can, type StaffSession } from '@/lib/auth/staff';
import { BOOKING_STATUSES, type BookingStatus } from '@/lib/contracts/common';
import { JOBS_COPY } from '@/lib/copy/admin';
import { MODE_LABEL, STATUS_LABEL } from '@/lib/copy/common';
import { baht, formatTripDate } from '@/lib/format';
import { getSupabaseServer } from '@/lib/supabase/server';
import { loadPlaceNames, loadStopPlaceIds, loadVehicles, vehicleName } from './data';
import { cleanSearch, hhmm, PAGE_SIZE, tripTitle } from './helpers';
import { RefreshRetry } from './retry';
import { Pager, StatusBadge } from './status-badge';

export interface JobsQuery {
  status: string;
  q: string;
  page: number;
}

const btn = 'btn-secondary btn-sm min-h-11';

export async function JobsList({ staff, query }: { staff: StaffSession; query: JobsQuery }) {
  let el: React.ReactNode = null;
  let failed = false;
  try {
    el = await renderJobs(staff, query);
  } catch (e) {
    console.error('[jobs] list failed', e instanceof Error ? e.message : e);
    failed = true;
  }
  return failed ? <RefreshRetry message={JOBS_COPY.loadError} /> : el;
}

async function renderJobs(staff: StaffSession, query: JobsQuery) {
  const sb = await getSupabaseServer();
  const status = (BOOKING_STATUSES as readonly string[]).includes(query.status) ? query.status : 'all';
  const search = cleanSearch(query.q);
  const from = (query.page - 1) * PAGE_SIZE;

  let list = sb
    .from('bookings')
    .select('id, booking_no, status, customer_name, pax, travel_date, pickup_time, vehicle_key, mode, price_total, quote_price, pickup_place_id, round_trip, driver_id', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, from + PAGE_SIZE - 1);
  if (status !== 'all') list = list.eq('status', status);
  if (search) list = list.or(`booking_no.ilike.%${search}%,customer_name.ilike.%${search}%`);

  const [listRes, vehicles, kpiRes] = await Promise.all([list, loadVehicles(sb), sb.rpc('admin_job_kpis')]);
  if (listRes.error) throw new Error(`list: ${listRes.error.message}`);
  if (kpiRes.error) throw new Error(`kpis: ${kpiRes.error.message}`);

  // one round trip: counts per status, today's trips, month revenue (null without finance.read)
  const kpi = kpiRes.data as { by_status: Record<string, number>; today: number; month_revenue: number | null };
  const byStatus = Object.fromEntries(BOOKING_STATUSES.map((s) => [s, kpi.by_status[s] ?? 0])) as Record<BookingStatus, number>;
  const totalAll = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const revenue = can(staff, 'finance.read') ? (kpi.month_revenue ?? 0) : null;

  const rows = listRes.data ?? [];
  const stopIds = await loadStopPlaceIds(sb, rows.map((r) => r.id));
  const places = await loadPlaceNames(sb, [...rows.map((r) => r.pickup_place_id), ...[...stopIds.values()].flat()]);

  const filters: FilterChip[] = [
    { key: 'all', label: JOBS_COPY.filterAll, count: totalAll },
    ...BOOKING_STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s].th, count: byStatus[s] })),
  ];
  const params = { status: status === 'all' ? undefined : status, q: search || undefined };
  const total = listRes.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div data-testid="jobs-kpi">
      <MetricBar>
        <Metric label={JOBS_COPY.kpi.quoteRequested} value={byStatus.quote_requested} tone="urgent" href={hrefWith('/admin/jobs', params, { status: 'quote_requested' })} />
        <Metric label={JOBS_COPY.kpi.awaitingDriver} value={byStatus.confirmed} tone="progress" href={hrefWith('/admin/jobs', params, { status: 'confirmed' })} />
        <Metric label={JOBS_COPY.kpi.today} value={kpi.today} />
        {revenue !== null && <Metric label={JOBS_COPY.kpi.monthRevenue} value={baht(revenue)} />}
      </MetricBar>
      </div>

      <div data-testid="jobs-filters">
      <ListToolbar basePath="/admin/jobs" q={search} filters={filters} activeFilter={status} placeholder={JOBS_COPY.searchPlaceholder} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          message={status === 'all' && !search ? JOBS_COPY.emptyAll : JOBS_COPY.empty}
          action={
            status !== 'all' || search ? (
              <Link href="/admin/jobs" className="btn-secondary mx-auto">
                {JOBS_COPY.clearFilters}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="panel" data-testid="jobs-list">
          {rows.map((r) => {
            const names = (stopIds.get(r.id) ?? []).map((id) => places.get(id)?.name_th ?? '');
            const title = tripTitle(names.filter(Boolean).length ? names.filter(Boolean) : [places.get(r.pickup_place_id)?.name_th ?? ''], r.round_trip, JOBS_COPY.oneWay, JOBS_COPY.noStops);
            const mode = MODE_LABEL[r.mode as keyof typeof MODE_LABEL]?.th ?? r.mode;
            const amount = r.quote_price ?? r.price_total;
            const st = r.status;
            const detail = `/admin/jobs/${r.id}`;
            let action = (
              <Link href={detail} className="btn-ghost min-h-11">
                {JOBS_COPY.action.detail}
              </Link>
            );
            if (st === 'quote_requested' && can(staff, 'quotes.manage')) {
              action = <Link href={`/admin/quotes?id=${r.id}`} className={`${btn} !bg-brand-solid !text-on-brand !border-transparent`}>{JOBS_COPY.action.quote}</Link>;
            } else if (st === 'quote_expired' && can(staff, 'quotes.manage')) {
              action = <Link href={`/admin/quotes?id=${r.id}`} className={btn}>{JOBS_COPY.action.requote}</Link>;
            } else if (st === 'confirmed' && can(staff, 'jobs.manage')) {
              action = <Link href={`/admin/assign?id=${r.id}`} className={`${btn} !bg-brand-solid !text-on-brand !border-transparent`}>{JOBS_COPY.action.assign}</Link>;
            } else if (st === 'assigned' && can(staff, 'jobs.manage')) {
              action = <Link href={`/admin/assign?id=${r.id}`} className={btn}>{JOBS_COPY.action.reassign}</Link>;
            }
            return (
              <ListRow
                key={r.id}
                title={
                  <Link href={detail} className="hover:underline">
                    <span className="tnum text-muted-token">{r.booking_no}</span> · {title}
                  </Link>
                }
                meta={`${r.customer_name} · ${r.pax} ${JOBS_COPY.people} · ${formatTripDate(r.travel_date, 'th', { shortYear: true })} · ${hhmm(r.pickup_time)} · ${vehicleName(vehicles, r.vehicle_key)} · ${mode}`}
                aside={
                  <>
                    <span className="num-display tnum text-base">{amount ? baht(amount) : '—'}</span>
                    <StatusBadge status={st} />
                    {action}
                  </>
                }
              />
            );
          })}
        </div>
      )}

      <Pager
        prevHref={query.page > 1 ? hrefWith('/admin/jobs', { ...params, page: String(query.page) }, { page: query.page - 1 <= 1 ? null : query.page - 1 }) : null}
        nextHref={query.page < pages ? hrefWith('/admin/jobs', { ...params, page: String(query.page) }, { page: query.page + 1 }) : null}
        label={JOBS_COPY.pageOf(query.page, pages)}
      />
    </>
  );
}
