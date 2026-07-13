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
// Required secrets (auto-injected): SUPABASE_URL, SUPABASE_ANON_KEY,
//                                   SUPABASE_SERVICE_ROLE_KEY
// ----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    const { phone, message, batch, limit } = await req.json()
    if (!batch && (!phone || !message)) return json({ error: 'phone and message are required' }, { status: 400 })

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 1) Identify the caller from their JWT
    const authHeader = req.headers.get('Authorization') || ''
    const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userErr } = await asCaller.auth.getUser()
    if (userErr || !user) return json({ error: 'unauthorized' }, { status: 401 })

    // 2) Verify role + resolve the caller's tenant (service role)
    const admin = createClient(url, serviceKey)
    const { data: profile } = await admin
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', user.id)
      .single()
    if (!profile || !['admin', 'assistant', 'super_admin'].includes(profile.role)) {
      return json({ error: 'forbidden' }, { status: 403 })
    }

    // 3) Load the tenant's gateway settings
    const { data: tenant } = await admin
      .from('tenants')
      .select('config')
      .eq('id', profile.tenant_id)
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
    const batchLimit = Math.min(Math.max(Number(limit) || 25, 1), 25)
    const { data: rows, error: qErr } = await admin
      .from('unified_notifications')
      .select('id, message, status, recipient_phone, profiles:student_id ( parent_phone )')
      .eq('tenant_id', profile.tenant_id)
      .contains('channels', ['whatsapp'])
      .eq('status->>whatsapp', 'pending')
      .order('created_at', { ascending: true })
      .limit(batchLimit)
    if (qErr) return json({ error: qErr.message }, { status: 500 })

    const results: Array<{ id: string; status: string; error?: string }> = []
    for (const row of rows || []) {
      const statusMap = { ...(row.status || {}) } as Record<string, unknown>
      // recipient_phone is the phone snapshot resolved when the row was queued
      // (manual announcements can target the student's own number); legacy
      // rows fall back to the parent phone as before.
      const typed = row as { recipient_phone?: string; profiles?: { parent_phone?: string } }
      const targetPhone = typed.recipient_phone || typed.profiles?.parent_phone
      try {
        if (!targetPhone) throw new Error('رقم الهاتف غير متوفر')
        await sendOne(normalizePhoneIntl(targetPhone, g.country_code || '20'), row.message)
        statusMap.whatsapp = 'sent'
        statusMap.whatsapp_sent_at = new Date().toISOString()
        delete statusMap.whatsapp_error
        results.push({ id: row.id, status: 'sent' })
      } catch (sendErr) {
        statusMap.whatsapp = 'failed'
        statusMap.whatsapp_error = (sendErr as Error).message.slice(0, 200)
        results.push({ id: row.id, status: 'failed', error: statusMap.whatsapp_error as string })
      }
      await admin.from('unified_notifications').update({ status: statusMap }).eq('id', row.id)
      // Anti-ban pacing between consecutive sends
      await new Promise((s) => setTimeout(s, 600))
    }

    // How many pending remain (so the client knows whether to loop)
    const { count: remaining } = await admin
      .from('unified_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', profile.tenant_id)
      .contains('channels', ['whatsapp'])
      .eq('status->>whatsapp', 'pending')

    return json({ ok: true, results, remaining: remaining || 0 })
  } catch (e) {
    return json({ error: (e as Error).message || 'unexpected error' }, { status: 500 })
  }
})
