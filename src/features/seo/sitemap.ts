import type { MetadataRoute } from 'next';
import { absoluteUrl, languageAlternates } from './metadata';
import { homePath, placePath } from './lang-url';

/** every page that exists in both languages, each entry carrying the hreflang alternates */
export function buildSitemap(site: string, slugs: string[]): MetadataRoute.Sitemap {
  const pages: Array<{ th: string; en: string; priority: number }> = [
    { th: homePath('th'), en: homePath('en'), priority: 1 },
    ...slugs.map((s) => ({ th: placePath('th', s), en: placePath('en', s), priority: 0.7 })),
  ];
  const out: MetadataRoute.Sitemap = [];
  for (const p of pages) {
    const languages = languageAlternates(site, p.th, p.en);
    for (const lang of ['th', 'en'] as const) {
      out.push({ url: absoluteUrl(site, p[lang]), changeFrequency: 'weekly', priority: p.priority, alternates: { languages } });
    }
  }
  return out;
}

export function buildRobots(site: string): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/j/', '/trips'] }],
    sitemap: `${site.replace(/\/+$/, '')}/sitemap.xml`,
  };
}
