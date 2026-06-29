import React from 'react'

/* ---------------------------------------------------------------------------
   Block Registry — foundation for config-driven, per-tenant page composition.

   GOAL (see TENANT_CUSTOMIZATION_PLAN.md):
   Let each tenant show different hero sections, banners, optional sections, and
   dashboard widgets WITHOUT duplicating page files. A page describes itself as
   an ordered array of "blocks" in tenant config; this registry maps each block
   `type` to a single shared component. One `Home.jsx` renders any tenant's
   layout by walking its blocks array.

   STATUS: foundation only. Nothing imports this yet — wiring a page to it is a
   separate, opt-in step. Until a tenant provides a `blocks` array, pages keep
   rendering exactly as they do today (use `DEFAULT_HOME_BLOCKS` as the
   fallback when you do wire a page).

   HOW TO USE (later):
     1. Build small block components (HeroBlock, BannerBlock, …) that wrap the
        existing page sections — pure refactor, same markup/styles.
     2. Register them here via registerBlock('hero', HeroBlock).
     3. In the shared page:
          const blocks = themeConfig?.home?.blocks ?? DEFAULT_HOME_BLOCKS
          return renderTenantBlocks(blocks, { themeConfig, user })
     4. A tenant customizes its page by editing the `home.blocks` array in its
        config.js (and, later, in the DB `tenants.config` JSON).
   --------------------------------------------------------------------------- */

// type -> React component. Populated by registerBlock() as block components are
// created. Intentionally empty in this foundation commit.
const BLOCK_REGISTRY = {}

/* Register (or override) the component used to render a block type. */
export function registerBlock(type, component) {
  if (!type || typeof component !== 'function') return
  BLOCK_REGISTRY[type] = component
}

/* Look up a block component by type (undefined if not registered). */
export function getBlock(type) {
  return BLOCK_REGISTRY[type]
}

/* Render an ordered blocks array into React elements.
   - Skips blocks with `enabled === false`.
   - Skips unknown block types gracefully (warns in dev) so a bad/old config can
     never white-screen — and the app-level ErrorBoundary covers thrown errors.
   - Passes each block's `props` plus a shared `context` (themeConfig, user, …)
     to the component, so blocks stay pure and serializable. */
export function renderTenantBlocks(blocks, context = {}) {
  if (!Array.isArray(blocks)) return null
  return blocks
    .filter((b) => b && b.enabled !== false && b.type)
    .map((b, i) => {
      const Cmp = BLOCK_REGISTRY[b.type]
      if (!Cmp) {
        if (import.meta.env.DEV) {
          console.warn(`[blockRegistry] No component registered for block type "${b.type}" — skipping.`)
        }
        return null
      }
      return React.createElement(Cmp, {
        key: b.id || `${b.type}-${i}`,
        variant: b.variant,
        ...(b.props || {}),
        context,
      })
    })
}

/* The current Home layout expressed as data. When a page is wired to the
   registry, use this as the fallback so existing tenants render unchanged.
   Adjust block types here to match the components you register. */
export const DEFAULT_HOME_BLOCKS = [
  { type: 'hero', variant: 'split', enabled: true },
  { type: 'features', enabled: true },
  { type: 'teacherCard', enabled: true },
  { type: 'stats', enabled: true },
  { type: 'location', enabled: true },
]
