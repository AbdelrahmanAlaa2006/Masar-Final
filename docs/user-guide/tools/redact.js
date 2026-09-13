/**
 * Capture-time redaction layer for documentation screenshots.
 *
 * This file is NEVER imported by the application. It is injected into a
 * headless Chrome page right before a screenshot is taken, so that the
 * screenshots published in the user guide contain fictional identities
 * instead of the real names, photos, phone numbers and tokens that live in
 * the test tenant.
 *
 * It only rewrites what is already painted in the DOM. It does not call any
 * API, does not write anything back, and does not change application state.
 */
window.__GUIDE_REDACT__ = function redact(map) {
  const entries = Object.entries(map).filter(([from]) => from && from.length > 0)

  const rewrite = (s) => {
    let out = s
    for (const [from, to] of entries) {
      if (out.includes(from)) out = out.split(from).join(to)
    }
    return out
  }

  const walk = (root) => {
    // 1. Text nodes
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const todo = []
    while (it.nextNode()) todo.push(it.currentNode)
    for (const n of todo) {
      const next = rewrite(n.nodeValue)
      if (next !== n.nodeValue) n.nodeValue = next
    }

    // 2. Attributes that surface identity (placeholders, titles, alt, values)
    const els = root.querySelectorAll
      ? root.querySelectorAll('[title],[alt],[placeholder],[aria-label],input')
      : []
    els.forEach((el) => {
      for (const attr of ['title', 'alt', 'placeholder', 'aria-label']) {
        const v = el.getAttribute && el.getAttribute(attr)
        if (v) {
          const next = rewrite(v)
          if (next !== v) el.setAttribute(attr, next)
        }
      }
      if (el.tagName === 'INPUT' && el.value) {
        const next = rewrite(el.value)
        if (next !== el.value) el.value = next
      }
    })

    // 3. Real portraits / avatars → neutral placeholder glyph
    const imgs = root.querySelectorAll ? root.querySelectorAll('img') : []
    imgs.forEach((img) => {
      const src = img.getAttribute('src') || ''
      const isPortrait =
        /\/images\/(profile|me)\.png/i.test(src) ||
        img.classList.contains('aa-img-base') ||
        img.classList.contains('mh__avatar-img') ||
        img.classList.contains('vpw-avatar')
      if (isPortrait) {
        img.setAttribute(
          'src',
          'data:image/svg+xml;utf8,' +
            encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
                 <rect width="200" height="200" rx="24" fill="#e2e8f0"/>
                 <circle cx="100" cy="78" r="34" fill="#94a3b8"/>
                 <path d="M36 178c0-35 29-58 64-58s64 23 64 58z" fill="#94a3b8"/>
               </svg>`
            )
        )
        img.style.objectFit = 'cover'
      }
    })

    // 4. Identity baked into inline SVG background images.
    //    The exam screen tiles a watermark built from the student's name and
    //    phone as a data: URI, which no amount of text-node walking can reach.
    const bg = root.querySelectorAll ? root.querySelectorAll('[style*="data:image/svg+xml"]') : []
    bg.forEach((el) => {
      const cur = el.style.backgroundImage
      if (!cur) return
      let decoded
      try { decoded = decodeURIComponent(cur) } catch { return }
      const next = rewrite(decoded)
      if (next !== decoded) {
        const m = next.match(/^url\("(data:image\/svg\+xml;utf8,)([\s\S]*)"\)$/)
        if (m) el.style.backgroundImage = `url("${m[1]}${encodeURIComponent(m[2])}")`
      }
    })

    // 5. Single-letter avatar initials derived from the real name
    const initials = root.querySelectorAll
      ? root.querySelectorAll('.mh__avatar, .cp-avatar, .profile-avatar-initial')
      : []
    initials.forEach((el) => {
      const t = (el.textContent || '').trim()
      if (t.length > 0 && t.length <= 2 && !el.querySelector('img')) {
        el.textContent = map.__initial || 'أ'
      }
    })
  }

  // One-shot. The caller runs this twice with a gap and then screenshots
  // immediately. A MutationObserver is deliberately NOT used: pages with a
  // running counter re-render every frame, and re-walking the tree each time
  // starves the renderer so the screenshot never completes.
  walk(document.body)
  return true
}

/**
 * Pattern-based scrub, applied on top of the explicit name/id map.
 *
 * The explicit map only knows the identities we looked up in advance. A page
 * can still paint contact details that belong to the centre rather than to the
 * student — the payment gateway card renders the tenant's real InstaPay handle
 * and wallet number, for instance. These rules catch that class of leak
 * wherever it appears, so no screenshot can publish a real payment address.
 */
window.__GUIDE_SCRUB__ = function scrub() {
  const RULES = [
    // InstaPay handle: name@instapay
    [/[A-Za-z0-9._%+-]+@instapay\b/gi, 'centername@instapay'],
    // Any other e-mail address
    [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, 'info@example.com'],
    // Egyptian mobile numbers, with or without country code
    [/\b(?:\+?20)?01[0-9]{9}\b/g, '01000000000'],
  ]

  const rewrite = (s) => {
    let out = s
    for (const [re, to] of RULES) out = out.replace(re, to)
    return out
  }

  const walk = (root) => {
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const todo = []
    while (it.nextNode()) todo.push(it.currentNode)
    for (const n of todo) {
      const next = rewrite(n.nodeValue)
      if (next !== n.nodeValue) n.nodeValue = next
    }
    const els = root.querySelectorAll('[title],[alt],[aria-label],input')
    els.forEach((el) => {
      for (const attr of ['title', 'alt', 'aria-label']) {
        const v = el.getAttribute && el.getAttribute(attr)
        if (v) {
          const next = rewrite(v)
          if (next !== v) el.setAttribute(attr, next)
        }
      }
      if (el.tagName === 'INPUT' && el.value) {
        const next = rewrite(el.value)
        if (next !== el.value) el.value = next
      }
    })
    // A QR image encodes the same details in its query string — swap it for a
    // neutral placeholder rather than publishing a scannable real address.
    root.querySelectorAll('img[src*="qrserver.com"], img[src*="chart.googleapis"]').forEach((img) => {
      img.setAttribute(
        'src',
        'data:image/svg+xml;utf8,' +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
               <rect width="100" height="100" fill="#f1f5f9"/>
               <rect x="12" y="12" width="24" height="24" fill="#94a3b8"/>
               <rect x="64" y="12" width="24" height="24" fill="#94a3b8"/>
               <rect x="12" y="64" width="24" height="24" fill="#94a3b8"/>
               <rect x="46" y="46" width="10" height="10" fill="#94a3b8"/>
               <rect x="64" y="70" width="18" height="8" fill="#94a3b8"/>
             </svg>`
          )
      )
    })
  }

  walk(document.body)
  return true
}
