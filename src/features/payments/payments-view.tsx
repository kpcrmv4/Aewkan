import { Inbox, ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { hrefWith } from '@/components/ui/filter-href';
import { ListRow } from '@/components/ui/list-row';
import { ListToolbar, type FilterChip } from '@/components/ui/list-toolbar';
import { Metric, MetricBar } from '@/components/ui/metric';
import { EmptyState } from '@/components/ui/states';
import { cleanSearch } from '@/features/admin-ops/helpers';
import { RefreshRetry } from '@/features/admin-ops/retry';
import { Pager, StatusBadge } from '@/features/admin-ops/status-badge';
import { can, type StaffSession } from '@/lib/auth/staff';
import { PAYMENTS_COPY as C } from '@/lib/copy/pay';
import { baht } from '@/lib/format';
import { getSupabaseServer } from '@/lib/supabase/server';
import { loadKpis, loadPayments, loadSlipQueue, PAY_METHODS, PAY_PAGE_SIZE, PAY_STATUSES, slipUrls } from './payments-data';
import { SlipCard, stamp } from './slip-card';

export interface PaymentsQuery {
  tab: 'review' | 'all';
  status: string;
  method: string;
  q: string;
  page: number;
}

const BASE = '/admin/payments';

export const PAY_STATUS_TONE: Record<string, BadgeTone> = {
  pending: 'progress',
  verifying: 'progress',
  paid: 'done',
  failed: 'urgent',
  refunded: 'info',
  cancelled: 'pending',
};

/** /admin/payments body: money KPIs, then the slip queue or the full list (all server-rendered) */
export async function PaymentsView({ staff, query }: { staff: StaffSession; query: PaymentsQuery }) {
  try {
    return await render(staff, query);
  } catch (e) {
    console.error('[payments] load failed', e instanceof Error ? e.message : e);
    return <RefreshRetry message={C.loadError} />;
  }
}

async function render(staff: StaffSession, query: PaymentsQuery) {
  const sb = await getSupabaseServer();
  const kpis = await loadKpis(sb);
  const tabs = (
    <nav className="mb-4 flex gap-1.5" aria-label="มุมมอง" data-testid="pay-tabs">
      {(['review', 'all'] as const).map((t) => (
        <Link
          key={t}
          href={t === 'review' ? BASE : `${BASE}?tab=all`}
          aria-current={query.tab === t ? 'page' : undefined}
          className={`rounded-sm border px-3 py-2 text-sm font-medium ${query.tab === t ? 'border-ink bg-ink text-canvas' : 'border-line-strong bg-surface text-ink-2 hover:text-ink'}`}
        >
          {t === 'review' ? `${C.tabReview} (${kpis.pending_slips})` : C.tabAll}
        </Link>
      ))}
    </nav>
  );
  const metrics = (
    <div data-testid="pay-kpi">
      <MetricBar>
        <Metric label={C.kpiPending} value={kpis.pending_slips} tone={kpis.pending_slips ? 'urgent' : 'default'} href={BASE} />
        <Metric label={C.kpiOnline} value={kpis.pending_online} href={`${BASE}?tab=all&status=pending`} />
        <Metric label={C.kpiPaidMonth} value={baht(kpis.paid_month)} tone="done" />
        <Metric label={C.kpiPaidCount} value={kpis.paid_month_count} href={`${BASE}?tab=all&status=paid`} />
      </MetricBar>
    </div>
  );

  if (query.tab === 'review') {
    const rows = await loadSlipQueue(sb);
    const urls = await slipUrls(sb, rows);
    const canReview = can(staff, 'jobs.manage');
    return (
      <>
        {metrics}
        {tabs}
        {rows.length === 0 ? (
          <div data-testid="queue-empty">
            <EmptyState icon={Inbox} message={C.emptyQueue} />
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2" data-testid="slip-queue">
            {rows.map((r) => (
              <SlipCard key={r.id} row={r} url={urls.get(r.id) ?? null} canReview={canReview} />
            ))}
          </div>
        )}
      </>
    );
  }

  const search = cleanSearch(query.q);
  const { rows, total } = await loadPayments(sb, { ...query, q: search });
  const pages = Math.max(1, Math.ceil(total / PAY_PAGE_SIZE));
  const params = { tab: 'all', status: query.status === 'all' ? undefined : query.status, method: query.method === 'all' ? undefined : query.method, q: search || undefined };
  const statusChips: FilterChip[] = [{ key: 'all', label: C.filterAll }, ...PAY_STATUSES.map((s) => ({ key: s, label: C.status[s] }))];
  const filtered = query.status !== 'all' || query.method !== 'all' || Boolean(search);

  return (
    <>
      {metrics}
      {tabs}
      {/* the toolbar's links carry only status + q; the page treats either as the "all" tab */}
      <ListToolbar basePath={BASE} q={search} filters={statusChips} activeFilter={query.status} placeholder="ค้นหาเลขจอง" />
      <div className="-mt-2 mb-4 flex flex-wrap items-center gap-1.5" data-testid="method-filter">
        <span className="mr-1 text-sm text-muted-token">{C.filterMethod}</span>
        {(['all', ...PAY_METHODS] as const).map((m) => (
          <Link
            key={m}
            href={hrefWith(BASE, params, { method: m, page: null })}
            aria-current={query.method === m ? 'true' : undefined}
            className={`rounded-sm border px-2.5 py-1.5 text-sm ${query.method === m ? 'border-ink bg-ink text-canvas' : 'border-line-strong bg-surface text-ink-2'}`}
          >
            {m === 'all' ? C.filterAll : C.method[m]}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          message={filtered ? C.emptyFiltered : C.emptyAll}
          action={
            filtered ? (
              <Link href={`${BASE}?tab=all`} className="btn-secondary mx-auto">
                {C.clearFilters}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="panel" data-testid="payments-list">
          {rows.map((p) => (
            <ListRow
              key={p.id}
              title={
                p.booking ? (
                  <Link href={`/admin/jobs/${p.booking.id}`} className="hover:underline">
                    <span className="tnum text-muted-token">{p.booking.booking_no}</span> · {p.booking.customer_name}
                  </Link>
                ) : (
                  '—'
                )
              }
              meta={`${C.purpose[p.purpose] ?? p.purpose} · ${C.method[p.method] ?? p.method} · ${stamp(p.paid_at ?? p.created_at)}`}
              aside={
                <>
                  <span className="num-display tnum text-base">{baht(p.amount)}</span>
                  <Badge tone={PAY_STATUS_TONE[p.status] ?? 'pending'}>{C.status[p.status] ?? p.status}</Badge>
                  {p.booking ? <StatusBadge status={p.booking.status} /> : null}
                </>
              }
            />
          ))}
        </div>
      )}
      <Pager
        prevHref={query.page > 1 ? hrefWith(BASE, { ...params, page: String(query.page) }, { page: query.page - 1 <= 1 ? null : query.page - 1 }) : null}
        nextHref={query.page < pages ? hrefWith(BASE, { ...params, page: String(query.page) }, { page: query.page + 1 }) : null}
        label={C.pageOf(query.page, pages)}
      />
    </>
  );
}
