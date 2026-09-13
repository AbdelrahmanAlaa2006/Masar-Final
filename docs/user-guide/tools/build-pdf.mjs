/**
 * Prints the generated HTML to PDF with headless Chrome.
 * Chrome does the Arabic shaping and bidi layout, so the text in the PDF is
 * identical to what the HTML renders — no separate text-layout engine to
 * disagree with the browser.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { CDP, getTarget, sleep } from './cdp.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const HTML = path.join(ROOT, 'student-parent-guide.html')
const OUT = path.join(ROOT, 'student-parent-guide.pdf')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9340

if (!fs.existsSync(HTML)) throw new Error('run build-html.mjs first')

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  '--headless=new',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  '--allow-file-access-from-files',
  `--user-data-dir=${process.env.TEMP}\\guide-chrome-pdf`,
  'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })

const target = await getTarget(PORT)
const cdp = new CDP(target.webSocketDebuggerUrl)
await cdp.connect()
await cdp.send('Page.enable')

await cdp.send('Page.navigate', { url: pathToFileURL(HTML).href })

// Wait for the in-document paginator to finish laying the flow into pages.
let ready = false
for (let i = 0; i < 120 && !ready; i++) {
  await sleep(500)
  ready = await cdp.evaluate(`document.documentElement.getAttribute('data-ready') === 'true'`).catch(() => false)
}
if (!ready) throw new Error('pagination never completed')

const pageCount = await cdp.evaluate('window.__PAGE_COUNT__')
const overflow = await cdp.evaluate(`
  JSON.stringify([...document.querySelectorAll('.page-inner')]
    .map((el, i) => (el.scrollHeight - el.clientHeight > 2
      ? { page: i + 1, over: el.scrollHeight - el.clientHeight,
          first: (el.firstElementChild ? el.firstElementChild.className : '?'),
          text: (el.innerText || '').trim().slice(0, 70) }
      : null))
    .filter(Boolean))
`)

await sleep(1200) // let embedded fonts settle before printing

const { data } = await cdp.send('Page.printToPDF', {
  printBackground: true,
  paperWidth: 8.2677,   // A4
  paperHeight: 11.6929,
  marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
  preferCSSPageSize: false,
  scale: 1,
}, 180000)

fs.writeFileSync(OUT, Buffer.from(data, 'base64'))
console.log('pdf written ·', pageCount, 'pages ·', (fs.statSync(OUT).size / 1024 / 1024).toFixed(2), 'MB')
if (JSON.parse(overflow).length) {
  console.log('WARNING: content overflows on page(s):', overflow)
}

cdp.close()
chrome.kill()
process.exit(0)
