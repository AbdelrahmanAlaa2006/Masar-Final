# Tenant Customization Plan — Config-Driven UI

**Date:** 2026-06-29
**Objective:** Let each teacher (tenant) have different colors, backgrounds, hero sections, banners, teacher images, optional sections, dashboard widgets, and home-page blocks — **without duplicating page files, deployments, or databases.**
**Constraints honored:** one codebase, one Supabase project, one deployment; shared components; configuration-driven rendering; performance first. **Nothing implemented — plan only.**

> Prereqs/context: `MULTITENANT_AUDIT.md` (the structure is sound and code-split per tenant), `TENANT_SCALABILITY_REPORT.md`.

---

## 1. Can the current architecture support this safely? — Yes.

You already have the two halves of a config-driven system:
1. **Per-tenant data** — `src/tenants/<folder>/config.js` (branding, teacher, socials, location, theme colors, particle config).
2. **Per-tenant styling** — `src/tenants/<folder>/styles.css`, scoped under a body theme class, **code-split** via dynamic `import()` so each visitor downloads only their tenant's CSS (`TenantContext.jsx:161-164`, `theme.js:14-24`).

What's missing for "different sections/blocks/widgets per tenant" is a **layout schema** in config + a **block registry** of shared components that renders it. That's an *extension* of what you have, not a redesign — and it adds **zero** runtime cost for tenants that don't use it (back-compat default).

**Two customization axes, two clean mechanisms (no page duplication):**

| You want to vary… | Mechanism | Per-tenant work |
|-------------------|-----------|-----------------|
| Colors, backgrounds, spacing, show/hide, image swaps | **CSS** under the tenant's theme class + CSS vars | edit `styles.css` / colors in `config.js` |
| Which sections appear, their order, their text/images, optional widgets | **Config-driven block registry** (this plan) | edit a `layout` array in `config.js` (or DB) |

---

## 2. The pattern: a Block Registry rendered from config

### 2.1 Describe the page as data (in `config.js` or DB `tenants.config`)
```js
// src/tenants/power-platform/config.js  (illustrative — additive)
home: {
  blocks: [
    { type: 'hero',        variant: 'split',   enabled: true },
    { type: 'banner',      enabled: true, props: { text: { ar: '...', en: '...' }, image: '/images/power-banner.png' } },
    { type: 'teacherCard', enabled: true },
    { type: 'features',    enabled: true, props: { columns: 4 } },
    { type: 'stats',       enabled: false },           // this tenant hides stats
    { type: 'location',    enabled: true }
  ]
}
```

### 2.2 Map block types → shared components (one registry, app-wide)
```jsx
// src/tenants/blockRegistry.js  (new, shared — NOT per tenant)
import HeroBlock from '../components/blocks/HeroBlock'
import BannerBlock from '../components/blocks/BannerBlock'
// ...
export const BLOCK_REGISTRY = {
  hero: HeroBlock, banner: BannerBlock, teacherCard: TeacherCardBlock,
  features: FeaturesBlock, stats: StatsBlock, location: LocationBlock,
}
```

### 2.3 Render the array in the existing shared page (no duplication)
```jsx
// src/pages/Home.jsx — one shared file for ALL tenants
const { themeConfig } = useTenant()
const blocks = themeConfig?.home?.blocks ?? DEFAULT_HOME_BLOCKS  // back-compat fallback
return blocks.filter(b => b.enabled !== false).map((b, i) => {
  const Cmp = BLOCK_REGISTRY[b.type]
  return Cmp ? <Cmp key={i} {...b.props} variant={b.variant} /> : null
})
```

**Result:** one `Home.jsx`; each tenant gets a different page by editing **data**, not code. Adding a tenant = a config array; adding a *new kind of section* = one new component registered once and available to all tenants.

---

## 3. Why this is safe for performance

