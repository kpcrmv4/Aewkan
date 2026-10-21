import 'server-only';
import type { getSupabaseServer } from '@/lib/supabase/server';
import type { SlipRow } from './slip-card';

type Sb = Awaited<ReturnType<typeof getSupabaseServer>>;

export const PAY_PAGE_SIZE = 20;
export const PAY_STATUSES = ['pending', 'paid', 'failed', 'cancelled'] as const;
export const PAY_METHODS = ['promptpay_slip', 'stripe', 'beam', 'cash'] as const;

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** pending slips, oldest first (staff session · RLS finance.read or jobs.manage) */
export async function loadSlipQueue(sb: Sb, bookingId?: string): Promise<SlipRow[]> {
  let q = sb
    .from('payments')
    .select('id, amount, status, slip_path, verify_result, updated_at, bookings!inner(id, booking_no, customer_name, status)')
    .eq('method', 'promptpay_slip')
    .in('status', ['pending', 'verifying'])
    .order('updated_at', { ascending: true })
    .order('id')
    .range(0, 49);
  if (bookingId) q = q.eq('booking_id', bookingId);
  const { data, error } = await q;
  if (error) throw new Error(`slip queue: ${error.message}`);
  return (data ?? []).map((r) => ({ ...r, booking: one(r.bookings) }));
}

/** short-lived signed URLs for the slip previews (storage policy: finance.read or jobs.manage) */
export async function slipUrls(sb: Sb, rows: { id: string; slip_path: string | null }[]): Promise<Map<string, string>> {
  const paths = rows.map((r) => r.slip_path).filter((p): p is string => Boolean(p));
  const out = new Map<string, string>();
  if (!paths.length) return out;
  const { data, error } = await sb.storage.from('payment-slips').createSignedUrls(paths, 600);
  if (error) {
    console.error('[payments] signed urls', error.message);
    return out;
  }
  const byPath = new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl]));
  for (const r of rows) {
    const u = r.slip_path ? byPath.get(r.slip_path) : undefined;
    if (u) out.set(r.id, u);
  }
  return out;
}

export interface PaymentListQuery {
  status: string;
  method: string;
  q: string;
  page: number;
}

export async function loadPayments(sb: Sb, query: PaymentListQuery) {
  const from = (query.page - 1) * PAY_PAGE_SIZE;
  let q = sb
    .from('payments')
    .select('id, purpose, method, amount, status, created_at, paid_at, bookings!inner(id, booking_no, customer_name, status)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, from + PAY_PAGE_SIZE - 1);
  if ((PAY_STATUSES as readonly string[]).includes(query.status)) q = q.eq('status', query.status);
  if ((PAY_METHODS as readonly string[]).includes(query.method)) q = q.eq('method', query.method);
  if (query.q) q = q.ilike('bookings.booking_no', `%${query.q}%`);
  const { data, error, count } = await q;
  if (error) throw new Error(`payments list: ${error.message}`);
  return { rows: (data ?? []).map((r) => ({ ...r, booking: one(r.bookings) })), total: count ?? 0 };
}

export interface PaymentKpis {
  pending_slips: number;
  pending_online: number;
  paid_month: number;
  paid_month_count: number;
}

export async function loadKpis(sb: Sb): Promise<PaymentKpis> {
  const { data, error } = await sb.rpc('admin_payment_kpis');
  if (error) throw new Error(`payment kpis: ${error.message}`);
  return data as unknown as PaymentKpis;
}
