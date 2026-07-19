import { supabase } from './supabase'
import { invalidate as invalidateCache } from '../src/utils/cache'
import { updateNotificationStatus } from './unifiedNotificationsApi'

// ── Anti-ban pacing (client-side fallback sender) ───────────────────────────
// Mirrors the PACING config in supabase/functions/wapilot-send (the primary,
// server-side sender). Human-shaped sending: a random 3–8s gap after every
// message and a longer 20–45s breather after every 10–20 successful sends.
// Tune here — never hardcode delays in the loops below.
const PACING = {
  MIN_DELAY_SECONDS: 3,
  MAX_DELAY_SECONDS: 8,
  MIN_BATCH_SIZE: 10,
  MAX_BATCH_SIZE: 20,
  MIN_BATCH_PAUSE: 20,
  MAX_BATCH_PAUSE: 45,
}
const randBetween = (min, max) => min + Math.random() * (max - min)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const randomSendDelay = () => sleep(randBetween(PACING.MIN_DELAY_SECONDS, PACING.MAX_DELAY_SECONDS) * 1000)
const randomBatchPause = () => sleep(randBetween(PACING.MIN_BATCH_PAUSE, PACING.MAX_BATCH_PAUSE) * 1000)
const rollBurstSize = () => Math.round(randBetween(PACING.MIN_BATCH_SIZE, PACING.MAX_BATCH_SIZE))

// Get paginated parent notifications list.
// statusFilter: 'all' | 'pending' | 'sent' | 'failed' — filtered in SQL so
// pagination and counts stay correct per tab.
export async function listNotificationQueue(page = 1, limit = 50, statusFilter = 'all') {
  const rangeStart = (page - 1) * limit
  const rangeEnd = page * limit - 1

  let query = supabase
    .from('unified_notifications')
    .select(`
      id,
      message,
      type,
      status,
      created_at,
      recipient,
      recipient_phone,
      profiles:student_id (
        name,
        parent_phone
      )
    `, { count: 'exact' })
    .contains('channels', ['whatsapp'])

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status->>whatsapp', statusFilter)
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(rangeStart, rangeEnd)

  if (error) throw error
  return {
    items: (data || []).map(item => {
      const whatsappStatus = item.status?.whatsapp || 'pending'
      const lastError = item.status?.whatsapp_error || null
      const retryCount = item.status?.whatsapp_retry_count || 0
      const sentAt = item.status?.whatsapp_sent_at || null

      return {
        id: item.id,
        // recipient_phone is the phone snapshot resolved when the row was
        // queued (announcements); legacy rows fall back to the parent phone.
        phone: item.recipient_phone || item.profiles?.parent_phone || '—',
        recipient: item.recipient || 'parent',
        message: item.message,
        type: item.type,
        status: whatsappStatus,
        retry_count: retryCount,
        last_error: lastError,
        created_at: item.created_at,
        sent_at: sentAt,
        student_name: item.profiles?.name || '—'
      }
    }),
    total: count || 0
  }
}

// Get statistics summary of notifications
export async function getNotificationQueueSummary() {
  // Head-only count queries — previously this downloaded EVERY row's status
  // and counted in the browser, which grows unbounded with message history.
  const base = () => supabase
    .from('unified_notifications')
    .select('id', { count: 'exact', head: true })
    .contains('channels', ['whatsapp'])

  const [p, s, f] = await Promise.all([
    base().eq('status->>whatsapp', 'pending'),
    base().eq('status->>whatsapp', 'sent'),
    base().eq('status->>whatsapp', 'failed'),
  ])
  const err = p.error || s.error || f.error
  if (err) throw err

  const pending = p.count || 0
  const sent = s.count || 0
  const failed = f.count || 0
  return { pending, sent, failed, total: pending + sent + failed }
}

// Retry a specific notification
export async function retryNotification(id) {
  // Read current row status
  const { data: row } = await supabase
    .from('unified_notifications')
    .select('status')
    .eq('id', id)
    .maybeSingle()

  const updatedStatus = { ...(row?.status || {}) }
  updatedStatus.whatsapp = 'pending'
  updatedStatus.whatsapp_error = null
  // An explicit admin retry must never wait out the automatic backoff.
  delete updatedStatus.whatsapp_next_retry_at

  const { data, error } = await supabase
    .from('unified_notifications')
    .update({ status: updatedStatus })
    .eq('id', id)
    .select()

  if (error) throw error
  return data
}

