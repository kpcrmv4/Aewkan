import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/env';

/** admin pages that must stay reachable without a session */
const ADMIN_PUBLIC = ['/admin/login', '/admin/setup', '/admin/invite'];

/**
 * Refresh the staff session on every request and gate /admin/*.
 * The customer site (/, /j/*) is public and never redirected.
 * /api/* is never redirected either — routes return JSON 401 themselves (Bug #1).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims verifies the JWT locally with asymmetric keys (no network round-trip)
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const path = request.nextUrl.pathname;
  const isAdmin = path === '/admin' || path.startsWith('/admin/');
  const isAdminPublic = ADMIN_PUBLIC.some((p) => path === p || path.startsWith(`${p}/`));

  if (isAdmin && !isAdminPublic && !signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }
  // Bug #3: the login page only bounces signed-in users when nothing special is
  // shown (an inactive staff row is handled on the page itself, not here).
  if (signedIn && path === '/admin/login' && !request.nextUrl.searchParams.has('reason')) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}
