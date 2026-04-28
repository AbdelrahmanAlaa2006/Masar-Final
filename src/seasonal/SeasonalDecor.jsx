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

   The decor here is intentionally bigger/denser than a "subtle
   garnish" — the user wanted the seasonal feel to register.
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

/* ── Ramadan ── big crescent + many lanterns + sky stars ─── */
function RamadanDecor() {
  // 6 lanterns at varied positions and durations — non-synced.
  const lanterns = useMemo(() => ([
    { left:  '6%', delay:  '0s',  duration: '15s', scale: 1.10, swing: 'lantern-swing-a' },
    { left: '22%', delay:  '6s',  duration: '18s', scale: 0.85, swing: 'lantern-swing-b' },
    { left: '40%', delay:  '2s',  duration: '20s', scale: 1.00, swing: 'lantern-swing-a' },
    { left: '58%', delay:  '9s',  duration: '17s', scale: 0.92, swing: 'lantern-swing-b' },
    { left: '76%', delay:  '4s',  duration: '19s', scale: 1.05, swing: 'lantern-swing-a' },
    { left: '90%', delay: '11s',  duration: '16s', scale: 0.80, swing: 'lantern-swing-b' },
  ]), [])

  // ~14 twinkling stars in the upper third — gives the "Ramadan
  // night sky" feel even without a heavy backdrop.
  const stars = useMemo(() => {
    const out = []
    for (let i = 0; i < 14; i++) {
      out.push({
        top:    `${Math.random() * 35}%`,
        left:   `${Math.random() * 100}%`,
        delay:  `${Math.random() * 4}s`,
        size:   3 + Math.random() * 4,
      })
    }
    return out
  }, [])

  return (
    <>
      <div className="season-night-tint" />
      <Crescent />
      {stars.map((s, i) => <Star key={i} {...s} />)}
      {lanterns.map((l, i) => <Lantern key={i} {...l} />)}
    </>
  )
}

function Crescent() {
  return (
    <svg
      className="season-crescent"
      viewBox="0 0 100 100"
      width="180" height="180"
    >
      <defs>
        <radialGradient id="crescent-glow" cx="55%" cy="45%" r="55%">
          <stop offset="0%"  stopColor="#fff7d8" stopOpacity="1" />
          <stop offset="60%" stopColor="#c9a45a" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#7c5cff" stopOpacity="0.80" />
        </radialGradient>
      </defs>
      <path
        d="M50 8 a42 42 0 1 0 28 74 a34 34 0 1 1 -28 -74 z"
        fill="url(#crescent-glow)"
      />
    </svg>
  )
}

function Star({ top, left, delay, size }) {
  return (
    <div
      className="season-star"
      style={{
        top, left,
        width: size, height: size,
        animationDelay: delay,
      }}
    />
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
        ['--scale']: scale,
      }}
    >
      <div className={`season-lantern-swing ${swing}`}>
        <svg viewBox="0 0 60 100" width="56" height="92">
          {/* hook + cap */}
          <path d="M30 0 v10" stroke="#c9a45a" strokeWidth="2" fill="none" />
          <rect x="22" y="10" width="16" height="6" rx="1.5" fill="#c9a45a" />
          {/* body */}
          <path
            d="M14 18 q16 -10 32 0 v40 q-16 14 -32 0 z"
            fill="rgba(124, 92, 255, 0.65)"
            stroke="#c9a45a"
            strokeWidth="1.8"
          />
          {/* glow */}
          <ellipse cx="30" cy="38" rx="11" ry="14" fill="#fff2bf" opacity="0.85" />
          {/* ornament strokes */}
          <path d="M14 32 h32 M14 48 h32" stroke="#c9a45a" strokeWidth="1" opacity="0.85" />
          {/* base */}
          <rect x="20" y="62" width="20" height="6" fill="#c9a45a" />
          <path d="M30 70 v18" stroke="#c9a45a" strokeWidth="1.5" />
          {/* tassels */}
          <path d="M26 88 h8 m-7 4 h6 m-5 4 h4" stroke="#c9a45a" strokeWidth="1" />
        </svg>
      </div>
    </div>
  )
}


/* ── Eid al-Fitr ── kahk + warm confetti dots ──────────── */
function EidFitrDecor() {
  // 8 kahk silhouettes drifting down on long arcs.
  const cookies = useMemo(() => {
    const out = []
    const positions = ['6%', '18%', '32%', '46%', '60%', '74%', '85%', '94%']
    for (let i = 0; i < positions.length; i++) {
      out.push({
        left: positions[i],
        delay: `${-Math.random() * 16}s`,
        duration: `${22 + Math.random() * 10}s`,
        size: 26 + Math.random() * 16,
        rotateA: Math.floor(Math.random() * 360),
        rotateB: 360 + Math.floor(Math.random() * 360),
      })
    }
    return out
  }, [])

  // Tiny confetti dots in pink/gold for celebration feel.
  const confetti = useMemo(() => {
    const colors = ['#e3789a', '#c97f4d', '#f4c97a', '#f9d5dd']
    const out = []
    for (let i = 0; i < 18; i++) {
      out.push({
        left: `${Math.random() * 100}%`,
        delay: `${-Math.random() * 18}s`,
        duration: `${14 + Math.random() * 12}s`,
        color: colors[i % colors.length],
        size: 5 + Math.random() * 4,
      })
    }
    return out
  }, [])

  return (
    <>
      <div className="season-warm-tint" />
      <CelebrationBanner />
      {cookies.map((c, i) => <Kahk key={`k${i}`} {...c} />)}
      {confetti.map((c, i) => <Confetti key={`c${i}`} {...c} />)}
    </>
  )
}

