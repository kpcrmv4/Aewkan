/**
 * Pure view-model for the job link: maps the snake_case JSON of rpc('get_job_view')
 * and holds every rule the UI needs (stepper, arrivals, countdown, offer state).
 * No React, no Supabase — covered by tests/unit/p3-*.test.ts.
 */
import type { Audience, JobViewJson } from '@/lib/contracts/job';
import { commissionFor, formatClock, toMinutes, type Rules, type TripInput } from '@/lib/pricing';

export type Lang = 'th' | 'en';
export type PhotoKind = 'pickup' | 'dropoff';

export interface StopModel {
  seq: number;
  placeId: string;
  nameTh: string;
  nameEn: string;
  dwell: number;
  plannedMinutes: number;
  plannedKm: number;
  checkedInAt: string | null;
  commission: { type: 'head' | 'booking' | 'sale'; amount: number; splitKey: string; note: string } | null;
  report: { saleAmount: number | null; total: number; driverShare: number; companyShare: number } | null;
}

export interface PhotoModel {
  kind: PhotoKind;
  takenAt: string;
  path: string | null;
}

export interface ReturnOfferModel {
  fromId: string;
  discountPct: number;
  validUntil: string;
  dismissedAt: string | null;
  returnBookingNo: string | null;
}

export interface JobModel {
  audience: Audience;
  bookingId: string;
  bookingNo: string;
  status: string;
  lang: Lang;
  travelDate: string;
  pickupTime: string;
  pickup: { id: string; nameTh: string; nameEn: string };
  vehicleKey: string;
  pax: number;
  roundTrip: boolean;
  mode: string;
  ruleVersion: number;
  langDriver: boolean;
  total: number;
  deposit: number;
  paid: number;
  priceLines: Array<{ key: string; vars: Record<string, string | number>; amount: number }>;
  quote: { price: number; deposit: number; deadline: string | null; message: string | null } | null;
  startedAt: string | null;
  finishedAt: string | null;
  cashCollected: number | null;
  returnArrive: string | null;
  stops: StopModel[];
  driver: {
    nickname: string;
    nameEn: string;
    fullName: string;
    carTh: string;
    carEn: string;
    plate: string;
    phone: string;
    lineId: string;
    langs: string[];
    langsEn: string[];
    rating: number;
    years: number;
  } | null;
  photos: PhotoModel[];
  customer: { name: string; contact: string; channel: string; hotel: string; note: string } | null;
  policy: { policyTh: string; splits: Record<string, { name_th: string; name_en: string; driver_pct: number }>; assumedSpend: number } | null;
  returnOffer: ReturnOfferModel | null;
}

const QUOTE_STATUSES = ['quote_requested', 'quoted', 'quote_expired'];

export const isQuoteFlow = (j: Pick<JobModel, 'mode' | 'status'>) => j.mode === 'quote' || QUOTE_STATUSES.includes(j.status);

function returnArrive(plan: unknown): string | null {
  const ret = (plan as { ret?: { arrive?: unknown } } | null | undefined)?.ret;
  return ret && typeof ret.arrive === 'number' ? formatClock(ret.arrive) : null;
}

