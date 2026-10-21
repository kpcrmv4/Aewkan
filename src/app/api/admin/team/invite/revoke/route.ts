import { z } from 'zod';
import { throwRpcError } from '@/features/team/server';
import { staffRoute } from '@/lib/api/handler';
import { uuid } from '@/lib/contracts/common';
import { getSupabaseServer } from '@/lib/supabase/server';

const RevokeInviteRequest = z.object({ inviteId: uuid });

/** revoke a pending invite (revoked_at = now(); the row stays for history) */
export const POST = staffRoute('team.manage', RevokeInviteRequest, async ({ body }) => {
  const sb = await getSupabaseServer();
  const { error } = await sb.rpc('revoke_staff_invite', { p_id: body.inviteId });
  if (error) throwRpcError('revoke_staff_invite', error);
  return { ok: true as const };
});
