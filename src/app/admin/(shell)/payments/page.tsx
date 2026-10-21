import { Suspense } from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { ListSkeleton, MetricSkeleton } from '@/components/ui/states';
import { parsePage } from '@/features/admin-ops/helpers';
import { PaymentsView, type PaymentsQuery } from '@/features/payments/payments-view';
import { requirePerm } from '@/lib/auth/require';
import { PAYMENTS_COPY } from '@/lib/copy/pay';

export const metadata = { title: PAYMENTS_COPY.title };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requirePerm('finance.read');
  const sp = await searchParams;
  const status = first(sp.status) ?? 'all';
  const method = first(sp.method) ?? 'all';
  const q = first(sp.q) ?? '';
  // any list filter means the "all payments" tab (the shared toolbar links carry status + q only)
  const tab = first(sp.tab) === 'all' || status !== 'all' || method !== 'all' || q ? 'all' : 'review';
  const query: PaymentsQuery = { tab, status, method, q, page: parsePage(first(sp.page)) };
  return (
    <>
      <PageHeader title={PAYMENTS_COPY.title} subtitle={PAYMENTS_COPY.subtitle} />
      <Suspense
        key={`${query.tab}|${query.status}|${query.method}|${query.q}|${query.page}`}
        fallback={
          <>
            <MetricSkeleton count={4} />
            <ListSkeleton rows={5} />
          </>
        }
      >
        <PaymentsView staff={staff} query={query} />
      </Suspense>
    </>
  );
}
