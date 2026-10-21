import 'server-only';
import { catalogFromJson, type Catalog, type PublicCatalogJson } from '@/lib/pricing';
import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * The public catalog (places, current rule set, templates, best segments) via
 * the anon-callable `get_public_catalog()` RPC. Same payload the browser gets,
 * so a server-side re-price uses exactly what the customer saw — except the
 * rule version, which the caller must compare.
 */
export async function loadPublicCatalog(): Promise<{ json: PublicCatalogJson; catalog: Catalog }> {
  const sb = await getSupabaseServer();
  const { data, error } = await sb.rpc('get_public_catalog');
  if (error) throw new Error(`get_public_catalog: ${error.message}`);
  const json = data as unknown as PublicCatalogJson;
  return { json, catalog: catalogFromJson(json) };
}
