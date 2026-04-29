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
        {/* Outer halo — soft, larger, purple→gold for a real moonlit feel. */}
        <radialGradient id="crescent-halo" cx="50%" cy="50%" r="60%">
          <stop offset="0%"  stopColor="#fff7d8" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#c9a45a" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#7c5cff" stopOpacity="0" />
        </radialGradient>
        {/* Body — subtle 3-stop gradient with a warmer top edge. */}
        <linearGradient id="crescent-body" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#fff8d4" />
          <stop offset="55%"  stopColor="#e7c071" />
          <stop offset="100%" stopColor="#9a7430" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#crescent-halo)" />
      <path
        d="M50 8 a42 42 0 1 0 28 74 a34 34 0 1 1 -28 -74 z"
        fill="url(#crescent-body)"
        stroke="#fff2bf"
        strokeWidth="0.6"
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
        <svg viewBox="0 0 80 140" width="64" height="112">
          <defs>
            {/* Warm interior glow that animates inside the lantern. */}
            <radialGradient id="lantern-flame" cx="50%" cy="55%" r="55%">
              <stop offset="0%"  stopColor="#fff7c2" stopOpacity="1" />
              <stop offset="55%" stopColor="#ffc873" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#7c5cff" stopOpacity="0" />
            </radialGradient>
            {/* Brass body gradient — gives a metallic feel. */}
            <linearGradient id="lantern-brass" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#8a6422" />
              <stop offset="50%"  stopColor="#e7c071" />
              <stop offset="100%" stopColor="#8a6422" />
            </linearGradient>
            {/* Glass body — subtle purple tint. */}
            <linearGradient id="lantern-glass" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%"   stopColor="rgba(255, 200, 100, 0.45)" />
              <stop offset="100%" stopColor="rgba(124, 92, 255, 0.55)" />
            </linearGradient>
          </defs>

          {/* Hanging chain */}
          <path d="M40 0 v8" stroke="#8a6422" strokeWidth="1.5" fill="none" />
          {/* Curved hook ring */}
          <circle cx="40" cy="10" r="2.5" fill="none" stroke="#c9a45a" strokeWidth="1.5" />

          {/* Top crown — onion-dome silhouette common to Egyptian fanous */}
          <path
            d="M40 14 q-10 0 -10 8 q0 6 4 10 h12 q4 -4 4 -10 q0 -8 -10 -8 z"
            fill="url(#lantern-brass)"
            stroke="#7a5a1c"
            strokeWidth="0.6"
          />
          <circle cx="40" cy="14" r="2" fill="#fff2bf" />

          {/* Top collar */}
          <rect x="28" y="32" width="24" height="5" rx="1.5" fill="url(#lantern-brass)" />

          {/* Glass body — bell-shaped */}
          <path
            d="M22 38
               q18 -10 36 0
               v44
               q-18 12 -36 0
               z"
            fill="url(#lantern-glass)"
            stroke="#c9a45a"
            strokeWidth="1.6"
          />
          {/* Inner flame glow — keyed for breathing animation */}
          <ellipse cx="40" cy="60" rx="14" ry="20" fill="url(#lantern-flame)">
            <animate attributeName="rx" values="13;15;13" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="ry" values="19;22;19" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.85;1;0.85" dur="2.4s" repeatCount="indefinite" />
          </ellipse>

          {/* Decorative metal ribs — vertical and horizontal */}
          <path d="M22 50 q18 -7 36 0 M22 70 q18 8 36 0"
                stroke="#c9a45a" strokeWidth="1" fill="none" opacity="0.85" />
          <path d="M30 38 v44 M50 38 v44 M40 38 v44"
                stroke="#c9a45a" strokeWidth="0.8" fill="none" opacity="0.55" />

          {/* Base collar */}
          <rect x="28" y="84" width="24" height="6" rx="1.5" fill="url(#lantern-brass)" />
          <rect x="32" y="90" width="16" height="3" fill="#7a5a1c" />

          {/* Tassels */}
          <path d="M40 93 v22"  stroke="#c9a45a" strokeWidth="1.5" />
          <path d="M36 115 h8" stroke="#c9a45a" strokeWidth="1.2" />
          <path d="M37 118 h6 M38 121 h4 M39 124 h2"
                stroke="#c9a45a" strokeWidth="0.8" opacity="0.85" />
        </svg>
      </div>
    </div>
  )
}


