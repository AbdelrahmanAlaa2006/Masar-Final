// Upgraded persistent cache with in-memory store and localStorage backup.
// Lives across tab refreshes and SPA lifetimes for maximum optimization.

// Default TTL for shared list caches (videos, lectures, exams, students).
export const LIST_TTL = 30 * 60 * 1000

// In-flight Promise store to prevent duplicate concurrent network requests.
const store = new Map() // key -> { p: Promise, t: number }

const LS_PREFIX = 'masar-cache:'

/* Tenant-scoped cache isolation.
   Cache keys like 'students' / 'videos' / 'exams' are shared by name. On a
   shared device, or when a super-admin switches tenants, one tenant's cached
   list could otherwise surface under another. We prefix every key with the
   active tenant id so each tenant has its own namespace. Keys created before a
   tenant is resolved (e.g. 'available-tenants', 'tenant-config:<slug>') are
   left unprefixed — which is correct, since they are tenant-agnostic.
   The same prefix is applied in cached/invalidate/invalidatePrefix so writes
   and invalidations always match. */
let activeTenantKey = ''

export function setCacheTenant(tenantId) {
  activeTenantKey = tenantId ? String(tenantId) : ''
}

function scoped(key) {
  return activeTenantKey ? `${activeTenantKey}::${key}` : key
}

/* Large lists (e.g. the full student roster, which can reach 10k rows and
   carries PII) are kept in the in-memory cache only and are NOT mirrored to
   localStorage. Persisting them risks: (a) PII/credentials sitting at rest on
   shared devices, and (b) blowing the ~5MB localStorage quota, which makes the
   write throw and silently degrades caching. Small, stable configs (tenant
   config, feature flags, permissions, single profiles) stay well under this
   and continue to persist as before. */
const MAX_PERSIST_ROWS = 500

function isTooLargeToPersist(val) {
  return Array.isArray(val) && val.length > MAX_PERSIST_ROWS
}

export async function cached(rawKey, ttlMs, loader) {
  const key = scoped(rawKey)
  // 1. In-memory hot cache hit
  const memHit = store.get(key)
  if (memHit && Date.now() - memHit.t < ttlMs) return memHit.p

  // 2. Persistent localStorage backup cache hit
  try {
    const lsVal = localStorage.getItem(`${LS_PREFIX}${key}`)
    if (lsVal) {
      const parsed = JSON.parse(lsVal)
      if (parsed && typeof parsed.t === 'number' && Date.now() - parsed.t < ttlMs) {
        // Pre-populate the in-memory store with a resolved Promise
        const p = Promise.resolve(parsed.value)
        store.set(key, { p, t: parsed.t })
        return p
      }
    }
  } catch {}

  // 3. Cache miss: trigger the dynamic loader Promise
  const p = Promise.resolve().then(() => loader())
  store.set(key, { p, t: Date.now() })

  // When the Promise resolves, back it up to localStorage for persistence.
  // Large lists are skipped (kept in memory only) — see MAX_PERSIST_ROWS.
  p.then((val) => {
    if (isTooLargeToPersist(val)) return
    try {
      localStorage.setItem(
        `${LS_PREFIX}${key}`,
        JSON.stringify({ value: val, t: Date.now() })
      )
    } catch {}
  }).catch(() => {
    // If the loader rejects, evict from both stores so the next call retries
    if (store.get(key)?.p === p) store.delete(key)
    try {
      localStorage.removeItem(`${LS_PREFIX}${key}`)
    } catch {}
  })

  return p
}

export function invalidate(rawKey) {
  const key = scoped(rawKey)
  store.delete(key)
  try {
    localStorage.removeItem(`${LS_PREFIX}${key}`)
  } catch {}
}

// Invalidate every key that starts with `prefix` across both memory and localStorage
export function invalidatePrefix(rawPrefix) {
  const prefix = scoped(rawPrefix)
  // Memory
  for (const k of Array.from(store.keys())) {
    if (k.startsWith(prefix)) store.delete(k)
  }
  // localStorage
  try {
    const len = localStorage.length
    const keysToRemove = []
    for (let i = 0; i < len; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(`${LS_PREFIX}${prefix}`)) {
        keysToRemove.push(k)
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k)
    }
  } catch {}
}

export function invalidateAll() {
  store.clear()
  try {
    const len = localStorage.length
    const keysToRemove = []
    for (let i = 0; i < len; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(LS_PREFIX)) {
        keysToRemove.push(k)
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k)
    }
  } catch {}
}
