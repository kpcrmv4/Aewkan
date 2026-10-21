import { addDays, vehicleFor, type Catalog, type Mode, type StopInput, type TripInput, type TripTemplate } from '@/lib/pricing';

export interface BuilderState {
  pickupId: string;
  stops: StopInput[];
  date: string;
  time: string;
  pax: number;
  vehicle: string;
  roundTrip: boolean;
  langDriver: boolean;
  festival: boolean;
  /** the card the customer picked; null = cheapest valid */
  mode: Mode | null;
  cat: string;
}

export const toInput = (s: BuilderState): TripInput => ({
  pickupId: s.pickupId,
  stops: s.stops,
  date: s.date,
  time: s.time,
  pax: s.pax,
  vehicle: s.vehicle,
  roundTrip: s.roundTrip,
  langDriver: s.langDriver,
  festival: s.festival,
});

export function pickupPlaces(catalog: Catalog) {
  return catalog.places.filter((p) => p.is_pickup);
}

/** first screen: the first suggested trip (if any) three days from today, from the base */
export function initialState(catalog: Catalog, templates: TripTemplate[], today: string): BuilderState {
  const pickups = pickupPlaces(catalog);
  const pickupId = pickups.find((p) => p.id === catalog.basePlaceId)?.id ?? pickups[0]?.id ?? catalog.basePlaceId;
  const vehicles = Object.keys(catalog.rules.vehicles);
  const base: BuilderState = {
    pickupId,
    stops: [],
    date: addDays(today, 3),
    time: '08:00',
    pax: 2,
    vehicle: vehicleFor(catalog, 2) ?? vehicles[0],
    roundTrip: true,
    langDriver: false,
    festival: false,
    mode: null,
    cat: 'all',
  };
  const tpl = templates[0];
  return tpl ? applyTemplate(catalog, base, tpl) : base;
}

export function applyTemplate(catalog: Catalog, s: BuilderState, tpl: TripTemplate): BuilderState {
  const known = new Set(catalog.places.map((p) => p.id));
  const vehicle = catalog.rules.vehicles[tpl.vehicle_key] ? tpl.vehicle_key : s.vehicle;
  const seats = catalog.rules.vehicles[vehicle]?.seats ?? s.pax;
  return {
    ...s,
    stops: tpl.stops.filter((x) => known.has(x.place_id)).map((x) => ({ placeId: x.place_id, dwell: x.dwell })),
    roundTrip: tpl.round_trip,
    vehicle,
    pax: Math.min(s.pax, seats),
    mode: tpl.round_trip ? null : 'oneway',
  };
}

export function toggleStop(s: BuilderState, placeId: string, dwell: number): BuilderState {
  const i = s.stops.findIndex((x) => x.placeId === placeId);
  const stops = i >= 0 ? s.stops.filter((_, k) => k !== i) : [...s.stops, { placeId, dwell }];
  return { ...s, stops };
}

export function moveStop(stops: StopInput[], i: number, d: -1 | 1): StopInput[] {
  const j = i + d;
  if (j < 0 || j >= stops.length) return stops;
  const out = [...stops];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** more people than the vehicle seats → the smallest vehicle that fits (null = none does) */
export function paxChange(catalog: Catalog, s: BuilderState, pax: number): { state: BuilderState; switchedTo: string | null } {
  const seats = catalog.rules.vehicles[s.vehicle]?.seats ?? 0;
  if (pax <= seats) return { state: { ...s, pax }, switchedTo: null };
  const v = vehicleFor(catalog, pax);
  if (!v) return { state: { ...s, pax }, switchedTo: null };
  return { state: { ...s, pax, vehicle: v }, switchedTo: v };
}

export function maxSeats(catalog: Catalog): number {
  return Math.min(15, Math.max(1, ...Object.values(catalog.rules.vehicles).map((v) => v.seats)));
}
