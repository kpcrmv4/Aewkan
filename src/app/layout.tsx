import type { Metadata, Viewport } from 'next';
import { Anuphan, Prompt } from 'next/font/google';
import { Providers } from '@/components/providers';
import { getUrlLang } from '@/features/seo/server-lang';
import { SEO } from '@/lib/copy/seo';
import { SITE_URL } from '@/lib/env';
import './globals.css';

const prompt = Prompt({
  variable: '--font-prompt',
  subsets: ['thai', 'latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
});

const anuphan = Anuphan({
  variable: '--font-anuphan',
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

/**
 * Site-wide defaults. Pages whose URL decides their language (`/`, `/en`, places) are
 * indexable and set their own title/canonical; every other page (my trips, job links,
 * admin, 404) has no URL language and is kept out of search results.
 */
export async function generateMetadata(): Promise<Metadata> {
  const lang = await getUrlLang();
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: SEO.homeTitle[lang ?? 'th'], template: lang === 'en' ? '%s · AewKan' : '%s · แอ่วกัน' },
    description: SEO.homeDescription[lang ?? 'th'],
    applicationName: SEO.siteName[lang ?? 'th'],
    manifest: '/manifest.webmanifest',
    // one source: the icon PNGs in public/brand (served as plain files, not through the proxy)
    icons: {
      icon: [
        { url: '/brand/aewkan-icon-32.png', sizes: '32x32', type: 'image/png' },
        { url: '/brand/aewkan-icon-192.png', sizes: '192x192', type: 'image/png' },
      ],
      apple: [{ url: '/brand/aewkan-icon-180.png', sizes: '180x180', type: 'image/png' }],
    },
    ...(lang ? {} : { robots: { index: false, follow: false } }),
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3F6F1' },
    { media: '(prefers-color-scheme: dark)', color: '#0C110F' },
  ],
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // one language per URL: the proxy marks it; other pages (admin, job links) stay Thai until the client sets the visitor's choice
  const lang = (await getUrlLang()) ?? 'th';
  return (
    <html lang={lang} suppressHydrationWarning className={`${prompt.variable} ${anuphan.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