/* ── Eid al-Fitr ── golden crescents + soft petals ──────── */
function EidFitrDecor() {
  // Slowly-drifting golden crescents — bigger, softer, more
  // elegant than the previous kahk silhouettes.
  const crescents = useMemo(() => {
    const out = []
    const positions = ['10%', '30%', '50%', '70%', '88%']
    for (let i = 0; i < positions.length; i++) {
      out.push({
        left: positions[i],
        delay: `${-Math.random() * 22}s`,
        duration: `${28 + Math.random() * 14}s`,
        size: 34 + Math.random() * 22,
        rotate: Math.floor(Math.random() * 60) - 30,
      })
    }
    return out
  }, [])

  // Drifting blossom petals — small, gentle, falling on long curves.
  const petals = useMemo(() => {
    const out = []
    for (let i = 0; i < 22; i++) {
      out.push({
        left: `${Math.random() * 100}%`,
        delay: `${-Math.random() * 24}s`,
        duration: `${20 + Math.random() * 14}s`,
        size: 14 + Math.random() * 12,
        sway: Math.random() < 0.5 ? 'petal-sway-a' : 'petal-sway-b',
      })
    }
    return out
  }, [])

  return (
    <>
      <div className="season-warm-tint" />
      <div className="season-warm-blob" />
      {crescents.map((c, i) => <FloatingCrescent key={`c${i}`} {...c} />)}
      {petals.map((p, i) => <Petal key={`p${i}`} {...p} />)}
    </>
  )
}

function FloatingCrescent({ left, delay, duration, size, rotate }) {
  return (
    <div
      className="season-fitr-crescent"
      style={{
        left,
        width: size,
        height: size,
        animationDelay: delay,
        animationDuration: duration,
        ['--rot']: `${rotate}deg`,
      }}
    >
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <defs>
          <linearGradient id="fitr-crescent-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#f5d68f" />
            <stop offset="100%" stopColor="#c97f4d" />
          </linearGradient>
        </defs>
        <path
          d="M20 4 a16 16 0 1 0 11 28 a13 13 0 1 1 -11 -28 z"
          fill="url(#fitr-crescent-grad)"
          opacity="0.78"
        />
      </svg>
    </div>
  )
}

