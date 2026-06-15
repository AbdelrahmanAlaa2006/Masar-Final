import { supabase } from './supabase'
import { invalidate as invalidateCache } from '../src/utils/cache'

// Get paginated parent notifications list
export async function listNotificationQueue(page = 1, limit = 50) {
  const rangeStart = (page - 1) * limit
  const rangeEnd = page * limit - 1

  const { data, error, count } = await supabase
    .from('parent_notifications')
    .select(`
      id,
      phone,
      message,
      type,
      status,
      retry_count,
      last_error,
      created_at,
      sent_at,
      profiles (
        name
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(rangeStart, rangeEnd)

  if (error) throw error
  return {
    items: (data || []).map(item => ({
      id: item.id,
      phone: item.phone,
      message: item.message,
      type: item.type,
      status: item.status,
      retry_count: item.retry_count,
      last_error: item.last_error,
      created_at: item.created_at,
      sent_at: item.sent_at,
      student_name: item.profiles?.name || '—'
    })),
    total: count || 0
  }
}

// Get statistics summary of notifications
export async function getNotificationQueueSummary() {
  const { data, error } = await supabase
    .from('parent_notifications')
    .select('status')

  if (error) throw error

  let pending = 0
  let sent = 0
  let failed = 0

  data.forEach(r => {
    if (r.status === 'pending') pending++
    else if (r.status === 'sent') sent++
    else if (r.status === 'failed') failed++
  })

  return { pending, sent, failed, total: data.length }
}

// Retry a specific notification
export async function retryNotification(id) {
  const { data, error } = await supabase
    .from('parent_notifications')
    .update({ status: 'pending', last_error: null })
    .eq('id', id)
    .select()

  if (error) throw error
  return data
}

// Reset all failed notifications to pending
export async function retryAllFailed(tenantId) {
  const { data, error } = await supabase
    .from('parent_notifications')
    .update({ status: 'pending', last_error: null })
    .eq('tenant_id', tenantId)
    .eq('status', 'failed')
    .select()

  if (error) throw error
  return data
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
    
    // We assume the URL contains the instance details e.g., http://localhost:8080/message/sendText?key=instanceName
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
    
    // Post to Telegram Bot API sendMessage endpoint
    const tgUrl = `https://api.telegram.org/bot${telegram_bot_token}/sendMessage`
    
    // Construct rich message formatting including the target recipient details
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

  throw new Error(`بوابة الإرسال غير معروفة: ${type}`)
}

// Queue processor loop (processes pending notifications with rate limiting client-side)
export async function processNotificationQueue(tenantConfig, onProgress) {
  const gatewayConfig = tenantConfig?.config?.gateway
  if (!gatewayConfig) {
    throw new Error('يرجى ضبط إعدادات بوابة الإرسال أولاً')
  }

  // Fetch pending notifications
  const { data: pending, error } = await supabase
    .from('parent_notifications')
    .select('*')
    .eq('status', 'pending')
    .limit(20) // process in chunks of 20 to avoid rate limits
    .order('created_at', { ascending: true })

  if (error) throw error
  if (!pending || pending.length === 0) return 0

  let processedCount = 0

  for (const notif of pending) {
    try {
      // 1. Call API gateway
      await sendGatewayMessage(gatewayConfig, notif)

      // 2. Mark as sent on success
      await supabase
        .from('parent_notifications')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          last_error: null
        })
        .eq('id', notif.id)

      processedCount++
      if (onProgress) onProgress(notif.id, 'sent', null)

      // Rate limit: delay 1.5s between messages
      await new Promise(resolve => setTimeout(resolve, 1500))
    } catch (err) {
      console.error(`Failed to process notification ${notif.id}:`, err)
      
      // 3. Mark as failed on error
      await supabase
        .from('parent_notifications')
        .update({
          status: 'failed',
          retry_count: notif.retry_count + 1,
          last_error: err.message || 'خطأ غير معروف'
        })
        .eq('id', notif.id)

      if (onProgress) onProgress(notif.id, 'failed', err.message)
    }
  }

  return processedCount;
}
