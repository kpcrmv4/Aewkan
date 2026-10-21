import { MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import { ListRow } from '@/components/ui/list-row';
import { EmptyState } from '@/components/ui/states';
import { QUOTES_COPY as C } from '@/lib/copy/admin';
import { MODE_LABEL, STATUS_LABEL } from '@/lib/copy/common';
import { baht, formatTripDate } from '@/lib/format';
import {
  catalogFromJson,
  planTrip,
  priceTrip,
  suggestedQuote,
  type PublicCatalogJson,
  type TripInput,
} from '@/lib/pricing';
import type { BookingStatus } from '@/lib/contracts/common';
import { getSupabaseServer } from '@/lib/supabase/server';
import { loadPlaceNames, loadStopPlaceIds, loadVehicles, vehicleName } from './data';
import { hhmm, PAGE_SIZE, tripTitle, UUID_RE } from './helpers';
import { QuoteForm } from './quote-form';
import { RefreshRetry } from './retry';
import { Pager, StatusBadge } from './status-badge';
import { QUOTE_STATUSES } from './transitions';
import { hrefWith } from '@/components/ui/filter-href';
import { JOBS_COPY } from '@/lib/copy/admin';

const MODES = ['hourly', 'daily', 'trip', 'oneway'] as const;

export async function QuotesView({ id, page }: { id: string | undefined; page: number }) {
  let el: React.ReactNode = null;
  let failed = false;
  try {
    el = await render(id, page);
  } catch (e) {
    console.error('[quotes] failed', e instanceof Error ? e.message : e);
    failed = true;
  }
  return failed ? <RefreshRetry message={C.loadError} /> : el;
}

async function render(wantedId: string | undefined, page: number) {
  const sb = await getSupabaseServer();
  const from = (page - 1) * PAGE_SIZE;
  const { data: rows, error, count } = await sb
    .from('bookings')
    .select('id, booking_no, status, customer_name, pax, travel_date, pickup_time, pickup_place_id, round_trip', { count: 'exact' })
    .in('status', [...QUOTE_STATUSES])
    .order('created_at', { ascending: true })
    .order('id')
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(`quotes list: ${error.message}`);

  if (!rows || rows.length === 0) {
    return (
      <EmptyState
        icon={MessageSquareText}
        message={C.empty}
        action={
          <Link href="/admin/pricing" className="btn-secondary mx-auto min-h-11">
            {C.emptyAction}
          </Link>
        }
      />
    );
  }

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
    <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div>
        <div className="panel" data-testid="quote-list">
          <div className="panel-head">{C.listHead}</div>
          {rows.map((r) => (
            <div key={r.id} className={r.id === selectedId ? 'bg-brand-tint' : ''}>
              <ListRow
                title={
                  <Link href={`/admin/quotes?id=${r.id}`} aria-current={r.id === selectedId ? 'true' : undefined} className="hover:underline">
                    <span className="tnum text-muted-token">{r.booking_no}</span> · {titleOf(r)}
                  </Link>
                }
                meta={`${r.customer_name} · ${formatTripDate(r.travel_date, 'th', { shortYear: true })} · ${hhmm(r.pickup_time)}`}
                aside={<StatusBadge status={r.status} />}
              />
            </div>
          ))}
        </div>
        <Pager
          prevHref={page > 1 ? hrefWith('/admin/quotes', {}, { page: page - 1 <= 1 ? null : page - 1 }) : null}
          nextHref={page < pages ? hrefWith('/admin/quotes', {}, { page: page + 1 }) : null}
          label={JOBS_COPY.pageOf(page, pages)}
        />
      </div>
      {detail}
    </div>
  );
}

const Kv = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 py-1 text-sm">
    <dt className="text-muted-token">{k}</dt>
    <dd className="min-w-0 break-words">{children}</dd>
  </div>
);

