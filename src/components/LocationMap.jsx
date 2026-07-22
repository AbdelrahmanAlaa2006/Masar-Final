import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './LocationMap.css'

/* ---------------------------------------------------------------------------
   LocationMap — a free, always-rendering interactive branch map (Leaflet +
   OpenStreetMap/CARTO tiles, no API key). Replaces the Google `output=embed`
   iframe that rendered blank off-domain.

   - One map, a marker per branch (with a name tooltip).
   - Clicking a marker calls onSelect(index).
   - When `selected` changes, the map flies to that branch and opens its popup.
   - The active marker uses the tenant's --primary colour; others are muted.

   Colours come from CSS custom properties resolved at mount (Leaflet markers
   are plain DOM, so we read the computed --primary off the container).
   --------------------------------------------------------------------------- */

function pinIcon(color, active) {
  const size = active ? 42 : 30
  const html = `
    <div class="lm-pin ${active ? 'lm-pin--active' : ''}" style="--lm-pin:${color}">
      <span class="lm-pin__dot"><i class="fas fa-graduation-cap"></i></span>
      <span class="lm-pin__stem"></span>
    </div>`
  return L.divIcon({
    className: 'lm-pin-wrap',
    html,
    iconSize: [size, size + 10],
    iconAnchor: [size / 2, size + 8],
    popupAnchor: [0, -size],
  })
}

export default function LocationMap({ branches = [], selected = 0, onSelect }) {
  const elRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const primaryRef = useRef('#7c3aed')

  const points = branches
    .map((b, i) => ({ ...b, i }))
    .filter(b => b.lat != null && b.lng != null)

  // Init the map once.
  useEffect(() => {
    if (!elRef.current || mapRef.current || points.length === 0) return
    const cs = getComputedStyle(elRef.current)
    primaryRef.current = cs.getPropertyValue('--primary').trim() || '#7c3aed'

    const map = L.map(elRef.current, {
      scrollWheelZoom: false,
      attributionControl: true,
      zoomControl: true,
    })
    mapRef.current = map

    // Google Maps Standard tiles for high detail in Egypt
    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      attribution: '© Google Maps',
      maxZoom: 20,
    }).addTo(map)

    markersRef.current = points.map((p) => {
      const m = L.marker([p.lat, p.lng], { icon: pinIcon(primaryRef.current, false) }).addTo(map)
      m.bindPopup(`<strong>${p.name || ''}</strong>${p.address ? `<br><span>${String(p.address).split('\n')[0]}</span>` : ''}`, { closeButton: false })
      m.on('click', () => onSelect && onSelect(p.i))
      return { marker: m, i: p.i }
    })

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 18)
    } else {
      map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng])).pad(0.25))
    }

    // Leaflet needs a size recalc once its container has real dimensions.
    setTimeout(() => map.invalidateSize(), 200)
    return () => { map.remove(); mapRef.current = null; markersRef.current = [] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length])

  // React to selection changes: recolor markers + fly to the active one.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const primary = primaryRef.current
    markersRef.current.forEach(({ marker, i }) => {
      marker.setIcon(pinIcon(primary, i === selected))
      marker.setZIndexOffset(i === selected ? 1000 : 0)
    })
    const active = markersRef.current.find(m => m.i === selected)
    if (active) {
      const ll = active.marker.getLatLng()
      map.flyTo(ll, Math.max(map.getZoom(), 18), { duration: 0.6 })
      active.marker.openPopup()
    }
  }, [selected])

  if (points.length === 0) return null
  return <div ref={elRef} className="lm-map" role="region" aria-label="خريطة الفروع" />
}
