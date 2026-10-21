import { describe, expect, it } from 'vitest';
import { homePath, placePath, planPath, switchPath, urlLangOf } from '@/features/seo/lang-url';

describe('SEO-LANG-08 url language helpers', () => {
  it('decides the language from the path, null elsewhere', () => {
    expect(urlLangOf('/')).toBe('th');
    expect(urlLangOf('/places/pai')).toBe('th');
    expect(urlLangOf('/en')).toBe('en');
    expect(urlLangOf('/en/places/pai')).toBe('en');
    for (const p of ['/trips', '/j/abc', '/admin/jobs', '/entrance', '/english']) expect(urlLangOf(p)).toBeNull();
  });
  it('switches to the same page in the other language', () => {
    expect(switchPath('/', 'en')).toBe('/en');
    expect(switchPath('/en', 'th')).toBe('/');
    expect(switchPath('/places/pai', 'en')).toBe('/en/places/pai');
    expect(switchPath('/en/places/pai', 'th')).toBe('/places/pai');
    expect(switchPath('/places/pai', 'th')).toBe('/places/pai');
    expect(switchPath('/trips', 'en')).toBeNull();
  });
  it('builds localized paths', () => {
    expect(homePath('th')).toBe('/');
    expect(homePath('en')).toBe('/en');
    expect(placePath('en', 'doi-x')).toBe('/en/places/doi-x');
    expect(planPath('th', ['a', 'b'])).toBe('/?places=a,b');
    expect(planPath('en', ['a'])).toBe('/en?places=a');
  });
});
