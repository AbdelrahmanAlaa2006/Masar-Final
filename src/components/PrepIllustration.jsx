import React from 'react'

/* Custom inline SVG illustrations for prep, secondary, primary and baccalaureate levels.
   Each illustration is drawn flat on the gradient cover and
   uses semi-transparent whites + the prep accent for accents. */

export default function PrepIllustration({ kind = 'first', stage = '' }) {
  return (
    <div className="prep-illust">
      {/* Preparatory stages */}
      {kind === 'first' && <FirstPrepArt />}
      {kind === 'second' && <SecondPrepArt />}
      {kind === 'third' && <ThirdPrepArt />}
      
      {/* Secondary stages */}
      {kind === 'first-sec' && <FirstSecArt />}
      {kind === 'second-sec' && <SecondSecArt />}
      {kind === 'third-sec' && <ThirdSecArt />}
      
      {/* Primary stages */}
      {kind === 'primary-1' && <PrimaryLowerArt />}
      {kind === 'primary-2' && <PrimaryLowerArt />}
      {kind === 'primary-3' && <PrimaryMidArt />}
      {kind === 'primary-4' && <PrimaryMidArt />}
      {kind === 'primary-5' && <PrimaryUpperArt />}
      {kind === 'primary-6' && <PrimaryUpperArt />}

      {/* Egyptian Baccalaureate stages */}
      {kind === 'bac-1' && <BacLowerArt />}
      {kind === 'bac-2' && <BacMidArt />}
      {kind === 'bac-3' && <BacUpperArt />}
      
      {stage && <span className="prep-stage">{stage.replace('-', ' ').toUpperCase()}</span>}
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
      <g fill="rgba(255,255,255,0.18)" fontFamily="Tajawal, Arial, sans-serif" fontWeight="900">
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
      <g fill="rgba(255,255,255,0.16)" fontFamily="Tajawal, Arial, sans-serif" fontWeight="900">
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
      <g fill="rgba(255,255,255,0.18)" fontFamily="Tajawal, Arial, sans-serif" fontWeight="900">
        <text x="20" y="118" fontSize="22">★</text>
        <text x="38" y="124" fontSize="14">1ST</text>
      </g>
    </svg>
  )
}

/* ── Art 4: 1st Sec - Neutral Book & Inkwell/Quill (Teal) ── */
function FirstSecArt() {
  return (
    <svg
      className="prep-svg"
      viewBox="0 0 320 150"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* faded background starburst / circle */}
      <g fill="rgba(255,255,255,0.08)">
        <circle cx="160" cy="75" r="45" />
      </g>
      
      {/* faded letter/symbols */}
      <g fill="rgba(255,255,255,0.14)" fontFamily="Tajawal, Arial, sans-serif" fontWeight="900">
        <text x="24" y="66" fontSize="28">أ</text>
        <text x="50" y="96" fontSize="20">ب</text>
      </g>

      {/* open book on the left */}
      <g transform="translate(85, 45)">
        {/* Book pages */}
        <path d="M0,52 L0,12 Q4,4 38,10 L38,52 Q4,46 0,52 Z" fill="rgba(255,255,255,0.96)" />
        <path d="M76,52 L76,12 Q72,4 38,10 L38,52 Q72,46 76,52 Z" fill="rgba(255,255,255,0.86)" />
        {/* Page text lines */}
        <g stroke="#0d9488" strokeWidth="1.4" strokeLinecap="round">
          <line x1="6"  y1="20" x2="32" y2="20" />
          <line x1="6"  y1="28" x2="28" y2="28" />
          <line x1="6"  y1="36" x2="32" y2="36" />
          <line x1="44" y1="20" x2="70" y2="20" />
          <line x1="44" y1="28" x2="66" y2="28" />
          <line x1="44" y1="36" x2="70" y2="36" />
        </g>
      </g>

      {/* Inkwell & Quill pen on the right */}
      <g transform="translate(185, 45)">
        {/* Inkwell base */}
        <path d="M12,36 L32,36 L36,54 Q36,58 32,58 L12,58 Q8,58 8,54 Z" fill="rgba(255,255,255,0.96)" />
        {/* Inkwell neck & opening */}
        <rect x="16" y="28" width="12" height="8" rx="1.5" fill="rgba(255,255,255,0.9)" />
        <rect x="14" y="26" width="16" height="3" rx="1" fill="rgba(255,255,255,0.98)" />
        {/* inkwell accent label */}
        <rect x="12" y="42" width="20" height="10" rx="1" fill="#0d9488" opacity="0.8" />
        
        {/* Feather Quill Pen resting in inkwell / writing */}
        <g transform="rotate(-25 15 30)">
          {/* quill stem / shaft */}
          <line x1="20" y1="42" x2="20" y2="-12" stroke="rgba(255,255,255,0.96)" strokeWidth="2" strokeLinecap="round" />
          {/* quill feather vanes */}
          <path d="M20,15 C8,5 12,-12 20,-12 C28,-12 32,5 20,15 Z" fill="rgba(255,255,255,0.76)" />
          {/* decorative vane cuts */}
          <line x1="16" y1="4" x2="11" y2="8" stroke="#0d9488" strokeWidth="1" />
          <line x1="15" y1="-2" x2="10" y2="1" stroke="#0d9488" strokeWidth="1" />
          <line x1="24" y1="4" x2="29" y2="8" stroke="#0d9488" strokeWidth="1" />
          <line x1="25" y1="-2" x2="30" y2="1" stroke="#0d9488" strokeWidth="1" />
        </g>
      </g>

      {/* sparkles / stars */}
      <g fill="rgba(255,255,255,0.75)">
        <path d="M48,32 l1.5,3 l3,1.5 l-3,1.5 l-1.5,3 l-1.5,-3 l-3,-1.5 l3,-1.5 z" />
        <path d="M272,102 l1.5,3 l3,1.5 l-3,1.5 l-1.5,3 l-1.5,-3 l-3,-1.5 l3,-1.5 z" />
      </g>
    </svg>
  )
}

