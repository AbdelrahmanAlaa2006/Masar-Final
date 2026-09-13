/**
 * Re-captures the screenshots that carry a key action, with a highlight ring
 * and arrow drawn on the real control, and with the stronger PII scrub applied.
 *
 * Overwrites the matching files in screenshots/. Everything else about the
 * capture — redaction, the automation shims, the outbound-message block — is
 * identical to capture.mjs.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CDP, getTarget, sleep } from './cdp.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..', 'screenshots')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9360
const BASE = 'http://localhost:3000'
const PHONE = process.env.GUIDE_PHONE
const PASS = process.env.GUIDE_PASS
const PARENT_PHONE = process.env.GUIDE_PARENT_PHONE
const ONLY = process.env.GUIDE_ONLY ? process.env.GUIDE_ONLY.split(',') : null

const REDACT = fs.readFileSync(path.join(__dirname, 'redact.js'), 'utf8')
const ANNOTATE = fs.readFileSync(path.join(__dirname, 'annotate.js'), 'utf8')

const FAKE_NAMES = [
  'أحمد محمود سيد', 'مريم خالد عبد الله', 'يوسف طارق حسن',
  'نور الدين سامح', 'حبيبة عمرو فؤاد', 'مازن إبراهيم علي',
]

let MAP = {
  'عبدالرحمن علاء': 'كريم مصطفى',
  'Abdelrahman Alaa': 'Karim Mostafa',
  'Eyad Elalkamy': 'Development Team',
  __initial: 'أ',
}

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=2',
  `--user-data-dir=${process.env.TEMP}\\guide-chrome-annot`, 'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })

const target = await getTarget(PORT)
const cdp = new CDP(target.webSocketDebuggerUrl)
await cdp.connect()
await cdp.send('Page.enable')
await cdp.send('Network.enable')
await cdp.send('Network.setBlockedURLs', {
  urls: ['*queue_public_notification*', '*localhost:8790*', '*wapilot*', '*wa.me*',
    '*graph.facebook.com*', '*/wapilot-proxy*'],
})
await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    const sync=(p,f)=>{try{Object.defineProperty(window,p,{get:()=>window[f],configurable:true})}catch{}};
    sync('outerWidth','innerWidth'); sync('outerHeight','innerHeight');
    const s=document.createElement('style');
    s.textContent='.reveal-on-scroll{opacity:1!important;transform:none!important}'
      +'.dev-tenant-switcher{display:none!important}'
      +'img[src=""],img:not([src]){visibility:hidden!important}';
    const a=()=>(document.head||document.documentElement).appendChild(s);
    if(document.head)a();else document.addEventListener('DOMContentLoaded',a);
  })();`,
})
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

const ev = (e) => cdp.evaluate(e)
const goto = async (u, w = 6000) => { await cdp.send('Page.navigate', { url: u }); await sleep(w) }
const failures = []

async function shot(name, markers, full = false) {
  if (ONLY && !ONLY.some((p) => name.includes(p))) return
  try {
    await ev(REDACT)
    await ev(`window.__GUIDE_REDACT__(${JSON.stringify(MAP)})`)
    await ev('window.__GUIDE_SCRUB__()')
    await sleep(650)
    await ev(`window.__GUIDE_REDACT__(${JSON.stringify(MAP)})`)
    await ev('window.__GUIDE_SCRUB__()')
    let drawn = 0
    if (markers && markers.length) {
      await ev(ANNOTATE)
      drawn = await ev(`window.__GUIDE_ANNOTATE__(${JSON.stringify(markers)})`)
    }
    const params = { format: 'png', captureBeyondViewport: full }
    if (full) {
      const m = await cdp.send('Page.getLayoutMetrics')
      params.clip = {
        x: 0, y: 0,
        width: Math.ceil(m.cssContentSize.width),
        height: Math.min(Math.ceil(m.cssContentSize.height), 4200),
        scale: 1,
      }
    }
    const { data } = await cdp.send('Page.captureScreenshot', params)
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'))
    console.log(`  ok ${name}${markers ? ` (marks: ${drawn})` : ''}`)
    if (markers && markers.length && drawn === 0) {
      failures.push(`${name}: no marker matched its target`)
    }
  } catch (err) {
    failures.push(`${name}: ${err.message}`)
    console.log('  FAIL', name, '-', err.message)
  }
}

const clickText = (txt, sel = 'button, a, .pr-selection-card, .pr-plat-dashboard-card, .cp-section-card') => ev(`
  (() => {
    const el = [...document.querySelectorAll(${JSON.stringify(sel)})]
      .find(e => (e.textContent || '').includes(${JSON.stringify(txt)}));
    if (!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true;
  })()`)

const clickSel = (sel, nth = 0) => ev(`
  (() => { const e=document.querySelectorAll(${JSON.stringify(sel)})[${nth}];
    if(!e) return false; e.scrollIntoView({block:'center'}); e.click(); return true })()`)

const scrollTo = async (y) => { await ev(`window.scrollTo({top:${y},behavior:'instant'})`); await sleep(450) }

/* ───────────────── student ───────────────── */
console.log('· landing + login')
// Start from the state a first-time visitor is in: no stored theme at all.
// That is what gives the dark landing page and the light in-app UI, and it is
// what the rest of the screenshots were captured in. The browser profile is
// reused between runs, so this has to be cleared explicitly.
await goto(`${BASE}/login?tenant=default`, 4000)
await ev("localStorage.removeItem('theme'); true")
await goto(`${BASE}/login?tenant=default`, 7000)
await shot('student-01-landing', [{ sel: '.aa-cta-row .aa-btn-outline', nth: 0, dir: 'bottom' }])

await clickSel('.aa-nav-actions .aa-btn-ghost', 1)
await sleep(1300)
await shot('student-03-login-modal', [
  { sel: '.auth-modal .input-wrapper', nth: 0, dir: 'left', len: 60 },
  { sel: '.auth-modal .modern-btn', nth: 0, dir: 'bottom' },
])

await clickSel('.forgot-btn')
await sleep(1100)
await shot('student-04-forgot-password', [{ sel: '.auth-modal .modern-btn', nth: 0, dir: 'bottom' }])
await clickSel('.auth-modal-close')
await sleep(700)

await clickSel('.aa-nav-actions .aa-btn-ghost', 1)
await sleep(1100)
await ev(`
  (() => {
    const setVal=(el,v)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};
    const m=document.querySelector('.auth-modal');
    const i=m.querySelectorAll('input[type="text"], input[type="password"]');
    setVal(i[0],${JSON.stringify(PHONE)}); setVal(i[1],${JSON.stringify(PASS)});
    return true })()`)
await sleep(400)
await shot('student-05-login-filled', [{ sel: '.auth-modal .modern-btn', nth: 0, dir: 'bottom' }])
await ev("document.querySelector('.auth-modal form').requestSubmit()")
await sleep(9500)

const u = JSON.parse(await ev('sessionStorage.getItem("masar-user")'))
MAP = {
  ...MAP,
  [u.name]: 'أحمد محمود',
  [u.phone]: '01000000000',
  [u.parent_phone || '\u0000']: '01100000000',
  [u.id]: '11111111-2222-3333-4444-555555555555',
  [u.id.slice(0, 8)]: '11111111',
  [u.barcode_token || '\u0000']: 'BC-0000000000',
  [u.qr_token || '\u0000']: '0000000000000000',
}
console.log('· signed in')

console.log('· home / nav')
await goto(`${BASE}/`, 6500)
await shot('student-06-home-top', [{ sel: '.mh__burger', dir: 'bottom', len: 70 }])

await clickSel('.mh__burger')
await sleep(1200)
await shot('student-09-nav-drawer', [{ sel: '.mh-drawer__nav .mh-drawer__link', nth: 1, dir: 'left', len: 60 }])
await ev("document.querySelector('.mh-drawer').click()")
await sleep(700)

console.log('· videos')
await goto(`${BASE}/videos`, 7000)
await shot('student-12-videos-list', [{ sel: '.vc-card', nth: 0, dir: 'bottom' }], true)

let playerOpen = false
const nCards = (await ev("document.querySelectorAll('.vc-card').length")) || 0
for (let i = 0; i < Math.min(nCards, 8) && !playerOpen; i++) {
  await clickSel('.vc-card', i)
  await sleep(5500)
  playerOpen = await ev("!!document.querySelector('.vpw-root') && !document.querySelector('.modal.show')")
  if (!playerOpen) {
    // Match the dialog's dismiss button by class, not by its label: the label
    // carries an alef-maddah that is easy to mistype, and a missed dismiss
    // leaves the error dialog sitting on top of the next screenshot.
    await ev("(()=>{const b=document.querySelector('.modal.show .btn-primary')||document.querySelector('.modal .close-btn');if(b){b.click();return 1}return 0})()")
    await sleep(1200)
  }
}
if (playerOpen) {
  await shot('student-13-video-player', [{ sel: '.vpw-back-button', dir: 'bottom', len: 64 }])
}

console.log('· exams')
await goto(`${BASE}/exams`, 6500)
await shot('student-15-exams-types', [{ sel: '.exam-section button', nth: 1, dir: 'top', len: 64 }])
await clickText('الامتحانات الشاملة')
await sleep(3500)
await shot('student-16-exams-list', [{ sel: '.ec-card .ec-status-bar', nth: 0, dir: 'left', len: 58 }], true)

console.log('· homework')
await goto(`${BASE}/homework`, 7000)
await shot('student-19-homework-list', [{ text: 'حل الواجب', within: 'button', dir: 'top', len: 64 }])
const hwOpen = await clickText('حل الواجب')
await sleep(4000)
if (hwOpen && (await ev("!!document.querySelector('.hw-modal')"))) {
  await shot('student-20-homework-submit', [{ text: 'إرسال الإجابات', within: 'button', dir: 'top', len: 58 }])
}

console.log('· reports / payments / profile')
await goto(`${BASE}/report`, 6500)
await shot('student-21-reports-home', [{ sel: '.cp-section-card', nth: 0, dir: 'bottom' }], true)

await goto(`${BASE}/payments`, 7000)
await shot('student-26-payments', [{ sel: '.pay-card-copy-btn', nth: 0, dir: 'left', len: 58 }], true)

await goto(`${BASE}/profile`, 7500)
await scrollTo(0)
await shot('student-28-profile', null, true)

/* ───────────────── parent ───────────────── */
if (PARENT_PHONE) {
  console.log('· parent portal')
  await ev("sessionStorage.clear(); localStorage.setItem('theme','dark'); true")
  await goto(`${BASE}/login?tenant=default`, 7000)
  await shot('parent-01-entry', [{ text: 'تقارير ولي الأمر', within: 'button', nth: 1, dir: 'bottom', len: 70 }])

  await clickText('تقارير ولي الأمر')
  await sleep(1500)
  await shot('parent-02-lookup-modal', [
    { sel: '.auth-modal .input-wrapper', nth: 0, dir: 'left', len: 58 },
    { sel: '.auth-modal .modern-btn', nth: 0, dir: 'bottom' },
  ])

  await ev(`
    (() => {
      const setVal=(el,v)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};
      const m=document.querySelector('.auth-modal');
      setVal(m.querySelector('input'), ${JSON.stringify(PARENT_PHONE)});
      m.querySelector('form').requestSubmit(); return true })()`)
  await sleep(8500)

  const names = JSON.parse((await ev(`
    JSON.stringify([...document.querySelectorAll('.children-selector button')]
      .map(b => { const d=b.querySelector('div > div'); return d ? d.textContent.trim() : '' }).filter(Boolean))`)) || '[]')
  names.forEach((n, i) => { MAP[n] = FAKE_NAMES[i % FAKE_NAMES.length] })
  console.log(`  · ${names.length} child record(s) anonymised`)

  if (names.length) {
    await shot('parent-03-children-list', [{ sel: '.children-selector button', nth: 0, dir: 'left', len: 58 }])
    await clickSel('.children-selector button', 0)
  }
  await sleep(9000)

  const cur = await ev("(()=>{const e=document.querySelector('.pr-card div[style*=\"1.25rem\"]');return e?e.textContent.trim():''})()")
  if (cur && !MAP[cur] && !Object.values(MAP).includes(cur)) MAP[cur] = FAKE_NAMES[0]

  await scrollTo(0)
  await shot('parent-04-selection', [{ sel: '.pr-selection-card', nth: 0, dir: 'top', len: 60 }], true)

  await clickText('تقارير السنتر', '.pr-selection-card')
  await sleep(6000)
  await scrollTo(0)
  await shot('parent-06-sibling-switcher', [{ sel: '.pr-card', nth: 0, dir: 'bottom', len: 60 }])
  await shot('parent-05-center-report', null, true)

  await ev('history.back()')
  await sleep(4000)
  await clickText('تقارير المنصة التعليمية', '.pr-selection-card')
  await sleep(9000)
  await scrollTo(0)
  await shot('parent-07-platform-dashboard', [{ sel: '.pr-plat-dashboard-card', nth: 0, dir: 'left', len: 56 }], true)
}

console.log('done')
if (failures.length) { console.log('issues:'); failures.forEach((f) => console.log('  -', f)) }
cdp.close(); chrome.kill(); process.exit(0)
