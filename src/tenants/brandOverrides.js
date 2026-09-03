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
    key: 'mohamed-yasser',
    match: (t) =>
      t.slug === 'mohamed-yasser' ||
      (t.slug || '').includes('yasser') ||
      t.domain === 'mrmohamedyasser.com' ||
      (t.domain || '').includes('mrmohamedyasser'),
    apply: {
      name: 'مستر محمد ياسر',
      slug: 'mohamed-yasser',
      primary_color: '#ee7d30',
      secondary_color: '#1c3257',
      logo_url: '/images/Logo Mr Mohamed Yasser.png',
    },
  },
  {
    key: 'english',
    match: (t) =>
      t.slug !== 'mohamed-yasser' &&
      !t.slug?.includes('yasser') &&
      (t.slug === 'sherif-english' ||
        t.slug === 'waled-english' ||
        t.config?.subject === 'english'),
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
  {
    key: 'math',
    match: (t) =>
      t.slug === 'math' ||
      t.slug === 'sherif-math' ||
      t.slug === 'belqadar' ||
      t.slug === 'belqadar-math' ||
      t.slug === 'mahmoud-belqadar' ||
      t.domain === 'mrmahmoudelbeliqdar.com' ||
      (t.domain || '').includes('mrmahmoudelbeliqdar') ||
      t.config?.subject === 'math' ||
      (t.slug || '').includes('math') ||
      (t.slug || '').includes('belqadar'),
    apply: {
      name: 'سنتر البلقدار',
      slug: 'belqadar-math',
      primary_color: '#c8a951',
      secondary_color: '#141210',
      logo_url: '/images/logo elbeliqdar cropped.png',
    },
  },
  {
    key: 'elsharawy',
    match: (t) =>
      t.slug === 'elsharawy' ||
      t.slug === 'elshaarawy' ||
      (t.slug || '').includes('elsharawy') ||
      (t.slug || '').includes('elshaarawy'),
    apply: {
      name: 'منصة الشعراوي',
      slug: 'elsharawy',
      primary_color: '#a86e28',
      secondary_color: '#175e54',
      logo_url: '/images/Elshaarawy Logo.png',
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
    if (t.slug === 'mohamed-yasser' || t.slug?.includes('yasser')) {
      return { slug: 'mohamed-yasser', name: 'مستر محمد ياسر' }
    }
    if (t.slug === 'sherif-english' || t.slug === 'waled-english') {
      return { slug: 'waled-english', name: 'The Miracle in English' }
    }
    if (t.slug === 'cyber' || t.slug === 'power-platform' || t.slug === 'sherif-programming' || t.slug === 'mohamed-abdella') {
      return { slug: 'power-platform', name: 'منصة باور' }
    }
    if (t.slug === 'sherif-math' || t.slug === 'math' || t.slug === 'belqadar' || t.slug === 'belqadar-math' || t.slug === 'mahmoud-belqadar') {
      return { slug: 'belqadar-math', name: 'سنتر البلقدار' }
    }
    if (t.slug === 'elsharawy' || t.slug === 'elshaarawy') {
      return { slug: 'elsharawy', name: 'منصة الشعراوي' }
    }
    return t
  })
}

/* Resolves which `src/tenants/<folder>` config+styles chunk to load for a
   tenant. Identical matching to the previous local getTenantFolder(). */
export function getTenantFolder(tenant) {
  const slug = tenant?.slug || ''
  const subject = tenant?.config?.subject || ''
  if (slug === 'mohamed-yasser' || slug.includes('yasser')) return 'mohamed-yasser'
  if (slug === 'elsharawy' || slug === 'elshaarawy' || slug.includes('elsharawy') || slug.includes('elshaarawy')) return 'elsharawy'
  if (subject === 'chemistry' || slug === 'mona-chem') return 'chemistry'
  if (subject === 'physics' || slug === 'sherif-physics') return 'physics'
  if (subject === 'math' || subject === 'mathematics' || slug?.includes('math') || slug?.includes('belqadar')) return 'math'
  if (subject === 'biology' || slug?.includes('bio')) return 'biology'
  if (subject === 'science' || slug?.includes('science')) return 'science'
  if (subject === 'geology' || slug?.includes('geo')) return 'geology'
  if (subject === 'english' || slug === 'sherif-english' || slug === 'waled-english' || slug?.includes('english') || slug?.includes('eng')) return 'english'
  if (subject === 'humanities' || subject === 'geography' || subject === 'history' || slug?.includes('humanities') || slug?.includes('geo-hist')) return 'humanities'
  if (subject === 'cyber' || subject === 'computer' || subject === 'programming' || slug?.includes('cyber') || slug?.includes('prog') || slug?.includes('baccalaureate') || slug?.includes('power')) return 'power-platform'
  return 'default'
}
