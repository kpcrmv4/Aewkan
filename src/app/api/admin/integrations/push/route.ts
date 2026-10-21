import { ApiError, staffRoute } from '@/lib/api/handler';
import { PushKeysRequest, type PushConfigState } from '@/lib/contracts/payment';
import { generateVapid } from '@/lib/integrations/push';
import { getSupabaseServer } from '@/lib/supabase/server';

const SUBJECT_RE = /^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/;

/**
 * POST /api/admin/integrations/push — the one stable VAPID pair (R-010). Keys are generated
 * here on the server; the private half goes straight into Vault through set_push_keys under
 * the staff session and is never returned. 'rotate' replaces an existing pair on purpose.
 */
export const POST = staffRoute('integrations.manage', PushKeysRequest, async ({ staff, body }): Promise<PushConfigState | null> => {
  const sb = await getSupabaseServer();
  const subject = body.subject?.trim() || `mailto:${staff.email}`;
  if (!SUBJECT_RE.test(subject)) throw new ApiError(422, 'bad_config', 'ผู้ติดต่อต้องขึ้นต้นด้วย mailto: หรือ https://');

  if (body.action === 'generate' || body.action === 'rotate') {
    const keys = generateVapid();
    const { error } = await sb.rpc('set_push_keys', { p_public: keys.publicKey, p_private: keys.privateKey, p_subject: subject, p_replace: body.action === 'rotate' });
    if (error?.message === 'push_keys_exist') throw new ApiError(409, 'push_keys_exist', 'มีกุญแจอยู่แล้ว');
    if (error) throw new Error(`set_push_keys: ${error.message}`);
  } else {
    const cur = await read(sb);
    if (!cur) throw new ApiError(409, 'push_keys_missing', 'ยังไม่มีกุญแจ');
    const enabled = body.action === 'enable' ? true : body.action === 'disable' ? false : cur.isEnabled;
    const { error } = await sb.rpc('set_push_settings', { p_enabled: enabled, p_subject: body.action === 'subject' ? subject : cur.subject });
    if (error) throw new Error(`set_push_settings: ${error.message}`);
  }
  return read(sb);
});

async function read(sb: Awaited<ReturnType<typeof getSupabaseServer>>): Promise<PushConfigState | null> {
  const { data, error } = await sb.rpc('get_push_config');
  if (error) throw new Error(`get_push_config: ${error.message}`);
  const c = data as { public_key: string; subject: string; is_enabled: boolean; created_at: string } | null;
  return c ? { publicKey: c.public_key, subject: c.subject, isEnabled: c.is_enabled, createdAt: c.created_at } : null;
}
