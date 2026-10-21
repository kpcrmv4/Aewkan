import type { Metadata } from 'next';
import { baht } from '@/lib/format';
import { SEO, seoText } from '@/lib/copy/seo';
import { homePath, placePath, type UrlLang } from './lang-url';
import type { PlaceLanding } from './place-data';

const OG_IMAGE = { url: '/opengraph-image', width: 1200, height: 630, alt: 'AewKan · Chiang Mai private driver' };

export const OG_LOCALE: Record<UrlLang, string> = { th: 'th_TH', en: 'en_US' };

export const siteBase = (site: string) => site.replace(/\/+$/, '');
export const absoluteUrl = (site: string, path: string) => `${siteBase(site)}${path === '/' ? '' : path}${path === '/' ? '/' : ''}`;

/** hreflang map for a page that exists in both languages; x-default is the Thai page */
export function languageAlternates(site: string, th: string, en: string): Record<string, string> {
  return { th: absoluteUrl(site, th), en: absoluteUrl(site, en), 'x-default': absoluteUrl(site, th) };
}

interface PageMeta {
  lang: UrlLang;
  site: string;
  paths: { th: string; en: string };
  title: string;
  description: string;
  keywords?: string[];
}

function pageMetadata({ lang, site, paths, title, description, keywords }: PageMeta): Metadata {
  const other: UrlLang = lang === 'th' ? 'en' : 'th';
  const url = absoluteUrl(site, paths[lang]);
  return {
    title: { absolute: title },
    description,
    keywords,
    alternates: { canonical: url, languages: languageAlternates(site, paths.th, paths.en) },
    openGraph: {
      type: 'website',
      url,
      siteName: SEO.siteName[lang],
      title,
      description,
      locale: OG_LOCALE[lang],
      alternateLocale: [OG_LOCALE[other]],
      // a page that sets openGraph itself no longer inherits the file-convention image
      images: [OG_IMAGE],
    },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
  };
}

export function homeMetadata(lang: UrlLang, site: string): Metadata {
  return pageMetadata({
    lang,
    site,
    paths: { th: homePath('th'), en: homePath('en') },
    title: SEO.homeTitle[lang],
    description: SEO.homeDescription[lang],
    keywords: [...SEO.keywords[lang]],
  });
}

export function placeName(l: PlaceLanding, lang: UrlLang) {
  return lang === 'en' ? l.place.name_en : l.place.name_th;
}

export function placeMetadata(lang: UrlLang, site: string, l: PlaceLanding): Metadata {
  const name = placeName(l, lang);
  const price = l.fromPrice === null ? null : baht(l.fromPrice);
  const km = Math.round(l.oneWayKm);
  return pageMetadata({
    lang,
    site,
    paths: { th: placePath('th', l.place.slug), en: placePath('en', l.place.slug) },
    title: price ? seoText(lang, 'placeTitle', { name, price }) : seoText(lang, 'placeTitleNoPrice', { name }),
    description: price ? seoText(lang, 'placeDescription', { name, price, km }) : seoText(lang, 'placeDescriptionNoPrice', { name }),
  });
}
