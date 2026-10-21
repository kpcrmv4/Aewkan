import { describe, expect, it } from 'vitest';
import {
  commissionRows,
  commissionSums,
  defaultCash,
  formatRemain,
  jobPhotoPath,
  mapJobView,
  plannedArrivals,
  quoteState,
  remainingMs,
  returnOfferState,
  stepperFor,
} from '@/features/job-link/model';
import type { JobViewJson } from '@/lib/contracts/job';
import { JOB_ERRORS, jobErrorText } from '@/lib/copy/job';

function view(over: Partial<JobViewJson['booking']> = {}, extra: Partial<JobViewJson> = {}): JobViewJson {
  return {
    audience: 'customer',
    booking: {
      id: 'b1', booking_no: '202610001', status: 'assigned', lang: 'th', travel_date: '2026-10-24', pickup_time: '08:00',
      vehicle_key: 'sedan', pax: 2, round_trip: false, mode: 'trip', rule_version: 1, price_total: 3000, deposit: 900,
      price_lines: [{ key: 'price.hours', vars: { h: 8, rate: 375 }, amount: 3000 }], plan: {}, lang_driver: false,
      quote_price: null, quote_deposit: null, quote_deadline: null, quote_message: null, started_at: null, finished_at: null, cash_collected: null,
      ...over,
    },
    pickup: { id: 'p', name_th: 'ท่าแพ', name_en: 'Tha Phae', lat: 1, lng: 1 },
    stops: [
      {
        seq: 1, place_id: 's1', name_th: 'สุเทพ', name_en: 'Suthep', lat: 1, lng: 1, dwell: 60, planned_minutes: 40, planned_km: 12.4, measured: false,
        checked_in_at: null, commission: null, commission_report: null,
      },
      {
        seq: 2, place_id: 's2', name_th: 'แม่สา', name_en: 'Mae Sa', lat: 1, lng: 1, dwell: 30, planned_minutes: 50, planned_km: 20, measured: true,
        checked_in_at: null, commission: { type: 'head', amount: 100, split_key: 'a', note: '' }, commission_report: null,
      },
    ],
    driver: null, photos: [], paid: 900, customer: null, commission_policy: null, return_offer: null,
    ...extra,
  };
}

describe('P3-90 mapJobView', () => {
  it('maps snake_case to the view model', () => {
    const m = mapJobView(view());
    expect(m.bookingNo).toBe('202610001');
    expect(m.pickup.nameEn).toBe('Tha Phae');
    expect(m.stops[0].plannedKm).toBe(12.4);
    expect(m.stops[1].commission?.splitKey).toBe('a');
    expect(m.customer).toBeNull();
    expect(m.total).toBe(3000);
  });
  it('uses the quote price and deposit when a quote exists', () => {
    const m = mapJobView(view({ mode: 'quote', quote_price: 5200, quote_deposit: 1500 }));
    expect(m.total).toBe(5200);
    expect(m.deposit).toBe(1500);
  });
  it('keeps an unknown language as Thai', () => {
    expect(mapJobView(view({ lang: 'th' })).lang).toBe('th');
    expect(mapJobView(view({ lang: 'en' })).lang).toBe('en');
  });
});

describe('P3-91 plannedArrivals', () => {
  it('adds drive minutes and the previous dwell', () => {
    expect(plannedArrivals('08:00', [{ plannedMinutes: 40, dwell: 60 }, { plannedMinutes: 50, dwell: 30 }])).toEqual(['08:40', '10:30']);
  });
  it('wraps past midnight', () => {
    expect(plannedArrivals('23:30', [{ plannedMinutes: 60, dwell: 0 }])).toEqual(['00:30']);
  });
  it('is empty without stops', () => {
    expect(plannedArrivals('08:00', [])).toEqual([]);
  });
});

