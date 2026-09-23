/**
 * Instant light/dark switch.
 *
 * Hundreds of rules use `transition: all`, so flipping `body.dark` made every
 * card, button and header animate its own background/colour/shadow at its own
 * speed — a patchwork of half-switched elements and ~40 frames of heavy
 * repaints (many of them behind backdrop-filter). That was the "lag".
 *
 * The theme is toggled from several places (App, Header, Login, Register,
 * useTheme), so instead of touching each one this watches the `dark` class on
 * <html> and <body>: when it changes, transitions are disabled for exactly
 * that style recalculation (html.theme-switching, see index.css), the new
 * colours are applied in one paint, and transitions come back next frame.
 */

// Tracked per element: some pages set `dark` on both <html> and <body>, and
// styles key off either one.
const hasDark = () =>
  `${!!document.body?.classList.contains('dark')}|${document.documentElement.classList.contains('dark')}`

export function installInstantThemeSwitch() {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return
  const root = document.documentElement
  let last = hasDark()
  let pending = 0

  const observer = new MutationObserver(() => {
    const now = hasDark()
    if (now === last) return
    last = now
    // Runs as a microtask — before the browser recalculates styles for the
    // class change — so the change is computed with transitions off.
    root.classList.add('theme-switching')
    void window.getComputedStyle(document.body).backgroundColor // commit new styles now
    cancelAnimationFrame(pending)
    pending = requestAnimationFrame(() => {
      pending = requestAnimationFrame(() => root.classList.remove('theme-switching'))
    })
  })

  const opts = { attributes: true, attributeFilter: ['class'] }
  observer.observe(root, opts)
  if (document.body) observer.observe(document.body, opts)
}
