/**
 * End-to-end tests for the Student Device Limit
 * (backend/migrations/2026_09_23_student_device_limit.sql).
 *
 * Runs against the linked Supabase project with REAL GoTrue sign-ins: every
 * "device" is an isolated supabase-js client (own session, own device token).
 * Creates throwaway tenants/users prefixed `zz-devtest-` and deletes them at
 * the end, even on failure.
 *
 *   node scripts/test_student_device_limit.mjs
 *
 * Needs .env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) and
 * whatsapp-gateway/.env (SUPABASE_SERVICE_ROLE_KEY).
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import crypto from 'node:crypto'

dotenv.config()
dotenv.config({ path: 'whatsapp-gateway/.env' })

const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !ANON || !SERVICE) throw new Error('Missing Supabase env vars')

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const RUN = crypto.randomBytes(3).toString('hex')
const PASS = 'DevTest#' + RUN + '9'
const GRADE = 'zz-devtest-' + RUN

let passed = 0, failed = 0
const check = (cond, name, extra = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name}`) }
  else { failed++; console.log(`  ❌ ${name} ${extra}`) }
}
const section = (t) => console.log(`\n▶ ${t}`)

const created = { users: [], tenants: [] }

// ── fixtures ────────────────────────────────────────────────────────────
async function makeTenant(tag, limitOn) {
  const { data, error } = await admin.from('tenants').insert({
    name: `zz devtest ${tag} ${RUN}`,
    slug: `zz-devtest-${tag}-${RUN}`,
    config: { features: { student_device_limit: limitOn } },
  }).select('id').single()
  if (error) throw error
  created.tenants.push(data.id)
  const { data: g, error: ge } = await admin.from('groups')
    .insert({ tenant_id: data.id, name: 'devtest', grade: GRADE }).select('id').single()
  if (ge) throw ge
  const { data: v, error: ve } = await admin.from('videos')
    .insert({ tenant_id: data.id, title: 'devtest', grade: GRADE }).select('id').single()
  if (ve) throw ve
  const { error: pe } = await admin.from('video_parts')
    .insert({ video_id: v.id, part_index: 1, title: 'devtest part', youtube_id: 'dQw4w9WgXcQ' })
  if (pe) throw pe
  return data.id
}

async function makeUser(tenantId, role, tag) {
  const email = `zzdevtest-${tag}-${RUN}-${tenantId.slice(0, 8)}@masaar.app`
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASS, email_confirm: true,
    user_metadata: { name: `devtest ${tag}`, phone: `zz${tag}${RUN}`, role: 'student', tenant_id: tenantId, grade: GRADE },
  })
  if (error) throw error
  created.users.push(data.user.id)
  const { error: pe } = await admin.from('profiles').upsert({
    id: data.user.id, name: `devtest ${tag}`, phone: `zz${tag}${RUN}`, role, tenant_id: tenantId,
    grade: role === 'student' ? GRADE : null, is_active: true, is_approved: true,
  }, { onConflict: 'id' })
  if (pe) throw pe
  return { id: data.user.id, email }
}

// ── a "device" = own client (own session) + own stored device tokens ─────
function newDevice() {
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  return { client, tokens: {} }
}

async function signIn(device, user) {
  await device.client.auth.signOut({ scope: 'local' }).catch(() => {})
  // GoTrue rate-limits sign-ins per IP; this suite does ~80 — wait it out.
  for (let attempt = 0; ; attempt++) {
    const { error } = await device.client.auth.signInWithPassword({ email: user.email, password: PASS })
    if (!error) return
    if (error.status !== 429 || attempt >= 12) throw error
    process.stdout.write('  (auth rate limit — waiting 30s)\n')
    await new Promise(r => setTimeout(r, 30000))
  }
}

async function authorize(device, user, tokenOverride) {
  const token = tokenOverride !== undefined ? tokenOverride : (device.tokens[user.id] ?? null)
  const { data, error } = await device.client.rpc('authorize_student_device', { p_device_token: token })
  if (error) return 'error:' + error.message
  if (data.status === 'registered') device.tokens[user.id] = data.device_token
  return data.status
}

// App flow: sign in, then authorize.
async function login(device, user) {
  await signIn(device, user)
  return authorize(device, user)
}

// What the session can actually see under RLS.
async function sees(device) {
  const [{ data: tid }, { data: groups }, { data: parts }, { data: ok }] = await Promise.all([
    device.client.rpc('current_tenant_id'),
    device.client.from('groups').select('id').eq('grade', GRADE),
    device.client.from('video_parts').select('id, videos!inner(grade)').eq('videos.grade', GRADE),
    device.client.rpc('student_session_authorized'),
  ])
  return { tenant: tid, groups: groups?.length ?? 0, parts: parts?.length ?? 0, authorized: ok }
}

const activeCount = async (studentId) => {
  const { count } = await admin.from('student_devices').select('id', { count: 'exact', head: true })
    .eq('student_id', studentId).eq('status', 'active')
  return count
}
const allRows = async (studentId) => {
  const { data } = await admin.from('student_devices').select('*').eq('student_id', studentId)
  return data || []
}

// ── tests ───────────────────────────────────────────────────────────────
async function run() {
  console.log(`Student Device Limit — E2E (run ${RUN})`)
  const tA = await makeTenant('a', true)   // limited
  const tB = await makeTenant('b', true)   // limited (isolation)
  const tC = await makeTenant('c', false)  // unlimited

  const sA = await makeUser(tA, 'student', 'sa')
  const sB = await makeUser(tB, 'student', 'sb')
  const sC = await makeUser(tC, 'student', 'sc')
  const adminA = await makeUser(tA, 'admin', 'aa')
  const adminB = await makeUser(tB, 'admin', 'ab')

  section('Feature disabled → unlimited devices')
  {
    const results = []
    for (let i = 0; i < 4; i++) {
      const d = newDevice()
      results.push(await login(d, sC))
      const s = await sees(d)
      check(s.tenant === tC && s.groups === 1 && s.parts === 1, `device ${i + 1} sees tenant data`, JSON.stringify(s))
    }
    check(results.every(r => r === 'not_required'), '4 devices → not_required', results.join(','))
    check((await allRows(sC.id)).length === 0, 'nothing registered while disabled')
  }

  section('Feature enabled, limit 1')
  const dA1 = newDevice(), dA2 = newDevice(), dA3 = newDevice(), dA4 = newDevice()
  {
    check(await login(dA1, sA) === 'registered', 'first device → ALLOW (registered)')
    const s1 = await sees(dA1)
    check(s1.tenant === tA && s1.groups === 1 && s1.parts === 1 && s1.authorized === true, 'first device sees tenant data', JSON.stringify(s1))

    check(await login(dA1, sA) === 'allowed', 'same device, new login → ALLOW')
    check(await login(dA1, sA) === 'allowed', 'same device, third login → ALLOW')
    check((await allRows(sA.id)).length === 1, 'no duplicate device records')

    check(await login(dA2, sA) === 'denied', 'second device → DENY')
    const s2 = await sees(dA2)
    check(s2.tenant === null && s2.groups === 0 && s2.parts === 0 && s2.authorized === false,
      'denied device sees no tenant data (even with its still-valid access token)', JSON.stringify(s2))
    const { error: rErr } = await dA2.client.auth.refreshSession()
    check(!!rErr, 'denied device session was ended server-side (refresh fails)')
    check((await allRows(sA.id)).length === 1, 'denied device was not recorded')
  }

  section('Bypass attempts')
  const dShared = newDevice()
  {
    // Sign in but never call the authorization RPC.
    await signIn(dA3, sA)
    const s = await sees(dA3)
    check(s.tenant === null && s.groups === 0 && s.parts === 0, 'skipping the device check → no data', JSON.stringify(s))

    const fake = crypto.randomBytes(32).toString('hex')
    check(await authorize(dA3, sA, fake) === 'denied', 'forged random token → DENY')
    await signIn(dA3, sA)
    check(await authorize(dA3, sA, "' OR 1=1 --") === 'denied', 'malformed token → DENY')

    // Cleared storage: same browser, token gone → counts as a new device.
    await signIn(dA4, sA)
    check(await authorize(dA4, sA, null) === 'denied', 'cleared storage / incognito (no token) → DENY')

    // Token of another student on the same shared browser does not help.
    await login(dShared, sB) // registers sB on this browser
    await signIn(dShared, sA)
    check(await authorize(dShared, sA, dShared.tokens[sB.id]) === 'denied', "another student's token → DENY")

    // Client cannot change its own allowance or reach others' devices.
    const { error: e1 } = await dA1.client.rpc('admin_set_student_max_devices', { p_student_id: sA.id, p_max_devices: 5 })
    check(!!e1, 'student cannot raise own allowance', e1?.message)
    const { error: e2 } = await dA1.client.from('student_devices').select('id').limit(1)
    const { error: e3 } = await dA1.client.from('student_device_settings').insert({ student_id: sA.id, tenant_id: tA, max_devices: 9 })
    check(!!e2 && !!e3, 'device tables not reachable through the API', `${e2?.message} / ${e3?.message}`)
    const { data: prof } = await dA1.client.from('profiles').select('id').eq('id', sA.id).single()
    check(!!prof, 'authorized student still reads own profile')
  }

  section('Staff are never limited')
  {
    const res = []
    for (let i = 0; i < 3; i++) {
      const d = newDevice()
      res.push(await login(d, adminA))
      const s = await sees(d)
      check(s.tenant === tA && s.groups === 1, `admin device ${i + 1} sees tenant data`)
    }
    check(res.every(r => r === 'not_required'), 'admin from 3 devices → not_required', res.join(','))
  }

  section('Increased allowance (limit 2)')
  const aA = newDevice(); await signIn(aA, adminA)
  {
    const { error } = await aA.client.rpc('admin_set_student_max_devices', { p_student_id: sA.id, p_max_devices: 2 })
    check(!error, 'admin sets limit 2', error?.message)
    const dA5 = newDevice(), dA6 = newDevice()
    check(await login(dA1, sA) === 'allowed', 'device 1 → ALLOW')
    check(await login(dA5, sA) === 'registered', 'device 2 → ALLOW (registered)')
    check(await login(dA6, sA) === 'denied', 'device 3 → DENY')
    const { data: info } = await aA.client.rpc('admin_get_student_devices', { p_student_id: sA.id })
    check(info?.max_devices === 2 && info?.active_count === 2 && info?.devices?.length === 2, 'admin view: 2 / 2', JSON.stringify({ m: info?.max_devices, a: info?.active_count }))
    check(!!info?.last_denied_at, 'admin view shows last denied attempt')
    check(!JSON.stringify(info).match(/token|hash/i), 'admin view exposes no token/hash')

    section('Decreased allowance keeps existing devices')
    const { error: e } = await aA.client.rpc('admin_set_student_max_devices', { p_student_id: sA.id, p_max_devices: 1 })
    check(!e, 'admin lowers limit to 1')
    check(await activeCount(sA.id) === 2, 'both devices still registered (2 / 1)')
    check(await login(dA5, sA) === 'allowed', 'existing device 2 still → ALLOW')
    const dA7 = newDevice()
    check(await login(dA7, sA) === 'denied', 'new device → DENY while over the limit')
  }

  section('Tenant isolation')
  {
    // The shared browser from the bypass section: sA was refused there, sB
    // (tenant B, own allowance of 1) was registered — both on one browser.
    const dB1 = newDevice()
    check(await login(dB1, sB) === 'denied', "tenant B student's own limit applies (already used on the shared browser)")
    const { data: bRows } = await admin.from('student_devices').select('tenant_id').eq('student_id', sB.id)
    check(bRows.length === 1 && bRows.every(r => r.tenant_id === tB), "tenant B student's device is stamped tenant B")
    check(await activeCount(sA.id) === 2, "tenant B registrations do not count toward tenant A student")
    check(await login(dShared, sB) === 'allowed', 'tenant B student on the shared browser → ALLOW')
    const sb = await sees(dShared)
    check(sb.tenant === tB && sb.groups === 1, 'tenant B session sees only tenant B data', JSON.stringify(sb))

    const aB = newDevice(); await signIn(aB, adminB)
    const { error: x1 } = await aB.client.rpc('admin_get_student_devices', { p_student_id: sA.id })
    const { error: x2 } = await aB.client.rpc('admin_set_student_max_devices', { p_student_id: sA.id, p_max_devices: 5 })
    const rowA = (await allRows(sA.id)).find(r => r.status === 'active')
    const { error: x3 } = await aB.client.rpc('admin_revoke_student_device', { p_device_id: rowA.id })
    check(!!x1 && !!x2 && !!x3, 'tenant B admin cannot view / change / revoke tenant A devices')
    check(await activeCount(sA.id) === 2, 'tenant A devices untouched')
  }

  section('Revocation (limit 1)')
  {
    // Fresh student in tenant B for a clean scenario.
    const s = await makeUser(tB, 'student', 'rv')
    const devA = newDevice(), devB = newDevice()
    check(await login(devA, s) === 'registered', 'device A registered')
    check(await login(devB, s) === 'denied', 'device B → DENY while A is active')
    const aB = newDevice(); await signIn(aB, adminB)
    const row = (await allRows(s.id))[0]
    const { error } = await aB.client.rpc('admin_revoke_student_device', { p_device_id: row.id })
    check(!error, 'admin revokes device A', error?.message)
    const sa = await sees(devA)
    check(sa.tenant === null && sa.groups === 0, 'device A loses access immediately', JSON.stringify(sa))
    check(await login(devB, s) === 'registered', 'device B → ALLOW after revocation')
    check(await login(devA, s) === 'denied', 'revoked device A cannot come back with its old token')
    const rows = await allRows(s.id)
    check(rows.length === 2 && rows.some(r => r.status === 'revoked' && r.revoked_at), 'revoked row kept as history')
  }

  section('Concurrent registration (limit 1, 8 new devices at once)')
  {
    const s = await makeUser(tA, 'student', 'cc')
    const devices = Array.from({ length: 8 }, newDevice)
    for (const d of devices) await signIn(d, s)
    const results = await Promise.all(devices.map(d => authorize(d, s)))
    const reg = results.filter(r => r === 'registered').length
    const den = results.filter(r => r === 'denied').length
    check(reg === 1 && den === 7, 'exactly 1 registered, 7 denied', results.join(','))
    check(await activeCount(s.id) === 1, 'exactly 1 active device row')
  }

  section('Feature toggle')
  {
    const dX = newDevice()
    check(await login(dX, sA) === 'denied', 'enabled: extra device → DENY')
    const { data: t } = await admin.from('tenants').select('config').eq('id', tA).single()
    await admin.from('tenants').update({ config: { ...t.config, features: { ...t.config.features, student_device_limit: false } } }).eq('id', tA)
    check(await login(dX, sA) === 'not_required', 'disabled: same device → UNLIMITED')
    const sx = await sees(dX)
    check(sx.tenant === tA && sx.groups === 1, 'disabled: sees tenant data', JSON.stringify(sx))
    await admin.from('tenants').update({ config: t.config }).eq('id', tA)
    const sx2 = await sees(dX)
    check(sx2.tenant === null, 're-enabled: that unregistered session is gated again')
    check(await login(dA1, sA) === 'allowed', 're-enabled: registered device still → ALLOW')

    const { data: logs } = await admin.from('audit_logs').select('action, new_values, old_values').eq('tenant_id', tA)
    const actions = new Set(logs.map(l => l.action))
    for (const a of ['student_device_registered', 'student_device_limit_changed', 'student_device_limit_enabled', 'student_device_limit_disabled'])
      check(actions.has(a), `audit log: ${a}`)
    const { data: logsB } = await admin.from('audit_logs').select('action').eq('tenant_id', tB).eq('action', 'student_device_revoked')
    check(logsB.length === 1, 'audit log: student_device_revoked')
    const tokens = Object.values(dA1.tokens)
    check(!JSON.stringify(logs).match(/[0-9a-f]{64}/), 'audit logs contain no tokens or hashes')
    const rows = await allRows(sA.id)
    check(rows.every(r => !tokens.includes(r.token_hash)), 'database stores only hashes, never raw tokens')
  }
}

async function cleanup() {
  section('Cleanup')
  for (const t of created.tenants) {
    await admin.from('audit_logs').delete().eq('tenant_id', t)
    const { data: vids } = await admin.from('videos').select('id').eq('tenant_id', t)
    if (vids?.length) await admin.from('video_parts').delete().in('video_id', vids.map(v => v.id))
    await admin.from('videos').delete().eq('tenant_id', t)
    await admin.from('groups').delete().eq('tenant_id', t)
  }
  for (const u of created.users) {
    await admin.from('profiles').delete().eq('id', u)
    await admin.auth.admin.deleteUser(u)
  }
  for (const t of created.tenants) {
    const { error } = await admin.from('tenants').delete().eq('id', t)
    if (error) console.log('  tenant cleanup:', error.message)
  }
  const { count } = await admin.from('tenants').select('id', { count: 'exact', head: true }).like('slug', `zz-devtest-%-${RUN}`)
  console.log(`  leftover test tenants: ${count}`)
}

try {
  await run()
} catch (err) {
  failed++
  console.error('\n💥 Test run aborted:', err)
} finally {
  await cleanup()
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
