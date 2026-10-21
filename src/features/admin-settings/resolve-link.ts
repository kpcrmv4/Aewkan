import { firstUrl, isAllowedMapHost, isShortLinkHost, parseCoordsFromUrl, type Coords } from './coords';

export class LinkError extends Error {
  constructor(
    readonly code: 'link_not_allowed' | 'link_unresolved',
    message: string,
  ) {
    super(message);
  }
}

export const MAX_HOPS = 5;
export const HOP_TIMEOUT_MS = 5000;

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function parseAllowed(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new LinkError('link_not_allowed', 'ลิงก์ไม่ถูกต้อง');
  }
  if (u.protocol !== 'https:' || !isAllowedMapHost(u.hostname) || u.port || u.username || u.password) {
    throw new LinkError('link_not_allowed', 'รองรับเฉพาะลิงก์ Google Maps และ OpenStreetMap');
  }
  return u;
}

/**
 * Coordinates of a pasted map link. A link that already carries them never
 * touches the network; a short link (maps.app.goo.gl, goo.gl/maps) is followed
 * by hand: `redirect: 'manual'`, at most MAX_HOPS, HOP_TIMEOUT_MS each, and every
 * hop must still be a Google/OSM host over https — so this cannot be used as
 * an open proxy or to reach internal addresses.
 */
export async function resolveMapLink(input: string, fetchImpl: FetchLike = fetch): Promise<Coords> {
  const raw = firstUrl(input);
  if (!raw) throw new LinkError('link_not_allowed', 'ไม่พบลิงก์ในข้อความ');
  let url = parseAllowed(raw);

  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const here = parseCoordsFromUrl(url.toString());
    if (here) return here;
    // only the short-link hosts redirect to a place; a long google.com URL without
    // coordinates would need its HTML, which we do not read
    if (hop === MAX_HOPS || !(isShortLinkHost(url.hostname) || hop > 0)) break;

    let res: Response;
    try {
      res = await fetchImpl(url.toString(), {
        method: 'GET',
        redirect: 'manual',
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; AewkanBot/1.0)', accept: 'text/html' },
        signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
      });
    } catch {
      throw new LinkError('link_unresolved', 'เปิดลิงก์ไม่สำเร็จ ลองวางลิงก์เต็มหรือพิมพ์พิกัดแทน');
    }
    const loc = res.headers.get('location');
    // free the connection; the body is never read
    void res.body?.cancel().catch(() => undefined);
    if (res.status < 300 || res.status >= 400 || !loc) break;
    url = parseAllowed(new URL(loc, url).toString());
  }
  throw new LinkError('link_unresolved', 'ไม่พบพิกัดในลิงก์นี้ ลองวางลิงก์เต็มหรือพิมพ์พิกัดแทน');
}