// Reset all failed notifications to pending
export async function retryAllFailed(tenantId) {
  // Read all failed rows first
  const { data: failedRows } = await supabase
    .from('unified_notifications')
    .select('id, status')
    .eq('tenant_id', tenantId)

  const failedWhatsapp = (failedRows || []).filter(r => r.status?.whatsapp === 'failed')

  const promises = failedWhatsapp.map(async (row) => {
    const updatedStatus = { ...(row.status || {}) }
    updatedStatus.whatsapp = 'pending'
    updatedStatus.whatsapp_error = null
    // An explicit admin retry must never wait out the automatic backoff.
    delete updatedStatus.whatsapp_next_retry_at

    return supabase
      .from('unified_notifications')
      .update({ status: updatedStatus })
      .eq('id', row.id)
  })

  await Promise.all(promises)
  return failedWhatsapp
}

// Clear all pending WhatsApp notifications for a tenant
export async function clearPendingQueue(tenantId) {
  if (!tenantId) throw new Error('Tenant ID is required')
  
  const { data, error } = await supabase
    .from('unified_notifications')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('status->>whatsapp', 'pending')

  if (error) throw error
  return true
}

// Update gateway configuration inside the tenant's config column
export async function updateGatewayConfig(tenantId, newGatewaySettings) {
  if (!tenantId) throw new Error('Tenant ID is required')

  // Fetch current config first
  const { data: tenant, error: fetchError } = await supabase
    .from('tenants')
    .select('config')
    .eq('id', tenantId)
    .single()

  if (fetchError) throw fetchError

  const updatedConfig = {
    ...(tenant.config || {}),
    gateway: newGatewaySettings
  }

  // Update in tenants table
  const { data, error } = await supabase
    .from('tenants')
    .update({ config: updatedConfig })
    .eq('id', tenantId)
    .select()
    .single()

  if (error) throw error
  
  // Clear tenant sessionStorage cache
  const cacheKeyPattern = `masar-cached-tenant-`
  if (typeof window !== 'undefined') {
    Object.keys(window.sessionStorage).forEach(key => {
      if (key.startsWith(cacheKeyPattern)) {
        window.sessionStorage.removeItem(key)
      }
    })
  }

  return data
}

/* ---------------------------------------------------------------------------
   Gateways (simplified — Evolution/Docker, Telegram, UltraMsg and generic
   webhooks were removed):

   1. 'whatsapp_manual' — free, zero setup, zero ban risk. Messages are sent
      through wa.me click-to-chat links: the admin clicks a button, WhatsApp
      opens with the parent's number + message prefilled, they press send.
      Because a human sends from the teacher's own official WhatsApp app,
      there is no automation on the account and nothing to ban.

   2. 'whatsapp_cloud' — the OFFICIAL Meta WhatsApp Business Cloud API.
      No server needed: a direct HTTPS call with two settings (Phone Number ID
      + Access Token). Business-initiated messages require an approved message
      template, so a template name can be configured; the notification text is
      injected as the template's {{1}} variable. Without a template, plain text
      is sent (only delivered inside the 24h customer-service window).

   Each tenant stores its own gateway settings in tenants.config.gateway,
   so teachers are fully isolated from each other.
   --------------------------------------------------------------------------- */

// Normalize a local phone to international digits (default Egypt +20).
// '010 0037 9547' -> '201000379547'
export function normalizePhoneIntl(phone, countryCode = '20') {
  // Country calling codes are 1–3 digits. Anything else (empty, or a full
  // phone number pasted into the field by mistake) silently produced garbage
  // recipients like 2010644830361030018386 — fall back to Egypt instead.
  let cc = String(countryCode || '').replace(/[^0-9]/g, '')
  if (cc.length < 1 || cc.length > 3) cc = '20'
  let p = String(phone || '').replace(/[^0-9]/g, '')
  if (!p) return ''
  if (p.startsWith('00')) p = p.slice(2)
  if (p.startsWith(cc) && p.length >= 11) return p
  if (p.startsWith('0')) p = p.slice(1)
  return cc + p
}

// Build a wa.me click-to-chat link with the message prefilled.
export function buildWaMeLink(phone, message, countryCode = '20') {
  const to = normalizePhoneIntl(phone, countryCode)
  return `https://wa.me/${to}?text=${encodeURIComponent(message || '')}`
}

// Mark a notification as sent after the admin sent it manually via wa.me.
export async function markNotificationManuallySent(id) {
  const { data: row } = await supabase
    .from('unified_notifications')
    .select('status')
    .eq('id', id)
    .maybeSingle()

  const updatedStatus = { ...(row?.status || {}) }
  updatedStatus.whatsapp = 'sent'
  updatedStatus.whatsapp_sent_at = new Date().toISOString()
  updatedStatus.whatsapp_error = null
  updatedStatus.whatsapp_via = 'manual'

  const { data, error } = await supabase
    .from('unified_notifications')
    .update({ status: updatedStatus })
    .eq('id', id)
    .select()
  if (error) throw error
  return data
}

