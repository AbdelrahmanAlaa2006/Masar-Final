/* ---------------------------------------------------------------------------
   Masaar WhatsApp Sender Agent
   ---------------------------------------------------------------------------
   Free, automated sending of the parent-notification queue from the admin's
   own PC — no Docker, no server, no paid gateway.

   How it works:
   1. Logs into Supabase with the tenant admin's email + password, so RLS
      automatically scopes everything to that tenant (multi-tenant safe).
   2. Connects to WhatsApp via Baileys (QR scan once; the session is saved in
      ./auth_state so later runs reconnect automatically).
   3. Every POLL_SECONDS it fetches pending queue rows and sends them with a
      RANDOM human-like delay between messages plus a DAILY_LIMIT cap —
      the anti-ban measures.

   Start it with start-sender.bat (double-click) or `npm start`.
   --------------------------------------------------------------------------- */

import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import { createClient } from '@supabase/supabase-js'
import qrcode from 'qrcode-terminal'
import dotenv from 'dotenv'
import pino from 'pino'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Config ──────────────────────────────────────────────────────────────────
// Reads ./ .env first, then falls back to the project's ../.env for the
// Supabase URL/key so there is less to configure.
dotenv.config({ path: path.join(__dirname, '.env') })
const parentEnv = dotenv.config({ path: path.join(__dirname, '..', '.env') }).parsed || {}

const SUPABASE_URL = process.env.SUPABASE_URL || parentEnv.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || parentEnv.VITE_SUPABASE_ANON_KEY
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

const COUNTRY_CODE = process.env.COUNTRY_CODE || '20'          // Egypt default
const MIN_DELAY_SECONDS = Number(process.env.MIN_DELAY_SECONDS || 25)
const MAX_DELAY_SECONDS = Number(process.env.MAX_DELAY_SECONDS || 60)
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT || 200)
const POLL_SECONDS = Number(process.env.POLL_SECONDS || 60)

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('\n❌ Missing configuration. Create whatsapp-sender/.env with:')
  console.error('   ADMIN_EMAIL=...   (the tenant admin login email, e.g. 01099999999@masaar.app)')
  console.error('   ADMIN_PASSWORD=...')
  console.error('   (SUPABASE_URL / SUPABASE_ANON_KEY are read from the project .env automatically)\n')
  process.exit(1)
}

// ── Daily counter (persisted so restarts do not reset the anti-ban cap) ─────
const COUNTER_FILE = path.join(__dirname, 'sent_today.json')
function readCounter() {
  try {
    const c = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'))
    if (c.date === new Date().toDateString()) return c
  } catch {}
  return { date: new Date().toDateString(), count: 0 }
}
function bumpCounter() {
  const c = readCounter()
  c.count += 1
  fs.writeFileSync(COUNTER_FILE, JSON.stringify(c))
  return c.count
}

// ── Helpers ─────────────────────────────────────────────────────────────────
// Same normalization as the web app: '01000379547' -> '201000379547'
function normalizePhoneIntl(phone, countryCode = COUNTRY_CODE) {
  let p = String(phone || '').replace(/[^0-9]/g, '')
  if (!p) return ''
  if (p.startsWith('00')) p = p.slice(2)
  if (p.startsWith(countryCode) && p.length >= 11) return p
  if (p.startsWith('0')) p = p.slice(1)
  return countryCode + p
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const randomDelayMs = () =>
  (MIN_DELAY_SECONDS + Math.random() * Math.max(1, MAX_DELAY_SECONDS - MIN_DELAY_SECONDS)) * 1000

// ── Supabase (RLS-scoped: we sign in as the tenant admin) ───────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: true },
})

async function supabaseLogin() {
  const { error } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  })
  if (error) {
    console.error('❌ Supabase login failed:', error.message)
    process.exit(1)
  }
  console.log('✅ Logged into the platform as', ADMIN_EMAIL)
}

async function fetchPending(limit = 10) {
  const { data, error } = await supabase
    .from('unified_notifications')
    .select('id, message, status, profiles:student_id ( parent_phone, name )')
    .contains('channels', ['whatsapp'])
    .order('created_at', { ascending: true })
    .limit(50)
  if (error) throw error
  return (data || []).filter((r) => (r.status?.whatsapp || 'pending') === 'pending').slice(0, limit)
}

