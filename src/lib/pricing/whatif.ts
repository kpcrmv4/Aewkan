import { indexSegments, measureLeg, placeById, zoneOf } from './geo';
import { planTrip } from './plan';
import { effectiveMode, priceTrip } from './price';
import type { Catalog, Mode, Place, StopInput, TripInput, ZoneId } from './types';

function totalFor(catalog: Catalog, input: TripInput, mode: Mode | null) {
  const plan = planTrip(catalog, input);
  const res = priceTrip(catalog, input, plan);
  const m = effectiveMode(res, mode);
  return { total: m ? res.modes[m].total : 0, minutes: plan.totalMinutes };
}

/** where inserting `place` adds the fewest km (between pickup, stops and the way back) */
export function bestInsertion(catalog: Catalog, input: TripInput, place: Place): { index: number; detourKm: number } {
  const segIdx = indexSegments(catalog.segments);
  const pickup = placeById(catalog, input.pickupId);
  const stops = input.stops.map((s) => placeById(catalog, s.placeId));
  let best = { index: 0, detourKm: Number.POSITIVE_INFINITY };
  for (let k = 0; k <= stops.length; k++) {
    const prev = k === 0 ? pickup : stops[k - 1];
    const next = k < stops.length ? stops[k] : input.roundTrip ? pickup : null;
    const added =
      measureLeg(catalog, segIdx, prev, place).km +
      (next ? measureLeg(catalog, segIdx, place, next).km - measureLeg(catalog, segIdx, prev, next).km : 0);
    if (added < best.detourKm) best = { index: k, detourKm: Math.max(0, added) };
  }
  return best;
}

export interface AddSuggestion {
  place: Place;
  index: number;
  detourKm: number;
  addedMinutes: number;
  /** price change in the currently selected mode */
  delta: number;
  zone: ZoneId;
}

export function whatIfAdd(catalog: Catalog, input: TripInput, place: Place, mode: Mode | null): AddSuggestion {
  const base = totalFor(catalog, input, mode);
  const ins = bestInsertion(catalog, input, place);
  const stops: StopInput[] = [...input.stops];
  stops.splice(ins.index, 0, { placeId: place.id, dwell: place.default_dwell_min });
  const sim = totalFor(catalog, { ...input, stops }, mode);
  return {
    place,
    index: ins.index,
    detourKm: ins.detourKm,
    addedMinutes: sim.minutes - base.minutes,
    delta: sim.total - base.total,
    zone: zoneOf(catalog, place),
  };
}

/** price change if stop `index` is removed (negative = cheaper) */
export function whatIfRemove(catalog: Catalog, input: TripInput, index: number, mode: Mode | null): number {
  const base = totalFor(catalog, input, mode);
  const sim = totalFor(catalog, { ...input, stops: input.stops.filter((_, i) => i !== index) }, mode);
  return sim.total - base.total;
}

/**
 * Places near the route, closest detour first. Within `maxDetourKm` when any
 * qualify, otherwise the three closest so the list is never empty.
 */
export function suggestAlongRoute(
  catalog: Catalog,
  input: TripInput,
  mode: Mode | null,
  opts: { maxDetourKm?: number; limit?: number } = {},
): AddSuggestion[] {
  const maxDetour = opts.maxDetourKm ?? 30;
  const limit = opts.limit ?? 5;
  const taken = new Set([input.pickupId, ...input.stops.map((s) => s.placeId)]);
  const all = catalog.places
    .filter((p) => p.category !== 'pickup' && !taken.has(p.id))
    .map((p) => whatIfAdd(catalog, input, p, mode))
    .sort((a, b) => a.detourKm - b.detourKm);
  const near = all.filter((s) => s.detourKm <= maxDetour).slice(0, limit);
  return near.length ? near : all.slice(0, 3);
}
