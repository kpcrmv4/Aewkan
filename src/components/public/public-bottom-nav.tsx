'use client';

import { Languages, Map, Ticket } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { useLang } from './lang';

const NavVisibility = createContext<((hidden: boolean) => void) | null>(null);

const COPY = {
  plan: { th: 'วางทริป', en: 'Plan trip' },
  trips: { th: 'ทริปของฉัน', en: 'My trips' },
  lang: { th: 'English', en: 'ภาษาไทย' },
  menu: { th: 'เมนู', en: 'Menu' },
} as const;

/**
 * Customer tab bar on phones/tablets (< lg). Pages put sticky bars at
 * `bottom: var(--public-bottom-h)` so they sit above it; the variable is 0 on
 * desktop and while the bar is hidden (driver view → <HidePublicNav />).
 */
export function PublicChrome({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  return (
    <NavVisibility value={setHidden}>
      <div data-public-nav={hidden ? 'off' : 'on'} className="public-chrome min-h-dvh">
        {children}
        {!hidden && <PublicBottomNav />}
      </div>
    </NavVisibility>
  );
}

/** render inside a page that must not show the customer menu (driver job link) */
export function HidePublicNav() {
  const setHidden = use(NavVisibility);
  useEffect(() => {
    setHidden?.(true);
    return () => setHidden?.(false);
  }, [setHidden]);
  return null;
}

function PublicBottomNav() {
  const path = usePathname();
  const { lang, setLang } = useLang();
  const item = 'flex min-h-11 flex-col items-center justify-center gap-0.5 text-[11px]';
  const tone = (on: boolean) => (on ? 'font-semibold text-brand' : 'text-muted-token');
  const onPlan = path === '/';
  const onTrips = path === '/trips' || path.startsWith('/j/');
  return (
    <nav
      aria-label={COPY.menu[lang]}
      className="fixed inset-x-0 bottom-0 z-20 grid h-16 grid-cols-3 border-t border-line bg-surface lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', boxSizing: 'content-box' }}
    >
      <Link href="/" aria-current={onPlan ? 'page' : undefined} className={`${item} ${tone(onPlan)}`}>
        <Map className="size-5" aria-hidden />
        <span>{COPY.plan[lang]}</span>
      </Link>
      <Link href="/trips" aria-current={onTrips ? 'page' : undefined} className={`${item} ${tone(onTrips)}`}>
        <Ticket className="size-5" aria-hidden />
        <span>{COPY.trips[lang]}</span>
      </Link>
      <button type="button" onClick={() => setLang(lang === 'th' ? 'en' : 'th')} className={`${item} ${tone(false)}`}>
        <Languages className="size-5" aria-hidden />
        <span>{COPY.lang[lang]}</span>
      </button>
    </nav>
  );
}
