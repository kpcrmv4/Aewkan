import { after } from 'next/server';
import { ApiError, staffRoute } from '@/lib/api/handler';
import { ReviewPaymentRequest, type ReviewPaymentResponse } from '@/lib/contracts/payment';
import { notifyBooking } from '@/lib/notify';
import { getSupabaseServer } from '@/lib/supabase/server';

const ERR: Record<string, [number, string]> = {
  payment_not_found: [404, 'ไม่พบรายการชำระเงินนี้'],
  payment_already_reviewed: [409, 'รายการนี้ถูกตรวจไปแล้ว'],
  permission_denied: [403, 'ไม่มีสิทธิ์ทำรายการนี้'],
  note_too_long: [422, 'เหตุผลยาวเกิน 300 ตัวอักษร'],
};

/**
 * POST /api/admin/payments/confirm — staff approve / reject a pending payment (jobs.manage).
 * One SQL function does both rows atomically under the staff session (no service role):
 * approve → paid + booking confirmed · reject → failed + booking back to waiting (quote deadline kept fair).
 */
export const POST = staffRoute('jobs.manage', ReviewPaymentRequest, async ({ body }): Promise<ReviewPaymentResponse> => {
  const sb = await getSupabaseServer();
  const { data, error } = await sb.rpc('admin_review_payment', { p_payment: body.paymentId, p_approve: body.approve, p_note: body.note || undefined });
  if (error) {
    const hit = ERR[error.message];
    if (hit) throw new ApiError(hit[0], error.message, hit[1]);
    throw new Error(`admin_review_payment: ${error.message}`);
  }
  const r = data as unknown as ReviewPaymentResponse;
  if (body.approve && r.booking_status === 'confirmed') {
    after(() => notifyBooking(r.booking_id, 'confirmed').then(() => undefined));
  }
  return r;
});
