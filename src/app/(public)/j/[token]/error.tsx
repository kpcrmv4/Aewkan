'use client';

import { PublicHeader } from '@/components/public/public-header';
import { useLang } from '@/components/public/lang';
import { ErrorRetry } from '@/components/ui/error-retry';
import { jt } from '@/lib/copy/job';

export default function JobLinkError({ reset }: { error: Error; reset: () => void }) {
  const { lang } = useLang();
  return (
    <div className="min-h-dvh">
      <PublicHeader />
      <main className="mx-auto max-w-[720px] px-4 pt-6">
        <ErrorRetry onRetry={reset} message={jt('loadFail', lang)} retryLabel={jt('retry', lang)} />
      </main>
    </div>
  );
}
