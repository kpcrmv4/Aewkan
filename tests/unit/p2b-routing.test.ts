import { describe, expect, it, vi } from 'vitest';
import { indexSegments } from '@/lib/pricing';
import { normalizeProvider, parseGoogleResponse, parseOrsResponse, routeDistance, RoutingError } from '@/lib/routing';
import { bestSource, orderPair } from '@/features/admin-settings/segments';
import google from './p2b-google-routes.json';
import ors from './p2b-ors-directions.json';

describe('P2B-03-08 routing adapter parsing (recorded responses)', () => {
  it('ORS: metres/seconds -> km with one decimal and whole minutes', () => {
    expect(parseOrsResponse(ors)).toEqual({ km: 34.2, minutes: 45 });
  });
  it('Google Routes: distanceMeters + "2705s" duration', () => {
    expect(parseGoogleResponse(google)).toEqual({ km: 34.2, minutes: 45 });
  });
  it('very short hops never become 0 km / 0 minutes (database requires > 0)', () => {
    expect(parseOrsResponse({ routes: [{ summary: { distance: 12, duration: 4 } }] })).toEqual({ km: 0.1, minutes: 1 });
  });
  it('no route and malformed answers throw RoutingError', () => {
    expect(() => parseOrsResponse({ routes: [] })).toThrowError(RoutingError);
    expect(() => parseOrsResponse({ error: { code: 2010 } })).toThrowError(/no route/);
    expect(() => parseOrsResponse({ routes: [{ summary: { distance: 'x', duration: 1 } }] })).toThrowError(/summary/);
    expect(() => parseOrsResponse(null)).toThrowError(RoutingError);
    expect(() => parseGoogleResponse({})).toThrowError(/no route/);
    expect(() => parseGoogleResponse({ routes: [{ distanceMeters: 1000 }] })).toThrowError(/missing/);
    expect(() => parseGoogleResponse({ routes: [{ distanceMeters: 0, duration: '0s' }] })).toThrowError(RoutingError);
  });
});

describe('routeDistance provider selection', () => {
  const a = { lat: 18.7877, lng: 99.0003 };
  const b = { lat: 18.8048, lng: 98.9217 };

  it('ORS is the default and receives [lng, lat] pairs and the key', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(ors), { status: 200 }));
    const r = await routeDistance(a, b, { provider: normalizeProvider(undefined), apiKey: 'k-ors' }, fetchMock);
    expect(r).toEqual({ km: 34.2, minutes: 45 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('openrouteservice.org');
    expect((init.headers as Record<string, string>).Authorization).toBe('k-ors');
    expect(JSON.parse(init.body as string)).toEqual({ coordinates: [[99.0003, 18.7877], [98.9217, 18.8048]] });
  });

  it('Google sends the key and field mask', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(google), { status: 200 }));
    const r = await routeDistance(a, b, { provider: 'google', apiKey: 'k-g' }, fetchMock);
    expect(r.km).toBe(34.2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('routes.googleapis.com');
    const h = init.headers as Record<string, string>;
    expect(h['X-Goog-Api-Key']).toBe('k-g');
    expect(h['X-Goog-FieldMask']).toContain('routes.distanceMeters');
  });

  it('unknown provider names fall back to ORS', () => {
    expect(normalizeProvider('mapbox')).toBe('ors');
    expect(normalizeProvider('google')).toBe('google');
    expect(normalizeProvider(null)).toBe('ors');
  });

  it('maps http failures and timeouts to RoutingError codes', async () => {
    const status = (s: number) => routeDistance(a, b, { provider: 'ors', apiKey: 'k' }, vi.fn(async () => new Response('{}', { status: s })));
    await expect(status(401)).rejects.toMatchObject({ code: 'auth' });
    await expect(status(429)).rejects.toMatchObject({ code: 'rate_limited' });
    await expect(status(404)).rejects.toMatchObject({ code: 'no_route' });
    await expect(status(500)).rejects.toMatchObject({ code: 'upstream' });
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
    await expect(routeDistance(a, b, { provider: 'ors', apiKey: 'k' }, vi.fn(async () => Promise.reject(timeout)))).rejects.toMatchObject({ code: 'timeout' });
    await expect(routeDistance(a, b, { provider: 'ors', apiKey: '' })).rejects.toMatchObject({ code: 'auth' });
  });
});

describe('P2B-03-06 segment ordering and source priority (R-004)', () => {
  it('orderPair stores each pair once with place_a < place_b', () => {
    const x = '9b2f6a1c-0000-4000-8000-000000000001';
    const y = '1a2f6a1c-0000-4000-8000-000000000002';
    expect(orderPair(x, y)).toEqual([y, x]);
    expect(orderPair(y, x)).toEqual([y, x]);
    expect(orderPair(x.toUpperCase(), y)).toEqual([y, x]);
  });
  it('driven beats checkins beats routing; checkins need 3 samples', () => {
    expect(bestSource(['routing', 'driven', 'checkins'], { checkins: 5 })).toBe('driven');
    expect(bestSource(['routing', 'checkins'], { checkins: 5 })).toBe('checkins');
    expect(bestSource(['routing', 'checkins'], { checkins: 2 })).toBe('routing');
    expect(bestSource([])).toBeNull();
  });
  it('the pricing engine index agrees: a routing row never replaces a driven row', () => {
    const idx = indexSegments([
      { a: 'a', b: 'b', km: 150, min: 230, source: 'routing' },
      { a: 'a', b: 'b', km: 135, min: 200, source: 'driven' },
      { a: 'a', b: 'b', km: 140, min: 210, source: 'routing' },
    ]);
    expect(idx.get('a|b')).toMatchObject({ km: 135, source: 'driven' });
  });
});
