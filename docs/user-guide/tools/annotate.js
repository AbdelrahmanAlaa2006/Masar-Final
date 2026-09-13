/**
 * Capture-time annotation layer.
 *
 * Draws a highlight ring around a real UI element plus a curved arrow pointing
 * at it, so a reader who is not comfortable with apps can see exactly which
 * control the surrounding instructions mean.
 *
 * Positions are measured from the live element, never hardcoded, so the marks
 * always land on the right control even if the layout shifts. Like redact.js
 * this is injected into the page at screenshot time and is never part of the
 * application.
 */
window.__GUIDE_ANNOTATE__ = function annotate(markers) {
  const ACCENT = '#ff4d2e'
  const ID = '__guide_annotation_layer__'

  document.getElementById(ID)?.remove()

  const layer = document.createElement('div')
  layer.id = ID
  Object.assign(layer.style, {
    position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483000',
  })

  const svgNS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNS, 'svg')
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', '100%')
  Object.assign(svg.style, { position: 'absolute', inset: '0', overflow: 'visible' })
  layer.appendChild(svg)

  const find = (m) => {
    let list = []
    if (m.sel) list = [...document.querySelectorAll(m.sel)]
    if (m.text) {
      const scope = m.sel ? list : [...document.querySelectorAll(m.within || 'button, a, div, span, label, h3, input')]
      list = scope.filter((e) => (e.textContent || '').includes(m.text))
      // Prefer the tightest element that still contains the text.
      list = list.filter((e) => !list.some((o) => o !== e && e.contains(o)))
    }
    return list[m.nth || 0] || null
  }

  const vw = window.innerWidth
  const vh = window.innerHeight

  for (const m of markers) {
    const el = find(m)
    if (!el) continue
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue
    if (r.bottom < 0 || r.top > vh) continue

    // ── ring ──
    const pad = m.pad == null ? 5 : m.pad
    const radius = parseFloat(getComputedStyle(el).borderRadius) || 8
    const ring = document.createElement('div')
    Object.assign(ring.style, {
      position: 'absolute',
      left: `${r.left - pad}px`,
      top: `${r.top - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
      border: `3px solid ${ACCENT}`,
      borderRadius: `${Math.min(radius + pad, 22)}px`,
      boxShadow: `0 0 0 3px rgba(255,77,46,.16), 0 2px 10px rgba(255,77,46,.25)`,
      boxSizing: 'border-box',
    })
    layer.appendChild(ring)

    // ── arrow ──
    if (m.arrow === false) continue

    const box = { l: r.left - pad, t: r.top - pad, r: r.right + pad, b: r.bottom + pad }
    const space = { bottom: vh - box.b, top: box.t, left: box.l, right: vw - box.r }
    const dir = m.dir && m.dir !== 'auto'
      ? m.dir
      : ['bottom', 'top', 'left', 'right'].sort((a, b) => space[b] - space[a])[0]

    const LEN = Math.max(46, Math.min(m.len || 86, space[dir] - 14))
    if (LEN < 30) continue

    let tip, tail, ctrl
    const cx = (box.l + box.r) / 2
    const cy = (box.t + box.b) / 2

    if (dir === 'bottom') {
      tip = [cx, box.b + 9]
      tail = [cx - LEN * 0.55, box.b + 9 + LEN]
      ctrl = [cx - LEN * 0.62, box.b + 9 + LEN * 0.34]
    } else if (dir === 'top') {
      tip = [cx, box.t - 9]
      tail = [cx - LEN * 0.55, box.t - 9 - LEN]
      ctrl = [cx - LEN * 0.62, box.t - 9 - LEN * 0.34]
    } else if (dir === 'left') {
      tip = [box.l - 9, cy]
      tail = [box.l - 9 - LEN, cy + LEN * 0.5]
      ctrl = [box.l - 9 - LEN * 0.4, cy + LEN * 0.55]
    } else {
      tip = [box.r + 9, cy]
      tail = [box.r + 9 + LEN, cy + LEN * 0.5]
      ctrl = [box.r + 9 + LEN * 0.4, cy + LEN * 0.55]
    }

    // Keep the tail inside the frame — an arrow running off the edge of a
    // screenshot looks like a rendering fault rather than a pointer.
    const M = 14
    const clampX = (x) => Math.max(M, Math.min(vw - M, x))
    const clampY = (y) => Math.max(M, Math.min(vh - M, y))
    tail = [clampX(tail[0]), clampY(tail[1])]
    ctrl = [clampX(ctrl[0]), clampY(ctrl[1])]

    const path = document.createElementNS(svgNS, 'path')
    path.setAttribute('d', `M ${tail[0]} ${tail[1]} Q ${ctrl[0]} ${ctrl[1]} ${tip[0]} ${tip[1]}`)
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', ACCENT)
    path.setAttribute('stroke-width', '3.6')
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,.28))')
    svg.appendChild(path)

    // Arrowhead, oriented along the curve's final tangent (ctrl → tip).
    const ang = Math.atan2(tip[1] - ctrl[1], tip[0] - ctrl[0])
    const H = 15
    const W = 7.5
    const p1 = [tip[0], tip[1]]
    const p2 = [tip[0] - H * Math.cos(ang) + W * Math.sin(ang), tip[1] - H * Math.sin(ang) - W * Math.cos(ang)]
    const p3 = [tip[0] - H * Math.cos(ang) - W * Math.sin(ang), tip[1] - H * Math.sin(ang) + W * Math.cos(ang)]
    const head = document.createElementNS(svgNS, 'polygon')
    head.setAttribute('points', `${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]}`)
    head.setAttribute('fill', ACCENT)
    head.setAttribute('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,.28))')
    svg.appendChild(head)
  }

  document.body.appendChild(layer)
  return layer.childElementCount
}
