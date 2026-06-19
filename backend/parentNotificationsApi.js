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

// Single-message sender bridge (called during queue processing loop)
export async function sendGatewayMessage(gatewayConfig, notification) {
  if (!gatewayConfig) {
    throw new Error('لم يتم تهيئة إعدادات بوابة الإرسال')
  }

  const { type, url, token, telegram_bot_token, telegram_chat_id } = gatewayConfig
  const messageText = notification.message
  const parentPhone = notification.phone

  if (type === 'whatsapp_evolution') {
    if (!url || !token) throw new Error('بيانات Evolution API غير مكتملة (العنوان أو المفتاح مفقود)')
    const instanceUrl = url.endsWith('/') ? url : `${url}/`
    
    const response = await fetch(instanceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': token
      },
      body: JSON.stringify({
        number: parentPhone,
        text: messageText,
        options: {
          delay: 1200,
          presence: 'composing'
        }
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Evolution API Error (${response.status}): ${errText || 'فشل الاتصال بالخادم'}`)
    }
    return true
  } 
  
  else if (type === 'telegram') {
    if (!telegram_bot_token || !telegram_chat_id) {
      throw new Error('بيانات بوت التليجرام غير مكتملة (البوت أو معرّف المحادثة مفقود)')
    }
    
    const tgUrl = `https://api.telegram.org/bot${telegram_bot_token}/sendMessage`
    const textWithPhone = `*إشعار لولي الأمر (${parentPhone}):*\n\n${messageText}`
    
    const response = await fetch(tgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegram_chat_id,
        text: textWithPhone,
        parse_mode: 'Markdown'
      })
    })

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}))
      throw new Error(`Telegram API Error: ${errJson.description || 'فشل الإرسال عبر تليجرام'}`)
    }
    return true
  } 
  
  else if (type === 'generic_webhook') {
    if (!url) throw new Error('عنوان Webhook غير متوفر')
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : undefined
      },
      body: JSON.stringify({
        phone: parentPhone,
        message: messageText,
        type: notification.type
      })
    })

    if (!response.ok) {
      throw new Error(`Webhook Error (${response.status})`)
    }
    return true
  }
  
  else if (type === 'ultramsg') {
    if (!url || !token) throw new Error('بيانات UltraMsg غير مكتملة (رابط الخدمة أو الـ Token مفقود)')
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: token,
        to: parentPhone,
        body: messageText
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`UltraMsg Error (${response.status}): ${errText || 'فشل الإرسال عبر UltraMsg'}`)
    }
    return true
  }

  throw new Error(`بوابة الإرسال غير معروفة: ${type}`)
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
