import { cookies, headers } from 'next/headers';
import { LangProvider, type Lang } from '@/components/public/lang';

/** customer-facing pages: Thai or English, remembered per browser */
export default async function PublicLayout({ children }: LayoutProps<'/'>) {
  const c = (await cookies()).get('lang')?.value;
  const accept = (await headers()).get('accept-language') ?? '';
  const initial: Lang = c === 'en' || c === 'th' ? c : accept.toLowerCase().startsWith('th') ? 'th' : 'en';
  return <LangProvider initial={initial}>{children}</LangProvider>;
}