- **No extra downloads per tenant:** the block components are part of the shared bundle (or lazy-loaded per block if heavy). A tenant that uses 4 blocks doesn't ship the other tenants' content — content lives in their own code-split `config.js`/`styles.css`.
- **No `if (tenant === 'x')` in pages:** the registry replaces scattered conditionals (which would bloat every page and hurt every tenant). This *removes* the anti-pattern the audit flagged (Q9).
- **Rendering cost is trivial:** mapping a small array of block descriptors is negligible vs. data fetching.
- **Backward compatible:** if a tenant has no `home.blocks`, the page renders the existing `DEFAULT_HOME_BLOCKS` exactly as today. Existing tenants are untouched until you give them a `blocks` array.

---

## 4. Where customization data should live

| Data | Store in | Why |
|------|----------|-----|
| Theme colors, particle/canvas config, fonts | `config.js` (code) | tied to CSS assets; code-split per tenant |
| Layout `blocks` arrays, banner text/images, toggles | **Start in `config.js`; promote to DB `tenants.config` (JSONB) later** | DB lets non-developers edit via an admin UI without a deploy |
| Per-tenant CSS overrides | `styles.css` (code) | scoped, code-split |
| Images/backgrounds | `/public/images/...` referenced by config | served statically/CDN |

**Migration-friendly:** `TenantContext` already loads `tenants.config` (JSONB). Reading `config.home.blocks` from the DB is a natural future step — **no new tables, no schema duplication** (extends the existing `config` column). Until then, `config.js` is fine.

---

## 5. Implementation plan (phased, additive, no breakage)

### Phase A — Foundation (no visible change)
1. Create `src/components/blocks/` and move the **existing** Home sections into block components (Hero, Banner, TeacherCard, Features, Stats, Location) — pure refactor, same markup/styles.
2. Add `src/tenants/blockRegistry.js` mapping type→component.
3. Define `DEFAULT_HOME_BLOCKS` mirroring today's Home layout.
4. Render `Home.jsx` from `themeConfig?.home?.blocks ?? DEFAULT_HOME_BLOCKS`.
   - **Validation:** every existing tenant's Home looks byte-for-byte the same (fallback path). `npm run build`.

### Phase B — Make one tenant data-driven (proof)
5. Add a `home.blocks` array to **one** tenant's `config.js` (e.g. power-platform) reordering/hiding/altering blocks.
   - **Validation:** that tenant changes; all others unchanged.

### Phase C — Extend to more surfaces
6. Apply the same registry pattern to other customizable surfaces you listed (dashboard widgets, optional sections) — each becomes a block type. Reuse the registry; no new pages.

### Phase D — Optional: DB-driven editing (later, only if wanted)
7. Read `home.blocks` from `tenants.config` JSONB (already loaded) with `config.js` as fallback; build a small admin editor in ControlPanel to edit the JSON. **No new tables.**

### Cross-cutting cleanup (pairs with audit C-5 / Q9)
8. Move hardcoded brand name/colors/logo/folder out of `TenantContext` into `config.js`/DB so the context just reads config. Keep current hardcoded fallbacks until all tenants carry config — fully backward compatible.

---

## 6. Guardrails

- **Never** create `Home.power.jsx` / per-tenant page files — that's the exact duplication you want to avoid; the registry makes it unnecessary.
- **Never** bundle all tenants' CSS globally — keep per-tenant `styles.css` code-split.
- Keep block `props` **serializable** (so they can later live in DB JSON).
- Validate unknown block types gracefully (skip + console.warn) so a bad config can't white-screen — and it's covered by the `ErrorBoundary` added in Phase 0 anyway.
- Treat the block schema as versioned; add `enabled` defaults so omitting a flag never hides content unexpectedly.

---

## 7. Verdict

The current architecture **can** support fully different per-tenant home pages, banners, hero sections, teacher images, optional sections, and dashboard widgets **with one codebase, one Supabase project, one deployment, and shared components** — by adding a **config-driven block registry** on top of what already exists. It is additive, removes the existing hardcoded-conditional risk, costs effectively nothing at runtime, and scales to many tenants because each tenant ships only its own config/CSS chunk.
