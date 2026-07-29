/* ---------------------------------------------------------------------------
   Tenant Password Format Configuration

   Customize password generation prefixes per tenant here, or set a
   `password_prefix` property inside the database `tenants.config` column.
   --------------------------------------------------------------------------- */

/**
 * Map tenant slugs to their custom password prefixes.
 * Customize these prefixes according to your exact preferences!
 */
export const TENANT_PASSWORD_PREFIXES = {
  'mohamed-abdella': 'abdella',
  'sherif-english': 'miracle',
  'cyber': 'cyber',
  'power-platform': 'power',
  'math': 'math',
  'physics': 'physics',
  'chemistry': 'chem',
  'biology': 'bio',
  'geology': 'geo',
  'humanities': 'human',
  'science': 'science',
  'default': 'masar'
}

/**
 * Generates a temporary password formatted for a specific tenant.
 * 
 * Priority:
 * 1. `tenant.config.password_prefix` (if specified in Supabase database)
 * 2. `TENANT_PASSWORD_PREFIXES[tenantSlug]` (from the mapping above)
 * 3. Default fallback ('masar')
 *
 * @param {object|string} tenant - The tenant object or tenant slug string
 * @param {number} digitCount - Number of random digits appended (default: 4)
 * @returns {string} e.g. "abdella1234", "miracle5678"
 */
export function generateTenantPassword(tenant, digitCount = 4) {
  const slug = typeof tenant === 'string' ? tenant : (tenant?.slug || 'default')
  const dbPrefix = (typeof tenant === 'object' && tenant?.config?.password_prefix) ? tenant.config.password_prefix : null

  // Clean the prefix so it contains valid characters
  const rawPrefix = dbPrefix || TENANT_PASSWORD_PREFIXES[slug] || TENANT_PASSWORD_PREFIXES['default'] || 'masar'
  const prefix = String(rawPrefix).toLowerCase().replace(/[^a-z0-9]/g, '') || 'masar'

  const min = Math.pow(10, digitCount - 1)
  const max = Math.pow(10, digitCount) - 1
  const randomDigits = Math.floor(min + Math.random() * (max - min + 1))

  return `${prefix}${randomDigits}`
}
