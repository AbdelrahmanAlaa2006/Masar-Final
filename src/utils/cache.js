// Upgraded persistent cache with in-memory store and localStorage backup.
// Lives across tab refreshes and SPA lifetimes for maximum optimization.

// Default TTL for shared list caches (videos, lectures, exams, students).
export const LIST_TTL = 30 * 60 * 1000

// In-flight Promise store to prevent duplicate concurrent network requests.
const store = new Map() // key -> { p: Promise, t: number }

const LS_PREFIX = 'masar-cache:'

export async function cached(key, ttlMs, loader) {
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

  // When the Promise resolves, back it up to localStorage for persistence
  p.then((val) => {
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

export function invalidate(key) {
  store.delete(key)
  try {
    localStorage.removeItem(`${LS_PREFIX}${key}`)
  } catch {}
}

// Invalidate every key that starts with `prefix` across both memory and localStorage
export function invalidatePrefix(prefix) {
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
