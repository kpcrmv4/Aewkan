import { canTransition } from '@/features/admin-ops/transitions';
import { ApiError, staffRoute } from '@/lib/api/handler';
import { SetStatusRequest } from '@/lib/contracts/admin';
import type { BookingStatus } from '@/lib/contracts/common';
import type { Database } from '@/lib/database.types';
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

  const now = new Date().toISOString();
  const patch: Database['public']['Tables']['bookings']['Update'] = { status: body.status };
  if (body.status === 'traveling') patch.started_at = now;
  if (body.status === 'done') patch.finished_at = now;

  // compare-and-set on the status we read, so two staff cannot both move one job
  const { data: row, error } = await sb.from('bookings').update(patch).eq('id', body.bookingId).eq('status', from).select('id').maybeSingle();
  if (error) throw new Error(`booking update: ${error.message}`);
  if (!row) {
    const { data: again } = await sb.from('bookings').select('status').eq('id', body.bookingId).maybeSingle();
    if (again && again.status !== from) throw new ApiError(409, 'status_changed', 'สถานะงานเปลี่ยนไปแล้ว รีเฟรชหน้าแล้วลองใหม่');
    throw new ApiError(403, 'forbidden', 'ไม่มีสิทธิ์ทำรายการนี้');
  }
  return { ok: true as const, status: body.status };
});
