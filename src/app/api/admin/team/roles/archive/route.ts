import { z } from 'zod';
import { ROLE_KEY_RE } from '@/features/team/model';
import { throwRpcError } from '@/features/team/server';
import { staffRoute } from '@/lib/api/handler';
import { getSupabaseServer } from '@/lib/supabase/server';

const ArchiveRoleRequest = z.object({ key: z.string().regex(ROLE_KEY_RE) });

/**
 * "Delete" a role: archived_at = now(). Refused while any staff row (active or
 * not) uses it or a live invite points at it; system roles never.
 */
export const POST = staffRoute('team.manage', ArchiveRoleRequest, async ({ body }) => {
  const sb = await getSupabaseServer();
  const { error } = await sb.rpc('archive_role', { p_key: body.key });
  if (error) throwRpcError('archive_role', error);
  return { ok: true as const };
});
