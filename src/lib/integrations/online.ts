import 'server-only';
import { ApiError } from '@/lib/api/handler';
import type { CheckoutResponse, PayInfoJson } from '@/lib/contracts/payment';
import type { Admin } from './server';

const REUSE_MS = 25 * 60_000;

/**
 * One pending card/e-wallet payment row per attempt, amount = the SQL-computed deposit due.
 * A recent pending attempt for the same amount is reused (double clicks, back button).
 */
export async function onlinePayment(
  admin: Admin,
  info: PayInfoJson,
  method: 'stripe' | 'beam',
  provider: {
    /** a still-usable URL for an earlier attempt, or null */
    reuse: (providerRef: string, storedUrl: string | null) => Promise<string | null>;
    create: (paymentId: string) => Promise<{ id: string; url: string }>;
  },
): Promise<CheckoutResponse> {
  const { data: prev, error: pErr } = await admin
    .from('payments')
    .select('id, amount, provider_ref, created_at, verify_result')
    .eq('booking_id', info.booking_id)
    .eq('method', method)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .range(0, 0)
    .maybeSingle();
  if (pErr) throw new Error(`payments read: ${pErr.message}`);
  if (prev?.provider_ref && prev.amount === info.due && Date.now() - Date.parse(prev.created_at) < REUSE_MS) {
    const stored = (prev.verify_result as { checkout_url?: unknown } | null)?.checkout_url;
    const url = await provider.reuse(prev.provider_ref, typeof stored === 'string' ? stored : null).catch(() => null);
    if (url) return { url };
  }

  const { data: row, error } = await admin
    .from('payments')
    .insert({ booking_id: info.booking_id, purpose: 'deposit', method, amount: info.due, status: 'pending' })
    .select('id')
    .single();
  if (error || !row) throw new Error(`payment insert: ${error?.message}`);

  let created: { id: string; url: string };
  try {
    created = await provider.create(row.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[pay/${method}] provider failed`, message);
    await admin.from('payments').update({ status: 'failed', verify_result: { error: message.slice(0, 300) } }).eq('id', row.id);
    throw new ApiError(502, 'provider_error', 'ผู้ให้บริการชำระเงินขัดข้อง ลองใหม่อีกครั้ง');
  }
  const { error: uErr } = await admin.from('payments').update({ provider_ref: created.id, verify_result: { checkout_url: created.url } }).eq('id', row.id);
  if (uErr) throw new Error(`payment ref: ${uErr.message}`);
  return { url: created.url };
}