export function mapJobView(j: JobViewJson): JobModel {
  const b = j.booking;
  const quoteMode = b.mode === 'quote' || b.quote_price != null;
  const quote =
    b.quote_price != null
      ? { price: b.quote_price, deposit: b.quote_deposit ?? b.deposit, deadline: b.quote_deadline, message: b.quote_message }
      : null;
  return {
    audience: j.audience,
    bookingId: b.id,
    bookingNo: b.booking_no,
    status: b.status,
    lang: b.lang === 'en' ? 'en' : 'th',
    travelDate: b.travel_date,
    pickupTime: b.pickup_time,
    pickup: { id: j.pickup.id, nameTh: j.pickup.name_th, nameEn: j.pickup.name_en },
    vehicleKey: b.vehicle_key,
    pax: b.pax,
    roundTrip: b.round_trip,
    mode: b.mode,
    ruleVersion: b.rule_version,
    langDriver: b.lang_driver,
    total: quoteMode && quote ? quote.price : b.price_total,
    deposit: quoteMode && quote ? quote.deposit : b.deposit,
    paid: j.paid ?? 0,
    priceLines: Array.isArray(b.price_lines) ? b.price_lines : [],
    quote,
    startedAt: b.started_at,
    finishedAt: b.finished_at,
    cashCollected: b.cash_collected,
    returnArrive: returnArrive(b.plan),
    stops: (j.stops ?? []).map((s) => ({
      seq: s.seq,
      placeId: s.place_id,
      nameTh: s.name_th,
      nameEn: s.name_en,
      dwell: s.dwell,
      plannedMinutes: s.planned_minutes,
      plannedKm: Number(s.planned_km),
      checkedInAt: s.checked_in_at,
      commission: s.commission ? { type: s.commission.type, amount: s.commission.amount, splitKey: s.commission.split_key, note: s.commission.note } : null,
      report: s.commission_report
        ? {
            saleAmount: s.commission_report.sale_amount,
            total: s.commission_report.total,
            driverShare: s.commission_report.driver_share,
            companyShare: s.commission_report.company_share,
          }
        : null,
    })),
    driver: j.driver
      ? {
          nickname: j.driver.nickname,
          nameEn: j.driver.name_en,
          fullName: j.driver.full_name,
          carTh: j.driver.car_th,
          carEn: j.driver.car_en,
          plate: j.driver.plate,
          phone: j.driver.phone,
          lineId: j.driver.line_id,
          langs: j.driver.langs ?? [],
          langsEn: j.driver.langs_en ?? [],
          rating: Number(j.driver.rating),
          years: j.driver.years,
        }
      : null,
    photos: (j.photos ?? []).map((p) => ({ kind: p.kind, takenAt: p.taken_at, path: p.path })),
    customer: j.customer ?? null,
    policy: j.commission_policy
      ? { policyTh: j.commission_policy.policy_th ?? '', splits: j.commission_policy.splits ?? {}, assumedSpend: Number(j.commission_policy.assumed_spend ?? 0) }
      : null,
    returnOffer: j.return_offer
      ? {
          fromId: j.return_offer.from_place_id,
          discountPct: j.return_offer.discount_pct,
          validUntil: j.return_offer.valid_until,
          dismissedAt: j.return_offer.dismissed_at,
          returnBookingNo: j.return_offer.return_booking_no,
        }
      : null,
  };
}

/** newest photo of a kind (the view lists them newest first) */
export function latestPhoto(photos: PhotoModel[], kind: PhotoKind): PhotoModel | null {
  return photos.find((p) => p.kind === kind) ?? null;
}

export const name = (o: { nameTh: string; nameEn: string }, lang: Lang) => (lang === 'en' ? o.nameEn || o.nameTh : o.nameTh);

// ── itinerary ────────────────────────────────────────────────────────────────

/** planned arrival 'HH:MM' per stop: pickup time + drive minutes + earlier dwell */
export function plannedArrivals(pickupTime: string, stops: Array<{ plannedMinutes: number; dwell: number }>): string[] {
  let t = toMinutes(pickupTime);
  return stops.map((s) => {
    t += s.plannedMinutes;
    const at = formatClock(t);
    t += s.dwell;
    return at;
  });
}

export function tripTotals(stops: Array<{ plannedMinutes: number; dwell: number; plannedKm: number }>) {
  const km = stops.reduce((a, s) => a + s.plannedKm, 0);
  const minutes = stops.reduce((a, s) => a + s.plannedMinutes + s.dwell, 0);
  return { km: Math.round(km), minutes };
}

// ── stepper ──────────────────────────────────────────────────────────────────

export type StepState = 'done' | 'now' | 'todo';

/** which step is current (earlier ones are done); null = no stepper (cancelled) */
export function stageIndex(status: string, quoteFlow: boolean): number | null {
  if (status === 'cancelled') return null;
  if (quoteFlow) {
    const m: Record<string, number> = {
      quote_requested: 1,
      quoted: 2,
      quote_expired: 2,
      awaiting_deposit: 2,
      deposit_review: 3,
      confirmed: 3,
      assigned: 4,
      traveling: 4,
      done: 5,
    };
    return m[status] ?? 1;
  }
  const m: Record<string, number> = { awaiting_deposit: 0, deposit_review: 1, confirmed: 1, assigned: 2, traveling: 3, done: 4 };
  return m[status] ?? 0;
}

