import type { Metadata } from 'next';
import { PlacePage, placePageMetadata } from '@/features/seo/place-page';

export async function generateMetadata({ params }: PageProps<'/en/places/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  return placePageMetadata('en', slug);
}

/** English landing page: private driver to one destination */
export default async function EnglishPlacePage({ params }: PageProps<'/en/places/[slug]'>) {
  const { slug } = await params;
  return <PlacePage lang="en" slug={slug} />;
}
