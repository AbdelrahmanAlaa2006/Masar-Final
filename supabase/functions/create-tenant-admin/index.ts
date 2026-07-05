// Supabase Edge Function: create-tenant-admin
// ----------------------------------------------------------------------------
// Creates the FIRST admin account for a newly-created platform (tenant), plus a
// default branch and an active academic year — so a new platform is usable
// immediately, without manually registering + promoting a user.
//
// Runs server-side with the service role, so it does NOT disturb the super
// admin's own browser session (a client-side signUp would log them out).
//
// Safety:
//   - Only a super_admin may call it.
//   - The admin's login email is built with the SAME phone→email format the app
//     uses, so the new admin can log in normally.
//   - Branch/year are seeded with an explicit tenant_id (the set_tenant_id
//     trigger only fills NULLs, so they land in the correct new tenant).
//   - Idempotent-ish: branch/year are only seeded if none exist yet.
//
// Input:  { tenant_id, admin_name, admin_phone, admin_password }
// Output: { ok: true, admin_id, email } | { error }
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

const DEFAULT_TENANT_ID = 'd3b07384-d113-4ec2-a5d6-d005b6be4979'

// EXACT same format as backend/authApi.js phoneToEmail — do not change.
function phoneToEmail(phone: string, tenantId: string): string {
  const cleanPhone = String(phone || '').replace(/\s+/g, '')
  if (!tenantId || tenantId === DEFAULT_TENANT_ID) return `${cleanPhone}@masaar.app`
  return `${cleanPhone}-${tenantId}@masaar.app`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, { status: 405 })

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'missing auth' }, { status: 401 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // ── Auth: caller must be a super_admin ───────────────────────────────
  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userRes, error: userErr } = await asUser.auth.getUser()
  if (userErr || !userRes?.user) return json({ error: 'invalid session' }, { status: 401 })

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: caller } = await admin
    .from('profiles').select('role').eq('id', userRes.user.id).single()
  if (caller?.role !== 'super_admin') return json({ error: 'super admin only' }, { status: 403 })

  // ── Input ─────────────────────────────────────────────────────────────
  let body: { tenant_id?: string; admin_name?: string; admin_phone?: string; admin_password?: string } = {}
  try { body = await req.json() } catch { /* tolerate */ }
  const tenantId = String(body.tenant_id || '').trim()
  const name = String(body.admin_name || '').trim()
  const phone = String(body.admin_phone || '').trim()
  const password = String(body.admin_password || '')

  if (!tenantId) return json({ error: 'tenant_id مطلوب' }, { status: 400 })
  if (!name || !phone) return json({ error: 'اسم ورقم هاتف المدير مطلوبان' }, { status: 400 })
  if (password.length < 6) return json({ error: 'كلمة المرور يجب ألا تقل عن 6 أحرف' }, { status: 400 })

  // Confirm the tenant exists (created by the client just before this call).
  const { data: tenantRow } = await admin.from('tenants').select('id').eq('id', tenantId).maybeSingle()
  if (!tenantRow) return json({ error: 'المنصة غير موجودة' }, { status: 404 })

  const email = phoneToEmail(phone, tenantId)

  // ── 1) Create the admin auth user ────────────────────────────────────
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, phone, role: 'admin', tenant_id: tenantId },
  })
  if (createErr || !created?.user) {
    const msg = /already/i.test(createErr?.message || '')
      ? 'رقم الهاتف مستخدم بالفعل كحساب في هذه المنصة'
      : (createErr?.message || 'فشل إنشاء حساب المدير')
    return json({ error: msg }, { status: 400 })
  }
  const adminId = created.user.id

  // ── 2) Ensure the profile is a fully-active admin of this tenant ──────
  // handle_new_user may have created a profile from metadata; upsert to be sure.
  const { error: profErr } = await admin.from('profiles').upsert({
    id: adminId,
    name,
    phone,
    role: 'admin',
    tenant_id: tenantId,
    is_active: true,
    is_approved: true,
    status: 'active',
  }, { onConflict: 'id' })
  if (profErr) {
    // Roll back the auth user so we don't leave a half-created admin.
    try { await admin.auth.admin.deleteUser(adminId) } catch { /* best effort */ }
    return json({ error: 'فشل إنشاء ملف المدير: ' + profErr.message }, { status: 400 })
  }

  // ── 3) Seed a default branch + active academic year (only if missing) ─
  try {
    const { data: existingBranch } = await admin
      .from('branches').select('id').eq('tenant_id', tenantId).limit(1).maybeSingle()
    if (!existingBranch) {
      await admin.from('branches').insert({ tenant_id: tenantId, name: 'الفرع الرئيسي' })
    }
    const { data: existingYear } = await admin
      .from('academic_years').select('id').eq('tenant_id', tenantId).limit(1).maybeSingle()
    if (!existingYear) {
      await admin.from('academic_years').insert({ tenant_id: tenantId, name: '2026/2027', is_active: true })
    }
  } catch (e) {
    // Non-fatal: the admin exists; they can create branch/year from the UI.
    console.error('seed branch/year failed:', (e as Error).message)
  }

  return json({ ok: true, admin_id: adminId, email })
})
