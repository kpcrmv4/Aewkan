import 'server-only';
import { headers } from 'next/headers';
import { URL_LANG_HEADER, type UrlLang } from './lang-url';

/** language the URL decides (set by src/proxy.ts), or null on pages the URL does not localize */
export async function getUrlLang(): Promise<UrlLang | null> {
  const v = (await headers()).get(URL_LANG_HEADER);
  return v === 'th' || v === 'en' ? v : null;
}
