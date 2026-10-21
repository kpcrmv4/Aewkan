import { describe, expect, it } from 'vitest';
import {
  addDays,
  commissionFor,
  depositFor,
  formatClock,
  planTrip,
  priceTrip,
  quoteModeActive,
  returnQuote,
  suggestAlongRoute,
  suggestedQuote,
  tripWarnings,
  vehicleFor,
  whatIfAdd,
  whatIfRemove,
  zoneOf,
  type TripInput,
} from '@/lib/pricing';
import { makeCatalog, PLACES, RULES_V1 } from './fixtures/catalog';

const catalog = makeCatalog();
const place = (id: string) => PLACES.find((p) => p.id === id)!;

const base: TripInput = {
  pickupId: 'tp',
  stops: [
    { placeId: 'suthep', dwell: 60 },
    { placeId: 'monjam', dwell: 90 },
    { placeId: 'maesa', dwell: 60 },
  ],
  date: '2026-10-24',
  time: '08:00',
  pax: 2,
  vehicle: 'sedan',
  roundTrip: true,
  langDriver: false,
  festival: false,
};

describe('zones', () => {
  it('measures from the base, straight line', () => {
    expect(zoneOf(catalog, place('tp'))).toBe(1);
    expect(zoneOf(catalog, place('suthep'))).toBe(1); // ~8.4 km
    expect(zoneOf(catalog, place('monjam'))).toBe(2);
    expect(zoneOf(catalog, place('mkp'))).toBe(3);
    expect(zoneOf(catalog, place('pai'))).toBe(4);
  });
});

describe('planTrip', () => {
  it('uses measured segments for every leg of the seeded loop', () => {
    const plan = planTrip(catalog, base);
    expect(plan.legs.map((l) => [l.km, l.minutes, l.measured])).toEqual([
      [16, 40, true],
      [34, 65, true],
      [14, 25, true],
    ]);
    expect(plan.ret).toMatchObject({ km: 24, minutes: 45, measured: true, source: 'checkins' });
    expect(plan.km).toBe(88);
    expect(plan.driveMinutes).toBe(175);
    expect(plan.dwellMinutes).toBe(210);
    expect(plan.totalMinutes).toBe(385);
    expect(formatClock(plan.end)).toBe('14:25');
    expect(plan.maxZone).toBe(2);
    expect(plan.mountainStops).toBe(2);
    expect(plan.night).toBe(false);
  });

  it('prefers driven over routing for the same pair', () => {
    const plan = planTrip(catalog, { ...base, stops: [{ placeId: 'pai', dwell: 0 }], roundTrip: false });
    expect(plan.legs[0]).toMatchObject({ km: 135, minutes: 200, source: 'driven' });
  });

  it('falls back to the estimate when no segment exists', () => {
    const plan = planTrip(catalog, { ...base, stops: [{ placeId: 'bosang', dwell: 45 }] });
    expect(plan.legs[0].measured).toBe(false);
    expect(plan.legs[0].source).toBe('estimate');
    expect(plan.legs[0].km).toBeGreaterThan(9);
  });

  it('flags night when the trip starts before 06:00', () => {
    expect(planTrip(catalog, { ...base, time: '05:30' }).night).toBe(true);
  });
});

describe('priceTrip — the seeded loop (sedan, 2 pax)', () => {
  const plan = planTrip(catalog, base);
  const res = priceTrip(catalog, base, plan);

  it('hourly bills whole hours above the minimum', () => {
    // 385 min → 7 h × 350 + zone 2 (200) + 2 mountain stops (600)
    expect(res.modes.hourly.units).toBe(7);
    expect(res.modes.hourly.total).toBe(2450 + 200 + 600);
  });

  it('daily covers 10 h / 150 km in one day', () => {
    expect(res.modes.daily.total).toBe(2800 + 200 + 600);
  });

  it('trip adds the all-inclusive percentage', () => {
    expect(res.modes.trip.total).toBe(2800 + 420 + 200 + 600);
  });

  it('one-way is refused on a round trip and picks the cheapest valid mode', () => {
    expect(res.modes.oneway.ok).toBe(false);
    expect(res.modes.oneway.reason).toBe('needs_one_way');
    expect(res.best).toBe('hourly');
  });

  it('never quotes zero hours below the minimum', () => {
    const short = { ...base, stops: [{ placeId: 'suthep', dwell: 30 }] };
    const r = priceTrip(catalog, short, planTrip(catalog, short));
    expect(r.modes.hourly.units).toBe(4);
  });
});

