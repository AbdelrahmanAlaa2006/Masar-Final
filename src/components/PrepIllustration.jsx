import React from 'react'

/* Custom inline SVG illustrations for the three prep levels.
   Each illustration is drawn flat on the gradient cover and
   uses semi-transparent whites + the prep accent for accents. */

export default function PrepIllustration({ kind = 'first', stage = '' }) {
  return (
    <div className="prep-illust">
      {kind === 'first' && <FirstPrepArt />}
      {kind === 'second' && <SecondPrepArt />}
      {kind === 'third' && <ThirdPrepArt />}
      {stage && <span className="prep-stage">{stage}</span>}
    </div>
  )
}

/* ── Art 1: growth — sprout, sun, open book, ABC ─────────────── */
function FirstPrepArt() {
  return (
    <svg
      className="prep-svg"
      viewBox="0 0 320 150"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* faded letters */}
      <g fill="rgba(255,255,255,0.18)" fontFamily="Cairo, Arial, sans-serif" fontWeight="900">
        <text x="22" y="60" fontSize="36">A</text>
        <text x="46" y="38" fontSize="26">B</text>
        <text x="70" y="58" fontSize="22">C</text>
      </g>

      {/* sun */}
      <g transform="translate(248,38)">
        <circle r="16" fill="rgba(255,255,255,0.92)" />
        <g stroke="rgba(255,255,255,0.7)" strokeWidth="2.4" strokeLinecap="round">
          <line x1="0" y1="-22" x2="0" y2="-28" />
          <line x1="22" y1="0" x2="28" y2="0" />
          <line x1="0" y1="22" x2="0" y2="28" />
          <line x1="16" y1="-16" x2="22" y2="-22" />
          <line x1="16" y1="16" x2="22" y2="22" />
          <line x1="-16" y1="-16" x2="-22" y2="-22" />
        </g>
      </g>

      {/* clouds */}
      <g fill="rgba(255,255,255,0.18)">
        <ellipse cx="180" cy="30" rx="22" ry="6" />
        <ellipse cx="200" cy="34" rx="14" ry="5" />
      </g>

      {/* open book */}
      <g transform="translate(118,72)">
        <path d="M0,52 L0,12 Q4,4 38,10 L38,52 Q4,46 0,52 Z" fill="rgba(255,255,255,0.96)" />
        <path d="M76,52 L76,12 Q72,4 38,10 L38,52 Q72,46 76,52 Z" fill="rgba(255,255,255,0.86)" />
        <g stroke="#38a169" strokeWidth="1.4" strokeLinecap="round">
          <line x1="6"  y1="20" x2="32" y2="20" />
          <line x1="6"  y1="28" x2="28" y2="28" />
          <line x1="6"  y1="36" x2="32" y2="36" />
          <line x1="44" y1="20" x2="70" y2="20" />
          <line x1="44" y1="28" x2="66" y2="28" />
          <line x1="44" y1="36" x2="70" y2="36" />
        </g>
      </g>

      {/* sprout growing from the book */}
      <g transform="translate(156,46)">
        <path d="M0,28 Q0,18 6,12" stroke="rgba(255,255,255,0.95)" strokeWidth="2.8" fill="none" strokeLinecap="round" />
        <ellipse cx="-2" cy="14" rx="9" ry="4" fill="rgba(255,255,255,0.85)" transform="rotate(-30 -2 14)" />
        <ellipse cx="10" cy="8" rx="9" ry="4" fill="rgba(255,255,255,0.95)" transform="rotate(35 10 8)" />
      </g>

      {/* tiny stars */}
      <g fill="rgba(255,255,255,0.6)">
        <circle cx="36" cy="110" r="2.2" />
        <circle cx="64" cy="118" r="1.6" />
        <circle cx="232" cy="108" r="2" />
        <circle cx="266" cy="120" r="1.4" />
      </g>
    </svg>
  )
}

