'use client';

import Link from 'next/link';
import { LinkIcon } from 'lucide-react';
import { PublicHeader } from '@/components/public/public-header';
import { useLang } from '@/components/public/lang';
import { jt } from '@/lib/copy/job';

export default function JobLinkNotFound() {
  const { lang } = useLang();
  return (
    <div className="min-h-dvh">
      <PublicHeader />
      <main className="mx-auto max-w-[720px] px-4 pt-6" style={{ paddingBottom: 'calc(var(--public-bottom-h, 0px) + 24px)' }}>
        <div className="panel px-6 py-12 text-center" data-testid="job-not-found">
          <span className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-surface-2 text-muted-token ring-1 ring-inset ring-line">
            <LinkIcon className="size-5" aria-hidden />
          </span>
          <h1 className="text-xl font-semibold">{jt('notFoundTitle', lang)}</h1>
          <p className="mx-auto mt-2 mb-5 max-w-[46ch] text-base text-muted-token">{jt('notFoundSub', lang)}</p>
          <Link href="/" className="btn-secondary mx-auto">
            {jt('goHome', lang)}
          </Link>
        </div>
      </main>
    </div>
  );
}
