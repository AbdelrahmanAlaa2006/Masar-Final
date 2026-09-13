/**
 * Documentation screenshot capture.
 *
 * Drives a headless Chrome against the LOCAL dev server, signs in with the
 * test student account, and saves real screenshots of the student and parent
 * experiences. Nothing in the application is modified; identity data is
 * redacted in the page right before each shot (see redact.js).
 *
 * Outbound WhatsApp / notification calls are hard-blocked at the network layer
 * so opening the parent portal can never deliver a message to a real number.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CDP, getTarget, sleep } from './cdp.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..', 'screenshots')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9334
const BASE = 'http://localhost:3000'
const PHONE = process.env.GUIDE_PHONE
const PASS = process.env.GUIDE_PASS
const PARENT_PHONE = process.env.GUIDE_PARENT_PHONE || ''
const ONLY = process.env.GUIDE_ONLY ? process.env.GUIDE_ONLY.split(',') : null

const REDACT_SRC = fs.readFileSync(path.join(__dirname, 'redact.js'), 'utf8')

// Real → fictional. Filled in after login from the live session.
let MAP = {}

fs.mkdirSync(OUT, { recursive: true })

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  '--headless=new',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=2',
  `--user-data-dir=${process.env.TEMP}\\guide-chrome-capture`,
  'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })

const target = await getTarget(PORT)
const cdp = new CDP(target.webSocketDebuggerUrl)
await cdp.connect()
await cdp.send('Page.enable')
await cdp.send('Network.enable')
// NOTE: Runtime.enable is deliberately NOT sent. With it on, Chrome builds a
// preview of every console.log argument, which fires the property getter the
// app's DevTools heuristic watches — the app would then show its "inspection
// blocked" screen instead of the real pages. Runtime.evaluate works without it.

// Capture-time shim (browser side only — the app source is untouched):
// 1. window.outer* is reported as the emulated viewport, so the app's
//    devtools-size heuristic does not mistake emulation for an open inspector.
// 2. scroll-reveal animations start settled, so nothing is captured mid-fade.
// 3. the local dev overlay badge and the broken placeholder logo of the
//    unbranded default tenant are hidden so they don't read as doc defects.
await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    (() => {
      const sync = (prop, from) => {
        try {
          Object.defineProperty(window, prop, { get: () => window[from], configurable: true });
        } catch {}
      };
      sync('outerWidth', 'innerWidth');
      sync('outerHeight', 'innerHeight');
      const style = document.createElement('style');
      style.textContent = \`
        .reveal-on-scroll { opacity: 1 !important; transform: none !important; }
        img[src=""], img:not([src]) { visibility: hidden !important; }
        /* localhost-only tenant switcher — never rendered in production,
           so it must not appear in a screenshot a student will read. */
        .dev-tenant-switcher { display: none !important; }
        #vite-error-overlay, vite-error-overlay { display: none !important; }
      \`;
      const attach = () => (document.head || document.documentElement).appendChild(style);
      if (document.head) attach(); else document.addEventListener('DOMContentLoaded', attach);
    })();
  `,
})

// ── Safety: never let a documentation run send a real WhatsApp message ──
await cdp.send('Network.setBlockedURLs', {
  urls: [
    '*queue_public_notification*',
    '*localhost:8790*',
    '*wapilot*',
    '*wa.me*',
    '*graph.facebook.com*',
    '*/wapilot-proxy*',
  ],
})

const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
const DESKTOP = { width: 1360, height: 900, deviceScaleFactor: 2, mobile: false }

async function setViewport(v) {
  await cdp.send('Emulation.setDeviceMetricsOverride', v)
}

async function goto(url, wait = 3500) {
  await cdp.send('Page.navigate', { url })
  await sleep(wait)
}

async function applyRedaction() {
  await cdp.evaluate(REDACT_SRC, false)
  await cdp.evaluate(`window.__GUIDE_REDACT__(${JSON.stringify(MAP)})`)
  // Pattern scrub on top of the explicit map: catches contact details that
  // belong to the centre rather than the student — the payment card renders
  // the tenant's real InstaPay handle and wallet number, which the map alone
  // knows nothing about.
  await cdp.evaluate('window.__GUIDE_SCRUB__()')
}

