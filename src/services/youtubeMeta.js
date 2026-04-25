/* ──────────────────────────────────────────────────────────────
   youtubeMeta — fetch metadata (just duration for now) about a
   YouTube video WITHOUT needing the YouTube Data API v3 key.

   We spin up a hidden YT IFrame player, wait for onReady, read
   getDuration(), then destroy the player. Cheap and works for any
   public video. Results are cached per session so a report page
   that lists 50 parts only pays the cost once per unique videoId.
   ────────────────────────────────────────────────────────────── */

// Load the YouTube IFrame API once per page (same promise shape as
// YouTubePlayer.jsx; we duplicate the tiny loader to avoid coupling).
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

// In-memory cache: videoId -> seconds. Keeps ping-pong between report
// renders to a single lookup per video for the life of the tab.
const durationCache = new Map()
// In-flight promises so concurrent callers share one probe per videoId.
const durationInflight = new Map()

export async function getYoutubeDuration(videoId) {
  if (!videoId) return 0
  if (durationCache.has(videoId)) return durationCache.get(videoId)
  if (durationInflight.has(videoId)) return durationInflight.get(videoId)

  const p = (async () => {
    const YT = await loadYouTubeApi()

    // Hidden mount point — absolutely-positioned offscreen so it never
    // renders on top of the report UI. We destroy it as soon as we have
    // the duration.
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;opacity:0;'
    document.body.appendChild(host)

    // Wrap in a Promise that resolves on onReady or times out after 8s.
    const seconds = await new Promise((resolve) => {
      let done = false
      const finish = (val) => {
        if (done) return
        done = true
        try { player?.destroy?.() } catch {}
        try { host.remove() } catch {}
        resolve(val)
      }
      const player = new YT.Player(host, {
        videoId,
        width: 1,
        height: 1,
        playerVars: {
          autoplay: 0, controls: 0, disablekb: 1, fs: 0,
          iv_load_policy: 3, modestbranding: 1, rel: 0, playsinline: 1,
        },
        events: {
          onReady: (e) => {
            const d = Number(e.target.getDuration?.() || 0)
            // Some videos return 0 on the first onReady — give it one
            // extra frame to stabilise before accepting 0.
            if (d > 0) finish(d)
            else setTimeout(() => finish(Number(e.target.getDuration?.() || 0)), 350)
          },
          onError: () => finish(0),
        },
      })
      // Hard timeout so a blocked iframe doesn't wedge the caller.
      setTimeout(() => finish(0), 8000)
    })

    durationCache.set(videoId, seconds)
    durationInflight.delete(videoId)
    return seconds
  })()

  durationInflight.set(videoId, p)
  return p
}

// Convenience: batch probe. Returns a Map<videoId, seconds>. Dedupes
// null/empty ids. Concurrency is bounded so we don't spawn 50 iframes
// at once on report pages with many parts.
export async function getYoutubeDurations(videoIds, concurrency = 4) {
  const ids = [...new Set((videoIds || []).filter(Boolean))]
  const out = new Map()
  let i = 0
  const workers = Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
    while (i < ids.length) {
      const idx = i++
      const id = ids[idx]
      try { out.set(id, await getYoutubeDuration(id)) } catch { out.set(id, 0) }
    }
  })
  await Promise.all(workers)
  return out
}
