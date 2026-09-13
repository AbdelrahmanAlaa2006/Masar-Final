/**
 * Shared inline-markup parser. Both the HTML/PDF and the DOCX renderer use it,
 * so a phrase can never be bold in one output and plain in the other.
 *
 *   **bold**       → { bold: true }
 *   «label»        → { label: true }  (a literal UI label from the app)
 *   {{ltr:VALUE}}  → { ltr: true }    (URL / number / code — must stay LTR)
 */
const TOKEN = /(\*\*[^*]+\*\*|«[^»]+»|\{\{ltr:[^}]+\}\})/g

export function parseInline(text) {
  const runs = []
  let last = 0
  for (const m of String(text).matchAll(TOKEN)) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index) })
    const tok = m[0]
    if (tok.startsWith('**')) {
      runs.push({ text: tok.slice(2, -2), bold: true })
    } else if (tok.startsWith('«')) {
      runs.push({ text: tok, label: true })
    } else {
      // '{{ltr:' is six characters; slicing seven ate the first character of
      // every LTR value (90% became 0%, Chrome became hrome).
      runs.push({ text: tok.slice(6, -2), ltr: true })
    }
    last = m.index + tok.length
  }
  if (last < text.length) runs.push({ text: text.slice(last) })
  return runs.filter((r) => r.text !== '')
}

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Render inline runs to HTML. LTR runs are bidi-isolated so digits and
 *  Latin text never reorder inside the surrounding Arabic sentence. */
export function inlineHtml(text) {
  return parseInline(text)
    .map((r) => {
      if (r.ltr) return `<span class="ltr" dir="ltr">${esc(r.text)}</span>`
      if (r.bold) return `<strong>${esc(r.text)}</strong>`
      if (r.label) return `<span class="uilabel">${esc(r.text)}</span>`
      return esc(r.text)
    })
    .join('')
}

/** Plain text (for the TOC, bookmarks, alt text). */
export function inlineText(text) {
  return parseInline(text).map((r) => r.text).join('')
}
