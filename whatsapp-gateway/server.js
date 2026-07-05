/* ---------------------------------------------------------------------------
   Masaar WhatsApp Gateway (multi-tenant)
   ---------------------------------------------------------------------------
   Host this ONCE (any small Node host — Render/Railway free tier, a cheap VPS,
   or even an always-on PC). Every teacher then links their own WhatsApp by
   scanning a QR shown INSIDE the app — no files, no terminal, nothing technical.

   Isolation: each request is authenticated with the caller's Supabase JWT; the
   gateway derives the tenant_id from that token (never trusts the client), so a
   tenant can only ever touch its own WhatsApp session and its own message queue.

   Anti-ban: random delay between messages + daily cap + "typing…" presence.
   --------------------------------------------------------------------------- */

import express from 'express'
import cors from 'cors'
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import { createClient } from '@supabase/supabase-js'
import QRCode from 'qrcode'
import pino from 'pino'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const PORT = process.env.PORT || 8790
const COUNTRY_CODE = process.env.COUNTRY_CODE || '20'
const MIN_DELAY_SECONDS = Number(process.env.MIN_DELAY_SECONDS || 25)
const MAX_DELAY_SECONDS = Number(process.env.MAX_DELAY_SECONDS || 60)
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT || 300)
const WORKER_SECONDS = Number(process.env.WORKER_SECONDS || 20)

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('\n❌ Missing config. Create whatsapp-gateway/.env with:')
  console.error('   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY\n')
  process.exit(1)
}

// Service client (trusted backend — bypasses RLS; we scope by tenant_id manually).
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
// Anon client only used to validate incoming user JWTs.
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })

// tenantId -> { sock, status, qrDataUrl, busy, sentToday:{date,count} }
const sessions = new Map()
// Where WhatsApp session credentials live. On a host, point SESSIONS_DIR at a
// persistent disk so teachers do not have to re-scan the QR after a restart.
const SESSIONS_DIR = process.env.SESSIONS_DIR || path.join(__dirname, 'sessions')
try { fs.mkdirSync(SESSIONS_DIR, { recursive: true }) } catch {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function normalizePhoneIntl(phone, cc = COUNTRY_CODE) {
  let p = String(phone || '').replace(/[^0-9]/g, '')
  if (!p) return ''
  if (p.startsWith('00')) p = p.slice(2)
  if (p.startsWith(cc) && p.length >= 11) return p
  if (p.startsWith('0')) p = p.slice(1)
  return cc + p
}

// ── Auth: verify the caller and resolve their tenant from the JWT ────────────
async function resolveTenant(token) {
  if (!token) throw { code: 401, msg: 'مطلوب تسجيل الدخول' }
  const { data: { user }, error } = await anon.auth.getUser(token)
  if (error || !user) throw { code: 401, msg: 'جلسة غير صالحة' }

  const { data: profile } = await admin
    .from('profiles').select('tenant_id, role').eq('id', user.id).maybeSingle()
  if (!profile?.tenant_id) throw { code: 403, msg: 'لا يوجد ملف مستخدم' }

  let allowed = ['admin', 'super_admin'].includes(profile.role)
  if (!allowed && profile.role === 'assistant') {
    const { data: ta } = await admin
      .from('tenant_admins').select('permissions').eq('user_id', user.id).maybeSingle()
    allowed = Array.isArray(ta?.permissions) && ta.permissions.includes('whatsapp')
  }
  if (!allowed) throw { code: 403, msg: 'لا تملك صلاحية إدارة الرسائل' }

  return { userId: user.id, tenantId: profile.tenant_id }
}

// ── WhatsApp session lifecycle (one per tenant) ──────────────────────────────
async function startSession(tenantId) {
  const existing = sessions.get(tenantId)
  if (existing?.sock && existing.status !== 'disconnected') return existing

  const authDir = path.join(SESSIONS_DIR, tenantId)
  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Masaar Notifications', 'Chrome', '1.0'],
    syncFullHistory: false,
  })

  const entry = { sock, status: 'connecting', qrDataUrl: null, busy: false, sentToday: existing?.sentToday }
  sessions.set(tenantId, entry)
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u
    if (qr) {
      entry.qrDataUrl = await QRCode.toDataURL(qr)
      entry.status = 'qr'
    }
    if (connection === 'open') {
      entry.status = 'connected'
      entry.qrDataUrl = null
      console.log(`✅ tenant ${tenantId} WhatsApp connected`)
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      if (code === DisconnectReason.loggedOut) {
        console.log(`⛔ tenant ${tenantId} logged out`)
        sessions.delete(tenantId)
        try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
      } else {
        entry.status = 'connecting'
        setTimeout(() => startSession(tenantId).catch(() => {}), 4000)
      }
    }
  })

  return entry
}

