import React from 'react'

/* ──────────────────────────────────────────────────────────────
   HomeCardIcons — inline SVG replacements for the four PNG home
   cards (videos / lectures / reports / exams).

   Why not PNG: PNGs can't be re-tinted by the seasonal theme.
   These SVGs colour every line via two CSS variables defined on
   the parent — --icon-primary and --icon-secondary — which the
   home stylesheet binds to the active theme's --primary and
   --secondary, so the icons recolour automatically when the
   season changes (Ramadan gold/purple, Adha green/gold, etc.).

   Same line-art aesthetic as the previous PNGs (no fills, just
   strokes), 96×96 viewBox so the existing card layout sizes them
   the same way an <img> would have.
   ────────────────────────────────────────────────────────────── */

const SHARED = {
  width: '96',
  height: '96',
  viewBox: '0 0 96 96',
  fill: 'none',
  strokeWidth: '3.4',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

// Primary stroke = main shape, accent = a secondary detail. Both
// resolve to CSS variables on the wrapping element so the parent
// can choose how to colour them per theme.
const PRIMARY  = { stroke: 'var(--icon-primary,  currentColor)' }
const ACCENT   = { stroke: 'var(--icon-secondary, currentColor)' }
const PRIM_FIL = { fill:   'var(--icon-primary,  currentColor)' }
const ACC_FIL  = { fill:   'var(--icon-secondary, currentColor)' }

/* Videos — three layered rectangles with a play triangle. */
export function VideosIcon(props) {
  return (
    <svg {...SHARED} aria-hidden="true" {...props}>
      {/* Back card */}
      <rect x="14" y="22" width="60" height="40" rx="6" {...ACCENT} opacity="0.55" />
      {/* Middle card */}
      <rect x="20" y="28" width="60" height="40" rx="6" {...PRIMARY} />
      {/* Front card */}
      <rect x="26" y="34" width="60" height="40" rx="6" {...PRIMARY} />
      {/* Play triangle on front card */}
      <path d="M48 46 L66 54 L48 62 Z" {...PRIM_FIL} stroke="none" />
    </svg>
  )
}

/* Lectures — open book / pages of notes. Simple, readable. */
export function LecturesIcon(props) {
  return (
    <svg {...SHARED} aria-hidden="true" {...props}>
      {/* Open spine */}
      <path d="M48 26 V76" {...PRIMARY} />
      {/* Left + right page edges */}
      <path d="M14 30 Q 30 22 48 26 V76 Q 30 72 14 80 Z" {...PRIMARY} />
      <path d="M82 30 Q 66 22 48 26 V76 Q 66 72 82 80 Z" {...PRIMARY} />
      {/* Lines on left page */}
      <path d="M22 40 H 40 M22 48 H 38 M22 56 H 40" {...ACCENT} opacity="0.85" />
      {/* Lines on right page */}
      <path d="M56 40 H 74 M56 48 H 72 M56 56 H 74" {...ACCENT} opacity="0.85" />
    </svg>
  )
}

/* Reports — clipboard with a small bar-chart and a person header. */
export function ReportsIcon(props) {
  return (
    <svg {...SHARED} aria-hidden="true" {...props}>
      {/* Clipboard body */}
      <rect x="20" y="22" width="56" height="58" rx="6" {...PRIMARY} />
      {/* Clip on top */}
      <rect x="36" y="14" width="24" height="14" rx="3" {...PRIMARY} />
      {/* Person silhouette inside */}
      <circle cx="34" cy="40" r="4" {...ACCENT} />
      <path d="M28 52 q6 -8 12 0" {...ACCENT} />
      {/* Three bar-chart bars */}
      <path d="M50 56 V 66" {...ACCENT} strokeWidth="4" />
      <path d="M58 50 V 66" {...ACCENT} strokeWidth="4" />
      <path d="M66 44 V 66" {...ACCENT} strokeWidth="4" />
    </svg>
  )
}

/* Exams — paper / sheet with a tick + pencil. */
export function ExamsIcon(props) {
  return (
    <svg {...SHARED} aria-hidden="true" {...props}>
      {/* Page */}
      <path d="M22 16 H 60 L 74 30 V 80 H 22 Z" {...PRIMARY} />
      {/* Folded corner */}
      <path d="M60 16 V 30 H 74" {...PRIMARY} />
      {/* Lines representing questions */}
      <path d="M30 42 H 56" {...ACCENT} />
      <path d="M30 52 H 64" {...ACCENT} />
      {/* Big tick (correct answer) */}
      <path d="M30 66 L 38 74 L 56 60" {...ACCENT} strokeWidth="4.5" />
    </svg>
  )
}
