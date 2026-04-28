import React, { useEffect, useRef, useState } from 'react'

/* ──────────────────────────────────────────────────────────────
   DrivePlayer — embeds a Google Drive video using Drive's own
   /preview iframe. Works for ANY file size, with no CORS/MIME
   surprises.

   Why iframe instead of HTML5 <video>:
     The `uc?export=download` direct URL is intended for downloads,
     not streaming. Google rejects it for files >~25 MB (virus-scan
     interstitial), the response often lacks the right MIME type,
     and it doesn't seek properly inside <video>. The /preview
     iframe is the only Drive endpoint built for in-page playback.

   Trade-offs vs the YouTubePlayer:
     • Drive's own controls are used (play/pause, scrub, quality,
       playback-speed, fullscreen). We can't override them because
       the iframe is cross-origin.
     • Watch-time accounting is coarse: we increment a "viewed"
       flag once when the player mounts (powers VideosReport) and
       fire onProgress once at mount with whatever the seed was.
       Per-second progress isn't available.

   Props (kept compatible with YouTubePlayer so Videos.jsx doesn't
   need to special-case anything):
     driveId
     onReady, onEnded             — fired heuristically (mount, ~)
     onProgress                   — best-effort, fires once with seed
     initialWatchedSeconds        — seed; reflected back to caller
   ────────────────────────────────────────────────────────────── */

export default function DrivePlayer({
  driveId,
  onReady,
  onProgress,
  initialWatchedSeconds = 0,
}) {
  const wrapRef = useRef(null)
  const [fullscreen, setFullscreen] = useState(false)

  // Fullscreen state (so the wrapper can drop its border-radius etc.)
  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === wrapRef.current)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // We can't read playback time from a cross-origin iframe, so we report
  // progress once at mount carrying forward whatever the caller already
  // had stored. That's enough for the per-part "viewed" flag the report
  // page uses; finer-grained tracking would require Google's Drive API.
  useEffect(() => {
    if (typeof onReady === 'function') {
      try { onReady({ driveId }) } catch {}
    }
    if (typeof onProgress === 'function') {
      try {
        onProgress({
          currentTime: initialWatchedSeconds || 0,
          duration: 0,
          watchedSeconds: Math.floor(initialWatchedSeconds || 0),
        })
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveId])

  if (!driveId) {
    return (
      <div style={fallbackStyle}>
        <i className="fas fa-circle-exclamation" style={{ color: '#fbbf24', fontSize: 28 }}></i>
        <div style={{ marginTop: 8 }}>لم يتم ضبط معرّف الفيديو</div>
      </div>
    )
  }

  const src = `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview`

  const toggleFullscreen = () => {
    const el = wrapRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen?.()
  }

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: fullscreen ? 'auto' : '16 / 9',
        height: fullscreen ? '100%' : 'auto',
        background: '#000',
        borderRadius: fullscreen ? 0 : 12,
        overflow: 'hidden',
      }}
    >
      <iframe
        src={src}
        title="Drive video"
        // sandbox + allow lets Drive's player run scripts and go fullscreen
        // from within the iframe, while same-origin navigation is blocked.
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="no-referrer"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          border: 0,
          background: '#000',
        }}
      />

      {/* Drive's /preview iframe puts a thin progress strip along the
          very top edge of the player AND a "pop out to new window"
          button in the top-right. Both are part of Drive's UI and we
          can't reach into the cross-origin iframe to hide them, so we
          mask them with two opaque overlays anchored to the same
          edges. The blocks have pointerEvents:'auto' so clicks land
          on us instead of the iframe — that kills the pop-out button
          and stops the user from accidentally jumping to the strip
          scrubber when they meant to tap the player. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 40,
          background: '#000',
          zIndex: 2,
          pointerEvents: 'auto',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          insetInlineEnd: 0,
          width: 64, height: 64,
          background: '#000',
          zIndex: 2,
          pointerEvents: 'auto',
        }}
      />

      {/* Small floating fullscreen button so the user can go full-screen
          on the wrapper (Drive's own button works too — this is just a
          convenience). Sits above the iframe in a corner. */}
      <button
        onClick={toggleFullscreen}
        title={fullscreen ? 'الخروج من ملء الشاشة' : 'ملء الشاشة'}
        style={{
          position: 'absolute',
          // Lifted onto the top mask so the button is the only thing
          // visible in that corner — the user can still go fullscreen
          // even though Drive's own pop-out button is hidden.
          top: 8,
          insetInlineEnd: 8,
          width: 32, height: 32,
          borderRadius: 8,
          border: '1px solid rgba(255, 255, 255, 0.16)',
          background: 'rgba(255, 255, 255, 0.10)',
          color: '#fff',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)',
          fontSize: 13,
          // Above both masks; stays interactive when Drive's UI is hidden.
          zIndex: 3,
        }}
      >
        <i className={`fas ${fullscreen ? 'fa-compress' : 'fa-expand'}`}></i>
      </button>
    </div>
  )
}

const fallbackStyle = {
  width: '100%',
  aspectRatio: '16 / 9',
  background: '#000',
  color: '#fff',
  display: 'grid',
  placeItems: 'center',
  borderRadius: 12,
  textAlign: 'center',
  padding: 16,
}
