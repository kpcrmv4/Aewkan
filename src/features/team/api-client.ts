'use client';

import { teamErrorText } from '@/lib/copy/team';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

/** POST JSON to a team route; never throws — the caller shows `message` */
export async function postTeam<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => null)) as (T & { error?: { code: string; message: string } }) | null;
    if (!res.ok || !json || json.error) {
      const code = json?.error?.code ?? 'internal';
      return { ok: false, code, message: teamErrorText(code, json?.error?.message) };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, code: 'network', message: teamErrorText('network') };
  }
}

/** clipboard write inside the click handler; false when the browser refuses */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
