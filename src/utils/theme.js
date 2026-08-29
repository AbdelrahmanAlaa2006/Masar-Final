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
    'aa-humanities-theme', 'aa-cyber-theme', 'aa-power-theme',
    'aa-mohamed-yasser-theme', 'aa-default-theme'
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

  // Set background color variable (warm paper default — the old #f0f2f8 was
  // a cold bright white that strained the eyes; config.theme.bg_light or the
  // legacy config.bg_color still override per tenant)
  const bgColor = tenant.config?.theme?.bg_light || tenant.config?.bg_color || '#f5f3ee'
  root.style.setProperty('--bg-color', bgColor)
  // Several page stylesheets (Home, Videos, Exams, Header…) redefine
  // --bg-secondary at :root with cold near-whites and paint the body with it.
  // Pinning it inline here wins over all of those in light mode; dark mode is
  // unaffected because their body.dark blocks redefine it closer to the body.
  root.style.setProperty('--bg-secondary', bgColor)
  // The login/landing page reads --background (its .dark block re-wins in
  // dark mode), so the tenant's light background applies there too.
  root.style.setProperty('--background', bgColor)

  // Warm the light-mode surfaces to match the paper background: cards, the
  // control-panel cards, and the sticky header. Same inline-pin trick — the
  // page stylesheets declare these at :root with pure white, and their dark
  // values live under body.dark (which wins over root-inline), so dark mode
  // is untouched. Tenants can override via config.theme.card_light.
  const cardLight = tenant.config?.theme?.card_light || '#fdfbf6'
  root.style.setProperty('--card-bg', cardLight)
  root.style.setProperty('--cp-card-bg', cardLight)
  root.style.setProperty('--mh-bg', 'rgba(252, 250, 245, 0.8)')
  root.style.setProperty('--mh-bg-solid', '#faf8f2')
  root.style.setProperty('--mh-border', 'rgba(64, 55, 42, 0.09)')

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

  // DB-driven theme token overrides (tenants.config.theme). The computed
  // values above only tint a fixed slate base with the primary color, which is
  // why every tenant's dark mode converges to near-navy. Tokens set here win
  // over the computed defaults, letting a tenant truly restyle backgrounds and
  // surfaces from the database with zero code changes. All optional — tenants
  // without config.theme keep the exact behavior above.
  const tokens = tenant.config?.theme || {}
  const TOKEN_MAP = {
    // light mode page background (already existed as config.bg_color)
    bg_light: ['--bg-color', '--bg-secondary', '--background'],
    // dark mode page background (body.dark) + sections derived from it
    bg_dark: ['--bg-dark', '--dynamic-background', '--dynamic-section-bg-1'],
    // light mode card/surface color
    card_light: ['--card-bg', '--cp-card-bg'],
    // dark mode card/surface color
    card_dark: ['--dynamic-surface', '--dynamic-card', '--dynamic-card-bg'],
    // dark mode footer background
    footer_dark: ['--dynamic-footer-bg'],
    // accent border color for cards/dividers
    border_accent: ['--dynamic-border', '--dynamic-card-border'],
    // main text color on dark surfaces
    text_dark: ['--dynamic-card-text'],
  }
  for (const [token, vars] of Object.entries(TOKEN_MAP)) {
    const value = typeof tokens[token] === 'string' ? tokens[token].trim() : ''
    if (!value) continue
    const isPlainColor = value.startsWith('#') || value.startsWith('rgb') || value.startsWith('hsl') || value.startsWith('oklch')
    vars.forEach(v => {
      // --bg-dark backs a `background:` rule so gradients are fine there; the
      // --dynamic-* vars are consumed as plain colors and must stay colors.
      if (v === '--bg-dark' || isPlainColor) root.style.setProperty(v, value)
    })
  }
  if (typeof tokens.bg_dark === 'string' && tokens.bg_dark.trim().startsWith('#')) {
    root.style.setProperty('--dynamic-section-bg-2', darkenColor(tokens.bg_dark.trim(), 3))
    if (!tokens.footer_dark) {
      root.style.setProperty('--dynamic-footer-bg', darkenColor(tokens.bg_dark.trim(), 6))
    }
  }

  // The inline vars above live on <html> — but the app's stylesheets redefine
  // the same variables ON <body> (e.g. ControlPanel.css `body.dark {
  // --cp-card-bg: #1e293b }`), and a variable defined on body always shadows
  // one inherited from html. That's why DB theme tokens looked "not
  // impactful": light mode half-worked, dark mode stayed navy everywhere.
  // The real fix: a runtime stylesheet appended LAST in <head>, targeting
  // body.dark / body:not(.dark) directly with !important — same element,
  // later source order, higher importance → it wins over every bundled rule.
  applyThemeTokenStylesheet(tokens)

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

  // Update tab icon (favicon) ONLY if a tenant custom logo or explicit faviconUrl is provided
  const dbLogo = tenant.logo_url && !tenant.logo_url.includes('3081840') ? tenant.logo_url : null
  const faviconUrl = themeConfig.faviconUrl || dbLogo || themeConfig.logoUrl || null
  const blankFavicon = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>"

  let favicon = document.querySelector('link[rel="icon"]')
  if (!favicon) {
    favicon = document.createElement('link')
    favicon.setAttribute('rel', 'icon')
    document.head.appendChild(favicon)
  }
  favicon.setAttribute('href', faviconUrl || blankFavicon)
  favicon.removeAttribute('type')

  let appleIcon = document.querySelector('link[rel="apple-touch-icon"]')
  if (faviconUrl) {
    if (!appleIcon) {
      appleIcon = document.createElement('link')
      appleIcon.setAttribute('rel', 'apple-touch-icon')
      document.head.appendChild(appleIcon)
    }
    appleIcon.setAttribute('href', faviconUrl)
  } else if (appleIcon) {
    appleIcon.remove()
  }
}