const failures = []

async function shot(name, { full = false, settle = 900 } = {}) {
  if (ONLY && !ONLY.some((p) => name.includes(p))) return
  try {
    await applyRedaction()
    await sleep(settle)
    await applyRedaction()
    const params = { format: 'png', captureBeyondViewport: full }
    if (full) {
      const m = await cdp.send('Page.getLayoutMetrics')
      const h = Math.min(Math.ceil(m.cssContentSize.height), 4200)
      params.clip = { x: 0, y: 0, width: Math.ceil(m.cssContentSize.width), height: h, scale: 1 }
    }
    const { data } = await cdp.send('Page.captureScreenshot', params)
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'))
    console.log('  ✓', name)
  } catch (err) {
    failures.push(`${name}: ${err.message}`)
    console.log('  ✗', name, '—', err.message)
  }
}

// A failed interaction should downgrade one screenshot, not abort the run.
async function safe(label, fn) {
  try { return await fn() } catch (err) {
    failures.push(`${label}: ${err.message}`)
    console.log('  ✗', label, '—', err.message)
    return null
  }
}

async function click(selectorOrText, { text = false, nth = 0 } = {}) {
  return cdp.evaluate(`
    (() => {
      ${text
        ? `const els = [...document.querySelectorAll('button, a, .home-module-card, .pr-selection-card, .cp-section-card, .vc-card, .ec-card, .hw-card, .pkg-card, .prep-card')]
             .filter(e => (e.textContent||'').includes(${JSON.stringify(selectorOrText)}));`
        : `const els = [...document.querySelectorAll(${JSON.stringify(selectorOrText)})];`}
      const el = els[${nth}];
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    })()
  `)
}

async function scrollTo(y) {
  await cdp.evaluate(`window.scrollTo({ top: ${y}, behavior: 'instant' })`)
  await sleep(500)
}

// ───────────────────────── LOGIN ─────────────────────────
console.log('· landing + login')
await setViewport(MOBILE)
await goto(`${BASE}/login?tenant=default`, 6500)

MAP = {
  'عبدالرحمن علاء': 'كريم مصطفى',
  'Abdelrahman Alaa': 'Karim Mostafa',
  'Eyad Elalkamy': 'Development Team',
  __initial: 'أ',
}
await shot('student-01-landing')
await scrollTo(700)
await shot('student-02-landing-about')

// Open the sign-in modal exactly as a student would.
await click('.aa-nav-actions .aa-btn-ghost', { nth: 1 })
await sleep(1200)
await shot('student-03-login-modal')

// Forgot-password modal
await click('.forgot-btn')
await sleep(1000)
await shot('student-04-forgot-password')
await click('.auth-modal-close')
await sleep(600)

// Sign in
await click('.aa-nav-actions .aa-btn-ghost', { nth: 1 })
await sleep(1000)
await cdp.evaluate(`
  (() => {
    const setVal = (el, v) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const modal = document.querySelector('.auth-modal');
    const inputs = modal.querySelectorAll('input[type="text"], input[type="password"]');
    setVal(inputs[0], ${JSON.stringify(PHONE)});
    setVal(inputs[1], ${JSON.stringify(PASS)});
    return true;
  })()
`)
await sleep(400)
await shot('student-05-login-filled')
await cdp.evaluate(`document.querySelector('.auth-modal form').requestSubmit()`)
await sleep(9000)

const rawUser = await cdp.evaluate('sessionStorage.getItem("masar-user")')
if (!rawUser) throw new Error('login did not produce a session — check credentials / dev server')
const u = JSON.parse(rawUser)
console.log('· signed in as', u.name)

// Sanity: make sure we are looking at the real app, not the guard screen.
const guard = await cdp.evaluate(`!!document.querySelector('.devtools-blocker, .dtb-root')`)
if (guard) throw new Error('app is showing the inspection-guard screen; shim failed')
console.log('· stray overlays:', await cdp.evaluate(`
  JSON.stringify([...document.body.children]
    .filter(e => e.id !== 'root')
    .map(e => (e.tagName + '#' + e.id + '.' + e.className).slice(0, 80)))
`))

