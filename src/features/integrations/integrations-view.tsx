import { RefreshRetry } from '@/features/admin-ops/retry';
import type { IntegrationKey, IntegrationState, PushConfigState } from '@/lib/contracts/payment';
import { INTEG_COPY } from '@/lib/copy/pay';
import { SITE_URL } from '@/lib/env';
import { INTEGRATIONS, secretFieldsSet } from '@/lib/integrations/catalog';
import { getSupabaseServer } from '@/lib/supabase/server';
import { IntegrationsBoard } from './integrations-board';

/** server loader for /admin/integrations — config + which secret fields are set, never a secret value */
export async function IntegrationsView({ staffEmail }: { staffEmail: string }) {
  const sb = await getSupabaseServer();
  const [rows, fields, push] = await Promise.all([
    sb.from('integrations').select('key, is_enabled, config, updated_at').order('key').range(0, 19),
    sb.rpc('integration_secret_fields'),
    sb.rpc('get_push_config'),
  ]);
  const failed = rows.error ?? fields.error ?? push.error;
  if (failed) {
    console.error('[integrations] load failed', failed.message);
    return <RefreshRetry message={INTEG_COPY.loadError} />;
  }
  const byKey = new Map((rows.data ?? []).map((r) => [r.key, r]));
  const set = (fields.data ?? {}) as Record<string, string[]>;
  const states: IntegrationState[] = INTEGRATIONS.map((def) => {
    const r = byKey.get(def.key);
    return {
      key: def.key as IntegrationKey,
      isEnabled: Boolean(r?.is_enabled),
      config: (r?.config ?? {}) as Record<string, string>,
      secretFields: secretFieldsSet(def, set[def.key] ?? []),
      updatedAt: r?.updated_at ?? null,
    };
  });
  const p = push.data as { public_key: string; subject: string; is_enabled: boolean; created_at: string } | null;
  const pushState: PushConfigState | null = p ? { publicKey: p.public_key, subject: p.subject, isEnabled: p.is_enabled, createdAt: p.created_at } : null;
  return <IntegrationsBoard initial={states} push={pushState} siteUrl={SITE_URL.replace(/\/+$/, '')} defaultSubject={`mailto:${staffEmail}`} />;
}
