// Tiny navigation-history tracker used by the home dashboard's
// "Continue where you stopped" widget. Each main section page calls
// trackVisit(type) on mount; we keep the 5 most-recent visits.
//
// Stored under localStorage['masar-recent'] as:
//   [{ type: 'videos'|'lectures'|'exams'|'report', route, at }]

const KEY = 'masar-recent'
const ROUTES = {
  lectures: '/lectures',
  videos:   '/videos',
  exams:    '/exams',
  report:   '/report',
}

export function trackVisit(type) {
  if (!ROUTES[type]) return
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    const arr = Array.isArray(list) ? list : []
    // Drop any prior entry for the same section so the newest visit wins.
    const filtered = arr.filter((r) => r && r.type !== type)
    const next = [
      { type, route: ROUTES[type], at: new Date().toISOString() },
      ...filtered,
    ].slice(0, 5)
    localStorage.setItem(KEY, JSON.stringify(next))
    // Same-tab listeners need an explicit signal — `storage` events only
    // fire across tabs, not within the same one.
    window.dispatchEvent(new Event('masar-recent-change'))
  } catch { /* localStorage unavailable */ }
}
