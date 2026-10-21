import { throwRpcError } from '@/features/team/server';
import { staffRoute } from '@/lib/api/handler';
import { UpsertRoleRequest } from '@/lib/contracts/admin';
import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * Create a role or edit one (name, description, permission set) in one
 * transaction. owner is locked, admin is the owner's, and nobody grants a
 * permission they do not hold — all enforced by upsert_role.
 */
export const POST = staffRoute('team.manage', UpsertRoleRequest, async ({ body }) => {
  const sb = await getSupabaseServer();
  const { data, error } = await sb.rpc('upsert_role', {
    p_key: body.key,
    p_name: body.nameTh,
    p_description: body.description,
    p_permissions: body.permissions,
  });
  if (error) throwRpcError('upsert_role', error);
  return { ok: true as const, result: data as 'created' | 'updated' };
});
