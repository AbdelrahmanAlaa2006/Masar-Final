/* Marketing analytics for the company site (gitfekra.com).
 *
 * Two layers, both optional and both fail-silent — analytics must never break
 * a page or slow it down:
 *
 *   1. First-party counting into Supabase (track_site_event). Works with no
 *      third-party account, no cookies, and no personal data: just an event
 *      name, the path, the referrer and a random per-tab id.
 *   2. Google Analytics 4 and the Meta (Facebook) pixel, loaded ONLY when their
 *      ids are set in .env — VITE_GA4_ID / VITE_META_PIXEL_ID. Without ids
 *      nothing third-party is loaded at all.
 *
 * The pixel matters if ads are ever run: Facebook needs it to learn who fills
 * the form, otherwise ad money is spent blind.
 */

import { supabase } from '@backend/supabase'

const GA4_ID = import.meta.env.VITE_GA4_ID || ''
const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID || ''

const SESSION_KEY = 'gf-analytics-session'

const safe = (fn, fallback = null) => {
  try { return fn() } catch { return fallback }
}

// Random id for this tab only. Not tied to a person and never leaves the site.
function sessionId() {
  return safe(() => {
    let id = window.sessionStorage.getItem(SESSION_KEY)
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36)
      window.sessionStorage.setItem(SESSION_KEY, id)
    }
    return id
  }, '')
}

export function getUtm() {
  return safe(() => {
    const p = new URLSearchParams(window.location.search)
    const utm = {}
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const v = p.get(key)
      if (v) utm[key] = v.slice(0, 100)
    }
    return utm
  }, {})
}

let thirdPartyLoaded = false

function loadScript(src) {
  const s = document.createElement('script')
  s.async = true
  s.src = src
  document.head.appendChild(s)
  return s
}

/** Load GA4 / Meta pixel once, only if ids are configured. */
export function initSiteAnalytics() {
  if (thirdPartyLoaded || typeof window === 'undefined') return
  thirdPartyLoaded = true

  if (GA4_ID) {
    safe(() => {
      loadScript(`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`)
      window.dataLayer = window.dataLayer || []
      window.gtag = function gtag() { window.dataLayer.push(arguments) }
      window.gtag('js', new Date())
      window.gtag('config', GA4_ID)
    })
  }

  if (META_PIXEL_ID) {
    safe(() => {
      /* Standard Meta pixel bootstrap, written out rather than eval'd. */
      const fbq = function (...args) {
        if (fbq.callMethod) fbq.callMethod.apply(fbq, args)
        else fbq.queue.push(args)
      }
      fbq.queue = []
      fbq.loaded = true
      fbq.version = '2.0'
      window.fbq = window._fbq = window.fbq || fbq
      loadScript('https://connect.facebook.net/en_US/fbevents.js')
      window.fbq('init', META_PIXEL_ID)
      window.fbq('track', 'PageView')
    })
  }
}

/**
 * Record one event. Never awaited by callers and never throws.
 * `name` must be one of the names the database function accepts, otherwise it
 * is quietly dropped (see 2026_09_17_leads_and_site_events.sql).
 */
export function trackEvent(name, meta = {}) {
  if (typeof window === 'undefined') return

  safe(() => {
    supabase.rpc('track_site_event', {
      p_name: name,
      p_path: window.location.pathname,
      p_referrer: document.referrer || '',
      p_session: sessionId(),
      p_meta: { ...getUtm(), ...meta },
    }).then(() => {}, () => {})
  })

  safe(() => { if (window.gtag) window.gtag('event', name, meta) })
  safe(() => {
    if (!window.fbq) return
    // Lead is a standard Meta event and the one worth optimising ads for.
    if (name === 'lead_submitted') window.fbq('track', 'Lead')
    else if (name === 'whatsapp_click') window.fbq('track', 'Contact')
    else window.fbq('trackCustom', name, meta)
  })
}
