import { googleRoute } from './google';
import { orsRoute } from './ors';
import { ROUTING_PROVIDERS, RoutingError, type FetchLike, type LatLng, type RouteResult, type RoutingConfig, type RoutingProviderKey } from './types';

export * from './types';
export { parseOrsResponse } from './ors';
export { parseGoogleResponse } from './google';

/** unknown or missing provider names fall back to OpenRouteService (R-003) */
export function normalizeProvider(raw: unknown): RoutingProviderKey {
  return (ROUTING_PROVIDERS as readonly unknown[]).includes(raw) ? (raw as RoutingProviderKey) : 'ors';
}

/** road distance and drive time between two points with the configured provider */
export async function routeDistance(a: LatLng, b: LatLng, cfg: RoutingConfig, fetchImpl?: FetchLike): Promise<RouteResult> {
  if (!cfg.apiKey) throw new RoutingError('auth', 'routing: no api key');
  try {
    return cfg.provider === 'google' ? await googleRoute(a, b, cfg.apiKey, fetchImpl) : await orsRoute(a, b, cfg.apiKey, fetchImpl);
  } catch (e) {
    if (e instanceof RoutingError) throw e;
    const name = (e as { name?: string } | null)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') throw new RoutingError('timeout', 'routing: provider timed out');
    throw new RoutingError('upstream', 'routing: provider unreachable');
  }
}
