import { describe, expect, it } from 'vitest';
import { applyTemplate, initialState, moveStop, paxChange, toggleStop } from '@/features/trip-builder/state';
import { makeCatalog } from './fixtures/catalog';

const catalog = makeCatalog();
const s0 = initialState(catalog, [], '2026-10-21');

describe('P1 builder state', () => {
  it('starts three days out from the base with the smallest fitting vehicle', () => {
    expect(s0).toMatchObject({ date: '2026-10-24', pax: 2, vehicle: 'sedan', roundTrip: true, mode: null });
    expect(s0.pickupId).toBe(catalog.basePlaceId);
  });
  it('pax over the seats switches to the smallest vehicle that fits', () => {
    expect(paxChange(catalog, s0, 3).switchedTo).toBeNull();
    const out = paxChange(catalog, s0, 4);
    expect(out.switchedTo).toBe('suv');
    expect(out.state.vehicle).toBe('suv');
    expect(paxChange(catalog, s0, 7).switchedTo).toBe('van');
    expect(paxChange(catalog, s0, 12).switchedTo).toBeNull();
  });
  it('toggles and moves stops', () => {
    const a = toggleStop(toggleStop(s0, 'suthep', 60), 'monjam', 90);
    expect(a.stops.map((x) => x.placeId)).toEqual(['suthep', 'monjam']);
    expect(moveStop(a.stops, 0, 1).map((x) => x.placeId)).toEqual(['monjam', 'suthep']);
    expect(moveStop(a.stops, 0, -1)).toBe(a.stops);
    expect(toggleStop(a, 'suthep', 60).stops.map((x) => x.placeId)).toEqual(['monjam']);
  });
  it('a one-way template preselects the one-way card', () => {
    const tpl = { id: 't', name_th: '', name_en: '', sub_th: '', sub_en: '', stops: [{ place_id: 'pai', dwell: 0 }, { place_id: 'ghost', dwell: 5 }], round_trip: false, vehicle_key: 'van', date_hint: null };
    const s = applyTemplate(catalog, s0, tpl);
    expect(s).toMatchObject({ roundTrip: false, vehicle: 'van', mode: 'oneway' });
    expect(s.stops).toEqual([{ placeId: 'pai', dwell: 0 }]);
  });
});
