import { loadPublicCatalog } from '@/lib/catalog/server';
import { TripBuilderPlaceholder } from './trip-builder-placeholder';

/**
 * P0 placeholder for the trip builder (P1 replaces this file and the
 * placeholder component with src/features/trip-builder/*). It proves the
 * public catalog RPC and the pricing engine are wired end to end.
 */
export default async function HomePage() {
  const { json } = await loadPublicCatalog();
  return <TripBuilderPlaceholder catalog={json} />;
}
