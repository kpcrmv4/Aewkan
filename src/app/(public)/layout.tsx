import { cookies, headers } from 'next/headers';
import { LangProvider, type Lang } from '@/components/public/lang';
import { PublicChrome } from '@/components/public/public-bottom-nav';
import { getUrlLang } from '@/features/seo/server-lang';

/**
 * Customer-facing pages: Thai or English. On a localized URL (`/`, `/en`, place pages)
 * the URL decides and the cookie is ignored; on my trips and job links the visitor's
 * cookie / Accept-Language applies.
 */
export default async function PublicLayout({ children }: LayoutProps<'/'>) {
  const fromUrl = await getUrlLang();
  const c = (await cookies()).get('lang')?.value;
  const accept = (await headers()).get('accept-language') ?? '';
  const initial: Lang = fromUrl ?? (c === 'en' || c === 'th' ? c : accept.toLowerCase().startsWith('th') ? 'th' : 'en');
  return (
    <LangProvider initial={initial}>
      <PublicChrome>{children}</PublicChrome>
    </LangProvider>
  );
}
