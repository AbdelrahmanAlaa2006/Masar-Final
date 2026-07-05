import { supabase } from './supabase'
import { invalidate as invalidateCache } from '../src/utils/cache'
import { updateNotificationStatus } from './unifiedNotificationsApi'

// Get paginated parent notifications list
export async function listNotificationQueue(page = 1, limit = 50) {
  const rangeStart = (page - 1) * limit
  const rangeEnd = page * limit - 1

  const { data, error, count } = await supabase
    .from('unified_notifications')
    .select(`
      id,
      message,
      type,
      status,
      created_at,
      profiles:student_id (
        name,
        parent_phone
      )
    `, { count: 'exact' })
    .contains('channels', ['whatsapp'])
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
        phone: item.profiles?.parent_phone || '—',
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
  const { data, error } = await supabase
    .from('unified_notifications')
    .select('status')
    .contains('channels', ['whatsapp'])

  if (error) throw error

  let pending = 0
  let sent = 0
  let failed = 0

  data.forEach(r => {
    const whatsappStatus = r.status?.whatsapp || 'pending'
    if (whatsappStatus === 'pending') pending++
    else if (whatsappStatus === 'sent') sent++
    else if (whatsappStatus === 'failed') failed++
  })

  return { pending, sent, failed, total: data.length }
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

    return supabase
      .from('unified_notifications')
      .update({ status: updatedStatus })
      .eq('id', row.id)
  })

  await Promise.all(promises)
  return failedWhatsapp
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
  let p = String(phone || '').replace(/[^0-9]/g, '')
  if (!p) return ''
  if (p.startsWith('00')) p = p.slice(2)
  if (p.startsWith(countryCode) && p.length >= 11) return p
  if (p.startsWith('0')) p = p.slice(1)
  return countryCode + p
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

  throw new Error('بوابة غير مدعومة — افتح إعدادات البوابة واختر وضع الإرسال ثم احفظ')
}

// Queue processor loop (processes pending notifications with rate limiting client-side)
export async function processNotificationQueue(tenantConfig, onProgress) {
  const gatewayConfig = tenantConfig?.config?.gateway
  if (!gatewayConfig) {
    throw new Error('يرجى ضبط إعدادات بوابة الإرسال أولاً')
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
      profiles:student_id ( parent_phone )
    `)
    .contains('channels', ['whatsapp'])
    .limit(20)
    .order('created_at', { ascending: true })

  if (error) throw error
  if (!pending || pending.length === 0) return 0

  const pendingWhatsapp = pending.filter(row => row.status?.whatsapp === 'pending')
  if (pendingWhatsapp.length === 0) return 0

  let processedCount = 0

  for (const notif of pendingWhatsapp) {
    const parentPhone = notif.profiles?.parent_phone
    if (!parentPhone) {
      // Mark as failed if parent phone is missing
      const statusMap = { ...(notif.status || {}) }
      statusMap.whatsapp = 'failed'
      statusMap.whatsapp_error = 'رقم هاتف ولي الأمر غير متوفر'
      await supabase.from('unified_notifications').update({ status: statusMap }).eq('id', notif.id)
      continue
    }

    try {
      // 1. Call API gateway
      await sendGatewayMessage(gatewayConfig, {
        phone: parentPhone,
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

      // Rate limit: delay 1.5s between messages
      await new Promise(resolve => setTimeout(resolve, 1500))
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
    }
  }

  return processedCount;
}
