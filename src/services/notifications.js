/* ──────────────────────────────────────────────────────────────
   Notifications service — localStorage backed, with subscribers
   and a tiny event bus so the bell badge updates live.

   A notification:
   {
     id:        string,
     createdAt: number (ms),
     kind:      'message' | 'video' | 'exam' | 'grade' | 'lecture' | 'system',
     title:     string,
     body:      string,
     fromAdmin: boolean,
     fromName?: string,
     target: {
       type:  'all' | 'prep' | 'group' | 'students',
       value: string | string[]    // prep id, group name, or array of student ids
     },
     readBy:    string[]            // user ids that read it
   }

   A user is matched if:
     target.type === 'all'                           → always
     target.type === 'prep' && user.prep === value   → match
     target.type === 'group' && user.group === value → match
     target.type === 'students' && value.includes(user.id) → match
   ────────────────────────────────────────────────────────────── */

const KEY = 'masar-notifications'
const EVENT = 'masar:notifications:update'

/* ── storage helpers ── */
function readAll() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function writeAll(arr) {
  try {
    localStorage.setItem(KEY, JSON.stringify(arr))
    window.dispatchEvent(new CustomEvent(EVENT))
  } catch (e) {
    console.error('notifications write failed', e)
  }
}

function uid() {
  return 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

/* ── public API ── */

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('masar-user')) || null
  } catch {
    return null
  }
}

/** Send a notification. Returns the created notification. */
export function sendNotification({
  kind = 'message',
  title,
  body = '',
  target,
  fromAdmin = true,
  fromName,
}) {
  if (!title || !target || !target.type) {
    console.warn('sendNotification: missing required fields')
    return null
  }
  const user = getCurrentUser()
  const note = {
    id: uid(),
    createdAt: Date.now(),
    kind,
    title: String(title).trim(),
    body: String(body).trim(),
    fromAdmin,
    fromName: fromName || user?.name || (fromAdmin ? 'الإدارة' : 'النظام'),
    target,
    readBy: [],
  }
  const all = readAll()
  all.unshift(note)
  // keep only the last 200
  writeAll(all.slice(0, 200))
  return note
}

/** Does a notification target the given user? */
function matches(note, user) {
  if (!note || !note.target) return false
  const t = note.target
  if (t.type === 'all') return true
  if (!user) return false
  if (t.type === 'prep')   return String(user.prep)  === String(t.value)
  if (t.type === 'group')  return String(user.group) === String(t.value)
  if (t.type === 'students') {
    const arr = Array.isArray(t.value) ? t.value : [t.value]
    return arr.map(String).includes(String(user.id))
  }
  return false
}

/** Get the inbox for a user (all matching notifications, newest first). */
export function getInbox(user = getCurrentUser()) {
  const all = readAll()
  // Admin sees everything they sent + global notes
  if (user?.role === 'admin') {
    return all.slice().sort((a, b) => b.createdAt - a.createdAt)
  }
  return all.filter((n) => matches(n, user))
}

export function getUnreadCount(user = getCurrentUser()) {
  if (!user) return 0
  return getInbox(user).filter((n) => !n.readBy.includes(String(user.id))).length
}

export function markRead(id, user = getCurrentUser()) {
  if (!user) return
  const all = readAll()
  const i = all.findIndex((n) => n.id === id)
  if (i === -1) return
  const uidStr = String(user.id)
  if (!all[i].readBy.includes(uidStr)) {
    all[i].readBy = [...all[i].readBy, uidStr]
    writeAll(all)
  }
}

export function markAllRead(user = getCurrentUser()) {
  if (!user) return
  const all = readAll()
  const uidStr = String(user.id)
  let changed = false
  all.forEach((n) => {
    if (matches(n, user) && !n.readBy.includes(uidStr)) {
      n.readBy.push(uidStr)
      changed = true
    }
  })
  if (changed) writeAll(all)
}

export function deleteNotification(id) {
  const all = readAll().filter((n) => n.id !== id)
  writeAll(all)
}

export function clearAll() {
  writeAll([])
}

/** Subscribe to changes (returns unsubscribe). */
export function subscribe(cb) {
  const handler = () => cb()
  window.addEventListener(EVENT, handler)
  // also react to other tabs
  const storageHandler = (e) => { if (e.key === KEY) cb() }
  window.addEventListener('storage', storageHandler)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener('storage', storageHandler)
  }
}

/* ── auto-notification helpers (call from feature pages) ── */

export function notifyNewVideo({ prep, title, teacher }) {
  return sendNotification({
    kind: 'video',
    title: 'فيديو جديد متاح الآن',
    body: `تم إضافة فيديو جديد${title ? ': ' + title : ''}${
      teacher ? ' — ' + teacher : ''
    }. ادخل الآن لمشاهدته.`,
    target: prep ? { type: 'prep', value: prep } : { type: 'all' },
    fromAdmin: true,
  })
}

export function notifyNewLecture({ prep, title }) {
  return sendNotification({
    kind: 'lecture',
    title: 'محاضرة جديدة متاحة',
    body: `تم إضافة محاضرة جديدة${title ? ': ' + title : ''}. ادخل صفحة المحاضرات.`,
    target: prep ? { type: 'prep', value: prep } : { type: 'all' },
    fromAdmin: true,
  })
}

export function notifyExamRevealed({ examTitle, target }) {
  return sendNotification({
    kind: 'grade',
    title: 'تم نشر نتيجة الامتحان',
    body: `أصبحت نتيجة "${examTitle || 'الامتحان'}" متاحة الآن. ادخل صفحة التقارير لمشاهدتها.`,
    target: target || { type: 'all' },
    fromAdmin: true,
  })
}
