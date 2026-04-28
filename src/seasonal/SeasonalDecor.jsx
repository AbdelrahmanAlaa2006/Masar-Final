import React, { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSeasonalTheme } from './useSeasonalTheme'
import './SeasonalDecor.css'

/* ──────────────────────────────────────────────────────────────
   SeasonalDecor — the ambient overlay layer.

   Mounted once at the app root. Listens to the active seasonal
   theme and renders the matching decor variant. The whole layer
   is pointer-events:none and aria-hidden, so it never interferes
   with the actual UI. Themes can opt out per-route via the
   `suppress` prop (we pass true on /exam-taking).
   ────────────────────────────────────────────────────────────── */

export default function SeasonalDecor({ suppress = false }) {
  const theme = useSeasonalTheme()

  if (!theme || suppress) return null

  return createPortal(
    <div
      className={`season-decor season-decor-${theme.decor}`}
      aria-hidden="true"
    >
      {theme.decor === 'ramadan'   && <RamadanDecor />}
      {theme.decor === 'eid-fitr'  && <EidFitrDecor />}
      {theme.decor === 'eid-adha'  && <EidAdhaDecor />}
      {theme.decor === 'christmas' && <ChristmasDecor />}
    </div>,
    document.body
  )
}

/* ── Ramadan ── crescent moon corner + drifting lanterns ────── */
function RamadanDecor() {
  // 3 lanterns at staggered horizontal positions and animation delays
  // so the loop never feels synchronised. Memoised so re-renders
  // don't restart their animations.
  const lanterns = useMemo(() => ([
    { left: '12%', delay: '0s',   duration: '14s', scale: 1.0, swing: 'lantern-swing-a' },
    { left: '52%', delay: '5s',   duration: '17s', scale: 0.85, swing: 'lantern-swing-b' },
    { left: '82%', delay: '9s',   duration: '15s', scale: 0.95, swing: 'lantern-swing-a' },
  ]), [])
  return (
    <>
      <Crescent />
      {lanterns.map((l, i) => (
        <Lantern key={i} {...l} />
      ))}
    </>
  )
}

function Crescent() {
  return (
    <svg
      className="season-crescent"
      viewBox="0 0 100 100"
      width="120" height="120"
    >
      <defs>
        <radialGradient id="crescent-glow" cx="55%" cy="45%" r="55%">
          <stop offset="0%"  stopColor="#fff7d8" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#c9a45a" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#7c5cff" stopOpacity="0.70" />
        </radialGradient>
      </defs>
      <path
        d="M50 8 a42 42 0 1 0 28 74 a34 34 0 1 1 -28 -74 z"
        fill="url(#crescent-glow)"
      />
    </svg>
  )
}

function Lantern({ left, delay, duration, scale, swing }) {
  return (
    <div
      className="season-lantern"
      style={{
        left,
        animationDelay: delay,
        animationDuration: duration,
        transform: `scale(${scale})`,
      }}
    >
      <div className={`season-lantern-swing ${swing}`}>
        <svg viewBox="0 0 60 100" width="42" height="70">
          {/* hook + cap */}
          <path d="M30 0 v10" stroke="#c9a45a" strokeWidth="2" fill="none" />
          <rect x="22" y="10" width="16" height="6" rx="1.5" fill="#c9a45a" />
          {/* body */}
          <path
            d="M14 18 q16 -10 32 0 v40 q-16 14 -32 0 z"
            fill="rgba(124, 92, 255, 0.55)"
            stroke="#c9a45a"
            strokeWidth="1.5"
          />
          {/* glow */}
          <ellipse cx="30" cy="38" rx="11" ry="14" fill="#fff2bf" opacity="0.65" />
          {/* base */}
          <rect x="20" y="62" width="20" height="6" fill="#c9a45a" />
          <path d="M30 70 v18" stroke="#c9a45a" strokeWidth="1.5" />
          <path d="M26 88 h8 m-7 4 h6 m-5 4 h4" stroke="#c9a45a" strokeWidth="1" />
        </svg>
      </div>
    </div>
  )
}

/* ── Eid al-Fitr ── drifting kahk cookies ──────────────────── */
function EidFitrDecor() {
  // Diagonal-drifting kahk silhouettes — low opacity, never heavy.
  const cookies = useMemo(() => ([
    { left: '8%',  delay: '0s',   duration: '22s', size: 28 },
    { left: '28%', delay: '7s',   duration: '26s', size: 22 },
    { left: '55%', delay: '3s',   duration: '24s', size: 30 },
    { left: '78%', delay: '11s',  duration: '28s', size: 24 },
    { left: '92%', delay: '15s',  duration: '23s', size: 26 },
  ]), [])
  return (
    <>
      {cookies.map((c, i) => (
        <Kahk key={i} {...c} />
      ))}
    </>
  )
}