/* ── Art 5: 2nd Sec - Neutral Stacked Books & Reading Glasses (Pink) ── */
function SecondSecArt() {
  return (
    <svg
      className="prep-svg"
      viewBox="0 0 320 150"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* faded background starburst / circle */}
      <g fill="rgba(255,255,255,0.08)">
        <circle cx="160" cy="75" r="45" />
      </g>

      {/* faded letter/symbols */}
      <g fill="rgba(255,255,255,0.14)" fontFamily="Tajawal, Arial, sans-serif" fontWeight="900">
        <text x="24" y="66" fontSize="28">ت</text>
        <text x="50" y="96" fontSize="20">ث</text>
      </g>

      {/* stack of notebooks/books */}
      <g transform="translate(105, 52)">
        {/* Book 3 (bottom) */}
        <rect x="0" y="32" width="110" height="14" rx="2" fill="rgba(255,255,255,0.92)" />
        <rect x="0" y="32" width="14" height="14" fill="#db2777" />
        <line x1="22" y1="39" x2="100" y2="39" stroke="#e2e8f0" strokeWidth="1" />
        
        {/* Book 2 (middle) */}
        <rect x="6" y="16" width="98" height="14" rx="2" fill="rgba(255,255,255,0.96)" />
        <rect x="6" y="16" width="14" height="14" fill="#f472b6" />
        <line x1="28" y1="23" x2="92" y2="23" stroke="#e2e8f0" strokeWidth="1" />
        
        {/* Book 1 (top, slightly offset/tilted) */}
        <g transform="rotate(-6 50 8)">
          <rect x="12" y="0" width="86" height="14" rx="2" fill="rgba(255,255,255,0.98)" />
          <rect x="12" y="0" width="14" height="14" fill="#db2777" />
          <line x1="34" y1="7" x2="88" y2="7" stroke="#e2e8f0" strokeWidth="1" />
        </g>
      </g>

      {/* reading glasses resting above the books */}
      <g transform="translate(112, 14)">
        {/* left lens frame */}
        <circle cx="28" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.96)" strokeWidth="2.2" />
        <circle cx="28" cy="18" r="11" fill="rgba(255,255,255,0.08)" />
        {/* right lens frame */}
        <circle cx="68" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.96)" strokeWidth="2.2" />
        <circle cx="68" cy="18" r="11" fill="rgba(255,255,255,0.08)" />
        {/* bridge connect */}
        <path d="M42,18 Q48,13 54,18" fill="none" stroke="rgba(255,255,255,0.96)" strokeWidth="2.2" strokeLinecap="round" />
        {/* temples / arms */}
        <path d="M14,18 Q4,18 0,12" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M82,18 Q92,18 96,12" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8" strokeLinecap="round" />
      </g>

      {/* sparkles / stars */}
      <g fill="rgba(255,255,255,0.75)">
        <path d="M42,112 l1.5,3 l3,1.5 l-3,1.5 l-1.5,3 l-1.5,-3 l-3,-1.5 l3,-1.5 z" />
        <path d="M268,36 l1.5,3 l3,1.5 l-3,1.5 l-1.5,3 l-1.5,-3 l-3,-1.5 l3,-1.5 z" />
      </g>
    </svg>
  )
}

