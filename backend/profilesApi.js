import { supabase } from './supabase'
import { cached, invalidate as invalidateCache, invalidatePrefix, LIST_TTL } from '../src/utils/cache'
import { listSubscriptionFees } from './paymentsApi'
import { listStudentBooklets, markBookletsPaid } from './bookletsApi'
import { recordSubscriptionPayment } from './financeApi'
import { createClient } from '@supabase/supabase-js'

// Lean projection for list tables: same as listStudents minus the sensitive
// `password` column (which the bulk list should never carry).
const STUDENT_LIST_COLUMNS =
  'id, name, phone, grade, "group", avatar_url, created_at, is_active, is_approved, qr_token, barcode_token, parent_phone, branch_id, academic_year_id, status, enrollment_type, subscription_discount, flags, student_groups(group_id)'

/* Admin-only: list every student profile. RLS policy profiles_admin_all
   lets an admin read all rows; a student would only see themselves.
   Uses the lean projection (STUDENT_LIST_COLUMNS, defined below) — notably it
   NO LONGER ships the `password` column to the browser for the whole roster
   (a payload + security concern). The only screen that needs a student's
   password (ResetRequestsPanel) fetches it on demand via listStudentsByPhones. */
export async function listStudents() {
  const CHUNK_SIZE = 1000
  let allData = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('profiles')
      .select(STUDENT_LIST_COLUMNS)
      .eq('role', 'student')
      .order('name', { ascending: true })
      .range(from, from + CHUNK_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allData.push(...data)
    if (data.length < CHUNK_SIZE) break
    from += CHUNK_SIZE
  }
  return allData
}

/* ---------------------------------------------------------------------------
   Scalable, server-side paginated student listing.
   Additive — `listStudents()` above is intentionally left untouched so every
   existing consumer keeps working. New screens (and the migrated AccountsPanel)
   use these to avoid pulling the whole tenant roster into the browser.
   RLS still scopes every query to the caller's tenant.
   --------------------------------------------------------------------------- */

// Apply the same status/grade/search semantics the AccountsPanel used to do
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
export async function listStudentsPaged({ page = 0, pageSize = 50, statusTab = 'all', grade = 'all', branchId = 'all', groupId = 'all', search = '', sortBy = 'created_at', sortOrder = 'desc' } = {}) {
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

  const isAsc = sortOrder === 'asc'
  const sortCol = ['created_at', 'name'].includes(sortBy) ? sortBy : 'created_at'

  const { data, error, count } = await query
    .order(sortCol, { ascending: isAsc, nullsFirst: false })
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
  const CHUNK_SIZE = 1000
  let allData = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('profiles')
      .select(STUDENT_LIST_COLUMNS)
      .eq('role', 'student')
      .eq('grade', grade)
      .order('name', { ascending: true })
      .range(from, from + CHUNK_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allData.push(...data)
    if (data.length < CHUNK_SIZE) break
    from += CHUNK_SIZE
  }
  return allData
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
    .select('id, name, phone, grade, "group", avatar_url, created_at')
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
      .select('id, name, phone, grade, "group", role, avatar_url, is_active, is_approved, qr_token, barcode_token, parent_phone, branch_id, academic_year_id, status, enrollment_type, subscription_discount, flags, student_groups(group_id)')
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
  invalidatePrefix('students')
  return data
}

export async function updateStudentProfile(studentId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      name: updates.name,
      phone: updates.phone,
      grade: updates.grade,
      branch_id: updates.branch_id || null,
      academic_year_id: updates.academic_year_id || null,
      status: updates.status,
      enrollment_type: updates.enrollment_type,
      subscription_discount: Math.max(0, parseFloat(updates.subscription_discount) || 0),
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
  invalidatePrefix('students')
  return data
}

export function invalidateProfile(id) {
  if (id) invalidateCache(`profile:${id}`)
}

