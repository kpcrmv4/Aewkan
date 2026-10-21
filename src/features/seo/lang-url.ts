/**
 * One language per URL (SEO). Thai lives at `/` and `/places/<slug>`, English at
 * `/en` and `/en/places/<slug>`. Every other page (my trips, job links, admin)
 * is not localized by URL and follows the visitor's cookie.
 * `src/proxy.ts` applies the same rule to the request header `x-aewkan-url-lang`.
 */

export type UrlLang = 'th' | 'en';

export const URL_LANG_HEADER = 'x-aewkan-url-lang';

/** language the path itself decides, or null when the path is not localized */
export function urlLangOf(pathname: string): UrlLang | null {
  if (pathname === '/en' || pathname.startsWith('/en/')) return 'en';
  if (pathname === '/' || pathname.startsWith('/places/')) return 'th';
  return null;
}

/** the same page in the other language; null when the path is not localized */
export function switchPath(pathname: string, to: UrlLang): string | null {
  const from = urlLangOf(pathname);
  if (!from) return null;
  if (from === to) return pathname;
  if (to === 'en') return pathname === '/' ? '/en' : `/en${pathname}`;
  const rest = pathname.slice(3);
  return rest === '' ? '/' : rest;
}

export const homePath = (lang: UrlLang) => (lang === 'en' ? '/en' : '/');
export const placePath = (lang: UrlLang, slug: string) => `${lang === 'en' ? '/en' : ''}/places/${encodeURIComponent(slug)}`;
/** trip builder prefilled with these places */
export const planPath = (lang: UrlLang, slugs: string[]) => `${homePath(lang)}?places=${slugs.map(encodeURIComponent).join(',')}`;
