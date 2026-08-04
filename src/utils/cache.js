// Upgraded persistent cache engine with in-memory store, localStorage backup,
// strict fresh/stale SWR rules, in-flight request deduplication, and tenant isolation.

// Default TTLs by category
export const LIST_TTL = 30 * 60 * 1000 // Category 1: Static reference lists (30 min)
export const CONTENT_TTL = 5 * 60 * 1000 // Category 2: Occasional content lists (5 min)

const MAX_CACHE_ITEMS = 200
const MAX_PERSIST_ROWS = 500
const LS_PREFIX = 'masar-cache:'

// In-memory store: key -> { p: Promise, val: any, t: number, revalidating?: boolean }
const store = new Map()

let activeTenantKey = ''

/**
 * Set active tenant namespace. If tenant switches, memory store is cleared to prevent cross-tenant leakage.
 */
export function setCacheTenant(tenantId) {
  const newKey = tenantId ? String(tenantId) : ''
  if (activeTenantKey !== newKey) {
    store.clear()
    activeTenantKey = newKey
  }
}

function scoped(key) {
  return activeTenantKey ? `${activeTenantKey}::${key}` : key
}

function isTooLargeToPersist(val) {
  return Array.isArray(val) && val.length > MAX_PERSIST_ROWS
}

function enforceMaxStoreCapacity() {
  if (store.size > MAX_CACHE_ITEMS) {
    const oldestKey = store.keys().next().value
    if (oldestKey) store.delete(oldestKey)
  }
}

/**
 * Perform cached lookup with strict fresh/stale states and in-flight deduplication.
 * @param {string} rawKey - Unscoped cache key
 * @param {number} freshTtlMs - Duration in ms the entry is strictly fresh (0 = bypass cache)
 * @param {Function} loader - Async function returning fresh data
 * @param {Object} [options]
 * @param {number} [options.maxStaleTtlMs] - Maximum age allowed to serve stale data with background revalidation
 * @param {boolean} [options.bypass] - Force bypass cache and perform fresh network request
 */
export async function cached(rawKey, freshTtlMs, loader, options = {}) {
  const { maxStaleTtlMs = freshTtlMs * 4, bypass = false } = options
  const key = scoped(rawKey)

  // Bypass cache completely if freshTtlMs is 0 or bypass is true (Category 3 operational data)
  if (freshTtlMs <= 0 || bypass) {
    return loader()
  }

  const now = Date.now()
  const memHit = store.get(key)

  // 1. In-flight request deduplication: if a request is active, join it
  if (memHit && memHit.p && memHit.isPending) {
    return memHit.p
  }

  // 2. Fresh In-memory Cache Hit (0 network requests)
  if (memHit && now - memHit.t < freshTtlMs) {
    return memHit.p
  }

  // 3. Stale In-memory Hit (serve stale + 1 deduplicated background revalidation)
  if (memHit && now - memHit.t < maxStaleTtlMs) {
    if (!memHit.isRevalidating) {
      memHit.isRevalidating = true
      Promise.resolve()
        .then(() => loader())
        .then((freshVal) => {
          const freshPromise = Promise.resolve(freshVal)
          store.set(key, { p: freshPromise, val: freshVal, t: Date.now(), isPending: false, isRevalidating: false })
          if (!isTooLargeToPersist(freshVal)) {
            try {
              localStorage.setItem(`${LS_PREFIX}${key}`, JSON.stringify({ value: freshVal, t: Date.now() }))
            } catch {}
          }
        })
        .catch(() => {
          memHit.isRevalidating = false
        })
    }
    return memHit.p
  }

  // 4. Persistent localStorage backup check
  try {
    const lsVal = localStorage.getItem(`${LS_PREFIX}${key}`)
    if (lsVal) {
      const parsed = JSON.parse(lsVal)
      if (parsed && typeof parsed.t === 'number') {
        const age = now - parsed.t
        const p = Promise.resolve(parsed.value)
        if (age < freshTtlMs) {
          store.set(key, { p, val: parsed.value, t: parsed.t, isPending: false, isRevalidating: false })
          enforceMaxStoreCapacity()
          return p
        }
      }
    }
  } catch {}

  // 5. Cache Miss or Expired: Trigger fresh loader with in-flight deduplication
  let isPending = true
  const p = Promise.resolve()
    .then(() => loader())
    .then((val) => {
      isPending = false
      const resolvedP = Promise.resolve(val)
      store.set(key, { p: resolvedP, val, t: Date.now(), isPending: false, isRevalidating: false })
      enforceMaxStoreCapacity()

      if (!isTooLargeToPersist(val)) {
        try {
          localStorage.setItem(`${LS_PREFIX}${key}`, JSON.stringify({ value: val, t: Date.now() }))
        } catch {}
      }
      return val
    })
    .catch((err) => {
      store.delete(key)
      try {
        localStorage.removeItem(`${LS_PREFIX}${key}`)
      } catch {}
      throw err
    })

  store.set(key, { p, t: now, isPending: true, isRevalidating: false })
  enforceMaxStoreCapacity()

  return p
}

export function invalidate(rawKey) {
  const key = scoped(rawKey)
  store.delete(key)
  try {
    localStorage.removeItem(`${LS_PREFIX}${key}`)
  } catch {}
}

export function invalidatePrefix(rawPrefix) {
  const prefix = scoped(rawPrefix)
  for (const k of Array.from(store.keys())) {
    if (k.startsWith(prefix)) store.delete(k)
  }
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
