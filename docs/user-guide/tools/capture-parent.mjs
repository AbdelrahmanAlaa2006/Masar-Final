/**
 * Parent-portal capture.
 *
 * Separate from the student run because it needs an extra safeguard: the test
 * parent number is linked to several real student records, so every child name
 * the portal renders is discovered first and mapped to a fictional name before
 * anything is painted into a screenshot.
 *
 * Outbound WhatsApp delivery is blocked at the network layer for the whole run.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CDP, getTarget, sleep } from './cdp.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..', 'screenshots')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9342
const BASE = 'http://localhost:3000'
const PARENT_PHONE = process.env.GUIDE_PARENT_PHONE
const REDACT_SRC = fs.readFileSync(path.join(__dirname, 'redact.js'), 'utf8')

const FAKE_NAMES = [
  'أحمد محمود سيد', 'مريم خالد عبد الله', 'يوسف طارق حسن',
  'نور الدين سامح', 'حبيبة عمرو فؤاد', 'مازن إبراهيم علي',
  'سلمى أشرف رمضان', 'كريم وليد نبيل',
]

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=2',
  `--user-data-dir=${process.env.TEMP}\\guide-chrome-parent`, 'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })

const target = await getTarget(PORT)
const cdp = new CDP(target.webSocketDebuggerUrl)
await cdp.connect()
await cdp.send('Page.enable')
await cdp.send('Network.enable')
await cdp.send('Network.setBlockedURLs', {
  urls: ['*queue_public_notification*', '*localhost:8790*', '*wapilot*', '*wa.me*', '*graph.facebook.com*', '*/wapilot-proxy*'],
})
await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    const sync=(p,f)=>{try{Object.defineProperty(window,p,{get:()=>window[f],configurable:true})}catch{}};
    sync('outerWidth','innerWidth'); sync('outerHeight','innerHeight');
    const s=document.createElement('style');
    s.textContent='.reveal-on-scroll{opacity:1!important;transform:none!important}.dev-tenant-switcher{display:none!important}img[src=""],img:not([src]){visibility:hidden!important}';
    const a=()=>(document.head||document.documentElement).appendChild(s);
    if(document.head)a();else document.addEventListener('DOMContentLoaded',a);
  })();`,
})
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

let MAP = {
  [PARENT_PHONE]: '01100000000',
  'عبدالرحمن علاء': 'كريم مصطفى',
  'Abdelrahman Alaa': 'Karim Mostafa',
  'Eyad Elalkamy': 'Development Team',
  __initial: 'أ',
}

const ev = (e) => cdp.evaluate(e)
const goto = async (u, w = 5000) => { await cdp.send('Page.navigate', { url: u }); await sleep(w) }
const failures = []

async function shot(name, full = false) {
  try {
    await ev(REDACT_SRC)
    await ev(`window.__GUIDE_REDACT__(${JSON.stringify(MAP)})`)
    await sleep(800)
    await ev(`window.__GUIDE_REDACT__(${JSON.stringify(MAP)})`)
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
    console.log('  ✓', name)
  } catch (e) {
    failures.push(`${name}: ${e.message}`)
    console.log('  ✗', name, '—', e.message)
  }
}

const clickText = (txt, sel = 'button, a, .pr-selection-card, .pr-plat-dashboard-card') => ev(`
  (() => {
    const el = [...document.querySelectorAll(${JSON.stringify(sel)})]
      .find(e => (e.textContent || '').includes(${JSON.stringify(txt)}));
    if (!el) return false;
    el.scrollIntoView({ block: 'center' }); el.click(); return true;
  })()
`)

// ── 1. landing ──
// The parent portal's child lists paint their labels in hardcoded white, which
// is unreadable on the light theme. Capture in the dark theme, which is what
// the page opens in by default and where the text is legible.
await goto(`${BASE}/login?tenant=default`, 7000)
await ev(`localStorage.setItem('theme','dark'); true`)
await goto(`${BASE}/login?tenant=default`, 7000)
await shot('parent-01-entry')

// ── 2. lookup modal ──
await clickText('تقارير ولي الأمر')
await sleep(1500)
await shot('parent-02-lookup-modal')

// ── 3. submit the phone ──
await ev(`
  (() => {
    const setVal=(el,v)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};
    const m=document.querySelector('.auth-modal');
    setVal(m.querySelector('input'), ${JSON.stringify(PARENT_PHONE)});
    m.querySelector('form').requestSubmit();
    return true;
  })()
`)
await sleep(8000)

// Discover every child name the portal is about to render, and map each one to
// a fictional name BEFORE the first screenshot of that list is taken.
const realNames = await ev(`
  JSON.stringify([...document.querySelectorAll('.children-selector button, .auth-modal .modern-btn')]
    .map(b => { const d = b.querySelector('div > div'); return d ? d.textContent.trim() : '' })
    .filter(Boolean))
`)
const names = JSON.parse(realNames || '[]')
names.forEach((n, i) => { MAP[n] = FAKE_NAMES[i % FAKE_NAMES.length] })
console.log(`· ${names.length} linked student record(s) — all names replaced with fictional ones`)

const multiChild = names.length > 0
if (multiChild) await shot('parent-03-children-list')
else failures.push('children list: this parent number is linked to a single student, so the picker never renders')

// ── 4. open the first child's report ──
if (multiChild) {
  await ev(`
    (() => {
      const b = document.querySelector('.children-selector button');
      if (b) { b.click(); return true } return false;
    })()
  `)
}
await sleep(9000)

// The report header carries the child's name too — capture whatever it shows
// and fold it into the map as well, in case the picker markup differed.
const current = await ev(`
  (() => {
    const el = document.querySelector('.pr-card div[style*="1.25rem"]');
    return el ? el.textContent.trim() : '';
  })()
`)
if (current && !MAP[current] && !Object.values(MAP).includes(current)) {
  MAP[current] = FAKE_NAMES[0]
  console.log('· mapped report header name as well')
}

await shot('parent-04-selection', true)

// ── 5. center reports ──
await clickText('تقارير السنتر', '.pr-selection-card')
await sleep(6000)
await shot('parent-05-center-report', true)

// ── 6. sibling switcher (only meaningful with more than one child) ──
if (multiChild) await shot('parent-06-sibling-switcher')

// ── 7. platform reports ──
await ev(`history.back()`)
await sleep(4000)
await clickText('تقارير المنصة التعليمية', '.pr-selection-card')
await sleep(9000)
await shot('parent-07-platform-dashboard', true)

await clickText('تقرير الفيديوهات', '.pr-plat-dashboard-card')
await sleep(6000)
await shot('parent-08-platform-videos', true)

console.log('done')
if (failures.length) failures.forEach((f) => console.log('  -', f))
cdp.close(); chrome.kill(); process.exit(0)
