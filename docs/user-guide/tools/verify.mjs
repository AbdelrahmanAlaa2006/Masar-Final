/**
 * Visual verification.
 *
 * Renders selected pages of the generated document and writes them as PNGs so
 * the Arabic shaping, RTL direction, table of contents numbering, tables and
 * figures can actually be looked at rather than assumed.
 *
 * The same Chrome build lays out this HTML and prints the PDF, so what these
 * images show is what the PDF contains.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { CDP, getTarget, sleep } from './cdp.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const HTML = path.join(ROOT, 'student-parent-guide.html')
const OUT = path.join(__dirname, 'verify')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9351

const WANTED = (process.env.VERIFY_PAGES || '1,2,3,5,7,9,14,20,27,33,41,48,55,60')
  .split(',').map((n) => parseInt(n, 10))

fs.mkdirSync(OUT, { recursive: true })

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
  '--allow-file-access-from-files',
  `--user-data-dir=${process.env.TEMP}\\guide-chrome-verify`, 'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })

const target = await getTarget(PORT)
const cdp = new CDP(target.webSocketDebuggerUrl)
await cdp.connect()
await cdp.send('Page.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 900, height: 1300, deviceScaleFactor: 1.4, mobile: false,
})
await cdp.send('Page.navigate', { url: pathToFileURL(HTML).href })

let ready = false
for (let i = 0; i < 180 && !ready; i++) {
  await sleep(500)
  ready = await cdp.evaluate(`document.documentElement.getAttribute('data-ready') === 'true'`).catch(() => false)
}
if (!ready) throw new Error('pagination never completed')
await sleep(1500)

const total = await cdp.evaluate('window.__PAGE_COUNT__')
console.log('pages:', total)

for (const n of WANTED) {
  if (n < 1 || n > total) continue
  const box = await cdp.evaluate(`
    (() => {
      const p = document.querySelectorAll('.page')[${n - 1}];
      if (!p) return null;
      p.scrollIntoView();
      const r = p.getBoundingClientRect();
      return JSON.stringify({ x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height });
    })()
  `)
  if (!box) continue
  const b = JSON.parse(box)
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: b.x, y: b.y, width: b.w, height: b.h, scale: 1.4 },
  })
  fs.writeFileSync(path.join(OUT, `page-${String(n).padStart(2, '0')}.png`), Buffer.from(data, 'base64'))
  console.log('  ✓ page', n)
}

cdp.close(); chrome.kill(); process.exit(0)
