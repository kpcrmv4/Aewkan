'use client';

import { errorText } from '@/lib/copy/admin';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

/** POST JSON to an admin route; never throws — the caller shows `message` in a toast */
export async function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => null)) as (T & { error?: { code: string; message: string } }) | null;
    if (!res.ok || !json || json.error) {
      const code = json?.error?.code ?? 'internal';
      return { ok: false, code, message: errorText(code, json?.error?.message) };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, code: 'network', message: errorText('network') };
  }
}