/**
 * Generates the runtime override stylesheet from tenants.config.theme tokens.
 *
 * Why a stylesheet and not inline vars: the bundled CSS redefines the theme
 * variables ON body (ControlPanel.css `body.dark { --cp-card-bg: #1e293b }`,
 * page-level `.dark` blocks, theme-class rules with !important). A variable
 * defined on body shadows anything set inline on <html>, so DB tokens never
 * reached dark mode. This element is appended LAST in <head> and targets
 * body.dark / body:not(.dark) directly with !important — same element,
 * later source order, same importance → the tenant's tokens always win.
 *
 * From 4–6 tokens it derives the full family (hover/input/list/header
 * shades, muted text, translucent header) so a tenant restyle needs no
 * code and no exhaustive token list.
 */
function applyThemeTokenStylesheet(tokens) {
  const existing = document.getElementById('tenant-theme-overrides')
  const clean = (v) => (typeof v === 'string' ? v.trim().replace(/[;{}]/g, '') : '')
  const bgL = clean(tokens.bg_light)
  const cardL = clean(tokens.card_light)
  const txtL = clean(tokens.text_light)
  const bgD = clean(tokens.bg_dark)
  const cardD = clean(tokens.card_dark)
  const txtD = clean(tokens.text_dark)
  const borderA = clean(tokens.border_accent)

  // No tokens → no overrides (tenant keeps the computed defaults).
  if (!bgL && !cardL && !txtL && !bgD && !cardD && !txtD && !borderA) {
    if (existing) existing.remove()
    return
  }

  const isHex = (v) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)
  const rgba = (hex, a) => {
    const c = hexToRgb(hex)
    return c ? `rgba(${c.r}, ${c.g}, ${c.b}, ${a})` : hex
  }

  let light = ''
  if (bgL) {
    light += `background:${bgL} !important;--bg-color:${bgL} !important;--background:${bgL} !important;--bg-secondary:${bgL} !important;--cp-bg:${bgL} !important;--cp-bg-image:none !important;`
  }
  if (cardL) {
    // --section-card-bg is the login page's own card variable.
    light += `--card-bg:${cardL} !important;--cp-card-bg:${cardL} !important;--surface:${cardL} !important;--cp-select-bg:${cardL} !important;--cp-list-item-bg:${cardL} !important;--cp-input-bg:${cardL} !important;--section-card-bg:${cardL} !important;`
    if (isHex(cardL)) {
      light += `--cp-card-hover-bg:${darkenColor(cardL, 4)} !important;--cp-list-header-bg:${darkenColor(cardL, 3)} !important;`
    }
  }
  if (txtL) {
    // --section-text / --card-text are the login page's own text variables.
    light += `--cp-text-main:${txtL} !important;--text-color:${txtL} !important;--cp-input-text:${txtL} !important;--cp-select-text:${txtL} !important;--section-text:${txtL} !important;`
    if (isHex(txtL)) {
      light += `--cp-text-muted:${rgba(txtL, 0.6)} !important;`
    }
  }

  let dark = ''
  if (bgD) {
    // background: accepts gradients too; the derived color vars need a hex.
    dark += `background:${bgD} !important;--bg-dark:${bgD} !important;--cp-bg-image:none !important;`
    if (isHex(bgD)) {
      dark += `--background:${bgD} !important;--bg-secondary:${bgD} !important;--bg-color:${bgD} !important;--cp-bg:${bgD} !important;`
        + `--dynamic-background:${bgD} !important;--dynamic-section-bg-1:${bgD} !important;`
        + `--dynamic-section-bg-2:${darkenColor(bgD, 3)} !important;--dynamic-footer-bg:${darkenColor(bgD, 6)} !important;`
    }
  }
  if (cardD) {
    dark += `--card-bg:${cardD} !important;--cp-card-bg:${cardD} !important;--surface:${cardD} !important;`
      + `--dynamic-card:${cardD} !important;--dynamic-surface:${cardD} !important;`
      + `--cp-select-bg:${cardD} !important;--cp-list-item-bg:${cardD} !important;`
    if (isHex(cardD)) {
      dark += `--dynamic-card-bg:${rgba(cardD, 0.9)} !important;--cp-card-hover-bg:${darkenColor(cardD, 4)} !important;`
        + `--cp-input-bg:${darkenColor(cardD, 5)} !important;--cp-list-header-bg:${darkenColor(cardD, 5)} !important;`
        + `--mh-bg:${rgba(cardD, 0.8)} !important;--mh-bg-solid:${cardD} !important;--section-card-bg:${rgba(cardD, 0.5)} !important;`
    }
  }
  if (txtD) {
    dark += `--cp-text-main:${txtD} !important;--text-color:${txtD} !important;--dynamic-card-text:${txtD} !important;`
      + `--cp-input-text:${txtD} !important;--cp-select-text:${txtD} !important;--section-text:${txtD} !important;`
    if (isHex(txtD)) {
      dark += `--cp-text-muted:${rgba(txtD, 0.62)} !important;--dynamic-card-text-soft:${rgba(txtD, 0.8)} !important;--dynamic-card-muted:${rgba(txtD, 0.6)} !important;`
    }
  }
  if (borderA) {
    dark += `--cp-card-border:${borderA} !important;--cp-divider:${borderA} !important;`
      + `--dynamic-border:${borderA} !important;--dynamic-card-border:${borderA} !important;--cp-input-border:${borderA} !important;`
  }

  let css = ''
  if (light) css += `body:not(.dark){${light}}`
  if (dark) css += `body.dark{${dark}}`

  const el = existing || document.createElement('style')
  el.id = 'tenant-theme-overrides'
  el.textContent = css
  // Append (or move) to the END of <head> so source order beats every
  // bundled stylesheet, including theme-class !important rules.
  document.head.appendChild(el)
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

