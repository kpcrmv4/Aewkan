'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { ErrorRetry } from '@/components/ui/error-retry';

/** error state of a server-rendered list: retry re-runs the server render */
export function RefreshRetry({ message }: { message: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div aria-busy={pending}>
      <ErrorRetry message={message} onRetry={() => start(() => router.refresh())} />
    </div>
  );
}
