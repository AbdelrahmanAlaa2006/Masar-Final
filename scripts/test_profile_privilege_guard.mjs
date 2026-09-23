/**
 * E2E for backend/migrations/2026_09_23_profile_privilege_guard.sql — real
 * sign-ups and real user JWTs through PostgREST, on a throwaway tenant that is
 * deleted afterwards.   node scripts/test_profile_privilege_guard.mjs
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import crypto from 'node:crypto'

dotenv.config()
dotenv.config({ path: 'whatsapp-gateway/.env' })
const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const svc = createClient(URL, SERVICE, opts)
const client = () => createClient(URL, ANON, opts)
const RUN = crypto.randomBytes(3).toString('hex')
const PASS = 'Guard#' + RUN + '9'

let passed = 0, failed = 0
const check = (c, n, x = '') => { c ? (passed++, console.log(`  ✅ ${n}`)) : (failed++, console.log(`  ❌ ${n} ${x}`)) }
const created = { users: [], tenants: [] }

async function tenant(tag) {
  const { data, error } = await svc.from('tenants').insert({ name: `zz guard ${tag} ${RUN}`, slug: `zz-guard-${tag}-${RUN}`, config: {} }).select('id').single()
  if (error) throw error
  created.tenants.push(data.id)
  return data.id
}
async function staff(tenantId, role, tag, permissions) {
  const email = `zzguard-${tag}-${RUN}@masaar.app`
  const { data, error } = await svc.auth.admin.createUser({ email, password: PASS, email_confirm: true, user_metadata: { tenant_id: tenantId, phone: 'zz' + tag + RUN, name: 'guard ' + tag } })
  if (error) throw error
  created.users.push(data.user.id)
  const { error: e2 } = await svc.from('profiles').update({ role, tenant_id: tenantId, is_active: true, is_approved: true, status: 'active' }).eq('id', data.user.id)
  if (e2) throw e2
  if (permissions) await svc.from('tenant_admins').insert({ tenant_id: tenantId, user_id: data.user.id, role: 'assistant', permissions })
  const c = client()
  const { error: se } = await c.auth.signInWithPassword({ email, password: PASS })
  if (se) throw se
  return { id: data.user.id, c }
}
const profile = async (id) => (await svc.from('profiles').select('*').eq('id', id).single()).data

async function run() {
  console.log(`Profile privilege guard — E2E (run ${RUN})`)
  const tA = await tenant('a'), tB = await tenant('b')
  const adminA = await staff(tA, 'admin', 'aa')
  const adminB = await staff(tB, 'admin', 'ab')
  const asstA = await staff(tA, 'assistant', 'sa', ['students'])

  console.log('\n▶ Public sign-up cannot choose its role')
  const s = client()
  const email = `zzguard-st-${RUN}@masaar.app`
  const { data: su, error: sue } = await s.auth.signUp({ email, password: PASS, options: { data: {
    name: 'guard student', phone: 'zzst' + RUN, role: 'admin', grade: 'g1', tenant_id: tA,
    enrollment_type: 'ONLINE', academic_year_id: null } } })
  if (sue) throw sue
  const sid = su.user.id
  created.users.push(sid)
  check(!!su.session, 'sign-up returned a session')
  let p = await profile(sid)
  check(p.role === 'student', "metadata role 'admin' ignored → student", p.role)
  check(p.enrollment_type === 'ONLINE', 'enrollment_type taken from sign-up', p.enrollment_type)
  check(p.is_active === false, 'new account inactive')

  // Exactly what authApi.register upserts right after sign-up.
  const { error: regErr } = await s.from('profiles').upsert({
    id: sid, name: 'guard student', phone: 'zzst' + RUN, password: PASS, role: 'student', tenant_id: tA,
    grade: 'g1', parent_phone: '', enrollment_type: 'ONLINE', branch_id: null, group: null, academic_year_id: null,
  }, { onConflict: 'id' })
  check(!regErr, 'registration profile upsert still works', regErr?.message)

  console.log('\n▶ Student editing own row')
  const tryUpd = async (c, id, patch) => {
    const { data, error } = await c.from('profiles').update(patch).eq('id', id).select('id')
    return error ? 'error' : (data?.length ? 'ok' : 'no-rows')
  }
  check(await tryUpd(s, sid, { role: 'admin' }) === 'error', 'role → admin blocked')
  check(await tryUpd(s, sid, { role: 'super_admin' }) === 'error', 'role → super_admin blocked')
  check(await tryUpd(s, sid, { is_active: true, is_approved: true, status: 'active' }) === 'error', 'self-activation blocked')
  check(await tryUpd(s, sid, { tenant_id: tB }) === 'error', 'tenant change blocked')
  check(await tryUpd(s, sid, { grade: 'other' }) === 'error', 'grade change blocked')
  check(await tryUpd(s, sid, { subscription_discount: 999 }) === 'error', 'discount blocked')
  check(await tryUpd(s, sid, { avatar_url: 'https://example.com/a.png' }) === 'ok', 'avatar update allowed (Profile page)')
  check(await tryUpd(s, sid, { avatar_url: null }) === 'ok', 'avatar removal allowed')
  const { error: insErr } = await s.from('profiles').insert({ id: crypto.randomUUID(), name: 'x', role: 'admin', tenant_id: tA })
  check(!!insErr, 'student cannot insert an admin profile')
  p = await profile(sid)
  check(p.role === 'student' && p.tenant_id === tA && p.is_active === false, 'row unchanged after attempts')

  console.log('\n▶ Staff flows keep working')
  check(await tryUpd(adminA.c, sid, { is_active: true, is_approved: true, status: 'active' }) === 'ok', 'admin approves/activates student')
  check(await tryUpd(asstA.c, sid, { is_active: false, status: 'inactive' }) === 'ok', "assistant ('students') suspends student")
  check(await tryUpd(asstA.c, sid, { role: 'assistant' }) === 'error', 'assistant cannot change roles')
  check(await tryUpd(adminA.c, sid, { grade: 'g2', subscription_discount: 50 }) === 'ok', 'admin edits grade / discount')
  check(await tryUpd(adminA.c, adminA.id, { role: 'super_admin' }) === 'error', 'admin cannot promote self')
  check(await tryUpd(adminA.c, asstA.id, { role: 'admin' }) === 'error', 'admin cannot create another admin')
  check(await tryUpd(adminB.c, sid, { is_active: true }) !== 'ok', 'other-tenant admin cannot edit student')

  // AssistantsPanel.createAssistant: temp-client sign-up + admin upsert.
  const tmp = client()
  const aEmail = `zzguard-na-${RUN}@masaar.app`
  const { data: na, error: nae } = await tmp.auth.signUp({ email: aEmail, password: PASS, options: { data: { name: 'new asst', phone: 'zzna' + RUN, role: 'assistant', tenant_id: tA } } })
  if (nae) throw nae
  created.users.push(na.user.id)
  const { error: upA } = await adminA.c.from('profiles').upsert({ id: na.user.id, name: 'new asst', phone: 'zzna' + RUN, role: 'assistant', tenant_id: tA, is_active: true, is_approved: true }, { onConflict: 'id' })
  check(!upA && (await profile(na.user.id)).role === 'assistant', 'admin creates an assistant (Assistants panel flow)', upA?.message)

  // profilesApi.createStudentByAdmin: temp-client sign-up + admin upsert (active).
  const tmp2 = client()
  const { data: ns, error: nse } = await tmp2.auth.signUp({ email: `zzguard-ns-${RUN}@masaar.app`, password: PASS, options: { data: { name: 'n s', phone: 'zzns' + RUN, role: 'student', tenant_id: tA, grade: 'g1' } } })
  if (nse) throw nse
  created.users.push(ns.user.id)
  const { error: upS } = await adminA.c.from('profiles').upsert({ id: ns.user.id, name: 'n s', phone: 'zzns' + RUN, role: 'student', tenant_id: tA, grade: 'g1', is_active: true, is_approved: true, status: 'active', enrollment_type: 'CENTER', subscription_discount: 0 }, { onConflict: 'id' })
  check(!upS, 'admin adds an active student (Accounts panel flow)', upS?.message)
}

async function cleanup() {
  console.log('\n▶ Cleanup')
  for (const u of created.users) {
    await svc.from('tenant_admins').delete().eq('user_id', u)
    await svc.from('profiles').delete().eq('id', u)
    await svc.auth.admin.deleteUser(u)
  }
  for (const t of created.tenants) {
    await svc.from('notifications').delete().eq('tenant_id', t)
    await svc.from('unified_notifications').delete().eq('tenant_id', t)
    await svc.from('audit_logs').delete().eq('tenant_id', t)
    const { error } = await svc.from('tenants').delete().eq('id', t)
    if (error) console.log('  tenant cleanup:', error.message)
  }
  const { count } = await svc.from('tenants').select('id', { count: 'exact', head: true }).like('slug', `zz-guard-%-${RUN}`)
  console.log(`  leftover test tenants: ${count}`)
}

try { await run() } catch (e) { failed++; console.error('\n💥 aborted:', e) }
finally { await cleanup(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0) }
