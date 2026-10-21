import { describe, expect, it } from 'vitest';
import { buildBookingInsert, buildStopRows, pickPrice, tripInputOf } from '@/app/api/bookings/build-booking';
import { buildRequest, validateContact, EMPTY_CONTACT } from '@/features/trip-builder/booking-request';
import { buildModel } from '@/features/trip-builder/model';
import { initialState } from '@/features/trip-builder/state';
import type { CreateBookingRequestDto } from '@/lib/contracts/booking';
import { depositFor, planTrip, priceTrip } from '@/lib/pricing';
import { makeCatalog } from './fixtures/catalog';

const catalog = makeCatalog();
const req = (over: Partial<CreateBookingRequestDto> = {}, date = '2026-10-24'): CreateBookingRequestDto => ({
  trip: {
    pickupId: 'tp',
    stops: [
      { placeId: 'suthep', dwell: 60 },
      { placeId: 'monjam', dwell: 90 },
    ],
    date,
    time: '08:00',
    pax: 2,
    vehicle: 'sedan',
    roundTrip: true,
    langDriver: false,
    festival: false,
  },
  mode: 'daily',
  customer: { name: 'Lukas', contact: '+49 171', channel: 'whatsapp', lang: 'en', hotel: 'H', note: '', pushOptIn: false },
  ruleVersion: catalog.ruleVersion,
  expectedTotal: null,
  ...over,
});

function priced(r: CreateBookingRequestDto) {
  const input = tripInputOf(r);
  const plan = planTrip(catalog, input);
  return { input, plan, result: priceTrip(catalog, input, plan) };
}

describe('P1 pickPrice', () => {
  it('charges the chosen mode with a deposit', () => {
    const { result } = priced(req());
    const p = pickPrice(catalog, result, 'daily', false);
    expect(p).toEqual({ ok: true, priced: { quote: false, mode: 'daily', total: result.modes.daily.total, deposit: depositFor(catalog, result.modes.daily.total) } });
  });
  it('requires a mode outside quote mode, refuses a not-ok mode', () => {
    const { result } = priced(req());
    expect(pickPrice(catalog, result, null, false)).toEqual({ ok: false, code: 'mode_required' });
    expect(result.modes.oneway.ok).toBe(false);
    expect(pickPrice(catalog, result, 'oneway', false)).toEqual({ ok: false, code: 'mode_unavailable' });
  });
  it('quote mode stores the cheapest valid total as reference and no deposit', () => {
    const { result } = priced(req());
    const p = pickPrice(catalog, result, 'trip', true);
    expect(p).toEqual({ ok: true, priced: { quote: true, mode: result.best, total: result.modes[result.best!].total, deposit: 0 } });
  });
});

describe('P1 buildBookingInsert / buildStopRows', () => {
  it('maps a priced booking to awaiting_deposit', () => {
    const r = req();
    const { plan, result, input } = priced(r);
    const p = pickPrice(catalog, result, 'daily', false);
    if (!p.ok) throw new Error('unpriced');
    const row = buildBookingInsert({ req: r, plan, result, priced: p.priced, ruleVersion: 1, createdBy: 'staff-1' });
    expect(row).toMatchObject({
      booking_no: '',
      status: 'awaiting_deposit',
      mode: 'daily',
      price_total: result.modes.daily.total,
      deposit: p.priced.deposit,
      rule_version: 1,
      pickup_time: '08:00:00',
      travel_date: '2026-10-24',
      customer_lang: 'en',
      contact_channel: 'whatsapp',
      created_by: 'staff-1',
      vehicle_key: 'sedan',
    });
    expect(row.price_lines).toEqual(result.modes.daily.lines);
    const stops = buildStopRows('b1', input, plan);
    expect(stops.map((s) => s.seq)).toEqual([1, 2]);
    expect(stops[0]).toMatchObject({ booking_id: 'b1', place_id: 'suthep', dwell_min: 60, planned_minutes: plan.legs[0].minutes, planned_km: plan.legs[0].km, measured: true });
  });
  it('maps a quote-mode booking to quote_requested, mode quote, deposit 0', () => {
    const r = req({ mode: null }, '2026-12-28');
    const { plan, result } = priced(r);
    const p = pickPrice(catalog, result, null, true);
    if (!p.ok) throw new Error('unpriced');
    const row = buildBookingInsert({ req: r, plan, result, priced: p.priced, ruleVersion: 1, createdBy: null });
    expect(row).toMatchObject({ status: 'quote_requested', mode: 'quote', deposit: 0, price_total: p.priced.total, created_by: null });
  });
});

describe('P1 client request', () => {
  const state = { ...initialState(catalog, [], '2026-10-21'), stops: [{ placeId: 'suthep', dwell: 60 }] };
  it('sends the selected mode and its displayed total', () => {
    const m = buildModel(catalog, { ...state, date: '2026-10-24' }, 'th');
    const body = buildRequest(m, { ...EMPTY_CONTACT, name: ' A ', contact: '081-111' })!;
    expect(body.mode).toBe(m.mode);
    expect(body.expectedTotal).toBe(m.res.modes[m.mode!].total);
    expect(body.customer.name).toBe('A');
  });
  it('in quote mode sends mode null and the reference total', () => {
    const m = buildModel(catalog, { ...state, date: '2026-12-28' }, 'en');
    expect(m.quote).toBe(true);
    const body = buildRequest(m, { ...EMPTY_CONTACT, name: 'A', contact: 'abc', pushOptIn: true })!;
    expect(body.mode).toBeNull();
    expect(body.expectedTotal).toBe(m.res.modes[m.res.best!].total);
    expect(body.customer.pushOptIn).toBe(true);
  });
  it('validates name and contact', () => {
    expect(validateContact(EMPTY_CONTACT)).toEqual({ name: true, contact: true });
    expect(validateContact({ ...EMPTY_CONTACT, name: 'a', contact: 'abc' })).toEqual({});
  });
});
