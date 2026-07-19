// Supabase Edge Function: wapilot-send
// ----------------------------------------------------------------------------
// Sends a WhatsApp message through the tenant's configured WAPilot instance,
// SERVER-SIDE. The browser never talks to WAPilot directly (their API blocks
// browser calls via CORS), and the API token never needs to reach the client.
//
// Safety:
//   - Caller must be a logged-in admin/assistant; the tenant is derived from
//     the caller's own profile — an admin can only send via their own tenant's
//     gateway settings.
//   - Reads gateway config (instance/token) with the service role.
//
// Input (single):  { phone: '01030018386' | '2010...', message: 'نص الرسالة' }
// Output (single): { ok: true, message_id } | { error }
//
// Input (batch):   { batch: true, limit?: 25 }
//   Processes up to `limit` pending WhatsApp rows from unified_notifications
//   for the caller's tenant — auth/config resolved ONCE for the whole batch
//   (~4× fewer requests than per-message invocations), with an anti-ban delay
//   between sends. Statuses are written per row, so a crash loses nothing.
// Output (batch):  { ok: true, results: [{id, status, error?}], remaining }
//
// Auto-resume: a pg_cron heartbeat (backend/migrations/
// 2026_07_19_whatsapp_auto_resume_cron.sql) invokes batch mode every 10
// minutes for tenants with pending rows, passing { batch, tenant_id } and
// the x-cron-secret header — so a paused queue (daily cap / working hours)
// resumes without anyone clicking "Send".
//
// Required secrets (auto-injected): SUPABASE_URL, SUPABASE_ANON_KEY,
//                                   SUPABASE_SERVICE_ROLE_KEY
// Additional secret (set via CLI):  WAPILOT_CRON_SECRET
// ----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── Anti-ban pacing configuration ───────────────────────────────────────────
// Human-shaped sending: random gap after every send, and a longer breather
// after a randomized number of successful sends. All tunable here — or per
// tenant via config.gateway.pacing { min_delay_seconds, max_delay_seconds,
// min_batch_size, max_batch_size, min_batch_pause, max_batch_pause } (the
// same hook future per-tenant rate limits / working hours will use).
const PACING = {
  MIN_DELAY_SECONDS: 3,
  MAX_DELAY_SECONDS: 8,
  MIN_BATCH_SIZE: 10,     // successful sends before a long pause (randomized
  MAX_BATCH_SIZE: 20,     // in this range, re-rolled after every pause)
  MIN_BATCH_PAUSE: 20,    // seconds
  MAX_BATCH_PAUSE: 45,
  // Retry backoff for failed sends (seconds): base * 2^attempt ± jitter,
  // capped. Rows wait this long before the batch query picks them up again.
  RETRY_BASE_SECONDS: 60,
  RETRY_CAP_SECONDS: 3600,
  // Stop pulling new work after this much wall-clock time and hand the rest
  // back to the caller loop — edge invocations must never die mid-batch.
  TIME_BUDGET_MS: 110_000,
}

// ── Automatic safety engine: warm-up, daily caps, working hours ─────────────
// Zero teacher configuration. Warm-up progresses automatically by days since
// the number's first successful send (anchor auto-initialized and persisted
// in config.gateway.warmup_started_at). Values are deliberately conservative
// — the objective is long-term account health, not throughput. Developers
// may tune them globally here; per-tenant nothing needs to be set.
const LIMITS = {
  // Automatic warm-up phases by day-since-activation (inclusive upper bound).
  WARMUP_PHASES: [
    { maxDay: 7, limit: 60 },   // Phase 1
    { maxDay: 14, limit: 100 }, // Phase 2
    { maxDay: 21, limit: 150 }, // Phase 3
  ],
  NORMAL_DAILY_LIMIT: 250,       // Normal Mode (day 22+) — never unlimited
  SAFETY_MARGIN: [0.88, 0.92],   // stop at ~88–92% of the cap, never 100%
  WORK_START_HOUR: 9,            // tenant-local sending window
  WORK_END_HOUR: 22,
  AVG_SECONDS_PER_MESSAGE: 7,    // pacing average — used only for ETA info
  DEFAULT_TIMEZONE: 'Africa/Cairo',
}