/* ── Art 6: 3rd Sec - Graduation Mortarboard & Diploma (Red) ── */
function ThirdSecArt() {
  return (
    <svg
      className="prep-svg"
      viewBox="0 0 320 150"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* faded percent */}
      <g fill="rgba(255,255,255,0.12)" fontFamily="Tajawal, Arial, sans-serif" fontWeight="900">
        <text x="24" y="66" fontSize="32">100%</text>
      </g>
      {/* graduation cap */}
      <g transform="translate(112, 14)">
        {/* bottom cap skull segment */}
        <path d="M26,38 Q48,46 70,38 L70,48 Q48,56 26,48 Z" fill="rgba(255,255,255,0.96)" />
        {/* cap diamond top */}
        <polygon points="48,8 96,24 48,40 0,24" fill="rgba(255,255,255,0.96)" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
        {/* tassel ribbon */}
        <path d="M48,24 Q24,28 14,48" fill="none" stroke="#e11d48" strokeWidth="1.8" />
        <circle cx="14" cy="48" r="2.5" fill="#e11d48" />
      </g>
      {/* diploma scroll */}
      <g transform="translate(196, 64) rotate(-15)">
        <rect x="0" y="0" width="56" height="14" rx="2" fill="rgba(255,255,255,0.92)" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
        {/* ribbon band */}
        <rect x="22" y="-1" width="12" height="16" fill="#e11d48" rx="1" />
      </g>
      {/* sparkles */}
      <g fill="rgba(255,255,255,0.85)">
        <path d="M54,92 l2.5,4 l4,2.5 l-4,2.5 l-2.5,4 l-2.5,-4 l-4,-2.5 l4,-2.5 z" />
        <path d="M256,42 l2.5,4 l4,2.5 l-4,2.5 l-2.5,4 l-2.5,-4 l-4,-2.5 l4,-2.5 z" />
      </g>
    </svg>
  )
}

/* ── Art Primary Lower: Open Book with bubbles ──────────────── */
function PrimaryLowerArt() {
  return (
    <svg
      className="prep-svg"
      viewBox="0 0 320 150"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* Faded background circles */}
      <g fill="rgba(255,255,255,0.08)">
        <circle cx="160" cy="75" r="45" />
      </g>
      
      {/* Open book */}
      <g transform="translate(122, 60)">
        <path d="M0,45 L0,10 Q4,2 38,8 L38,45 Q4,39 0,45 Z" fill="rgba(255,255,255,0.96)" />
        <path d="M76,45 L76,10 Q72,2 38,8 L38,45 Q72,39 76,45 Z" fill="rgba(255,255,255,0.86)" />
        {/* Simplified page lines */}
        <g stroke="#7c3aed" strokeWidth="1.2" strokeLinecap="round" opacity="0.6">
          <line x1="6"  y1="18" x2="32" y2="18" />
          <line x1="6"  y1="26" x2="28" y2="26" />
          <line x1="44" y1="18" x2="70" y2="18" />
          <line x1="44" y1="26" x2="66" y2="26" />
        </g>
      </g>

      {/* Floating letters A, B, C */}
      <g fill="rgba(255,255,255,0.92)" fontFamily="Tajawal, Arial" fontWeight="800" fontSize="16">
        <text x="110" y="45" transform="rotate(-15 110 45)">A</text>
        <text x="152" y="32" fill="#7c3aed">B</text>
        <text x="195" y="48" transform="rotate(15 195 48)">C</text>
      </g>

      {/* Crayon/Pencil resting */}
      <g transform="translate(75, 96) rotate(-8)">
        <rect x="0" y="0" width="32" height="6" rx="1" fill="rgba(255,255,255,0.9)" />
        <polygon points="32,0 38,3 32,6" fill="rgba(255,255,255,0.98)" />
        <polygon points="35,1.5 38,3 35,4.5" fill="#7c3aed" />
      </g>
      
      {/* Sparkles */}
      <g fill="rgba(255,255,255,0.7)">
        <path d="M45,36 l1.5,2.5 l2.5,1.5 l-2.5,1.5 l-1.5,2.5 l-1.5,-2.5 l-2.5,-1.5 l2.5,-1.5 z" />
        <path d="M260,105 l1.5,2.5 l2.5,1.5 l-2.5,1.5 l-1.5,2.5 l-1.5,-2.5 l-2.5,-1.5 l2.5,-1.5 z" />
      </g>
    </svg>
  )
}

