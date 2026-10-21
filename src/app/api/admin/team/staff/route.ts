import { throwRpcError } from '@/features/team/server';
import { ApiError, staffRoute } from '@/lib/api/handler';
import { UpdateStaffRequest } from '@/lib/contracts/admin';
import { teamErrorText } from '@/lib/copy/team';
import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * Change another staff member's role and/or active flag. update_staff refuses
 * your own row, the owner's row, roles above you and grants beyond yours.
 */
export const POST = staffRoute('team.manage', UpdateStaffRequest, async ({ staff, body }) => {
  if (body.roleKey === undefined && body.isActive === undefined) {
    throw new ApiError(422, 'nothing_to_change', teamErrorText('nothing_to_change'));
  }
  if (body.staffId === staff.id) throw new ApiError(403, 'cannot_change_self', teamErrorText('cannot_change_self'));
  const sb = await getSupabaseServer();
  const { error } = await sb.rpc('update_staff', {
    p_staff: body.staffId,
    p_role: body.roleKey,
    p_active: body.isActive,
  });
  if (error) throwRpcError('update_staff', error);
  return { ok: true as const };
});
