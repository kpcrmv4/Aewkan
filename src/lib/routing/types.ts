/**
 * Road distance adapter (R-003). Providers answer the same question — how far
 * and how long by car between two points — so the rest of the app only ever
 * sees `RouteResult`. Parsing is pure and tested against recorded responses.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteResult {
  /** one decimal, matches segments.km numeric(6,1) */
  km: number;
  /** whole minutes, at least 1 */
  minutes: number;
}

export type RoutingProviderKey = 'ors' | 'google';

export const ROUTING_PROVIDERS: readonly RoutingProviderKey[] = ['ors', 'google'] as const;

export interface RoutingConfig {
  provider: RoutingProviderKey;
  apiKey: string;
}

export type RoutingErrorCode = 'auth' | 'rate_limited' | 'no_route' | 'bad_response' | 'upstream' | 'timeout';

export class RoutingError extends Error {
  readonly isRoutingError = true;
  constructor(
    readonly code: RoutingErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const isRoutingError = (e: unknown): e is RoutingError => typeof e === 'object' && e !== null && (e as RoutingError).isRoutingError === true;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** metres + seconds → the units segments uses */
export function toRouteResult(meters: number, seconds: number): RouteResult {
  if (!Number.isFinite(meters) || !Number.isFinite(seconds) || meters <= 0 || seconds <= 0) {
    throw new RoutingError('bad_response', 'routing: distance or duration is not a positive number');
  }
  // segments.km is numeric(6,1) with km > 0
  const km = Math.max(0.1, Math.round(meters / 100) / 10);
  return { km, minutes: Math.max(1, Math.round(seconds / 60)) };
}
