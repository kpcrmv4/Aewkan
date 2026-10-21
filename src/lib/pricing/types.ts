/**
 * Pricing engine types. Everything here is pure data: the engine never reads
 * the database, the clock or the DOM, so the same code prices a trip in the
 * browser (instant feedback) and on the server (the number that is stored).
 * Money is whole baht (integers) everywhere.
 */

export type ZoneId = 1 | 2 | 3 | 4;

export interface Zone {
  id: ZoneId;
  name_th: string;
  name_en: string;
  /** straight-line km from the company base; null = everything beyond */
  max_km: number | null;
  surcharge: number;
}

export interface VehicleRule {
  name_th: string;
  name_en: string;
  seats: number;
  hourly: number;
  daily: number;
  per_km: number;
  sort: number;
}

export interface CommissionSplit {
  name_th: string;
  name_en: string;
  driver_pct: number;
}

export interface Rules {
  zones: Zone[];
  vehicles: Record<string, VehicleRule>;
  min_hours: number;
  daily_inc_hours: number;
  daily_inc_km: number;
  ot_per_hour: number;
  extra_km_rate: number;
  max_day_hours: number;
  tight_day_hours: number;
  trip_pct: number;
  mountain_fee: number;
  night_pct: number;
  season_pct: number;
  lang_driver_fee: number;
  deposit_pct: number;
  deposit_round: number;
  deposit_min: number;
  empty_return_pct: number;
  stop_fee: number;
  road_factor: number;
  /** km/h by zone id ("1".."4") plus "mountain" */
  speeds: Record<string, number>;
  night: { from: string; to: string };
  quote: {
    enabled: boolean;
    use_range: boolean;
    from: string;
    to: string;
    hours: number;
    pct: number;
    reason_th: string;
    reason_en: string;
  };
  return_offer: {
    enabled: boolean;
    pct: number;
    default_days: number;
    valid_days: number;
    send_when: 'drop' | 'morning';
  };
  commission: {
    assumed_spend: number;
    splits: Record<string, CommissionSplit>;
    policy_th: string;
  };
}

export interface Place {
  id: string;
  slug: string;
  name_th: string;
  name_en: string;
  lat: number;
  lng: number;
  category: string;
  is_pickup: boolean;
  is_mountain: boolean;
  default_dwell_min: number;
  label_pos?: string;
}

export type SegmentSource = 'driven' | 'checkins' | 'routing';

export interface Segment {
  a: string;
  b: string;
  km: number;
  min: number;
  source: SegmentSource;
}

export interface Catalog {
  rules: Rules;
  ruleVersion: number;
  places: Place[];
  segments: Segment[];
  basePlaceId: string;
}

export interface StopInput {
  placeId: string;
  dwell: number;
}

export interface TripInput {
  pickupId: string;
  stops: StopInput[];
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'HH:MM' */
  time: string;
  pax: number;
  vehicle: string;
  roundTrip: boolean;
  langDriver: boolean;
  festival: boolean;
}

export type Mode = 'hourly' | 'daily' | 'trip' | 'oneway';
export const MODES: readonly Mode[] = ['hourly', 'daily', 'trip', 'oneway'] as const;

export interface Leg {
  from: Place;
  to: Place;
  km: number;
  minutes: number;
  measured: boolean;
  source: SegmentSource | 'estimate';
  zone: ZoneId;
  /** minutes after midnight of the travel date */
  arrive: number;
  depart: number;
  dwell: number;
}

export interface Plan {
  legs: Leg[];
  /** leg back to the pickup when roundTrip */
  ret: Leg | null;
  km: number;
  driveMinutes: number;
  dwellMinutes: number;
  /** pickup → back at pickup (or last stop) */
  totalMinutes: number;
  /** what hourly/daily/trip bill: total + the driver's drive home on a one-way */
  billMinutes: number;
  start: number;
  end: number;
  maxZone: ZoneId;
  /** farthest zone of either end of a one-way */
  farZone: ZoneId;
  mountainStops: number;
  emptyReturnKm: number;
  emptyReturnMinutes: number;
  night: boolean;
}

/** one line of the price breakdown; `key` is a copy key, `vars` fill it */
export interface PriceLine {
  key: string;
  vars: Record<string, string | number>;
  amount: number;
}

export type NotOkReason = 'needs_one_way' | 'needs_far_zone' | 'no_stops';

export interface ModePrice {
  mode: Mode;
  ok: boolean;
  reason: NotOkReason | null;
  lines: PriceLine[];
  total: number;
  /** for hourly: billed hours · daily/trip: days */
  units: number;
}

export interface PriceResult {
  modes: Record<Mode, ModePrice>;
  best: Mode | null;
}

export type TripWarning =
  | { kind: 'over_day'; hours: number; max: number }
  | { kind: 'tight_day'; hours: number }
  | { kind: 'too_many_pax'; pax: number; seats: number };
