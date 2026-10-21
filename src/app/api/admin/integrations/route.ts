import { ApiError, staffRoute } from '@/lib/api/handler';
import { SaveIntegrationRequest, type IntegrationState } from '@/lib/contracts/payment';
import { badSecret, checkConfig, integrationDef, isSingleSecret, missingSecret, secretsAfter } from '@/lib/integrations/catalog';
import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * POST /api/admin/integrations — save one integration with the staff session (R-001).
 * Secrets: undefined = keep · '' = clear · value = replace. They go straight into Vault
 * (set_integration_secret / merge_integration_secret) and are never returned: the response
 * names the fields that are set, nothing more.
 */
export const POST = staffRoute('integrations.manage', SaveIntegrationRequest, async ({ staff, body }): Promise<IntegrationState> => {
  const def = integrationDef(body.key)!;
  const cfg = checkConfig(def, body.config, body.isEnabled);
  if (!cfg.ok) throw new ApiError(422, cfg.code, cfg.code === 'config_incomplete' ? `กรอก ${cfg.field} ก่อนเปิดใช้งาน` : `รูปแบบ ${cfg.field} ไม่ถูกต้อง`);

  const patch: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.secrets ?? {})) patch[k] = v.trim();
  if (body.secret !== undefined && isSingleSecret(def)) patch[def.secrets[0].name] = body.secret.trim();
  const bad = badSecret(def, patch);
  if (bad) throw new ApiError(422, 'bad_secret', `รูปแบบ ${bad} ไม่ถูกต้อง`);

  const sb = await getSupabaseServer();
  const { data: fieldsJson, error: fErr } = await sb.rpc('integration_secret_fields');
  if (fErr) throw new Error(`integration_secret_fields: ${fErr.message}`);
  const stored = ((fieldsJson as Record<string, string[]> | null)?.[def.key] ?? []) as string[];
  const after = secretsAfter(def, stored, patch);
  if (body.isEnabled) {
    const miss = missingSecret(def, after);
    if (miss) throw new ApiError(422, 'config_incomplete', `ใส่ ${miss} ก่อนเปิดใช้งาน`);
  }

  // secrets first: an integration is never switched on without the key it needs
  if (Object.keys(patch).length) {
    if (isSingleSecret(def)) {
      const { error } = await sb.rpc('set_integration_secret', { p_key: def.key, p_secret: patch[def.secrets[0].name] ?? '' });
      if (error) throw new Error(`set_integration_secret: ${error.message}`);
    } else {
      const { error } = await sb.rpc('merge_integration_secret', { p_key: def.key, p_patch: patch });
      if (error) throw new Error(`merge_integration_secret: ${error.message}`);
    }
  }

  const { data: row, error } = await sb
    .from('integrations')
    .update({ is_enabled: body.isEnabled, config: cfg.config, updated_by: staff.id })
    .eq('key', def.key)
    .select('key, is_enabled, config, updated_at')
    .maybeSingle();
  if (error) throw new Error(`integrations update: ${error.message}`);
  if (!row) throw new ApiError(403, 'forbidden', 'ไม่มีสิทธิ์ทำรายการนี้');
  return {
    key: def.key,
    isEnabled: row.is_enabled,
    config: row.config as Record<string, string>,
    secretFields: after,
    updatedAt: row.updated_at,
  };
});