/* ── Art Primary Mid: Layered geometric shapes, ruler & pencil ── */
function PrimaryMidArt() {
  return (
    <svg
      className="prep-svg"
      viewBox="0 0 320 150"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* Faded mathematical lines */}
      <g stroke="rgba(255,255,255,0.06)" strokeWidth="1" fill="none">
        <circle cx="160" cy="75" r="50" />
        <line x1="110" y1="75" x2="210" y2="75" />
      </g>

      {/* Layered Geometric Shapes */}
      <g transform="translate(100, 45)">
        {/* Square */}
        <rect x="0" y="12" width="30" height="30" rx="3" fill="rgba(255,255,255,0.96)" />
        <rect x="4" y="16" width="22" height="22" rx="1" fill="none" stroke="#7c3aed" strokeWidth="1.5" />
        
        {/* Triangle (Layered behind) */}
        <polygon points="56,8 36,42 76,42" fill="rgba(255,255,255,0.85)" />

        {/* Circle */}
        <circle cx="94" cy="27" r="15" fill="rgba(255,255,255,0.94)" />
        <circle cx="94" cy="27" r="10" fill="none" stroke="#7c3aed" strokeWidth="1.5" />
      </g>

      {/* Pencil and Ruler crossed */}
      <g transform="translate(120, 92) rotate(-5)">
        {/* Ruler */}
        <rect x="0" y="0" width="80" height="12" rx="1.5" fill="rgba(255,255,255,0.96)" />
        <g stroke="#7c3aed" strokeWidth="1" opacity="0.8">
          <line x1="8"  y1="0" x2="8"  y2="4" />
          <line x1="20" y1="0" x2="20" y2="4" />
          <line x1="32" y1="0" x2="32" y2="6" />
          <line x1="44" y1="0" x2="44" y2="4" />
          <line x1="56" y1="0" x2="56" y2="4" />
          <line x1="68" y1="0" x2="68" y2="6" />
        </g>
      </g>

      {/* Sparkles */}
      <g fill="rgba(255,255,255,0.7)">
        <path d="M48,110 l1.5,2.5 l2.5,1.5 l-2.5,1.5 l-1.5,2.5 l-1.5,-2.5 l-2.5,-1.5 l2.5,-1.5 z" />
        <path d="M264,36 l1.5,2.5 l2.5,1.5 l-2.5,1.5 l-1.5,2.5 l-1.5,-2.5 l-2.5,-1.5 l2.5,-1.5 z" />
      </g>
    </svg>
  )
}

