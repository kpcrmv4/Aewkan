import type { Catalog, Place, Segment, SegmentSource, ZoneId } from './types';

const EARTH_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** great-circle distance in km */
export function straightKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(x));
}

export function placeById(catalog: Catalog, id: string): Place {
  const p = catalog.places.find((x) => x.id === id);
  if (!p) throw new Error(`unknown_place:${id}`);
  return p;
}

export function basePlace(catalog: Catalog): Place {
  return placeById(catalog, catalog.basePlaceId);
}

/** zone by straight-line distance from the company base */
export function zoneOf(catalog: Catalog, p: Place): ZoneId {
  const d = straightKm(basePlace(catalog), p);
  const zones = [...catalog.rules.zones].sort((x, y) => x.id - y.id);
  for (const z of zones) {
    if (z.max_km !== null && d <= z.max_km) return z.id;
  }
  return zones[zones.length - 1]?.id ?? 4;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const PRIORITY: Record<SegmentSource, number> = { driven: 1, checkins: 2, routing: 3 };

/** best known segment per unordered pair (driven > checkins > routing) */
export function indexSegments(segments: Segment[]): Map<string, Segment> {
  const idx = new Map<string, Segment>();
  for (const s of segments) {
    const k = pairKey(s.a, s.b);
    const cur = idx.get(k);
    if (!cur || PRIORITY[s.source] < PRIORITY[cur.source]) idx.set(k, s);
  }
  return idx;
}

export interface LegMeasure {
  km: number;
  minutes: number;
  measured: boolean;
  source: SegmentSource | 'estimate';
}

/**
 * Distance and time between two places. A known segment wins (R-004);
 * otherwise straight line × road factor at the zone's average speed
 * (mountain speed when the destination is on a mountain road).
 */
export function measureLeg(
  catalog: Catalog,
  segIdx: Map<string, Segment>,
  from: Place,
  to: Place,
): LegMeasure {
  if (from.id === to.id) return { km: 0, minutes: 0, measured: true, source: 'driven' };
  const seg = segIdx.get(pairKey(from.id, to.id));
  if (seg) return { km: Number(seg.km), minutes: Number(seg.min), measured: true, source: seg.source };
  const km = straightKm(from, to) * catalog.rules.road_factor;
  const zone = zoneOf(catalog, to);
  const speed = to.is_mountain ? catalog.rules.speeds.mountain : catalog.rules.speeds[String(zone)];
  const kmh = speed && speed > 0 ? speed : 40;
  return { km, minutes: (km / kmh) * 60, measured: false, source: 'estimate' };
}
