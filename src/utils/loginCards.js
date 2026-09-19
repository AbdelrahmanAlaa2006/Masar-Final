/**
 * Printable student login cards.
 *
 * The admin picks students (one, a page, a group, a whole stage), prints this
 * sheet, cuts along the guides and hands each student their card: name, the
 * code they log in with, their password, and the parent's number.
 *
 * Passwords: a password can NEVER be read back out of the stored hash. A card
 * shows a real password only when the app holds a readable copy — students who
 * registered after 2026-09-19, students an admin created, and anyone the admin
 * generated a new password for from the cards dialog. For everyone else the
 * card prints a short note instead of a password, so the sheet is still useful
 * (the login code is the part students forget).
 *
 * Layout: fixed A4 grid, so any number of students paginates cleanly —
 * 10 cards per page (2 x 5), or 6 (2 x 3) when a bigger card is wanted.
 */

export const CARD_LAYOUTS = {
  standard: { id: 'standard', label: '١٠ كروت في الصفحة', perPage: 10, cols: 2, w: 94, h: 54, nameP: 12, valueP: 13, labelP: 8 },
  large: { id: 'large', label: '٦ كروت في الصفحة (أكبر)', perPage: 6, cols: 2, w: 94, h: 88, nameP: 15, valueP: 17, labelP: 9.5 },
}

export const DEFAULT_CARD_LAYOUT = 'standard'
export const PASSWORD_NOTE = 'كلمة المرور اللي اخترتها وقت التسجيل'

/** Random 4-digit suffix: branded, easy to type, and not guessable from a neighbour's card. */
export function generateCardPassword(prefix = 'pass') {
  const clean = String(prefix || '').trim().replace(/\s+/g, '').slice(0, 20) || 'pass'
  let n
  try {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    n = buf[0] % 10000
  } catch {
    n = Math.floor(Math.random() * 10000)
  }
  return `${clean}${String(n).padStart(4, '0')}`
}

