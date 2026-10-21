/**
 * Pure mapping for the return-trip booking: price it from the CURRENT catalog,
 * ignore anything a client claims, and produce the rows to insert.
 * Used by POST /api/jobs/[token]/return and covered by tests/unit/p3-return.test.ts.
 */
import type { TablesInsert } from '@/lib/database.types';
import { depositFor, planTrip, priceTrip, round10, type Catalog, type Mode, type PriceLine, type TripInput } from '@/lib/pricing';

export interface ReturnParent {
  id: string;
  travelDate: string;
  pax: number;
  vehicleKey: string;
  langDriver: boolean;
  customerName: string;
  customerContact: string;
  contactChannel: string;
  customerLang: string;
  hotel: string;
  note: string;
}

export interface ReturnRequestInput {
  toId: string;
  date: string;
  time: string;
}

export type ReturnMapError = 'bad_destination' | 'bad_date' | 'unpriceable';

export interface ReturnBookingRows {
  booking: TablesInsert<'bookings'>;
  stop: Omit<TablesInsert<'booking_stops'>, 'booking_id'>;
  total: number;
  deposit: number;
  base: number;
  discount: number;
}

/** the discount the customer was offered wins over today's rule-set percentage */
export function withOfferPct(catalog: Catalog, pct: number): Catalog {
  return { ...catalog, rules: { ...catalog.rules, return_offer: { ...catalog.rules.return_offer, pct } } };
}

export function validateReturn(
  catalog: Catalog,
  parent: Pick<ReturnParent, 'travelDate'>,
  fromId: string,
  req: ReturnRequestInput,
): ReturnMapError | null {
  const to = catalog.places.find((p) => p.id === req.toId);
  if (!to || !to.is_pickup || req.toId === fromId) return 'bad_destination';
  if (req.date < parent.travelDate) return 'bad_date';
  return null;
}

export function buildReturnBooking(
  catalog: Catalog,
  parent: ReturnParent,
  offer: { fromId: string; discountPct: number },
  req: ReturnRequestInput,
): { ok: true; rows: ReturnBookingRows } | { ok: false; error: ReturnMapError } {
  const bad = validateReturn(catalog, parent, offer.fromId, req);
  if (bad) return { ok: false, error: bad };

  const priced = withOfferPct(catalog, offer.discountPct);
  const input: TripInput = {
    pickupId: offer.fromId,
    stops: [{ placeId: req.toId, dwell: 0 }],
    date: req.date,
    time: req.time,
    pax: parent.pax,
    vehicle: parent.vehicleKey,
    roundTrip: false,
    langDriver: parent.langDriver,
    festival: false,
  };
  const plan = planTrip(priced, input);
  const res = priceTrip(priced, input, plan);
  const mode: Mode | null = res.modes.oneway.ok ? 'oneway' : res.best;
  if (!mode) return { ok: false, error: 'unpriceable' };

  // same arithmetic as returnQuote(): base − round10(base × pct)
  const base = res.modes[mode].total;
  const discount = round10((base * offer.discountPct) / 100);
  const total = base - discount;
  const deposit = depositFor(priced, total);
  const lines: PriceLine[] = [...res.modes[mode].lines];
  if (discount > 0) lines.push({ key: 'price.returnDiscount', vars: { pct: offer.discountPct }, amount: -discount });

  const leg = plan.legs[0];
  return {
    ok: true,
    rows: {
      total,
      deposit,
      base,
      discount,
      booking: {
        booking_no: '',
        status: 'awaiting_deposit',
        customer_name: parent.customerName,
        customer_contact: parent.customerContact,
        contact_channel: parent.contactChannel,
        customer_lang: parent.customerLang,
        hotel: parent.hotel,
        note: parent.note,
        travel_date: req.date,
        pickup_time: req.time,
        pickup_place_id: offer.fromId,
        vehicle_key: parent.vehicleKey,
        pax: parent.pax,
        round_trip: false,
        lang_driver: parent.langDriver,
        festival: false,
        mode,
        rule_version: priced.ruleVersion,
        price_total: total,
        deposit,
        price_lines: lines as unknown as TablesInsert<'bookings'>['price_lines'],
        plan: { km: plan.km, totalMinutes: plan.totalMinutes, start: plan.start, end: plan.end, ret: null },
        parent_booking_id: parent.id,
        return_discount_pct: offer.discountPct,
      },
      stop: {
        seq: 1,
        place_id: req.toId,
        dwell_min: 0,
        planned_minutes: Math.round(leg?.minutes ?? 0),
        planned_km: leg?.km ?? 0,
        measured: leg?.measured ?? false,
      },
    },
  };
}
