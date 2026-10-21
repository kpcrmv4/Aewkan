import { invitePath } from '@/features/team/model';
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

  // the page builds the absolute link from the address bar it is on (the server
  // behind a proxy or in dev cannot know the public host); `url` is for API callers
  return {
    ok: true as const,
    inviteId: created.id,
    expiresAt: created.expires_at,
    path: invitePath(token),
    url: `${new URL(req.url).origin}${invitePath(token)}`,
    company: settings?.company_name_th ?? '',
    roleName: role?.name_th ?? body.roleKey,
  };
});
