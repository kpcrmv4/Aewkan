import { loadPublicCatalog } from '@/lib/catalog/server';
import { todayInBangkok } from '@/lib/format';
import { TripBuilder } from '@/features/trip-builder/trip-builder';

/**
 * Trip builder. `?staff=1` (bottom-nav centre action for staff) is only passed
 * through to the UI; the booking API sets created_by from the staff session.
 */
export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const sp = await searchParams;
  const staff = sp.staff === '1';
  let json = null;
  try {
    json = (await loadPublicCatalog()).json;
  } catch (e) {
    console.error('[home] catalog failed', e instanceof Error ? e.message : e);
  }
  return <TripBuilder json={json} today={todayInBangkok()} staff={staff} />;
}
