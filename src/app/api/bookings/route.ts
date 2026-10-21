import { after } from 'next/server';
import { ApiError, publicRoute } from '@/lib/api/handler';
import { getStaff } from '@/lib/auth/staff';
import { newToken } from '@/lib/auth/link-token';
import { loadPublicCatalog } from '@/lib/catalog/server';
import { CreateBookingRequest, type CreateBookingResponse } from '@/lib/contracts/booking';
import { todayInBangkok } from '@/lib/format';
import { planTrip, priceTrip, quoteModeActive } from '@/lib/pricing';
import { notifyBooking } from '@/lib/notify';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { buildBookingInsert, buildStopRows, pickPrice, tripInputOf } from './build-booking';

/**
 * POST /api/bookings — public. The server re-plans and re-prices with the CURRENT
 * rule set; the client's total is only compared, never stored.
 */
export const POST = publicRoute(
  async () => null,
  CreateBookingRequest,
  async ({ body }): Promise<CreateBookingResponse> => {
    if (body.returnOf) throw new ApiError(422, 'return_via_job_link', 'ขากลับจองได้จากลิงก์งานเดิม');

    const admin = getSupabaseAdmin(); // throws MissingEnvError → 503 before any work when the key is absent
    const { catalog } = await loadPublicCatalog();
    if (body.ruleVersion !== catalog.ruleVersion) {
      throw new ApiError(409, 'rule_changed', 'กฎราคามีการปรับปรุง กรุณาตรวจสอบราคาอีกครั้ง');
    }

    const input = tripInputOf(body);
    const known = new Set(catalog.places.map((p) => p.id));
    if (![input.pickupId, ...input.stops.map((s) => s.placeId)].every((id) => known.has(id))) {
      throw new ApiError(422, 'unknown_place', 'ไม่พบจุดหมายที่เลือก');
    }
    const vehicle = catalog.rules.vehicles[input.vehicle];
    if (!vehicle) throw new ApiError(422, 'unknown_vehicle', 'ไม่พบประเภทรถที่เลือก');
    if (input.pax > vehicle.seats) throw new ApiError(422, 'too_many_pax', 'จำนวนผู้โดยสารเกินที่นั่งของรถ');
    if (input.date < todayInBangkok()) throw new ApiError(422, 'date_past', 'วันเดินทางต้องไม่เป็นวันที่ผ่านมาแล้ว');

    const plan = planTrip(catalog, input);
    const result = priceTrip(catalog, input, plan);
    const quote = quoteModeActive(catalog.rules, input.date);
    const picked = pickPrice(catalog, result, body.mode, quote);
    if (!picked.ok) {
      const msg = picked.code === 'mode_required' ? 'กรุณาเลือกแบบราคา' : picked.code === 'mode_unavailable' ? 'แบบราคาที่เลือกไม่เหมาะกับทริปนี้' : 'ไม่สามารถคิดราคาทริปนี้ได้';
      throw new ApiError(422, picked.code, msg);
    }
    const { priced } = picked;
    if (body.expectedTotal !== null && body.expectedTotal !== priced.total) {
      throw new ApiError(409, 'price_changed', 'ราคาเปลี่ยนไป กรุณาตรวจสอบราคาอีกครั้ง');
    }

    // who is booking: a staff session marks created_by (booking on behalf of a customer)
    const staff = await getStaff().catch(() => null);

    const insert = buildBookingInsert({ req: body, plan, result, priced, ruleVersion: catalog.ruleVersion, createdBy: staff?.id ?? null });
    const { data: booking, error: bErr } = await admin.from('bookings').insert(insert).select('id, booking_no, status').single();
    if (bErr || !booking) {
      console.error('[bookings] insert failed', bErr?.message);
      throw new ApiError(500, 'booking_failed', 'บันทึกการจองไม่สำเร็จ ลองใหม่อีกครั้ง');
    }

    const compensate = async (reason: string, detail?: string) => {
      console.error('[bookings] rolling back', booking.id, reason, detail);
      const { error } = await admin.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id);
      if (error) console.error('[bookings] compensation failed', booking.id, error.message);
      throw new ApiError(500, 'booking_failed', 'บันทึกการจองไม่สำเร็จ ลองใหม่อีกครั้ง');
    };

    const { error: sErr } = await admin.from('booking_stops').insert(buildStopRows(booking.id, input, plan));
    if (sErr) return compensate('stops', sErr.message);

    const token = newToken();
    const { error: lErr } = await admin.rpc('issue_job_link', { p_booking: booking.id, p_audience: 'customer', p_token: token });
    if (lErr) return compensate('link', lErr.message);

    after(() => notifyBooking(booking.id, 'new_booking'));
    return {
      bookingNo: booking.booking_no,
      status: priced.quote ? 'quote_requested' : 'awaiting_deposit',
      total: priced.total,
      deposit: priced.quote ? null : priced.deposit,
      customerPath: '/j/' + token,
    };
  },
);
