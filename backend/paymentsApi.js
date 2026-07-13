import { supabase } from './supabase'
import { cached, invalidatePrefix, LIST_TTL } from '../src/utils/cache'
import { createNotification } from './notificationsApi'

// ────────────────────────────────────────────────────────────────────
// Refactored Payments API (utilizing Student Ledger)
// ────────────────────────────────────────────────────────────────────

// Admin only: list all payments joined with student profile info
export async function listPayments() {
  const key = 'admin-payments'
  return cached(key, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('student_ledger')
      .select(`
        id,
        student_id,
        amount,
        payment_method,
        screenshot_url,
        screenshot_key,
        status,
        description,
        notes,
        created_at,
        resolved_at,
        resolved_by,
        profiles:student_id ( name, phone, grade, "group", branch_id )
      `)
      .eq('type', 'payment')
      .order('created_at', { ascending: false })
    if (error) throw error

    // Map database ledger structure to expected payments keys
    return (data || []).map(p => ({
      id: p.id,
      student_id: p.student_id,
      amount: p.amount,
      payment_method: p.payment_method,
      screenshot_url: p.screenshot_url,
      screenshot_key: p.screenshot_key,
      status: p.status,
      admin_notes: p.notes, // map notes to admin_notes
      package_name: p.description, // map description to package_name
      created_at: p.created_at,
      resolved_at: p.resolved_at,
      resolved_by: p.resolved_by,
      profiles: p.profiles
    }))
  })
}

// Student only: list all payments for a specific student
export async function listMyPayments(studentId) {
  if (!studentId) return []
  const key = `student-payments-${studentId}`
  return cached(key, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('student_ledger')
      .select('*')
      .eq('student_id', studentId)
      .eq('type', 'payment')
      .order('created_at', { ascending: false })
    if (error) throw error

    return (data || []).map(p => ({
      id: p.id,
      student_id: p.student_id,
      amount: p.amount,
      payment_method: p.payment_method,
      screenshot_url: p.screenshot_url,
      screenshot_key: p.screenshot_key,
      status: p.status,
      admin_notes: p.notes,
      package_name: p.description,
      created_at: p.created_at,
      resolved_at: p.resolved_at,
      resolved_by: p.resolved_by
    }))
  })
}

// Student: submit a new payment receipt
export async function submitPayment({ studentId, amount, paymentMethod, screenshotUrl, screenshotKey, packageName }) {
  // Fetch student's branch and academic year defaults
  const { data: studentProfile } = await supabase
    .from('profiles')
    .select('branch_id, academic_year_id')
    .eq('id', studentId)
    .single()

  const payload = {
    student_id: studentId,
    branch_id: studentProfile?.branch_id || null,
    academic_year_id: studentProfile?.academic_year_id || null,
    type: 'payment',
    amount: parseFloat(amount),
    payment_method: paymentMethod,
    screenshot_url: screenshotUrl,
    screenshot_key: screenshotKey,
    description: packageName || null,
    status: 'pending',
  }
  const { data, error } = await supabase
    .from('student_ledger')
    .insert(payload)
    .select()
    .single()
  if (error) throw error

  // Invalidate caches
  invalidatePrefix('student-payments-')
  invalidatePrefix('admin-payments')

  // Proactively notify admins
  try {
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')

    if (admins && admins.length > 0) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', studentId)
        .single()

      const studentName = profile?.name || 'طالب جديد'

      for (const admin of admins) {
        await createNotification({
          title: 'طلب تأكيد دفع جديد 💰',
          message: `قام الطالب ${studentName} بإرسال إيصال تحويل بقيمة ${amount} ج.م قيد المراجعة.`,
          level: 'warning',
          scope: 'student',
          targetStudent: admin.id,
          meta: { kind: 'payment_pending' }
        })
      }
    }
  } catch (err) {
    console.error('Failed to notify admins of pending payment:', err)
  }

  return data
}

// Admin: approve or reject a payment request and notify the student
export async function resolvePayment(paymentId, { status, adminNotes, adminId, studentId }) {
  const payload = {
    status,
    notes: adminNotes || null,
    resolved_at: new Date().toISOString(),
    resolved_by: adminId,
  }
  const { data, error } = await supabase
    .from('student_ledger')
    .update(payload)
    .eq('id', paymentId)
    .select()
    .single()
  if (error) throw error

  // If approved, activate the student's profile
  if (status === 'approved') {
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ is_active: true, status: 'active' })
        .eq('id', studentId)
      if (profileError) console.error('Failed to activate profile:', profileError)
    } catch (err) {
      console.error('Failed to activate profile:', err)
    }
  }

  // Create notification targeting the student
  try {
    const titleAr = status === 'approved' ? 'تم قبول دفعتك بنجاح' : 'تم رفض دفعتك'
    const messageAr = status === 'approved' 
      ? `تمت الموافقة على دفعتك بقيمة ${data.amount} ج.م. بنجاح وتفعيل حسابك.`
      : `تم رفض دفعتك بقيمة ${data.amount} ج.م. السبب: ${adminNotes || 'يرجى مراجعة الإدارة.'}`

    await createNotification({
      title: titleAr,
      message: messageAr,
      level: status === 'approved' ? 'success' : 'danger',
      scope: 'student',
      targetStudent: studentId,
      createdBy: adminId,
    })
  } catch (err) {
    console.error('Failed to create payment resolution notification:', err)
  }

  // If this payment is bound to a package, update the package purchase status to trigger access grant
  if (data.package_id) {
    try {
      const { error: pkgErr } = await supabase
        .from('package_purchases')
        .update({
          payment_status: status,
          approved_by: adminId,
          approved_at: new Date().toISOString()
        })
        .eq('student_id', studentId)
        .eq('package_id', data.package_id)
        .eq('payment_status', 'pending')

      if (pkgErr) {
        console.error('Failed to sync package purchase status from payment resolve:', pkgErr)
      }
    } catch (err) {
      console.error('Failed to sync package purchase from payment resolve:', err)
    }
  }

  // Invalidate caches
  invalidatePrefix('student-payments-')
  invalidatePrefix('admin-payments')
  if (data.package_id) {
    invalidatePrefix('purchases:')
    invalidatePrefix('student-content:')
    invalidatePrefix('videos')
    invalidatePrefix('exams')
    invalidatePrefix('homeworks')
  }


  return data
}

