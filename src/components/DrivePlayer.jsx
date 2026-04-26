import React, { useEffect, useRef, useState, useCallback } from 'react'

/* ──────────────────────────────────────────────────────────────
   DrivePlayer — HTML5 <video> based player for Google-Drive-hosted
   files. Matches YouTubePlayer's API + look so the rest of the app
   doesn't have to special-case anything:

     Props:
       driveId               — the Drive file id (the part between
                                /file/d/  and  /view in the share URL)
       initialWatchedSeconds — seed the watched-time counter
       onProgress            — fired (~5s throttle) with watched seconds
       onEnded / onReady     — same as YouTubePlayer

   Features mirrored from YouTubePlayer:
     • play / pause                                ✓
     • ±5s skip buttons (count as watched)         ✓
     • double-tap left/right to seek ±10s          ✓ (count as watched)
     • scrubber (mouse-scrub doesn't credit time)  ✓
     • volume + mute slider                        ✓
     • playback speed (0.5x → 2x)                  ✓
     • fullscreen                                  ✓
     • watch-time tracking (anti-pull-to-end)      ✓

   IMPORTANT for admins setting this up:
     The Drive file MUST be set to "Anyone with the link can view".
     We hit Drive's `uc?export=download&id=…` endpoint which streams
     the file directly. For very large files Drive may show a virus-
     scan interstitial — keep individual parts under ~100MB to avoid
     that.
   ────────────────────────────────────────────────────────────── */

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const mm = String(m).padStart(h ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// Build a URL the <video> element can stream from. We try the
// "preview" endpoint first since it's the friendliest with Drive's
// CORS rules; the `uc?export=download` endpoint is the fallback.
function driveStreamUrl(id) {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

export default function DrivePlayer({
  driveId,
  onEnded,
  onReady,
  onProgress,
  startMuted = false,
  initialWatchedSeconds = 0,
}) {
  const videoRef = useRef(null)
  const wrapRef  = useRef(null)
  const rafRef   = useRef(null)

  const [ready, setReady]       = useState(false)
  const [playing, setPlaying]   = useState(false)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent]   = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [muted, setMuted]       = useState(startMuted)
  const [volume, setVolume]     = useState(100)
  const [rate, setRate]         = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [rateMenuOpen, setRateMenuOpen] = useState(false)
  const [errored, setErrored]   = useState(false)

  // Double-tap detection (mirrors YouTubePlayer)
  const lastTapRef = useRef({ t: 0, side: null })
  const [seekFlash, setSeekFlash] = useState(null)
  const DOUBLE_TAP_MS = 280
  const SEEK_STEP = 10

  // Watch-time tracking — same algorithm as YouTubePlayer:
  //   • during natural playback, credit (Δreal × rate) capped at Δvideo
  //   • on jumps, only credit if pendingSkipCreditRef has a value (that
  //     ref is set by our ±5s buttons and the double-tap handler)
  //   • mouse scrub gives ZERO credit → pulling to the end yields 0%
  const watchedRef            = useRef(initialWatchedSeconds || 0)
  const lastTickRef           = useRef({ realMs: 0, videoSec: 0 })
  const pendingSkipCreditRef  = useRef(0)
  const lastProgressRef       = useRef({ t: 0, secs: 0 })

  // Initial load wiring
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onLoaded = () => {
      setReady(true)
      setDuration(v.duration || 0)
      if (typeof onReady === 'function') onReady(v)
    }
    const onPlay  = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEndedFn = () => {
      setPlaying(false)
      if (typeof onEnded === 'function') onEnded()
    }
    const onErr = () => setErrored(true)
    const onProgressEvt = () => {
      try {
        const r = v.buffered
        if (r && r.length) setBuffered(r.end(r.length - 1))
      } catch {}
    }
    v.addEventListener('loadedmetadata', onLoaded)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('ended', onEndedFn)
    v.addEventListener('error', onErr)
    v.addEventListener('progress', onProgressEvt)
    if (startMuted) { v.muted = true; setMuted(true) }
    return () => {
      v.removeEventListener('loadedmetadata', onLoaded)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('ended', onEndedFn)
      v.removeEventListener('error', onErr)
      v.removeEventListener('progress', onProgressEvt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveId])

  // Tick loop for watch-time tracking + UI updates
  useEffect(() => {
    function tick() {
      const v = videoRef.current
      if (v) {
        const t  = v.currentTime || 0
        const d  = v.duration || 0
        const rt = v.playbackRate || 1
        setCurrent(t)
        const isPlayingNow = !v.paused && !v.ended && v.readyState >= 2

        const nowMs = performance.now()
        const last = lastTickRef.current
        if (last.realMs && isPlayingNow) {
          const dReal  = (nowMs - last.realMs) / 1000
          const dVideo = t - last.videoSec
          const expected = dReal * rt
          if (Math.abs(dVideo - expected) <= 1.0 && dVideo >= 0) {
            watchedRef.current += Math.min(expected, Math.max(0, dVideo))
          } else {
            const credit = pendingSkipCreditRef.current
            if (credit > 0) {
              watchedRef.current += credit
              pendingSkipCreditRef.current = 0
            }
            // mouse-scrub jumps fall through with zero credit
          }
        }
        lastTickRef.current = { realMs: nowMs, videoSec: t }

        // Throttled progress emission
        if (typeof onProgress === 'function') {
          const now = Date.now()
          if (
            now - lastProgressRef.current.t >= 5000 &&
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
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [onProgress])

  // Fullscreen change listener
  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === wrapRef.current)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // ── Controls ──────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current; if (!v) return
    if (v.paused) v.play().catch(() => {}); else v.pause()
  }, [])

  const seek = useCallback((sec) => {
    const v = videoRef.current; if (!v) return
    v.currentTime = Math.max(0, Math.min(v.duration || 0, sec))
    setCurrent(v.currentTime)
  }, [])

  const seekBy = useCallback((delta, credit = 0) => {
    const v = videoRef.current; if (!v) return
    const now = v.currentTime || 0
    const d = v.duration || 0
    const next = Math.max(0, Math.min(d, now + delta))
    if (credit > 0) pendingSkipCreditRef.current = credit
    v.currentTime = next
    setCurrent(next)
  }, [])

  const onScrubberClick = (e) => {
    const bar = e.currentTarget
    const rect = bar.getBoundingClientRect()
    const isRtl = getComputedStyle(bar).direction === 'rtl'
    const ratio = isRtl
      ? (rect.right - e.clientX) / rect.width
      : (e.clientX - rect.left) / rect.width
    seek(Math.max(0, Math.min(1, ratio)) * duration)
  }

  const toggleMute = () => {
    const v = videoRef.current; if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }
  const onVolume = (val) => {
    const v = videoRef.current; if (!v) return
    const n = parseInt(val, 10)
    v.volume = Math.max(0, Math.min(1, n / 100))
    setVolume(n)
    if (n === 0) { v.muted = true; setMuted(true) }
    else if (muted) { v.muted = false; setMuted(false) }
  }
  const pickRate = (r) => {
    const v = videoRef.current; if (!v) return
    v.playbackRate = r
    setRate(r); setRateMenuOpen(false)
  }
  const toggleFullscreen = () => {
    const el = wrapRef.current; if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen?.()
  }

  const pct = duration ? (current / duration) * 100 : 0
  const bufPct = duration ? (buffered / duration) * 100 : 0

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
      <video
        ref={videoRef}
        src={driveStreamUrl(driveId)}
        playsInline
        preload="metadata"
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          background: '#000',
          objectFit: 'contain',
        }}
      />

      {/* Tap layer — single tap toggles play, double tap seeks */}
      <div
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const x = e.clientX - rect.left
          const side = x < rect.width / 2 ? 'left' : 'right'
          const now = Date.now()
          const last = lastTapRef.current
          if (last.t && now - last.t < DOUBLE_TAP_MS && last.side === side) {
            const delta = side === 'left' ? -SEEK_STEP : SEEK_STEP
            seekBy(delta, SEEK_STEP)
            setSeekFlash({ side, key: now })
            lastTapRef.current = { t: 0, side: null }
            return
          }
          lastTapRef.current = { t: now, side }
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
          bottom: 56,
          cursor: 'pointer',
          background: 'transparent',
          zIndex: 2,
        }}
      />

      {/* Double-tap flash */}
      {seekFlash && (
        <div
          key={seekFlash.key}
          onAnimationEnd={() => setSeekFlash(null)}
          style={{
            position: 'absolute',
            top: 0, bottom: 56,
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
          <style>{`@keyframes ytp-seek-flash {
            0%   { opacity: 0; transform: scale(0.92); }
            20%  { opacity: 1; transform: scale(1); }
            100% { opacity: 0; transform: scale(1); }
          }`}</style>
        </div>
      )}

      {/* Center play indicator */}
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

      {/* Error state — Drive blocked the file */}
      {errored && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 5,
          display: 'grid', placeItems: 'center',
          background: 'rgba(0,0,0,0.85)',
          color: '#fff', textAlign: 'center', padding: 16,
        }}>
          <div>
            <i className="fas fa-triangle-exclamation" style={{ fontSize: 32, color: '#fbbf24' }}></i>
            <h3 style={{ margin: '12px 0 4px' }}>تعذر تشغيل الفيديو من Google Drive</h3>
            <p style={{ opacity: 0.85, fontSize: 13, maxWidth: 420 }}>
              تأكد من ضبط الملف على «أي شخص لديه الرابط يمكنه العرض»،
              وأن حجم الملف أقل من 100MB.
            </p>
          </div>
        </div>
      )}

      {/* Control bar */}
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
        <button
          onClick={() => seekBy(-5, 5)}
          title="إرجاع 5 ثوانٍ"
          style={{ ...iconBtn, position: 'relative' }}
        >
          <i className="fas fa-rotate-left"></i>
          <span style={{ position: 'absolute', fontSize: 8, fontWeight: 800, marginTop: 1 }}>5</span>
        </button>

        <button onClick={togglePlay} style={iconBtn}>
          <i className={`fas ${playing ? 'fa-pause' : 'fa-play'}`}></i>
        </button>

        <button
          onClick={() => seekBy(5, 5)}
          title="تقديم 5 ثوانٍ"
          style={{ ...iconBtn, position: 'relative' }}
        >
          <i className="fas fa-rotate-right"></i>
          <span style={{ position: 'absolute', fontSize: 8, fontWeight: 800, marginTop: 1 }}>5</span>
        </button>

        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, opacity: 0.9 }}>
          {fmtTime(current)} / {fmtTime(duration)}
        </span>

        <div
          onClick={onScrubberClick}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={current}
          style={{
            flex: 1, height: 6,
            background: 'rgba(255,255,255,0.22)', borderRadius: 99,
            position: 'relative', cursor: 'pointer',
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={toggleMute} style={iconBtn}>
            <i className={`fas ${muted || volume === 0 ? 'fa-volume-xmark' : volume < 40 ? 'fa-volume-low' : 'fa-volume-high'}`}></i>
          </button>
          <input
            type="range" min={0} max={100}
            value={muted ? 0 : volume}
            onChange={(e) => onVolume(e.target.value)}
            style={{ width: 70, accentColor: '#c53030', cursor: 'pointer' }}
          />
        </div>

        {/* Playback speed */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setRateMenuOpen(v => !v)}
            title="سرعة التشغيل"
            style={{ ...iconBtn, width: 'auto', padding: '0 10px', fontSize: 12, fontWeight: 700 }}
          >
            <i className="fas fa-gauge-high" style={{ marginInlineEnd: 6 }}></i>
            {rate === 1 ? '1x' : `${rate}x`}
          </button>
          {rateMenuOpen && (
            <div style={{
              position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
              minWidth: 120,
              background: 'rgba(20,20,26,0.96)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, overflow: 'hidden',
              boxShadow: '0 10px 24px rgba(0,0,0,0.45)',
            }}>
              <div style={{ padding: '8px 12px', fontSize: 11, opacity: 0.6, textTransform: 'uppercase' }}>السرعة</div>
              {RATES.map((r) => (
                <button
                  key={r}
                  onClick={() => pickRate(r)}
                  style={{
                    display: 'flex', width: '100%', justifyContent: 'space-between',
                    alignItems: 'center', gap: 10, padding: '8px 12px',
                    background: r === rate ? 'rgba(197,48,48,0.2)' : 'transparent',
                    color: '#fff', border: 'none', cursor: 'pointer',
                    fontSize: 13, textAlign: 'start',
                  }}
                >
                  <span>{r === 1 ? 'عادي (1x)' : `${r}x`}</span>
                  {r === rate && <i className="fas fa-check" style={{ color: '#f56565' }}></i>}
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={toggleFullscreen} style={iconBtn}>
          <i className={`fas ${fullscreen ? 'fa-compress' : 'fa-expand'}`}></i>
        </button>
      </div>
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
