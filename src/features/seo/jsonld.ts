import { seoText } from '@/lib/copy/seo';
import { BRAND } from '@/lib/copy/common';
import { absoluteUrl, placeName, siteBase } from './metadata';
import { homePath, placePath, type UrlLang } from './lang-url';
import type { PlaceLanding } from './place-data';

/** the logo spells it with a capital K */
const BRAND_EN = 'AewKan';

type Json = Record<string, unknown>;

/** serialize for a `<script type="application/ld+json">`: `<` is escaped so `</script>` can never close the tag */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

const businessId = (site: string) => `${siteBase(site)}/#business`;

function business(site: string, lang: UrlLang): Json {
  return {
    '@type': ['LocalBusiness', 'TaxiService'],
    '@id': businessId(site),
    name: lang === 'en' ? BRAND_EN : BRAND.th,
    alternateName: lang === 'en' ? BRAND.th : BRAND_EN,
    url: absoluteUrl(site, homePath(lang)),
    description: seoText(lang, 'businessDescription'),
    image: `${siteBase(site)}/opengraph-image`,
    priceRange: '฿฿',
    inLanguage: ['th', 'en'],
    availableLanguage: ['Thai', 'English'],
    address: { '@type': 'PostalAddress', addressLocality: 'Chiang Mai', addressRegion: 'Chiang Mai', addressCountry: 'TH' },
    areaServed: { '@type': 'City', name: 'Chiang Mai', containedInPlace: { '@type': 'Country', name: 'Thailand' } },
    currenciesAccepted: 'THB',
  };
}

/** home page: the business and the website */
export function homeJsonLd(lang: UrlLang, site: string): Json {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      business(site, lang),
      {
        '@type': 'WebSite',
        '@id': `${siteBase(site)}/#website`,
        url: absoluteUrl(site, homePath(lang)),
        name: lang === 'en' ? BRAND_EN : BRAND.th,
        inLanguage: lang,
        publisher: { '@id': businessId(site) },
      },
    ],
  };
}

export function breadcrumbJsonLd(lang: UrlLang, site: string, l: PlaceLanding): Json {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: seoText(lang, 'home'), item: absoluteUrl(site, homePath(lang)) },
      { '@type': 'ListItem', position: 2, name: placeName(l, lang), item: absoluteUrl(site, placePath(lang, l.place.slug)) },
    ],
  };
}

/** place page: business, breadcrumbs and a TouristTrip whose offer is the lowest valid price */
export function placeJsonLd(lang: UrlLang, site: string, l: PlaceLanding): Json {
  const name = placeName(l, lang);
  const url = absoluteUrl(site, placePath(lang, l.place.slug));
  const trip: Json = {
    '@type': 'TouristTrip',
    '@id': `${url}#trip`,
    name: seoText(lang, 'tripName', { name }),
    url,
    inLanguage: lang,
    touristType: lang === 'en' ? 'Private group, couple or family' : 'กลุ่มส่วนตัว คู่รัก ครอบครัว',
    provider: { '@id': businessId(site) },
    itinerary: {
      '@type': 'ItemList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          item: { '@type': 'Place', name, geo: { '@type': 'GeoCoordinates', latitude: l.place.lat, longitude: l.place.lng } },
        },
      ],
    },
  };
  if (l.fromPrice !== null) {
    trip.description = seoText(lang, 'tripDescription', { name, price: `฿${l.fromPrice.toLocaleString('en-US')}` });
    trip.offers = { '@type': 'Offer', price: l.fromPrice, priceCurrency: 'THB', url, availability: 'https://schema.org/InStock' };
  }
  return { '@context': 'https://schema.org', '@graph': [business(site, lang), breadcrumbJsonLd(lang, site, l), trip] };
}