// Admin: record a cash/offline payment in person (resolved instantly and activates student)
export async function recordCashPayment({ studentId, amount, packageName, adminId }) {
  const { data: studentProfile } = await supabase
    .from('profiles')
    .select('branch_id, academic_year_id')
    .eq('id', studentId)
    .single()

  const payload = {
    student_id: studentId,
    branch_id: studentProfile?.branch_id || null,
    academic_year_id: studentProfile?.academic_year_id || null,
    type: 'payment',
    amount: parseFloat(amount),
    payment_method: 'Cash',
    screenshot_url: null,
    screenshot_key: null,
    status: 'approved',
    description: packageName || null,
    resolved_at: new Date().toISOString(),
    resolved_by: adminId,
  }
  const { data, error } = await supabase
    .from('student_ledger')
    .insert(payload)
    .select()
    .single()
  if (error) throw error

  // Activate the student's profile immediately
  try {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ is_active: true, status: 'active' })
      .eq('id', studentId)
    if (profileError) console.error('Failed to activate profile:', profileError)
  } catch (err) {
    console.error('Failed to activate profile:', err)
  }

  // Invalidate caches
  invalidatePrefix('student-payments-')
  invalidatePrefix('admin-payments')

  return data
}

// Admin/assistant: permanently delete a payment/ledger entry (e.g. test data or
// a mistaken record). RLS on student_ledger is
//   FOR ALL USING (tenant_id = current_tenant_id() AND has_permission(uid,'payments'))
// so this ONLY ever deletes a row belonging to the caller's own tenant, and only
// for staff who hold the 'payments' permission — each tenant owns its own data.
// Removing the row is real: all totals/balances (attendance debt, parent report,
// admin stats) are derived from student_ledger, so they drop immediately.
export async function deletePayment(paymentId) {
  const { error } = await supabase
    .from('student_ledger')
    .delete()
    .eq('id', paymentId)
  if (error) throw error
  invalidatePrefix('student-payments-')
  invalidatePrefix('admin-payments')
  return true
}

// ── Monthly subscription fees (per grade, per tenant) + per-student discount ──

// All configured grade fees for the current tenant (RLS scopes to the tenant).
export async function listSubscriptionFees() {
  const { data, error } = await supabase
    .from('subscription_fees')
    .select('grade, amount')
  if (error) throw error
  return data || []
}

// Create/update the fee for one grade. tenant_id is stamped by the trigger, so
// the conflict target is (tenant_id, grade) — each tenant keeps its own fee.
export async function upsertSubscriptionFee(grade, amount) {
  const { error } = await supabase
    .from('subscription_fees')
    .upsert({ grade, amount: Math.max(0, parseFloat(amount) || 0), updated_at: new Date().toISOString() },
            { onConflict: 'tenant_id,grade' })
  if (error) throw error
  return true
}

// Set a single student's exception discount (EGP). Gated to 'payments' staff.
export async function setStudentDiscount(studentId, amount) {
  const { error } = await supabase.rpc('set_student_discount', {
    p_student_id: studentId,
    p_amount: Math.max(0, parseFloat(amount) || 0),
  })
  if (error) throw error
  return true
}

// Read one student's current discount (for the attendance "amount due").
export async function getStudentDiscount(studentId) {
  const { data } = await supabase
    .from('profiles')
    .select('subscription_discount')
    .eq('id', studentId)
    .maybeSingle()
  return data?.subscription_discount || 0
}

// Fetch all payment settings
export async function getPaymentSettings() {
  const key = 'payment-settings'
  return cached(key, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('payment_settings')
      .select('*')
    if (error) {
      console.warn('Failed to fetch payment settings:', error)
      return null
    }
    
    const config = {}
    data.forEach(item => {
      config[item.key] = item.value
    })
    return config
  })
}

// Update payment settings
export async function updatePaymentSetting(key, value) {
  // Per-tenant settings: tenant_id is stamped by the set_tenant_id_on_insert
  // trigger before conflict resolution, so conflict on (tenant_id, key) targets
  // THIS tenant's own row (not the default tenant's seeded row).
  const { data, error } = await supabase
    .from('payment_settings')
    .upsert({ key, value }, { onConflict: 'tenant_id,key' })
    .select()
    .single()
  if (error) throw error
  invalidatePrefix('payment-settings')
  return data
}
