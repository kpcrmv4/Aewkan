import { dbFail } from '@/features/admin-settings/db-error';
import { firstRulesIssue, RulesSchema } from '@/features/admin-settings/rules-schema';
import { ApiError, staffRoute } from '@/lib/api/handler';
import { PublishRulesRequest } from '@/lib/contracts/admin';
import type { Json } from '@/lib/database.types';
import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * Publish a new rule set version (publish_rule_set RPC flips is_current).
 * Bookings keep the rule_version they were priced with; only new quotes use this.
 */
export const POST = staffRoute('pricing.manage', PublishRulesRequest, async ({ body }) => {
  const parsed = RulesSchema.safeParse(body.rules);
  if (!parsed.success) throw new ApiError(422, 'invalid_rules', firstRulesIssue(parsed.error));
  const rules = parsed.data;

  const sb = await getSupabaseServer();

  // every active driver's car type must still exist in the new rules
  const { data: drivers, error: dErr } = await sb.from('drivers').select('vehicle_key').eq('is_active', true).order('id').range(0, 999);
  if (dErr) dbFail(dErr, 'drivers read');
  const missing = [...new Set((drivers ?? []).map((d) => d.vehicle_key))].filter((k) => !Object.hasOwn(rules.vehicles, k));
  if (missing.length) throw new ApiError(422, 'vehicle_in_use', `ประเภทรถ ${missing.join(', ')} ยังมีคนขับใช้อยู่ ลบออกจากกฎไม่ได้`);

  const { data: version, error } = await sb.rpc('publish_rule_set', { p_rules: rules as unknown as Json, p_note: body.note });
  if (error) dbFail(error, 'publish_rule_set');
  if (typeof version !== 'number') throw new Error('publish_rule_set: no version returned');
  return { ok: true as const, version };
});
