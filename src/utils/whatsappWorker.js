import { processNotificationQueue, getNotificationQueueSummary } from '@backend/parentNotificationsApi'

/* ---------------------------------------------------------------------------
   WhatsApp background worker — a MODULE-LEVEL SINGLETON.

   Why this exists: the send loop used to live inside WhatsAppQueuePanel, so it
   was only triggered by the manual button and could not be controlled once the
   page unmounted. This worker moves loop OWNERSHIP out of React so processing:
     • continues across page navigation (the module outlives components),
     • keeps running for notifications created later (idle heartbeat),
     • resumes safely after a refresh (sessionStorage marker),
     • never runs twice at once (module flag + cross-tab localStorage lock).

   It does NOT change the Smart Sending Engine — it calls the exact same
   `processNotificationQueue`, which does the randomized pacing, daily limits,
   working-hours gate, retries and idempotency server-side. This file only
   decides WHEN/WHERE that function runs, never HOW it sends.
   --------------------------------------------------------------------------- */

const ACTIVE_KEY = 'wa-worker-active'   // sessionStorage: this tab wants the queue drained
const LOCK_KEY = 'wa-worker-lock'       // localStorage: cross-tab single-worker lock
const IDLE_MS = 180000                  // idle re-check cadence (3 min — gentle, not a busy loop)
const LOCK_STALE_MS = 240000            // a lock older than this = crashed tab, safe to steal
const AUTO_GATEWAYS = ['wapilot', 'whatsapp_cloud'] // manual (wa.me) can't auto-send

const TAB_ID = Math.random().toString(36).slice(2)

let running = false     // exactly one drain loop per tab
let tenant = null       // latest tenant row (carries config.gateway)
let idleTimer = null
const listeners = new Set()

function emit(evt) { listeners.forEach((l) => { try { l(evt) } catch { /* listener error is not fatal */ } }) }
export function subscribeWorker(fn) { listeners.add(fn); return () => listeners.delete(fn) }
export function isWorkerRunning() { return running }

function gatewayType(t) { return t?.config?.gateway?.type || null }
function isAutoCapable(t) { return AUTO_GATEWAYS.includes(gatewayType(t)) }

// ── Cross-tab lock (prevents two open dashboard tabs from both draining) ─────
function readLock() {
  try { return JSON.parse(localStorage.getItem(LOCK_KEY) || 'null') } catch { return null }
}
function acquireLock() {
  const now = Date.now()
  const cur = readLock()
  if (cur && cur.tab !== TAB_ID && (now - cur.ts) < LOCK_STALE_MS) return false // someone else is active
  try { localStorage.setItem(LOCK_KEY, JSON.stringify({ tab: TAB_ID, ts: now })) } catch {}
  const check = readLock()
  return !!check && check.tab === TAB_ID // last-write-wins confirm
}
function refreshLock() {
  const cur = readLock()
  if (cur && cur.tab === TAB_ID) {
    try { localStorage.setItem(LOCK_KEY, JSON.stringify({ tab: TAB_ID, ts: Date.now() })) } catch {}
  }
}
function releaseLock() {
  const cur = readLock()
  if (cur && cur.tab === TAB_ID) { try { localStorage.removeItem(LOCK_KEY) } catch {} }
}

// ── The single drain loop ───────────────────────────────────────────────────
async function drain() {
  if (running) return                         // in-tab single-worker guard
  if (!tenant || !isAutoCapable(tenant)) return
  if (!acquireLock()) { scheduleIdle(); return } // another tab owns processing
  running = true
  emit({ type: 'running', running: true })
  try {
    let keepGoing = true
    let totalSent = 0

    while (keepGoing) {
      if (!acquireLock()) break // ensure we still own the lock in case of extreme slowness

      const { processedCount, continueProcessing, pauseReason } = await processNotificationQueue(tenant, (id, status, error) => {
        refreshLock() // heartbeat the lock as batches report progress
        emit({ type: 'progress', id, status, error })
      })

      totalSent += processedCount
      keepGoing = continueProcessing

      // Optional: you can log or handle pauseReason here if needed in the future
      if (!keepGoing && pauseReason) {
         // console.debug(`Worker loop paused: ${pauseReason}`)
      }
    }
    
    emit({ type: 'done', sent: totalSent })
  } catch (e) {
    emit({ type: 'error', error: e?.message || String(e) })
  } finally {
    running = false
    releaseLock()
    emit({ type: 'running', running: false })
    scheduleIdle()                            // keep watching for new work
  }
}

// Idle heartbeat: while this tab is flagged active, re-check pending every few
// minutes and drain if there's anything to send. One timer, module-scoped —
// so attendance/grade notifications go out without reopening the queue page.
function scheduleIdle() {
  clearTimeout(idleTimer)
  try { if (sessionStorage.getItem(ACTIVE_KEY) !== '1') return } catch { return }
  if (!isAutoCapable(tenant)) return
  idleTimer = setTimeout(async () => {
    if (running) { scheduleIdle(); return }
    try {
      const s = await getNotificationQueueSummary()
      if ((s?.pending || 0) > 0) drain()
      else scheduleIdle()
    } catch { scheduleIdle() }
  }, IDLE_MS)
}

/* Immediate kick — the manual "Start Sending" button. Idempotent: repeated
   clicks never spawn a second loop (the running guard + lock hold). */
export function kickWorker(t) {
  if (t) tenant = t
  try { sessionStorage.setItem(ACTIVE_KEY, '1') } catch {}
  drain()
}

/* App-level autonomy — call once when a staff session is ready. Idempotent and
   safe on every mount. Arms the heartbeat so the queue drains on its own, and
   resumes immediately if this tab was mid-processing before a refresh. */
export function ensureAutoRun(t) {
  if (t) tenant = t
  if (!isAutoCapable(tenant)) return
  let active = false
  try { active = sessionStorage.getItem(ACTIVE_KEY) === '1' } catch {}
  
  // Only resume if the worker was explicitly started in a previous session
  // or before a page refresh. We NO LONGER force it to start automatically.
  if (active) drain()
}

/* Stop watching (e.g., the admin cleared the queue or logged out). Does not
   abort an in-flight batch — that finishes cleanly; it just stops re-arming. */
export function stopWorkerWatch() {
  try { sessionStorage.removeItem(ACTIVE_KEY) } catch {}
  clearTimeout(idleTimer)
}
