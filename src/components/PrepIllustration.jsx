import React from 'react'

/**
 * Modern Educational SaaS Artwork System.
 * Clean, abstract, elegant vector artwork for educational stages.
 * Replaces generic AI artwork with a coherent, professional educational design system.
 */
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
      {(kind === 'primary-1' || kind === 'primary-2') && <PrimaryLowerArt />}
      {(kind === 'primary-3' || kind === 'primary-4') && <PrimaryMidArt />}
      {(kind === 'primary-5' || kind === 'primary-6') && <PrimaryUpperArt />}

      {/* Egyptian Baccalaureate stages */}
      {kind === 'bac-1' && <BacLowerArt />}
      {kind === 'bac-2' && <BacMidArt />}
      {kind === 'bac-3' && <BacUpperArt />}

      {/* Packages fallback */}
      {kind === 'packages' && <PackagesArt />}

      {/* Stage Badge Chip */}
      {stage && (
        <span className="prep-stage-chip">
          {stage.replace('-', ' ').toUpperCase()}
        </span>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
   1. PRIMARY STAGES (المرحلة الابتدائية)
   ────────────────────────────────────────────────────────────── */

function PrimaryLowerArt() {
  return (
    <svg className="prep-svg" viewBox="0 0 320 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="pLowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--primary, #6366f1)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--primary, #6366f1)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="320" height="100" fill="url(#pLowGrad)" />
      
      {/* Grid pattern background */}
      <g stroke="rgba(255,255,255,0.06)" strokeWidth="1">
        <line x1="40" y1="0" x2="40" y2="100" />
        <line x1="120" y1="0" x2="120" y2="100" />
        <line x1="200" y1="0" x2="200" y2="100" />
        <line x1="280" y1="0" x2="280" y2="100" />
        <line x1="0" y1="25" x2="320" y2="25" />
        <line x1="0" y1="75" x2="320" y2="75" />
      </g>

      {/* Abstract learning blocks & notebook */}
      <g transform="translate(110, 20)">
        <rect x="0" y="24" width="100" height="42" rx="8" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
        <line x1="16" y1="36" x2="84" y2="36" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" />
        <line x1="16" y1="46" x2="68" y2="46" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" />
        <line x1="16" y1="56" x2="50" y2="56" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" />
        {/* Step badge */}
        <circle cx="82" cy="18" r="14" fill="var(--primary, #6366f1)" />
        <path d="M77 18L80 21L87 14" stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

function PrimaryMidArt() {
  return (
    <svg className="prep-svg" viewBox="0 0 320 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="pMidGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--primary, #6366f1)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--primary, #6366f1)" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="320" height="100" fill="url(#pMidGrad)" />

      {/* Pathway lines */}
      <g stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" strokeDasharray="4 4" fill="none">
        <path d="M 20,50 Q 80,20 160,50 T 300,50" />
      </g>

      {/* Layered study book & node */}
      <g transform="translate(105, 22)">
        <rect x="10" y="28" width="90" height="38" rx="6" fill="rgba(0,0,0,0.15)" />
        <rect x="0" y="18" width="100" height="40" rx="8" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
        <line x1="20" y1="32" x2="80" y2="32" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" />
        <line x1="20" y1="42" x2="60" y2="42" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="86" cy="12" r="12" fill="var(--primary, #6366f1)" />
        <circle cx="86" cy="12" r="5" fill="#ffffff" />
      </g>
    </svg>
  )
}

function PrimaryUpperArt() {
  return (
    <svg className="prep-svg" viewBox="0 0 320 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="pUppGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--primary, #6366f1)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--primary, #6366f1)" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="320" height="100" fill="url(#pUppGrad)" />

      {/* Knowledge Stack Geometry */}
      <g transform="translate(100, 18)">
        <rect x="0" y="44" width="120" height="18" rx="4" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
        <rect x="10" y="28" width="100" height="18" rx="4" fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
        <rect x="20" y="12" width="80" height="18" rx="4" fill="var(--primary, #6366f1)" />
        <line x1="32" y1="21" x2="88" y2="21" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  )
}

/* ──────────────────────────────────────────────────────────────
   2. PREPARATORY STAGES (المرحلة الإعدادية)
   ────────────────────────────────────────────────────────────── */

function FirstPrepArt() {
  return (
    <svg className="prep-svg" viewBox="0 0 320 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="prep1Grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--primary, #10b981)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--primary, #10b981)" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="320" height="100" fill="url(#prep1Grad)" />

      <g transform="translate(105, 18)">
        {/* Foundation Card */}
        <rect x="0" y="12" width="110" height="52" rx="10" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
        <line x1="16" y1="28" x2="80" y2="28" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" />
        <line x1="16" y1="38" x2="64" y2="38" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />
        <line x1="16" y1="48" x2="50" y2="48" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" />

        {/* Milestone Node */}
        <circle cx="92" cy="18" r="14" fill="var(--primary, #10b981)" />
        <text x="92" y="23" textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="800" fontFamily="sans-serif">1</text>
      </g>
    </svg>
  )
}

function SecondPrepArt() {
  return (
    <svg className="prep-svg" viewBox="0 0 320 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="prep2Grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--primary, #3b82f6)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--primary, #3b82f6)" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="320" height="100" fill="url(#prep2Grad)" />

      <g transform="translate(100, 16)">
        {/* Synthesis Deck */}
        <rect x="12" y="24" width="100" height="46" rx="8" fill="rgba(255,255,255,0.08)" />
        <rect x="0" y="12" width="105" height="48" rx="10" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
        <line x1="18" y1="28" x2="84" y2="28" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" />
        <line x1="18" y1="38" x2="68" y2="38" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />

        {/* Milestone Node */}
        <circle cx="88" cy="14" r="14" fill="var(--primary, #3b82f6)" />
        <text x="88" y="19" textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="800" fontFamily="sans-serif">2</text>
      </g>
    </svg>
  )
}

function ThirdPrepArt() {
  return (
    <svg className="prep-svg" viewBox="0 0 320 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="prep3Grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--primary, #f59e0b)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--primary, #f59e0b)" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="320" height="100" fill="url(#prep3Grad)" />

      <g transform="translate(100, 14)">
        {/* Certificate / Diploma Shield Geometry */}
        <rect x="0" y="10" width="120" height="54" rx="12" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
        <line x1="20" y1="26" x2="90" y2="26" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" />
        <line x1="20" y1="36" x2="75" y2="36" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />
        <line x1="20" y1="46" x2="60" y2="46" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" />

        {/* Milestone Honor Star Seal */}
        <circle cx="98" cy="18" r="16" fill="var(--primary, #f59e0b)" />
        <text x="98" y="23" textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="800" fontFamily="sans-serif">3</text>
      </g>
    </svg>
  )
}

/* ──────────────────────────────────────────────────────────────
   3. SECONDARY STAGES (المرحلة الثانوية)
   ────────────────────────────────────────────────────────────── */

function FirstSecArt() {
  return (
    <svg className="prep-svg" viewBox="0 0 320 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sec1Grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--primary, #14b8a6)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--primary, #14b8a6)" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="320" height="100" fill="url(#sec1Grad)" />

      <g transform="translate(100, 16)">
        <rect x="0" y="10" width="120" height="52" rx="10" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
        <line x1="18" y1="26" x2="90" y2="26" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" />
        <line x1="18" y1="36" x2="70" y2="36" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />
        {/* Secondary Badge */}
        <rect x="80" y="6" width="32" height="24" rx="6" fill="var(--primary, #14b8a6)" />
        <text x="96" y="22" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="800" fontFamily="sans-serif">1Sec</text>
      </g>
    </svg>
  )
}

function SecondSecArt() {
  return (
    <svg className="prep-svg" viewBox="0 0 320 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sec2Grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--primary, #ec4899)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--primary, #ec4899)" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="320" height="100" fill="url(#sec2Grad)" />

      <g transform="translate(100, 16)">
        <rect x="0" y="10" width="120" height="52" rx="10" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
        <line x1="18" y1="26" x2="90" y2="26" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" />
        <line x1="18" y1="36" x2="70" y2="36" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />
        {/* Secondary Badge */}
        <rect x="80" y="6" width="32" height="24" rx="6" fill="var(--primary, #ec4899)" />
        <text x="96" y="22" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="800" fontFamily="sans-serif">2Sec</text>
      </g>
    </svg>
  )
}

function ThirdSecArt() {
  return (
    <svg className="prep-svg" viewBox="0 0 320 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sec3Grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--primary, #ef4444)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--primary, #ef4444)" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="320" height="100" fill="url(#sec3Grad)" />

      <g transform="translate(95, 14)">
        {/* Graduation Crest Geometry */}
        <rect x="0" y="8" width="130" height="56" rx="12" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
        <line x1="20" y1="26" x2="98" y2="26" stroke="rgba(255,255,255,0.9)" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="20" y1="38" x2="80" y2="38" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" />
        {/* Secondary Badge */}
        <rect x="88" y="4" width="36" height="26" rx="7" fill="var(--primary, #ef4444)" />
        <text x="106" y="21" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="800" fontFamily="sans-serif">3Sec</text>
      </g>
    </svg>
  )
}

/* ──────────────────────────────────────────────────────────────
   4. BACCALAUREATE & SPECIAL PACKAGES
   ────────────────────────────────────────────────────────────── */

function BacLowerArt() {
  return (
    <svg className="prep-svg" viewBox="0 0 320 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect x="0" y="0" width="320" height="100" fill="rgba(99, 102, 241, 0.25)" />
      <g transform="translate(110, 20)">
        <rect x="0" y="10" width="100" height="50" rx="10" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
        <line x1="16" y1="28" x2="84" y2="28" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="80" cy="12" r="12" fill="var(--primary, #6366f1)" />
        <text x="80" y="16" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="800">B1</text>
      </g>
    </svg>
  )
}

function BacMidArt() {
  return (
    <svg className="prep-svg" viewBox="0 0 320 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect x="0" y="0" width="320" height="100" fill="rgba(99, 102, 241, 0.3)" />
      <g transform="translate(110, 20)">
        <rect x="0" y="10" width="100" height="50" rx="10" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
        <line x1="16" y1="28" x2="84" y2="28" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="80" cy="12" r="12" fill="var(--primary, #6366f1)" />
        <text x="80" y="16" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="800">B2</text>
      </g>
    </svg>
  )
}

function BacUpperArt() {
  return (
    <svg className="prep-svg" viewBox="0 0 320 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect x="0" y="0" width="320" height="100" fill="rgba(99, 102, 241, 0.35)" />
      <g transform="translate(110, 20)">
        <rect x="0" y="10" width="100" height="50" rx="10" fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
        <line x1="16" y1="28" x2="84" y2="28" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="80" cy="12" r="12" fill="var(--primary, #6366f1)" />
        <text x="80" y="16" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="800">B3</text>
      </g>
    </svg>
  )
}

function PackagesArt() {
  return (
    <svg className="prep-svg" viewBox="0 0 320 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect x="0" y="0" width="320" height="100" fill="rgba(139, 92, 246, 0.3)" />
      <g transform="translate(110, 18)">
        <rect x="0" y="12" width="100" height="48" rx="12" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
        <line x1="18" y1="28" x2="82" y2="28" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="82" cy="14" r="13" fill="var(--primary, #8b5cf6)" />
        <path d="M77 14L80 17L87 10" stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}
