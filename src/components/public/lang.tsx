'use client';

import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'th' | 'en';

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void } | null>(null);

const KEY = 'aewkan.lang';

/** customer-facing language: remembered per browser; starts from the server's guess */
export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'th' || saved === 'en') setLangState(saved);
    } catch {
      /* storage blocked: keep the initial language */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* ignore */
    }
    document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
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
