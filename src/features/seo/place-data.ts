import {
  basePlace,
  planTrip,
  priceTrip,
  straightKm,
  vehicleFor,
  zoneOf,
  type Catalog,
  type Mode,
  type Place,
  type TripInput,
  type ZoneId,
} from '@/lib/pricing';

/**
 * Data behind a place landing page. Pure: the same engine that prices the trip
 * builder prices "a round trip from the base pickup to this place with its
 * default stay", so the page, the JSON-LD and a customer's own plan agree.
 */

/** date and time only matter for night/festival surcharges, which this estimate leaves out */
const SAMPLE_DATE = '2026-06-15';
const SAMPLE_TIME = '08:00';
const SAMPLE_PAX = 2;
const FALLBACK_DWELL = 60;
export const NEARBY_COUNT = 4;

/** places that get a landing page: everything customers can visit (not the pickup points) */
export function landingPlaces(catalog: Catalog): Place[] {
  return catalog.places.filter((p) => p.category !== 'pickup' && p.id !== catalog.basePlaceId);
}

export interface PriceRow {
  mode: Mode;
  total: number;
  /** hourly: billed hours · daily/trip: days · oneway: km */
  units: number;
  /** cheapest of the round-trip prices */
  best: boolean;
}

export interface PlaceLanding {
  place: Place;
  base: Place;
  vehicle: { key: string; name_th: string; name_en: string; seats: number };
  zone: ZoneId;
  dwell: number;
  /** base → place, one direction */
  oneWayKm: number;
  oneWayMinutes: number;
  /** base → place → base including the stay */
  roundKm: number;
  roundMinutes: number;
  /** hourly / daily / trip for the round trip, then one-way when it is valid for this distance */
  rows: PriceRow[];
  best: Mode | null;
  /** lowest valid price on the page; null when nothing can be priced */
  fromPrice: number | null;
  ruleVersion: number;
  mountainFee: number;
  nearby: Array<{ place: Place; km: number }>;
}

export function nearbyPlaces(catalog: Catalog, place: Place, count = NEARBY_COUNT): Array<{ place: Place; km: number }> {
  return landingPlaces(catalog)
    .filter((p) => p.id !== place.id)
    .map((p) => ({ place: p, km: straightKm(place, p) }))
    .sort((a, b) => a.km - b.km || a.place.slug.localeCompare(b.place.slug))
    .slice(0, count);
}

export function buildPlaceLanding(catalog: Catalog, slug: string): PlaceLanding | null {
  const place = landingPlaces(catalog).find((p) => p.slug === slug);
  if (!place) return null;
  const base = basePlace(catalog);
  const vehicleKey = vehicleFor(catalog, SAMPLE_PAX) ?? Object.keys(catalog.rules.vehicles)[0];
  const v = catalog.rules.vehicles[vehicleKey];
  if (!v) return null;
  const dwell = place.default_dwell_min > 0 ? place.default_dwell_min : FALLBACK_DWELL;

  const input: TripInput = {
    pickupId: base.id,
    stops: [{ placeId: place.id, dwell }],
    date: SAMPLE_DATE,
    time: SAMPLE_TIME,
    pax: SAMPLE_PAX,
    vehicle: vehicleKey,
    roundTrip: true,
    langDriver: false,
    festival: false,
  };
  const plan = planTrip(catalog, input);
  const res = priceTrip(catalog, input, plan);

  const rows: PriceRow[] = [];
  for (const mode of ['hourly', 'daily', 'trip'] as const) {
    const m = res.modes[mode];
    if (m.ok) rows.push({ mode, total: m.total, units: m.units, best: res.best === mode });
  }
  const oneInput: TripInput = { ...input, roundTrip: false };
  const onePlan = planTrip(catalog, oneInput);
  const one = priceTrip(catalog, oneInput, onePlan).modes.oneway;
  if (one.ok) rows.push({ mode: 'oneway', total: one.total, units: one.units, best: false });

  return {
    place,
    base,
    vehicle: { key: vehicleKey, name_th: v.name_th, name_en: v.name_en, seats: v.seats },
    zone: zoneOf(catalog, place),
    dwell,
    oneWayKm: plan.legs[0]?.km ?? 0,
    oneWayMinutes: plan.legs[0]?.minutes ?? 0,
    roundKm: plan.km,
    roundMinutes: plan.totalMinutes,
    rows,
    best: res.best,
    fromPrice: rows.length ? Math.min(...rows.map((r) => r.total)) : null,
    ruleVersion: catalog.ruleVersion,
    mountainFee: catalog.rules.mountain_fee,
    nearby: nearbyPlaces(catalog, place),
  };
}

/**
 * `?places=a,b,c` → clean slug list: trimmed, lower-cased, de-duplicated, junk dropped.
 * Capped generously here; the trip builder keeps the first MAX_PREFILL slugs that exist.
 */
export const MAX_PREFILL = 8;
export function parsePlacesParam(raw: string | string[] | undefined): string[] {
  const text = Array.isArray(raw) ? raw.join(',') : (raw ?? '');
  const out: string[] = [];
  for (const part of text.split(',')) {
    const s = part.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(s) || out.includes(s)) continue;
    out.push(s);
    if (out.length === MAX_PREFILL * 4) break;
  }
  return out;
}
