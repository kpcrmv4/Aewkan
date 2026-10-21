import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { ApiError, isApiError, json } from '@/lib/api/handler';
import { MissingEnvError, serverEnv } from '@/lib/env';
import { notifyBooking } from '@/lib/notify';
import type { Admin } from './server';

/**
 * Provider webhooks and cron need the RAW body / headers, so they do not go through
 * publicRoute. Same error shape: { error: { code, message } } · missing env → 503.
 */
export async function rawRoute(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return json(await fn());
  } catch (e) {
    if (isApiError(e)) return json({ error: { code: e.code, message: e.message } }, e.status);
    if (e instanceof MissingEnvError || (e as { code?: string })?.code === 'missing_env') {
      return json({ error: { code: 'server_not_configured', message: `ระบบยังตั้งค่าไม่ครบ (${(e as MissingEnvError).key})` } }, 503);
    }
    console.error('[webhook] unhandled', e instanceof Error ? e.message : e);
    return json({ error: { code: 'internal', message: 'เกิดข้อผิดพลาด' } }, 500);
  }
}

/** Authorization: Bearer <CRON_SECRET> (Vercel Cron sends exactly this) — 401 before anything else */
export function requireCron(req: Request): void {
  const secret = serverEnv('CRON_SECRET');
  const given = req.headers.get('authorization') ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(`Bearer ${secret}`);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiError(401, 'unauthenticated', 'unauthorized');
}

export async function seenEvent(admin: Admin, provider: 'stripe' | 'beam' | 'line', id: string): Promise<boolean> {
  const { data, error } = await admin.from('webhook_events').select('event_id').eq('provider', provider).eq('event_id', id).maybeSingle();
  if (error) throw new Error(`webhook_events read: ${error.message}`);
  return Boolean(data);
}

/** recorded AFTER the work succeeded, so a failed attempt is retried by the provider */
export async function markEvent(admin: Admin, provider: 'stripe' | 'beam' | 'line', id: string): Promise<void> {
  const { error } = await admin.from('webhook_events').upsert({ provider, event_id: id.slice(0, 200) }, { onConflict: 'provider,event_id', ignoreDuplicates: true });
  if (error) throw new Error(`webhook_events write: ${error.message}`);
}

export interface SettleExpect {
  method: 'stripe' | 'beam';
  /** satang the provider says it collected */
  amountSatang: number | null;
  currency: string | null;
  providerRef: string;
  result: Record<string, unknown>;
}

/**
 * Settle one online payment: the amount must equal the row's amount × 100 in THB, else the
 * row stays pending with the mismatch recorded (staff decide). Confirms the booking and
 * notifies the customer. Idempotent through payment_settle.
 */
export async function settleOnline(admin: Admin, paymentId: string, x: SettleExpect): Promise<{ settled: boolean; reason?: string }> {
  const { data: p, error } = await admin.from('payments').select('id, booking_id, method, amount, status, verify_result').eq('id', paymentId).maybeSingle();
  if (error) throw new Error(`payment read: ${error.message}`);
  if (!p || p.method !== x.method) return { settled: false, reason: 'payment_not_found' };
  if (p.status === 'paid') return { settled: true, reason: 'already' };
  if (x.amountSatang !== p.amount * 100 || (x.currency ?? '').toUpperCase() !== 'THB') {
    const prev = (p.verify_result ?? {}) as Record<string, unknown>;
    const { error: uErr } = await admin
      .from('payments')
      .update({ verify_result: { ...prev, mismatch: { amount: x.amountSatang, currency: x.currency, ref: x.providerRef } } })
      .eq('id', p.id);
    if (uErr) throw new Error(`payment mismatch note: ${uErr.message}`);
    return { settled: false, reason: 'amount_mismatch' };
  }
  const { data, error: sErr } = await admin.rpc('payment_settle', {
    p_payment: p.id,
    p_provider_ref: x.providerRef,
    p_result: x.result as never,
    p_actor: x.method,
  });
  if (sErr) throw new Error(`payment_settle: ${sErr.message}`);
  const r = data as { confirmed?: boolean; booking_id?: string } | null;
  if (r?.confirmed && r.booking_id) await notifyBooking(r.booking_id, 'confirmed');
  return { settled: true };
}
