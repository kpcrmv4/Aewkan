'use client';

import { usePathname } from 'next/navigation';
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
import { urlLangOf } from '@/features/seo/lang-url';

export type Lang = 'th' | 'en';

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void } | null>(null);

const KEY = 'aewkan.lang';

function saveLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
  document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
}

function hasSavedLang(): boolean {
  try {
    if (localStorage.getItem(KEY)) return true;
  } catch {
    /* storage blocked */
  }
  return /(?:^|;\s*)lang=(?:th|en)\b/.test(document.cookie);
}

/**
 * Customer-facing language. On a localized URL (`/`, `/en`, `/places/*`,
 * `/en/places/*`) the URL decides and a saved choice never overrides it. Elsewhere
 * (my trips, job links) the remembered choice applies; it starts from the server's guess.
 */
export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const pathname = usePathname();
  const fromUrl = urlLangOf(pathname);
  const [pref, setPref] = useState<Lang>(initial);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after mount
      if (saved === 'th' || saved === 'en') setPref(saved);
    } catch {
      /* storage blocked: keep the initial language */
    }
  }, []);
  // a visitor who arrives on the English URL and has never chosen: remember it for /trips and job links
  useEffect(() => {
    if (fromUrl === 'en' && !hasSavedLang()) {
      saveLang('en');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the cookie just written so /trips follows after a soft navigation
      setPref('en');
    }
  }, [fromUrl]);
  const lang: Lang = fromUrl ?? pref;
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setPref(l);
    saveLang(l);
  }, []);
  return <LangContext value={{ lang, setLang }}>{children}</LangContext>;
}

export function useLang() {
  const ctx = use(LangContext);
  if (!ctx) throw new Error('useLang must be used inside LangProvider');
  return ctx;
}

/** pick the string for the current language: t({ th, en }) */
export function useT() {
  const { lang } = useLang();
  return <T extends { th: string; en: string }>(s: T) => s[lang];
}
