import { useEffect, useRef, useState } from 'react'
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
 *      the document / a known screenshot shortcut is pressed. Once the
 *      blackout is shown it stays up for a minimum dwell time AND
 *      requires an explicit user click on the "متابعة" button to dismiss.
 *      That kills the "click anywhere → content reappears" hole the
 *      previous version had: a screen recorder or Snipping Tool that
 *      briefly steals focus can no longer be cleared by an accidental
 *      mouse click.
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
 *   strict  — when true (default, used for exams), ANY focus/visibility
 *             loss or cursor-leave arms the blackout. When false (used
 *             for the videos page), only explicit screenshot keys
 *             (PrintScreen / Win+Shift+S / macOS Cmd+Shift+3-4-5) do.
 *             A student moving the cursor off the window or briefly
 *             alt-tabbing won't black the page out in lenient mode.
 */

// How long the blackout stays up at minimum after a danger signal,
// even after focus is fully restored. Long enough that a Snipping
// Tool capture window grabs the blackout, not the content.
const MIN_HIDE_MS = 2000

export default function ScreenGuard({ active = true, label = '', strict = true }) {
  const [hidden, setHidden]     = useState(false)
  // Tracks whether the user has explicitly acknowledged the blackout
  // by clicking "متابعة". Until they do, focus alone won't dismiss it.
  const acknowledgedRef = useRef(true)
  // Earliest wall-clock time at which dismissal is allowed.
  const lockUntilRef = useRef(0)

  useEffect(() => {
    if (!active) return

    // Every danger signal funnels through here. Sets hidden=true,
    // arms the dwell-time lock, and clears the user's prior ack.
    const trigger = () => {
      lockUntilRef.current = Date.now() + MIN_HIDE_MS
      acknowledgedRef.current = false
      setHidden(true)
    }

    // Strict mode: any focus/visibility/cursor signal arms the blackout.
    // Lenient mode (videos): we ignore those — the cursor leaving the
    // window or a brief alt-tab is not a capture attempt — and rely on
    // the screenshot-key handler below as the only trigger.
    let onBlur, onVis, onLeave
    if (strict) {
      // Initial state: visible if the page is already focused & onscreen.
      const isUnsafe = () => document.hidden || !document.hasFocus()
      if (isUnsafe()) trigger()

      onBlur  = () => trigger()
      onVis   = () => { if (document.hidden) trigger() }
      onLeave = () => trigger()
      // Note: we deliberately don't attach focus/mouseenter listeners.
      // The blackout is sticky and only the "متابعة" button can clear
      // it, so there's nothing those events would need to do.
      window.addEventListener('blur', onBlur)
      document.addEventListener('visibilitychange', onVis)
      document.addEventListener('mouseleave', onLeave)
    }

    // Best-effort key blocking. Win+Shift+S (Snip), macOS Cmd+Shift+3/4/5,
    // PrintScreen. The OS often consumes these before the browser sees
    // them — when we DO see them we proactively trigger the blackout
    // and wipe the clipboard so any captured pixels land on a black
    // panel and the clipboard ends up empty.
    const onKey = (e) => {
      const k = (e.key || '').toLowerCase()
      if (e.key === 'PrintScreen' || k === 'printscreen') {
        e.preventDefault()
        trigger()
        try { navigator.clipboard?.writeText?.('') } catch { /* ignore */ }
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (k === 's' || k === '3' || k === '4' || k === '5')) {
        e.preventDefault()
        trigger()
      }
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('keyup', onKey, true)

    return () => {
      if (strict) {
        window.removeEventListener('blur', onBlur)
        document.removeEventListener('visibilitychange', onVis)
        document.removeEventListener('mouseleave', onLeave)
      }
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('keyup', onKey, true)
    }
  }, [active, strict])

  // Dismiss handler — only succeeds when the dwell-time lock has
  // elapsed AND the page is currently focused. Otherwise we re-arm
  // the lock so another click is needed.
  const tryDismiss = () => {
    const now = Date.now()
    if (now < lockUntilRef.current || document.hidden || !document.hasFocus()) {
      // Re-arm: keep the user from spamming the button while the
      // capture window is still likely open.
      lockUntilRef.current = Math.max(lockUntilRef.current, now + 800)
      return
    }
    acknowledgedRef.current = true
    setHidden(false)
  }

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

      {/* ── Blackout panel (sticky until user clicks متابعة) ─────── */}
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
        <p style={{ margin: 0, opacity: 0.85, maxWidth: 420, marginBottom: 18 }}>
          تم رصد محاولة التقاط للشاشة أو خروج عن النافذة.
          اضغط «متابعة» للعودة إلى المحتوى.
        </p>
        <button
          type="button"
          onClick={tryDismiss}
          style={{
            background: '#f59e0b',
            color: '#0f172a',
            border: 0,
            padding: '12px 28px',
            borderRadius: 12,
            fontWeight: 800,
            fontSize: 16,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          متابعة
        </button>
      </div>
    </>,
    document.body
  )
}
