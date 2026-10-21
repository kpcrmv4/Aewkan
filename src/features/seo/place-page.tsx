import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicHeader } from '@/components/public/public-header';
import { SITE_URL } from '@/lib/env';
import { CatalogError } from './catalog-error';
import { getCatalogOrNull } from './data';
import type { UrlLang } from './lang-url';
import { placeMetadata } from './metadata';
import { buildPlaceLanding } from './place-data';
import { PlaceView } from './place-view';

/** shared by /places/[slug] and /en/places/[slug] */
export async function placePageMetadata(lang: UrlLang, slug: string): Promise<Metadata> {
  const loaded = await getCatalogOrNull();
  const landing = loaded ? buildPlaceLanding(loaded.catalog, slug) : null;
  return landing ? placeMetadata(lang, SITE_URL, landing) : { robots: { index: false, follow: false } };
}

export async function PlacePage({ lang, slug }: { lang: UrlLang; slug: string }) {
  const loaded = await getCatalogOrNull();
  if (!loaded) {
    return (
      <div className="min-h-dvh">
        <PublicHeader />
        <main className="mx-auto max-w-[1180px] px-4 pt-6">
          <CatalogError lang={lang} />
        </main>
      </div>
    );
  }
  const landing = buildPlaceLanding(loaded.catalog, slug);
  if (!landing) notFound();
  return <PlaceView lang={lang} l={landing} />;
}
