import { RoutingError, toRouteResult, type FetchLike, type LatLng, type RouteResult } from './types';

const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';

/** `routes[0].summary` of an ORS directions answer (distance in metres, duration in seconds) */
export function parseOrsResponse(json: unknown): RouteResult {
  const routes = (json as { routes?: Array<{ summary?: { distance?: unknown; duration?: unknown } }> } | null)?.routes;
  if (!Array.isArray(routes) || routes.length === 0) throw new RoutingError('no_route', 'ors: no route in the response');
  const s = routes[0]?.summary;
  if (typeof s?.distance !== 'number' || typeof s?.duration !== 'number') throw new RoutingError('bad_response', 'ors: summary is missing');
  return toRouteResult(s.distance, s.duration);
}

export function statusToError(provider: string, status: number): RoutingError {
  if (status === 401 || status === 403) return new RoutingError('auth', `${provider}: key refused (${status})`);
  if (status === 429) return new RoutingError('rate_limited', `${provider}: rate limited`);
  if (status === 404) return new RoutingError('no_route', `${provider}: no route (${status})`);
  return new RoutingError('upstream', `${provider}: http ${status}`);
}

export async function orsRoute(a: LatLng, b: LatLng, apiKey: string, fetchImpl: FetchLike = fetch): Promise<RouteResult> {
  const res = await fetchImpl(ORS_URL, {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ coordinates: [[a.lng, a.lat], [b.lng, b.lat]] }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    // ORS answers 404 with code 2010 when a point is too far from any road
    throw statusToError('ors', res.status);
  }
  return parseOrsResponse(await res.json().catch(() => null));
}
