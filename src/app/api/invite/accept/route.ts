import { z } from 'zod';
import { throwRpcError } from '@/features/team/server';
import { ApiError, publicRoute } from '@/lib/api/handler';
import { looksLikeToken } from '@/lib/auth/link-token';
import { teamErrorText } from '@/lib/copy/team';
import { getSupabaseServer } from '@/lib/supabase/server';

const AcceptInviteRequest = z.object({
  token: z.string().refine(looksLikeToken, 'invalid token'),
  fullName: z.string().trim().min(1).max(120),
});

/**
 * The invitee (signed in with the invited, confirmed address) claims the
 * invite. Session first (401), then body (422); accept_staff_invite checks the
 * token, expiry, revocation, single use and that the account email matches.
 */
export const POST = publicRoute(
  async () => {
    const sb = await getSupabaseServer();
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user) throw new ApiError(401, 'unauthenticated', teamErrorText('not_signed_in'));
    return { sb };
  },
  AcceptInviteRequest,
  async ({ auth: { sb }, body }) => {
    const { data, error } = await sb.rpc('accept_staff_invite', { p_token: body.token, p_full_name: body.fullName });
    if (error) throwRpcError('accept_staff_invite', error);
    return { ok: true as const, roleKey: data as string };
  },
);
