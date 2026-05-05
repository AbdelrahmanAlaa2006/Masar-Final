// Tiny in-memory cache with TTL. Lives for the lifetime of the SPA tab.
// Use for read-mostly lists (videos, lectures, exams) that the same user
// re-fetches on every navigation. Never cache per-user mutable state
// (progress, attempts, notifications) — those must stay fresh.

// Stores the in-flight Promise (not the resolved value) so two concurrent
// callers for the same key share a single network request — without this,
// React's double-mount in dev or two effects firing in the same tick both
// trigger the loader before either has finished writing to the cache.
const store = new Map() // key -> { p: Promise, t: number }

export async function cached(key, ttlMs, loader) {
  const hit = store.get(key)
  if (hit && Date.now() - hit.t < ttlMs) return hit.p
  const p = Promise.resolve().then(() => loader())
  store.set(key, { p, t: Date.now() })
  // If the loader rejects, evict so the next call retries instead of
  // serving the rejection forever.
  p.catch(() => {
    if (store.get(key)?.p === p) store.delete(key)
  })
  return p
}

export function invalidate(key) {
  store.delete(key)
}

export function invalidateAll() {
  store.clear()
}
