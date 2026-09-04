import React, { useEffect, useRef, useState, useCallback } from 'react'

/* ──────────────────────────────────────────────────────────────
   YouTubePlayer — privacy-wrapped YouTube IFrame player with a
   fully custom control bar. Designed so the student never sees:
     • the YouTube logo / channel name
     • the "watch on YouTube" share / title overlay
     • the end-screen suggested videos
     • any right-click → "copy URL"
   …while still using YouTube's CDN + adaptive streaming.

   Props:
     videoId      — the 11-char YouTube video ID (not a URL)
     onEnded      — optional callback when playback reaches the end
     onReady      — optional callback(player) once player is ready
     startMuted   — autoplay policies: set true if you plan to autoplay
   ────────────────────────────────────────────────────────────── */

// Load the YouTube IFrame API once per page.
let ytApiPromise = null
function loadYouTubeApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'))
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT)
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') { try { prev() } catch {} }
      resolve(window.YT)
    }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    document.head.appendChild(s)
  })
  return ytApiPromise
}

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const mm = String(m).padStart(h ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// Human-readable label for YouTube quality codes.
const QUALITY_LABEL = {
  highres: '4K+',
  hd2160:  '2160p',
  hd1440:  '1440p',
  hd1080:  '1080p',
  hd720:   '720p',
  large:   '480p',
  medium:  '360p',
  small:   '240p',
  tiny:    '144p',
  auto:    'Auto',
  default: 'Auto',
}

function IconRewind5({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }}>
      <path d="M12.5 5V1.5L8 6l4.5 4.5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4.5c0 4.14 3.36 7.5 7.5 7.5s7.5-3.36 7.5-7.5-3.36-7.5-7.5-7.5z" />
      <text x="12" y="15.2" textAnchor="middle" fontSize="7" fontWeight="800" fill="currentColor" fontFamily="system-ui, -apple-system, sans-serif">5</text>
    </svg>
  )
}

function IconForward5({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }}>
      <path d="M11.5 5V1.5l4.5 4.5-4.5 4.5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.14-3.36 7.5-7.5 7.5S4 17.14 4 13s3.36-7.5 7.5-7.5z" />
      <text x="12" y="15.2" textAnchor="middle" fontSize="7" fontWeight="800" fill="currentColor" fontFamily="system-ui, -apple-system, sans-serif">5</text>
    </svg>
  )
}

