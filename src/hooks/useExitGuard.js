import { useEffect } from 'react'

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
 *   useExitGuard({ active: !examFinished, message: 'لو خرجت دلوقتي…' })
 */
export default function useExitGuard({ active, message }) {
  const msg = message || 'لو خرجت دلوقتي ممكن تفقد تقدمك. هل أنت متأكد؟'

  // 1) beforeunload — browser-native dialog for tab close / refresh.
  useEffect(() => {
    if (!active) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = msg
      return msg
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [active, msg])

  // 2) Browser back button via sentinel history entry + popstate.
  useEffect(() => {
    if (!active) return
    // Sentinel: pushing with empty url keeps the current path so the
    // user doesn't see any URL change. The state object lets us
    // recognize our own entry on inspection (not strictly required).
    window.history.pushState({ __exitGuard: 1 }, '')

    const onPopState = () => {
      if (window.confirm(msg)) {
        // User confirmed leaving. Detach the listener BEFORE going
        // back so the next popstate is handled by the browser /
        // router as a normal navigation.
        window.removeEventListener('popstate', onPopState)
        window.history.back()
      } else {
        // User declined — re-push sentinel so they're back on this
        // page (the previous popstate already moved them off).
        window.history.pushState({ __exitGuard: 1 }, '')
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [active, msg])
}

/* Programmatic confirm — call before any in-app `navigate(...)` that
   leaves a guarded screen via the page's own UI button. Returns true
   when the user accepts the prompt. */
export function confirmExit(message) {
  const msg = message || 'لو خرجت دلوقتي ممكن تفقد تقدمك. هل أنت متأكد؟'
  return window.confirm(msg)
}
