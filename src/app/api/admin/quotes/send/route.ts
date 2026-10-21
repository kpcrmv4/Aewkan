import { after } from 'next/server';
import { QUOTE_STATUSES } from '@/features/admin-ops/transitions';
import { ApiError, staffRoute } from '@/lib/api/handler';
import { SendQuoteRequest } from '@/lib/contracts/admin';
import { notifyBooking } from '@/lib/notify';
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

  // the values below only mark "sent"; the bookings_stamp_times trigger replaces
  // them with now() and now() + quote_hours from the database clock
  const marker = new Date().toISOString();
  const { data: row, error } = await sb
    .from('bookings')
    .update({
      quote_price: body.price,
      quote_deposit: body.deposit,
      quote_hours: body.hours,
      quote_message: body.message,
      quote_sent_at: marker,
      quote_deadline: marker,
      status: 'quoted',
    })
    .eq('id', body.bookingId)
    .eq('status', cur.status)
    .select('id, quote_sent_at, quote_deadline')
    .maybeSingle();
  if (error) throw new Error(`quote update: ${error.message}`);
  if (!row?.quote_sent_at || !row.quote_deadline) throw new ApiError(403, 'forbidden', 'ไม่มีสิทธิ์ทำรายการนี้หรือสถานะงานเปลี่ยนไปแล้ว');
  after(() => notifyBooking(body.bookingId, 'quote_ready'));
  return { ok: true as const, sentAt: row.quote_sent_at, deadline: row.quote_deadline };
});
