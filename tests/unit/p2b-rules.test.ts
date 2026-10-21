import { describe, expect, it } from 'vitest';
import { priceSample, sampleTrips } from '@/features/admin-settings/preview-model';
import { firstRulesIssue, RulesSchema } from '@/features/admin-settings/rules-schema';
import type { Place, Rules } from '@/lib/pricing';
import { makeCatalog, PLACES, RULES_V1 } from './fixtures/catalog';

const clone = (): Rules => structuredClone(RULES_V1);
const issue = (r: unknown) => {
  const p = RulesSchema.safeParse(r);
  return p.success ? null : firstRulesIssue(p.error);
};

describe('P2B-01-07 RulesSchema', () => {
  it('accepts the seeded v1 rule set', () => {
    expect(RulesSchema.safeParse(RULES_V1).success).toBe(true);
  });
  it('keeps unknown keys (an older editor must not drop a newer engine field)', () => {
    const r = { ...clone(), future_field: 7 };
    const p = RulesSchema.parse(r) as Record<string, unknown>;
    expect(p.future_field).toBe(7);
  });
  it('rejects bad money, percentages and missing parts', () => {
    const r1 = clone();
    r1.vehicles.sedan.hourly = 350.5;
    expect(issue(r1)).toMatch(/vehicles\.sedan\.hourly/);
    const r2 = clone();
    r2.deposit_pct = 500;
    expect(issue(r2)).toMatch(/deposit_pct/);
    const r3 = clone();
    r3.mountain_fee = -1;
    expect(issue(r3)).toMatch(/mountain_fee/);
    const { vehicles: _v, ...rest } = clone();
    void _v;
    expect(issue(rest)).toMatch(/vehicles/);
    expect(issue(null)).not.toBeNull();
    expect(issue({})).not.toBeNull();
  });
  it('zones: increasing radii, only the last open-ended', () => {
    const r1 = clone();
    r1.zones[1].max_km = 5;
    expect(issue(r1)).toMatch(/zones\.1\.max_km/);
    const r2 = clone();
    r2.zones[3].max_km = 100;
    expect(issue(r2)).toMatch(/zones\.3\.max_km/);
    const r3 = clone();
    r3.zones[0].max_km = null;
    expect(issue(r3)).toMatch(/zones\.0\.max_km/);
  });
  it('time, date, split key and day-hours consistency', () => {
    const r1 = clone();
    r1.night.from = '25:00';
    expect(issue(r1)).toMatch(/night/);
    const r2 = clone();
    r2.quote.from = '2027-02-01';
    r2.quote.to = '2027-01-01';
    expect(issue(r2)).toMatch(/quote/);
    const r3 = clone();
    r3.commission.splits['Bad Key'] = { name_th: 'x', name_en: 'x', driver_pct: 10 };
    expect(issue(r3)).toMatch(/commission/);
    const r4 = clone();
    r4.tight_day_hours = 15;
    expect(issue(r4)).toMatch(/tight_day_hours/);
    const r5 = clone();
    delete r5.speeds.mountain;
    expect(issue(r5)).toMatch(/speeds/);
  });
});

describe('P2B-01-10 sample trips', () => {
  const temple2: Place = { ...PLACES.find((p) => p.id === 'suthep')!, id: 'wat2', is_mountain: false };
  const cat = () => {
    const c = makeCatalog();
    return { ...c, places: [...c.places, temple2] };
  };

  it('builds trips from the places that exist and skips the ones it cannot', () => {
    expect(sampleTrips(cat()).map((t) => t.key)).toEqual(['temples', 'mountain', 'province']);
    const noTemples = makeCatalog();
    expect(sampleTrips(noTemples).map((t) => t.key)).toEqual(['mountain', 'province']);
    expect(sampleTrips({ ...noTemples, places: noTemples.places.filter((p) => p.id === 'tp') })).toEqual([]);
  });

  it('the same rules price the same: draft equals current', () => {
    const c = cat();
    for (const t of sampleTrips(c)) {
      const cur = priceSample(c, c.rules, t.input);
      expect(cur).not.toBeNull();
      expect(priceSample(c, structuredClone(c.rules), t.input)).toEqual(cur);
    }
  });

  it('raising the sedan hourly rate changes only trips that use the sedan', () => {
    const c = cat();
    const draft = clone();
    draft.vehicles.sedan.hourly += 100;
    draft.vehicles.sedan.daily += 500;
    const byKey = Object.fromEntries(sampleTrips(c).map((t) => [t.key, t]));
    const before = priceSample(c, c.rules, byKey.temples.input)!;
    const after = priceSample(c, draft, byKey.temples.input)!;
    expect(after.total).toBeGreaterThan(before.total);
    // the province trip uses the van
    expect(priceSample(c, draft, byKey.province.input)).toEqual(priceSample(c, c.rules, byKey.province.input));
  });

  it('a draft without the trip vehicle is reported as not priceable instead of throwing', () => {
    const c = cat();
    const draft = clone();
    delete draft.vehicles.sedan;
    const t = sampleTrips(c).find((x) => x.key === 'temples')!;
    expect(priceSample(c, draft, t.input)).toBeNull();
  });
});