// Single-message sender bridge (called during automatic queue processing)
export async function sendGatewayMessage(gatewayConfig, notification) {
  if (!gatewayConfig) {
    throw new Error('لم يتم تهيئة إعدادات بوابة الإرسال')
  }

  const { type } = gatewayConfig
  const messageText = notification.message
  const to = normalizePhoneIntl(notification.phone, gatewayConfig.country_code || '20')

  if (type === 'whatsapp_manual') {
    // Manual mode has no automatic sender — the UI opens wa.me links instead.
    throw new Error('وضع الإرسال اليدوي مفعّل: استخدم زر الواتساب الأخضر بجوار كل رسالة')
  }

  if (type === 'whatsapp_cloud') {
    const { phone_number_id, token, template_name, template_lang } = gatewayConfig
    if (!phone_number_id || !token) {
      throw new Error('بيانات واتساب الرسمي غير مكتملة (Phone Number ID أو Access Token مفقود)')
    }

    // With an approved template: inject the text as the {{1}} body variable
    // (required for business-initiated messages). Otherwise send plain text
    // (works only inside the 24h customer-service window).
    const body = template_name
      ? {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: template_name,
            language: { code: template_lang || 'ar' },
            components: [{ type: 'body', parameters: [{ type: 'text', text: messageText }] }],
          },
        }
      : { messaging_product: 'whatsapp', to, type: 'text', text: { body: messageText } }

    const response = await fetch(`https://graph.facebook.com/v21.0/${phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}))
      throw new Error(`WhatsApp API (${response.status}): ${errJson?.error?.message || 'فشل الإرسال'}`)
    }
    return true
  }

  if (type === 'wapilot') {
    const { wapilot_api_url, wapilot_instance_id, wapilot_token } = gatewayConfig
    if (!wapilot_token || !wapilot_instance_id) {
      throw new Error('بيانات WAPilot غير مكتملة (Instance ID أو API Token مفقود)')
    }

    // Preferred path: the wapilot-send Edge Function — server-side, works in
    // production, and keeps the token off the client. Falls back to the dev
    // proxy below only when the function isn't deployed yet.
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke('wapilot-send', {
        body: { phone: to, message: messageText },
      })
      if (!fnError && fnData?.ok) return true
      if (!fnError && fnData?.error) throw new Error(fnData.error)
      // fnError (e.g. 404 not deployed) → fall through to the direct path
    } catch (fnErr) {
      // Real gateway errors surface; deployment/availability errors fall through
      if (fnErr?.message && !/Failed to send a request|not found|404/i.test(fnErr.message)) {
        throw fnErr
      }
    }

    // WAPilot v2 API (from their dashboard docs):
    //   POST https://api.wapilot.net/api/v2/{INSTANCE_ID}/send-message
    //   headers: token, Idempotency-Key, Content-Type
    //   body: { chat_id: '2010xxxxxxxx', text: '...' }
    let url = (wapilot_api_url || 'https://api.wapilot.net/api/v2/{instance_id}/send-message')
      .replace('{instance_id}', wapilot_instance_id)
      .replace('INSTANCE_ID', wapilot_instance_id)

    // In local development, route through the Vite dev proxy to bypass CORS
    // (see vite.config.js → server.proxy['/wapilot-proxy']).
    if (import.meta.env.DEV) {
      url = url
        .replace('https://api.wapilot.net', '/wapilot-proxy')
        .replace('https://app.wapilot.net', '/wapilot-proxy')
    }

    let response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': wapilot_token,
          // Unique per attempt so retries are not swallowed as duplicates
          'Idempotency-Key': `masar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        },
        body: JSON.stringify({ chat_id: to, text: messageText }),
      })
    } catch (netErr) {
      // A TypeError on a reachable host almost always means the browser
      // blocked the call (CORS). Surface that clearly so it's diagnosable.
      throw new Error('تعذّر الوصول لخادم WAPilot من المتصفح (غالباً حماية CORS). أرسل نص الخطأ من الـ Console وسنحوّل الإرسال عبر وسيط.')
    }

    const raw = await response.text()
    // Surface the raw provider response during development — "accepted" and
    // "delivered" are different things with these gateways.
    if (import.meta.env.DEV) {
      console.log('[WAPilot] response', response.status, raw)
    }
    if (!response.ok) {
      throw new Error(`WAPilot (${response.status}): ${raw.slice(0, 180) || 'فشل الإرسال'}`)
    }
    // Some providers return 200 with { status: 'error' } — check loosely
    try {
      const j = JSON.parse(raw)
      if (j && (j.status === 'error' || j.success === false || j.error)) {
        throw new Error(`WAPilot: ${JSON.stringify(j).slice(0, 180)}`)
      }
    } catch (e) {
      if (e.message && e.message.startsWith('WAPilot:')) throw e
      // non-JSON 200 response — treat as success
    }
    return true
  }

  throw new Error('بوابة غير مدعومة — افتح إعدادات البوابة واختر وضع الإرسال ثم احفظ')
}

