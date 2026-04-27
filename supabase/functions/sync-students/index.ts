// Supabase Edge Function: sync-students
// ----------------------------------------------------------------------------
// Mirrors a CSV against the Supabase auth + profiles tables. The admin
// uploads a CSV (header row: name,phone,password,grade,group) from
// Control Panel; this function:
//
//   1. Verifies the caller is an admin.
//   2. Upserts every CSV row (creates auth user if missing; sets grade).
//   3. Optionally deletes any role='student' profile whose phone is NOT
//      in the CSV — only when { apply: true } is set, otherwise dry-run.
//
// Response: { ok: number, skipped: number, failed: number,
//             orphans: [{ id, name, phone }], deleted: number,
//             logs: string[], apply: boolean }
//
// Required Supabase function secrets (auto-injected by Supabase):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
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

const GRADES = new Set(['first-prep', 'second-prep', 'third-prep'])

// Same normalisation as the local script: digits-only, no leading zero.
const normPhone = (p: string) => String(p || '').replace(/\D/g, '').replace(/^0+/, '')

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim())
  if (lines.length === 0) return []
  const header = lines.shift()!.split(',').map((s) => s.trim())
  return lines.map((line) => {
    const cells = line.split(',').map((s) => s.trim())
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']))
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, { status: 405 })

  // ── auth: must be an admin ───────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'missing auth' }, { status: 401 })
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userRes, error: userErr } = await asUser.auth.getUser()
  if (userErr || !userRes?.user) return json({ error: 'invalid session' }, { status: 401 })

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userRes.user.id)
    .single()
  if (profile?.role !== 'admin') return json({ error: 'admin only' }, { status: 403 })

  // ── input ────────────────────────────────────────────────────────────
  let body: { csv?: string; apply?: boolean } = {}
  try { body = await req.json() } catch { /* tolerate empty */ }
  const csv = body.csv || ''
  const apply = !!body.apply
  if (!csv.trim()) return json({ error: 'empty CSV' }, { status: 400 })

  const rows = parseCSV(csv)
  const logs: string[] = []
  const csvPhones = new Set<string>()
  let ok = 0, skipped = 0, failed = 0

  // ── 1) upsert each CSV row ───────────────────────────────────────────
  for (const r of rows) {
    const { name, phone, password, grade } = r
    // `group` is required — tolerate header casing / Arabic variant.
    const groupRaw = r.group ?? r.Group ?? r['المجموعة'] ?? ''
    const group = String(groupRaw || '').trim()
    // Excel often saves a trailing line with all-empty fields (`,,,`).
    // Silently ignore those — they're not real data and shouldn't show
    // up in the "lines that didn't run" counter or the tech log.
    const allEmpty = !String(name || '').trim()
                  && !String(phone || '').trim()
                  && !String(password || '').trim()
                  && !String(grade || '').trim()
                  && !group
    if (allEmpty) continue
    if (!name || !phone || !password || !GRADES.has(grade) || !group) {
      logs.push(`skip: bad row ${JSON.stringify(r)}`); skipped++; continue
    }
    csvPhones.add(normPhone(phone))
    const email = `${phone}@masaar.app`

    if (!apply) {
      logs.push(`would upsert: ${name} (${phone}) → ${grade} [${group}]`)
      ok++; continue
    }

    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { name, phone, role: 'student' },
    })
    if (authErr && !authErr.message?.toLowerCase().includes('already')) {
      logs.push(`fail ${phone}: ${authErr.message}`); failed++; continue
    }
    let userId = created?.user?.id
    if (!userId) {
      const { data: prof } = await admin.from('profiles').select('id').eq('phone', phone).maybeSingle()
      userId = prof?.id
    }
    if (!userId) { logs.push(`no id for ${phone}`); failed++; continue }

    const { error: upErr } = await admin
      .from('profiles')
      .update({ name, phone, grade, group, role: 'student' })
      .eq('id', userId)
    if (upErr) { logs.push(`grade fail ${phone}: ${upErr.message}`); failed++; continue }
    logs.push(`ok: ${name} (${phone}) → ${grade} [${group}]`); ok++
  }

  // ── 2) find + (optionally) delete orphans ────────────────────────────
  const { data: dbStudents, error: listErr } = await admin
    .from('profiles')
    .select('id, name, phone')
    .eq('role', 'student')
  if (listErr) {
    return json({ error: `failed to list profiles: ${listErr.message}` }, { status: 500 })
  }
  const orphans = (dbStudents || []).filter((s) => !csvPhones.has(normPhone(s.phone)))
  let deleted = 0, deleteFailed = 0
  for (const s of orphans) {
    if (!apply) { logs.push(`would delete: ${s.name} (${s.phone})`); continue }
    const { error: delAuthErr } = await admin.auth.admin.deleteUser(s.id)
    if (delAuthErr) { logs.push(`delete auth fail ${s.phone}: ${delAuthErr.message}`); deleteFailed++; continue }
    await admin.from('profiles').delete().eq('id', s.id)
    logs.push(`deleted: ${s.name} (${s.phone})`); deleted++
  }

  return json({
    apply,
    ok, skipped, failed,
    orphans: orphans.map((s) => ({ id: s.id, name: s.name, phone: s.phone })),
    deleted, deleteFailed,
    logs,
  })
})
