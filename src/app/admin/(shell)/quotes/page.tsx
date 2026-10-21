import { Suspense } from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { ListSkeleton } from '@/components/ui/states';
import { parsePage } from '@/features/admin-ops/helpers';
import { QuotesView } from '@/features/admin-ops/quotes-view';
import { requirePerm } from '@/lib/auth/require';
import { QUOTES_COPY } from '@/lib/copy/admin';

export const metadata = { title: QUOTES_COPY.title };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePerm('quotes.manage');
  const sp = await searchParams;
  const id = first(sp.id);
  const page = parsePage(first(sp.page));
  return (
    <>
      <PageHeader title={QUOTES_COPY.title} subtitle={QUOTES_COPY.subtitle} />
      <Suspense key={`${id}|${page}`} fallback={<ListSkeleton rows={5} />}>
        <QuotesView id={id} page={page} />
      </Suspense>
    </>
  );
}
