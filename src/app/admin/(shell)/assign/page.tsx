import { Suspense } from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { ListSkeleton } from '@/components/ui/states';
import { AssignView } from '@/features/admin-ops/assign-view';
import { parsePage } from '@/features/admin-ops/helpers';
import { requirePerm } from '@/lib/auth/require';
import { ASSIGN_COPY } from '@/lib/copy/admin';

export const metadata = { title: ASSIGN_COPY.title };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePerm('jobs.manage');
  const sp = await searchParams;
  const id = first(sp.id);
  const page = parsePage(first(sp.page));
  return (
    <>
      <PageHeader title={ASSIGN_COPY.title} subtitle={ASSIGN_COPY.subtitle} />
      <Suspense key={`${id}|${page}`} fallback={<ListSkeleton rows={5} />}>
        <AssignView id={id} page={page} />
      </Suspense>
    </>
  );
}
