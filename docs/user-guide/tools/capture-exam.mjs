/**
 * Focused re-capture for the exam screens.
 *
 * The main run found no startable exam under «الامتحانات الشاملة» for the test
 * student's grade — every one had expired. This tries both assessment types and
 * walks every card, so if anything at all is still open it gets captured.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CDP, getTarget, sleep } from './cdp.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..', 'screenshots')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9341
const BASE = 'http://localhost:3000'
const PHONE = process.env.GUIDE_PHONE
const PASS = process.env.GUIDE_PASS
const REDACT_SRC = fs.readFileSync(path.join(__dirname, 'redact.js'), 'utf8')

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=2',
  `--user-data-dir=${process.env.TEMP}\\guide-chrome-exam`, 'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })

const target = await getTarget(PORT)
const cdp = new CDP(target.webSocketDebuggerUrl)
await cdp.connect()
await cdp.send('Page.enable')
await cdp.send('Network.enable')
await cdp.send('Network.setBlockedURLs', {
  urls: ['*queue_public_notification*', '*localhost:8790*', '*wapilot*', '*wa.me*', '*/wapilot-proxy*'],
})
await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    const sync=(p,f)=>{try{Object.defineProperty(window,p,{get:()=>window[f],configurable:true})}catch{}};
    sync('outerWidth','innerWidth'); sync('outerHeight','innerHeight');
    const s=document.createElement('style');
    s.textContent='.dev-tenant-switcher{display:none!important}img[src=""],img:not([src]){visibility:hidden!important}';
    const a=()=>(document.head||document.documentElement).appendChild(s);
    if(document.head)a();else document.addEventListener('DOMContentLoaded',a);
  })();`,
})
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

let MAP = {}
const ev = (e) => cdp.evaluate(e)
const goto = async (u, w = 5000) => { await cdp.send('Page.navigate', { url: u }); await sleep(w) }

async function shot(name) {
  await ev(REDACT_SRC)
  await ev(`window.__GUIDE_REDACT__(${JSON.stringify(MAP)})`)
  await sleep(700)
  await ev(`window.__GUIDE_REDACT__(${JSON.stringify(MAP)})`)
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'))
  console.log('  ✓', name)
}

// ── sign in ──
await goto(`${BASE}/login?tenant=default`, 6500)
await ev(`
  (() => {
    const setVal=(el,v)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};
    [...document.querySelectorAll('.aa-nav-actions .aa-btn-ghost')][1].click();
    return new Promise(r => setTimeout(() => {
      const m=document.querySelector('.auth-modal');
      const i=m.querySelectorAll('input[type="text"], input[type="password"]');
      setVal(i[0],${JSON.stringify(PHONE)}); setVal(i[1],${JSON.stringify(PASS)});
      m.querySelector('form').requestSubmit(); r(1);
    }, 1200));
  })()
`)
await sleep(10000)
const u = JSON.parse(await ev('sessionStorage.getItem("masar-user")'))
MAP = {
  [u.name]: 'أحمد محمود',
  [u.phone]: '01000000000',
  [u.parent_phone || '\u0000']: '01100000000',
  [u.id]: '11111111-2222-3333-4444-555555555555',
  [u.barcode_token || '\u0000']: 'BC-0000000000',
  'عبدالرحمن علاء': 'كريم مصطفى',
  'Abdelrahman Alaa': 'Karim Mostafa',
  __initial: 'أ',
}
console.log('· signed in')

const dismiss = () => ev(`
  (() => {
    const b=[...document.querySelectorAll('.modal.active .modal-button,.modal .modal-button,.modal .btn,.modal .close-btn')]
      .find(x=>/حسناً|إغلاق|×/.test(x.textContent||''));
    if(b){b.click();return true} return false;
  })()
`)

let done = false
for (const type of ['التسميعات', 'الامتحانات الشاملة']) {
  if (done) break
  await goto(`${BASE}/exams`, 6000)
  await ev(`
    (() => {
      const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes(${JSON.stringify(type)}));
      if(b){b.click();return true} return false;
    })()
  `)
  await sleep(3500)
  const n = (await ev(`document.querySelectorAll('.ec-card').length`)) || 0
  console.log(`· ${type}: ${n} card(s)`)

  for (let i = 0; i < n && !done; i++) {
    await ev(`
      (() => { const c=document.querySelectorAll('.ec-card')[${i}];
        if(!c) return false; c.scrollIntoView({block:'center'}); c.click(); return true })()
    `)
    await sleep(6500)
    done = await ev(`!!document.querySelector('.et-question-area')`)
    if (!done) {
      await dismiss()
      await sleep(1000)
      if (await ev(`location.pathname === '/exam-taking'`)) {
        await goto(`${BASE}/exams`, 5000)
        await ev(`
          (() => { const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes(${JSON.stringify(type)}));
            if(b){b.click();return true} return false })()
        `)
        await sleep(3000)
      }
    }
  }
}

if (done) {
  await shot('student-17-exam-taking')
  await ev(`(() => { const b=document.querySelector('.et-map-trigger-btn'); if(b){b.click();return true} return false })()`)
  await sleep(1400)
  await shot('student-18-exam-question-map')
} else {
  console.log('  ✗ still no startable exam — every assessment for this grade has expired or has no attempts left')
}

cdp.close(); chrome.kill(); process.exit(0)
