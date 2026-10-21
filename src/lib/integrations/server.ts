import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api/handler';
import { looksLikeToken } from '@/lib/auth/link-token';
import type { IntegrationKey, PayInfoJson } from '@/lib/contracts/payment';
import type { Database } from '@/lib/database.types';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/env';
import { integrationDef, isSingleSecret } from './catalog';

export type Admin = SupabaseClient<Database>;

/** publishable-key client without a session: token RPCs resolve the job link in the database (R-011) */
export function anonServer() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** customer job-link check for the pay routes: 404 before anything else (no service role needed) */
export async function payInfoFor(token: string | undefined): Promise<PayInfoJson> {
  if (!token || !looksLikeToken(token)) throw new ApiError(404, 'link_not_found', 'ไม่พบลิงก์นี้');
  const { data, error } = await anonServer().rpc('job_pay_info', { p_token: token });
  if (error) throw new Error(`job_pay_info: ${error.message}`);
  if (!data) throw new ApiError(404, 'link_not_found', 'ไม่พบลิงก์นี้');
  return data as unknown as PayInfoJson;
}

export interface LoadedIntegration {
  key: IntegrationKey;
  enabled: boolean;
  config: Record<string, string>;
  /** field → value; a single-secret integration maps its one field to the plain stored string */
  secret: Record<string, string>;
}

/** service role: config + decrypted secret (R-001 — the one place secrets are read) */
export async function loadIntegration(admin: Admin, key: IntegrationKey): Promise<LoadedIntegration> {
  const def = integrationDef(key)!;
  const [{ data: row, error }, { data: raw, error: sErr }] = await Promise.all([
    admin.from('integrations').select('key, is_enabled, config').eq('key', key).maybeSingle(),
    admin.rpc('get_integration_secret', { p_key: key }),
  ]);
  if (error) throw new Error(`integration ${key}: ${error.message}`);
  if (sErr) throw new Error(`integration secret ${key}: ${sErr.message}`);
  const config: Record<string, string> = {};
  for (const [k, v] of Object.entries((row?.config ?? {}) as Record<string, unknown>)) {
    if (v !== null && v !== undefined) config[k] = String(v);
  }
  let secret: Record<string, string> = {};
  if (typeof raw === 'string' && raw) {
    if (isSingleSecret(def)) {
      secret = { [def.secrets[0].name]: raw };
    } else {
      try {
        const o = JSON.parse(raw) as unknown;
        if (o && typeof o === 'object' && !Array.isArray(o)) {
          for (const [k, v] of Object.entries(o)) if (typeof v === 'string') secret[k] = v;
        }
      } catch {
        secret = {};
      }
    }
  }
  return { key, enabled: Boolean(row?.is_enabled), config, secret };
}

/** the integration is on and every required secret field is present */
export function ready(i: LoadedIntegration): boolean {
  const def = integrationDef(i.key)!;
  return i.enabled && def.secrets.every((s) => !s.required || Boolean(i.secret[s.name]));
}

/** origin for links we send out: the configured site URL, else the request's own origin */
export function siteOrigin(req?: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/+$/, '');
  return req ? new URL(req.url).origin : 'http://localhost:3100';
}
