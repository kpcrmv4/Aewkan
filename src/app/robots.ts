import type { MetadataRoute } from 'next';
import { buildRobots } from '@/features/seo/sitemap';
import { SITE_URL } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return buildRobots(SITE_URL);
}
