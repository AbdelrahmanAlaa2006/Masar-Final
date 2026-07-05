# GitFekra — Branding Guide

## The name
- **Always written exactly:** `GitFekra` (capital G, capital F, no space).
- **In Arabic, always:** `جِت فِكرة` — with a **kasra** under both `جِ` and `فِ`.
- Never: "Masar", "Masaar", "GitFikra", "Git Fekra", "gitfekra" (except in domains/emails).

## What GitFekra is
GitFekra is a **software company and personal brand** — not a single app. It builds
modern, scalable SaaS products. The **educational platform is the first product**,
not the whole company. The brand and website are designed so more products can be
added over time without any redesign.

**Concept:** `Git` (build / version / developer craft) + `فكرة` (idea) →
*"من فِكرة إلى منتج"* — *"from an idea to a product."*

## The company website vs. the tenant platforms (do not change)
- **Default tenant** = the **GitFekra company website** (`src/pages/company/GitFekraLanding.jsx`).
- **Every other tenant** (teacher custom domain) = the **educational platform**, exactly as before.
- Resolution is by the existing **custom-domain** tenant logic — unchanged.
  - `gitfekra.com` → resolves to the default tenant → company website.
  - `teacher-domain.com` → resolves to that tenant → their educational platform.
- One codebase, one frontend, one deployment, one Supabase project.

## Visual identity (company site)
- **Aesthetic:** premium, minimal, dark, developer-oriented (Linear/Stripe/Vercel-quality feel).
- **Background:** near-black `#07070c` with a subtle grid + ambient glow.
- **Accent gradient:** `#7c3aed` (violet) → `#06b6d4` (cyan).
- **Egyptian accent:** gold `#d4af37`, used sparingly (status dots, "صُنع في مصر 🇪🇬").
- **Logo lockup:** `</> Git` + muted `Fekra`. Arabic wordmark `جِت فِكرة`.
- **Fonts:** Tajawal (Arabic/UI), monospace for the logo mark.

## Contact / domains
- Company site + emails use `gitfekra.com`:
  - `hello@gitfekra.com` (general), `support@gitfekra.com`, `privacy@gitfekra.com`, `legal@gitfekra.com`.

## Adding a future product (configuration-driven)
Edit **`src/pages/company/products.js`** — add an object to `UPCOMING_PRODUCTS`
(or move it to `RELEASED_PRODUCTS` when it ships):
```js
{
  id: 'my-product',
  name: { ar: 'اسم المنتج', en: 'Product Name' },
  tagline: { ar: 'وصف قصير', en: 'Short description' },
  icon: 'fa-cube', accent: '#10b981',
  tags: ['SaaS'], status: 'building', // or 'live'
}
```
The landing page renders it automatically as a card. **Nothing else changes** —
no hardcoding, no new pages.

## Technologies list
Also in `src/pages/company/products.js` → `TECHNOLOGIES`. Set `future: true` to
show a subtle "soon" badge (e.g. TypeScript, Node.js).

## What must NEVER be renamed (would break the app)
- Auth email domain `@masaar.app` (login depends on it).
- Storage keys: `masar-token`, `masar-user`, `masar-permissions`, `masar-cache:`,
  `masar-tenant-slug`, `masar-user-updated`, `masar-devtools-blocked`, `masaar-remembered-phone`.
- DB `slug = 'default'` and the default tenant UUID.
These are internal identifiers, invisible to users — leave them as-is.
