import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * ScreenGuard — anti-screenshot / anti-screen-record deterrent.
 *
 * Mount this on screens where we want to discourage capture (exam-taking,
 * video player). It:
 *
 *   1. Tiles a translucent watermark across the viewport carrying the
 *      student's name + phone. Screenshots remain visible but include the
 *      student's identity, so any leak is traceable.
 *   2. Hides the page contents behind a full-screen blackout whenever the
 *      window loses focus / the tab becomes hidden / the cursor leaves
 *      the document. This blocks the most common screen-recording tricks
 *      (sharing the tab to OBS, alt-tabbing, picture-in-picture, etc.).
 *   3. Best-effort intercept of PrintScreen + Windows-Snip / macOS
 *      screenshot shortcuts. Browsers often never see these key events
 *      because the OS captures them first — that's why points 1 and 2
 *      are the real defense.
 *
 * Honest caveat for the developer reading this: a determined attacker
 * with a phone camera can still take a picture of the screen. The goal
 * here is deterrence + traceability, not impossibility.
 *
 * Props:
 *   active  — toggle the entire guard on/off
 *   label   — the watermark text (typically "اسم — هاتف")
 */
export default function ScreenGuard({ active = true, label = '' }) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (!active) return

    // Compute the "page is not really being watched right now" flag from
    // every signal we can read. We treat any of them as "hide content".
    const compute = () => {
      const isHidden = document.hidden || !document.hasFocus()
      setHidden(isHidden)
    }
    compute()

    const onBlur  = () => setHidden(true)
    const onFocus = () => setHidden(document.hidden)
    const onVis   = () => compute()
    const onLeave = () => setHidden(true)
    const onEnter = () => compute()

    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)
    document.addEventListener('mouseleave', onLeave)
    document.addEventListener('mouseenter', onEnter)

    // Best-effort key blocking. Win+Shift+S (Snip), macOS Cmd+Shift+3/4/5,
    // PrintScreen. The OS often consumes these before the browser sees
    // them — we still try, and we wipe the clipboard right after as a
    // small extra obstacle for the rare cases where the event arrives.
    const onKey = (e) => {
      const k = (e.key || '').toLowerCase()
      if (e.key === 'PrintScreen' || k === 'printscreen') {
        e.preventDefault()
        try { navigator.clipboard?.writeText?.('') } catch { /* ignore */ }
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (k === 's' || k === '3' || k === '4' || k === '5')) {
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('keyup', onKey, true)

    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
      document.removeEventListener('mouseleave', onLeave)
      document.removeEventListener('mouseenter', onEnter)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('keyup', onKey, true)
    }
  }, [active])

  if (!active) return null

  // Build the watermark tile as an inline SVG. Repeated as a background
  // image — survives screenshots since it's part of the rendered DOM.
  const safeLabel = String(label || '—').replace(/[<>"&']/g, '')
  const tileSvg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="240">
       <text x="50%" y="50%" font-family="Cairo, Arial, sans-serif"
             font-size="18" font-weight="700"
             fill="rgba(255,255,255,0.10)"
             text-anchor="middle" dominant-baseline="middle"
             transform="rotate(-22 210 120)">${safeLabel}</text>
     </svg>`
  )

  return createPortal(
    <>
      {/* ── Watermark tile (always visible while guard is active) ── */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 9998,
          backgroundImage: `url("data:image/svg+xml;utf8,${tileSvg}")`,
          backgroundRepeat: 'repeat',
          // mix-blend-mode keeps the watermark legible on both light and
          // dark backgrounds without being so opaque that it blocks UI.
          mixBlendMode: 'difference',
          opacity: 0.9,
        }}
      />

      {/* ── Blackout panel (only when window/tab is unfocused) ───── */}
      <div
        role="alert"
        aria-live="polite"
        style={{
          position: 'fixed',
          inset: 0,
          background: '#0f172a',
          color: '#fff',
          zIndex: 99999,
          display: hidden ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          fontFamily: "'Cairo', system-ui, sans-serif",
          textAlign: 'center',
          padding: 24,
          // Backdrop blur as belt-and-braces in case the browser still
          // composites under the panel during the show transition.
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
        dir="rtl"
      >
        <i className="fas fa-eye-slash"
           style={{ fontSize: 56, color: '#f59e0b', marginBottom: 18 }} />
        <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800 }}>
          المحتوى موقوف
        </h2>
        <p style={{ margin: 0, opacity: 0.85, maxWidth: 420 }}>
          لا يمكن التقاط الشاشة أو تسجيلها أثناء هذه الصفحة.
          عُد إلى التبويب لمتابعة المشاهدة.
        </p>
      </div>
    </>,
    document.body
  )
}