/* ── Art Primary Upper: Sprout and magnifying glass ─────────── */
function PrimaryUpperArt() {
  return (
    <svg
      className="prep-svg"
      viewBox="0 0 320 150"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* Faded background starburst / circle */}
      <g fill="rgba(255,255,255,0.08)">
        <circle cx="160" cy="75" r="45" />
      </g>

      {/* Sprout on the left */}
      <g transform="translate(105, 52)">
        {/* Stem */}
        <path d="M8,42 Q8,20 20,12" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="2.5" strokeLinecap="round" />
        {/* Leaves */}
        <ellipse cx="4" cy="26" rx="7" ry="3.5" fill="rgba(255,255,255,0.85)" transform="rotate(-30 4 26)" />
        <ellipse cx="20" cy="16" rx="8" ry="3.8" fill="#7c3aed" transform="rotate(25 20 16)" />
      </g>

      {/* Magnifying Glass on the right */}
      <g transform="translate(150, 42)">
        {/* Handle */}
        <line x1="32" y1="32" x2="52" y2="52" stroke="rgba(255,255,255,0.96)" strokeWidth="4" strokeLinecap="round" />
        {/* Lens Frame */}
        <circle cx="16" cy="16" r="16" fill="none" stroke="rgba(255,255,255,0.96)" strokeWidth="2.6" />
        <circle cx="16" cy="16" r="13" fill="rgba(255,255,255,0.1)" />
        {/* Inner glare */}
        <path d="M6,10 A11,11 0 0,1 20,6" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
      </g>

      {/* Sparkles */}
      <g fill="rgba(255,255,255,0.7)">
        <path d="M45,36 l1.5,2.5 l2.5,1.5 l-2.5,1.5 l-1.5,2.5 l-1.5,-2.5 l-2.5,-1.5 l2.5,-1.5 z" />
        <path d="M260,105 l1.5,2.5 l2.5,1.5 l-2.5,1.5 l-1.5,2.5 l-1.5,-2.5 l-2.5,-1.5 l2.5,-1.5 z" />
      </g>
    </svg>
  )
}

/* ── Art Bac Lower: High-tech orbit and coding tag ─────────── */
function BacLowerArt() {
  return (
    <svg
      className="prep-svg"
      viewBox="0 0 320 150"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* Faded tech grid background */}
      <g stroke="rgba(255,255,255,0.05)" strokeWidth="1">
        <line x1="0"  y1="35" x2="320" y2="35" />
        <line x1="0"  y1="75" x2="320" y2="75" />
        <line x1="0"  y1="115" x2="320" y2="115" />
        <line x1="80"  y1="0" x2="80"  y2="150" />
        <line x1="160" y1="0" x2="160" y2="150" />
        <line x1="240" y1="0" x2="240" y2="150" />
      </g>

      {/* Tech Orbit */}
      <g transform="translate(100, 72)">
        <ellipse cx="0" cy="0" rx="38" ry="12" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" transform="rotate(-25)" />
        <ellipse cx="0" cy="0" rx="38" ry="12" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" transform="rotate(25)" />
        <circle cx="0" cy="0" r="8" fill="rgba(255,255,255,0.96)" />
        <circle cx="0" cy="0" r="5" fill="#10b981" />
        <circle cx="32"  cy="8"  r="2.5" fill="#10b981" />
      </g>

      {/* Digital Screen representation */}
      <g transform="translate(180, 50)">
        <rect x="0" y="0" width="54" height="42" rx="5" fill="rgba(255,255,255,0.94)" />
        <text x="27" y="27" fill="#10b981" fontFamily="Tajawal, Arial" fontWeight="900" fontSize="16" textAnchor="middle">{"</>"}</text>
      </g>

      {/* Sparkles */}
      <g fill="rgba(255,255,255,0.75)">
        <path d="M45,36 l1.5,2.5 l2.5,1.5 l-2.5,1.5 l-1.5,2.5 l-1.5,-2.5 l-2.5,-1.5 l2.5,-1.5 z" />
        <path d="M260,110 l1.5,2.5 l2.5,1.5 l-2.5,1.5 l-1.5,2.5 l-1.5,-2.5 l-2.5,-1.5 l2.5,-1.5 z" />
      </g>
    </svg>
  )
}

