import { after } from 'next/server';
import { assignMessage } from '@/features/admin-ops/helpers';
import { ASSIGN_STATUSES } from '@/features/admin-ops/transitions';
import { ApiError, staffRoute } from '@/lib/api/handler';
import { newToken } from '@/lib/auth/link-token';
import { AssignDriverRequest } from '@/lib/contracts/admin';
import { notifyBooking } from '@/lib/notify';
import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * Assign (or reassign) a driver and issue a NEW driver link (the RPC revokes
 * the older one). The customer keeps their live link unless reissueCustomerLink;
 * a booking without a live customer link gets one. The customer is notified
 * over LINE OA / web push when configured (notifyBooking, after the response).
 */
export const POST = staffRoute('jobs.manage', AssignDriverRequest, async ({ staff, body, req }) => {
  const sb = await getSupabaseServer();

  const { data: b, error: bErr } = await sb
    .from('bookings')
    .select('id, booking_no, status, vehicle_key, travel_date, pickup_time, pickup_place_id, customer_lang, customer_name')
    .eq('id', body.bookingId)
    .maybeSingle();
  if (bErr) throw new Error(`booking read: ${bErr.message}`);
  if (!b) throw new ApiError(404, 'not_found', 'ไม่พบงานนี้');
  if (!(ASSIGN_STATUSES as readonly string[]).includes(b.status)) {
    throw new ApiError(409, 'not_assignable', 'งานนี้ไม่อยู่ในสถานะที่จัดคนขับได้');
  }

  const [{ data: d, error: dErr }, { data: off, error: offErr }, { data: pickup, error: pErr }] = await Promise.all([
    sb.from('drivers').select('id, nickname, name_en, car_th, car_en, plate, vehicle_key, is_active').eq('id', body.driverId).maybeSingle(),
    sb.from('driver_off_days').select('day').eq('driver_id', body.driverId).eq('day', b.travel_date).maybeSingle(),
    sb.from('places').select('name_th, name_en').eq('id', b.pickup_place_id).maybeSingle(),
  ]);
  if (dErr || offErr || pErr) throw new Error(`lookup: ${(dErr ?? offErr ?? pErr)?.message}`);
  if (!d) throw new ApiError(404, 'not_found', 'ไม่พบคนขับ');
  if (!d.is_active) throw new ApiError(409, 'driver_inactive', 'คนขับคนนี้ปิดใช้งานอยู่');
  if (d.vehicle_key !== b.vehicle_key) throw new ApiError(409, 'vehicle_mismatch', 'คนขับคนนี้คนละประเภทรถกับงาน');
  if (off) throw new ApiError(409, 'driver_off', 'คนขับคนนี้ลาหยุดในวันเดินทาง');

  const { data: row, error: uErr } = await sb
    .from('bookings')
    .update({ driver_id: d.id, assigned_by: staff.id, status: 'assigned' }) // assigned_at: DB trigger
    .eq('id', b.id)
    .eq('status', b.status)
    .select('id')
    .maybeSingle();
  if (uErr) throw new Error(`booking update: ${uErr.message}`);
  if (!row) throw new ApiError(403, 'forbidden', 'ไม่มีสิทธิ์ทำรายการนี้หรือสถานะงานเปลี่ยนไปแล้ว');

  // the customer keeps their live link (saved in "my trips", LINE, e-mail) unless
  // staff asks for a new one; the driver link is always new (reassign revokes it)
  const { data: live, error: liveErr } = await sb
    .from('job_links')
    .select('id')
    .eq('booking_id', b.id)
    .eq('audience', 'customer')
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();
  if (liveErr) throw new Error(`job_links read: ${liveErr.message}`);
  const customerToken = !live || body.reissueCustomerLink ? newToken() : null;
  const driverToken = newToken();
  const [c, dr] = await Promise.all([
    customerToken ? sb.rpc('issue_job_link', { p_booking: b.id, p_audience: 'customer', p_token: customerToken }) : Promise.resolve({ error: null }),
    sb.rpc('issue_job_link', { p_booking: b.id, p_audience: 'driver', p_token: driverToken }),
  ]);
  if (c.error || dr.error) throw new Error(`issue_job_link: ${(c.error ?? dr.error)?.message}`);

  const customerPath = customerToken ? `/j/${customerToken}` : null;
  const driverPath = `/j/${driverToken}`;
  const lang = b.customer_lang === 'en' ? 'en' : 'th';
  const message = assignMessage({
    lang,
    bookingNo: b.booking_no,
    date: b.travel_date,
    time: b.pickup_time,
    pickupName: (lang === 'en' ? pickup?.name_en : pickup?.name_th) ?? '',
    customerName: b.customer_name,
    driver: { nickname: d.nickname, nameEn: d.name_en, carTh: d.car_th, carEn: d.car_en, plate: d.plate },
    link: customerPath ? `${new URL(req.url).origin}${customerPath}` : null,
  });
  const customerUrl = customerPath ? `${new URL(req.url).origin}${customerPath}` : undefined;
  after(() => notifyBooking(b.id, 'driver_assigned', { customerUrl }));
  return { ok: true as const, channel: body.channel, customerPath, driverPath, message };
});
