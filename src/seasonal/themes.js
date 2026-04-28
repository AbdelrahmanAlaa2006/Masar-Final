/* ──────────────────────────────────────────────────────────────
   Seasonal theme catalogue.

   Each theme:
     • bodyClass — applied to <body> by the useSeasonalTheme hook.
     • decor    — name of the React overlay variant in SeasonalDecor.
     • vars     — CSS-variable overrides scoped to the body class.
                  These layer on top of the main theme so the core
                  palette stays intact; only accents shift.
     • ranges   — an array of [start, end] inclusive ISO dates.
                  Islamic dates shift ~11 days/year, so we list a
                  few years explicitly. Update once a year — one
                  line per range, takes seconds.
     • exam     — when false, the decor overlay is suppressed on the
                  exam-taking page even if the theme is active. The
                  rest of the app still gets the accents.

   Order matters: the FIRST theme whose range matches "today" wins.
   ────────────────────────────────────────────────────────────── */

export const SEASONAL_THEMES = [
  {
    id: 'ramadan',
    label: 'رمضان كريم',
    bodyClass: 'season-ramadan',
    decor: 'ramadan',
    exam: false,
    // Approximate civil dates — adjust by ±1 day if the local moon
    // sighting differs from the published Hijri calendar.
    ranges: [
      { start: '2025-02-28', end: '2025-03-30' },
      { start: '2026-02-17', end: '2026-03-19' },
      { start: '2027-02-07', end: '2027-03-08' },
      { start: '2028-01-27', end: '2028-02-25' },
    ],
    vars: {
      '--season-accent':      '#c9a45a',  // warm gold
      '--season-accent-soft': '#7c5cff',  // royal purple
      '--season-glow':        '0 0 28px rgba(201, 164, 90, 0.45)',
      '--season-link':        '#d4b66a',
    },
  },
  {
    id: 'eid-fitr',
    label: 'عيد الفطر المبارك',
    bodyClass: 'season-eid-fitr',
    decor: 'eid-fitr',
    exam: false,
    // Eid al-Fitr is the 1st–3rd of Shawwal, immediately after Ramadan.
    // We keep the theme up for ~4 days so the welcome lasts the holiday.
    ranges: [
      { start: '2025-03-30', end: '2025-04-03' },
      { start: '2026-03-19', end: '2026-03-23' },
      { start: '2027-03-08', end: '2027-03-12' },
      { start: '2028-02-25', end: '2028-03-01' },
    ],
    vars: {
      '--season-accent':      '#e2b07a',  // warm beige
      '--season-accent-soft': '#f3a8c0',  // soft pink
      '--season-glow':        '0 0 26px rgba(226, 176, 122, 0.40)',
      '--season-link':        '#e2b07a',
    },
  },
  {
    id: 'eid-adha',
    label: 'عيد الأضحى المبارك',
    bodyClass: 'season-eid-adha',
    decor: 'eid-adha',
    exam: false,
    // 10th–13th of Dhu al-Hijjah.
    ranges: [
      { start: '2025-06-06', end: '2025-06-10' },
      { start: '2026-05-26', end: '2026-05-30' },
      { start: '2027-05-16', end: '2027-05-20' },
      { start: '2028-05-04', end: '2028-05-08' },
    ],
    vars: {
      '--season-accent':      '#1f7a52',  // deep green
      '--season-accent-soft': '#f2ead3',  // ivory
      '--season-glow':        '0 0 22px rgba(31, 122, 82, 0.32)',
      '--season-link':        '#2f9268',
    },
  },
  {
    id: 'christmas',
    label: 'شتاء وأعياد',
    bodyClass: 'season-christmas',
    decor: 'christmas',
    exam: false,
    // Mid-December → New Year — covers the whole winter feel, not
    // tied to one specific religious date.
    ranges: [
      { start: '2025-12-15', end: '2026-01-02' },
      { start: '2026-12-15', end: '2027-01-02' },
      { start: '2027-12-15', end: '2028-01-02' },
    ],
    vars: {
      '--season-accent':      '#7dd3fc',  // icy cyan
      '--season-accent-soft': '#f8fafc',  // frost white
      '--season-glow':        '0 0 30px rgba(125, 211, 252, 0.45)',
      '--season-link':        '#7dd3fc',
    },
  },
]

// Local-time YYYY-MM-DD so a theme that ends on the 30th is active
// for the whole 30th (not until midnight UTC, which can be the 29th
// in Egypt).
export function todayIso(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function findThemeForDate(iso = todayIso()) {
  for (const t of SEASONAL_THEMES) {
    if ((t.ranges || []).some((r) => iso >= r.start && iso <= r.end)) {
      return t
    }
  }
  return null
}

export function findThemeById(id) {
  return SEASONAL_THEMES.find((t) => t.id === id) || null
}
