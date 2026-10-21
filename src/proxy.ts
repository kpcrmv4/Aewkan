import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Language that the URL itself decides (SEO: one language per URL).
 * `/en` and `/en/*` are English · `/` and `/places/*` are Thai · every other
 * page (my trips, job links, admin) keeps the visitor's cookie choice.
 * Server components read it from the `x-aewkan-url-lang` request header.
 */
function urlLang(path: string): 'th' | 'en' | '' {
  if (path === '/en' || path.startsWith('/en/')) return 'en';
  if (path === '/' || path.startsWith('/places/')) return 'th';
  return '';
}

export async function proxy(request: NextRequest) {
  // never trust a client-sent copy of the header
  request.headers.delete('x-aewkan-url-lang');
  const lang = urlLang(request.nextUrl.pathname);
  if (lang) request.headers.set('x-aewkan-url-lang', lang);
  return updateSession(request);
}

export const config = {
  // sw.js and the manifest MUST stay out — a 307 on /sw.js kills PWA install and
  // web push for visitors who are not signed in (nextjs-supabase-ssr-auth Bug #4)
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|icons/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)',
  ],
};
