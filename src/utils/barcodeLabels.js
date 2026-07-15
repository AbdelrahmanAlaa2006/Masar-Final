/* ---------------------------------------------------------------------------
   Thermal barcode-label printing engine (framework-free, reusable).

   Built for XPrinter-class thermal LABEL printers (the small adhesive
   rectangular labels used in centers), NOT A4. Each student prints as one
   physical label: the document emits one CSS `@page` per label at the exact
   label size, so the printer feeds one label after another with no page
   breaks, margins, or A4 assumptions.

   Design goals (see AccountsPanel usage):
   - Separated from the React UI: this is a pure module. The caller passes a
     `resolve(student) -> { name, grade, group, token }` mapper, so the engine
     knows nothing about the app's data shape (multi-tenant safe — the caller
     resolves tenant-specific grade/group labels).
   - Configurable label sizes via LABEL_PRESETS (40x30 / 50x30 / 60x40 …); add
     a preset to support a new size without touching any layout code.
   - Reuses the EXISTING barcode generation (metafloor bwip-js Code128 image) —
     no new dependency, identical `barcode_token` payload, so scans are
     unchanged.
   - Production-ready printing: waits for EVERY barcode image to finish loading
     before invoking print() (the old fixed 700ms timeout could print blank
     labels), with a safety fallback and a single-fire guard.
   --------------------------------------------------------------------------- */

// Each preset is a pure description of a physical label. `w`/`h` are the label
// size in millimetres; the rest are typographic/scale tuning for that size.
//   name  – student-name font size (pt)
//   meta  – grade/group font size (pt)
//   pad   – inner padding (mm)
//   barMm – requested barcode bar height (mm) from the barcode service
//   scale – barcode raster scale (higher = crisper on 203dpi thermal heads)
export const LABEL_PRESETS = {
  '30x40': { w: 40, h: 30, name: 7.5, meta: 6.5, pad: 1.5, barMm: 7,  scale: 3 },
  '40x30': { w: 40, h: 30, name: 7.5, meta: 6.5, pad: 1.5, barMm: 7,  scale: 3 },
  '50x30': { w: 50, h: 30, name: 9,  meta: 7,   pad: 2,   barMm: 9,  scale: 3 },
  '60x40': { w: 60, h: 40, name: 11, meta: 8.5, pad: 2.5, barMm: 13, scale: 4 },
}

export const DEFAULT_LABEL_SIZE = '30x40'

// Human labels for a size selector in the UI.
export const LABEL_SIZE_OPTIONS = [
  { value: '30x40', label: '30 × 40 مم (بورتريت)' },
  { value: '40x30', label: '40 × 30 مم' },
  { value: '50x30', label: '50 × 30 مم' },
  { value: '60x40', label: '60 × 40 مم' },
]

