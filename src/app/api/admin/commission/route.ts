import { dbFail } from '@/features/admin-settings/db-error';
import { ApiError, staffRoute } from '@/lib/api/handler';
import { UpsertCommissionRequest } from '@/lib/contracts/admin';
import { getSupabaseServer } from '@/lib/supabase/server';

/** one commission rule per place (primary key place_id): create or replace */
export const POST = staffRoute('commission.manage', UpsertCommissionRequest, async ({ body }) => {
  // amount is a percentage for "sale"
  if (body.type === 'sale' && body.amount > 100) throw new ApiError(422, 'validation', 'amount: ค่าน้ำแบบ % ต้องไม่เกิน 100');

  const sb = await getSupabaseServer();
  const { data: rules, error: rErr } = await sb.from('pricing_rule_sets').select('rules').eq('is_current', true).maybeSingle();
  if (rErr) dbFail(rErr, 'rules read');
  const splits = (rules?.rules as { commission?: { splits?: Record<string, unknown> } } | null)?.commission?.splits ?? {};
  if (!Object.hasOwn(splits, body.splitKey)) throw new ApiError(422, 'invalid_split', 'ไม่มีการแบ่งนี้ในกฎราคาปัจจุบัน');

  const { data, error } = await sb
    .from('commission_rules')
    .upsert({ place_id: body.placeId, type: body.type, amount: body.amount, split_key: body.splitKey, note: body.note }, { onConflict: 'place_id' })
    .select('place_id')
    .maybeSingle();
  if (error) dbFail(error, 'commission upsert');
  if (!data) throw new ApiError(403, 'forbidden', 'ไม่มีสิทธิ์ทำรายการนี้');
  return { ok: true as const };
});
