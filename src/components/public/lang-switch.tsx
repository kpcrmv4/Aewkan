'use client';

import { Languages } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { switchPath } from '@/features/seo/lang-url';
import { useLang, type Lang } from './lang';

/**
 * Language switch shared by the header (pill group) and the phone tab bar (one tab).
 * On a localized page it is a real link to the same page in the other language
 * (query kept, crawlable with `hreflang`) and still saves the choice for /trips and job links.
 * Elsewhere it flips the language in place, as before.
 */
export function LangSwitch({ variant }: { variant: 'pill' | 'tab' }) {
  return (
    <Suspense fallback={<SwitchView variant={variant} search="" />}>
      <WithSearch variant={variant} />
    </Suspense>
  );
}

function WithSearch({ variant }: { variant: 'pill' | 'tab' }) {
  const search = useSearchParams().toString();
  return <SwitchView variant={variant} search={search} />;
}

const LABEL: Record<Lang, string> = { th: 'ไทย', en: 'EN' };
const TAB_LABEL: Record<Lang, string> = { th: 'ภาษาไทย', en: 'English' };

function SwitchView({ variant, search }: { variant: 'pill' | 'tab'; search: string }) {
  const { lang, setLang } = useLang();
  const pathname = usePathname();
  const hrefFor = (to: Lang) => {
    const p = switchPath(pathname, to);
    return p === null ? null : search ? `${p}?${search}` : p;
  };

  if (variant === 'tab') {
    // the tab shows the language you would switch TO
    const to: Lang = lang === 'th' ? 'en' : 'th';
    const href = hrefFor(to);
    const cls = 'flex min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-token';
    const inner = (
      <>
        <Languages className="size-5" aria-hidden />
        <span>{TAB_LABEL[to]}</span>
      </>
    );
    return href === null ? (
      <button type="button" onClick={() => setLang(to)} className={cls}>
        {inner}
      </button>
    ) : (
      <Link href={href} hrefLang={to} lang={to} onClick={() => setLang(to)} className={cls}>
        {inner}
      </Link>
    );
  }

  return (
    <div role="group" aria-label={lang === 'en' ? 'Language' : 'ภาษา'} className="inline-flex gap-0.5 rounded-pill border border-line bg-surface p-[3px]">
      {(['th', 'en'] as const).map((l) => {
        const on = lang === l;
        const cls = `inline-flex min-h-[30px] items-center rounded-pill px-3 text-[13px] ${on ? 'bg-ink font-semibold text-canvas' : 'text-ink-2'}`;
        const href = hrefFor(l);
        return href === null ? (
          <button key={l} type="button" aria-pressed={on} onClick={() => setLang(l)} className={cls}>
            {LABEL[l]}
          </button>
        ) : (
          <Link key={l} href={href} hrefLang={l} lang={l} aria-current={on ? 'true' : undefined} onClick={() => setLang(l)} className={cls}>
            {LABEL[l]}
          </Link>
        );
      })}
    </div>
  );
}
