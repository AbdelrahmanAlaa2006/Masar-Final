/* ---------------------------------------------------------------------------
   Tenant brand overrides — single source of truth.

   Historically these remaps lived inline inside TenantContext as scattered
   `if (slug === 'x')` blocks. That made adding/rebranding a tenant a code edit
   in the context and risked fragile matching. This module centralizes the
   exact same logic as data so the context just calls into it.

   Behavior is intentionally identical to the previous inline implementation —
   this is a relocation, not a rule change. To onboard or rebrand a tenant,
   add/adjust an entry here (and, longer term, move these fields into the DB
   `tenants.config` so no code change is needed at all).
   --------------------------------------------------------------------------- */

// A brand override matches a resolved tenant row and, if matched, applies a set
// of display fields (name/slug/colors/logo). `match` mirrors the old inline
// predicates exactly.
const BRAND_OVERRIDES = [
  {
    key: 'english',
    match: (t) =>
      t.slug === 'sherif-english' ||
      t.slug === 'waled-english' ||
      t.config?.subject === 'english',
    apply: {
      name: 'The Miracle in English',
      slug: 'waled-english',
      primary_color: '#d4af37',
      secondary_color: '#cbd5e1',
      logo_url: '/images/Logo The Miracle.png',
    },
  },
  {
    key: 'power',
    match: (t) =>
      t.slug === 'cyber' ||
      t.slug === 'power-platform' ||
      t.slug === 'sherif-programming' ||
      t.slug === 'mohamed-abdella' ||
      t.config?.subject === 'cyber' ||
      t.config?.subject === 'computer' ||
      t.config?.subject === 'programming' ||
      (t.slug || '').includes('cyber') ||
      (t.slug || '').includes('prog') ||
      (t.slug || '').includes('power'),
    apply: {
      name: 'منصة باور',
      slug: 'power-platform',
      primary_color: '#d4af37',
      secondary_color: '#cbd5e1',
      logo_url: '/images/Power Logo.png',
    },
  },
]

/* Mutates+returns the resolved tenant row with the first matching brand
   override applied. Equivalent to the old decorate-english / decorate-power
   blocks, evaluated in order (english first, then power) as before. */
export function applyBrandOverride(resolvedData) {
  if (!resolvedData) return resolvedData
  for (const ov of BRAND_OVERRIDES) {
    if (ov.match(resolvedData)) {
      Object.assign(resolvedData, ov.apply)
      break
    }
  }
  return resolvedData
}

/* Collapses the raw tenant list (used by the localhost dev switcher) so the
   several physical slugs of a brand show as one entry. Same output as the old
   inline `allTenants.map(...)`. */
export function remapAvailableTenants(allTenants) {
  return (allTenants || []).map((t) => {
    if (t.slug === 'sherif-english' || t.slug === 'waled-english') {
      return { slug: 'waled-english', name: 'The Miracle in English' }
    }
    if (t.slug === 'cyber' || t.slug === 'power-platform' || t.slug === 'sherif-programming' || t.slug === 'mohamed-abdella') {
      return { slug: 'power-platform', name: 'منصة باور' }
    }
    return t
  })
}

/* Resolves which `src/tenants/<folder>` config+styles chunk to load for a
   tenant. Identical matching to the previous local getTenantFolder(). */
export function getTenantFolder(tenant) {
  const subject = tenant?.config?.subject || ''
  const slug = tenant?.slug || ''
  if (subject === 'chemistry' || slug === 'mona-chem') return 'chemistry'
  if (subject === 'physics' || slug === 'sherif-physics') return 'physics'
  if (subject === 'math' || subject === 'mathematics' || slug?.includes('math')) return 'math'
  if (subject === 'biology' || slug?.includes('bio')) return 'biology'
  if (subject === 'science' || slug?.includes('science')) return 'science'
  if (subject === 'geology' || slug?.includes('geo')) return 'geology'
  if (subject === 'english' || slug === 'sherif-english' || slug === 'waled-english' || slug?.includes('english') || slug?.includes('eng')) return 'english'
  if (subject === 'humanities' || subject === 'geography' || subject === 'history' || slug?.includes('humanities') || slug?.includes('geo-hist')) return 'humanities'
  if (subject === 'cyber' || subject === 'computer' || subject === 'programming' || slug?.includes('cyber') || slug?.includes('prog') || slug?.includes('baccalaureate') || slug?.includes('power')) return 'power-platform'
  return 'default'
}