export function stepperFor(status: string, quoteFlow: boolean): { keys: Array<'sp1' | 'sp2' | 'sp3' | 'sp4' | 'qs1' | 'qs2' | 'qs3' | 'qs4' | 'qs5'>; states: StepState[] } | null {
  const stage = stageIndex(status, quoteFlow);
  if (stage === null) return null;
  const keys = quoteFlow ? (['qs1', 'qs2', 'qs3', 'qs4', 'qs5'] as const) : (['sp1', 'sp2', 'sp3', 'sp4'] as const);
  return { keys: [...keys], states: keys.map((_, i) => (i < stage ? 'done' : i === stage ? 'now' : 'todo')) };
}

// ── quote box ────────────────────────────────────────────────────────────────

export const remainingMs = (deadlineIso: string, nowMs: number) => new Date(deadlineIso).getTime() - nowMs;

/** ms → 'HH:MM:SS' (00:00:00 once past) */
export function formatRemain(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export type QuoteState = 'requested' | 'quoted' | 'expired';

/** null when the booking is not (or no longer) in the quote stage before the deposit */
export function quoteState(j: Pick<JobModel, 'status' | 'quote'>, nowMs: number): QuoteState | null {
  if (j.status === 'quote_requested') return 'requested';
  if (j.status === 'quote_expired') return 'expired';
  if (j.status === 'quoted' && j.quote) {
    return j.quote.deadline && remainingMs(j.quote.deadline, nowMs) <= 0 ? 'expired' : 'quoted';
  }
  return null;
}

// ── return offer ─────────────────────────────────────────────────────────────

export type OfferState = 'open' | 'dismissed' | 'booked' | 'expired';

/** `today` is 'YYYY-MM-DD' in Bangkok */
export function returnOfferState(o: Pick<ReturnOfferModel, 'dismissedAt' | 'returnBookingNo' | 'validUntil'>, today: string): OfferState {
  if (o.returnBookingNo) return 'booked';
  if (o.dismissedAt) return 'dismissed';
  if (o.validUntil < today) return 'expired';
  return 'open';
}

/** the outbound trip as the pricing engine wants it (places/date/time are overridden by returnQuote) */
export function outboundInput(j: Pick<JobModel, 'pax' | 'vehicleKey' | 'langDriver' | 'travelDate' | 'pickupTime' | 'pickup'>): TripInput {
  return {
    pickupId: j.pickup.id,
    stops: [],
    date: j.travelDate,
    time: j.pickupTime,
    pax: j.pax,
    vehicle: j.vehicleKey,
    roundTrip: false,
    langDriver: j.langDriver,
    festival: false,
  };
}

// ── driver ───────────────────────────────────────────────────────────────────

/** cash the driver should collect by default: total minus what was paid */
export const defaultCash = (total: number, paid: number) => Math.max(0, Math.round(total - paid));

export function jobPhotoPath(bookingId: string, kind: PhotoKind, id: string): string {
  return `${bookingId}/${kind}/${id}.jpg`;
}

export interface StopCommission {
  stop: StopModel;
  total: number;
  driver: number;
  company: number;
  estimated: boolean;
}

/** per-stop commission: the reported numbers when they exist, else the estimate from the rule set */
export function commissionRows(j: Pick<JobModel, 'stops' | 'pax' | 'policy'>): StopCommission[] {
  const rules = {
    commission: { assumed_spend: j.policy?.assumedSpend ?? 0, splits: j.policy?.splits ?? {}, policy_th: j.policy?.policyTh ?? '' },
  } as unknown as Rules;
  return j.stops
    .filter((s) => s.commission)
    .map((s) => {
      if (s.report) return { stop: s, total: s.report.total, driver: s.report.driverShare, company: s.report.companyShare, estimated: false };
      const c = s.commission!;
      const e = commissionFor(rules, { type: c.type, amount: c.amount, split_key: c.splitKey }, j.pax, null);
      return { stop: s, total: e.total, driver: e.driver, company: e.company, estimated: e.estimated };
    });
}

export function commissionSums(rows: StopCommission[]) {
  return { driver: rows.reduce((a, r) => a + r.driver, 0), company: rows.reduce((a, r) => a + r.company, 0) };
}
