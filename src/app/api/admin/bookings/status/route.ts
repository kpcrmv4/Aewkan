import { canTransition } from '@/features/admin-ops/transitions';
import { ApiError, staffRoute } from '@/lib/api/handler';
import { SetStatusRequest } from '@/lib/contracts/admin';
import type { BookingStatus } from '@/lib/contracts/common';
import { getSupabaseServer } from '@/lib/supabase/server';

/** manual status change; allowed moves live in features/admin-ops/transitions.ts */
export const POST = staffRoute('jobs.manage', SetStatusRequest, async ({ body }) => {
  const sb = await getSupabaseServer();
  const { data: cur, error: readErr } = await sb.from('bookings').select('id, status').eq('id', body.bookingId).maybeSingle();
  if (readErr) throw new Error(`booking read: ${readErr.message}`);
  if (!cur) throw new ApiError(404, 'not_found', 'ไม่พบงานนี้');

  const from = cur.status as BookingStatus;
  if (!canTransition(from, body.status)) {
    throw new ApiError(409, 'transition_not_allowed', 'เปลี่ยนเป็นสถานะนี้ไม่ได้');
  }

  // compare-and-set on the status we read (two staff cannot both move one job);
  // runs as the caller under RLS · started_at/finished_at and the history row
  // with the reason are written by database triggers
  const { data: moved, error } = await sb.rpc('admin_set_status', {
    p_booking: body.bookingId,
    p_from: from,
    p_to: body.status,
    p_reason: body.reason || undefined,
  });
  if (error) throw new Error(`status update: ${error.message}`);
  if (!moved) {
    const { data: again } = await sb.from('bookings').select('status').eq('id', body.bookingId).maybeSingle();
    if (again && again.status !== from) throw new ApiError(409, 'status_changed', 'สถานะงานเปลี่ยนไปแล้ว รีเฟรชหน้าแล้วลองใหม่');
    throw new ApiError(403, 'forbidden', 'ไม่มีสิทธิ์ทำรายการนี้');
  }
  return { ok: true as const, status: body.status };
});
