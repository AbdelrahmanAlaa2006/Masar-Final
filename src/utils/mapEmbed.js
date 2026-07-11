/* Convert whatever Google Maps link an admin pastes into an embeddable
   iframe URL — or null when embedding is impossible.

   - Proper embed links (…/maps/embed?pb=…, output=embed) pass through.
   - Long links with coordinates (…/@31.03,30.42,17z/…) or a place/query are
     converted to the universal `output=embed` form.
   - Short share links (maps.app.goo.gl/…) CANNOT be embedded (Google blocks
     framing after the redirect) → null. They still work as directions links. */
export function toMapEmbed(url) {
  const u = String(url || '').trim()
  if (!u) return null
  if (u.includes('/maps/embed') || u.includes('output=embed')) return u

  // Short share links redirect to google.com/maps which denies framing
  if (/(^|\.)goo\.gl\//.test(u) || u.includes('maps.app.goo.gl')) return null

  // Coordinates in the path: .../@31.0379,30.4272,17z/...
  const at = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (at) return `https://maps.google.com/maps?q=${at[1]},${at[2]}&z=16&output=embed`

  // Place name in the path: .../maps/place/<name>/...
  const place = u.match(/\/maps\/place\/([^/]+)/)
  if (place) return `https://maps.google.com/maps?q=${place[1]}&z=16&output=embed`

  // Query param: ...?q=<something>
  const q = u.match(/[?&]q=([^&]+)/)
  if (q) return `https://maps.google.com/maps?q=${q[1]}&z=16&output=embed`

  return null
}
