'use client';

import { PublicHeader } from '@/components/public/public-header';
import { useLang } from '@/components/public/lang';

export function JobLinkPlaceholder({ hasToken }: { hasToken: boolean }) {
  const { lang } = useLang();
  return (
    <div className="min-h-dvh">
      <PublicHeader />
      <main className="mx-auto max-w-[720px] px-4 pt-6">
        <div className="panel p-6 text-center text-muted-token">
          {hasToken ? (lang === 'en' ? 'Job details arrive in phase P3.' : 'หน้ารายละเอียดงานจะพร้อมในเฟส P3') : null}
        </div>
      </main>
    </div>
  );
}
