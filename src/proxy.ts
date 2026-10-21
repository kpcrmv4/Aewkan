import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // sw.js and the manifest MUST stay out — a 307 on /sw.js kills PWA install and
  // web push for visitors who are not signed in (nextjs-supabase-ssr-auth Bug #4)
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|icons/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)',
  ],
};
