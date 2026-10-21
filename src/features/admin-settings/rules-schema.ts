import { z } from 'zod';

/**
 * The shape the pricing engine reads (src/lib/pricing/types.ts Rules), strict
 * enough that a published rule set cannot make priceTrip throw or print NaN.
 * Money is whole baht; unknown extra keys survive (passthrough) so a newer
 * engine field is not lost by an older editor.
 */
const money = (max = 1_000_000) => z.number().int().min(0).max(max);
const pct = z.number().min(0).max(100);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'เวลา HH:MM');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ YYYY-MM-DD');
const name = z.string().trim().min(1).max(120);

const Zone = z
  .object({
    id: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    name_th: name,
    name_en: name,
    max_km: z.number().positive().max(2000).nullable(),
    surcharge: money(100_000),
  })
  .passthrough();

const Vehicle = z
  .object({
    name_th: name,
    name_en: name,
    seats: z.number().int().min(1).max(60),
    hourly: money(100_000),
    daily: money(1_000_000),
    per_km: money(10_000),
    sort: z.number().int().min(0).max(100),
  })
  .passthrough();

const Split = z.object({ name_th: name, name_en: name, driver_pct: pct }).passthrough();

export const SPLIT_KEY = /^[a-z_]{2,30}$/;

export const RulesSchema = z
  .object({
    zones: z.array(Zone).length(4),
    vehicles: z
      .record(z.string().regex(/^[a-z][a-z0-9_]{1,19}$/), Vehicle)
      .refine((v) => Object.keys(v).length >= 1, 'ต้องมีประเภทรถอย่างน้อย 1 แบบ'),
    min_hours: z.number().int().min(1).max(24),
    daily_inc_hours: z.number().int().min(1).max(24),
    daily_inc_km: z.number().int().min(0).max(2000),
    ot_per_hour: money(100_000),
    extra_km_rate: money(10_000),
    max_day_hours: z.number().int().min(1).max(24),
    tight_day_hours: z.number().int().min(1).max(24),
    trip_pct: pct,
    mountain_fee: money(100_000),
    night_pct: pct,
    season_pct: pct,
    lang_driver_fee: money(100_000),
    deposit_pct: pct,
    deposit_round: z.number().int().min(1).max(10_000),
    deposit_min: money(100_000),
    empty_return_pct: pct,
    stop_fee: money(100_000),
    road_factor: z.number().min(1).max(3),
    speeds: z.record(z.string(), z.number().positive().max(200)),
    night: z.object({ from: hhmm, to: hhmm }),
    quote: z
      .object({
        enabled: z.boolean(),
        use_range: z.boolean(),
        from: isoDate,
        to: isoDate,
        hours: z.number().int().min(1).max(72),
        pct: z.number().min(0).max(200),
        reason_th: z.string().trim().max(200),
        reason_en: z.string().trim().max(200),
      })
      .passthrough(),
    return_offer: z
      .object({
        enabled: z.boolean(),
        pct,
        default_days: z.number().int().min(0).max(30),
        valid_days: z.number().int().min(1).max(60),
        send_when: z.enum(['drop', 'morning']),
      })
      .passthrough(),
    commission: z
      .object({
        assumed_spend: money(100_000),
        splits: z.record(z.string().regex(SPLIT_KEY), Split).refine((s) => Object.keys(s).length >= 1, 'ต้องมีการแบ่งอย่างน้อย 1 แบบ'),
        policy_th: z.string().trim().max(1500),
      })
      .passthrough(),
  })
  .passthrough()
  .superRefine((r, ctx) => {
    // zones: ids 1..4 once each, radii strictly increasing, only the last open-ended
    const ids = r.zones.map((z) => z.id);
    if (new Set(ids).size !== 4) ctx.addIssue({ code: 'custom', path: ['zones'], message: 'โซนต้องเป็น 1-4 ไม่ซ้ำ' });
    const sorted = [...r.zones].sort((a, b) => a.id - b.id);
    sorted.forEach((z, i) => {
      if (i < 3 && z.max_km === null) ctx.addIssue({ code: 'custom', path: ['zones', i, 'max_km'], message: 'มีเฉพาะโซนสุดท้ายที่ไม่จำกัดรัศมี' });
      if (i === 3 && z.max_km !== null) ctx.addIssue({ code: 'custom', path: ['zones', i, 'max_km'], message: 'โซนสุดท้ายต้องไม่จำกัดรัศมี' });
      const prev = sorted[i - 1];
      if (i > 0 && z.max_km !== null && prev?.max_km != null && z.max_km <= prev.max_km) {
        ctx.addIssue({ code: 'custom', path: ['zones', i, 'max_km'], message: 'รัศมีโซนต้องเพิ่มขึ้นตามลำดับ' });
      }
    });
    if (r.tight_day_hours > r.max_day_hours) ctx.addIssue({ code: 'custom', path: ['tight_day_hours'], message: 'ชั่วโมงเริ่มเตือนต้องไม่เกินชั่วโมงสูงสุดต่อวัน' });
    for (const k of ['1', '2', '3', '4', 'mountain']) {
      if (!(r.speeds[k] > 0)) ctx.addIssue({ code: 'custom', path: ['speeds', k], message: 'ต้องมีความเร็วเฉลี่ยของโซนและทางภูเขา' });
    }
    if (r.quote.from > r.quote.to) ctx.addIssue({ code: 'custom', path: ['quote', 'from'], message: 'วันเริ่มช่วงเสนอราคาต้องไม่หลังวันสิ้นสุด' });
  });

export type RulesInput = z.infer<typeof RulesSchema>;

/** first problem as "path: message" for the toast / 422 body */
export function firstRulesIssue(err: z.ZodError): string {
  const i = err.issues[0];
  return i ? `${i.path.join('.') || 'rules'}: ${i.message}` : 'rules: ไม่ถูกต้อง';
}