// Today's effective allowance for a tenant, from the warm-up anchor.
function resolveAutoLimits(gateway: Record<string, unknown> | null | undefined, anchorIso: string | null) {
  const g = (gateway || {}) as Record<string, unknown>
  const tz = String(g.timezone || LIMITS.DEFAULT_TIMEZONE)
  let base = LIMITS.NORMAL_DAILY_LIMIT
  if (anchorIso) {
    const anchorMs = Date.parse(anchorIso)
    if (Number.isFinite(anchorMs)) {
      const day = Math.floor((Date.now() - anchorMs) / 86_400_000) + 1
      for (const phase of LIMITS.WARMUP_PHASES) {
        if (day <= phase.maxDay) { base = Math.min(phase.limit, base); break }
      }
    }
  }
  // Safety margin: never aim for 100% of the cap.
  const effective = Math.max(1, Math.floor(base * randBetween(LIMITS.SAFETY_MARGIN[0], LIMITS.SAFETY_MARGIN[1])))
  return { base, effective, timezone: tz }
}

// Is the tenant-local clock inside the sending window? If not, when does it
// next open? (Rows are never failed for being outside the window.)
function workingWindow(tz: string) {
  const dayStartMs = startOfTodayUtc(tz).getTime()
  const openMs = dayStartMs + LIMITS.WORK_START_HOUR * 3_600_000
  const closeMs = dayStartMs + LIMITS.WORK_END_HOUR * 3_600_000
  const now = Date.now()
  if (now < openMs) return { open: false, nextOpenIso: new Date(openMs).toISOString() }
  if (now >= closeMs) return { open: false, nextOpenIso: new Date(openMs + 86_400_000).toISOString() }
  return { open: true, nextOpenIso: null }
}

// Coarse, informational-only completion estimate for the pending queue.
function estimateCompletion(pendingCount: number, allowanceNow: number, dailyCapacity: number): string | null {
  if (!pendingCount || pendingCount <= 0) return null
  const sendMs = LIMITS.AVG_SECONDS_PER_MESSAGE * 1000
  if (pendingCount <= allowanceNow) return new Date(Date.now() + pendingCount * sendMs).toISOString()
  const extraDays = Math.ceil((pendingCount - allowanceNow) / Math.max(1, dailyCapacity))
  return new Date(Date.now() + extraDays * 86_400_000 + Math.min(pendingCount, dailyCapacity) * sendMs).toISOString()
}

// Difference between a timezone's wall clock and UTC at `date`.
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]))
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
  return asUtc - date.getTime()
}

// Start of "today" in the tenant's timezone, as a UTC instant.
function startOfTodayUtc(tz: string): Date {
  const now = new Date()
  try {
    const offset = tzOffsetMs(now, tz)
    const local = new Date(now.getTime() + offset)
    return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset)
  } catch {
    // Unknown timezone string → fall back to UTC midnight (still safe).
    const u = new Date()
    return new Date(Date.UTC(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()))
  }
}

const randBetween = (min: number, max: number) => min + Math.random() * (max - min)
const sleep = (ms: number) => new Promise((s) => setTimeout(s, ms))

// Merge per-tenant overrides (config.gateway.pacing) over the defaults.
function resolvePacing(gateway: Record<string, unknown> | null | undefined) {
  const p = (gateway?.pacing || {}) as Record<string, number>
  const num = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : fallback)
  return {
    minDelayMs: num(p.min_delay_seconds, PACING.MIN_DELAY_SECONDS) * 1000,
    maxDelayMs: num(p.max_delay_seconds, PACING.MAX_DELAY_SECONDS) * 1000,
    minBatchSize: Math.max(1, num(p.min_batch_size, PACING.MIN_BATCH_SIZE)),
    maxBatchSize: Math.max(1, num(p.max_batch_size, PACING.MAX_BATCH_SIZE)),
    minBatchPauseMs: num(p.min_batch_pause, PACING.MIN_BATCH_PAUSE) * 1000,
    maxBatchPauseMs: num(p.max_batch_pause, PACING.MAX_BATCH_PAUSE) * 1000,
  }
}

