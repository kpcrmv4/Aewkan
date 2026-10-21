import { Suspense } from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { ListSkeleton, MetricSkeleton } from '@/components/ui/states';
import { JobsList } from '@/features/admin-ops/jobs-list';
import { parsePage } from '@/features/admin-ops/helpers';
import { requirePerm } from '@/lib/auth/require';
import { JOBS_COPY } from '@/lib/copy/admin';

export const metadata = { title: JOBS_COPY.title };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requirePerm('jobs.read');
  const sp = await searchParams;
  const query = { status: first(sp.status) ?? 'all', q: first(sp.q) ?? '', page: parsePage(first(sp.page)) };
  return (
    <>
      <PageHeader title={JOBS_COPY.title} subtitle={JOBS_COPY.subtitle} />
      <Suspense
        key={`${query.status}|${query.q}|${query.page}`}
        fallback={
          <>
            <MetricSkeleton count={4} />
            <ListSkeleton rows={6} />
          </>
        }
      >
        <JobsList staff={staff} query={query} />
      </Suspense>
    </>
  );
}
