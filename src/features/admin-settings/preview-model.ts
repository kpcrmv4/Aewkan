import { planTrip, priceTrip, type Catalog, type Mode, type Rules, type TripInput } from '@/lib/pricing';

export type SampleKey = 'temples' | 'mountain' | 'province';

export interface SampleTrip {
  key: SampleKey;
  input: TripInput;
}

/** fixed date/time: a plain weekday morning outside any festival window, so the sample only moves when the rules do */
export const SAMPLE_DATE = '2027-03-10';
export const SAMPLE_TIME = '09:00';

/**
 * Up to three representative trips built from the places that exist: two
 * temples round trip (smallest car), a mountain stop round trip (middle car),
 * and one province one-way (largest car). A trip is skipped when the catalog
 * has no place for it.
 */
export function sampleTrips(catalog: Catalog): SampleTrip[] {
  const vehicles = Object.entries(catalog.rules.vehicles).sort((a, b) => a[1].sort - b[1].sort);
  if (vehicles.length === 0) return [];
  const small = vehicles[0];
  const mid = vehicles[Math.min(1, vehicles.length - 1)];
  const big = vehicles[vehicles.length - 1];
  const pickupId = catalog.basePlaceId;
  const stopsOf = (pred: (p: Catalog['places'][number]) => boolean, n: number) =>
    catalog.places
      .filter((p) => p.id !== pickupId && p.category !== 'pickup' && pred(p))
      .slice(0, n)
      .map((p) => ({ placeId: p.id, dwell: p.default_dwell_min }));
  const base = { pickupId, date: SAMPLE_DATE, time: SAMPLE_TIME, langDriver: false, festival: false };
  const out: SampleTrip[] = [];

  const temples = stopsOf((p) => p.category === 'temple', 2);
  if (temples.length === 2) out.push({ key: 'temples', input: { ...base, stops: temples, pax: Math.min(2, small[1].seats), vehicle: small[0], roundTrip: true } });

  const mountain = stopsOf((p) => p.is_mountain, 1);
  if (mountain.length === 1) out.push({ key: 'mountain', input: { ...base, stops: mountain, pax: Math.min(4, mid[1].seats), vehicle: mid[0], roundTrip: true } });

  const province = stopsOf((p) => p.category === 'province', 1);
  if (province.length === 1) out.push({ key: 'province', input: { ...base, stops: province, pax: Math.min(6, big[1].seats), vehicle: big[0], roundTrip: false } });
  return out;
}

export interface SamplePrice {
  mode: Mode;
  total: number;
}

/** cheapest valid mode for the trip under `rules`; null when the engine cannot price it */
export function priceSample(catalog: Catalog, rules: Rules, input: TripInput): SamplePrice | null {
  try {
    const c: Catalog = { ...catalog, rules };
    // a vehicle the draft no longer has cannot be priced
    if (!c.rules.vehicles[input.vehicle]) return null;
    const result = priceTrip(c, input, planTrip(c, input));
    return result.best ? { mode: result.best, total: result.modes[result.best].total } : null;
  } catch {
    return null;
  }
}
