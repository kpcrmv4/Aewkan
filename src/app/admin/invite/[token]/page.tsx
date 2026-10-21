import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AcceptForm } from '@/features/team/accept-form';
import { looksLikeToken } from '@/lib/auth/link-token';
import { ACCEPT_COPY as A } from '@/lib/copy/team';
import { formatDeadline } from '@/lib/format';
import { getSupabaseServer } from '@/lib/supabase/server';

export const metadata = { title: A.title, robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

interface InviteView {
  email: string;
  role_key: string;
  role_name: string;
  company_th: string;
  company_en: string;
  expires_at: string;
}

/**
 * Public (the proxy leaves /admin/invite open). A wrong, revoked, used or
 * expired token all render the same 404 page — nothing about the invite leaks.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!looksLikeToken(token)) notFound();
  const sb = await getSupabaseServer();
  const [{ data, error }, { data: claims }] = await Promise.all([sb.rpc('get_staff_invite', { p_token: token }), sb.auth.getClaims()]);
  if (error) throw new Error(`get_staff_invite: ${error.message}`);
  if (!data) notFound();
  const invite = data as unknown as InviteView;
  const signedInEmail = typeof claims?.claims?.email === 'string' && claims.claims.email ? claims.claims.email : null;

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold text-ink">{A.title}</h1>
        <p className="mb-4 text-sm text-muted-token">{A.intro(invite.company_th)}</p>
        <dl className="card-surface mb-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 p-4 text-sm" data-testid="invite-summary">
          <dt className="text-muted-token">{A.email}</dt>
          <dd className="break-all font-medium text-ink">{invite.email}</dd>
          <dt className="text-muted-token">{A.role}</dt>
          <dd className="font-medium text-ink">{invite.role_name}</dd>
          <dd className="col-span-2 text-muted-token">{A.expires(formatDeadline(invite.expires_at, 'th'))}</dd>
        </dl>
        {/* useSearchParams (the ?code= return from the confirmation email) needs a boundary */}
        <Suspense fallback={<div className="card-surface h-64 animate-pulse" />}>
          <AcceptForm token={token} email={invite.email} signedInEmail={signedInEmail} />
        </Suspense>
      </div>
    </main>
  );
}
