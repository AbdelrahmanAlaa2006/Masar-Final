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

/* Extract { lat, lng } from whatever Google Maps link an admin pasted, for
   plotting a Leaflet marker. Handles the common forms:
     .../@31.0482,30.4649,17z/...        (map center)
     ...!3d31.0398!4d30.4540...          (place pin — preferred, most precise)
     ?q=31.0482,30.4649  /  &query=..    (coordinate query)
   Returns null when no coordinates are present (e.g. short goo.gl links). */
export function toLatLng(url) {
  const u = String(url || '').trim()
  if (!u) return null
  // Place pin (…!3dLAT!4dLNG…) is the actual marker Google placed — prefer it.
  const pin = u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  if (pin) return { lat: parseFloat(pin[1]), lng: parseFloat(pin[2]) }
  const at = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (at) return { lat: parseFloat(at[1]), lng: parseFloat(at[2]) }
  const q = u.match(/[?&](?:q|query)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
  if (q) return { lat: parseFloat(q[1]), lng: parseFloat(q[2]) }
  return null
}
