// Tiny in-memory cache with TTL. Lives for the lifetime of the SPA tab.
// Use for read-mostly lists (videos, lectures, exams) that the same user
// re-fetches on every navigation. Never cache per-user mutable state
// (progress, attempts, notifications) — those must stay fresh.

const store = new Map()

export async function cached(key, ttlMs, loader) {
  const hit = store.get(key)
  if (hit && Date.now() - hit.t < ttlMs) return hit.v
  const v = await loader()
  store.set(key, { v, t: Date.now() })
  return v
}

export function invalidate(key) {
  store.delete(key)
}

export function invalidateAll() {
  store.clear()
}
