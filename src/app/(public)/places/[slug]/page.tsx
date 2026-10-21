import type { Metadata } from 'next';
import { PlacePage, placePageMetadata } from '@/features/seo/place-page';

export async function generateMetadata({ params }: PageProps<'/places/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  return placePageMetadata('th', slug);
}

/** Thai landing page: private driver to one destination */
export default async function ThaiPlacePage({ params }: PageProps<'/places/[slug]'>) {
  const { slug } = await params;
  return <PlacePage lang="th" slug={slug} />;
}