const escapeHtml = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const chunk = (list, size) => {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function cardHtml(card, brandName) {
  const hasPassword = Boolean(card.password)
  return (
    `<div class="card">` +
      `<div class="card-top">` +
        `<span class="brand">${escapeHtml(brandName || '')}</span>` +
        `<span class="kicker">كارت الدخول</span>` +
      `</div>` +
      `<div class="card-name">${escapeHtml(card.name || '')}</div>` +
      `<div class="rows">` +
        `<div class="row"><span class="k">كود الدخول</span><span class="v ltr">${escapeHtml(card.login || '')}</span></div>` +
        `<div class="row${hasPassword ? '' : ' note-row'}"><span class="k">كلمة المرور</span>` +
          (hasPassword
            ? `<span class="v ltr">${escapeHtml(card.password)}</span>`
            : `<span class="v note">${escapeHtml(PASSWORD_NOTE)}</span>`) +
        `</div>` +
        (card.parentPhone
          ? `<div class="row"><span class="k">رقم ولي الأمر</span><span class="v ltr small">${escapeHtml(card.parentPhone)}</span></div>`
          : '') +
      `</div>` +
      (card.siteUrl ? `<div class="card-foot">${escapeHtml(card.siteUrl)}</div>` : '') +
    `</div>`
  )
}

function buildDocument(cards, layout, { title, brandName, siteUrl }) {
  const { cols, perPage, w, h, nameP, valueP, labelP } = layout
  const pages = chunk(cards, perPage)
    .map((page) => {
      // Fill the last page so every card keeps its box size.
      const blanks = Array.from({ length: perPage - page.length }, () => '<div class="card blank"></div>').join('')
      return `<section class="sheet">${page.map((c) => cardHtml(c, brandName)).join('')}${blanks}</section>`
    })
    .join('')

  const styles =
    `@page { size: A4 portrait; margin: 8mm; }` +
    `* { margin: 0; padding: 0; box-sizing: border-box; }` +
    `html, body { background: #fff; color: #000; }` +
    `body { font-family: 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; }` +
    `.sheet { display: grid; grid-template-columns: repeat(${cols}, ${w}mm); grid-auto-rows: ${h}mm;` +
      ` column-gap: 3mm; row-gap: 0; justify-content: center;` +
      ` page-break-after: always; break-after: page; }` +
    `.sheet:last-child { page-break-after: auto; break-after: auto; }` +
    // A dashed box per card = the cut guide.
    `.card { border: 0.3mm dashed #9aa0a6; padding: 3mm 4mm; display: flex; flex-direction: column;` +
      ` page-break-inside: avoid; break-inside: avoid; overflow: hidden; }` +
    `.card.blank { border-color: #e3e5e8; }` +
    `.card-top { display: flex; justify-content: space-between; align-items: center;` +
      ` border-bottom: 0.3mm solid #000; padding-bottom: 1mm; }` +
    `.brand { font-size: ${labelP}pt; font-weight: 800; }` +
    `.kicker { font-size: ${labelP - 1}pt; color: #555; font-weight: 700; }` +
    `.card-name { font-size: ${nameP}pt; font-weight: 800; margin: 1.6mm 0 1mm;` +
      ` white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }` +
    `.rows { display: flex; flex-direction: column; gap: 1.2mm; }` +
    `.row { display: flex; align-items: baseline; gap: 2mm; }` +
    `.row.note-row { flex-direction: column; align-items: stretch; gap: 0.4mm; }` +
    `.k { font-size: ${labelP}pt; color: #444; font-weight: 700; white-space: nowrap; }` +
    `.v { font-size: ${valueP}pt; font-weight: 800; letter-spacing: 0.2pt;` +
      ` overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }` +
    `.v.ltr { direction: ltr; unicode-bidi: isolate; font-variant-numeric: tabular-nums; }` +
    `.v.small { font-size: ${valueP - 2}pt; font-weight: 700; }` +
    `.v.note { font-size: ${labelP - 0.5}pt; font-weight: 600; color: #555; white-space: normal; }` +
    `.card-foot { border-top: 0.3mm dotted #9aa0a6; padding-top: 1mm; margin-top: auto;` +
      ` font-size: ${labelP - 1}pt; color: #444; direction: ltr; text-align: center; }`

  // Long names: shrink to fit one line before printing, like the barcode labels do.
  const script =
    `(function(){` +
    `var START=${nameP}, MIN=${Math.max(6, +(nameP * 0.62).toFixed(1))};` +
    `function fit(){ var els=document.querySelectorAll('.card-name');` +
    `for(var i=0;i<els.length;i++){ var el=els[i], pt=START; el.style.fontSize=pt+'pt';` +
    `while(el.scrollWidth>el.clientWidth+0.5 && pt>MIN){ pt-=0.5; el.style.fontSize=pt+'pt'; } } }` +
    `var printed=false;` +
    `function go(){ if(printed) return; printed=true; try{ fit(); }catch(e){}` +
    `try{ window.focus(); }catch(e){} window.print(); }` +
    `if(document.fonts && document.fonts.ready){ document.fonts.ready.then(function(){ setTimeout(go,300); }); }` +
    `setTimeout(go,2500);` +
    `window.onafterprint=function(){ setTimeout(function(){ try{ window.close(); }catch(e){} },200); };` +
    `})();`

  return (
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(title)}</title>` +
    `<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700;800&display=swap" rel="stylesheet">` +
    `<style>${styles}</style></head><body>${pages}` +
    `<script>${script}</` + `script></body></html>`
  )
}

/**
 * Open the print window with one card per student.
 *
 * @param {Array<{name,login,password,parentPhone}>} cards
 * @param {Object} opts
 * @param {string} [opts.layout]     CARD_LAYOUTS key
 * @param {string} [opts.brandName]  centre/platform name printed on each card
 * @param {string} [opts.siteUrl]    address students type to reach the platform
 * @param {string} [opts.title]      print window title
 * @param {(reason:'empty'|'popup-blocked')=>void} [opts.onError]
 * @returns {number} cards sent to the printer (0 on failure)
 */
export function printLoginCards(cards, opts = {}) {
  const { layout = DEFAULT_CARD_LAYOUT, brandName = '', siteUrl = '', title = 'كروت الدخول', onError } = opts
  const preset = CARD_LAYOUTS[layout] || CARD_LAYOUTS[DEFAULT_CARD_LAYOUT]
  const items = (cards || []).filter((c) => c && (c.name || c.login))

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
  win.document.write(buildDocument(items, preset, { title, brandName, siteUrl }))
  win.document.close()
  return items.length
}
