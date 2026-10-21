'use client';

import { SETTINGS_ERRORS } from '@/lib/copy/settings';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

/**
 * POST JSON to an admin route; never throws. Server messages are Thai and
 * specific ("zones.1.max_km: …"), so they win over the generic text for
 * validation errors; known codes without a message fall back to SETTINGS_ERRORS.
 */
export async function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => null)) as (T & { error?: { code: string; message?: string } }) | null;
    if (!res.ok || !json || json.error) {
      const code = json?.error?.code ?? 'internal';
      const specific = code === 'validation' || code === 'invalid_rules' || code === 'vehicle_in_use';
      const message = (specific && json?.error?.message) || SETTINGS_ERRORS[code] || json?.error?.message || SETTINGS_ERRORS.internal;
      return { ok: false, code, message };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, code: 'network', message: SETTINGS_ERRORS.network };
  }
}