export default function YouTubePlayer({
  videoId,
  onEnded,
  onReady,
  onProgress,
  startMuted = false,
  // Seed the watched-seconds counter so a returning student keeps their
  // already-credited time. We never lower this — only raise.
  initialWatchedSeconds = 0,
  seekTrigger = null,
  onTimeUpdate = null,
  forcePause = false,
}) {
  const hostRef = useRef(null)          // the <div> we mount the iframe on
  const wrapRef = useRef(null)          // the outer container (fullscreen target)
  const playerRef = useRef(null)        // the YT.Player instance
  const rafRef = useRef(null)           // requestAnimationFrame id for tick loop

  const [ready, setReady]       = useState(false)
  const [playing, setPlaying]   = useState(false)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent]   = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [muted, setMuted]       = useState(startMuted)
  const [volume, setVolume]     = useState(100)
  const [qualities, setQualities] = useState([])
  const [quality, setQuality]   = useState(() => {
    return (typeof window !== 'undefined' ? localStorage.getItem('masaar_student_quality') : null) || 'large'
  })
  const userSelectedQualityRef  = useRef(false)
  const [rate, setRate]         = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [rateMenuOpen, setRateMenuOpen] = useState(false)
  const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

  useEffect(() => {
    if (forcePause && playerRef.current && ready) {
      try {
        playerRef.current.pauseVideo()
      } catch (err) {
        console.error('Failed to pause YouTube player:', err)
      }
    }
  }, [forcePause, ready])

  // Double-tap-to-seek state. We track the last tap's time + side so the
  // second tap in the same half within DOUBLE_TAP_MS triggers a ±10s seek
  // (instead of the single-tap play/pause). A fading overlay badge gives
  // the student visual feedback when it fires.
  const lastTapRef = useRef({ t: 0, side: null })
  const [seekFlash, setSeekFlash] = useState(null) // {side:'left'|'right', key:number} | null
  const DOUBLE_TAP_MS = 280
  const SEEK_STEP = 10

  // ---------- Player lifecycle ----------
  useEffect(() => {
    let cancelled = false
    if (!videoId) return
    loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current) return
      playerRef.current = new YT.Player(hostRef.current, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          // Strip every piece of YouTube branding we can.
          autoplay:        1,
          controls:        0,  // hide native controls
          rel:             0,  // no end-screen suggestions
          modestbranding:  1,
          disablekb:       1,  // disable built-in keyboard shortcuts
          fs:              0,  // hide YT fullscreen button
          iv_load_policy:  3,  // hide video annotations
          playsinline:     1,
          cc_load_policy:  0,
          origin:          typeof window !== 'undefined' ? window.location.origin : undefined,
        },
        events: {
          onReady: (e) => {
            setReady(true)
            setDuration(e.target.getDuration() || 0)
            setVolume(e.target.getVolume() ?? 100)
            setMuted(Boolean(e.target.isMuted?.()))
            if (startMuted) { try { e.target.mute() } catch {} }

            // Default to 480p ('large') or 360p ('medium') so student bandwidth is conserved
            const pref = (typeof window !== 'undefined' ? localStorage.getItem('masaar_student_quality') : null) || 'large'
            try { e.target.setPlaybackQuality(pref) } catch {}

            const refreshQualities = () => {
              try {
                const qs = e.target.getAvailableQualityLevels?.() || []
                if (qs.length) {
                  setQualities(qs)
                  if (!userSelectedQualityRef.current) {
                    const target = qs.includes(pref) ? pref : (qs.includes('large') ? 'large' : (qs.includes('medium') ? 'medium' : qs[qs.length - 1]))
                    if (target) {
                      e.target.setPlaybackQuality(target)
                      setQuality(target)
                    }
                  }
                }
              } catch {}
            }
            refreshQualities()
            // Retry a few times after load since YT populates the list
            // lazily on the first buffer. Cheap + bounded.
            const retries = [300, 900, 2000, 4000]
            retries.forEach((ms) => setTimeout(refreshQualities, ms))
            if (typeof onReady === 'function') onReady(e.target)
          },
          onStateChange: (e) => {
            const YTs = window.YT.PlayerState
            if (e.data === YTs.PLAYING) {
              setPlaying(true)
              if (!userSelectedQualityRef.current) {
                const pref = (typeof window !== 'undefined' ? localStorage.getItem('masaar_student_quality') : null) || 'large'
                try { e.target.setPlaybackQuality(pref) } catch {}
              }
            }
            if (e.data === YTs.PAUSED)    setPlaying(false)
            if (e.data === YTs.BUFFERING) {
              setPlaying(true)
              if (!userSelectedQualityRef.current) {
                const pref = (typeof window !== 'undefined' ? localStorage.getItem('masaar_student_quality') : null) || 'large'
                try { e.target.setPlaybackQuality(pref) } catch {}
              }
            }
            if (e.data === YTs.ENDED) {
              setPlaying(false)
              if (typeof onEnded === 'function') onEnded()
            }
            // Duration sometimes only resolves after first PLAY event.
            const d = e.target.getDuration?.() || 0
            if (d && d !== duration) setDuration(d)
          },
          onPlaybackQualityChange: (e) => {
            if (!userSelectedQualityRef.current) {
              // If YouTube promotes to 1080p or 720p automatically, force it back to 480p/360p
              if (e.data === 'hd1080' || e.data === 'hd720' || e.data === 'hd1440' || e.data === 'highres') {
                const pref = (typeof window !== 'undefined' ? localStorage.getItem('masaar_student_quality') : null) || 'large'
                try {
                  e.target.setPlaybackQuality(pref)
                  setQuality(pref)
                  return
                } catch {}
              }
            }
            setQuality(e.data || 'large')
            try {
              const qs = e.target.getAvailableQualityLevels?.() || []
              if (qs.length) setQualities(qs)
            } catch {}
          },
        },
      })
    })
    return () => {
      cancelled = true
      try { playerRef.current?.destroy?.() } catch {}
      playerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  // ── Real watch-time tracking ───────────────────────────────
  // Goal: count seconds the student ACTUALLY watched. Skipping forward
  // with the scrubber must NOT add fake watch time, but the explicit
  // ±5s/±10s skip buttons SHOULD count (per the product spec).
  //
  // Approach on each tick:
  //   - Measure delta_video = currentTime - lastVideoTime
  //   - Measure delta_real  = (now - lastTickTime) / 1000
  //   - expected = delta_real * playbackRate  (handles 1.25/1.5/2x)
  //   - If |delta_video - expected| ≤ 1.0s → natural playback,
  //     credit `expected` (caps at delta_video so we never over-credit).
  //   - Otherwise it's a seek. If a skip-button just fired we still
  //     credit its magnitude (consumed via `pendingSkipCreditRef`).
  //     If not (= mouse-scrub), credit nothing.
  const watchedRef        = useRef(initialWatchedSeconds || 0)
  const lastTickRef       = useRef({ realMs: 0, videoSec: 0 })
  const pendingSkipCreditRef = useRef(0) // seconds to credit on next jump

  const lastProgressRef = useRef({ t: 0, secs: 0 })
  const lastTimeReportRef = useRef(-1)
  const onTimeUpdateRef = useRef(onTimeUpdate)
  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate
  }, [onTimeUpdate])

  useEffect(() => {
    if (seekTrigger?.seconds !== undefined && playerRef.current && ready) {
      playerRef.current.seekTo(seekTrigger.seconds, true)
      setCurrent(seekTrigger.seconds)
    }
  }, [seekTrigger, ready])

  useEffect(() => {
    function tick() {
      const p = playerRef.current
      if (p && typeof p.getCurrentTime === 'function') {
        try {
          const t = p.getCurrentTime() || 0
          const d = p.getDuration?.() || 0
          const rate = (typeof p.getPlaybackRate === 'function')
            ? (p.getPlaybackRate() || 1) : 1
          setCurrent(t)
          const secInt = Math.floor(t)
          if (secInt !== lastTimeReportRef.current) {
            lastTimeReportRef.current = secInt
            if (typeof onTimeUpdateRef.current === 'function') {
              onTimeUpdateRef.current(secInt)
            }
          }
          const frac = p.getVideoLoadedFraction?.() || 0
          setBuffered(d * frac)

          // Watched-time accounting. Only do it while the player is
          // actually PLAYING — pausing shouldn't accrue time.
          const ytState = (typeof p.getPlayerState === 'function') ? p.getPlayerState() : -1
          const isPlayingNow = ytState === 1 // YT.PlayerState.PLAYING
          const nowMs = performance.now()
          const last = lastTickRef.current
          if (last.realMs && isPlayingNow) {
            const dReal  = (nowMs - last.realMs) / 1000
            const dVideo = t - last.videoSec
            const expected = dReal * rate
            // Natural playback: video advanced by roughly (rate × dt).
            if (Math.abs(dVideo - expected) <= 1.0 && dVideo >= 0) {
              watchedRef.current += Math.min(expected, Math.max(0, dVideo))
            } else {
              // It's a jump (skip). Credit only if it was triggered by
              // one of our explicit skip buttons.
              const credit = pendingSkipCreditRef.current
              if (credit > 0) {
                watchedRef.current += credit
                pendingSkipCreditRef.current = 0
              }
              // Mouse-scrub jumps fall through with zero credit.
            }
          }
          lastTickRef.current = { realMs: nowMs, videoSec: t }

          // Throttled progress emission — every ~30s of wall clock.
          // For a 30-min video that's 60 writes total, vs 360 at 5s.
          // The cleanup effect in Videos.jsx also calls this once on
          // unmount, so the very last position is captured even between
          // throttle windows.
          if (typeof onProgress === 'function') {
            const now = Date.now()
            if (
              now - lastProgressRef.current.t >= 30000 &&
              Math.abs(t - lastProgressRef.current.secs) >= 1
            ) {
              lastProgressRef.current = { t: now, secs: t }
              try {
                onProgress({
                  currentTime: t,
                  duration: d,
                  watchedSeconds: Math.floor(watchedRef.current),
                })
              } catch {}
            }
          }
        } catch {}
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [onProgress])

  // Fullscreen change listener. Also drives the mobile landscape lock —
  // when we enter fullscreen on a phone we ask the OS to rotate to
  // landscape, and release it on exit. Browsers that don't support the
  // Screen Orientation API just skip silently.
  useEffect(() => {
    const onFs = () => {
      const isFs = document.fullscreenElement === wrapRef.current
      setFullscreen(isFs)
      try {
        if (isFs) screen.orientation?.lock?.('landscape').catch(() => {})
        else screen.orientation?.unlock?.()
      } catch { /* not supported — fine */ }
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // Tell the rest of the component which control variant to render.
  // Recomputed on resize so toggling the device orientation updates it.
  // We check both width and height to capture mobile landscape orientation.
  const checkNarrow = useCallback(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < 768 || window.innerHeight < 500
  }, [])
  const [isNarrow, setIsNarrow] = useState(checkNarrow())
  useEffect(() => {
    const onResize = () => setIsNarrow(checkNarrow())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [checkNarrow])

  // ---------- Control handlers ----------
  const togglePlay = useCallback(() => {
    const p = playerRef.current; if (!p) return
    if (playing) p.pauseVideo(); else p.playVideo()
  }, [playing])

  const seek = useCallback((sec) => {
    const p = playerRef.current; if (!p) return
    p.seekTo(Math.max(0, Math.min(duration, sec)), true)
    setCurrent(sec)
  }, [duration])

  // Seek by a delta relative to where we are *right now* (not the last
  // polled `current`, which may be up to a frame stale). Used by the
  // double-tap handler and the ±5s buttons.
  //
  // `credit` (seconds) tells the watched-time tracker how much to add
  // for this jump — pass the magnitude of the skip for explicit user
  // actions (button taps, double-tap), zero for silent seeks.
  const seekBy = useCallback((delta, credit = 0) => {
    const p = playerRef.current; if (!p) return
    const now = (typeof p.getCurrentTime === 'function') ? p.getCurrentTime() : current
    const d = (typeof p.getDuration === 'function' && p.getDuration()) || duration
    const next = Math.max(0, Math.min(d || 0, now + delta))
    if (credit > 0) pendingSkipCreditRef.current = credit
    p.seekTo(next, true)
    setCurrent(next)
  }, [current, duration])

  const onScrubberClick = (e) => {
    const bar = e.currentTarget
    const rect = bar.getBoundingClientRect()
    // RTL-aware: in RTL, x=0 is on the right.
    const isRtl = getComputedStyle(bar).direction === 'rtl'
    const ratio = isRtl
      ? (rect.right - e.clientX) / rect.width
      : (e.clientX - rect.left) / rect.width
    seek(Math.max(0, Math.min(1, ratio)) * duration)
  }

  const toggleMute = () => {
    const p = playerRef.current; if (!p) return
    if (muted) { p.unMute(); setMuted(false) } else { p.mute(); setMuted(true) }
  }
  const onVolume = (v) => {
    const p = playerRef.current; if (!p) return
    const val = parseInt(v, 10)
    p.setVolume(val); setVolume(val)
    if (val === 0) { p.mute(); setMuted(true) }
    else if (muted) { p.unMute(); setMuted(false) }
  }

  const pickQuality = (q) => {
    userSelectedQualityRef.current = true
    if (typeof window !== 'undefined') {
      localStorage.setItem('masaar_student_quality', q)
    }
    const p = playerRef.current; if (!p) return
    try { p.setPlaybackQuality(q) } catch {}
    setQuality(q); setMenuOpen(false)
  }

  const pickRate = (r) => {
    const p = playerRef.current; if (!p) return
    try { p.setPlaybackRate(r) } catch {}
    setRate(r); setRateMenuOpen(false)
  }

  const toggleFullscreen = () => {
    const el = wrapRef.current; if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen?.()
  }

  const pct = duration ? (current / duration) * 100 : 0
  const bufPct = duration ? (buffered / duration) * 100 : 0

  // ---------- Render ----------
  return (
    <div
      ref={wrapRef}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: fullscreen ? 'auto' : '16 / 9',
        height: fullscreen ? '100%' : 'auto',
        background: '#000',
        borderRadius: fullscreen ? 0 : 12,
        overflow: 'hidden',
        direction: 'ltr',
        fontFamily: 'inherit',
        userSelect: 'none',
        // In fullscreen the wrapper IS the viewport, so make sure
        // the iframe gets the full height (some Android browsers
        // collapse 100% inside :fullscreen otherwise).
        ...(fullscreen ? { display: 'flex', flexDirection: 'column' } : null),
      }}
    >
      {/* The YT iframe mounts here inside a persistent crop container.
          This shifts YouTube's top channel/title bar and bottom watermark/controls
          completely outside the overflow:hidden wrapper on both mobile and desktop. */}
      <div
        className="ytp-crop-wrapper"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: fullscreen ? 0 : (isNarrow ? '-64px' : '-48px'),
          height: fullscreen ? '100%' : (isNarrow ? 'calc(100% + 128px)' : 'calc(100% + 96px)'),
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div ref={hostRef} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
      </div>

      {/* Clickable transparent layer — catches clicks so YouTube's
          in-frame overlays (title, share, channel) are unreachable.

          Tap behaviour:
            • single tap  → play / pause
            • double tap on LEFT half  → rewind 10s
            • double tap on RIGHT half → forward 10s
          We roll our own double-tap detection instead of using the
          DOM's `onDoubleClick` because we need to know which side
          was tapped AND fire on the second tap (not wait for dblclick
          delay). Fullscreen lives on the dedicated button now. */}
      <div
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const x = e.clientX - rect.left
          const side = x < rect.width / 2 ? 'left' : 'right'
          const now = Date.now()
          const last = lastTapRef.current
          if (last.t && now - last.t < DOUBLE_TAP_MS && last.side === side) {
            // Double-tap: seek and flash, suppress play/pause.
            // Credit the SEEK_STEP magnitude as watched (intentional UI action).
            const delta = side === 'left' ? -SEEK_STEP : SEEK_STEP
            seekBy(delta, SEEK_STEP)
            setSeekFlash({ side, key: now })
            lastTapRef.current = { t: 0, side: null }
            return
          }
          lastTapRef.current = { t: now, side }
          // Delay single-tap action so a follow-up tap can cancel it.
          const myTs = now
          setTimeout(() => {
            if (lastTapRef.current.t === myTs) {
              togglePlay()
              lastTapRef.current = { t: 0, side: null }
            }
          }, DOUBLE_TAP_MS)
        }}
        style={{
          position: 'absolute',
          inset: 0,
          // bottom band is the controls area — let events through to them
          bottom: isNarrow ? 40 : 56,
          cursor: 'pointer',
          background: 'transparent',
          zIndex: 2,
        }}
      />

      {/* Double-tap seek flash overlay — half-circle badge on the
          tapped side that fades out in ~600ms. Keyed so repeated
          taps restart the animation. */}
      {seekFlash && (
        <div
          key={seekFlash.key}
          onAnimationEnd={() => setSeekFlash(null)}
          style={{
            position: 'absolute',
            top: 0, bottom: isNarrow ? 40 : 56,
            [seekFlash.side]: 0,
            width: '35%',
            display: 'grid', placeItems: 'center',
            background: seekFlash.side === 'left'
              ? 'radial-gradient(circle at 100% 50%, rgba(0,0,0,0.55), rgba(0,0,0,0) 70%)'
              : 'radial-gradient(circle at 0% 50%, rgba(0,0,0,0.55), rgba(0,0,0,0) 70%)',
            color: '#fff',
            pointerEvents: 'none',
            zIndex: 3,
            animation: 'ytp-seek-flash 600ms ease-out forwards',
          }}
        >
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 6, fontSize: 14, fontWeight: 600,
          }}>
            <i className={`fas ${seekFlash.side === 'left' ? 'fa-backward' : 'fa-forward'}`}
               style={{ fontSize: 28 }}></i>
            <span>{SEEK_STEP} ثوانٍ</span>
          </div>
          <style>{`
            @keyframes ytp-seek-flash {
              0%   { opacity: 0; transform: scale(0.92); }
              20%  { opacity: 1; transform: scale(1); }
              100% { opacity: 0; transform: scale(1); }
            }
            .ytp-custom-btn {
              transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
            }
            .ytp-custom-btn:hover {
              background: rgba(255, 255, 255, 0.18) !important;
              color: #ffffff !important;
              transform: scale(1.06);
            }
            .ytp-custom-btn:active {
              transform: scale(0.92) !important;
            }
            .ytp-main-play-btn:hover {
              background: var(--primary-hover, var(--primary, #6d28d9)) !important;
              transform: scale(1.1) !important;
              box-shadow: 0 4px 16px var(--primary-glow, rgba(124, 58, 237, 0.6)) !important;
            }
            .ytp-center-play-button:hover {
              transform: translate(-50%, -50%) scale(1.1) !important;
              background: var(--primary, #7c3aed) !important;
              border-color: #ffffff !important;
              box-shadow: 0 12px 36px rgba(0, 0, 0, 0.75), 0 0 32px var(--primary-glow, rgba(124, 58, 237, 0.6)) !important;
            }
            .ytp-center-play-button:active {
              transform: translate(-50%, -50%) scale(0.95) !important;
            }
            .ytp-crop-wrapper iframe,
            .ytp-crop-wrapper > div {
              width: 100% !important;
              height: 100% !important;
              border: none !important;
              pointer-events: none !important;
            }
          `}</style>
        </div>
      )}

      {/* Center play-indicator when paused */}
      {ready && !playing && (
        <button
          onClick={togglePlay}
          aria-label="Play"
          className="ytp-center-play-button"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: isNarrow ? 54 : 64,
            height: isNarrow ? 54 : 64,
            borderRadius: '50%',
            border: '2px solid rgba(255, 255, 255, 0.35)',
            background: 'radial-gradient(circle at 35% 35%, rgba(30, 41, 59, 0.92), rgba(15, 23, 42, 0.98))',
            color: '#fff',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            zIndex: 3,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6), 0 0 24px var(--primary-glow, rgba(124, 58, 237, 0.35))',
            transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 3 }}>
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      )}

      {/* Fixed control bar — always visible */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          height: isNarrow ? 44 : 52,
          padding: isNarrow ? '0 8px' : '0 14px',
          display: 'flex', alignItems: 'center',
          gap: isNarrow ? 6 : 10,
          background: 'linear-gradient(to top, rgba(10,12,18,0.92), rgba(10,12,18,0.6) 70%, rgba(10,12,18,0))',
          color: '#fff',
          zIndex: 4,
        }}
      >
        {/* Left Controls Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isNarrow ? 4 : 6, flexShrink: 0 }}>
          {/* Skip back 5s — counts as watched */}
          <button
            onClick={() => seekBy(-5, 5)}
            aria-label="Back 5 seconds"
            title="إرجاع 5 ثوانٍ"
            className="ytp-custom-btn ytp-skip-btn"
            style={getIconBtnStyle(isNarrow)}
          >
            <IconRewind5 size={isNarrow ? 18 : 20} />
          </button>

          {/* Play / Pause */}
          <button
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
            title={playing ? 'إيقاف مؤقت' : 'تشغيل'}
            className="ytp-custom-btn ytp-main-play-btn"
            style={{
              ...getIconBtnStyle(isNarrow),
              borderRadius: '50%',
              background: 'var(--primary, #7c3aed)',
              color: '#fff',
              boxShadow: '0 2px 8px var(--primary-glow, rgba(124, 58, 237, 0.4))',
            }}
          >
            {playing ? (
              <svg width={isNarrow ? 13 : 15} height={isNarrow ? 13 : 15} viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg width={isNarrow ? 13 : 15} height={isNarrow ? 13 : 15} viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Skip forward 5s — counts as watched */}
          <button
            onClick={() => seekBy(5, 5)}
            aria-label="Forward 5 seconds"
            title="تقديم 5 ثوانٍ"
            className="ytp-custom-btn ytp-skip-btn"
            style={getIconBtnStyle(isNarrow)}
          >
            <IconForward5 size={isNarrow ? 18 : 20} />
          </button>

          {/* Time — hidden on phones to free up width for the scrubber. */}
          {!isNarrow && (
            <span style={{
              fontVariantNumeric: 'tabular-nums',
              fontSize: 12,
              fontWeight: 500,
              color: 'rgba(255, 255, 255, 0.85)',
              marginInlineStart: 8,
              marginInlineEnd: 4,
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}>
              {fmtTime(current)} / {fmtTime(duration)}
            </span>
          )}
        </div>

        {/* Scrubber */}
        <div
          onClick={onScrubberClick}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={current}
          style={{
            flex: 1,
            height: 6,
            background: 'rgba(255,255,255,0.22)',
            borderRadius: 99,
            position: 'relative',
            cursor: 'pointer',
            margin: '0 4px',
          }}
        >
          <div style={{
            position: 'absolute', inset: 0, width: `${bufPct}%`,
            background: 'rgba(255,255,255,0.35)', borderRadius: 99,
          }} />
          <div style={{
            position: 'absolute', inset: 0, width: `${pct}%`,
            background: 'var(--primary, #7c3aed)',
            borderRadius: 99,
          }} />
          <div style={{
            position: 'absolute', left: `calc(${pct}% - 6px)`, top: -3,
            width: 12, height: 12, borderRadius: '50%',
            background: '#fff', boxShadow: '0 0 0 2px rgba(0,0,0,0.5)',
          }} />
        </div>

        {/* Right Controls Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isNarrow ? 4 : 8, flexShrink: 0 }}>
          {/* Volume */}
          {!isNarrow && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} className="ytp-custom-btn" style={getIconBtnStyle(isNarrow)}>
                <i className={`fas ${muted || volume === 0 ? 'fa-volume-xmark' : volume < 40 ? 'fa-volume-low' : 'fa-volume-high'}`}></i>
              </button>
              <input
                type="range" min={0} max={100}
                value={muted ? 0 : volume}
                onChange={(e) => onVolume(e.target.value)}
                style={{
                  width: 64, accentColor: 'var(--primary, #7c3aed)', cursor: 'pointer', height: 4,
                }}
              />
            </div>
          )}

          {/* Playback speed */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setRateMenuOpen(v => !v); setMenuOpen(false) }}
              aria-label="Playback speed"
              title="سرعة التشغيل"
              className="ytp-custom-btn"
              style={{
                ...getIconBtnStyle(isNarrow),
                width: 'auto',
                padding: '0 8px',
                fontSize: 12, fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <i className="fas fa-gauge-high" style={{ fontSize: 11 }}></i>
              <span>{rate === 1 ? '1x' : `${rate}x`}</span>
            </button>
            {rateMenuOpen && (
              <div style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                right: 0,
                minWidth: 120,
                background: 'rgba(20,20,26,0.96)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: '0 10px 24px rgba(0,0,0,0.45)',
              }}>
                <div style={{
                  padding: '8px 12px', fontSize: 11, opacity: 0.6, textTransform: 'uppercase',
                }}>السرعة</div>
                {RATES.map((r) => (
                  <button
                    key={r}
                    onClick={() => pickRate(r)}
                    style={{
                      display: 'flex', width: '100%', justifyContent: 'space-between',
                      alignItems: 'center', gap: 10,
                      padding: '8px 12px',
                      background: r === rate ? 'var(--primary-soft, rgba(124, 58, 237, 0.2))' : 'transparent',
                      color: '#fff', border: 'none', cursor: 'pointer',
                      fontSize: 13, textAlign: 'start',
                    }}
                  >
                    <span>{r === 1 ? 'عادي (1x)' : `${r}x`}</span>
                    {r === rate && <i className="fas fa-check" style={{ color: 'var(--primary, #a78bfa)' }}></i>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quality */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setMenuOpen((v) => !v); setRateMenuOpen(false) }}
              aria-label="Quality"
              title="جودة الفيديو"
              className="ytp-custom-btn ytp-quality-btn"
              style={{
                ...getIconBtnStyle(isNarrow),
                width: 'auto',
                padding: '0 8px',
                fontSize: 12, fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.08)',
              }}
            >
              <i className="fas fa-gear" style={{ fontSize: 11 }}></i>
              <span>{QUALITY_LABEL[quality] || (quality === 'large' ? '480p' : quality === 'medium' ? '360p' : '480p')}</span>
            </button>
            {menuOpen && (
              <div style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                right: 0,
                minWidth: 140,
                background: 'rgba(20,20,26,0.96)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: '0 10px 24px rgba(0,0,0,0.45)',
              }}>
                <div style={{
                  padding: '8px 12px', fontSize: 11, opacity: 0.6, textTransform: 'uppercase',
                }}>الجودة</div>
                {(() => {
                  const order = ['highres','hd2160','hd1440','hd1080','hd720','large','medium','small','tiny']
                  const concrete = order.filter((o) => qualities.includes(o))
                  const list = concrete.length ? concrete : ['large', 'medium', 'small']
                  return list.map((q) => (
                    <button
                      key={q}
                      onClick={() => pickQuality(q)}
                      style={{
                        display: 'flex', width: '100%', justifyContent: 'space-between',
                        alignItems: 'center', gap: 10,
                        padding: '8px 12px',
                        background: q === quality ? 'var(--primary-soft, rgba(124, 58, 237, 0.2))' : 'transparent',
                        color: '#fff', border: 'none', cursor: 'pointer',
                        fontSize: 13, textAlign: 'start',
                      }}
                    >
                      <span>{QUALITY_LABEL[q] || q}</span>
                      {q === quality && <i className="fas fa-check" style={{ color: 'var(--primary, #a78bfa)' }}></i>}
                    </button>
                  ))
                })()}
              </div>
            )}
          </div>

          {/* Fullscreen */}
          <button onClick={toggleFullscreen} aria-label="Fullscreen" title="ملء الشاشة" className="ytp-custom-btn" style={getIconBtnStyle(isNarrow)}>
            <i className={`fas ${fullscreen ? 'fa-compress' : 'fa-expand'}`}></i>
          </button>
        </div>
      </div>

      {/* Block right-click in the controls/overlay too */}
    </div>
  )
}

const getIconBtnStyle = (isNarrow) => ({
  width: isNarrow ? 32 : 36,
  height: isNarrow ? 32 : 36,
  borderRadius: 8,
  border: 'none',
  background: 'transparent',
  color: '#fff',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  flexShrink: 0,
  fontSize: isNarrow ? 12 : 13,
  transition: 'background 0.15s ease, transform 0.15s ease, color 0.15s ease',
})