MAP = {
  [u.name]: 'أحمد محمود',
  [u.phone]: '01000000000',
  [u.parent_phone || '\u0000']: '01100000000',
  [u.id]: '11111111-2222-3333-4444-555555555555',
  [u.id.slice(0, 8)]: '11111111',
  [u.barcode_token || '\u0000']: 'BC-0000000000',
  [u.qr_token || '\u0000']: '0000000000000000',
  'عبدالرحمن علاء': 'كريم مصطفى',
  'Abdelrahman Alaa': 'Karim Mostafa',
  'Eyad Elalkamy': 'Development Team',
  __initial: 'أ',
}

// ───────────────────────── HOME ─────────────────────────
console.log('· home')
await goto(`${BASE}/`, 6000)
await shot('student-06-home-top')
await scrollTo(620)
await shot('student-07-home-overview')
await scrollTo(1250)
await shot('student-08-home-sections')
await scrollTo(0)

// Mobile drawer
await click('.mh__burger')
await sleep(1100)
await shot('student-09-nav-drawer')
await cdp.evaluate(`document.querySelector('.mh-drawer').click()`)
await sleep(700)

// Notifications
await click('.notif-trigger, .mh__actions button[aria-label*="إشعار"], .notif-bell')
await sleep(1400)
await shot('student-10-notifications')
await cdp.evaluate(`document.body.click()`)
await sleep(500)

// Desktop header for the "on a computer" note
await setViewport(DESKTOP)
await goto(`${BASE}/`, 5000)
await shot('student-11-home-desktop')
await setViewport(MOBILE)

// ───────────────────────── VIDEOS ─────────────────────────
console.log('· videos')
await goto(`${BASE}/videos`, 6500)
await shot('student-12-videos-list', { full: true })

// Some lectures are past their availability window and only open an error
// dialog. Walk the list until one actually opens the player.
let playerOpen = false
const cardCount = (await cdp.evaluate(`document.querySelectorAll('.vc-card').length`)) || 0
for (let i = 0; i < Math.min(cardCount, 8) && !playerOpen; i++) {
  await safe(`open lecture ${i + 1}`, () => click('.vc-card', { nth: i }))
  await sleep(5500)
  playerOpen = await cdp.evaluate(`!!document.querySelector('.vpw-root')`)
  if (!playerOpen) {
    await safe('dismiss dialog', () => cdp.evaluate(`
      (() => {
        const b = [...document.querySelectorAll('.modal.show .btn, .modal .btn')]
          .find(x => (x.textContent || '').includes('حسناً'));
        if (b) b.click();
        return !!b;
      })()
    `))
    await sleep(1200)
  }
}
if (playerOpen) {
  await shot('student-13-video-player')
  await scrollTo(560)
  await shot('student-14-video-tabs')
  await scrollTo(0)
} else {
  failures.push('video player: no lecture in this grade was still within its availability window')
  console.log('  ✗ video player — every lecture for this grade has expired')
}

// ───────────────────────── EXAMS ─────────────────────────
console.log('· exams')
await goto(`${BASE}/exams`, 6000)
await shot('student-15-exams-types')
await safe('pick exam type', () => click('الامتحانات الشاملة', { text: true }))
await sleep(3500)
await shot('student-16-exams-list', { full: true })

// Open one exam so the guide can show the real exam screen. This starts a
// single attempt on the test account; it is never submitted.
let examOpen = false
const examCount = (await cdp.evaluate(`document.querySelectorAll('.ec-card').length`)) || 0
for (let i = 0; i < Math.min(examCount, 8) && !examOpen; i++) {
  await safe(`open exam ${i + 1}`, () => click('.ec-card', { nth: i }))
  await sleep(6500)
  examOpen = await cdp.evaluate(`!!document.querySelector('.et-question-area')`)
  if (!examOpen) {
    await safe('dismiss exam dialog', () => cdp.evaluate(`
      (() => {
        const b = [...document.querySelectorAll('.modal.active .modal-button, .modal .modal-button, .modal .btn')]
          .find(x => /حسناً|إغلاق/.test(x.textContent || ''));
        if (b) b.click();
        return !!b;
      })()
    `))
    await sleep(1200)
    if (await cdp.evaluate(`location.pathname === '/exam-taking'`)) {
      await goto(`${BASE}/exams`, 5000)
      await safe('re-pick type', () => click('الامتحانات الشاملة', { text: true }))
      await sleep(3000)
    }
  }
}
if (examOpen) {
  await shot('student-17-exam-taking')
  await safe('open question map', () => click('.et-map-trigger-btn'))
  await sleep(1400)
  await shot('student-18-exam-question-map')
} else {
  failures.push('exam screen: no exam for this grade was open and had attempts left')
  console.log('  ✗ exam screen — no startable exam for this grade')
}