async function markStatus(row, ok, errMsg) {
  const s = { ...(row.status || {}) }
  if (ok) {
    s.whatsapp = 'sent'
    s.whatsapp_sent_at = new Date().toISOString()
    s.whatsapp_error = null
    s.whatsapp_via = 'agent'
  } else {
    s.whatsapp = 'failed'
    s.whatsapp_retry_count = (s.whatsapp_retry_count || 0) + 1
    s.whatsapp_error = errMsg || 'unknown error'
  }
  await supabase.from('unified_notifications').update({ status: s }).eq('id', row.id)
}

// ── WhatsApp connection (Baileys) ───────────────────────────────────────────
let sock = null
let waReady = false

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_state'))

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Masaar Sender', 'Chrome', '1.0'],
    syncFullHistory: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log('\n📱 Scan this QR with the WhatsApp you want to send FROM:')
      console.log('   (WhatsApp → Settings → Linked Devices → Link a Device)\n')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      waReady = true
      console.log('✅ WhatsApp connected. The sender is now running.')
      console.log(`   Sending pace: ${MIN_DELAY_SECONDS}-${MAX_DELAY_SECONDS}s between messages, max ${DAILY_LIMIT}/day.\n`)
    }

    if (connection === 'close') {
      waReady = false
      const code = lastDisconnect?.error?.output?.statusCode
      if (code === DisconnectReason.loggedOut) {
        console.error('❌ WhatsApp session logged out. Delete the auth_state folder and run again to scan a new QR.')
        process.exit(1)
      }
      console.log('⚠️  WhatsApp disconnected — reconnecting...')
      setTimeout(startWhatsApp, 5000)
    }
  })
}

async function sendWhatsApp(phone, text) {
  const number = normalizePhoneIntl(phone)
  if (!number) throw new Error('invalid phone number')
  const jid = `${number}@s.whatsapp.net`
  // Brief "typing…" presence makes the sending pattern more human-like.
  try {
    await sock.presenceSubscribe(jid)
    await sock.sendPresenceUpdate('composing', jid)
    await sleep(1200 + Math.random() * 1800)
    await sock.sendPresenceUpdate('paused', jid)
  } catch {}
  await sock.sendMessage(jid, { text })
}

// ── Main processing loop ────────────────────────────────────────────────────
let busy = false

async function processQueueOnce() {
  if (!waReady || busy) return
  busy = true
  try {
    const counter = readCounter()
    if (counter.count >= DAILY_LIMIT) {
      console.log(`⏸  Daily limit reached (${DAILY_LIMIT}). Waiting for tomorrow to protect the number.`)
      return
    }

    const pending = await fetchPending(Math.min(10, DAILY_LIMIT - counter.count))
    if (pending.length === 0) return

    console.log(`📬 ${pending.length} pending message(s) — sending with random delays...`)
    for (const row of pending) {
      const phone = row.profiles?.parent_phone
      if (!phone) {
        await markStatus(row, false, 'رقم هاتف ولي الأمر غير متوفر')
        continue
      }
      try {
        await sendWhatsApp(phone, row.message)
        await markStatus(row, true)
        const total = bumpCounter()
        console.log(`   ✅ sent to ${phone} (student: ${row.profiles?.name || '-'}) — ${total}/${DAILY_LIMIT} today`)
      } catch (err) {
        await markStatus(row, false, err.message)
        console.log(`   ❌ failed for ${phone}: ${err.message}`)
      }
      // The anti-ban pause between consecutive messages.
      const wait = randomDelayMs()
      console.log(`   ⏳ waiting ${(wait / 1000).toFixed(0)}s before the next message...`)
      await sleep(wait)
      if (readCounter().count >= DAILY_LIMIT) break
    }
  } catch (err) {
    console.error('⚠️  Queue processing error:', err.message)
  } finally {
    busy = false
  }
}

// ── Boot ────────────────────────────────────────────────────────────────────
console.log('──────────────────────────────────────────────')
console.log('  Masaar WhatsApp Sender — free automated agent')
console.log('──────────────────────────────────────────────')
await supabaseLogin()
await startWhatsApp()
setInterval(processQueueOnce, POLL_SECONDS * 1000)
processQueueOnce()
