import { Suspense } from 'react';
import { UnderlineTabs } from '@/components/ui/filter-bar';
import { PageHeader } from '@/components/shell/page-header';
import { ListSkeleton, Skeleton } from '@/components/ui/states';
import { parsePage } from '@/features/admin-ops/helpers';
import { PricingView, type PricingTab } from '@/features/admin-settings/pricing-view';
import { can } from '@/lib/auth/staff';
import { requirePerm } from '@/lib/auth/require';
import { PRICING_COPY as C } from '@/lib/copy/settings';

export const metadata = { title: C.title };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requirePerm('pricing.manage');
  const sp = await searchParams;
  const canComm = can(staff, 'commission.manage');
  const raw = first(sp.tab);
  // the commission tab needs its own permission (the API checks it too)
  const tab: PricingTab = raw === 'history' ? 'history' : raw === 'commission' && canComm ? 'commission' : 'rules';
  const page = parsePage(first(sp.page));
  const options = [
    { value: 'rules', label: C.tabs.rules },
    ...(canComm ? [{ value: 'commission', label: C.tabs.commission }] : []),
    { value: 'history', label: C.tabs.history },
  ];
  return (
    <>
      <PageHeader title={C.title} subtitle={C.subtitle} />
      <div className="mb-4">
        <UnderlineTabs basePath="/admin/pricing" params={{}} name="tab" value={tab} options={options} label={C.tabsLabel} />
      </div>
      <Suspense
        key={`${tab}|${page}`}
        fallback={
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <ListSkeleton rows={6} />
          </div>
        }
      >
        <PricingView tab={tab} page={page} staff={staff} />
      </Suspense>
    </>
  );
}
