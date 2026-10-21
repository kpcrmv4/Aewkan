import { basePlace, indexSegments, measureLeg, placeById, zoneOf } from './geo';
import type { Catalog, Leg, Plan, TripInput, TripWarning, ZoneId } from './types';

/** 'HH:MM' → minutes after midnight */
export function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) throw new Error(`bad_time:${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** minutes after midnight (may exceed 1440) → 'HH:MM' on a 24 h clock */
export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Walk the trip: pickup → stops in order → (back to pickup when roundTrip).
 * Also works out what a one-way costs the company to reposition the car:
 * the car lives at the base, so whichever end of the trip is farther from it
 * pays the empty drive (a far pickup prices the same as a far drop-off).
 */
export function planTrip(catalog: Catalog, input: TripInput): Plan {
  const segIdx = indexSegments(catalog.segments);
  const pickup = placeById(catalog, input.pickupId);
  const base = basePlace(catalog);
  const start = toMinutes(input.time);

  let cur = pickup;
  let clock = start;
  let km = 0;
  let drive = 0;
  let dwell = 0;
  let maxZone: ZoneId = 1;
  // a pickup up a mountain road (e.g. Pai) is driven like a mountain stop
  let mountainStops = pickup.is_mountain && input.stops.length > 0 ? 1 : 0;
  const legs: Leg[] = [];

  for (const s of input.stops) {
    const to = placeById(catalog, s.placeId);
    const m = measureLeg(catalog, segIdx, cur, to);
    const zone = zoneOf(catalog, to);
    const arrive = clock + m.minutes;
    const depart = arrive + s.dwell;
    legs.push({ from: cur, to, km: m.km, minutes: m.minutes, measured: m.measured, source: m.source, zone, arrive, depart, dwell: s.dwell });
    km += m.km;
    drive += m.minutes;
    dwell += s.dwell;
    if (zone > maxZone) maxZone = zone;
    if (to.is_mountain) mountainStops += 1;
    clock = depart;
    cur = to;
  }

  let ret: Leg | null = null;
  if (input.roundTrip && input.stops.length > 0) {
    const m = measureLeg(catalog, segIdx, cur, pickup);
    const zone = zoneOf(catalog, cur);
    ret = { from: cur, to: pickup, km: m.km, minutes: m.minutes, measured: m.measured, source: m.source, zone, arrive: clock + m.minutes, depart: clock + m.minutes, dwell: 0 };
    km += m.km;
    drive += m.minutes;
    clock += m.minutes;
  }

  const last = input.stops.length ? placeById(catalog, input.stops[input.stops.length - 1].placeId) : pickup;
  const lastZone = zoneOf(catalog, last);
  const pickupZone = zoneOf(catalog, pickup);
  const farZone = (Math.max(lastZone, pickupZone) as ZoneId);

  let emptyReturnKm = 0;
  let emptyReturnMinutes = 0;
  if (input.stops.length > 0) {
    const fromEnd = measureLeg(catalog, segIdx, last, base);
    const fromStart = measureLeg(catalog, segIdx, pickup, base);
    const far = fromEnd.km >= fromStart.km ? fromEnd : fromStart;
    emptyReturnKm = far.km;
    if (!input.roundTrip) emptyReturnMinutes = far.minutes;
  }

  const total = clock - start;
  const nightFrom = toMinutes(catalog.rules.night.from);
  const nightTo = toMinutes(catalog.rules.night.to);
  return {
    legs,
    ret,
    km,
    driveMinutes: drive,
    dwellMinutes: dwell,
    totalMinutes: total,
    billMinutes: total + emptyReturnMinutes,
    start,
    end: clock,
    maxZone,
    farZone,
    mountainStops,
    emptyReturnKm,
    emptyReturnMinutes,
    night: input.stops.length > 0 && (start < nightTo || clock > nightFrom),
  };
}

export function tripWarnings(catalog: Catalog, input: TripInput, plan: Plan): TripWarning[] {
  const out: TripWarning[] = [];
  const v = catalog.rules.vehicles[input.vehicle];
  if (v && input.pax > v.seats) out.push({ kind: 'too_many_pax', pax: input.pax, seats: v.seats });
  const hours = plan.totalMinutes / 60;
  if (hours > catalog.rules.max_day_hours) out.push({ kind: 'over_day', hours, max: catalog.rules.max_day_hours });
  else if (hours > catalog.rules.tight_day_hours) out.push({ kind: 'tight_day', hours });
  return out;
}

/** smallest vehicle (by sort) that seats everyone, or null */
export function vehicleFor(catalog: Catalog, pax: number): string | null {
  const list = Object.entries(catalog.rules.vehicles).sort((a, b) => a[1].sort - b[1].sort);
  return list.find(([, v]) => v.seats >= pax)?.[0] ?? null;
}
