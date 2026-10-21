import { statusToError } from './ors';
import { RoutingError, toRouteResult, type FetchLike, type LatLng, type RouteResult } from './types';

const GOOGLE_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/** `routes[0]` of a Routes API answer: distanceMeters (int) and duration ("1234s") */
export function parseGoogleResponse(json: unknown): RouteResult {
  const routes = (json as { routes?: Array<{ distanceMeters?: unknown; duration?: unknown }> } | null)?.routes;
  // Google answers `{}` (no `routes`) when there is no drivable route
  if (!Array.isArray(routes) || routes.length === 0) throw new RoutingError('no_route', 'google: no route in the response');
  const r = routes[0];
  const seconds = typeof r?.duration === 'string' ? Number.parseFloat(r.duration.replace(/s$/, '')) : Number.NaN;
  if (typeof r?.distanceMeters !== 'number' || !Number.isFinite(seconds)) throw new RoutingError('bad_response', 'google: distance or duration is missing');
  return toRouteResult(r.distanceMeters, seconds);
}

export async function googleRoute(a: LatLng, b: LatLng, apiKey: string, fetchImpl: FetchLike = fetch): Promise<RouteResult> {
  const point = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const res = await fetchImpl(GOOGLE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
    },
    body: JSON.stringify({ origin: point(a), destination: point(b), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw statusToError('google', res.status);
  return parseGoogleResponse(await res.json().catch(() => null));
}