export async function getStudentIdentityByQr(qrToken, tenantId) {
  if (!qrToken) return null

  const raw = String(qrToken).trim()
  const clean = raw.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, '').replace(/^\*+|\*+$/g, '')
  const safeChars = clean.replace(/[^A-Za-z0-9-]/g, '')
  const withoutBc = safeChars.toLowerCase().startsWith('bc-') ? safeChars.slice(3) : safeChars
  const withBc = safeChars.toLowerCase().startsWith('bc-') ? safeChars : `BC-${safeChars}`

  // Build candidate search codes in priority order
  const candidates = Array.from(new Set([
    safeChars,
    withBc,
    withoutBc,
    clean,
    raw,
    safeChars.toLowerCase(),
    withoutBc.toLowerCase(),
    withBc.toUpperCase()
  ])).filter(Boolean)

  // 1. Try standard RPC for all normalized candidate formats
  for (const cand of candidates) {
    try {
      const { data, error } = await supabase.rpc('get_student_identity', {
        p_code: cand,
        p_tenant_id: tenantId
      })
      if (!error && data && data.student_id) {
        return data
      }
    } catch (e) {
      // Continue to next candidate
    }
  }

  // 2. Direct fallback query against profiles table
  try {
    let query = supabase
      .from('profiles')
      .select(`
        id, name, phone, grade, status, enrollment_type, flags, parent_phone, barcode_token, qr_token,
        branch:branches(name),
        academic_year:academic_years(name),
        student_groups(is_primary, group:groups(name))
      `)
      .eq('role', 'student')

    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }

    const orFilters = []
    if (safeChars && safeChars.length >= 3) {
      orFilters.push(`barcode_token.ilike.${safeChars}`)
      orFilters.push(`qr_token.ilike.${safeChars}`)
      orFilters.push(`phone.eq.${safeChars}`)
    }

    // Prefix match: e.g. "BC-f81z>..." matches unique student with barcode "BC-f81..."
    const prefixMatch = clean.match(/(?:BC-)?([a-f0-9]{3,7})/i)
    if (prefixMatch && prefixMatch[1] && prefixMatch[1].length >= 3) {
      const pfx = prefixMatch[1]
      orFilters.push(`barcode_token.ilike.BC-${pfx}%`)
      orFilters.push(`barcode_token.ilike.%${pfx}%`)
    }

    if (orFilters.length > 0) {
      query = query.or(orFilters.join(','))

      const { data: matchedRows, error: profError } = await query.limit(2)
      if (!profError && matchedRows && matchedRows.length === 1) {
        const p = matchedRows[0]
        // Single unique student confirmed! Try RPC with their true barcode_token
        if (p.barcode_token || p.qr_token) {
          const { data: rpcData } = await supabase.rpc('get_student_identity', {
            p_code: p.barcode_token || p.qr_token,
            p_tenant_id: tenantId
          })
          if (rpcData && rpcData.student_id) {
            return rpcData
          }
        }

        // Direct identity construction
        const primaryGroup = p.student_groups?.find(sg => sg.is_primary) || p.student_groups?.[0]
        return {
          student_id: p.id,
          name: p.name,
          phone: p.phone,
          parent_phone: p.parent_phone,
          grade: p.grade,
          status: p.status || 'active',
          enrollment_type: p.enrollment_type || 'CENTER',
          flags: p.flags || [],
          branch_name: p.branch?.name || 'الفرع الرئيسي',
          academic_year_name: p.academic_year?.name || '',
          group_name: primaryGroup?.group?.name || '',
          attendance_percentage: null,
          attended_sessions: 0,
          present_count: 0,
          late_count: 0,
          absent_count: 0,
          total_sessions: 0,
          outstanding_balance: 0,
          last_payment: {},
          today_attendance: '—',
          recent_grades: [],
          notes: [],
          warnings: []
        }
      }
    }
  } catch (err) {
    console.error('Fallback student identity lookup error:', err)
  }

  return null
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
  secondaryGroupId = null,
  groupName,
  status = 'active',
  tenantId,
  registerMonthly = false,
  monthlyMonth = '',
  registerBooklet = false,
  adminId = null,
  subscriptionDiscount = 0
}) {
  if (!tenantId) throw new Error('معرف المنصة مطلوب لإتمام التسجيل')
  if (!grade) throw new Error('المرحلة الدراسية مطلوبة لإتمام التسجيل')

  const cleanName = (name || '').trim()
  const cleanPhone = (phone || '').trim()
  const cleanParentPhone = (parentPhone || '').trim()

  if (!cleanName) throw new Error('اسم الطالب مطلوب')
  if (!cleanPhone) throw new Error('رقم هاتف أو كود الطالب مطلوب')
  if (!cleanParentPhone) throw new Error('رقم هاتف ولي الأمر مطلوب')
  if (cleanPhone === cleanParentPhone) {
    throw new Error('رقم هاتف أو كود الطالب لا يمكن أن يكون هو نفسه رقم هاتف ولي الأمر')
  }

  // 1. Proactively check if a profile with this phone/code already exists in this tenant
  try {
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, name, phone')
      .eq('tenant_id', tenantId)
      .eq('phone', cleanPhone)
      .maybeSingle()

    if (existingProfile) {
      throw new Error(`رقم الهاتف أو الكود (${cleanPhone}) مسجل بالفعل للطالب "${existingProfile.name || ''}" في هذه المنصة.`)
    }
  } catch (err) {
    if (err.message && err.message.includes('مسجل بالفعل')) throw err
  }

  const tempClient = getTempClient()
  const email = phoneToEmail(cleanPhone, tenantId)

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

  // Try cleaning up any orphaned auth user (if RPC is available) before signup
  try {
    await supabase.rpc('cleanup_orphaned_student_auth', {
      p_phone: cleanPhone,
      p_tenant_id: tenantId
    })
  } catch {}

  let studentId = null

  // 2. Sign up in Supabase auth using temp client
  let { data: signUpData, error: signUpError } = await tempClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: cleanName,
        phone: cleanPhone,
        role: 'student',
        grade,
        tenant_id: tenantId,
        parent_phone: cleanParentPhone,
        enrollment_type: enrollmentType || 'CENTER',
        branch_id: branchId || null,
        group_id: groupId || null,
        group: groupName || null,
        academic_year_id: activeYearId
      }
    }
  })

  const isAlreadyRegistered = signUpError && (
    signUpError.message?.toLowerCase().includes('already registered') ||
    signUpError.message?.toLowerCase().includes('already exists') ||
    signUpError.code === 'user_already_exists' ||
    signUpError.status === 422
  )
  const hasEmptyIdentities = signUpData?.user && Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0

  // If user already exists in auth.users but has no profile (orphan)
  if (isAlreadyRegistered || hasEmptyIdentities) {
    // 1) Try cleanup RPC and retry signup once
    let cleaned = false
    try {
      const { data: cleanupRes } = await supabase.rpc('cleanup_orphaned_student_auth', {
        p_phone: cleanPhone,
        p_tenant_id: tenantId
      })
      cleaned = !!cleanupRes
    } catch {}

    if (cleaned) {
      const retry = await tempClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: cleanName,
            phone: cleanPhone,
            role: 'student',
            grade,
            tenant_id: tenantId,
            parent_phone: cleanParentPhone,
            enrollment_type: enrollmentType || 'CENTER',
            branch_id: branchId || null,
            group_id: groupId || null,
            group: groupName || null,
            academic_year_id: activeYearId
          }
        }
      })
      if (!retry.error && retry.data?.user) {
        signUpData = retry.data
        signUpError = null
      }
    }

    // 2) If still not signed up, try signInWithPassword to recover existing auth user and update it
    if (!signUpData?.user?.id || (signUpData.user.identities && signUpData.user.identities.length === 0)) {
      try {
        const { data: signInData } = await tempClient.auth.signInWithPassword({
          email,
          password
        })
        if (signInData?.user) {
          studentId = signInData.user.id
          await tempClient.auth.updateUser({
            password,
            data: {
              name: cleanName,
              phone: cleanPhone,
              role: 'student',
              grade,
              tenant_id: tenantId,
              parent_phone: cleanParentPhone,
              enrollment_type: enrollmentType || 'CENTER',
              branch_id: branchId || null,
              group_id: groupId || null,
              group: groupName || null,
              academic_year_id: activeYearId
            }
          })
        }
      } catch {}
    }
  }

  if (!studentId) {
    if (signUpError) {
      if (isAlreadyRegistered) {
        throw new Error(`رقم الهاتف أو الكود (${cleanPhone}) مسجل بالفعل كحساب مستخدم في النظام (Auth).`)
      }
      throw signUpError
    }
    if (!signUpData?.user) {
      throw new Error('فشل إنشاء حساب الطالب في المصادقة')
    }
    studentId = signUpData.user.id
  }

  // 3. Manually upsert profile
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: studentId,
      name: cleanName,
      phone: cleanPhone,
      role: 'student',
      tenant_id: tenantId,
      grade: grade,
      parent_phone: cleanParentPhone,
      enrollment_type: enrollmentType || 'CENTER',
      branch_id: branchId || null,
      group: groupName || null,
      academic_year_id: activeYearId,
      subscription_discount: Math.max(0, parseFloat(subscriptionDiscount) || 0),
      is_approved: status === 'active',
      is_active: status === 'active',
      status: status
    }, { onConflict: 'id' })

  if (profileError) {
    console.error('Profile upsert error:', profileError)
    if (profileError.message?.includes('profiles_tenant_phone_key') || profileError.message?.includes('profiles_phone_key')) {
      throw new Error(`رقم الهاتف أو الكود (${cleanPhone}) مسجل بالفعل لطالب آخر في هذه المنصة.`)
    }
    throw new Error('فشل إنشاء الملف الشخصي للطالب: ' + profileError.message)
  }

  // 3. Link to group(s) in student_groups join table
  const groupRecords = []
  if (groupId) {
    groupRecords.push({
      student_id: studentId,
      group_id: groupId,
      is_primary: true
    })
  }
  if (secondaryGroupId && secondaryGroupId !== groupId) {
    groupRecords.push({
      student_id: studentId,
      group_id: secondaryGroupId,
      is_primary: false
    })
  }

  if (groupRecords.length > 0) {
    try {
      await supabase
        .from('student_groups')
        .upsert(groupRecords, { onConflict: 'student_id,group_id' })
    } catch (err) {
      console.error('Failed to link student to group(s):', err)
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

