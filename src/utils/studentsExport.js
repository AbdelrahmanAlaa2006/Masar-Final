/* ---------------------------------------------------------------------------
   Student roster export — CSV (Excel-friendly) and a printable PDF sheet.

   Why a PRINT WINDOW instead of a client-side PDF library: the roster is
   Arabic/RTL. jsPDF & co. need an embedded Arabic font plus bidi shaping, and
   without both they emit reversed or blank glyphs. The browser already does
   shaping and RTL layout perfectly, so we render a styled RTL table and let the
   print dialog "Save as PDF". Same approach the barcode labels already use.

   Columns: name, student phone, parent phone, grade, branch, enrollment type
   and the student's groups.
   --------------------------------------------------------------------------- */

export const EXPORT_COLUMNS = [
  { key: 'name', label: 'اسم الطالب' },
  { key: 'phone', label: 'هاتف الطالب' },
  { key: 'parentPhone', label: 'هاتف ولي الأمر' },
  { key: 'grade', label: 'المرحلة' },
  { key: 'branch', label: 'الفرع' },
  { key: 'type', label: 'النوع' },
  { key: 'groups', label: 'المجموعات' },
  { key: 'empty1', label: '', empty: true },
  { key: 'empty2', label: '', empty: true },
]

/* Normalize raw profile rows into flat export rows. Group ids and branch ids
   are resolved to names via the lists the panel already has in memory, so this
   costs no extra requests. */
export function buildStudentExportRows(students, { groups = [], branches = [], gradeLabel = {} } = {}) {
  const groupById = new Map((groups || []).map((g) => [g.id, g.name]))
  const branchById = new Map((branches || []).map((b) => [b.id, b.name]))

  const ENROLLMENT_TYPE_LABEL = {
    CENTER: 'سنتر',
    ONLINE: 'أونلاين',
    HYBRID: 'سنتر وأونلاين',
  }

  return (students || []).map((s) => ({
    name: s.name || '',
    phone: s.phone || '',
    parentPhone: s.parent_phone || '',
    grade: gradeLabel[s.grade] || s.grade || '',
    branch: branchById.get(s.branch_id) || 'الفرع الرئيسي',
    type: ENROLLMENT_TYPE_LABEL[s.enrollment_type] || s.enrollment_type || 'سنتر',
    // A student can belong to more than one group; list them all.
    groups:
      (s.student_groups || [])
        .map((g) => groupById.get(g.group_id))
        .filter(Boolean)
        .join(' / ') || '—',
  }))
}

// ── CSV ────────────────────────────────────────────────────────────────────
const csvEscape = (value) => {
  const s = String(value ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/* Phone numbers must stay TEXT: Excel would otherwise read 01063277012 as a
   number and silently drop the leading zero. The ="…" form is understood as a
   text literal by both Excel and Google Sheets. */
const csvPhone = (value) => {
  const s = String(value ?? '').trim()
  return s ? `"=""${s.replace(/"/g, '')}"""` : ''
}

export function buildStudentsCsv(rows) {
  const header = EXPORT_COLUMNS.map((c) => csvEscape(c.label)).join(',')
  const body = (rows || [])
    .map((r) =>
      EXPORT_COLUMNS.map((c) =>
        c.key === 'phone' || c.key === 'parentPhone' ? csvPhone(r[c.key]) : csvEscape(r[c.key])
      ).join(',')
    )
    .join('\r\n')
  // BOM first — without it Excel opens UTF-8 Arabic as mojibake.
  return `﻿${header}\r\n${body}\r\n`
}

export function downloadStudentsCsv(rows, filename = 'students.csv') {
  const blob = new Blob([buildStudentsCsv(rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke on the next tick so the download has certainly started.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return (rows || []).length
}

// ── Printable sheet (Save as PDF) ──────────────────────────────────────────
const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function buildPrintDocument(rows, { title, subtitle }) {
  const styles =
    `@page { size: A4 landscape; margin: 10mm; }` +
    `* { box-sizing: border-box; }` +
    `body { font-family: Tajawal, Cairo, "Segoe UI", sans-serif; margin: 0; color: #111; }` +
    `.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 10px; border-bottom: 2px solid #111; padding-bottom: 8px; }` +
    `h1 { font-size: 16pt; margin: 0 0 2px; }` +
    `.sub { font-size: 9pt; color: #555; }` +
    `.count { font-size: 10pt; font-weight: 700; white-space: nowrap; }` +
    `table { width: 100%; border-collapse: collapse; font-size: 9pt; }` +
    // Repeat the header row at the top of every printed page.
    `thead { display: table-header-group; }` +
    `tr { page-break-inside: avoid; }` +
    `th, td { border: 1px solid #bbb; padding: 5px 7px; text-align: right; }` +
    `th { background: #f0f0f0; font-weight: 700; }` +
    `tbody tr:nth-child(even) { background: #fafafa; }` +
    `td.ltr { direction: ltr; text-align: right; unicode-bidi: plaintext; }` +
    `.idx { width: 34px; color: #666; text-align: center; }` +
    `th.empty-col, td.empty-col { min-width: 60px; width: 70px; }`

  const head =
    `<tr><th class="idx">#</th>` +
    EXPORT_COLUMNS.map((c) => `<th${c.empty ? ' class="empty-col"' : ''}>${escapeHtml(c.label)}</th>`).join('') +
    `</tr>`

  const body = (rows || [])
    .map(
      (r, i) =>
        `<tr><td class="idx">${i + 1}</td>` +
        EXPORT_COLUMNS.map((c) => {
          // Phones render LTR so Arabic RTL context doesn't reorder the digits.
          const cls = c.empty ? ' class="empty-col"' : (c.key === 'phone' || c.key === 'parentPhone' ? ' class="ltr"' : '')
          return `<td${cls}>${escapeHtml(r[c.key])}</td>`
        }).join('') +
        `</tr>`
    )
    .join('')

  // Print once content is laid out; close the tab afterwards. The timeout is a
  // fallback so the window can never hang unprinted.
  const script =
    `(function(){var printed=false;function go(){if(printed)return;printed=true;` +
    `try{window.focus();}catch(e){}window.print();}` +
    `if(document.readyState==='complete'){setTimeout(go,300);}` +
    `else{window.addEventListener('load',function(){setTimeout(go,300);});}` +
    `setTimeout(go,5000);` +
    `window.onafterprint=function(){setTimeout(function(){try{window.close();}catch(e){}},200);};})();`

  return (
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(title)}</title><style>${styles}</style></head><body>` +
    `<div class="head"><div><h1>${escapeHtml(title)}</h1>` +
    `<div class="sub">${escapeHtml(subtitle || '')}</div></div>` +
    `<div class="count">عدد الطلاب: ${(rows || []).length}</div></div>` +
    `<table><thead>${head}</thead><tbody>${body}</tbody></table>` +
    `<script>${script}</` + `script></body></html>`
  )
}

/* Open the roster in a print window (the user chooses "Save as PDF").
   Returns the row count, or 0 when there is nothing to print / popup blocked. */
export function printStudentsList(rows, { title = 'كشف الطلاب', subtitle = '', onError } = {}) {
  if (!rows || rows.length === 0) {
    onError && onError('empty')
    return 0
  }
  const win = window.open('', '_blank')
  if (!win) {
    onError && onError('popup-blocked')
    return 0
  }
  win.document.open()
  win.document.write(buildPrintDocument(rows, { title, subtitle }))
  win.document.close()
  return rows.length
}
