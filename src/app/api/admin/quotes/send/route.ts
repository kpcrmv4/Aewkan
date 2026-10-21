import { QUOTE_STATUSES } from '@/features/admin-ops/transitions';
import { ApiError, staffRoute } from '@/lib/api/handler';
import { SendQuoteRequest } from '@/lib/contracts/admin';
import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * Record the staff quote. Sending the push / LINE message is phase P4; this
 * stores the price, the deposit, the deadline and moves the job to `quoted`.
 */
export const POST = staffRoute('quotes.manage', SendQuoteRequest, async ({ body }) => {
  if (body.deposit > body.price) throw new ApiError(422, 'deposit_over_price', 'มัดจำต้องไม่เกินราคาเสนอ');

  const sb = await getSupabaseServer();
  const { data: cur, error: readErr } = await sb.from('bookings').select('id, status').eq('id', body.bookingId).maybeSingle();
  if (readErr) throw new Error(`booking read: ${readErr.message}`);
  if (!cur) throw new ApiError(404, 'not_found', 'ไม่พบงานนี้');
  if (!(QUOTE_STATUSES as readonly string[]).includes(cur.status)) {
    throw new ApiError(409, 'not_quotable', 'งานนี้ไม่อยู่ในสถานะที่เสนอราคาได้');
  }

  const now = new Date();
  const deadline = new Date(now.getTime() + body.hours * 3_600_000);
  const { data: row, error } = await sb
    .from('bookings')
    .update({
      quote_price: body.price,
      quote_deposit: body.deposit,
      quote_hours: body.hours,
      quote_message: body.message,
      quote_sent_at: now.toISOString(),
      quote_deadline: deadline.toISOString(),
      status: 'quoted',
    })
    .eq('id', body.bookingId)
    .eq('status', cur.status)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`quote update: ${error.message}`);
  if (!row) throw new ApiError(403, 'forbidden', 'ไม่มีสิทธิ์ทำรายการนี้หรือสถานะงานเปลี่ยนไปแล้ว');
  return { ok: true as const, sentAt: now.toISOString(), deadline: deadline.toISOString() };
});
