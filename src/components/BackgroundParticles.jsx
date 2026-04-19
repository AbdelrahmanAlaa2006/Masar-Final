import { useEffect } from 'react'

/* ──────────────────────────────────────────────────────────────
   BackgroundParticles
   Mounts once globally and continuously spawns soft floating
   "atom" particles into document.body — same effect that used
   to live only on the Home page, now site-wide.
   ────────────────────────────────────────────────────────────── */

export default function BackgroundParticles({
  intervalMs = 700,
  lifetimeMs = 6500,
}) {
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Respect reduced motion
    const prefersReduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    ).matches
    if (prefersReduced) return

    const PALETTE = [
      'linear-gradient(45deg, #667eea, #764ba2)',
      'linear-gradient(45deg, #4facfe, #00f2fe)',
      'linear-gradient(45deg, #43e97b, #38f9d7)',
      'linear-gradient(45deg, #f093fb, #f5576c)',
      'linear-gradient(45deg, #fa709a, #fee140)',
    ]

    const spawn = () => {
      const p = document.createElement('div')
      const size = 3 + Math.random() * 5 // 3 – 8 px
      const dur = 5 + Math.random() * 5 // 5 – 10 s
      const drift = (Math.random() * 80 - 40).toFixed(1) // -40 – 40 vw
      const grad = PALETTE[Math.floor(Math.random() * PALETTE.length)]

      p.className = 'bg-particle'
      p.style.cssText = `
        position: fixed;
        left: ${Math.random() * 100}vw;
        bottom: -20px;
        width: ${size}px;
        height: ${size}px;
        background: ${grad};
        border-radius: 50%;
        pointer-events: none;
        z-index: -1;
        opacity: 0;
        box-shadow: 0 0 ${size * 2}px ${grad
          .match(/#[0-9a-f]{6}/i)?.[0] || '#667eea'}33;
        animation: bgParticleFloat ${dur}s linear forwards;
        --drift: ${drift}vw;
      `
      document.body.appendChild(p)
      setTimeout(() => p.remove(), dur * 1000 + 200)
    }

    // Seed a few immediately so it doesn't feel empty
    for (let i = 0; i < 6; i++) setTimeout(spawn, i * 250)

    const id = setInterval(spawn, intervalMs)
    return () => {
      clearInterval(id)
      document
        .querySelectorAll('.bg-particle')
        .forEach((el) => el.remove())
    }
  }, [intervalMs, lifetimeMs])

  return null
}
