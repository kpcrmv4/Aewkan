# SEO — one language per URL, metadata, place landing pages

Specs: `tests/e2e/seo-*.spec.ts` (title starts with the row ID) and `tests/unit/seo-*.test.ts`.
Expected prices always come from `src/lib/pricing` called with the same inputs (round trip from the base place, 2 passengers, default dwell).
E2E runs against a production build (`next start`), not `next dev`.

| ID | Surface item | Expected result | Where |
|----|--------------|-----------------|-------|
| SEO-LANG-01 | Thai home | `/` has `<html lang="th">`, the Thai H1 and `og:locale` th_TH | e2e |
| SEO-LANG-02 | English home | `/en` has `<html lang="en">`, the English H1 and `og:locale` en_US | e2e |
| SEO-LANG-03 | Cookie never overrides the URL | with cookie `lang=en`, `/` stays Thai; with `lang=th`, `/en` stays English | e2e |
| SEO-LANG-04 | Toggle navigates | on `/` the EN link goes to `/en`, on `/en` the ไทย link goes to `/`; the `?query` is kept | e2e |
| SEO-LANG-05 | Toggle on a place page | `/places/<slug>` ↔ `/en/places/<slug>` | e2e |
| SEO-LANG-06 | Toggle saves the cookie | after switching to English on `/`, `/trips` renders English (cookie `lang=en`) | e2e |
| SEO-LANG-07 | Non-localized pages unchanged | on `/trips` the tab bar language button still flips the menu without changing the URL | e2e |
| SEO-LANG-08 | URL language helper | `urlLangOf`, `switchPath`, `homePath`, `placePath` map every localized path and return null elsewhere | unit |
| SEO-META-01 | Canonical + hreflang | home and place pages have `rel=canonical` to their own URL and `hreflang` th / en / x-default (→ Thai) | e2e |
| SEO-META-02 | Open Graph + Twitter | title, description, url, site_name, locale + alternate, image; `twitter:card` summary_large_image | e2e |
| SEO-META-03 | Titles carry the search terms | Thai home title has "รถพร้อมคนขับ เชียงใหม่"; English home title has "Private Driver" and "Chiang Mai" | e2e |
| SEO-META-04 | noindex outside the landing pages | `/trips` has `robots` noindex; `/` and `/en` have none | e2e |
| SEO-META-05 | metadata builders | canonical/languages/OG locale per language and page | unit |
| SEO-ROB-01 | robots.txt | allows `/`, disallows `/admin`, `/api`, `/j/`, `/trips`, lists the sitemap URL | e2e + unit |
| SEO-MAP-01 | sitemap.xml | `/`, `/en` and every place page in both languages, each with `xhtml:link` alternates | e2e |
| SEO-MAP-02 | sitemap builder | entries for both languages with alternates; places in category pickup are skipped; empty catalog → home URLs only | unit |
| SEO-PLC-01 | Place page content | `/places/<slug>` is 200 with an H1 containing the Thai name, breadcrumbs, category, price table, nearby links, CTA | e2e |
| SEO-PLC-02 | Price equals the engine | the price in the table for each valid mode equals `priceTrip` round trip from the base place | e2e + unit |
| SEO-PLC-03 | English place page | `/en/places/<slug>` is English, canonical is the English URL, CTA goes to `/en?places=<slug>` | e2e |
| SEO-PLC-04 | Unknown / hidden slug | `/places/nope` and `/en/places/nope` answer 404 | e2e |
| SEO-PLC-05 | Nearby places | exactly 4 other places, ordered by straight-line distance, each linking to its page | unit |
| SEO-PLC-06 | Phone width | place page and home have no sideways scroll at 360px | e2e |
| SEO-LD-01 | Home JSON-LD | parses; LocalBusiness/TaxiService + WebSite with name, url, areaServed, priceRange | e2e + unit |
| SEO-LD-02 | Place JSON-LD | parses; BreadcrumbList + TouristTrip with an Offer in THB equal to the lowest valid mode | e2e + unit |
| SEO-LD-03 | Escaping | `<` in any value is escaped so `</script>` cannot close the tag | unit |
| SEO-HTML-01 | Crawlable home text | server HTML of `/` and `/en` contains the H1, the intro, the templates and a link to every destination page | e2e |
| SEO-PRE-01 | Prefill | `/?places=a,b` preselects exactly those stops (also `/en?places=`); unknown slugs ignored; max 8 | e2e + unit |
| SEO-PRE-02 | Prefill parser | splits, trims, de-duplicates, caps at 8, drops junk | unit |
| SEO-PRE-03 | `?staff=1` still works | the staff chip shows next to a `places` prefill | e2e |
| SEO-IMG-01 | Icons and OG image | `/opengraph-image` is a 1200×630 PNG (wordmark from `public/brand`), manifest has name, short_name, description, lang and 192/512 icons that load, the apple-touch icon and wordmark files load | e2e |
