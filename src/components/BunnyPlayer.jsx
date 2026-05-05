import React, { useEffect, useRef, useState } from 'react'
import { getBunnySignedUrl } from '@backend/bunnyApi'

/* ──────────────────────────────────────────────────────────────
   BunnyPlayer — embeds a token-signed Bunny Stream iframe.

   Props mirror YouTubePlayer / DrivePlayer so Videos.jsx can swap
   players based on part.source:
     partId                 — video_parts.id (server uses this to authorize)
     initialWatchedSeconds  — passed for parity (Bunny resumes natively)
     onProgress({ watchedSeconds })

   Security notes:
     • The signed URL is fetched per-mount and never cached client-side.
     • We don't render a fallback URL; if signing fails, the player
       refuses to load.
   ────────────────────────────────────────────────────────────── */

export default function BunnyPlayer({ partId, onProgress }) {
  const [src, setSrc] = useState(null)
  const [error, setError] = useState(null)
  const lastReportRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    setError(null)
    if (!partId) return
    getBunnySignedUrl({ partId })
      .then(({ url }) => { if (!cancelled) setSrc(url) })
      .catch((e) => { if (!cancelled) setError(e?.message || 'تعذر تحميل الفيديو') })
    return () => { cancelled = true }
  }, [partId])

  // Bunny Stream's iframe broadcasts 'timeupdate' events via postMessage.
  // We throttle reports to onProgress to once every 5s so we don't hammer
  // the database with every browser tick.
  useEffect(() => {
    if (!onProgress) return
    const handler = (e) => {
      if (typeof e?.data !== 'object' || e.data == null) return
      // Bunny dispatches { type, data } where data is e.g. { currentTime }.
      const t = e.data
      const ct =
        t.eventName === 'timeupdate'
          ? Number(t.currentTime)
          : (t.type === 'timeupdate' ? Number(t.data?.currentTime) : NaN)
      if (!Number.isFinite(ct)) return
      const now = Date.now()
      if (now - lastReportRef.current < 5000) return
      lastReportRef.current = now
      onProgress({ watchedSeconds: Math.floor(ct) })
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [onProgress])

  if (error) {
    return (
      <div className="placeholder-video" style={{ color: '#e53e3e' }}>
        <i className="fas fa-triangle-exclamation"></i> {error}
      </div>
    )
  }
  if (!src) {
    return (
      <div className="placeholder-video">
        <i className="fas fa-spinner fa-spin"></i> جاري التحميل…
      </div>
    )
  }
  return (
    <iframe
      src={src}
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      style={{ width: '100%', aspectRatio: '16/9', border: 0, borderRadius: 8 }}
      title="فيديو"
    />
  )
}
