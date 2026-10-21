import type { Metadata } from 'next';
import { HomeView } from '@/features/seo/home-view';
import { homeMetadata } from '@/features/seo/metadata';
import { parsePlacesParam } from '@/features/seo/place-data';
import { SITE_URL } from '@/lib/env';

export const metadata: Metadata = homeMetadata('en', SITE_URL);

/** English home: the same trip builder at its own URL (`?staff=1`, `?places=a,b` work here too) */
export default async function EnglishHomePage({ searchParams }: PageProps<'/en'>) {
  const sp = await searchParams;
  return <HomeView lang="en" staff={sp.staff === '1'} prefill={parsePlacesParam(sp.places)} />;
}
