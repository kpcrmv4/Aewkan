import { inviteMessage, invitePath } from '@/features/team/model';
import { throwRpcError } from '@/features/team/server';
import { staffRoute } from '@/lib/api/handler';
import { newToken } from '@/lib/auth/link-token';
import { InviteRequest } from '@/lib/contracts/admin';
import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * Create a staff invite (or a new link for the same address — the RPC revokes
 * the older live one). The raw token is returned once and never stored.
 * Sending over LINE / email is P4; the staff copies the link and message.
 */
export const POST = staffRoute('team.manage', InviteRequest, async ({ body, req }) => {
  const sb = await getSupabaseServer();
  const token = newToken();
  const { data, error } = await sb.rpc('create_staff_invite', { p_email: body.email, p_role: body.roleKey, p_token: token });
  if (error) throwRpcError('create_staff_invite', error);
  const created = data as { id: string; expires_at: string };

  const [{ data: role, error: rErr }, { data: settings, error: sErr }] = await Promise.all([
    sb.from('roles').select('name_th').eq('key', body.roleKey).maybeSingle(),
    sb.from('app_settings').select('company_name_th').eq('id', true).maybeSingle(),
  ]);
  if (rErr || sErr) throw new Error(`invite lookup: ${(rErr ?? sErr)?.message}`);

  const path = invitePath(token);
  const url = `${new URL(req.url).origin}${path}`;
  return {
    ok: true as const,
    inviteId: created.id,
    expiresAt: created.expires_at,
    path,
    message: inviteMessage({ company: settings?.company_name_th ?? '', roleName: role?.name_th ?? body.roleKey, url, expiresAt: created.expires_at }),
  };
});