function Kahk({ left, delay, duration, size }) {
  return (
    <div
      className="season-kahk"
      style={{
        left,
        animationDelay: delay,
        animationDuration: duration,
        width: size,
        height: size,
      }}
    >
      <svg viewBox="0 0 40 40" width={size} height={size}>
        {/* outer cookie */}
        <circle cx="20" cy="20" r="18" fill="#e2b07a" opacity="0.55" />
        <circle cx="20" cy="20" r="18" fill="none" stroke="#c98a4d" strokeWidth="0.8" opacity="0.7" />
        {/* dotted pattern (powdered-sugar feel) */}
        {[
          [20, 8], [12, 12], [28, 12], [8, 20], [32, 20],
          [12, 28], [28, 28], [20, 32], [20, 20],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="1.4" fill="#fff" opacity="0.9" />
        ))}
      </svg>
    </div>
  )
}

/* ── Eid al-Adha ── static arabesque corner pattern ─────────── */
function EidAdhaDecor() {
  // Two corner ornaments + a soft "polite" glow band. No animation.
  return (
    <>
      <ArabesqueCorner position="top-start" />
      <ArabesqueCorner position="bottom-end" />
    </>
  )
}

function ArabesqueCorner({ position }) {
  return (
    <svg
      className={`season-arabesque season-arabesque-${position}`}
      viewBox="0 0 200 200"
      width="220" height="220"
    >
      <defs>
        <radialGradient id="ar-glow" cx="50%" cy="50%" r="60%">
          <stop offset="0%"  stopColor="#1f7a52" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#1f7a52" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="100" fill="url(#ar-glow)" />
      {/* eight-point star + petals — classic islamic ornament */}
      <g
        transform="translate(100 100)"
        stroke="#c9a45a"
        strokeWidth="1.2"
        fill="none"
        opacity="0.55"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <g key={i} transform={`rotate(${i * 45})`}>
            <path d="M0 -70 L18 -22 L70 0 L18 22 L0 70 L-18 22 L-70 0 L-18 -22 Z" />
            <circle r="36" />
            <path d="M0 -56 L8 -10 L56 0 L8 10 L0 56" opacity="0.6" />
          </g>
        ))}
        <circle r="14" fill="#c9a45a" opacity="0.25" stroke="none" />
      </g>
    </svg>
  )
}

/* ── Christmas / Winter ── snowfall + sparkles ────────────── */
function ChristmasDecor() {
  // Generate ~24 snowflakes with randomised positions, sizes,
  // durations and delays. Memoised so the random seed is stable
  // across re-renders.
  const flakes = useMemo(() => {
    const out = []
    for (let i = 0; i < 24; i++) {
      const size = 6 + Math.random() * 10
      out.push({
        left: `${Math.random() * 100}%`,
        delay: `${-Math.random() * 18}s`, // negative → already mid-fall on mount
        duration: `${10 + Math.random() * 14}s`,
        size,
        opacity: 0.45 + Math.random() * 0.45,
        drift: Math.random() < 0.5 ? 'snow-drift-a' : 'snow-drift-b',
      })
    }
    return out
  }, [])

  // 4 corner sparkles on a slow loop. Pure CSS scale + opacity.
  const sparkles = ['top-start', 'top-end', 'bottom-start', 'bottom-end']

  return (
    <>
      {flakes.map((f, i) => (
        <Snowflake key={i} {...f} />
      ))}
      {sparkles.map((p) => <Sparkle key={p} position={p} />)}
    </>
  )
}

function Snowflake({ left, delay, duration, size, opacity, drift }) {
  return (
    <div
      className={`season-snowflake ${drift}`}
      style={{
        left,
        width: size,
        height: size,
        opacity,
        animationDelay: delay,
        animationDuration: duration,
      }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <g stroke="#e0f2fe" strokeWidth="1.4" strokeLinecap="round" fill="none">
          <path d="M12 2 V22 M2 12 H22 M5 5 L19 19 M19 5 L5 19" />
          <path d="M12 6 L10 8 M12 6 L14 8 M12 18 L10 16 M12 18 L14 16" />
          <path d="M6 12 L8 10 M6 12 L8 14 M18 12 L16 10 M18 12 L16 14" />
        </g>
      </svg>
    </div>
  )
}

function Sparkle({ position }) {
  return (
    <svg
      className={`season-sparkle season-sparkle-${position}`}
      viewBox="0 0 40 40"
      width="44" height="44"
    >
      <g fill="#7dd3fc">
        <path d="M20 0 L22 18 L40 20 L22 22 L20 40 L18 22 L0 20 L18 18 Z" opacity="0.85" />
      </g>
    </svg>
  )
}
