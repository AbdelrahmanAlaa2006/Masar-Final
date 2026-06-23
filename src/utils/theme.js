/**
 * Dynamically applies the tenant's theme configuration (colors, title, logo)
 * to the document root, headers, and browser window.
 * @param {Object} tenant The resolved tenant database row.
 * @param {Object} themeConfig The resolved tenant theme config module.
 */
export function applyTenantTheme(tenant, themeConfig) {
  if (!tenant || !themeConfig) return
  const primary = themeConfig.primaryColor || tenant.primary_color || '#7c3aed'
  const secondary = themeConfig.secondaryColor || tenant.secondary_color || '#06b6d4'

  const root = document.documentElement

  // Apply tenant theme class to document.body (so overrides apply site-wide)
  const body = document.body
  const tenantThemeClasses = [
    'aa-chem-theme', 'aa-phys-theme', 'aa-math-theme', 'aa-bio-theme',
    'aa-science-theme', 'aa-geo-theme', 'aa-english-theme',
    'aa-humanities-theme', 'aa-cyber-theme', 'aa-power-theme', 'aa-default-theme'
  ]
  tenantThemeClasses.forEach(cls => body.classList.remove(cls))
  if (themeConfig.themeClass) {
    body.classList.add(themeConfig.themeClass)
  }

  // Set branding color variables
  root.style.setProperty('--primary', primary)
  root.style.setProperty('--secondary', secondary)

  // Remove dynamic font family override (keep default)
  const styleEl = document.getElementById('tenant-dynamic-font')
  if (styleEl) styleEl.remove()
  const fontLink = document.getElementById('tenant-font-link')
  if (fontLink) fontLink.remove()

  // Set background color variable
  const bgColor = tenant.config?.bg_color || '#f0f2f8'
  root.style.setProperty('--bg-color', bgColor)

  // Add dynamic opacity-scaled variables for shadows, glows, and hover effects
  root.style.setProperty('--primary-soft', primary + '1a') // 10% opacity
  root.style.setProperty('--secondary-soft', secondary + '14') // 8% opacity
  root.style.setProperty('--primary-glow', primary + '40') // 25% opacity


  // Dynamically compute hover color (darken primary by ~12%)
  const hoverColor = darkenColor(primary, 12)
  root.style.setProperty('--primary-hover', hoverColor)

  // Dynamically compute dark mode theme colors from primary
  const rgb = hexToRgb(primary)
  if (rgb) {
    // Mix with neutral slate dark background base (#030712 => rgb(3, 7, 18))
    const bgR = Math.round(3 * 0.92 + rgb.r * 0.08)
    const bgG = Math.round(7 * 0.92 + rgb.g * 0.08)
    const bgB = Math.round(18 * 0.92 + rgb.b * 0.08)
    const bgHex = rgbToHex(bgR, bgG, bgB)

    // Mix with card neutral dark surface base (#0d1527 => rgb(13, 21, 39))
    const cardR = Math.round(13 * 0.88 + rgb.r * 0.12)
    const cardG = Math.round(21 * 0.88 + rgb.g * 0.12)
    const cardB = Math.round(39 * 0.88 + rgb.b * 0.12)
    const cardHex = rgbToHex(cardR, cardG, cardB)
    const cardBgRgbStr = `rgba(${cardR}, ${cardG}, ${cardB}, 0.85)`

    root.style.setProperty('--dynamic-background', bgHex)
    root.style.setProperty('--dynamic-surface', cardHex)
    root.style.setProperty('--dynamic-card', cardHex)
    root.style.setProperty('--dynamic-border', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`)

    root.style.setProperty('--dynamic-section-bg-1', bgHex)
    root.style.setProperty('--dynamic-section-bg-2', darkenColor(bgHex, 3))
    root.style.setProperty('--dynamic-footer-bg', darkenColor(bgHex, 6))

    root.style.setProperty('--dynamic-card-bg', cardBgRgbStr)
    root.style.setProperty('--dynamic-card-border', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`)
    root.style.setProperty('--dynamic-card-shadow', `0 24px 70px rgba(0, 0, 0, 0.45), 0 8px 24px ${primary}1a, 0 0 0 1px ${primary}26, inset 0 1px 0 rgba(255, 255, 255, 0.08)`)

    root.style.setProperty('--dynamic-card-text', '#f8fafc')
    root.style.setProperty('--dynamic-card-text-soft', '#cbd5e1')
    root.style.setProperty('--dynamic-card-muted', '#94a3b8')
    root.style.setProperty('--dynamic-remember-text', '#cbd5e1')
    root.style.setProperty('--dynamic-footer-text', '#64748b')
    root.style.setProperty('--dynamic-tab-inactive', '#94a3b8')

    root.style.setProperty('--dynamic-tab-active-bg', `linear-gradient(135deg, ${primary}26, rgba(255, 255, 255, 0.05))`)
  }

  // Update browser window tab title
  document.title = tenant.name

  // Update meta theme-color for mobile browser address bars
  let metaTheme = document.querySelector('meta[name="theme-color"]')
  if (!metaTheme) {
    metaTheme = document.createElement('meta')
    metaTheme.setAttribute('name', 'theme-color')
    document.head.appendChild(metaTheme)
  }
  metaTheme.setAttribute('content', primary)

  // Update tab icon (favicon) if a tenant custom logo is provided
  const dbLogo = tenant.logo_url && !tenant.logo_url.includes('3081840') ? tenant.logo_url : null
  if (dbLogo) {
    let favicon = document.querySelector('link[rel="icon"]')
    if (!favicon) {
      favicon = document.createElement('link')
      favicon.setAttribute('rel', 'icon')
      document.head.appendChild(favicon)
    }
    favicon.setAttribute('href', dbLogo)
    favicon.removeAttribute('type')
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

/**
 * Converts a hex color to RGB parts
 * @param {string} hex 
 * @returns {Object|null}
 */
function hexToRgb(hex) {
  let cleanHex = hex.replace('#', '')
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('')
  }
  const num = parseInt(cleanHex, 16)
  if (isNaN(num)) return null
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  }
}

/**
 * Converts RGB components to Hex format
 * @param {number} r 
 * @param {number} g 
 * @param {number} b 
 * @returns {string}
 */
function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}

