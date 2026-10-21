/**
 * Job-link contract (P3 implements the UI). R-011: the token is resolved IN
 * THE DATABASE — call these functions with the publishable key (anon); no
 * service-role key and no Next API route is needed for them:
 *
 *   rpc('get_job_view', { p_token })                         → JobViewJson | null (null = unknown/revoked → 404 page)
 *   rpc('job_record_photo', { p_token, p_kind, p_path })     driver · after uploading to bucket 'job-photos'
 *        at '<booking_id>/<pickup|dropoff>/<uuid>.jpg' with the anon client (storage policy checks the path)
 *   rpc('job_start', { p_token })                            driver · error 'pickup_photo_required' / 'not_assigned'
 *   rpc('job_checkin', { p_token, p_seq })                   driver · feeds segments(source='checkins')
 *   rpc('job_commission', { p_token, p_seq, p_sale })        driver · p_sale required for 'sale' rules
 *   rpc('job_finish', { p_token, p_cash })                   driver · error 'dropoff_photo_required' · opens return offer on one-way
 *   rpc('job_return_dismiss', { p_token })                   customer
 *   rpc('job_push_subscribe', { p_token, p_endpoint, p_p256dh, p_auth })   either audience
 * Errors arrive as PostgREST errors whose `message` is the code above (map to copy).
 *
 * Only booking the return leg needs the server (it prices and inserts a booking):
 *   POST /api/jobs/[token]/return   ReturnOfferRequest → CreateBookingResponse  (needs SUPABASE_SECRET_KEY)
 */
import { z } from 'zod';
import { baht, hhmm, isoDate, uuid } from './common';

export const PushSubscribeRequest = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
});

export const PhotoKind = z.enum(['pickup', 'dropoff']);
export const PhotoUploadUrlRequest = z.object({ kind: PhotoKind, contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']) });
export const PhotoConfirmRequest = z.object({ kind: PhotoKind, path: z.string().min(10).max(300) });

export const CheckinRequest = z.object({ seq: z.number().int().min(1).max(30) });

export const CommissionReportRequest = z.object({
  seq: z.number().int().min(1).max(30),
  saleAmount: baht.nullable(),
});

export const FinishRequest = z.object({ cashCollected: baht });

export const ReturnOfferRequest = z.object({
  toId: uuid,
  date: isoDate,
  time: hhmm,
});

export type Audience = 'customer' | 'driver';

/** raw shape returned by rpc('get_job_view') — snake_case from SQL */
export interface JobViewJson {
  audience: Audience;
  booking: {
    id: string; booking_no: string; status: string; lang: 'th' | 'en'; travel_date: string; pickup_time: string;
    vehicle_key: string; pax: number; round_trip: boolean; mode: string; rule_version: number;
    price_total: number; deposit: number; price_lines: Array<{ key: string; vars: Record<string, string | number>; amount: number }>;
    plan: Record<string, unknown>; lang_driver: boolean;
    quote_price: number | null; quote_deposit: number | null; quote_deadline: string | null; quote_message: string | null;
    started_at: string | null; finished_at: string | null; cash_collected: number | null;
  };
  pickup: { id: string; name_th: string; name_en: string; lat: number; lng: number };
  stops: Array<{
    seq: number; place_id: string; name_th: string; name_en: string; lat: number; lng: number; dwell: number;
    planned_minutes: number; planned_km: number; measured: boolean; checked_in_at: string | null;
    commission: { type: 'head' | 'booking' | 'sale'; amount: number; split_key: string; note: string } | null;
    commission_report: { sale_amount: number | null; total: number; driver_share: number; company_share: number } | null;
  }>;
  driver: {
    nickname: string; name_en: string; full_name: string; car_th: string; car_en: string; plate: string;
    phone: string; line_id: string; langs: string[]; langs_en: string[]; rating: number; years: number;
  } | null;
  photos: Array<{ kind: 'pickup' | 'dropoff'; taken_at: string; path: string | null }>;
  paid: number;
  customer: { name: string; contact: string; channel: string; hotel: string; note: string } | null;
  commission_policy: { policy_th: string; splits: Record<string, { name_th: string; name_en: string; driver_pct: number }>; assumed_spend: number } | null;
  return_offer: { from_place_id: string; discount_pct: number; valid_until: string; dismissed_at: string | null; return_booking_no: string | null } | null;
}

export interface JobStopView {
  seq: number;
  placeId: string;
  nameTh: string;
  nameEn: string;
  dwell: number;
  plannedMinutes: number;
  plannedKm: number;
  measured: boolean;
  checkedInAt: string | null;
  /** driver audience only */
  commission?: { type: 'head' | 'booking' | 'sale'; amount: number; splitKey: string; note: string } | null;
}

export interface JobView {
  audience: Audience;
  bookingNo: string;
  status: string;
  lang: 'th' | 'en';
  travelDate: string;
  pickupTime: string;
  pickup: { id: string; nameTh: string; nameEn: string };
  vehicleKey: string;
  pax: number;
  roundTrip: boolean;
  mode: string;
  ruleVersion: number;
  price: { lines: unknown[]; total: number; deposit: number; paid: number } | null;
  quote: { price: number; deposit: number; deadline: string; message: string | null } | null;
  stops: JobStopView[];
  driver: { nickname: string; nameEn: string; fullName: string; carTh: string; carEn: string; plate: string; phone: string; lineId: string; langs: string[]; langsEn: string[]; rating: number; years: number } | null;
  photos: { kind: 'pickup' | 'dropoff'; takenAt: string; url?: string }[];
  /** driver audience only */
  customer?: { name: string; contact: string; hotel: string; note: string; langDriver: boolean };
  returnOffer: { fromId: string; discountPct: number; validUntil: string; returnBookingNo: string | null } | null;
}
