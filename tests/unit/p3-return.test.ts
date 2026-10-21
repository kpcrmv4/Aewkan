import { describe, expect, it } from 'vitest';
import { buildReturnBooking, validateReturn, withOfferPct, type ReturnParent } from '@/features/job-link/return-map';
import { outboundInput } from '@/features/job-link/model';
import { returnQuote } from '@/lib/pricing';
import { makeCatalog, PLACES } from './fixtures/catalog';

const catalog = makeCatalog();
const pickups = PLACES.filter((p) => p.is_pickup);

const parent: ReturnParent = {
  id: 'parent-1',
  travelDate: '2026-10-24',
  pax: 2,
  vehicleKey: 'sedan',
  langDriver: false,
  customerName: 'E2E P3 test',
  customerContact: '@e2e',
  contactChannel: 'line',
  customerLang: 'en',
  hotel: 'Hotel',
  note: 'child seat',
};

const from = PLACES.find((p) => !p.is_pickup)!.id;
const to = pickups[0].id;
const req = { toId: to, date: '2026-10-26', time: '10:00' };

describe('P3-97 buildReturnBooking', () => {
  it('maps to an awaiting_deposit one-way linked to its parent', () => {
    const r = buildReturnBooking(catalog, parent, { fromId: from, discountPct: 10 }, req);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const b = r.rows.booking;
    expect(b.status).toBe('awaiting_deposit');
    expect(b.booking_no).toBe('');
    expect(b.parent_booking_id).toBe('parent-1');
    expect(b.return_discount_pct).toBe(10);
    expect(b.pickup_place_id).toBe(from);
    expect(b.round_trip).toBe(false);
    expect(b.customer_name).toBe('E2E P3 test');
    expect(b.customer_lang).toBe('en');
    expect(b.travel_date).toBe('2026-10-26');
    expect(b.rule_version).toBe(catalog.ruleVersion);
    expect(r.rows.stop).toMatchObject({ seq: 1, place_id: to, dwell_min: 0 });
  });

  it('P3-88 totals equal returnQuote with the offered discount, not a client number', () => {
    const r = buildReturnBooking(catalog, parent, { fromId: from, discountPct: 15 }, req);
    if (!r.ok) throw new Error('expected ok');
    const rq = returnQuote(withOfferPct(catalog, 15), outboundInput({ ...parent, vehicleKey: parent.vehicleKey, pickup: { id: from, nameTh: '', nameEn: '' }, pickupTime: '08:00' }), {
      fromId: from, toId: to, date: req.date, time: req.time,
    });
    expect(r.rows.total).toBe(rq.total);
    expect(r.rows.deposit).toBe(rq.deposit);
    expect(r.rows.base - r.rows.discount).toBe(r.rows.total);
    const lines = r.rows.booking.price_lines as Array<{ key: string; amount: number }>;
    expect(lines.at(-1)).toMatchObject({ key: 'price.returnDiscount', amount: -r.rows.discount });
    expect(r.rows.booking.price_total).toBe(r.rows.total);
  });

  it('no discount line when the offer is 0%', () => {
    const r = buildReturnBooking(catalog, parent, { fromId: from, discountPct: 0 }, req);
    if (!r.ok) throw new Error('expected ok');
    expect(r.rows.discount).toBe(0);
    expect((r.rows.booking.price_lines as Array<{ key: string }>).some((l) => l.key === 'price.returnDiscount')).toBe(false);
  });
});

describe('P3-87 validateReturn', () => {
  it('refuses a destination that is the origin, unknown or not pickup-capable', () => {
    expect(validateReturn(catalog, parent, to, { ...req, toId: to })).toBe('bad_destination');
    expect(validateReturn(catalog, parent, from, { ...req, toId: 'nope' })).toBe('bad_destination');
    const notPickup = PLACES.find((p) => !p.is_pickup)!.id;
    expect(validateReturn(catalog, parent, to, { ...req, toId: notPickup })).toBe('bad_destination');
  });
  it('refuses a return date before the travel date', () => {
    expect(validateReturn(catalog, parent, from, { ...req, date: '2026-10-23' })).toBe('bad_date');
    expect(validateReturn(catalog, parent, from, { ...req, date: '2026-10-24' })).toBeNull();
  });
  it('buildReturnBooking surfaces the error', () => {
    const r = buildReturnBooking(catalog, parent, { fromId: from, discountPct: 10 }, { ...req, toId: from });
    expect(r).toEqual({ ok: false, error: 'bad_destination' });
  });
});
