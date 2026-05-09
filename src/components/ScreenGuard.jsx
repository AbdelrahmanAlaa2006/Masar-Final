import { createPortal } from 'react-dom'

/**
 * ScreenGuard — traceable watermark overlay.
 *
 * Earlier versions tried to "prevent" screenshots by blacking the page
 * out on focus loss / PrintScreen / etc. In practice the OS captures
 * those events before the browser sees them, so the blackout was both
 * ineffective and annoying for honest students. We removed it.
 *
 * What remains is the watermark tile: it carries the student's name
 * + phone across the viewport so a leaked screenshot is still
 * traceable to whoever took it. Deterrence + accountability, not
 * impossibility — a phone camera will always defeat any web-side
 * defense, so we accept that and lean on identifiability instead.
 *
 * Props:
 *   active  — toggle the overlay on/off
 *   label   — watermark text (typically "اسم — هاتف")
 *
 *   `strict` is kept in the signature for backwards compatibility but
 *   no longer does anything; both modes render the same watermark.
 */
export default function ScreenGuard({ active = true, label = '' /*, strict */ }) {
  if (!active) return null

  // Build the watermark tile as an inline SVG, repeated as a background
  // image. Subtle enough that it's not annoying while still legible on
  // both light and dark page backgrounds (via mix-blend-mode: difference).
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
  const safeLabel = String(label || '—').replace(/[<>"&']/g, '')
  const tileW = isMobile ? 280 : 420
  const tileH = isMobile ? 160 : 220
  const fontSize = isMobile ? 13 : 15
  // Lower alpha than before — was 0.13–0.20, now 0.06–0.08 so the
  // watermark is visible enough to identify a leaked screenshot but
  // doesn't fight with the actual content while reading/watching.
  const fillAlpha = isMobile ? 0.08 : 0.06
  const tileSvg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${tileH}">
       <text x="50%" y="50%" font-family="Cairo, Arial, sans-serif"
             font-size="${fontSize}" font-weight="700"
             fill="rgba(255,255,255,${fillAlpha})"
             text-anchor="middle" dominant-baseline="middle"
             transform="rotate(-22 ${tileW / 2} ${tileH / 2})">${safeLabel}</text>
     </svg>`
  )

  return createPortal(
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9998,
        backgroundImage: `url("data:image/svg+xml;utf8,${tileSvg}")`,
        backgroundRepeat: 'repeat',
        mixBlendMode: 'difference',
        // Overall layer opacity stacks with the per-tile fillAlpha above.
        // 0.55 here × ~0.07 fill = an effective ~0.04 — very subtle but
        // unmistakable in a screenshot when you zoom in.
        opacity: 0.55,
      }}
    />,
    document.body
  )
}
