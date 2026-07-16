# SEO Report — mrmohamedabdella.com (منصة باور | Mr Mohamed Abdella)

**Date:** 2026-07-16
**Scope:** Google/search visibility for the power-platform tenant on its custom domain. No changes to domain config, Vercel/DNS, routing, auth, or the multi-tenant system's behavior.

---

## 1. What existed before

| Area | State |
|---|---|
| `index.html` | GitFekra-branded title/description; partial Open Graph with a **relative** `og:image` (unusable by WhatsApp/Facebook), no `og:url`, no locale |
| Twitter cards | None |
| Canonical | None (the `masar-final.vercel.app` duplicate could compete with the real domain) |
| Structured data | None |
| robots.txt / sitemap.xml | None |
| Per-page titles | Runtime `document.title = tenant.name` only; no page-specific titles or meta descriptions anywhere |
| Private routes | Indexable in principle (no `noindex`) |

## 2. Implemented improvements

### Static head (`index.html`)
The static head is what non-JS scrapers (Facebook, WhatsApp, LinkedIn) see, so it now carries the production identity of mrmohamedabdella.com:

- **Title:** `منصة باور — مستر محمد عبداللاه | تعليم البرمجة والذكاء الاصطناعي`
- **Description:** bilingual, naturally covering البرمجة / الذكاء الاصطناعي / البكالوريا المصرية الجديدة / الإعدادي والثانوي / تعليم أونلاين + English equivalents.
- **Keywords / author:** include name variants — محمد عبداللاه، محمد عبد اللاه، مستر محمد عبداللاه, Mohamed Abdella, Mr Mohamed Abdella, Mohamed Abdellah, Mohamed Abdel Lah (per request: *Abdella* is the primary spelling).
- **Robots:** `index, follow, max-image-preview:large, max-snippet:-1`.
- **Canonical:** `https://mrmohamedabdella.com/` — also neutralizes the vercel.app duplicate.
- **Theme color** updated to the brand gold `#d4af37` (still overridden per tenant at runtime).

### Open Graph + Twitter
Complete OG set (`type, site_name, url, title, description, image + width/height/alt, locale ar_EG + en_US alternate`) and `summary_large_image` Twitter card. A proper **1200×630 share image** was generated from the Power logo (`public/images/og-image.png`) — the previous logo asset was 720×1600 portrait, which link scrapers crop badly.

### Structured data (JSON-LD)
Three linked entities, absolute URLs, real links only (config's Instagram/TikTok placeholders excluded):

- **Person** — Mohamed Abdella with `alternateName` covering all Arabic/English spelling variants, job title, bio, photo, `knowsAbout` (Programming, AI, CS, Egyptian Baccalaureate curriculum), `sameAs` Facebook + YouTube.
- **EducationalOrganization** — منصة باور / Power Platform, logo, Damanhour (Beheira, EG) address, phone, founder → Person.
- **WebSite** — bilingual, publisher → Organization.

### robots.txt + sitemap.xml (`public/`)
- robots.txt allows the public pages, disallows all app/dashboard/report routes (including `/public-report`, which contains per-student data), and points to the sitemap.
- sitemap.xml lists the three public URLs (`/`, `/login`, `/register`) on the production domain.

### Runtime per-route SEO (`src/components/RouteSeo.jsx`)
A small component mounted in `App.jsx` (Google renders JS, so it sees these):

- **Unique title + meta description per public route.** Power tenant gets keyword-rich text; every other tenant derives text from its own name — multi-tenant branding is untouched.
- **`noindex, nofollow` on all private routes** (dashboard, exams, payments, …).
- **Per-route canonical only on mrmohamedabdella.com**; on preview hosts (localhost, \*.vercel.app) the canonical is removed so previews never claim to be production.
- `/` and `/login` titles remain owned by the landing page (it reacts to the AR/EN toggle); the power tenant's landing now uses a new optional `branding.seo_title` config field for a keyword-rich localized title.

### Accessibility / performance touches
- Landing logo alts changed from `"Logo"` to the localized brand name; footer logo + package thumbnails now `loading="lazy"`.
- Heading hierarchy on the landing was already correct (single `h1`); most images already lazy-load.
- Verified: production build passes; power tenant, chemistry tenant, and `/register` all render correct titles/descriptions; JSON-LD parses (3 entities).

## 3. Remaining recommendations (manual steps)

1. **Google Search Console** (biggest lever): verify `mrmohamedabdella.com`, submit `sitemap.xml`, and use *URL Inspection → Request Indexing* on `/` and `/login`. Without this, indexing can take weeks.
2. **Google Business Profile** for the Damanhour branches — dominates local "مستر محمد عبداللاه دمنهور" searches and feeds the knowledge panel.
3. Ask Facebook/YouTube pages to link back to mrmohamedabdella.com (bio links) — entity confirmation for the name searches.
4. Consider validating rich results at search.google.com/test/rich-results and the share preview at developers.facebook.com/tools/debug after deploy.

## 4. Future SEO opportunities

- **Pre-rendering / SSR** (or Vercel prerender for bots) — the SPA serves an empty `<div id="root">` to non-JS crawlers; Google is fine, but Bing/others index less reliably. A prerender step would remove that ceiling.
- **Content pages** — a public `/about` or blog (شرح دروس، مقالات عن البكالوريا المصرية) would give Google real text to rank beyond the landing page; currently everything is behind login.
- **Per-tenant SEO config** — `branding.seo_title` is the start; description/keywords/OG image could move into `tenants.config` so future tenant domains get the same treatment without code changes.
- **FAQ/Course structured data** — the landing's "how to start" steps and package cards could be marked up as `FAQPage` / `Course` for rich results.
- The viewport currently sets `user-scalable=no` (an accessibility/Lighthouse penalty) — changing it affects app UX, so it was deliberately left; revisit if Core Web Vitals/accessibility scores matter.
