import type { Catalog, Place, Rules, Segment, SegmentSource } from './types';

/** shape returned by the `get_public_catalog()` RPC */
export interface PublicCatalogJson {
  places: Array<Place>;
  rules: { version: number; rules: Rules } | null;
  templates: Array<{
    id: string;
    name_th: string;
    name_en: string;
    sub_th: string;
    sub_en: string;
    stops: Array<{ place_id: string; dwell: number }>;
    round_trip: boolean;
    vehicle_key: string;
    date_hint: string | null;
  }>;
  segments: Array<{ a: string; b: string; km: number | string; min: number; source: SegmentSource }>;
  base_place_id: string | null;
}

export type TripTemplate = PublicCatalogJson['templates'][number];

/** turn the RPC payload into the engine's Catalog; throws on a missing rule set */
export function catalogFromJson(json: PublicCatalogJson): Catalog {
  if (!json.rules) throw new Error('no_current_rule_set');
  const places = json.places;
  const basePlaceId = json.base_place_id ?? places.find((p) => p.is_pickup)?.id;
  if (!basePlaceId) throw new Error('no_base_place');
  const segments: Segment[] = json.segments.map((s) => ({ a: s.a, b: s.b, km: Number(s.km), min: Number(s.min), source: s.source }));
  return { rules: json.rules.rules, ruleVersion: json.rules.version, places, segments, basePlaceId };
}
