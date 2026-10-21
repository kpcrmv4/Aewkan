import { Suspense } from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { UnderlineTabs } from '@/components/ui/filter-bar';
import { ListSkeleton, Skeleton } from '@/components/ui/states';
import { parsePage } from '@/features/admin-ops/helpers';
import { PlacesView } from '@/features/admin-settings/places-view';
import { SegmentsView } from '@/features/admin-settings/segments-view';
import { requirePerm } from '@/lib/auth/require';
import { PLACES_COPY as C } from '@/lib/copy/settings';

export const metadata = { title: C.title };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePerm('places.manage');
  const sp = await searchParams;
  const tab = first(sp.tab) === 'segments' ? 'segments' : 'places';
  const page = parsePage(first(sp.page));
  const options = [
    { value: 'places', label: C.tabs.places },
    { value: 'segments', label: C.tabs.segments },
  ];
  return (
    <>
      <PageHeader title={C.title} subtitle={C.subtitle} />
      <div className="mb-4">
        <UnderlineTabs basePath="/admin/places" params={{}} name="tab" value={tab} options={options} label={C.tabsLabel} />
      </div>
      <Suspense
        key={tab === 'segments' ? `s|${first(sp.src)}|${first(sp.place)}|${page}` : `p|${first(sp.q)}|${first(sp.cat)}|${page}`}
        fallback={
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <ListSkeleton rows={6} />
          </div>
        }
      >
        {tab === 'segments' ? (
          <SegmentsView query={{ src: first(sp.src) ?? 'all', place: first(sp.place) ?? 'all', page }} />
        ) : (
          <PlacesView query={{ q: first(sp.q) ?? '', cat: first(sp.cat) ?? 'all', page }} />
        )}
      </Suspense>
    </>
  );
}
