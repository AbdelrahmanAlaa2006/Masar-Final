// Tiny coordinator for the "exam in progress" lock. ExamTaking.jsx calls
// startExamLock() once an attempt is created and stopExamLock() when the
// student submits (or when the timer auto-submits). The App-level guard
// in App.jsx watches the same state and blocks navigation, refresh, and
// header/footer rendering while it's on.

const KEY = 'masar-exam-lock'  // localStorage flag survives accidental refresh
const EVT = 'masar-exam-lock-change'

let listeners = new Set()

function isOn() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

function emit() {
  for (const fn of listeners) {
    try { fn(isOn()) } catch {}
  }
  try { window.dispatchEvent(new Event(EVT)) } catch {}
}

export function startExamLock(meta = {}) {
  try {
    localStorage.setItem(KEY, '1')
    if (meta.attemptId) localStorage.setItem(KEY + '-attempt', meta.attemptId)
  } catch {}
  emit()
}

export function stopExamLock() {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(KEY + '-attempt')
  } catch {}
  emit()
}

export function isExamLocked() { return isOn() }

// Subscribe — returns unsubscribe.
export function onExamLockChange(fn) {
  listeners.add(fn)
  // Cross-tab: storage events fire too.
  const onStorage = (e) => { if (e.key === KEY) fn(isOn()) }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', onStorage)
  }
}
