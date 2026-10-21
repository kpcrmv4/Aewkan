import { Suspense } from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { ListSkeleton } from '@/components/ui/states';
import { IntegrationsView } from '@/features/integrations/integrations-view';
import { requirePerm } from '@/lib/auth/require';
import { INTEG_COPY } from '@/lib/copy/pay';

export const metadata = { title: INTEG_COPY.title };

export default async function Page() {
  const staff = await requirePerm('integrations.manage');
  return (
    <>
      <PageHeader title={INTEG_COPY.title} subtitle={INTEG_COPY.subtitle} />
      <Suspense fallback={<ListSkeleton rows={7} />}>
        <IntegrationsView staffEmail={staff.email} />
      </Suspense>
    </>
  );
}
