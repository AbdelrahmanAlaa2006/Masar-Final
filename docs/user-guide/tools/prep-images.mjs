/**
 * Prepares captured screenshots for print.
 *
 * Raw captures are 2× device pixels and, for full-page shots, extremely tall —
 * scaled to fit an A4 page they would be a few millimetres wide and unreadable.
 * This crops anything taller than a fixed aspect to its top portion (which is
 * the part the surrounding instructions refer to), scales to a print-sensible
 * width, and re-encodes as JPEG so the document is a sane size.
 *
 * The pixels are never altered beyond cropping and scaling — no retouching.
 * Chrome's canvas does the work, so no image library is added to the project.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CDP, getTarget, sleep } from './cdp.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(__dirname, '..', 'screenshots')
const OUT = path.resolve(__dirname, '..', 'screenshots-print')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9350

const MAX_ASPECT = 2.0    // height / width — taller than this gets cropped
const TARGET_W = 660      // output width in pixels
const QUALITY = 0.88

fs.mkdirSync(OUT, { recursive: true })

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  '--no-default-browser-check', '--disable-gpu',
  `--user-data-dir=${process.env.TEMP}\\guide-chrome-prep`, 'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })

const target = await getTarget(PORT)
const cdp = new CDP(target.webSocketDebuggerUrl)
await cdp.connect()
await cdp.send('Page.enable')
await cdp.send('Page.navigate', { url: 'about:blank' })
await sleep(800)

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.png')).sort()
let totalIn = 0
let totalOut = 0

for (const f of files) {
  const buf = fs.readFileSync(path.join(SRC, f))
  totalIn += buf.length
  const b64 = buf.toString('base64')

  const outB64 = await cdp.evaluate(`
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const aspect = img.height / img.width;
        const cropH = aspect > ${MAX_ASPECT} ? Math.round(img.width * ${MAX_ASPECT}) : img.height;
        const scale = ${TARGET_W} / img.width;
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(cropH * scale);
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, img.width, cropH, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', ${QUALITY}).split(',')[1]);
      };
      img.onerror = () => resolve('');
      img.src = 'data:image/png;base64,${b64}';
    })
  `, true, 120000)

  if (!outB64) { console.log('  ✗', f); continue }
  const out = Buffer.from(outB64, 'base64')
  totalOut += out.length
  fs.writeFileSync(path.join(OUT, f.replace(/\.png$/, '.jpg')), out)
}

console.log(
  `prepared ${files.length} images · ${(totalIn / 1024 / 1024).toFixed(1)} MB → ${(totalOut / 1024 / 1024).toFixed(1)} MB`
)

cdp.close(); chrome.kill(); process.exit(0)
