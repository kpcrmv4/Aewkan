'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { BRAND } from '@/lib/copy/common';
import { useLang } from './lang';

/** header shared by the trip builder (P1) and the job link (P3) */
export function PublicHeader({ right }: { right?: ReactNode }) {
  const { lang, setLang } = useLang();
  return (
    <header className="mx-auto flex h-[58px] max-w-[1180px] items-center gap-3.5" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))' }}>
      <Link href="/" className="flex items-center gap-2.5 font-heading text-lg font-semibold text-ink">
        <span className="grid size-8 place-items-center rounded-sm bg-brand-solid text-sm font-semibold text-on-brand">{BRAND.mark}</span>
        <span>
          {BRAND.th} <span className="text-sm font-medium text-muted-token">{BRAND.en}</span>
        </span>
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <div role="group" aria-label={lang === 'en' ? 'Language' : 'ภาษา'} className="inline-flex gap-0.5 rounded-pill border border-line bg-surface p-[3px]">
          {(['th', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              onClick={() => setLang(l)}
              className={`min-h-[30px] rounded-pill px-3 text-[13px] ${lang === l ? 'bg-ink font-semibold text-canvas' : 'text-ink-2'}`}
            >
              {l === 'th' ? 'ไทย' : 'EN'}
            </button>
          ))}
        </div>
        {right}
      </div>
    </header>
  );
}
