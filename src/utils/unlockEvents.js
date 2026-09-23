import { invalidatePrefix } from './cache.js'

export const UNLOCK_EVENT_NAME = 'masar:content-unlocked'

// Authoritative supported target types per Postgres schema CHECK constraint
export const ALLOWED_TARGET_TYPES = Object.freeze(['lecture', 'exam', 'video'])

// Short-lived in-memory ring buffer of recent unlock events to protect against
// race conditions (e.g. navigation before listener mount). Max 10 entries.
const recentUnlockEvents = []
const MAX_RECENT_EVENTS = 10
const EVENT_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Emit an application-level prerequisite unlock event and invalidate relevant caches.
 * Only valid target types ('lecture', 'exam', 'video') are permitted.
 * Files/PDFs inherit lecture access and are not independent prerequisite targets.
 */
export function emitPrerequisiteUnlocked(payload) {
  if (!payload || typeof payload !== 'object') {
    console.warn('emitPrerequisiteUnlocked: payload must be an object')
    return null
  }

  const {
    unlockTargetType,
    unlockTargetId,
    contextLectureId = null,
    contextLectureTitle = null,
    requiredExamId,
    achievedScore,
    requiredScore
  } = payload

  // Validate supported target type
  if (!ALLOWED_TARGET_TYPES.includes(unlockTargetType)) {
    console.warn(`emitPrerequisiteUnlocked: unsupported target type "${unlockTargetType}". Allowed:`, ALLOWED_TARGET_TYPES)
    return null
  }

  if (!unlockTargetId) {
    console.warn('emitPrerequisiteUnlocked: missing unlockTargetId')
    return null
  }

  const detail = {
    unlockTargetType,
    unlockTargetId: String(unlockTargetId),
    contextLectureId: contextLectureId ? String(contextLectureId) : null,
    contextLectureTitle: contextLectureTitle ? String(contextLectureTitle) : null,
    requiredExamId: requiredExamId ? String(requiredExamId) : null,
    achievedScore: typeof achievedScore === 'number' ? achievedScore : null,
    requiredScore: typeof requiredScore === 'number' ? requiredScore : null,
    timestamp: Date.now()
  }

  // Record in recent events buffer
  recentUnlockEvents.unshift(detail)
  if (recentUnlockEvents.length > MAX_RECENT_EVENTS) {
    recentUnlockEvents.pop()
  }

  // Invalidate existing verified cache prefixes
  try {
    invalidatePrefix('course_lectures:')
    invalidatePrefix('content_unlock_rules:')
  } catch (cErr) {
    console.warn('emitPrerequisiteUnlocked cache invalidation error:', cErr)
  }

  // Dispatch custom browser event
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      const event = new CustomEvent(UNLOCK_EVENT_NAME, { detail })
      window.dispatchEvent(event)
    } catch (eErr) {
      console.error('Failed to dispatch unlock event:', eErr)
    }
  }

  return detail
}

/**
 * Subscribe to prerequisite unlock events with automatic cleanup.
 * @param {Function} callback - Called with (detail) when an unlock event occurs.
 * @returns {Function} unsubscribe cleanup function.
 */
export function subscribeToPrerequisiteUnlocked(callback) {
  if (typeof callback !== 'function') {
    return () => {}
  }

  if (typeof window === 'undefined') {
    return () => {}
  }

  const handler = (event) => {
    if (event && event.detail) {
      try {
        callback(event.detail)
      } catch (cbErr) {
        console.error('Error in prerequisite unlock subscriber callback:', cbErr)
      }
    }
  }

  window.addEventListener(UNLOCK_EVENT_NAME, handler)

  return () => {
    window.removeEventListener(UNLOCK_EVENT_NAME, handler)
  }
}

/**
 * Get recent unlock events within TTL.
 */
export function getRecentUnlockEvents() {
  const now = Date.now()
  return recentUnlockEvents.filter((ev) => now - ev.timestamp < EVENT_TTL_MS)
}

/**
 * Clear recent unlock events (testing / reset utility).
 */
export function clearRecentUnlockEvents() {
  recentUnlockEvents.length = 0
}