// Resume already-linked tenants on boot (their session creds are on disk).
function resumeSavedSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return
  for (const tenantId of fs.readdirSync(SESSIONS_DIR)) {
    startSession(tenantId).catch(() => {})
  }
}

// ── Queue worker: send pending notifications for every connected tenant ──────
function daily(entry) {
  const today = new Date().toDateString()
  if (entry.sentToday?.date !== today) entry.sentToday = { date: today, count: 0 }
  return entry.sentToday
}

async function markStatus(row, ok, err) {
  const s = { ...(row.status || {}) }
  if (ok) {
    s.whatsapp = 'sent'; s.whatsapp_sent_at = new Date().toISOString(); s.whatsapp_error = null; s.whatsapp_via = 'gateway'
  } else {
    s.whatsapp = 'failed'; s.whatsapp_retry_count = (s.whatsapp_retry_count || 0) + 1; s.whatsapp_error = err || 'error'
  }
  await admin.from('unified_notifications').update({ status: s }).eq('id', row.id)
}

async function sendQueueForTenant(tenantId, entry) {
  if (entry.status !== 'connected' || entry.busy) return
  const d = daily(entry)
  if (d.count >= DAILY_LIMIT) return
  entry.busy = true
  try {
    const { data } = await admin
      .from('unified_notifications')
      .select('id, message, status, profiles:student_id ( parent_phone, name )')
      .eq('tenant_id', tenantId)
      .contains('channels', ['whatsapp'])
      .order('created_at', { ascending: true })
      .limit(30)

    const pending = (data || [])
      .filter((r) => (r.status?.whatsapp || 'pending') === 'pending')
      .slice(0, Math.min(8, DAILY_LIMIT - d.count))

    for (const row of pending) {
      const phone = row.profiles?.parent_phone
      if (!phone) { await markStatus(row, false, 'رقم ولي الأمر غير متوفر'); continue }
      try {
        const jid = `${normalizePhoneIntl(phone)}@s.whatsapp.net`
        await entry.sock.sendPresenceUpdate('composing', jid)
        await sleep(1200 + Math.random() * 1500)
        await entry.sock.sendMessage(jid, { text: row.message })
        await markStatus(row, true)
        d.count++
      } catch (e) {
        await markStatus(row, false, e.message)
      }
      await sleep((MIN_DELAY_SECONDS + Math.random() * (MAX_DELAY_SECONDS - MIN_DELAY_SECONDS)) * 1000)
      if (d.count >= DAILY_LIMIT) break
    }
  } catch (e) {
    console.error(`worker ${tenantId}:`, e.message)
  } finally {
    entry.busy = false
  }
}

// ── HTTP API (called by the app) ─────────────────────────────────────────────
const app = express()
app.use(cors())
app.use(express.json())

async function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    req.ctx = await resolveTenant(token)
    next()
  } catch (e) {
    res.status(e.code || 500).json({ error: e.msg || 'error' })
  }
}

app.get('/health', (_req, res) => res.json({ ok: true }))

app.get('/api/status', auth, (req, res) => {
  const s = sessions.get(req.ctx.tenantId)
  res.json({
    status: s?.status || 'disconnected',
    qr: s?.status === 'qr' ? s.qrDataUrl : null,
    sent_today: s?.sentToday?.count || 0,
    daily_limit: DAILY_LIMIT,
  })
})

app.post('/api/connect', auth, async (req, res) => {
  const s = await startSession(req.ctx.tenantId)
  // Give Baileys a moment to emit the first QR.
  await sleep(1500)
  const cur = sessions.get(req.ctx.tenantId)
  res.json({ status: cur?.status || 'connecting', qr: cur?.status === 'qr' ? cur.qrDataUrl : null })
})

app.post('/api/disconnect', auth, async (req, res) => {
  const s = sessions.get(req.ctx.tenantId)
  try { await s?.sock?.logout() } catch {}
  sessions.delete(req.ctx.tenantId)
  try { fs.rmSync(path.join(SESSIONS_DIR, req.ctx.tenantId), { recursive: true, force: true }) } catch {}
  res.json({ status: 'disconnected' })
})

app.listen(PORT, () => {
  console.log('──────────────────────────────────────────────')
  console.log(`  Masaar WhatsApp Gateway running on port ${PORT}`)
  console.log(`  Pace: ${MIN_DELAY_SECONDS}-${MAX_DELAY_SECONDS}s/msg · cap ${DAILY_LIMIT}/day`)
  console.log('──────────────────────────────────────────────')
  resumeSavedSessions()
  setInterval(() => {
    for (const [tenantId, entry] of sessions) sendQueueForTenant(tenantId, entry)
  }, WORKER_SECONDS * 1000)
})
