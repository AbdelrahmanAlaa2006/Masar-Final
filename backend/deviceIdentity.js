/**
 * Device identity for the Student Device Limit feature.
 *
 * NOT a MAC address or hardware ID — browsers cannot expose those. A "device"
 * is this browser install holding a random 256-bit token that the SERVER
 * minted (authorize_student_device). The server stores only its SHA-256 hash
 * and decides everything; this module just keeps the token safe on the device.
 *
 * The token is kept per student (siblings sharing one laptop each keep their
 * own registration) in three places, so losing one store does not turn this
 * browser into a "new device":
 *   - localStorage
 *   - a first-party cookie (400 days)
 *   - IndexedDB
 * It is deliberately NOT one of the auth keys, so logout never clears it.
 * Clearing all site data / private mode / another browser = a new device,
 * which the server then counts against the student's allowance.
 */

const PREFIX = 'masar-dvc-'
const TOKEN_RE = /^[0-9a-f]{64}$/
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60
const IDB_NAME = 'masar-device'
const IDB_STORE = 'kv'

const keyFor = (studentId) => PREFIX + studentId
const cookieNameFor = (studentId) => 'mdv_' + String(studentId).replace(/-/g, '').slice(0, 16)
const valid = (t) => (typeof t === 'string' && TOKEN_RE.test(t) ? t : null)

function readLocal(studentId) {
  try { return valid(window.localStorage.getItem(keyFor(studentId))) } catch { return null }
}
function writeLocal(studentId, token) {
  try { window.localStorage.setItem(keyFor(studentId), token) } catch { }
}

function readCookie(studentId) {
  try {
    const name = cookieNameFor(studentId) + '='
    const part = document.cookie.split('; ').find(c => c.startsWith(name))
    return part ? valid(decodeURIComponent(part.slice(name.length))) : null
  } catch { return null }
}
function writeCookie(studentId, token) {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${cookieNameFor(studentId)}=${token}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`
  } catch { }
}

function idb(mode, fn) {
  return new Promise((resolve) => {
    try {
      if (!window.indexedDB) return resolve(null)
      const open = window.indexedDB.open(IDB_NAME, 1)
      open.onupgradeneeded = () => open.result.createObjectStore(IDB_STORE)
      open.onerror = () => resolve(null)
      open.onsuccess = () => {
        try {
          const db = open.result
          const tx = db.transaction(IDB_STORE, mode)
          const req = fn(tx.objectStore(IDB_STORE))
          tx.oncomplete = () => { db.close(); resolve(req?.result ?? null) }
          tx.onerror = tx.onabort = () => { db.close(); resolve(null) }
        } catch { resolve(null) }
      }
    } catch { resolve(null) }
  })
}
// IndexedDB can hang in some private modes — never let it block login.
const withTimeout = (p, ms = 800) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))])

/** The stored device token for this student on this browser, or null. */
export async function getDeviceToken(studentId) {
  if (!studentId || typeof window === 'undefined') return null
  let token = readLocal(studentId) || readCookie(studentId)
  if (!token) token = valid(await withTimeout(idb('readonly', s => s.get(keyFor(studentId)))))
  // Heal whichever stores lost it.
  if (token) saveDeviceToken(studentId, token)
  return token
}

/** Store a token the server just minted, in every store. */
export function saveDeviceToken(studentId, token) {
  if (!studentId || !valid(token) || typeof window === 'undefined') return
  writeLocal(studentId, token)
  writeCookie(studentId, token)
  withTimeout(idb('readwrite', s => s.put(token, keyFor(studentId))))
}
