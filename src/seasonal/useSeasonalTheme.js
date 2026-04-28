import { useEffect, useState } from 'react'
import { SEASONAL_THEMES, findThemeForDate, findThemeById } from './themes'

/* ──────────────────────────────────────────────────────────────
   useSeasonalTheme

   Resolves the active seasonal theme from:
     1. localStorage('season-override')  — admin override
        • 'none' → seasonal theming disabled entirely
        • '<id>' → force that theme regardless of date
        • (unset) → automatic by today's date
     2. SEASONAL_THEMES catalogue date ranges

   Side-effect: writes the body class + per-theme CSS vars into a
   single dynamic <style> tag so existing components that read
   --season-accent etc. inherit the new accent without changes.
   ────────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'season-override'
const STYLE_ID    = 'masar-seasonal-vars'

export function useSeasonalTheme() {
  const [theme, setTheme] = useState(() => resolveTheme())

  useEffect(() => {
    // React to override changes from other tabs / the admin toggle.
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setTheme(resolveTheme())
    }
    // Same tab: dispatch a custom event after writing the override.
    const onLocal = () => setTheme(resolveTheme())
    window.addEventListener('storage', onStorage)
    window.addEventListener('masar-season-changed', onLocal)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('masar-season-changed', onLocal)
    }
  }, [])

  // Refresh once at midnight so a theme that just started/ended is
  // picked up without needing a reload. Cheaper than polling.
  useEffect(() => {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setHours(24, 0, 5, 0) // 5s after midnight, just to be safe
    const ms = tomorrow - now
    const t = setTimeout(() => setTheme(resolveTheme()), ms)
    return () => clearTimeout(t)
  }, [theme?.id])

  // Apply body class + CSS vars on every theme change.
  useEffect(() => {
    // Strip any previous season-* class so we don't pile them up.
    const body = document.body
    for (const cls of [...body.classList]) {
      if (cls.startsWith('season-')) body.classList.remove(cls)
    }
    if (theme) body.classList.add(theme.bodyClass)

    // Inject the variable overrides as a scoped rule. Done via a
    // <style> tag instead of inline styles so :hover / pseudo-states
    // can also read the vars and so it survives across components.
    let styleEl = document.getElementById(STYLE_ID)
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = STYLE_ID
      document.head.appendChild(styleEl)
    }
    if (!theme || !theme.vars) {
      styleEl.textContent = ''
    } else {
      const decls = Object.entries(theme.vars)
        .map(([k, v]) => `  ${k}: ${v};`)
        .join('\n')
      styleEl.textContent = `body.${theme.bodyClass} {\n${decls}\n}`
    }
  }, [theme])

  return theme
}

function resolveTheme() {
  let override = null
  try { override = localStorage.getItem(STORAGE_KEY) } catch { /* ignore */ }
  if (override === 'none') return null
  if (override) {
    const t = findThemeById(override)
    if (t) return t
  }
  return findThemeForDate()
}

/* Admin helper — write the override and notify same-tab listeners. */
export function setSeasonOverride(value) {
  try {
    if (!value) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, value)
  } catch { /* ignore quota */ }
  window.dispatchEvent(new Event('masar-season-changed'))
}

export function getSeasonOverride() {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}

export { SEASONAL_THEMES }