// Queue processor loop (processes pending notifications with rate limiting client-side)
export async function processNotificationQueue(tenantConfig, onProgress) {
  const gatewayConfig = tenantConfig?.config?.gateway
  if (!gatewayConfig) {
    throw new Error('يرجى ضبط إعدادات بوابة الإرسال أولاً')
  }

  // WAPilot: drain the queue in server-side batches via the edge function —
  // auth/config resolve once per 25 messages instead of once per message
  // (~4× fewer requests), and the batch survives the admin closing the tab.
  if (gatewayConfig.type === 'wapilot') {
    let totalSent = 0
    // Runaway guard. Batches are time-budgeted server-side (the function
    // paces sends with randomized anti-ban delays and returns before its
    // wall-clock limit), so one batch is ~15 messages — 80 covers ~1200.
    for (let i = 0; i < 80; i++) {
      const { data, error } = await supabase.functions.invoke('wapilot-send', {
        body: { batch: true, limit: 25 },
      })
      if (error) throw new Error(error.message || 'فشل الاتصال بدالة الإرسال')
      if (data?.error) throw new Error(data.error)
      const results = data?.results || []
      results.forEach((r) => {
        if (r.status === 'sent') totalSent++
        onProgress?.(r.id, r.status, r.error || null)
      })
      if (!data?.remaining || results.length === 0) break
    }
    return totalSent
  }

  // Fetch pending unified notifications for whatsapp
  const { data: pending, error } = await supabase
    .from('unified_notifications')
    .select(`
      id,
      message,
      type,
      status,
      created_at,
      recipient_phone,
      profiles:student_id ( parent_phone )
    `)
    .contains('channels', ['whatsapp'])
    // Filter for pending IN SQL — filtering after a 20-row window meant that
    // once 20+ old sent rows existed, new pending messages were never reached
    // and the processor reported "0 sent" forever.
    .eq('status->>whatsapp', 'pending')
    .limit(20)
    .order('created_at', { ascending: true })

  if (error) throw error
  if (!pending || pending.length === 0) return 0

  const pendingWhatsapp = pending.filter(row => row.status?.whatsapp === 'pending')
  if (pendingWhatsapp.length === 0) return 0

  let processedCount = 0
  // Successful sends until the next long "human" pause (re-rolled each time).
  let burstLeft = rollBurstSize()

  for (const notif of pendingWhatsapp) {
    // Announcement rows carry the resolved phone snapshot (parent OR the
    // student's own number); legacy rows fall back to the parent phone.
    const targetPhone = notif.recipient_phone || notif.profiles?.parent_phone
    if (!targetPhone) {
      // Mark as failed if no phone can be resolved
      const statusMap = { ...(notif.status || {}) }
      statusMap.whatsapp = 'failed'
      statusMap.whatsapp_error = 'رقم الهاتف غير متوفر'
      await supabase.from('unified_notifications').update({ status: statusMap }).eq('id', notif.id)
      continue
    }

    try {
      // 1. Call API gateway
      await sendGatewayMessage(gatewayConfig, {
        phone: targetPhone,
        message: notif.message,
        type: notif.type
      })

      // 2. Mark as sent on success
      const statusMap = { ...(notif.status || {}) }
      statusMap.whatsapp = 'sent'
      statusMap.whatsapp_sent_at = new Date().toISOString()
      statusMap.whatsapp_error = null

      await supabase
        .from('unified_notifications')
        .update({ status: statusMap })
        .eq('id', notif.id)

      processedCount++
      if (onProgress) onProgress(notif.id, 'sent', null)

      // Anti-ban pacing: random gap after every send; longer breather after
      // a randomized burst of successful sends.
      if (--burstLeft <= 0) {
        await randomBatchPause()
        burstLeft = rollBurstSize()
      } else {
        await randomSendDelay()
      }
    } catch (err) {
      console.error(`Failed to process notification ${notif.id}:`, err)

      // 3. Mark as failed on error
      const statusMap = { ...(notif.status || {}) }
      statusMap.whatsapp = 'failed'
      statusMap.whatsapp_retry_count = (statusMap.whatsapp_retry_count || 0) + 1
      statusMap.whatsapp_error = err.message || 'خطأ غير معروف'

      await supabase
        .from('unified_notifications')
        .update({ status: statusMap })
        .eq('id', notif.id)

      if (onProgress) onProgress(notif.id, 'failed', err.message)

      // The gateway was still hit — keep pacing, never hammer retries.
      await randomSendDelay()
    }
  }

  return processedCount;
}
