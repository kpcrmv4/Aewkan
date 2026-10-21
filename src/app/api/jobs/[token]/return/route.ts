import { after } from 'next/server';
import { ApiError, publicRoute } from '@/lib/api/handler';
import { siteOrigin } from '@/lib/integrations/server';
import { notifyBooking } from '@/lib/notify';
import { looksLikeToken, newToken } from '@/lib/auth/link-token';
import { loadPublicCatalog } from '@/lib/catalog/server';
import { ReturnOfferRequest, type CreateBookingResponse, type JobViewJson } from '@/lib/contracts';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getSupabaseServer } from '@/lib/supabase/server';
import { returnOfferState } from '@/features/job-link/model';
import { buildReturnBooking } from '@/features/job-link/return-map';
import { todayInBangkok } from '@/lib/format';

/**
 * Book the return leg from a return offer. The customer token is resolved in the
 * database (get_job_view); the price is computed here from the current catalog.
 * Writes use the secret key — without it the adapter answers 503 server_not_configured.
 */
export const POST = publicRoute(
  async (_req, params) => {
    const token = params.token ?? '';
    const notAvailable = new ApiError(404, 'offer_not_available', 'ไม่พบข้อเสนอขากลับนี้');
    if (!looksLikeToken(token)) throw new ApiError(404, 'link_not_found', 'ไม่พบลิงก์นี้');
    const sb = await getSupabaseServer();
    const { data, error } = await sb.rpc('get_job_view', { p_token: token });
    if (error) throw new Error(`get_job_view: ${error.message}`);
    const view = data as unknown as JobViewJson | null;
    if (!view) throw new ApiError(404, 'link_not_found', 'ไม่พบลิงก์นี้');
    const offer = view.return_offer;
    if (view.audience !== 'customer' || !offer) throw notAvailable;
    const state = returnOfferState(
      { dismissedAt: offer.dismissed_at, returnBookingNo: offer.return_booking_no, validUntil: offer.valid_until },
      todayInBangkok(),
    );
    if (state !== 'open') throw notAvailable;
    return { token, view, offer };
  },
  ReturnOfferRequest,
  async ({ auth, body, req }): Promise<CreateBookingResponse> => {
    const admin = getSupabaseAdmin(); // throws MissingEnvError → 503 when the key is absent
    const { view, offer } = auth;
    const { catalog } = await loadPublicCatalog();

    const { data: p, error: pe } = await admin
      .from('bookings')
      .select('customer_name, customer_contact, contact_channel, customer_lang, hotel, note')
      .eq('id', view.booking.id)
      .maybeSingle();
    if (pe) throw new Error(`parent booking: ${pe.message}`);
    if (!p) throw new ApiError(404, 'link_not_found', 'ไม่พบการจองเดิม');

    const built = buildReturnBooking(
      catalog,
      {
        id: view.booking.id,
        travelDate: view.booking.travel_date,
        pax: view.booking.pax,
        vehicleKey: view.booking.vehicle_key,
        langDriver: view.booking.lang_driver,
        customerName: p.customer_name,
        customerContact: p.customer_contact,
        contactChannel: p.contact_channel,
        customerLang: p.customer_lang,
        hotel: p.hotel,
        note: p.note,
      },
      { fromId: offer.from_place_id, discountPct: offer.discount_pct },
      body,
    );
    if (!built.ok) {
      const msg = { bad_destination: 'จุดส่งนี้เลือกไม่ได้', bad_date: 'วันกลับต้องไม่ก่อนวันเดินทางเดิม', unpriceable: 'คำนวณราคาไม่ได้' }[built.error];
      throw new ApiError(422, built.error, msg);
    }
    const { booking, stop, total, deposit } = built.rows;

    const ins = await admin.from('bookings').insert(booking).select('id, booking_no').single();
    if (ins.error || !ins.data) throw new Error(`insert return booking: ${ins.error?.message ?? 'no row'}`);
    const created = ins.data;

    const cancel = async () => {
      await admin.from('bookings').update({ status: 'cancelled' }).eq('id', created.id);
    };
    const st = await admin.from('booking_stops').insert({ ...stop, booking_id: created.id });
    if (st.error) {
      await cancel();
      throw new Error(`insert return stop: ${st.error.message}`);
    }
    // claim the offer; a second request that raced us gets 0 rows
    const claim = await admin
      .from('return_offers')
      .update({ return_booking_id: created.id })
      .eq('booking_id', view.booking.id)
      .is('return_booking_id', null)
      .select('booking_id')
      .maybeSingle();
    if (claim.error) {
      await cancel();
      throw new Error(`claim return offer: ${claim.error.message}`);
    }
    if (!claim.data) {
      await cancel();
      throw new ApiError(409, 'already_booked', 'จองขากลับไปแล้ว');
    }

    const customerToken = newToken();
    const link = await admin.rpc('issue_job_link', { p_booking: created.id, p_audience: 'customer', p_token: customerToken });
    if (link.error) throw new Error(`issue_job_link: ${link.error.message}`);

    const customerUrl = `${siteOrigin(req)}/j/${customerToken}`;
    after(async () => {
      await notifyBooking(created.id, 'new_booking');
      await notifyBooking(created.id, 'booking_received', { customerUrl });
    });
    return { bookingNo: created.booking_no, status: 'awaiting_deposit', total, deposit, customerPath: `/j/${customerToken}` };
  },
);
