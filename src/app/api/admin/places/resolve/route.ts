import { z } from 'zod';
import { LinkError, resolveMapLink } from '@/features/admin-settings/resolve-link';
import { ApiError, staffRoute } from '@/lib/api/handler';

const ResolveLinkRequest = z.object({ url: z.string().trim().min(1).max(2000) });

/**
 * Coordinates behind a pasted Google Maps / OSM link, so adding a place does not
 * need the map marked by hand. Short links are followed server-side, https and
 * Google/OSM hosts only (see resolve-link.ts) — this is not a general proxy.
 */
export const POST = staffRoute('places.manage', ResolveLinkRequest, async ({ body }) => {
  try {
    const c = await resolveMapLink(body.url);
    return { ok: true as const, lat: c.lat, lng: c.lng };
  } catch (e) {
    if (e instanceof LinkError) throw new ApiError(e.code === 'link_not_allowed' ? 422 : 404, e.code, e.message);
    throw e;
  }
});