describe('priceTrip — surcharges', () => {
  it('applies night % then festival % on the running subtotal, rounded to 10', () => {
    const input = { ...base, time: '05:30', festival: true, langDriver: true };
    const res = priceTrip(catalog, input, planTrip(catalog, input));
    const lines = res.modes.daily.lines;
    expect(lines.find((l) => l.key === 'price.langDriver')?.amount).toBe(200);
    // subtotal 2800+200+600+200 = 3800 → night 15% = 570 → 4370 → festival 10% = 437 → 440
    expect(lines.find((l) => l.key === 'price.night')?.amount).toBe(570);
    expect(lines.find((l) => l.key === 'price.festival')?.amount).toBe(440);
    expect(res.modes.daily.total).toBe(4810);
  });

  it('daily charges overtime and extra km past the inclusion', () => {
    // tp → Pai → tp: 270 km measured, 200+120+200 min = 8.7 h → one day, 120 km over
    const long = { ...base, stops: [{ placeId: 'pai', dwell: 120 }], roundTrip: true };
    const plan = planTrip(catalog, long);
    const res = priceTrip(catalog, long, plan);
    expect(plan.km).toBe(270);
    expect(res.modes.daily.units).toBe(1);
    expect(res.modes.daily.lines.find((l) => l.key === 'price.extraKm')?.amount).toBe(1200);
    // 14:00 start, 520 min → ends 22:40 → night, and 10 h inclusion still holds
    const late = { ...long, time: '14:00' };
    const lateRes = priceTrip(catalog, late, planTrip(catalog, late));
    expect(lateRes.modes.daily.lines.map((l) => l.key)).toContain('price.night');
  });
});

describe('priceTrip — one-way', () => {
  const input: TripInput = { ...base, stops: [{ placeId: 'chiangdao', dwell: 60 }, { placeId: 'pai', dwell: 0 }], roundTrip: false };
  const plan = planTrip(catalog, input);
  const res = priceTrip(catalog, input, plan);

  it('is allowed when the far end is zone 3+ and has no zone fee', () => {
    expect(res.modes.oneway.ok).toBe(true);
    expect(res.modes.oneway.lines.some((l) => l.key === 'price.zone')).toBe(false);
  });

  it('charges the empty repositioning share and one paid stop', () => {
    const keys = res.modes.oneway.lines.map((l) => l.key);
    expect(keys).toContain('price.emptyReturn');
    expect(res.modes.oneway.lines.find((l) => l.key === 'price.stopFee')?.amount).toBe(150);
  });

  it('bills the driver drive home on hourly/daily/trip', () => {
    expect(plan.emptyReturnMinutes).toBe(200);
    expect(plan.billMinutes).toBe(plan.totalMinutes + 200);
  });

  it('prices a far pickup like a far drop-off (Pai → town)', () => {
    const back: TripInput = { ...base, pickupId: 'pai', stops: [{ placeId: 'tp', dwell: 0 }], roundTrip: false };
    const there: TripInput = { ...base, pickupId: 'tp', stops: [{ placeId: 'pai', dwell: 0 }], roundTrip: false };
    const a = priceTrip(catalog, back, planTrip(catalog, back)).modes.oneway;
    const b = priceTrip(catalog, there, planTrip(catalog, there)).modes.oneway;
    expect(a.ok).toBe(true);
    expect(a.total).toBe(b.total);
  });

  it('is refused inside town', () => {
    const near: TripInput = { ...base, stops: [{ placeId: 'nimman', dwell: 0 }], roundTrip: false };
    const r = priceTrip(catalog, near, planTrip(catalog, near));
    expect(r.modes.oneway.reason).toBe('needs_far_zone');
  });
});

describe('deposit', () => {
  it('is pct of total rounded to 100, never below the minimum', () => {
    expect(depositFor(catalog, 3250)).toBe(1000);
    expect(depositFor(catalog, 200)).toBe(100);
  });
});

