import type { Catalog, Place, Rules } from '@/lib/pricing';

/** rule set v1 exactly as seeded in supabase/migrations/20261021090400_config_seed.sql */
export const RULES_V1: Rules = {
  zones: [
    { id: 1, name_th: 'ในเมือง', name_en: 'In town', max_km: 10, surcharge: 0 },
    { id: 2, name_th: 'รอบเมือง', name_en: 'Around town', max_km: 25, surcharge: 200 },
    { id: 3, name_th: 'ดอยและอำเภอไกล', name_en: 'Mountains & far districts', max_km: 60, surcharge: 500 },
    { id: 4, name_th: 'ต่างจังหวัด', name_en: 'Other provinces', max_km: null, surcharge: 900 },
  ],
  vehicles: {
    sedan: { name_th: 'รถเก๋ง', name_en: 'Sedan', seats: 3, hourly: 350, daily: 2800, per_km: 12, sort: 1 },
    suv: { name_th: 'SUV', name_en: 'SUV', seats: 5, hourly: 450, daily: 3400, per_km: 14, sort: 2 },
    van: { name_th: 'รถตู้ VIP', name_en: 'VIP van', seats: 9, hourly: 500, daily: 3800, per_km: 16, sort: 3 },
  },
  min_hours: 4,
  daily_inc_hours: 10,
  daily_inc_km: 150,
  ot_per_hour: 300,
  extra_km_rate: 10,
  max_day_hours: 14,
  tight_day_hours: 12,
  trip_pct: 15,
  mountain_fee: 300,
  night_pct: 15,
  season_pct: 10,
  lang_driver_fee: 200,
  deposit_pct: 30,
  deposit_round: 100,
  deposit_min: 100,
  empty_return_pct: 40,
  stop_fee: 150,
  road_factor: 1.3,
  speeds: { '1': 25, '2': 45, '3': 40, '4': 60, mountain: 35 },
  night: { from: '22:00', to: '06:00' },
  quote: {
    enabled: true,
    use_range: true,
    from: '2026-12-25',
    to: '2027-01-05',
    hours: 2,
    pct: 20,
    reason_th: 'ช่วงปีใหม่ รถและคนขับมีจำกัด',
    reason_en: 'New Year period, cars and drivers are limited',
  },
  return_offer: { enabled: true, pct: 10, default_days: 2, valid_days: 7, send_when: 'drop' },
  commission: {
    assumed_spend: 800,
    splits: {
      driver: { name_th: 'คนขับ 100%', name_en: 'Driver 100%', driver_pct: 100 },
      half: { name_th: 'แบ่งคนละครึ่ง', name_en: 'Split 50/50', driver_pct: 50 },
      company: { name_th: 'เข้าบริษัททั้งหมด', name_en: 'Company 100%', driver_pct: 0 },
    },
    policy_th: 'นโยบายทดสอบ',
  },
};

const P = (slug: string, lat: number, lng: number, category: string, extra: Partial<Place> = {}): Place => ({
  id: slug,
  slug,
  name_th: slug,
  name_en: slug,
  lat,
  lng,
  category,
  is_pickup: category === 'pickup',
  is_mountain: false,
  default_dwell_min: 60,
  ...extra,
});

export const PLACES: Place[] = [
  P('tp', 18.7877, 99.0003, 'pickup', { default_dwell_min: 0 }),
  P('airport', 18.7668, 98.9627, 'pickup', { default_dwell_min: 0 }),
  P('nimman', 18.8, 98.968, 'city', { is_pickup: true }),
  P('suthep', 18.8048, 98.9217, 'temple', { is_mountain: true }),
  P('monjam', 18.9387, 98.8283, 'nature', { is_mountain: true, default_dwell_min: 90 }),
  P('maesa', 18.9067, 98.8993, 'nature'),
  P('bosang', 18.7613, 99.0917, 'craft', { default_dwell_min: 45 }),
  P('mkp', 18.8653, 99.3503, 'nature', { is_mountain: true, default_dwell_min: 120 }),
  P('chiangdao', 19.395, 98.928, 'nature'),
  P('pai', 19.359, 98.44, 'province', { is_mountain: true, is_pickup: true, default_dwell_min: 0 }),
];

/** a fixed subset of the seeded measured segments */
export const SEGMENTS = [
  { a: 'suthep', b: 'tp', km: 16, min: 40, source: 'driven' as const },
  { a: 'monjam', b: 'suthep', km: 34, min: 65, source: 'driven' as const },
  { a: 'maesa', b: 'monjam', km: 14, min: 25, source: 'driven' as const },
  { a: 'maesa', b: 'tp', km: 24, min: 45, source: 'checkins' as const },
  { a: 'pai', b: 'tp', km: 135, min: 200, source: 'driven' as const },
  { a: 'pai', b: 'tp', km: 150, min: 230, source: 'routing' as const },
];

export function makeCatalog(overrides: Partial<Rules> = {}): Catalog {
  return {
    rules: { ...RULES_V1, ...overrides },
    ruleVersion: 1,
    places: PLACES,
    segments: SEGMENTS,
    basePlaceId: 'tp',
  };
}
