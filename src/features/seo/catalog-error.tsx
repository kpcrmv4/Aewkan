'use client';

import { useRouter } from 'next/navigation';
import { ErrorRetry } from '@/components/ui/error-retry';
import { seoText } from '@/lib/copy/seo';
import type { UrlLang } from './lang-url';

/** error state of a server-rendered landing page: retry re-runs the server render */
export function CatalogError({ lang }: { lang: UrlLang }) {
  const router = useRouter();
  return <ErrorRetry message={`${seoText(lang, 'errTitle')} · ${seoText(lang, 'errBody')}`} retryLabel={seoText(lang, 'retry')} onRetry={() => router.refresh()} />;
}
