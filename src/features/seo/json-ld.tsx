import { jsonLdString } from './jsonld';

/** structured data for crawlers; the string is already escaped by jsonLdString */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