function CelebrationBanner() {
  // Soft glow blob anchored to the top-left, evokes warm sunlight.
  return <div className="season-warm-blob" />
}

function Kahk({ left, delay, duration, size, rotateA, rotateB }) {
  return (
    <div
      className="season-kahk"
      style={{
        left,
        animationDelay: delay,
        animationDuration: duration,
        width: size,
        height: size,
        ['--rot-a']: `${rotateA}deg`,
        ['--rot-b']: `${rotateB}deg`,
      }}
    >
      <svg viewBox="0 0 40 40" width={size} height={size}>
        {/* outer cookie */}
        <circle cx="20" cy="20" r="18" fill="#e2b07a" opacity="0.85" />
        <circle cx="20" cy="20" r="18" fill="none" stroke="#c98a4d" strokeWidth="1.0" opacity="0.85" />
        {/* sugar dots */}
        {[
          [20, 8], [12, 12], [28, 12], [8, 20], [32, 20],
          [12, 28], [28, 28], [20, 32], [20, 20],
          [16, 16], [24, 24], [16, 24], [24, 16],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="1.6" fill="#fff" opacity="0.95" />
        ))}
      </svg>
    </div>
  )
}

function Confetti({ left, delay, duration, color, size }) {
  return (
    <div
      className="season-confetti"
      style={{
        left,
        animationDelay: delay,
        animationDuration: duration,
        background: color,
        width: size,
        height: size,
      }}
    />
  )
}


/* ── Eid al-Adha ── arabesque corners + center medallion ── */
function EidAdhaDecor() {
  return (
    <>
      <div className="season-green-tint" />
      <ArabesqueCorner position="top-start" />
      <ArabesqueCorner position="top-end" />
      <ArabesqueCorner position="bottom-start" />
      <ArabesqueCorner position="bottom-end" />
      <CrescentSilhouette />
    </>
  )
}

function ArabesqueCorner({ position }) {
  return (
    <svg
      className={`season-arabesque season-arabesque-${position}`}
      viewBox="0 0 200 200"
      width="280" height="280"
    >
      <defs>
        <radialGradient id={`ar-glow-${position}`} cx="50%" cy="50%" r="60%">
          <stop offset="0%"  stopColor="#1f7a52" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#1f7a52" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="100" fill={`url(#ar-glow-${position})`} />
      {/* Eight-point star + petals — classic islamic ornament */}
      <g
        transform="translate(100 100)"
        stroke="#c9a45a"
        strokeWidth="1.4"
        fill="none"
        opacity="0.85"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <g key={i} transform={`rotate(${i * 45})`}>
            <path d="M0 -70 L18 -22 L70 0 L18 22 L0 70 L-18 22 L-70 0 L-18 -22 Z" />
            <circle r="36" />
            <path d="M0 -56 L8 -10 L56 0 L8 10 L0 56" opacity="0.7" />
          </g>
        ))}
        <circle r="14" fill="#c9a45a" opacity="0.30" stroke="none" />
      </g>
    </svg>
  )
}

// Subtle mosque-dome silhouette anchored bottom-center; static, low-alpha.
function CrescentSilhouette() {
  return (
    <svg
      className="season-mosque"
      viewBox="0 0 200 100"
      width="280" height="140"
    >
      <g fill="rgba(31, 122, 82, 0.18)">
        {/* central dome */}
        <path d="M100 20 a40 40 0 0 1 40 40 v40 H60 V60 a40 40 0 0 1 40 -40 z" />
        {/* finial */}
        <circle cx="100" cy="14" r="4" />
        <rect x="98.5" y="0" width="3" height="14" />
        {/* side minarets */}
        <rect x="40" y="40" width="8" height="60" />
        <path d="M40 40 a4 4 0 0 1 8 0 z" />
        <rect x="152" y="40" width="8" height="60" />
        <path d="M152 40 a4 4 0 0 1 8 0 z" />
      </g>
    </svg>
  )
}


/* ── Christmas / Winter ── heavy snowfall + frost ───────── */
function ChristmasDecor() {
  // ~50 snowflakes — a real snowfall effect, not a sprinkle.
  const flakes = useMemo(() => {
    const out = []
    for (let i = 0; i < 50; i++) {
      const size = 5 + Math.random() * 14
      out.push({
        left: `${Math.random() * 100}%`,
        delay: `${-Math.random() * 18}s`,
        duration: `${10 + Math.random() * 16}s`,
        size,
        opacity: 0.45 + Math.random() * 0.50,
        drift: Math.random() < 0.5 ? 'snow-drift-a' : 'snow-drift-b',
      })
    }
    return out
  }, [])

  // Sparkle bursts at six positions for ambient twinkle.
  const sparkles = [
    'top-start', 'top-end',
    'mid-start', 'mid-end',
    'bottom-start', 'bottom-end',
  ]

  return (
    <>
      <div className="season-frost-top" />
      <div className="season-frost-bottom" />
      {flakes.map((f, i) => <Snowflake key={i} {...f} />)}
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
      width="56" height="56"
    >
      <g fill="#7dd3fc">
        <path d="M20 0 L22 18 L40 20 L22 22 L20 40 L18 22 L0 20 L18 18 Z" opacity="0.95" />
      </g>
    </svg>
  )
}