/* ── Art 2: exploration — books stack + lightbulb + pencil ──── */
function SecondPrepArt() {
  return (
    <svg
      className="prep-svg"
      viewBox="0 0 320 150"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* faded "123" */}
      <g fill="rgba(255,255,255,0.16)" fontFamily="Cairo, Arial, sans-serif" fontWeight="900">
        <text x="20" y="60" fontSize="36">1</text>
        <text x="44" y="40" fontSize="26">2</text>
        <text x="66" y="58" fontSize="22">3</text>
      </g>

      {/* lightbulb with rays */}
      <g transform="translate(244,44)">
        <g stroke="rgba(255,255,255,0.8)" strokeWidth="2.2" strokeLinecap="round">
          <line x1="0" y1="-32" x2="0" y2="-38" />
          <line x1="22" y1="-12" x2="28" y2="-16" />
          <line x1="-22" y1="-12" x2="-28" y2="-16" />
          <line x1="16" y1="14" x2="22" y2="20" />
          <line x1="-16" y1="14" x2="-22" y2="20" />
        </g>
        <path
          d="M-12,-8 Q-12,-22 0,-22 Q12,-22 12,-8 Q12,0 6,6 L6,12 L-6,12 L-6,6 Q-12,0 -12,-8 Z"
          fill="rgba(255,255,255,0.96)"
        />
        <rect x="-6" y="14" width="12" height="3" rx="1.2" fill="#2b6cb0" />
        <rect x="-4" y="19" width="8"  height="2.2" rx="1" fill="#2b6cb0" />
      </g>

      {/* stack of books */}
      <g transform="translate(108,70)">
        {/* book 3 (bottom) */}
        <rect x="0" y="50" width="110" height="14" rx="2" fill="rgba(255,255,255,0.95)" />
        <rect x="0" y="50" width="14" height="14" fill="#2b6cb0" />
        <line x1="22" y1="57" x2="100" y2="57" stroke="#cbd5e0" strokeWidth="1" />
        {/* book 2 */}
        <rect x="6" y="34" width="100" height="14" rx="2" fill="rgba(255,255,255,0.92)" />
        <rect x="6" y="34" width="14" height="14" fill="#4facfe" />
        <line x1="26" y1="41" x2="100" y2="41" stroke="#cbd5e0" strokeWidth="1" />
        {/* book 1 (top, tilted) */}
        <g transform="rotate(-8 56 24)">
          <rect x="14" y="14" width="86" height="14" rx="2" fill="rgba(255,255,255,0.98)" />
          <rect x="14" y="14" width="14" height="14" fill="#667eea" />
          <line x1="32" y1="21" x2="96" y2="21" stroke="#cbd5e0" strokeWidth="1" />
        </g>
      </g>

      {/* pencil */}
      <g transform="translate(186,22) rotate(35)">
        <rect x="0" y="0" width="44" height="8" rx="1.2" fill="rgba(255,255,255,0.92)" />
        <rect x="0" y="0" width="8"  height="8" fill="#ed8936" />
        <polygon points="44,0 52,4 44,8" fill="rgba(255,255,255,0.85)" />
        <polygon points="50,3 52,4 50,5" fill="#2d3748" />
      </g>

      {/* tiny stars */}
      <g fill="rgba(255,255,255,0.6)">
        <circle cx="34" cy="118" r="2" />
        <circle cx="58" cy="126" r="1.4" />
        <circle cx="234" cy="116" r="2" />
        <circle cx="268" cy="128" r="1.4" />
      </g>
    </svg>
  )
}

/* ── Art 3: achievement — trophy + sparkles + medal ─────────── */
function ThirdPrepArt() {
  return (
    <svg
      className="prep-svg"
      viewBox="0 0 320 150"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* faded star burst */}
      <g fill="rgba(255,255,255,0.12)">
        <circle cx="160" cy="75" r="60" />
      </g>
      <g stroke="rgba(255,255,255,0.18)" strokeWidth="2" strokeLinecap="round">
        <line x1="160" y1="10" x2="160" y2="22" />
        <line x1="160" y1="128" x2="160" y2="140" />
        <line x1="92"  y1="75" x2="104" y2="75" />
        <line x1="216" y1="75" x2="228" y2="75" />
        <line x1="115" y1="32" x2="123" y2="40" />
        <line x1="205" y1="32" x2="197" y2="40" />
        <line x1="115" y1="118" x2="123" y2="110" />
        <line x1="205" y1="118" x2="197" y2="110" />
      </g>

      {/* trophy */}
      <g transform="translate(132,32)">
        {/* handles */}
        <path d="M-2,8 Q-22,8 -22,28 Q-22,40 -2,40" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="4" />
        <path d="M58,8 Q78,8 78,28 Q78,40 58,40" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="4" />
        {/* cup */}
        <path d="M0,4 L56,4 Q58,4 58,8 L52,52 Q50,58 28,58 Q6,58 4,52 L-2,8 Q-2,4 0,4 Z"
              fill="rgba(255,255,255,0.96)" />
        {/* highlight */}
        <path d="M6,10 Q4,30 16,52" stroke="rgba(255,255,255,0.6)" strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* stem */}
        <rect x="22" y="58" width="12" height="14" fill="rgba(255,255,255,0.9)" />
        {/* base */}
        <rect x="6" y="72" width="44" height="10" rx="2" fill="rgba(255,255,255,0.96)" />
        <rect x="0" y="82" width="56" height="6"  rx="2" fill="rgba(255,255,255,0.85)" />
        {/* star on cup */}
        <polygon points="28,18 31,26 39,26 33,31 35,39 28,34 21,39 23,31 17,26 25,26"
                 fill="#dd6b20" />
      </g>

      {/* sparkles */}
      <g fill="rgba(255,255,255,0.85)">
        <path d="M60,40 l3,7 l7,3 l-7,3 l-3,7 l-3,-7 l-7,-3 l7,-3 z" />
        <path d="M252,46 l2,5 l5,2 l-5,2 l-2,5 l-2,-5 l-5,-2 l5,-2 z" />
        <path d="M232,118 l2,4 l4,2 l-4,2 l-2,4 l-2,-4 l-4,-2 l4,-2 z" />
      </g>

      {/* faded "1st" badge */}
      <g fill="rgba(255,255,255,0.18)" fontFamily="Cairo, Arial, sans-serif" fontWeight="900">
        <text x="20" y="118" fontSize="22">★</text>
        <text x="38" y="124" fontSize="14">1ST</text>
      </g>
    </svg>
  )
}