async function renderDetail(id: string) {
  const sb = await getSupabaseServer();
  const [b, st, cat, vehicles] = await Promise.all([
    sb.from('bookings').select('*').eq('id', id).maybeSingle(),
    sb.from('booking_stops').select('seq, place_id, dwell_min').eq('booking_id', id).order('seq').range(0, 99),
    sb.rpc('get_public_catalog'),
    loadVehicles(sb),
  ]);
  if (b.error) throw new Error(`booking: ${b.error.message}`);
  if (st.error) throw new Error(`stops: ${st.error.message}`);
  if (!b.data || !(QUOTE_STATUSES as readonly string[]).includes(b.data.status)) return <EmptyState icon={MessageSquareText} message={C.pickPrompt} />;
  const job = b.data;
  const stops = st.data ?? [];
  const places = await loadPlaceNames(sb, [job.pickup_place_id, ...stops.map((s) => s.place_id)]);
  const names = stops.map((s) => places.get(s.place_id)?.name_th ?? '').filter(Boolean);
  const title = tripTitle(names.length ? names : [places.get(job.pickup_place_id)?.name_th ?? ''], job.round_trip, JOBS_COPY.oneWay, JOBS_COPY.noStops);

  // reference prices come from the current rules and the booking's own stops
  let ref: { rows: Array<{ mode: (typeof MODES)[number]; ok: boolean; total: number }>; best: (typeof MODES)[number] | null; version: number; reason: string; pct: number; km: number; hours: number } | null = null;
  let suggestion: { price: number; deposit: number; hours: number } | null = null;
  let depositRule = { pct: 30, round: 100, min: 100 };
  try {
    if (cat.error) throw new Error(cat.error.message);
    const catalog = catalogFromJson(cat.data as unknown as PublicCatalogJson);
    depositRule = { pct: catalog.rules.deposit_pct, round: catalog.rules.deposit_round, min: catalog.rules.deposit_min };
    const input: TripInput = {
      pickupId: job.pickup_place_id,
      stops: stops.map((s) => ({ placeId: s.place_id, dwell: s.dwell_min })),
      date: job.travel_date,
      time: hhmm(job.pickup_time),
      pax: job.pax,
      vehicle: job.vehicle_key,
      roundTrip: job.round_trip,
      langDriver: job.lang_driver,
      festival: job.festival,
    };
    const plan = planTrip(catalog, input);
    const res = priceTrip(catalog, input, plan);
    ref = {
      rows: MODES.map((m) => ({ mode: m, ok: res.modes[m].ok, total: res.modes[m].total })),
      best: res.best,
      version: catalog.ruleVersion,
      reason: catalog.rules.quote.reason_th,
      pct: catalog.rules.quote.pct,
      km: Math.round(plan.km),
      hours: Math.round((plan.totalMinutes / 60) * 10) / 10,
    };
    if (res.best) suggestion = suggestedQuote(catalog, res.modes[res.best].total);
  } catch (e) {
    console.error('[quotes] reference price failed', e instanceof Error ? e.message : e);
  }

  const status = job.status as BookingStatus;
  const quoted = job.quote_price != null && status === 'quoted';
  const defaults = {
    price: quoted ? (job.quote_price ?? 0) : (suggestion?.price ?? 0),
    deposit: quoted ? (job.quote_deposit ?? 0) : (suggestion?.deposit ?? 0),
    hours: quoted ? (job.quote_hours ?? 6) : (suggestion?.hours ?? 6),
    message: quoted ? job.quote_message : null,
  };
  const when = `${formatTripDate(job.travel_date, 'th', { shortYear: true })} · ${hhmm(job.pickup_time)}`;

  return (
    <div className="space-y-4">
      <section className="panel">
        <div className="panel-head">
          {C.request}
          <span className="ml-auto">
            <StatusBadge status={job.status} />
          </span>
        </div>
        <div className="px-4 py-3">
          <div className="mb-1.5 font-semibold">
            <span className="tnum text-muted-token">{job.booking_no}</span> · {title}
          </div>
          <dl>
            <Kv k={C.customer}>
              {job.customer_name} · {job.pax} {JOBS_COPY.people} · {vehicleName(vehicles, job.vehicle_key)}
            </Kv>
            <Kv k={C.contact}>{job.customer_contact}</Kv>
            <Kv k={C.notify}>{job.push_opt_in ? C.notifyPush : C.notifyLine}</Kv>
            <Kv k={C.pickup}>
              {when} · {places.get(job.pickup_place_id)?.name_th ?? ''}
            </Kv>
            {ref && (
              <Kv k={C.route}>
                {ref.km} กม. · {ref.hours} ชม.
              </Kv>
            )}
            <Kv k={C.language}>{job.lang_driver ? C.langForeign : C.langThai}</Kv>
            <Kv k="สถานะ">{STATUS_LABEL[status].th}</Kv>
          </dl>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          {C.refHead(ref?.version ?? job.rule_version)}
          {ref && <span className="ml-auto text-xs font-normal text-muted-token">{ref.reason}</span>}
        </div>
        <div className="px-4 py-3" data-testid="quote-reference">
          {ref ? (
            <>
              {ref.rows.map((r) => (
                <div key={r.mode} className="flex justify-between gap-3 py-1.5 text-sm">
                  <span>{MODE_LABEL[r.mode].th}</span>
                  <span className="tnum">{r.ok ? baht(r.total) : <span className="text-muted-token">{C.notEligible}</span>}</span>
                </div>
              ))}
              {suggestion && ref.best && (
                <div className="mt-1 flex justify-between gap-3 border-t border-line-soft pt-2 font-semibold">
                  <span>{C.suggested(MODE_LABEL[ref.best].th, ref.pct)}</span>
                  <span className="num-display tnum" data-testid="quote-suggested">
                    {baht(suggestion.price)}
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-token">{C.refUnavailable}</p>
          )}
        </div>
      </section>

      <QuoteForm
        key={`${job.id}|${job.status}|${job.quote_sent_at ?? ''}`}
        bookingId={job.id}
        resend={status !== 'quote_requested'}
        pushOptIn={job.push_opt_in}
        defaults={defaults}
        depositRule={depositRule}
        tripTitle={title}
        dateLabel={formatTripDate(job.travel_date, 'th')}
      />
    </div>
  );
}
