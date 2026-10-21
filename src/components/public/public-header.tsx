'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { homePath } from '@/features/seo/lang-url';
import { BRAND } from '@/lib/copy/common';
import { useLang } from './lang';
import { LangSwitch } from './lang-switch';

const BRAND_EN = 'AewKan';

/** header shared by the trip builder (P1), the place pages (SEO) and the job link (P3) */
export function PublicHeader({ right }: { right?: ReactNode }) {
  const { lang } = useLang();
  return (
    <header className="mx-auto flex h-[58px] max-w-[1180px] items-center gap-3.5" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))' }}>
      <Link href={homePath(lang)} className="flex shrink-0 items-center" data-testid="brand-home">
        {/* wordmark 2062x713: fixed width/height (no layout shift), webp in three sizes */}
        <picture>
          <source
            type="image/webp"
            srcSet="/brand/aewkan-logo-240.webp 240w, /brand/aewkan-logo-480.webp 480w, /brand/aewkan-logo-960.webp 960w"
            sizes="110px"
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- picture/source gives webp with a png fallback */}
          <img src="/brand/aewkan-logo-480.png" width={110} height={38} alt={lang === 'en' ? `${BRAND_EN} ${BRAND.th}` : `${BRAND.th} ${BRAND_EN}`} className="h-[38px] w-[110px] object-contain" fetchPriority="high" decoding="async" />
        </picture>
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <LangSwitch variant="pill" />
        {right}
      </div>
    </header>
  );
}
