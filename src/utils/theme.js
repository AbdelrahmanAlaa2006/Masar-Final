/**
 * Dynamically applies the tenant's theme configuration (colors, title, logo)
 * to the document root, headers, and browser window.
 * @param {Object} tenant The resolved tenant database row.
 */
export function applyTenantTheme(tenant) {
  if (!tenant) return

  const primary = tenant.primary_color || '#7c3aed'
  const secondary = tenant.secondary_color || '#06b6d4'

  const root = document.documentElement

  // Set branding color variables
  root.style.setProperty('--primary', primary)
  root.style.setProperty('--secondary', secondary)

  // Dynamically compute hover color (darken primary by ~12%)
  const hoverColor = darkenColor(primary, 12)
  root.style.setProperty('--primary-hover', hoverColor)

  // Update browser window tab title
  document.title = `${tenant.name} | منصة مسار التعليمية`

  // Update meta theme-color for mobile browser address bars
  let metaTheme = document.querySelector('meta[name="theme-color"]')
  if (!metaTheme) {
    metaTheme = document.createElement('meta')
    metaTheme.setAttribute('name', 'theme-color')
    document.head.appendChild(metaTheme)
  }
  metaTheme.setAttribute('content', primary)

  // Update tab icon (favicon) if a tenant custom logo is provided
  if (tenant.logo_url) {
    let favicon = document.querySelector('link[rel="icon"]')
    if (!favicon) {
      favicon = document.createElement('link')
      favicon.setAttribute('rel', 'icon')
      document.head.appendChild(favicon)
    }
    favicon.setAttribute('href', tenant.logo_url)
  }
}

/**
 * Simple helper to darken a hex color by a given percentage
 * @param {string} hex Hex color string (e.g. '#7c3aed' or '7c3aed')
 * @param {number} percent Percentage to darken (0-100)
 * @returns {string} The darkened hex color.
 */
function darkenColor(hex, percent) {
  let cleanHex = hex.replace('#', '')
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('')
  }
  let num = parseInt(cleanHex, 16)
  let r = (num >> 16) - Math.round(2.55 * percent)
  let g = ((num >> 8) & 0x00ff) - Math.round(2.55 * percent)
  let b = (num & 0x0000ff) - Math.round(2.55 * percent)

  r = Math.max(0, Math.min(255, r))
  g = Math.max(0, Math.min(255, g))
  b = Math.max(0, Math.min(255, b))

  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}
