import { supabase } from './supabase'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../src/utils/cache'
import { listSubscriptionFees } from './paymentsApi'
import { listStudentBooklets, markBookletsPaid } from './bookletsApi'
import { recordSubscriptionPayment } from './financeApi'
import { createClient } from '@supabase/supabase-js'

/* Admin-only: list every student profile. RLS policy profiles_admin_all
   lets an admin read all rows; a student would only see themselves. */
export async function listStudents() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, phone, grade, "group", password, avatar_url, created_at, is_active, is_approved, qr_token, barcode_token, parent_phone, branch_id, academic_year_id, status, enrollment_type, flags, student_groups(group_id)')
    .eq('role', 'student')
    .order('name', { ascending: true })
  if (error) throw error
  return data || []
}

/* ---------------------------------------------------------------------------
   Scalable, server-side paginated student listing.
   Additive — `listStudents()` above is intentionally left untouched so every
   existing consumer keeps working. New screens (and the migrated AccountsPanel)
   use these to avoid pulling the whole tenant roster into the browser.
   RLS still scopes every query to the caller's tenant.
   --------------------------------------------------------------------------- */

// Lean projection for list tables: same as listStudents minus the sensitive
// `password` column (which the bulk list should never carry).
const STUDENT_LIST_COLUMNS =
  'id, name, phone, grade, "group", avatar_url, created_at, is_active, is_approved, qr_token, barcode_token, parent_phone, branch_id, academic_year_id, status, enrollment_type, flags, student_groups(group_id)'