function Petal({ left, delay, duration, size, sway }) {
  return (
    <div
      className={`season-petal ${sway}`}
      style={{
        left,
        width: size,
        height: size,
        animationDelay: delay,
        animationDuration: duration,
      }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <defs>
          <linearGradient id="petal-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#fce4ec" />
            <stop offset="60%"  stopColor="#f3a8c0" />
            <stop offset="100%" stopColor="#c97f4d" />
          </linearGradient>
        </defs>
        <path
          d="M12 2 C 18 6, 22 12, 12 22 C 2 12, 6 6, 12 2 Z"
          fill="url(#petal-grad)"
          opacity="0.78"
        />
      </svg>
    </div>
  )
}


/* ── Eid al-Adha ── mosque + arches + twinkling night sky ── */
function EidAdhaDecor() {
  // Replace the previous corner ornaments with a completely
  // different motif: a graceful "row of arches" (mihrab silhouette)
  // along the upper edge — a deeply Islamic architectural element
  // that reads as polite and reverent, not corner-ornament busy.
  // We also bring back the mosque silhouette at the bottom (the
  // user only flagged the arabesque corners as silly), and add a
  // gentle constellation of twinkling stars overhead.

  const stars = useMemo(() => {
    const out = []
    for (let i = 0; i < 18; i++) {
      out.push({
        top:    `${Math.random() * 45}%`,
        left:   `${Math.random() * 100}%`,
        delay:  `${Math.random() * 5}s`,
        size:   3 + Math.random() * 4,
      })
    }
    return out
  }, [])

  return (
    <>
      <div className="season-green-tint" />
      <ArchRow />
      {stars.map((s, i) => <AdhaStar key={i} {...s} />)}
      <CrescentSilhouette />
    </>
  )
}

/* A row of mihrab-style pointed arches across the very top of the
   viewport. Built as one SVG so the curves stay perfectly aligned;
   the SVG is full-width and uses preserveAspectRatio="none" so it
   scales horizontally without distorting the arch height. */
function ArchRow() {
  // Generate 8 repeating arches as a single path. Each arch is a
  // pointed (mihrab) shape: two quarter-circles meeting at an apex.
  const archCount = 8
  const W = 800            // base viewBox width
  const H = 110            // base viewBox height (arch + base bar)
  const archW = W / archCount
  const segments = []
  for (let i = 0; i < archCount; i++) {
    const x0 = i * archW
    const xMid = x0 + archW / 2
    const x1 = x0 + archW
    // Pointed arch: M base-left, Q out to apex, Q in to base-right.
    segments.push(
      `M ${x0} ${H} L ${x0} 60 Q ${xMid} -10 ${x1} 60 L ${x1} ${H} Z`
    )
  }
  const d = segments.join(' ')

  return (
    <svg
      className="season-arch-row"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="arch-row-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#1f7a52" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#1f7a52" stopOpacity="0.10" />
        </linearGradient>
      </defs>
      <path d={d} fill="url(#arch-row-grad)" />
      {/* Gold under-line that traces the arch curves */}
      <path
        d={Array.from({ length: archCount }, (_, i) => {
          const x0 = i * archW
          const xMid = x0 + archW / 2
          const x1 = x0 + archW
          return `M ${x0} 60 Q ${xMid} -10 ${x1} 60`
        }).join(' ')}
        stroke="#c9a45a"
        strokeWidth="1.2"
        fill="none"
        opacity="0.85"
      />
    </svg>
  )
}

function AdhaStar({ top, left, delay, size }) {
  return (
    <div
      className="season-adha-star"
      style={{
        top, left,
        width: size, height: size,
        animationDelay: delay,
      }}
    />
  )
}

// Mosque silhouette anchored bottom-center — kept and refined.
function CrescentSilhouette() {
  return (
    <svg
      className="season-mosque"
      viewBox="0 0 200 100"
      width="280" height="140"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="mosque-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#1f7a52" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#1f7a52" stopOpacity="0.10" />
        </linearGradient>
      </defs>
      <g fill="url(#mosque-grad)">
        {/* Central onion dome */}
        <path d="M100 24 q-22 -2 -22 18 q0 16 12 22 v36 H110 V64 q12 -6 12 -22 q0 -20 -22 -18 z" />
        {/* Finial */}
        <circle cx="100" cy="14" r="3.5" />
        <rect x="98.5" y="0" width="3" height="14" />
        {/* Side minarets */}
        <rect x="40" y="40" width="7" height="60" />
        <path d="M40 40 q3.5 -10 7 0 z" />
        <rect x="38" y="34" width="11" height="6" rx="1.5" />
        <rect x="153" y="40" width="7" height="60" />
        <path d="M153 40 q3.5 -10 7 0 z" />
        <rect x="151" y="34" width="11" height="6" rx="1.5" />
        {/* Side smaller domes */}
        <path d="M70 60 q-10 0 -10 12 v28 H80 V72 q0 -12 -10 -12 z" />
        <path d="M130 60 q-10 0 -10 12 v28 H140 V72 q0 -12 -10 -12 z" />
      </g>
      <path
        d="M40 100 H160"
        stroke="#c9a45a"
        strokeWidth="0.8"
        opacity="0.55"
      />
    </svg>
  )
}


/* ── Christmas / Winter ── heavy snowfall + frost ───────── */
function ChristmasDecor() {
  // ~50 snowflakes — a real snowfall effect, not a sprinkle.
  // Each picks one of three SVG variants so the falling field
  // looks like an actual mix of crystal shapes, not a single repeat.
  const flakes = useMemo(() => {
    const out = []
    for (let i = 0; i < 50; i++) {
      const size = 6 + Math.random() * 14
      out.push({
        left: `${Math.random() * 100}%`,
        delay: `${-Math.random() * 18}s`,
        duration: `${10 + Math.random() * 16}s`,
        size,
        opacity: 0.55 + Math.random() * 0.40,
        drift: Math.random() < 0.5 ? 'snow-drift-a' : 'snow-drift-b',
        variant: i % 3, // 0,1,2
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

function Snowflake({ left, delay, duration, size, opacity, drift, variant }) {
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
      <SnowflakeShape variant={variant} size={size} />
    </div>
  )
}

/* Three real-snowflake shapes with proper 6-fold symmetry, drawn
   as one arm and rotated 6 times. Real snow crystals always have
   hexagonal symmetry — that's what was missing from the previous
   "asterisk + barbs" version that looked synthetic.

   v0 — classic dendrite      (main arm, two pairs of side-branches)
   v1 — stellar plate         (main arm with a hex plate at center)
   v2 — fern dendrite         (main arm with 4 feathery branches) */
function SnowflakeShape({ variant = 0, size = 16 }) {
  // Single arm — drawn pointing UP from center (0,0). The outer
  // group rotates this six times around the center for symmetry.
  let arm = null
  if (variant === 0) {
    // Classic dendrite: one arm with two side-pairs.
    arm = (
      <>
        <line x1="0" y1="0" x2="0" y2="-22" />
        <line x1="0" y1="-8"  x2="-5" y2="-13" />
        <line x1="0" y1="-8"  x2="5"  y2="-13" />
        <line x1="0" y1="-15" x2="-3.5" y2="-19" />
        <line x1="0" y1="-15" x2="3.5"  y2="-19" />
        {/* tip caps */}
        <line x1="-1.5" y1="-21" x2="1.5"  y2="-21" />
        <line x1="-2.5" y1="-13" x2="-3.5" y2="-12" />
        <line x1="2.5"  y1="-13" x2="3.5"  y2="-12" />
      </>
    )
  } else if (variant === 1) {
    // Stellar plate: arm + decorative tip "v" + hexagonal centre plate.
    arm = (
      <>
        <line x1="0" y1="0" x2="0" y2="-22" />
        <line x1="0" y1="-22" x2="-3" y2="-18" />
        <line x1="0" y1="-22" x2="3"  y2="-18" />
        <line x1="0" y1="-12" x2="-4" y2="-16" />
        <line x1="0" y1="-12" x2="4"  y2="-16" />
      </>
    )
  } else {
    // Fern dendrite: lots of feathery side-branches angled outward.
    arm = (
      <>
        <line x1="0" y1="0" x2="0" y2="-22" />
        <line x1="0" y1="-5"  x2="-3" y2="-8" />
        <line x1="0" y1="-5"  x2="3"  y2="-8" />
        <line x1="0" y1="-10" x2="-4" y2="-14" />
        <line x1="0" y1="-10" x2="4"  y2="-14" />
        <line x1="0" y1="-15" x2="-3" y2="-18" />
        <line x1="0" y1="-15" x2="3"  y2="-18" />
        <line x1="0" y1="-20" x2="-1.5" y2="-22" />
        <line x1="0" y1="-20" x2="1.5"  y2="-22" />
      </>
    )
  }

  return (
    <svg viewBox="-24 -24 48 48" width={size} height={size}>
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none">
        {/* Stellar-plate centre — a small hexagon at the core of v1. */}
        {variant === 1 && (
          <polygon
            points="0,-5 4.33,-2.5 4.33,2.5 0,5 -4.33,2.5 -4.33,-2.5"
            fill="currentColor" fillOpacity="0.35"
            stroke="currentColor"
          />
        )}
        {/* Repeat the arm at 0°, 60°, 120°, 180°, 240°, 300° for true
            6-fold hexagonal symmetry. */}
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <g key={deg} transform={`rotate(${deg})`}>{arm}</g>
        ))}
        {/* Tiny dot at the very centre, common to real crystals. */}
        <circle cx="0" cy="0" r="0.9" fill="currentColor" stroke="none" />
      </g>
    </svg>
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