describe('P3-92 stepperFor', () => {
  it('normal flow: assigned marks the third step current', () => {
    const s = stepperFor('assigned', false)!;
    expect(s.keys).toEqual(['sp1', 'sp2', 'sp3', 'sp4']);
    expect(s.states).toEqual(['done', 'done', 'now', 'todo']);
  });
  it('normal flow: done has no step left to do', () => {
    expect(stepperFor('done', false)!.states).toEqual(['done', 'done', 'done', 'done']);
  });
  it('quote flow has five steps', () => {
    const s = stepperFor('quoted', true)!;
    expect(s.keys).toEqual(['qs1', 'qs2', 'qs3', 'qs4', 'qs5']);
    expect(s.states).toEqual(['done', 'done', 'now', 'todo', 'todo']);
  });
  it('cancelled has no stepper', () => {
    expect(stepperFor('cancelled', false)).toBeNull();
  });
});

describe('P3-93 countdown', () => {
  const now = Date.parse('2026-10-21T10:00:00Z');
  it('counts down and clamps at zero', () => {
    expect(formatRemain(remainingMs('2026-10-21T11:02:03Z', now))).toBe('01:02:03');
    expect(formatRemain(remainingMs('2026-10-21T09:00:00Z', now))).toBe('00:00:00');
  });
  it('quote state: requested, quoted, expired by clock and by status', () => {
    const quote = { price: 1, deposit: 1, message: null };
    expect(quoteState({ status: 'quote_requested', quote: null }, now)).toBe('requested');
    expect(quoteState({ status: 'quoted', quote: { ...quote, deadline: '2026-10-21T11:00:00Z' } }, now)).toBe('quoted');
    expect(quoteState({ status: 'quoted', quote: { ...quote, deadline: '2026-10-21T09:59:59Z' } }, now)).toBe('expired');
    expect(quoteState({ status: 'quote_expired', quote: null }, now)).toBe('expired');
    expect(quoteState({ status: 'assigned', quote: null }, now)).toBeNull();
  });
});

describe('P3-94 error copy', () => {
  const codes = ['pickup_photo_required', 'not_assigned', 'not_traveling', 'dropoff_photo_required', 'sale_required', 'link_not_found', 'driver_only'];
  it('maps every database code in both languages', () => {
    for (const c of codes) {
      expect(JOB_ERRORS[c].th.length).toBeGreaterThan(3);
      expect(JOB_ERRORS[c].en.length).toBeGreaterThan(3);
      expect(jobErrorText(c, 'th')).toBe(JOB_ERRORS[c].th);
    }
  });
  it('falls back to a generic message', () => {
    expect(jobErrorText('weird', 'en')).toMatch(/try again/i);
    expect(jobErrorText(undefined, 'th')).toMatch(/ลองใหม่/);
  });
});

describe('P3-95 defaultCash', () => {
  it('is total minus paid and never negative', () => {
    expect(defaultCash(3000, 900)).toBe(2100);
    expect(defaultCash(900, 3000)).toBe(0);
  });
});

describe('P3-96 returnOfferState', () => {
  const base = { dismissedAt: null, returnBookingNo: null, validUntil: '2026-10-31' };
  it('open, dismissed, booked, expired', () => {
    expect(returnOfferState(base, '2026-10-24')).toBe('open');
    expect(returnOfferState(base, '2026-10-31')).toBe('open');
    expect(returnOfferState(base, '2026-11-01')).toBe('expired');
    expect(returnOfferState({ ...base, dismissedAt: 'x' }, '2026-10-24')).toBe('dismissed');
    expect(returnOfferState({ ...base, returnBookingNo: '202610002', dismissedAt: 'x' }, '2026-10-24')).toBe('booked');
  });
});

describe('P3-98 jobPhotoPath', () => {
  it('is <booking>/<kind>/<id>.jpg', () => {
    expect(jobPhotoPath('b1', 'pickup', 'u1')).toBe('b1/pickup/u1.jpg');
  });
});

describe('commission rows', () => {
  it('estimates head rules and sums the shares', () => {
    const m = mapJobView(
      view({}, { commission_policy: { policy_th: 'x', splits: { a: { name_th: 'ก', name_en: 'a', driver_pct: 70 } }, assumed_spend: 500 } }),
    );
    const rows = commissionRows(m);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ total: 200, driver: 140, company: 60, estimated: false });
    expect(commissionSums(rows)).toEqual({ driver: 140, company: 60 });
  });
});