/* ── Art Bac Mid: DNA helix and bubbling flask ─────────────── */
function BacMidArt() {
  return (
    <svg
      className="prep-svg"
      viewBox="0 0 320 150"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* Background helix wave */}
      <g stroke="rgba(255,255,255,0.05)" strokeWidth="1" fill="none">
        <path d="M20,60 Q50,20 80,60 T140,60 T200,60 T260,60 T320,60" />
        <path d="M20,60 Q50,100 80,60 T140,60 T200,60 T260,60 T320,60" />
      </g>

      {/* DNA on the left */}
      <g transform="translate(100, 42)">
        <path d="M0,0 Q14,20 0,40 T0,80" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" />
        <path d="M14,0 Q0,20 14,40 T14,80" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" />
        <line x1="6"  y1="10" x2="8"  y2="10" stroke="#10b981" strokeWidth="1.8" />
        <line x1="2"  y1="20" x2="12" y2="20" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" />
        <line x1="6"  y1="30" x2="8"  y2="30" stroke="#10b981" strokeWidth="1.8" />
        <line x1="12" y1="40" x2="2"  y2="40" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" />
        <line x1="8"  y1="50" x2="6"  y2="50" stroke="#10b981" strokeWidth="1.8" />
        <line x1="2"  y1="60" x2="12" y2="60" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" />
      </g>

      {/* Lab Beaker on the right */}
      <g transform="translate(170, 46)">
        <path d="M8,20 L8,10 L4,10 L4,6 L20,6 L20,10 L16,10 L16,20 L26,38 Q27,40 24,42 L0,42 Q-3,40 -2,38 Z" fill="rgba(255,255,255,0.96)" />
        <path d="M5,28 L19,28 L23,38 Q24,40 22,41 L2,41 Q0,40 1,38 Z" fill="#10b981" opacity="0.8" />
        <circle cx="12" cy="18" r="1.5" fill="rgba(255,255,255,0.9)" />
        <circle cx="9"  cy="12" r="1" fill="rgba(255,255,255,0.8)" />
      </g>

      {/* Sparkles */}
      <g fill="rgba(255,255,255,0.75)">
        <path d="M42,32 l1.5,2.5 l2.5,1.5 l-2.5,1.5 l-1.5,2.5 l-1.5,-2.5 l-2.5,-1.5 l2.5,-1.5 z" />
        <path d="M260,110 l1.5,2.5 l2.5,1.5 l-2.5,1.5 l-1.5,2.5 l-1.5,-2.5 l-2.5,-1.5 l2.5,-1.5 z" />
      </g>
    </svg>
  )
}

/* ── Art Bac Upper: Laurel wreath, gear and lightbulb ───────── */
function BacUpperArt() {
  return (
    <svg
      className="prep-svg"
      viewBox="0 0 320 150"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* Faded circles background */}
      <g fill="rgba(255,255,255,0.08)">
        <circle cx="160" cy="75" r="45" />
      </g>

      {/* Laurel wreath branches */}
      <g stroke="rgba(255,255,255,0.55)" strokeWidth="2.2" fill="none" strokeLinecap="round" transform="translate(100, 36)">
        {/* Left branch */}
        <path d="M-12,56 Q-38,40 -30,12" />
        <circle cx="-21" cy="45" r="3" fill="rgba(255,255,255,0.85)" />
        <circle cx="-32" cy="34" r="3" fill="rgba(255,255,255,0.85)" />
        <circle cx="-32" cy="20" r="3" fill="rgba(255,255,255,0.85)" />
        
        {/* Right branch */}
        <path d="M72,56 Q98,40 90,12" />
        <circle cx="81"  cy="45" r="3" fill="rgba(255,255,255,0.85)" />
        <circle cx="92"  cy="34" r="3" fill="rgba(255,255,255,0.85)" />
        <circle cx="92"  cy="20" r="3" fill="rgba(255,255,255,0.85)" />
      </g>

      {/* Gear & Bulb inside wreath */}
      <g transform="translate(136, 46)">
        {/* Gear outline */}
        <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
        <g stroke="rgba(255,255,255,0.6)" strokeWidth="3" strokeLinecap="round">
          <line x1="24" y1="-1"  x2="24" y2="2" />
          <line x1="24" y1="46"  x2="24" y2="49" />
          <line x1="-1"  y1="24" x2="2"  y2="24" />
          <line x1="46"  y1="24" x2="49"  y2="24" />
        </g>
        
        {/* Lightbulb */}
        <path
          d="M16,19 Q16,11 24,11 Q32,11 32,19 Q32,24 29,27 L29,32 L19,32 L19,27 Q16,24 16,19 Z"
          fill="rgba(255,255,255,0.96)"
        />
        <rect x="19" y="33" width="10" height="2" rx="0.5" fill="#10b981" />
        <rect x="21" y="36" width="6"  height="1.5" rx="0.5" fill="#10b981" />
      </g>

      {/* Sparkles */}
      <g fill="rgba(255,255,255,0.85)">
        <path d="M236,36 l1.5,2 l2,1.5 l-2,1.5 l-1.5,2 l-1.5,-2 l-2,-1.5 l2,-1.5 z" />
        <path d="M250,90 l1,2 l2,1 l-2,1 l-1,2 l-1,-2 l-2,-1 l2,-1 z" />
      </g>
    </svg>
  )
}
