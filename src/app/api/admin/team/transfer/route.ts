import { z } from 'zod';
import { throwRpcError } from '@/features/team/server';
import { ApiError, staffRoute } from '@/lib/api/handler';
import { TransferOwnershipRequest } from '@/lib/contracts/admin';
import { teamErrorText } from '@/lib/copy/team';
import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * Owner only. The body is parsed after the owner check so a non-owner gets
 * 403 before any 422 (who first, then what). transfer_ownership makes the new
 * owner `owner` and the old owner `admin` in one transaction.
 */
export const POST = staffRoute('team.manage', z.unknown(), async ({ staff, body }) => {
  if (!staff.isOwner) throw new ApiError(403, 'owner_only', teamErrorText('owner_only'));
  const parsed = TransferOwnershipRequest.safeParse(body);
  if (!parsed.success) throw new ApiError(422, 'validation', teamErrorText('validation'));
  if (parsed.data.newOwnerId === staff.id) throw new ApiError(422, 'transfer_to_self', teamErrorText('transfer_to_self'));

  const sb = await getSupabaseServer();
  const { error } = await sb.rpc('transfer_ownership', { p_new_owner: parsed.data.newOwnerId });
  if (error) throwRpcError('transfer_ownership', error);
  return { ok: true as const };
});
