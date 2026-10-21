import { describe, expect, it } from 'vitest';
import { buildPlaceLanding, landingPlaces, nearbyPlaces, parsePlacesParam } from '@/features/seo/place-data';
import { applyPrefill, initialState } from '@/features/trip-builder/state';
import { planTrip, priceTrip, straightKm, type TripInput } from '@/lib/pricing';
import { makeCatalog } from './fixtures/catalog';

const catalog = makeCatalog();

describe('SEO place landing data', () => {
  it('lands on every visitable place, never on pickup points or the base', () => {
    const slugs = landingPlaces(catalog).map((p) => p.slug);
    expect(slugs).not.toContain('tp');
    expect(slugs).not.toContain('airport');
    expect(slugs).toContain('nimman');
    expect(slugs).toContain('pai');
    expect(buildPlaceLanding(catalog, 'tp')).toBeNull();
    expect(buildPlaceLanding(catalog, 'nope')).toBeNull();
  });

  it('SEO-PLC-02 prices equal the engine for a round trip from the base', () => {
    const l = buildPlaceLanding(catalog, 'suthep')!;
    const input: TripInput = {
      pickupId: 'tp',
      stops: [{ placeId: 'suthep', dwell: 60 }],
      date: '2026-06-15',
      time: '08:00',
      pax: 2,
      vehicle: 'sedan',
      roundTrip: true,
      langDriver: false,
      festival: false,
    };
    const res = priceTrip(catalog, input, planTrip(catalog, input));
    for (const mode of ['hourly', 'daily', 'trip'] as const) {
      expect(l.rows.find((r) => r.mode === mode)?.total).toBe(res.modes[mode].total);
    }
    expect(l.rows.find((r) => r.best)?.mode).toBe(res.best);
    // a short trip is not far enough for the one-way price
    expect(l.rows.some((r) => r.mode === 'oneway')).toBe(false);
    expect(l.fromPrice).toBe(Math.min(...l.rows.map((r) => r.total)));
  });

  it('a far place adds a valid one-way price and uses a fallback stay when the default is 0', () => {
    const l = buildPlaceLanding(catalog, 'pai')!;
    expect(l.dwell).toBe(60);
    const oneWay = l.rows.find((r) => r.mode === 'oneway');
    expect(oneWay?.total).toBeGreaterThan(0);
    expect(l.rows.filter((r) => r.best)).toHaveLength(1);
  });

  it('SEO-PLC-05 nearby = 4 closest others by straight-line distance', () => {
    const suthep = catalog.places.find((p) => p.slug === 'suthep')!;
    const near = nearbyPlaces(catalog, suthep);
    expect(near).toHaveLength(4);
    expect(near.map((n) => n.place.slug)).not.toContain('suthep');
    const km = near.map((n) => n.km);
    expect(km).toEqual([...km].sort((a, b) => a - b));
    const farther = landingPlaces(catalog).filter((p) => p.slug !== 'suthep' && !near.some((n) => n.place.id === p.id));
    for (const p of farther) expect(straightKm(suthep, p)).toBeGreaterThanOrEqual(km[3]);
  });
});

describe('SEO-PRE-02 ?places= parser and prefill', () => {
  it('trims, lower-cases, de-duplicates and drops junk', () => {
    expect(parsePlacesParam(' Suthep, monjam ,suthep,<b>,,a/b')).toEqual(['suthep', 'monjam']);
    expect(parsePlacesParam(undefined)).toEqual([]);
    expect(parsePlacesParam(['a', 'b,c'])).toEqual(['a', 'b', 'c']);
  });

  it('SEO-PRE-01 preselects known places in order, ignores unknown and pickup, caps at 8', () => {
    const s0 = initialState(catalog, [], '2026-10-21');
    const s = applyPrefill(catalog, s0, ['monjam', 'ghost', 'tp', 'suthep', 'monjam']);
    expect(s.stops.map((x) => x.placeId)).toEqual(['monjam', 'suthep']);
    expect(s.stops[0].dwell).toBe(90);
    expect(applyPrefill(catalog, s0, ['ghost'])).toBe(s0);
    const many = applyPrefill(catalog, s0, ['suthep', 'monjam', 'maesa', 'bosang', 'mkp', 'chiangdao', 'pai', 'nimman', 'airport']);
    expect(many.stops.length).toBeLessThanOrEqual(8);
  });
});
