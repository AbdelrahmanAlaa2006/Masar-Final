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

export default function YouTubePlayer({
  videoId,
  onEnded,
  onReady,
  startMuted = false,
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
  const [quality, setQuality]   = useState('auto')
  const [fullscreen, setFullscreen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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
          autoplay:        0,
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
            try {
              const qs = e.target.getAvailableQualityLevels?.() || []
              setQualities(qs)
            } catch {}
            if (typeof onReady === 'function') onReady(e.target)
          },
          onStateChange: (e) => {
            const YTs = window.YT.PlayerState
            if (e.data === YTs.PLAYING)   setPlaying(true)
            if (e.data === YTs.PAUSED)    setPlaying(false)
            if (e.data === YTs.BUFFERING) setPlaying(true)
            if (e.data === YTs.ENDED) {
              setPlaying(false)
              if (typeof onEnded === 'function') onEnded()
            }
            // Duration sometimes only resolves after first PLAY event.
            const d = e.target.getDuration?.() || 0
            if (d && d !== duration) setDuration(d)
          },
          onPlaybackQualityChange: (e) => {
            setQuality(e.data || 'auto')
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

  // Time + buffer polling loop (YT has no time-update event).
  useEffect(() => {
    function tick() {
      const p = playerRef.current
      if (p && typeof p.getCurrentTime === 'function') {
        try {
          setCurrent(p.getCurrentTime() || 0)
          const frac = p.getVideoLoadedFraction?.() || 0
          setBuffered((p.getDuration?.() || 0) * frac)
        } catch {}
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // Fullscreen change listener (OS-level Esc still works).
  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === wrapRef.current)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

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
    const p = playerRef.current; if (!p) return
    try { p.setPlaybackQuality(q) } catch {}
    setQuality(q); setMenuOpen(false)
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
      }}
    >
      {/* The YT iframe mounts here. Controls are layered above. */}
      <div ref={hostRef} style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
      }} />

      {/* Clickable transparent layer — catches clicks so YouTube's
          in-frame overlays (title, share, channel) are unreachable.
          Clicking toggles play/pause. */}
      <div
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        style={{
          position: 'absolute',
          inset: 0,
          // bottom band is the controls area — let events through to them
          bottom: 56,
          cursor: 'pointer',
          background: 'transparent',
          zIndex: 2,
        }}
      />

      {/* Center play-indicator when paused */}
      {ready && !playing && (
        <button
          onClick={togglePlay}
          aria-label="Play"
          style={{
            position: 'absolute', left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 72, height: 72, borderRadius: '50%',
            border: 'none',
            background: 'rgba(0,0,0,0.55)',
            color: '#fff', fontSize: 28, cursor: 'pointer',
            display: 'grid', placeItems: 'center',
            zIndex: 3,
            backdropFilter: 'blur(4px)',
          }}
        >
          <i className="fas fa-play" style={{ marginInlineStart: 4 }}></i>
        </button>
      )}

      {/* Fixed control bar — always visible */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          height: 56,
          padding: '0 12px',
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.15))',
          color: '#fff',
          zIndex: 4,
        }}
      >
        {/* Play / Pause */}
        <button
          onClick={togglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          style={iconBtn}
        >
          <i className={`fas ${playing ? 'fa-pause' : 'fa-play'}`}></i>
        </button>

        {/* Time */}
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, opacity: 0.9 }}>
          {fmtTime(current)} / {fmtTime(duration)}
        </span>

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
          }}
        >
          <div style={{
            position: 'absolute', inset: 0, width: `${bufPct}%`,
            background: 'rgba(255,255,255,0.35)', borderRadius: 99,
          }} />
          <div style={{
            position: 'absolute', inset: 0, width: `${pct}%`,
            background: 'linear-gradient(90deg,#667eea,#c53030)',
            borderRadius: 99,
          }} />
          <div style={{
            position: 'absolute', left: `calc(${pct}% - 6px)`, top: -3,
            width: 12, height: 12, borderRadius: '50%',
            background: '#fff', boxShadow: '0 0 0 2px rgba(0,0,0,0.5)',
          }} />
        </div>

        {/* Volume */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} style={iconBtn}>
            <i className={`fas ${muted || volume === 0 ? 'fa-volume-xmark' : volume < 40 ? 'fa-volume-low' : 'fa-volume-high'}`}></i>
          </button>
          <input
            type="range" min={0} max={100}
            value={muted ? 0 : volume}
            onChange={(e) => onVolume(e.target.value)}
            style={{
              width: 70, accentColor: '#c53030', cursor: 'pointer',
            }}
          />
        </div>

        {/* Quality */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Quality"
            style={{
              ...iconBtn,
              width: 'auto', padding: '0 10px', fontSize: 12, fontWeight: 600,
            }}
          >
            <i className="fas fa-gear" style={{ marginInlineEnd: 6 }}></i>
            {QUALITY_LABEL[quality] || 'Auto'}
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
              {(qualities.length ? qualities : ['auto']).map((q) => (
                <button
                  key={q}
                  onClick={() => pickQuality(q)}
                  style={{
                    display: 'flex', width: '100%', justifyContent: 'space-between',
                    alignItems: 'center', gap: 10,
                    padding: '8px 12px',
                    background: q === quality ? 'rgba(197,48,48,0.2)' : 'transparent',
                    color: '#fff', border: 'none', cursor: 'pointer',
                    fontSize: 13, textAlign: 'start',
                  }}
                >
                  <span>{QUALITY_LABEL[q] || q}</span>
                  {q === quality && <i className="fas fa-check" style={{ color: '#f56565' }}></i>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Fullscreen */}
        <button onClick={toggleFullscreen} aria-label="Fullscreen" style={iconBtn}>
          <i className={`fas ${fullscreen ? 'fa-compress' : 'fa-expand'}`}></i>
        </button>
      </div>

      {/* Block right-click in the controls/overlay too */}
    </div>
  )
}

const iconBtn = {
  width: 36, height: 36,
  borderRadius: 8,
  border: 'none',
  background: 'transparent',
  color: '#fff',
  cursor: 'pointer',
  display: 'grid', placeItems: 'center',
  fontSize: 14,
  transition: 'background 0.12s',
}