// Randomized exponential backoff timestamp for a failed row.
function nextRetryAt(attempts: number): string {
  const base = PACING.RETRY_BASE_SECONDS * Math.pow(2, Math.max(0, attempts - 1))
  const capped = Math.min(base, PACING.RETRY_CAP_SECONDS)
  const jittered = capped * randBetween(0.8, 1.3)
  return new Date(Date.now() + jittered * 1000).toISOString()
}
const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { ...CORS, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })

// Same normalization as backend/parentNotificationsApi.js (incl. the guard
// against a full phone number pasted into the country-code field).
function normalizePhoneIntl(phone: string, countryCode = '20'): string {
  let cc = String(countryCode || '').replace(/[^0-9]/g, '')
  if (cc.length < 1 || cc.length > 3) cc = '20'
  let p = String(phone || '').replace(/[^0-9]/g, '')
  if (!p) return ''
  if (p.startsWith('00')) p = p.slice(2)
  if (p.startsWith(cc) && p.length >= 11) return p
  if (p.startsWith('0')) p = p.slice(1)
  return cc + p
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, { status: 405 })

  try {
    const { phone, message, batch, limit, tenant_id } = await req.json()
    if (!batch && (!phone || !message)) return json({ error: 'phone and message are required' }, { status: 400 })

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey)

    // 1) Authorize the caller.
    //    a) Cron mode (auto-resume): the pg_cron heartbeat invokes batch mode
    //       with an explicit tenant_id and the shared WAPILOT_CRON_SECRET
    //       header — no user JWT exists on a scheduled call. Batch-only.
    //    b) Normal mode: a logged-in admin/assistant; tenant derived from
    //       their own profile, exactly as before.
    const cronSecret = Deno.env.get('WAPILOT_CRON_SECRET') || ''
    const isCron = Boolean(batch && tenant_id && cronSecret) &&
      req.headers.get('x-cron-secret') === cronSecret

    let tenantId: string
    if (isCron) {
      tenantId = String(tenant_id)
    } else {
      const authHeader = req.headers.get('Authorization') || ''
      const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
      const { data: { user }, error: userErr } = await asCaller.auth.getUser()
      if (userErr || !user) return json({ error: 'unauthorized' }, { status: 401 })

      const { data: profile } = await admin
        .from('profiles')
        .select('role, tenant_id')
        .eq('id', user.id)
        .single()
      if (!profile || !['admin', 'assistant', 'super_admin'].includes(profile.role)) {
        return json({ error: 'forbidden' }, { status: 403 })
      }
      tenantId = profile.tenant_id
    }

    // 3) Load the tenant's gateway settings
    const { data: tenant } = await admin
      .from('tenants')
      .select('config')
      .eq('id', tenantId)
      .single()
    const g = tenant?.config?.gateway
    if (!g || g.type !== 'wapilot' || !g.wapilot_instance_id || !g.wapilot_token) {
      return json({ error: 'لم يتم تفعيل بوابة WAPilot لهذه المنصة' }, { status: 400 })
    }

    const endpoint = (g.wapilot_api_url || 'https://api.wapilot.net/api/v2/{instance_id}/send-message')
      .replace('{instance_id}', g.wapilot_instance_id)
      .replace('INSTANCE_ID', g.wapilot_instance_id)

    const sendOne = async (chatId: string, text: string) => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': g.wapilot_token,
          'Idempotency-Key': `masar-fn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        },
        body: JSON.stringify({ chat_id: chatId, text }),
      })
      const raw = await res.text()
      if (!res.ok) throw new Error(`WAPilot (${res.status}): ${raw.slice(0, 180)}`)
      try { return JSON.parse(raw) as { message_id?: string } } catch { return {} }
    }

    // ── Single-message mode ────────────────────────────────────────────
    if (!batch) {
      const chatId = normalizePhoneIntl(phone, g.country_code || '20')
      const parsed = await sendOne(chatId, message)
      return json({ ok: true, message_id: parsed.message_id || null, chat_id: chatId })
    }

    // ── Batch mode: drain up to `limit` pending rows for THIS tenant ──
    // One sequential worker, human-shaped pacing, hard time budget. Rows whose
    // retry backoff hasn't expired are skipped (whatsapp_next_retry_at).
    const startedAt = Date.now()
    const timeLeft = () => PACING.TIME_BUDGET_MS - (Date.now() - startedAt)
    const pacing = resolvePacing(g)
    const nowIso = new Date().toISOString()

    // Warm-up anchor: auto-initialized ONCE per tenant to the number's first
    // successful send (a veteran number lands straight in Normal Mode; a new
    // number starts Phase 1). Persisted so later invocations skip this.
    let anchorIso = typeof g.warmup_started_at === 'string' && g.warmup_started_at ? g.warmup_started_at : null
    if (!anchorIso) {
      const { data: firstSent } = await admin
        .from('unified_notifications')
        .select('created_at')
        .eq('tenant_id', tenantId)
        .contains('channels', ['whatsapp'])
        .eq('status->>whatsapp', 'sent')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      anchorIso = firstSent?.created_at || new Date().toISOString()
      const newConfig = { ...(tenant?.config || {}), gateway: { ...g, warmup_started_at: anchorIso } }
      await admin.from('tenants').update({ config: newConfig }).eq('id', tenantId)
    }

    const limits = resolveAutoLimits(g, anchorIso)

    // Shared helper for both "stop" responses — queue stays fully intact.
    const pendingCount = async () => {
      const { count } = await admin
        .from('unified_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .contains('channels', ['whatsapp'])
        .eq('status->>whatsapp', 'pending')
      return count || 0
    }

    // Gate 1 — working hours (tenant-local, no query needed).
    const win = workingWindow(limits.timezone)
    if (!win.open) {
      const queued = await pendingCount()
      console.log(
        `Outside working hours. Tenant: ${tenantId} | ` +
        `Remaining queue: ${queued} | Next execution: ${win.nextOpenIso} (${limits.timezone})`
      )
      return json({
        ok: true, results: [], remaining: queued,
        limit_reached: true, reason: 'outside_working_hours',
        next_allowed_at: win.nextOpenIso,
        daily_limit: limits.effective,
        estimated_completion_at: estimateCompletion(queued, 0, limits.effective),
      })
    }

    // Gate 2 — daily safety cap: ONE count per invocation (never per
    // message). whatsapp_sent_at is an ISO UTC string, so >= tenant-midnight
    // -as-UTC compares correctly as text.
    const dayStartIso = startOfTodayUtc(limits.timezone).toISOString()
    const nextAllowedAt = new Date(startOfTodayUtc(limits.timezone).getTime() + 24 * 3_600_000 + LIMITS.WORK_START_HOUR * 3_600_000).toISOString()
    const { count: sentToday } = await admin
      .from('unified_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .contains('channels', ['whatsapp'])
      .eq('status->>whatsapp', 'sent')
      .gte('status->>whatsapp_sent_at', dayStartIso)
    let allowance = Math.max(0, limits.effective - (sentToday || 0))

    if (allowance === 0) {
      // Stop cleanly: queue untouched, rows stay pending, resumes on the
      // first processing attempt in tomorrow's window.
      const queued = await pendingCount()
      console.log(
        `Daily safety limit reached. Tenant: ${tenantId} | ` +
        `Sent today: ${sentToday} / ${limits.effective} | ` +
        `Remaining queue: ${queued} | Next execution: ${nextAllowedAt} (${limits.timezone})`
      )
      return json({
        ok: true, results: [], remaining: queued,
        limit_reached: true, reason: 'daily_limit',
        sent_today: sentToday || 0, daily_limit: limits.effective,
        capacity_remaining: 0, next_allowed_at: nextAllowedAt,
        estimated_completion_at: estimateCompletion(queued, 0, limits.effective),
      })
    }

    const batchLimit = Math.min(Math.max(Number(limit) || 25, 1), 25)
    const { data: rows, error: qErr } = await admin
      .from('unified_notifications')
      .select('id, message, status, recipient_phone, profiles:student_id ( parent_phone )')
      .eq('tenant_id', tenantId)
      .contains('channels', ['whatsapp'])
      .eq('status->>whatsapp', 'pending')
      .or(`status->>whatsapp_next_retry_at.is.null,status->>whatsapp_next_retry_at.lte.${nowIso}`)
      .order('created_at', { ascending: true })
      .limit(batchLimit)
    if (qErr) return json({ error: qErr.message }, { status: 500 })

    const results: Array<{ id: string; status: string; error?: string }> = []
    // Successful sends until the next long "human" pause (re-rolled each time).
    let burstLeft = Math.round(randBetween(pacing.minBatchSize, pacing.maxBatchSize))

    for (const row of rows || []) {
      // Daily allowance exhausted → stop; the rest stay pending until the
      // tenant's next day.
      if (allowance <= 0) break
      // Out of time budget → hand the rest back to the caller loop.
      if (timeLeft() < pacing.maxDelayMs + 15_000) break

      const statusMap = { ...(row.status || {}) } as Record<string, unknown>
      // recipient_phone is the phone snapshot resolved when the row was queued
      // (manual announcements can target the student's own number); legacy
      // rows fall back to the parent phone as before.
      const typed = row as { recipient_phone?: string; profiles?: { parent_phone?: string } }
      const targetPhone = typed.recipient_phone || typed.profiles?.parent_phone
      let hitProvider = false
      try {
        if (!targetPhone) throw new Error('رقم الهاتف غير متوفر')
        hitProvider = true
        await sendOne(normalizePhoneIntl(targetPhone, g.country_code || '20'), row.message)
        statusMap.whatsapp = 'sent'
        statusMap.whatsapp_sent_at = new Date().toISOString()
        delete statusMap.whatsapp_error
        delete statusMap.whatsapp_next_retry_at
        results.push({ id: row.id, status: 'sent' })
        allowance--
      } catch (sendErr) {
        statusMap.whatsapp = 'failed'
        statusMap.whatsapp_error = (sendErr as Error).message.slice(0, 200)
        const attempts = (Number(statusMap.whatsapp_attempts) || 0) + 1
        statusMap.whatsapp_attempts = attempts
        // Backoff only matters if the row gets retried (manually or later):
        // it stops rapid re-hammering of a failing number/gateway.
        if (hitProvider) statusMap.whatsapp_next_retry_at = nextRetryAt(attempts)
        results.push({ id: row.id, status: 'failed', error: statusMap.whatsapp_error as string })
      }
      await admin.from('unified_notifications').update({ status: statusMap }).eq('id', row.id)

      // Anti-ban pacing: random gap after anything that reached WAPilot.
      if (hitProvider) {
        if (statusMap.whatsapp === 'sent' && --burstLeft <= 0) {
          // Natural longer breather after a burst of successful sends —
          // only if the budget allows; otherwise ending the invocation
          // provides the pause naturally.
          const pauseMs = randBetween(pacing.minBatchPauseMs, pacing.maxBatchPauseMs)
          if (timeLeft() > pauseMs + 20_000) {
            await sleep(pauseMs)
            burstLeft = Math.round(randBetween(pacing.minBatchSize, pacing.maxBatchSize))
          } else {
            break
          }
        } else {
          await sleep(randBetween(pacing.minDelayMs, pacing.maxDelayMs))
        }
      }
    }

    // How many pending remain (so the client knows whether to loop)
    const { count: remaining } = await admin
      .from('unified_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .contains('channels', ['whatsapp'])
      .eq('status->>whatsapp', 'pending')

    const sentNow = results.filter((r) => r.status === 'sent').length
    const sentTodayTotal = (sentToday || 0) + sentNow
    const capacityRemaining = Math.max(0, limits.effective - sentTodayTotal)
    const limitReached = allowance <= 0
    if (limitReached) {
      console.log(
        `Daily safety limit reached. Tenant: ${tenantId} | ` +
        `Sent today: ${sentTodayTotal} / ${limits.effective} | ` +
        `Remaining queue: ${remaining || 0} | Next execution: ${nextAllowedAt} (${limits.timezone})`
      )
    }

    // Queue status — informational only (today's count, remaining capacity,
    // queue depth, coarse completion estimate).
    return json({
      ok: true, results, remaining: remaining || 0,
      limit_reached: limitReached,
      ...(limitReached ? { reason: 'daily_limit', next_allowed_at: nextAllowedAt } : {}),
      sent_today: sentTodayTotal,
      daily_limit: limits.effective,
      capacity_remaining: capacityRemaining,
      estimated_completion_at: estimateCompletion(remaining || 0, capacityRemaining, limits.effective),
    })
  } catch (e) {
    return json({ error: (e as Error).message || 'unexpected error' }, { status: 500 })
  }
})
