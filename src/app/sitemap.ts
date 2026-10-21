import type { MetadataRoute } from 'next';
import { getCatalogOrNull } from '@/features/seo/data';
import { landingPlaces } from '@/features/seo/place-data';
import { buildSitemap } from '@/features/seo/sitemap';
import { SITE_URL } from '@/lib/env';

// reads the live catalog on each request; a build must not freeze the list
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const loaded = await getCatalogOrNull();
  // catalog down: still publish the two home URLs
  const slugs = loaded ? landingPlaces(loaded.catalog).map((p) => p.slug) : [];
  return buildSitemap(SITE_URL, slugs);
}
