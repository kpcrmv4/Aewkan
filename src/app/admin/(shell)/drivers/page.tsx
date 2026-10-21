import { Suspense } from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { ListSkeleton } from '@/components/ui/states';
import { DriversView } from '@/features/admin-ops/drivers-view';
import { parsePage } from '@/features/admin-ops/helpers';
import { requirePerm } from '@/lib/auth/require';
import { DRIVERS_COPY } from '@/lib/copy/admin';

export const metadata = { title: DRIVERS_COPY.title };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePerm('drivers.manage');
  const sp = await searchParams;
  const raw = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const page = parsePage(raw);
  return (
    <>
      <PageHeader title={DRIVERS_COPY.title} subtitle={DRIVERS_COPY.subtitle} />
      <Suspense key={page} fallback={<ListSkeleton rows={4} />}>
        <DriversView page={page} />
      </Suspense>
    </>
  );
}
