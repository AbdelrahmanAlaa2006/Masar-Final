// Minimal Chrome DevTools Protocol driver used ONLY to capture documentation
// screenshots. It does not touch application source in any way — it drives a
// headless Chrome against the local dev server and writes PNG files.
import WebSocket from 'ws'

export class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.id = 0
    this.pending = new Map()
    this.listeners = new Map()
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 })
      this.ws.on('open', () => resolve())
      this.ws.on('error', reject)
      this.ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)
          this.pending.delete(msg.id)
          if (msg.error) reject(new Error(JSON.stringify(msg.error)))
          else resolve(msg.result)
        } else if (msg.method) {
          const ls = this.listeners.get(msg.method) || []
          ls.forEach((fn) => fn(msg.params))
        }
      })
    })
  }

  on(method, fn) {
    const ls = this.listeners.get(method) || []
    ls.push(fn)
    this.listeners.set(method, ls)
  }

  // Every call is bounded: a stalled renderer should fail the step loudly
  // instead of hanging the whole capture run forever.
  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP timeout after ${timeoutMs}ms: ${method}`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v) },
        reject: (e) => { clearTimeout(timer); reject(e) },
      })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression, awaitPromise = true) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    })
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails))
    }
    return r.result?.value
  }

  close() {
    try { this.ws.close() } catch {}
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function getTarget(port) {
  // Retry: Chrome needs a moment to open its debugging endpoint.
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page
    } catch {}
    await sleep(500)
  }
  throw new Error('Chrome debugging endpoint never came up')
}
