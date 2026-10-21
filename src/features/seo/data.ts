import 'server-only';
import { cache } from 'react';
import { loadPublicCatalog } from '@/lib/catalog/server';

/** one catalog read per request, shared by generateMetadata and the page; null = could not load */
export const getCatalogOrNull = cache(async () => {
  try {
    return await loadPublicCatalog();
  } catch (e) {
    console.error('[seo] catalog failed', e instanceof Error ? e.message : e);
    return null;
  }
});