// ───────────────────────── HOMEWORK ─────────────────────────
console.log('· homework')
await goto(`${BASE}/homework`, 6500)
await shot('student-19-homework-list', { full: true })
const openedHw = await safe('open homework', () => click('حل الواجب', { text: true }))
await sleep(4000)
if (openedHw) await shot('student-20-homework-submit')

// ───────────────────────── REPORTS ─────────────────────────
console.log('· reports')
await goto(`${BASE}/report`, 6000)
await shot('student-21-reports-home', { full: true })

await safe('open exams report', () => click('تقرير الامتحانات', { text: true }))
await sleep(6000)
await shot('student-22-exams-report', { full: true })

await goto(`${BASE}/report`, 5500)
await safe('switch to center reports', () => click('تقارير السنتر', { text: true }))
await sleep(1500)
await safe('open attendance report', () => click('تقرير الحضور والغياب', { text: true }))
await sleep(6000)
await shot('student-23-attendance-report', { full: true })

// ───────────────────────── SHOP / PACKAGES / PAYMENTS ─────────────────────────
console.log('· shop / packages / payments')
await goto(`${BASE}/shop`, 6000)
await shot('student-24-shop', { full: true })
await goto(`${BASE}/packages`, 6000)
await shot('student-25-packages', { full: true })
await goto(`${BASE}/payments`, 6500)
await shot('student-26-payments', { full: true })

// ───────────────────────── CHAT / PROFILE / HELP ─────────────────────────
console.log('· chat / profile / help')
await goto(`${BASE}/chat`, 6000)
await shot('student-27-chat')

await goto(`${BASE}/profile`, 7000)
await shot('student-28-profile', { full: true })
await safe('open digital card', () => click('عرض بطاقة الطالب الرقمية', { text: true }))
await sleep(2000)
await shot('student-29-digital-card')

await goto(`${BASE}/help`, 5500)
await shot('student-30-help', { full: true })

// ───────────────────────── PARENT PORTAL ─────────────────────────
if (PARENT_PHONE) {
  console.log('· parent portal (outbound messaging blocked)')
  await cdp.evaluate(`sessionStorage.clear(); localStorage.removeItem('masar-token');`)
  await goto(`${BASE}/login?tenant=default`, 6500)
  await shot('parent-01-entry')
  await click('تقارير ولي الأمر', { text: true })
  await sleep(1500)
  await shot('parent-02-lookup-modal')
  await cdp.evaluate(`
    (() => {
      const setVal = (el, v) => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const modal = document.querySelector('.auth-modal');
      setVal(modal.querySelector('input'), ${JSON.stringify(PARENT_PHONE)});
      modal.querySelector('form').requestSubmit();
      return true;
    })()
  `)
  await sleep(8000)
  await shot('parent-03-selection', { full: true })
  await click('تقارير السنتر', { text: true })
  await sleep(5000)
  await shot('parent-04-center-report', { full: true })
  await cdp.evaluate(`history.back()`)
  await sleep(3000)
  await click('تقارير المنصة التعليمية', { text: true })
  await sleep(7000)
  await shot('parent-05-platform-dashboard', { full: true })
  await click('تقرير الفيديوهات', { text: true })
  await sleep(5000)
  await shot('parent-06-platform-videos', { full: true })
}

console.log('done →', OUT)
if (failures.length) {
  console.log('\nsteps that did not produce a shot:')
  failures.forEach((f) => console.log('  -', f))
}
cdp.close()
chrome.kill()
process.exit(0)
