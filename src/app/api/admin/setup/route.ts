import { z } from 'zod';
import { ApiError, publicRoute } from '@/lib/api/handler';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const SetupRequest = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10).max(200),
});

/**
 * First-run owner creation. Open only while app_settings.owner_id is null.
 * Two writes that cannot share a transaction (auth user, then the owner
 * claim) → if the claim loses a race, the auth user is deleted again.
 */
export const POST = publicRoute(
  async () => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc('owner_exists');
    if (error) throw new Error(`owner_exists: ${error.message}`);
    if (data) throw new ApiError(404, 'not_found', 'ไม่พบหน้านี้');
    return { admin };
  },
  SetupRequest,
  async ({ auth: { admin }, body }) => {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.fullName },
    });
    if (createErr || !created.user) {
      throw new ApiError(422, 'create_failed', createErr?.message.includes('already') ? 'อีเมลนี้มีบัญชีอยู่แล้ว' : 'สร้างบัญชีไม่สำเร็จ');
    }
    const userId = created.user.id;
    const { error: staffErr } = await admin.from('staff').insert({ id: userId, email: body.email, full_name: body.fullName, role_key: 'owner' });
    if (!staffErr) {
      const { data: claimed, error: claimErr } = await admin
        .from('app_settings')
        .update({ owner_id: userId })
        .eq('id', true)
        .is('owner_id', null)
        .select('owner_id')
        .maybeSingle();
      if (!claimErr && claimed) return { ok: true };
    }
    // compensating delete: someone else became owner first, or the staff insert failed
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) console.error('[setup] compensating delete failed', { userId, error: delErr.message });
    throw new ApiError(409, 'owner_exists', 'มีเจ้าของระบบแล้ว');
  },
);