// Apply the same status/grade/search semantics the AccountsPanel used to do
// client-side, but in the database so only one page of rows is returned.
// client-side, but in the database so only one page of rows is returned.
function applyStudentFilters(query, { statusTab, grade, branchId, studentIds, search }) {
  switch (statusTab) {
    case 'pending':   query = query.eq('is_approved', false); break
    case 'active':    query = query.eq('status', 'active'); break
    case 'inactive':  query = query.eq('status', 'inactive').eq('is_approved', true); break
    case 'suspended': query = query.eq('status', 'suspended'); break
    // 'all' / undefined -> no status filter
  }
  if (grade && grade !== 'all') {
    query = query.eq('grade', grade)
  }
  if (branchId && branchId !== 'all') {
    query = query.eq('branch_id', branchId)
  }
  if (studentIds) {
    query = query.in('id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000'])
  }
  const q = (search || '').trim()
  if (q) {
    // Escape PostgREST reserved chars in the user search term.
    const safe = q.replace(/[%,()]/g, ' ')
    query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,parent_phone.ilike.%${safe}%`)
  }
  return query
}

// Returns one page of students plus the exact total for that filter.
export async function listStudentsPaged({ page = 0, pageSize = 50, statusTab = 'all', grade = 'all', branchId = 'all', groupId = 'all', search = '' } = {}) {
  const from = page * pageSize
  const to = from + pageSize - 1

  let studentIds = null
  if (groupId && groupId !== 'all') {
    const { data: sgData } = await supabase
      .from('student_groups')
      .select('student_id')
      .eq('group_id', groupId)
    studentIds = (sgData || []).map(r => r.student_id)
  }

  let query = supabase
    .from('profiles')
    .select(STUDENT_LIST_COLUMNS, { count: 'exact' })
    .eq('role', 'student')

  query = applyStudentFilters(query, { statusTab, grade, branchId, studentIds, search })

  const { data, error, count } = await query
    .order('name', { ascending: true })
    .range(from, to)

  if (error) throw error
  return { rows: data || [], count: count || 0 }
}

// Per-tab counts for the AccountsPanel tab badges.
// Primary path: a single RPC (get_student_status_counts) returns all five
// counts in ONE round-trip. Until that migration is applied, it transparently
// falls back to five head-only COUNT queries so nothing breaks.
export async function getStudentStatusCounts({ grade = 'all', branchId = 'all', groupId = 'all' } = {}) {
  const p_grade = grade && grade !== 'all' ? grade : null
  const p_branch = branchId && branchId !== 'all' ? branchId : null
  const p_group = groupId && groupId !== 'all' ? groupId : null

  let studentIds = null
  if (p_group) {
    const { data: sgData } = await supabase
      .from('student_groups')
      .select('student_id')
      .eq('group_id', p_group)
    studentIds = (sgData || []).map(r => r.student_id)
  }

  // One-request path via RPC (respects RLS / tenant scope) - only when no branch/group specified
  if (!p_branch && !p_group) {
    try {
      const { data, error } = await supabase.rpc('get_student_status_counts', { p_grade })
      if (!error && data) {
        return {
          pending:   data.pending   || 0,
          active:    data.active    || 0,
          inactive:  data.inactive  || 0,
          suspended: data.suspended || 0,
          total:     data.total     || 0,
        }
      }
    } catch { /* RPC not deployed yet — use the fallback below */ }
  }

  // Fallback: five cheap head-only COUNT queries (no rows transferred).
  const base = () => {
    let q = supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student')
    if (p_grade) q = q.eq('grade', p_grade)
    if (p_branch) q = q.eq('branch_id', p_branch)
    if (studentIds) {
      q = q.in('id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000'])
    }
    return q
  }
  const [pending, active, inactive, suspended, total] = await Promise.all([
    base().eq('is_approved', false),
    base().eq('status', 'active'),
    base().eq('status', 'inactive').eq('is_approved', true),
    base().eq('status', 'suspended'),
    base(),
  ])
  return {
    pending:   pending.count   || 0,
    active:    active.count    || 0,
    inactive:  inactive.count  || 0,
    suspended: suspended.count || 0,
    total:     total.count     || 0,
  }
}

// All students of a single grade (the "class" unit). Far smaller than the
// whole roster — used by grade-scoped screens (attendance, grades, reports)
// so they never pull the entire tenant. Lean projection, RLS/tenant-scoped.
export async function listStudentsByGrade(grade) {
  if (!grade) return []
  const { data, error } = await supabase
    .from('profiles')
    .select(STUDENT_LIST_COLUMNS)
    .eq('role', 'student')
    .eq('grade', grade)
    .order('name', { ascending: true })
  if (error) throw error
  return data || []
}

// Targeted lookup: students matching a set of phone numbers. Used by the
// password-reset panel to resolve each PENDING request's student (and current
// credentials) without loading the whole roster — far less data, and far less
// password exposure than fetching every student. RLS/tenant-scoped.
export async function listStudentsByPhones(phones = []) {
  const list = [...new Set((phones || []).filter(Boolean))]
  if (list.length === 0) return []
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, phone, password')
    .eq('role', 'student')
    .in('phone', list)
  if (error) throw error
  return data || []
}

// Total approved/active student count for dashboards — a head-only COUNT query
// (no rows transferred), instead of loading the whole roster just to read
// `.length`. RLS/tenant-scoped.
export async function getStudentCount() {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'student')
  if (error) throw error
  return count || 0
}

// Server-side typeahead for the global student picker (admin report jump).
// Returns at most `limit` matches instead of loading the whole roster.
export async function searchStudents(term = '', limit = 12) {
  let query = supabase
    .from('profiles')
    .select('id, name, phone, grade, "group", avatar_url')
    .eq('role', 'student')
    .order('name', { ascending: true })
    .limit(limit)
  const t = (term || '').trim()
  if (t) {
    const safe = t.replace(/[%,()]/g, ' ')
    query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
  }
  const { data, error } = await query
  if (error) throw error
  return data || []
}

/* Fetch one profile (used to look up the target student's grade when an
   admin views "<student>/report"). RLS returns the row for the viewer
   themselves, or any row when the viewer is an admin. */
// Cached so flipping between students in admin reports doesn't fetch
// the same profile repeatedly. Invalidated by `invalidateProfile(id)`
// which other modules call after editing a row (e.g. avatar upload).
export async function getProfile(id) {
  if (!id) return null
  return cached(`profile:${id}`, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, phone, grade, "group", role, avatar_url, is_active, is_approved, qr_token, barcode_token, parent_phone, branch_id, academic_year_id, status, enrollment_type, flags, student_groups(group_id)')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return data
  })
}

export async function updateStudentStatus(studentId, { is_approved, is_active }) {
  const patch = {}
  if (is_approved !== undefined) patch.is_approved = is_approved
  if (is_active !== undefined) {
    patch.is_active = is_active
    patch.status = is_active ? 'active' : 'inactive'
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', studentId)
    .select()
    .single()

  if (error) throw error

  invalidateProfile(studentId)
  invalidateCache('students')
  return data
}

export async function updateStudentProfile(studentId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      name: updates.name,
      phone: updates.phone,
      branch_id: updates.branch_id || null,
      academic_year_id: updates.academic_year_id || null,
      status: updates.status,
      enrollment_type: updates.enrollment_type,
      flags: updates.flags || [],
      parent_phone: updates.parent_phone || null,
      is_approved: updates.status === 'active' || updates.is_approved || false,
      is_active: updates.status === 'active' || updates.is_active || false
    })
    .eq('id', studentId)
    .select()
    .single()

  if (error) throw error

  invalidateProfile(studentId)
  invalidateCache('students')
  return data
}

export function invalidateProfile(id) {
  if (id) invalidateCache(`profile:${id}`)
}

export async function getStudentIdentityByQr(qrToken, tenantId) {
  const { data, error } = await supabase.rpc('get_student_identity', {
    p_code: qrToken,
    p_tenant_id: tenantId
  })
  if (error) throw error
  return data
}

const phoneToEmail = (phone, tenantId) => {
  const cleanPhone = phone.replace(/\s+/g, '').toLowerCase()
  const defaultTenantId = 'd3b07384-d113-4ec2-a5d6-d005b6be4979'
  if (!tenantId || tenantId === defaultTenantId) {
    return `${cleanPhone}@masaar.app`
  }
  return `${cleanPhone}-${tenantId}@masaar.app`
}

const getTempClient = () => {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false
    }
  })
}

export async function createStudentByAdmin({
  name,
  phone,
  password,
  grade,
  parentPhone,
  enrollmentType,
  branchId,
  groupId,
  groupName,
  status = 'active',
  tenantId,
  registerMonthly = false,
  monthlyMonth = '',
  registerBooklet = false,
  adminId = null
}) {
  if (!tenantId) throw new Error('معرف المنصة مطلوب لإتمام التسجيل')
  if (!grade) throw new Error('المرحلة الدراسية مطلوبة لإتمام التسجيل')

  const tempClient = getTempClient()
  const email = phoneToEmail(phone, tenantId)

  // Fetch active academic year
  let activeYearId = null
  try {
    const { data: activeYear } = await supabase
      .from('academic_years')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle()
    if (activeYear) {
      activeYearId = activeYear.id
    }
  } catch (err) {
    console.error('Failed to fetch active academic year:', err)
  }

  // 1. Sign up in Supabase auth using temp client
  const { data: signUpData, error: signUpError } = await tempClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: name.trim(),
        phone: phone.trim(),
        role: 'student',
        grade,
        tenant_id: tenantId,
        parent_phone: parentPhone ? parentPhone.trim() : '',
        enrollment_type: enrollmentType || 'CENTER',
        branch_id: branchId || null,
        group_id: groupId || null,
        group: groupName || null,
        academic_year_id: activeYearId
      }
    }
  })

  if (signUpError) throw signUpError
  if (!signUpData.user) throw new Error('فشل إنشاء حساب الطالب في المصادقة')

  const studentId = signUpData.user.id

  // 2. Manually upsert profile
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: studentId,
      name: name.trim(),
      phone: phone.trim(),
      role: 'student',
      tenant_id: tenantId,
      grade: grade,
      parent_phone: parentPhone ? parentPhone.trim() : '',
      enrollment_type: enrollmentType || 'CENTER',
      branch_id: branchId || null,
      group: groupName || null,
      academic_year_id: activeYearId,
      is_approved: status === 'active',
      is_active: status === 'active',
      status: status
    }, { onConflict: 'id' })

  if (profileError) {
    console.error('Profile upsert error:', profileError)
    throw new Error('فشل إنشاء الملف الشخصي للطالب: ' + profileError.message)
  }

  // 3. Link to group in student_groups join table
  if (groupId) {
    try {
      await supabase
        .from('student_groups')
        .upsert({
          student_id: studentId,
          group_id: groupId,
          is_primary: true
        }, { onConflict: 'student_id,group_id' })
    } catch (err) {
      console.error('Failed to link student to group:', err)
    }
  }

  // 4. Handle automatic payments
  // Monthly payment
  if (registerMonthly && monthlyMonth) {
    const billingPeriod = 'اشتراك شهر ' + monthlyMonth
    const { data: existingPayment, error } = await supabase
      .from('student_ledger')
      .select('id')
      .eq('student_id', studentId)
      .eq('type', 'payment')
      .eq('billing_period', billingPeriod)
      .limit(1)

    if (!error && (!existingPayment || existingPayment.length === 0)) {
      // Get grade fee
      const fees = await listSubscriptionFees()
      const fee = Number((fees || []).find(f => f.grade === grade)?.amount) || 0
      if (fee > 0) {
        await recordSubscriptionPayment({
          studentId: studentId,
          amount: fee,
          billingPeriod: billingPeriod,
          monthlyDue: fee,
          paymentMethod: 'Cash',
          adminId: adminId
        })
      }
    }
  }

  // Booklet payment
  if (registerBooklet) {
    const studentBooklets = await listStudentBooklets(studentId)
    const bookletIds = studentBooklets
      .filter(sb => sb.payment_status === 'unpaid')
      .map(sb => sb.id)
    if (bookletIds.length > 0) {
      await markBookletsPaid(bookletIds, 'دفعة أولى عند التسجيل')
    }
  }

  invalidateCache('students')
  return { id: studentId, name, phone }
}

