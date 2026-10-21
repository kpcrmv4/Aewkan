import type { CreateBookingRequestDto } from '@/lib/contracts/booking';
import type { Database, Json } from '@/lib/database.types';
import { depositFor, effectiveMode, type Catalog, type Mode, type Plan, type PriceResult, type TripInput } from '@/lib/pricing';

/**
 * Pure mapping from a validated request + server-side plan/price to database rows.
 * No I/O, so it is unit-tested (tests/unit/p1-booking-build.test.ts).
 */

export type BookingInsert = Database['public']['Tables']['bookings']['Insert'];
export type StopInsert = Database['public']['Tables']['booking_stops']['Insert'];

export interface Priced {
  /** quote-mode date: staff will price it, we store the reference total */
  quote: boolean;
  /** the mode whose total was used; for quotes the cheapest valid one */
  mode: Mode;
  total: number;
  deposit: number;
}

export type PriceCheck = { ok: true; priced: Priced } | { ok: false; code: 'mode_required' | 'mode_unavailable' | 'no_price' };

/** which mode and total this request is charged, or why it cannot be priced */
export function pickPrice(catalog: Catalog, result: PriceResult, mode: Mode | null, quote: boolean): PriceCheck {
  if (quote) {
    const m = effectiveMode(result, null);
    if (!m) return { ok: false, code: 'no_price' };
    return { ok: true, priced: { quote: true, mode: m, total: result.modes[m].total, deposit: 0 } };
  }
  if (!mode) return { ok: false, code: 'mode_required' };
  if (!result.modes[mode].ok) return { ok: false, code: 'mode_unavailable' };
  const total = result.modes[mode].total;
  return { ok: true, priced: { quote: false, mode, total, deposit: depositFor(catalog, total) } };
}

export function tripInputOf(req: CreateBookingRequestDto): TripInput {
  const t = req.trip;
  return { pickupId: t.pickupId, stops: t.stops.map((s) => ({ placeId: s.placeId, dwell: s.dwell })), date: t.date, time: t.time, pax: t.pax, vehicle: t.vehicle, roundTrip: t.roundTrip, langDriver: t.langDriver, festival: t.festival };
}

/** compact, JSON-safe snapshot of the plan (no Place objects) for job views and audits */
export function planSnapshot(plan: Plan, result: PriceResult, priced: Priced): Json {
  const leg = (l: Plan['legs'][number]) => ({ km: l.km, minutes: l.minutes, measured: l.measured, source: l.source, zone: l.zone, arrive: l.arrive, depart: l.depart, dwell: l.dwell });
  return {
    km: plan.km,
    driveMinutes: plan.driveMinutes,
    dwellMinutes: plan.dwellMinutes,
    totalMinutes: plan.totalMinutes,
    billMinutes: plan.billMinutes,
    start: plan.start,
    end: plan.end,
    maxZone: plan.maxZone,
    farZone: plan.farZone,
    mountainStops: plan.mountainStops,
    emptyReturnKm: plan.emptyReturnKm,
    night: plan.night,
    legs: plan.legs.map(leg),
    ret: plan.ret ? leg(plan.ret) : null,
    priced: { mode: priced.mode, quote: priced.quote, units: result.modes[priced.mode].units, best: result.best },
    reference: { hourly: result.modes.hourly.total, daily: result.modes.daily.total, trip: result.modes.trip.total, oneway: result.modes.oneway.total },
  };
}

export function buildBookingInsert(args: {
  req: CreateBookingRequestDto;
  plan: Plan;
  result: PriceResult;
  priced: Priced;
  ruleVersion: number;
  createdBy: string | null;
}): BookingInsert {
  const { req, plan, result, priced, ruleVersion, createdBy } = args;
  const c = req.customer;
  const t = req.trip;
  return {
    booking_no: '', // the bookings_number trigger fills it
    status: priced.quote ? 'quote_requested' : 'awaiting_deposit',
    customer_name: c.name,
    customer_contact: c.contact,
    contact_channel: c.channel,
    customer_lang: c.lang,
    hotel: c.hotel,
    note: c.note,
    push_opt_in: c.pushOptIn,
    pax: t.pax,
    vehicle_key: t.vehicle,
    pickup_place_id: t.pickupId,
    travel_date: t.date,
    pickup_time: `${t.time}:00`,
    round_trip: t.roundTrip,
    lang_driver: t.langDriver,
    festival: t.festival,
    mode: priced.quote ? 'quote' : priced.mode,
    rule_version: ruleVersion,
    price_total: priced.total,
    deposit: priced.deposit,
    price_lines: result.modes[priced.mode].lines as unknown as Json,
    plan: planSnapshot(plan, result, priced),
    created_by: createdBy,
  };
}

/** seq from 1; planned minutes/km/measured come from the leg that arrives at each stop */
export function buildStopRows(bookingId: string, input: TripInput, plan: Plan): StopInsert[] {
  return input.stops.map((s, i) => {
    const leg = plan.legs[i];
    return {
      booking_id: bookingId,
      seq: i + 1,
      place_id: s.placeId,
      dwell_min: s.dwell,
      planned_minutes: Math.round(leg?.minutes ?? 0),
      planned_km: Math.round((leg?.km ?? 0) * 10) / 10,
      measured: leg?.measured ?? false,
    };
  });
}