describe('what-if', () => {
  it('removing a stop changes the price by the mountain fee and hours', () => {
    expect(whatIfRemove(catalog, base, 1, 'hourly')).toBeLessThan(0);
  });

  it('adding returns the cheapest insertion and a positive delta', () => {
    const s = whatIfAdd(catalog, base, place('bosang'), 'hourly');
    expect(s.delta).toBeGreaterThan(0);
    expect(s.addedMinutes).toBeGreaterThan(0);
  });

  it('suggestions never include the pickup, existing stops, or pickup-only places', () => {
    const list = suggestAlongRoute(catalog, base, null);
    const ids = list.map((s) => s.place.id);
    expect(ids).not.toContain('tp');
    expect(ids).not.toContain('suthep');
    expect(ids).not.toContain('airport');
    expect(list.length).toBeGreaterThan(0);
    expect([...list].sort((a, b) => a.detourKm - b.detourKm)).toEqual(list);
  });
});

describe('warnings and vehicles', () => {
  it('warns when pax exceed seats and picks the smallest vehicle that fits', () => {
    const input = { ...base, pax: 4 };
    expect(tripWarnings(catalog, input, planTrip(catalog, input))).toContainEqual({ kind: 'too_many_pax', pax: 4, seats: 3 });
    expect(vehicleFor(catalog, 4)).toBe('suv');
    expect(vehicleFor(catalog, 9)).toBe('van');
    expect(vehicleFor(catalog, 10)).toBeNull();
  });
});

describe('quote mode', () => {
  it('is active only inside the configured date range', () => {
    expect(quoteModeActive(RULES_V1, '2026-12-31')).toBe(true);
    expect(quoteModeActive(RULES_V1, '2026-10-24')).toBe(false);
    expect(quoteModeActive({ ...RULES_V1, quote: { ...RULES_V1.quote, use_range: false } }, '2026-10-24')).toBe(true);
    expect(quoteModeActive({ ...RULES_V1, quote: { ...RULES_V1.quote, enabled: false } }, '2026-12-31')).toBe(false);
  });

  it('suggests reference + pct rounded to 100', () => {
    expect(suggestedQuote(catalog, 5110)).toEqual({ price: 6100, deposit: 1800, hours: 2 });
  });
});

describe('return trip', () => {
  it('prices the way back as a discounted one-way', () => {
    const out: TripInput = { ...base, stops: [{ placeId: 'pai', dwell: 0 }], roundTrip: false };
    const r = returnQuote(catalog, out, { fromId: 'pai', toId: 'tp', date: '2026-10-26', time: '10:00' });
    expect(r.ok).toBe(true);
    expect(r.discount).toBe(Math.round((r.base * 0.1) / 10) * 10);
    expect(r.total).toBe(r.base - r.discount);
  });

  it('adds calendar days without time-zone drift', () => {
    expect(addDays('2026-12-31', 2)).toBe('2027-01-02');
    expect(addDays('2026-10-24', 0)).toBe('2026-10-24');
  });
});

describe('commission', () => {
  it('splits per head, per trip and percent of sale', () => {
    expect(commissionFor(RULES_V1, { type: 'head', amount: 100, split_key: 'driver' }, 3)).toEqual({ total: 300, driver: 300, company: 0, estimated: false });
    expect(commissionFor(RULES_V1, { type: 'booking', amount: 150, split_key: 'company' }, 3)).toEqual({ total: 150, driver: 0, company: 150, estimated: false });
    expect(commissionFor(RULES_V1, { type: 'sale', amount: 10, split_key: 'half' }, 2)).toEqual({ total: 160, driver: 80, company: 80, estimated: true });
    expect(commissionFor(RULES_V1, { type: 'sale', amount: 10, split_key: 'half' }, 2, 3000)).toEqual({ total: 300, driver: 150, company: 150, estimated: false });
  });

  it('shares always add up to the total', () => {
    const c = commissionFor(RULES_V1, { type: 'sale', amount: 7, split_key: 'half' }, 1, 1234);
    expect(c.driver + c.company).toBe(c.total);
  });
});
