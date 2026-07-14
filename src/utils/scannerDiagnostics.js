/* ---------------------------------------------------------------------------
   TEMPORARY diagnostic instrumentation for the ATTENDANCE barcode scanner.

   Purpose: capture hard evidence of what the physical USB scanner (Syble)
   actually types into the attendance field, so the real root cause of
   «لم يتم العثور على طالب مطابق لهذا الباركود أو البطاقة» can be identified
   on the real hardware — no DevTools, no console, no technical knowledge.

   Activation (completely OFF otherwise — zero production impact):
     * build-time : VITE_DEBUG_SCANNER=true in .env, then rebuild
     * runtime    : open the page with ?debugScanner=1 (persists for the tab
                    via sessionStorage — works on the already-deployed build,
                    no redeploy needed)

   This module is read-only instrumentation: it never changes lookup,
   attendance, or database behavior. Used ONLY by AttendancePanel.
   --------------------------------------------------------------------------- */

const SS_KEY = 'masar-debug-scanner'

export function isScannerDebugEnabled() {
  try {
    if (import.meta.env.VITE_DEBUG_SCANNER === 'true') return true
    const params = new URLSearchParams(window.location.search)
    if (params.get('debugScanner') === '1') {
      sessionStorage.setItem(SS_KEY, '1')
      return true
    }
    if (params.get('debugScanner') === '0') {
      sessionStorage.removeItem(SS_KEY)
      return false
    }
    return sessionStorage.getItem(SS_KEY) === '1'
  } catch {
    return false
  }
}

// Human-readable form of every char: `ب(U+0628)` — makes invisible characters
// and Arabic-layout transliterations obvious in the report.
export function charCodesOf(str) {
  return Array.from(String(str || '')).map((ch) => {
    const cp = ch.codePointAt(0)
    const hex = 'U+' + cp.toString(16).toUpperCase().padStart(4, '0')
    const printable = cp >= 0x21 && cp !== 0x7f ? ch : JSON.stringify(ch).slice(1, -1)
    return `${printable}(${hex})`
  }).join(' ')
}

/* Rolling recorder of raw DOM events on the scanner input. Keeps the last
   `limit` events with high-resolution timestamps. */
export function createScanRecorder(limit = 400) {
  let events = []
  let lookupMarks = []
  return {
    record(type, data = {}) {
      events.push({ t: performance.now(), type, ...data })
      if (events.length > limit) events = events.slice(-limit)
    },
    markLookup(label) {
      const mark = { t: performance.now(), label }
      lookupMarks.push(mark)
      if (lookupMarks.length > 20) lookupMarks = lookupMarks.slice(-20)
      return mark
    },
    events: () => events.slice(),
    lookupMarks: () => lookupMarks.slice(),
    reset() { events = []; lookupMarks = [] },
  }
}

const fmtMs = (n) => `${(Math.round(n * 10) / 10).toFixed(1)}ms`

/* Assemble the full plain-text report. `ctx` carries everything the panel
   knows about this failed scan. No secrets/tokens are included. */
