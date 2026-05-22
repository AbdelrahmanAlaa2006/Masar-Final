import { useEffect, useRef } from 'react'

/**
 * useExitGuard — discourage accidental exits during locked screens
 * (exam-taking, video playback). Active flag toggles all behavior.
 *
 * Coverage:
 *   1. `beforeunload`         — closing the tab or refreshing pops the
 *                               native browser confirm dialog. Browsers
 *                               render a generic message regardless of
 *                               what we set on `returnValue`; that's
 *                               their built-in anti-spoof behavior.
 *   2. Browser back button    — we push a sentinel history entry on
 *                               mount so the first back press fires a
 *                               popstate we can intercept. We then
 *                               show a custom confirm; declining
 *                               re-pushes the sentinel to keep the
 *                               user on this page.
 *
 * Honest caveats:
 *   • If `active` flips from true → false the sentinel stays in
 *     history. The next back press becomes a no-op (lands on the
 *     sentinel without any handler). Acceptable trade-off for
 *     simplicity — at worst the user presses back twice to actually
 *     leave.
 *   • Header / Link clicks are NOT intercepted. The pages that use
 *     this hook also hide the global Header so only their own buttons
 *     are reachable; those buttons must call `confirmExit()` before
 *     navigating away.
 *
 * Usage:
 *   const { disable, isPopState, clearPopState } = useExitGuard({
 *     active: !examFinished,
 *     message: 'لو خرجت دلوقتي…',
 *     onExitAttempt: () => setShowExitConfirm(true)
 *   })
 */
export default function useExitGuard({ active, message, onExitAttempt }) {
  const isPopStateRef = useRef(false)
  const activeRef = useRef(active)
  const messageRef = useRef(message)
  const onExitAttemptRef = useRef(onExitAttempt)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    messageRef.current = message
  }, [message])

  useEffect(() => {
    onExitAttemptRef.current = onExitAttempt
  }, [onExitAttempt])

  // Refs to hold the event handler functions so they can be removed synchronously
  const beforeUnloadHandler = useRef(null)
  const popStateHandler = useRef(null)

  // 1) beforeunload — browser-native dialog for tab close / refresh.
  useEffect(() => {
    if (!active) return

    const handler = (e) => {
      e.preventDefault()
      const msg = messageRef.current || 'لو خرجت دلوقتي ممكن تفقد تقدمك. هل أنت متأكد؟'
      e.returnValue = msg
      return msg
    }
    beforeUnloadHandler.current = handler
    window.addEventListener('beforeunload', handler)

    return () => {
      window.removeEventListener('beforeunload', handler)
      beforeUnloadHandler.current = null
    }
  }, [active])

  // 2) Browser back button via sentinel history entry + popstate.
  useEffect(() => {
    if (!active) return
    // Sentinel: pushing with empty url keeps the current path so the
    // user doesn't see any URL change. The state object lets us
    // recognize our own entry on inspection (not strictly required).
    window.history.pushState({ __exitGuard: 1 }, '')

    const onPopState = () => {
      isPopStateRef.current = true
      const currentOnExitAttempt = onExitAttemptRef.current
      const msg = messageRef.current || 'لو خرجت دلوقتي ممكن تفقد تقدمك. هل أنت متأكد؟'

      if (currentOnExitAttempt) {
        // Re-push sentinel asynchronously so React Router completes its popstate handling
        // without getting desynchronized.
        setTimeout(() => {
          if (activeRef.current) {
            window.history.pushState({ __exitGuard: 1 }, '')
          }
        }, 0)
        currentOnExitAttempt()
      } else {
        if (window.confirm(msg)) {
          // User confirmed leaving. Detach the listener BEFORE going
          // back so the next popstate is handled as normal navigation.
          window.removeEventListener('popstate', onPopState)
          popStateHandler.current = null
          window.history.back()
        } else {
          // User declined — re-push sentinel so they're back on this
          // page (the previous popstate already moved them off).
          window.history.pushState({ __exitGuard: 1 }, '')
        }
      }
    }

    popStateHandler.current = onPopState
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)
      popStateHandler.current = null
    }
  }, [active])

  // Synchronously disable all warning event listeners to prevent browser-native dialogs
  const disable = () => {
    if (beforeUnloadHandler.current) {
      window.removeEventListener('beforeunload', beforeUnloadHandler.current)
      beforeUnloadHandler.current = null
    }
    if (popStateHandler.current) {
      window.removeEventListener('popstate', popStateHandler.current)
      popStateHandler.current = null
    }
    activeRef.current = false
  }

  const isPopState = () => isPopStateRef.current
  const clearPopState = () => {
    isPopStateRef.current = false
  }

  return {
    disable,
    isPopState,
    clearPopState,
  }
}

/* Programmatic confirm — call before any in-app `navigate(...)` that
   leaves a guarded screen via the page's own UI button. Returns true
   when the user accepts the prompt. */
export function confirmExit(message) {
  const msg = message || 'لو خرجت دلوقتي ممكن تفقد تقدمك. هل أنت متأكد؟'
  return window.confirm(msg)
}

