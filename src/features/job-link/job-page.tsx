'use client';

import { useEffect } from 'react';
import { PublicHeader } from '@/components/public/public-header';
import { useLang } from '@/components/public/lang';
import { ErrorRetry } from '@/components/ui/error-retry';
import type { JobViewJson } from '@/lib/contracts/job';
import { jt } from '@/lib/copy/job';
import { CustomerView } from './customer-view';
import { DriverView } from './driver-view';
import { useCatalog, useJob, useNow } from './job-client';
import { useVehicleName } from './parts';

/** client root of /j/[token]: starts in the booking's language (the header switch overrides), then picks the audience view */
export function JobPage({ token, initial, serverNow }: { token: string; initial: JobViewJson; serverNow: number }) {
  const { lang, setLang } = useLang();
  const { job, refresh, failed, refreshing } = useJob(token, initial);
  const now = useNow(serverNow);
  const cat = useCatalog();
  const vehicle = useVehicleName(job.vehicleKey, cat.data?.json.rules?.rules.vehicles, lang);

  // customer: the booking's language · driver: Thai (the header switch changes either)
  const start = job.audience === 'driver' ? 'th' : job.lang;
  useEffect(() => {
    setLang(start);
    // once per page load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-dvh" data-audience={job.audience} aria-busy={refreshing || undefined}>
      <PublicHeader />
      <main className="mx-auto w-full max-w-[720px] px-4 pt-3" style={{ paddingBottom: 'calc(var(--public-bottom-h, 0px) + 24px)' }}>
        {failed ? (
          <div className="mb-4">
            <ErrorRetry onRetry={refresh} message={jt('loadFail', lang)} retryLabel={jt('retry', lang)} />
          </div>
        ) : null}
        {job.audience === 'driver' ? (
          <DriverView job={job} token={token} vehicle={vehicle} refresh={refresh} />
        ) : (
          <CustomerView job={job} token={token} now={now} vehicle={vehicle} refresh={refresh} />
        )}
      </main>
    </div>
  );
}