export function buildScannerDiagnosticReport(ctx) {
  const {
    rawInput = '', displayedValue = '', normalizationStages = {}, finalLookupValue = '',
    lookupApi = '', lookupPayload = {}, lookupResponse = null, reachedBackend = false,
    lookupError = null, validationFailure = null, probes = [],
    sessionId = '', tenantId = '', tenantSlug = '', grade = '', groupName = '',
    autoCheckIn = null, alwaysFocus = null, notificationState = '',
    recorder = null, lookupStartMark = null, focusedElementAtLookup = '',
  } = ctx

  const events = recorder ? recorder.events() : []
  const keydowns = events.filter((e) => e.type === 'keydown')
  const burst = (() => {
    // The current scan burst = events after the previous Enter/Tab keydown.
    let startIdx = 0
    for (let i = keydowns.length - 2; i >= 0; i--) {
      if (keydowns[i].key === 'Enter' || keydowns[i].key === 'Tab') { startIdx = i + 1; break }
    }
    const startT = keydowns[startIdx] ? keydowns[startIdx].t : (events[0]?.t || 0)
    return events.filter((e) => e.t >= startT)
  })()

  const burstKeydowns = burst.filter((e) => e.type === 'keydown')
  const gaps = []
  for (let i = 1; i < burstKeydowns.length; i++) gaps.push(burstKeydowns[i].t - burstKeydowns[i - 1].t)
  const gapStats = gaps.length
    ? `min ${fmtMs(Math.min(...gaps))} / avg ${fmtMs(gaps.reduce((a, b) => a + b, 0) / gaps.length)} / max ${fmtMs(Math.max(...gaps))}`
    : 'n/a (fewer than 2 keydowns captured)'

  const lookupT = lookupStartMark ? lookupStartMark.t : null
  const inputEventsAfterLookup = lookupT !== null
    ? events.filter((e) => e.type === 'input' && e.t > lookupT && e.t < lookupT + 2000).length
    : 0
  const focusEventsDuringBurst = burst.filter((e) => e.type === 'blur' || e.type === 'focusin-elsewhere')

  const has = (s, ch) => String(s).includes(ch)
  const yesNo = (b) => (b ? 'YES' : 'no')

  const checks = [
    `Scanner sent Enter key           : ${yesNo(burstKeydowns.some((e) => e.key === 'Enter'))}`,
    `Scanner sent Tab key             : ${yesNo(burstKeydowns.some((e) => e.key === 'Tab'))}`,
    `Raw value contains CR (\\r)       : ${yesNo(has(rawInput, '\r'))}`,
    `Raw value contains LF (\\n)       : ${yesNo(has(rawInput, '\n'))}`,
    `Raw value contains TAB (\\t)      : ${yesNo(has(rawInput, '\t'))}`,
    `Input events AFTER lookup started: ${inputEventsAfterLookup} ${inputEventsAfterLookup > 0 ? '<-- lookup fired before input completed!' : '(lookup waited for full input: OK)'}`,
    `Focus changed during scan burst  : ${focusEventsDuringBurst.length > 0 ? 'YES <-- focus was stolen mid-scan' : 'no'}`,
    `Debounce/throttle on this path   : none exists in code (direct keydown handler)`,
    `Displayed value == value sent    : ${yesNo(displayedValue === rawInput)} (displayed ${displayedValue.length} chars, sent ${rawInput.length} chars)`,
    `Non-ASCII chars in raw input     : ${yesNo(/[^\x00-\x7F]/.test(rawInput))} ${/[^\x00-\x7F]/.test(rawInput) ? '<-- OS keyboard layout is transforming scanner keystrokes (e.g. Arabic layout)' : ''}`,
    `Chars LOST by normalization      : ${Math.max(0, Array.from(String(rawInput).trim()).length - Array.from(String(finalLookupValue)).length)} char(s)`,
  ]

  const eventLog = burst.slice(-120).map((e) => {
    const base = `${fmtMs(e.t - (burst[0]?.t || e.t)).padStart(9)}  ${e.type.padEnd(9)}`
    if (e.type === 'keydown' || e.type === 'keyup' || e.type === 'keypress') {
      return `${base} key=${JSON.stringify(e.key)} code=${e.code || ''} shift=${e.shiftKey ? 1 : 0} valueLen=${e.valueLen ?? ''}`
    }
    if (e.type === 'input' || e.type === 'change') return `${base} valueLen=${e.valueLen ?? ''}`
    if (e.type === 'lookup') return `${base} ${e.label || ''}`
    return `${base} ${e.detail || ''}`
  }).join('\n')

  const probesText = probes.length
    ? probes.map((p) => `  - ${p.label}: sent=${JSON.stringify(p.value)} -> ${p.result}`).join('\n')
    : '  (none)'

  const stages = normalizationStages
  return [
    '==============================================',
    'Attendance Scanner Diagnostic Report',
    '==============================================',
    `Timestamp            : ${new Date().toISOString()}`,
    `Browser (userAgent)  : ${navigator.userAgent}`,
    `Platform             : ${navigator.platform || 'n/a'} | language: ${navigator.language}`,
    `Attendance session   : ${sessionId || '(none selected)'}`,
    `Tenant               : ${tenantSlug} (${tenantId})`,
    `Stage (grade)        : ${grade}`,
    `Group filter         : ${groupName || '(all groups)'}`,
    `Auto check-in        : ${autoCheckIn} | Always-focus: ${alwaysFocus}`,
    '',
    '--- Scanner input ----------------------------',
    `Raw input            : ${JSON.stringify(rawInput)}`,
    `Raw length           : ${rawInput.length}`,
    `Char codes           : ${charCodesOf(rawInput)}`,
    `Displayed (React)    : ${JSON.stringify(displayedValue)}`,
    '',
    '--- Normalization stages ---------------------',
    `after trim()         : ${JSON.stringify(stages.afterTrim ?? '')}`,
    `after remove CR      : ${JSON.stringify(stages.afterRemoveCR ?? '')}`,
    `after remove LF      : ${JSON.stringify(stages.afterRemoveLF ?? '')}`,
    `after remove TAB     : ${JSON.stringify(stages.afterRemoveTab ?? '')}`,
    `after remove spaces  : ${JSON.stringify(stages.afterRemoveWhitespace ?? '')}`,
    `after Arabic mapping : ${JSON.stringify(stages.afterArabicMap ?? '')}`,
    `after ASCII whitelist: ${JSON.stringify(stages.afterAsciiWhitelist ?? '')}`,
    `after comma rule     : ${JSON.stringify(stages.afterCommaRule ?? '')}`,
    `FINAL lookup value   : ${JSON.stringify(finalLookupValue)} (len ${String(finalLookupValue).length})`,
    `Final char codes     : ${charCodesOf(finalLookupValue)}`,
    '',
    '--- Lookup -----------------------------------',
    `Lookup API           : ${lookupApi}`,
    `Request payload      : ${JSON.stringify(lookupPayload)}`,
    `Reached backend      : ${yesNo(reachedBackend)}`,
    `Response             : ${lookupResponse === null ? 'null (no student matched)' : JSON.stringify({ student_id: lookupResponse.student_id, name: lookupResponse.name, grade: lookupResponse.grade })}`,
    `Matched DB field     : ${lookupResponse ? 'barcode_token or qr_token (matched)' : 'none'}`,
    `Student ID           : ${lookupResponse?.student_id || '(not found)'}`,
    `Attendance recorded  : ${lookupResponse ? 'reached post-lookup flow' : 'no (lookup failed)'}`,
    `Notification state   : ${notificationState || 'n/a (no attendance saved)'}`,
    `Thrown exception     : ${lookupError ? `${lookupError.name || 'Error'}: ${lookupError.message}` : '(none)'}`,
    `Validation failure   : ${validationFailure || '(none)'}`,
    `Focused element      : ${focusedElementAtLookup}`,
    '',
    '--- Extra evidence probes (debug-only reads) -',
    probesText,
    '',
    '--- Automatic checks -------------------------',
    ...checks,
    `Inter-key timing     : ${gapStats}`,
    '',
    '--- Event sequence (current scan burst) ------',
    eventLog || '  (no events captured)',
    '==============================================',
  ].join('\n')
}

export async function copyDiagnosticReport(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}
