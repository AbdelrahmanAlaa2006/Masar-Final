/**
 * Where the login is kept on this device.
 *
 * Two modes:
 *  - session (default): sessionStorage — closing the tab or app logs out.
 *  - persistent:        localStorage   — stays logged in on this device until
 *                                         the user presses logout.
 *
 * Students are persistent by default; staff only when they tick «تذكرني» on
 * the login form (see AuthContext.login and Login.jsx). The mode itself is a
 * flag in localStorage, so a freshly opened tab knows which store to read.
 *
 * Everything that reads or writes the login — the Supabase client, AuthContext
 * and the pages that read the current user — goes through this module, so the
 * two stores can never disagree about who is logged in.
 */

const MODE_KEY = 'masar-auth-persist'
const APP_KEYS = ['masar-token', 'masar-user', 'masar-permissions']

const hasWindow = typeof window !== 'undefined'

// Supabase stores its session under `sb-<project-ref>-auth-token` (plus a
// `-code-verifier` companion for PKCE flows).
const isSupabaseAuthKey = (k) => typeof k === 'string' && k.startsWith('sb-') && k.includes('-auth-token')
const isAuthKey = (k) => APP_KEYS.includes(k) || isSupabaseAuthKey(k)

// Storage access throws in some browsers (private mode, blocked site data).
const safe = (fn, fallback) => {
  try { return fn() } catch { return fallback }
}

export function isPersistent() {
  return hasWindow && safe(() => window.localStorage.getItem(MODE_KEY) === '1', false)
}

const activeStore = () => (isPersistent() ? window.localStorage : window.sessionStorage)

/**
 * Drop-in replacement for `sessionStorage` for the login keys. Also used as
 * the Supabase client's `auth.storage`, so its session follows the same mode.
 */
export const authStore = {
  getItem: (key) => (hasWindow ? safe(() => activeStore().getItem(key), null) : null),
  setItem: (key, value) => { if (hasWindow) safe(() => activeStore().setItem(key, value)) },
  removeItem: (key) => { if (hasWindow) safe(() => activeStore().removeItem(key)) },
}

const authKeysIn = (store) => {
  const keys = []
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (isAuthKey(k)) keys.push(k)
  }
  return keys
}

/**
 * Move the current login into the chosen store and remember the choice.
 * Called right after sign-in, once the role is known — the Supabase session
 * that sign-in already wrote is carried over with the app's own keys.
 */
export function setPersistent(persist) {
  if (!hasWindow) return
  safe(() => {
    const from = isPersistent() ? window.localStorage : window.sessionStorage
    const to = persist ? window.localStorage : window.sessionStorage
    if (from !== to) {
      for (const k of authKeysIn(from)) {
        to.setItem(k, from.getItem(k))
        from.removeItem(k)
      }
    }
    if (persist) window.localStorage.setItem(MODE_KEY, '1')
    else window.localStorage.removeItem(MODE_KEY)
  })
}

/**
 * Wipe the login from BOTH stores, synchronously. Logout must not leave a
 * session behind in whichever store it was not using — on a shared phone that
 * would sign the previous student straight back in.
 */
export function clearAuth() {
  if (!hasWindow) return
  safe(() => {
    for (const store of [window.localStorage, window.sessionStorage]) {
      for (const k of authKeysIn(store)) store.removeItem(k)
    }
    window.localStorage.removeItem(MODE_KEY)
  })
}
