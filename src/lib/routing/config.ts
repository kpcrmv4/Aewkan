import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { normalizeProvider, type RoutingConfig } from './index';

/**
 * Provider + key from the `routing` integration row (Vault secret, R-001).
 * Needs SUPABASE_SECRET_KEY: getSupabaseAdmin() throws MissingEnvError (-> 503
 * server_not_configured in staffRoute). Returns null when the owner has not
 * switched the integration on or has not saved a key yet.
 */
export async function loadRoutingConfig(): Promise<RoutingConfig | null> {
  const admin = getSupabaseAdmin();
  const { data: row, error } = await admin.from('integrations').select('is_enabled, config, has_secret').eq('key', 'routing').maybeSingle();
  if (error) throw new Error(`integrations read: ${error.message}`);
  if (!row || !row.is_enabled || !row.has_secret) return null;
  const { data: secret, error: sErr } = await admin.rpc('get_integration_secret', { p_key: 'routing' });
  if (sErr) throw new Error(`routing secret: ${sErr.message}`);
  if (!secret) return null;
  const provider = normalizeProvider((row.config as { provider?: unknown } | null)?.provider);
  return { provider, apiKey: secret };
}