// Reuse the existing Code128 barcode image source (bwip-js public API). Same
// bcid/text as before, so scanners read the identical token / value.
//   paddingwidth=10  -> the Code128-mandated >=10-module QUIET ZONE on each side.
//                       Without it the bars touch the image edge and scanners
//                       (especially off a phone screen) fail — the real cause of
//                       "can't scan from the mobile profile".
//   scale=4          -> crisper bars so downscaling on small screens/thermal
//                       heads keeps each module sharp.
//   includetext      -> human-readable value under the bars (manual fallback).
//   barMm (optional) -> requested bar height in mm for print; omitted on screen.
export function barcodeImageUrl(token, { scale = 4, barMm = 0, quiet = 10 } = {}) {
  const t = encodeURIComponent(String(token || ''))
  let url = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${t}` +
            `&scale=${scale}&paddingwidth=${quiet}&includetext=true&rotate=N`
  if (barMm) url += `&height=${barMm}`
  return url
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// One label's markup. Layout: name (bold — auto-fits to one line, wraps to a
// max of two only when unavoidable), then the barcode filling the remaining
// vertical space (contained, never clipped or stretched).
function labelHtml(item) {
  const name = escapeHtml(item.name)
  const src = escapeHtml(item.barcodeUrl)
  return (
    `<div class="lbl">` +
      `<div class="lbl-name">${name}</div>` +
      `<div class="lbl-bc"><img src="${src}" alt="barcode" /></div>` +
    `</div>`
  )
}

// Build the full, self-contained print document for a set of resolved items.
function buildDocument(items, preset, title) {
  const { w, h, name, meta, pad } = preset
  const labels = items.map(labelHtml).join('')

  // EXACT PAGE SIZE: By setting @page size to match the preset millimeters exactly,
  // we align with the physical stock size. Each .lbl is sized exactly to the preset
  // width/height with page-break rules to avoid cumulative drift.
  const styles =
    `@page { size: ${w}mm ${h}mm; margin: 0; }` +
    `* { margin: 0; padding: 0; box-sizing: border-box; }` +
    `html, body { width: ${w}mm; height: ${h}mm; background: #fff; margin: 0; padding: 0; overflow: hidden; }` +
    `body { font-family: 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; color: #000; }` +
    `.lbl {` +
      `width: ${w}mm; height: ${h}mm; padding: 3mm ${pad}mm 1mm ${pad}mm;` +
      `display: flex; flex-direction: column; align-items: center; justify-content: center;` +
      `text-align: center; overflow: hidden;` +
      `page-break-after: always; break-after: page;` +
      `page-break-inside: avoid; break-inside: avoid;` +
    `}` +
    `.lbl:last-child { page-break-after: auto; break-after: auto; }` +
    `.lbl-name { font-weight: 700; font-size: ${name}pt; line-height: 1.1; width: 100%;` +
      `white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }` +
    // Barcode takes all remaining height; the image is contained so it never
    // stretches (distorted bars = unscannable) or clips.
    `.lbl-bc { width: 100%; margin-top: 1.5mm;` +
      `display: flex; align-items: center; justify-content: center; }` +
    `.lbl-bc img { max-width: 100%; max-height: 13mm; width: auto; height: auto;` +
      `object-fit: contain; image-rendering: crisp-edges; }`

  // Auto-fit the student name so long names stay readable WITHOUT ever
  // shrinking the barcode: shrink the font first to keep one line; only when
  // even MIN pt can't fit does it wrap to a maximum of two lines. Runs once,
  // right before printing.
  const nameStart = name
  const nameMin = Math.max(5, +(name * 0.6).toFixed(1))

  // Print only after every barcode image has loaded (or errored), so no label
  // prints blank. Single-fire guard + safety timeout in case an image hangs.
  const script =
    `(function(){` +
      `var START=${nameStart}, MIN=${nameMin};` +
      `function fitNames(){` +
        `var els=document.querySelectorAll('.lbl-name');` +
        `for(var i=0;i<els.length;i++){` +
          `var el=els[i], pt=START;` +
          `el.style.whiteSpace='nowrap'; el.style.fontSize=pt+'pt';` +
          `while(el.scrollWidth>el.clientWidth+0.5 && pt>MIN){ pt-=0.5; el.style.fontSize=pt+'pt'; }` +
          `if(el.scrollWidth>el.clientWidth+0.5){` +
            // Still too long on one line at min font -> wrap to two lines max.
            `el.style.whiteSpace='normal'; el.style.textOverflow='clip';` +
            `el.style.display='-webkit-box'; el.style.webkitBoxOrient='vertical'; el.style.webkitLineClamp='2';` +
          `}` +
        `}` +
      `}` +
      `var printed=false;` +
      `function go(){ if(printed) return; printed=true;` +
        `try{ fitNames(); }catch(e){}` +
        `try{ window.focus(); }catch(e){}` +
        `window.print();` +
      `}` +
      `var imgs=Array.prototype.slice.call(document.images);` +
      `var left=imgs.length;` +
      `function tick(){ if(--left<=0) setTimeout(go,120); }` +
      `if(left===0){ setTimeout(go,120); }` +
      `else imgs.forEach(function(im){` +
        `if(im.complete) tick();` +
        `else { im.addEventListener('load',tick); im.addEventListener('error',tick); }` +
      `});` +
      `setTimeout(go,8000);` +               // fallback: never hang forever
      `window.onafterprint=function(){ setTimeout(function(){ try{ window.close(); }catch(e){} },200); };` +
    `})();`

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(title)}</title><style>${styles}</style></head>` +
    `<body>${labels}<script>${script}</` + `script></body></html>`
}

/**
 * Print barcode labels for a list of students.
 *
 * @param {Array} students            raw student rows
 * @param {Object} opts
 * @param {(s:any)=>{name,grade,group,token}} opts.resolve  maps a row to label fields
 * @param {string} [opts.size]        LABEL_PRESETS key (default 50x30)
 * @param {string} [opts.title]       print-window/document title
 * @param {(reason:'empty'|'popup-blocked')=>void} [opts.onError]
 * @returns {number} count of labels sent to print (0 on failure)
 */
export function printStudentLabels(students, opts = {}) {
  const { resolve, size = DEFAULT_LABEL_SIZE, title = 'طباعة الباركود', onError } = opts
  const preset = LABEL_PRESETS[size] || LABEL_PRESETS[DEFAULT_LABEL_SIZE]

  const items = (students || [])
    .map((s) => (typeof resolve === 'function' ? resolve(s) : s))
    .filter((it) => it && it.token)
    .map((it) => ({
      ...it,
      barcodeUrl: barcodeImageUrl(it.token, { scale: preset.scale, barMm: preset.barMm }),
    }))

  if (items.length === 0) {
    onError && onError('empty')
    return 0
  }

  const win = window.open('', '_blank')
  if (!win) {
    onError && onError('popup-blocked')
    return 0
  }
  win.document.open()
  win.document.write(buildDocument(items, preset, title))
  win.document.close()
  return items.length
}
