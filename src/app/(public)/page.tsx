import type { Metadata } from 'next';
import { HomeView } from '@/features/seo/home-view';
import { homeMetadata } from '@/features/seo/metadata';
import { parsePlacesParam } from '@/features/seo/place-data';
import { SITE_URL } from '@/lib/env';

export const metadata: Metadata = homeMetadata('th', SITE_URL);

/**
 * Thai home: the trip builder. `?staff=1` (bottom-nav centre action for staff) is only
 * passed through to the UI; the booking API sets created_by from the staff session.
 * `?places=slug1,slug2` preselects stops. The English page lives at /en.
 */
export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const sp = await searchParams;
  return <HomeView lang="th" staff={sp.staff === '1'} prefill={parsePlacesParam(sp.places)} />;
}
