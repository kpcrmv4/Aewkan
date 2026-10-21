/**
 * Coordinates from what staff paste: "18.80, 98.92", a Google Maps / OSM link.
 * Pure — the one thing that needs the network (short links) is in resolve-link.ts.
 * Bounds match places.lat/lng checks (UpsertPlaceRequest).
 */

export interface Coords {
  lat: number;
  lng: number;
}

export const LAT_RANGE = [5, 21] as const;
export const LNG_RANGE = [97, 106] as const;

const inLat = (n: number) => n >= LAT_RANGE[0] && n <= LAT_RANGE[1];
const inLng = (n: number) => n >= LNG_RANGE[0] && n <= LNG_RANGE[1];

/** true when the point is inside the area places accepts (Thailand and a margin) */
export const inServiceArea = (c: Coords) => inLat(c.lat) && inLng(c.lng);

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** accept (lat, lng) or the swapped (lng, lat) people often copy; null when neither fits */
export function fitPair(a: number, b: number): Coords | null {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (inLat(a) && inLng(b)) return { lat: round6(a), lng: round6(b) };
  if (inLat(b) && inLng(a)) return { lat: round6(b), lng: round6(a) };
  return null;
}

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';
const PAIR = new RegExp(`^\\s*${NUM}\\s*[,\\s]\\s*${NUM}\\s*$`);

/** "18.80, 98.92" · "18.80 98.92" · "18.80,98.92" (also the swapped order) */
export function parseTypedCoords(text: string): Coords | null {
  const m = PAIR.exec(text.replace(/[°]/g, ''));
  return m ? fitPair(Number(m[1]), Number(m[2])) : null;
}

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * Coordinates inside a map URL. Order matters: Google's `!3d..!4d..` is the pin
 * itself, `@..` is only where the viewport is centred, so the pin wins.
 */
export function parseCoordsFromUrl(raw: string): Coords | null {
  const text = safeDecode(raw.trim());
  let url: URL | null = null;
  try {
    url = new URL(text);
  } catch {
    url = null;
  }

  // Google data blob: !3d<lat>!4d<lng>
  const d = new RegExp(`!3d${NUM}!4d${NUM}`).exec(text);
  if (d) {
    const c = fitPair(Number(d[1]), Number(d[2]));
    if (c) return c;
  }

  // query parameters: q, ll, query, destination, daddr (values like "18.8,98.9")
  if (url) {
    for (const key of ['q', 'query', 'll', 'destination', 'daddr', 'center']) {
      const v = url.searchParams.get(key);
      const c = v ? parseTypedCoords(v) : null;
      if (c) return c;
    }
    // OSM marker: ?mlat=..&mlon=..
    const mlat = url.searchParams.get('mlat');
    const mlon = url.searchParams.get('mlon');
    if (mlat && mlon) {
      const c = fitPair(Number(mlat), Number(mlon));
      if (c) return c;
    }
  }

  // Google viewport: /@18.79,98.98,17z
  const at = new RegExp(`@${NUM},${NUM}`).exec(text);
  if (at) {
    const c = fitPair(Number(at[1]), Number(at[2]));
    if (c) return c;
  }

  // Google path form: /maps/search/18.79,98.98 · /maps/place/18.79,98.98
  const path = new RegExp(`/(?:search|place|dir)/${NUM},\\+?${NUM}(?:[/?]|$)`).exec(text);
  if (path) {
    const c = fitPair(Number(path[1]), Number(path[2]));
    if (c) return c;
  }

  // OSM hash: #map=15/18.79/98.98
  const hash = new RegExp(`#map=\\d{1,2}/${NUM}/${NUM}`).exec(text);
  if (hash) {
    const c = fitPair(Number(hash[1]), Number(hash[2]));
    if (c) return c;
  }
  return null;
}

/** hosts whose links we read or follow; nothing else is ever fetched */
const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl']);
const MAP_HOST = /^(?:www\.|maps\.)?google\.(?:com|co\.th)$|^(?:www\.)?openstreetmap\.org$|^osm\.org$|^(?:www\.)?osm\.org$/;

export const isShortLinkHost = (host: string) => SHORT_HOSTS.has(host.toLowerCase());
export const isAllowedMapHost = (host: string) => {
  const h = host.toLowerCase();
  return SHORT_HOSTS.has(h) || MAP_HOST.test(h);
};

export type PasteKind = 'coords' | 'link' | 'short_link' | 'unknown';

export interface PasteResult {
  kind: PasteKind;
  coords: Coords | null;
}

/**
 * What did staff paste? Typed coordinates and full links resolve right away;
 * short links need the server (`/api/admin/places/resolve`).
 */
export function classifyPaste(input: string): PasteResult {
  const text = input.trim();
  if (!text) return { kind: 'unknown', coords: null };
  const typed = parseTypedCoords(text);
  if (typed) return { kind: 'coords', coords: typed };
  const link = firstUrl(text);
  if (link) {
    try {
      const host = new URL(link).hostname;
      const coords = parseCoordsFromUrl(link);
      if (coords) return { kind: 'link', coords };
      if (isShortLinkHost(host)) return { kind: 'short_link', coords: null };
    } catch {
      /* fall through */
    }
  }
  return { kind: 'unknown', coords: null };
}

/** first http(s) URL inside pasted text (share sheets add a title before the link) */
export const firstUrl = (input: string): string | null => /https?:\/\/[^\s]+/i.exec(input)?.[0] ?? null;

/** slug for a new place: ascii words of the English name + a short random tail */
export function makeSlug(nameEn: string, rand: () => string = () => Math.random().toString(36).slice(2, 6)): string {
  const words = nameEn
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36)
    .replace(/-+$/g, '');
  const base = words.length >= 2 ? words : 'place';
  return `${base}-${rand()}`.slice(0, 48);
}
