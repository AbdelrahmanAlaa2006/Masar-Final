import { supabase } from './supabase'
import { cached, invalidatePrefix, LIST_TTL } from '../src/utils/cache'
import { createNotification } from './notificationsApi'
import { listStudentBooklets, markBookletsPaid, revertBookletPayment } from './bookletsApi'
import { recordSubscriptionPayment } from './financeApi'

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
        transaction_date,
        billing_period,
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
      // Actual payment date (backdating): reports/filters should prefer this;
      // rows created before the ledger migration fall back to created_at.
      transaction_date: p.transaction_date || p.created_at,
      billing_period: p.billing_period,
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

export async function getBulkInitialPaymentsPreview({ studentIds, registerMonthly, registerBooklet, monthlyMonth }) {
  if (!studentIds || studentIds.length === 0) {
    return { monthlyAmount: 0, bookletAmount: 0, grandTotal: 0 }
  }

  let monthlyAmount = 0
  let bookletAmount = 0

  if (registerMonthly) {
    // 1. Find who has already paid monthly
    let paidMonthlyStudentIds = new Set()
    if (monthlyMonth) {
      const billingPeriod = 'اشتراك شهر ' + monthlyMonth
      const { data: existingPayments, error } = await supabase
        .from('student_ledger')
        .select('student_id')
        .in('student_id', studentIds)
        .eq('type', 'payment')
        .eq('billing_period', billingPeriod)
      if (!error && existingPayments) {
        paidMonthlyStudentIds = new Set(existingPayments.map(p => p.student_id))
      }
    }

    // 2. Fetch student profiles (need grade and discount)
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, grade, subscription_discount')
      .in('id', studentIds)
    if (profilesError) throw profilesError

    // 3. Fetch subscription fees
    const fees = await listSubscriptionFees()
    const feeMap = Object.fromEntries(fees.map(f => [f.grade, Number(f.amount || 0)]))

    for (const student of profiles) {
      // Skip if already paid
      if (paidMonthlyStudentIds.has(student.id)) continue

      const baseFee = feeMap[student.grade] || 0
      const discount = Number(student.subscription_discount || 0)
      monthlyAmount += Math.max(0, baseFee - discount)
    }
  }

  if (registerBooklet) {
    // 4. Fetch unpaid booklets for these students
    const { data, error } = await supabase
      .from('student_booklets')
      .select('price')
      .in('student_id', studentIds)
      .eq('payment_status', 'unpaid')
    if (error) throw error

    bookletAmount = (data || []).reduce((sum, item) => sum + Number(item.price || 0), 0)
  }

  return {
    monthlyAmount,
    bookletAmount,
    grandTotal: monthlyAmount + bookletAmount
  }
}

export async function registerBulkInitialPayments({
  studentIds,
  registerMonthly,
  registerBooklet,
  monthlyMonth,
  adminId
}) {
  if (!studentIds || studentIds.length === 0) throw new Error('لم يتم اختيار أي طالب')

  // Find who has already paid monthly
  let paidMonthlyStudentIds = new Set()
  if (registerMonthly && monthlyMonth) {
    const billingPeriod = 'اشتراك شهر ' + monthlyMonth
    const { data: existingPayments, error } = await supabase
      .from('student_ledger')
      .select('student_id')
      .in('student_id', studentIds)
      .eq('type', 'payment')
      .eq('billing_period', billingPeriod)
    if (error) throw error
    paidMonthlyStudentIds = new Set((existingPayments || []).map(p => p.student_id))
  }

  // 1. Fetch student profiles (need grade, discount and name)
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, name, grade, subscription_discount')
    .in('id', studentIds)
  if (profilesError) throw profilesError

  // 2. Fetch subscription fees
  const fees = await listSubscriptionFees()
  const feeMap = Object.fromEntries(fees.map(f => [f.grade, Number(f.amount || 0)]))

  let registeredCount = 0
  let skippedCount = 0
  let registeredNames = []
  let skippedNames = []

  // 3. Register payments for each student
  for (const student of profiles) {
    let registeredForThisStudent = false
    let skippedForThisStudent = false

    // Monthly payment
    if (registerMonthly && monthlyMonth) {
      if (paidMonthlyStudentIds.has(student.id)) {
        skippedForThisStudent = true
      } else {
        const baseFee = feeMap[student.grade] || 0
        const discount = Number(student.subscription_discount || 0)
        const due = Math.max(0, baseFee - discount)
        if (due > 0) {
          await recordSubscriptionPayment({
            studentId: student.id,
            amount: due,
            billingPeriod: 'اشتراك شهر ' + monthlyMonth,
            monthlyDue: due,
            paymentMethod: 'Cash',
            adminId: adminId
          })
          registeredForThisStudent = true
        } else {
          skippedForThisStudent = true
        }
      }
    }

    // Booklet payment
    if (registerBooklet) {
      const studentBooklets = await listStudentBooklets(student.id)
      const bookletIds = studentBooklets
        .filter(sb => sb.payment_status === 'unpaid')
        .map(sb => sb.id)
      if (bookletIds.length > 0) {
        await markBookletsPaid(bookletIds, 'دفعة أولى جماعية')
        registeredForThisStudent = true
      } else {
        if (!registeredForThisStudent) {
          skippedForThisStudent = true
        }
      }
    }

    if (registeredForThisStudent) {
      registeredCount++
      registeredNames.push(student.name)
    } else if (skippedForThisStudent) {
      skippedCount++
      skippedNames.push(student.name)
    }
  }

  return {
    totalSelected: studentIds.length,
    skippedCount,
    registeredCount,
    registeredNames,
    skippedNames
  }
}

export async function removeBulkInitialPayments({
  studentIds,
  removeMonthly,
  removeBooklet,
  monthlyMonth
}) {
  let targetIds = studentIds || []
  if (targetIds.length === 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'student')
    if (error) throw error
    targetIds = (data || []).map(r => r.id)
  }

  if (targetIds.length === 0) return true

  for (const studentId of targetIds) {
    // 1. Remove Monthly Payment
    if (removeMonthly && monthlyMonth) {
      const billingPeriod = 'اشتراك شهر ' + monthlyMonth
      const { error } = await supabase
        .from('student_ledger')
        .delete()
        .eq('student_id', studentId)
        .eq('billing_period', billingPeriod)
      if (error) throw error
    }

    // 2. Remove Booklet Payment
    if (removeBooklet) {
      const studentBooklets = await listStudentBooklets(studentId)
      const paidBooklets = studentBooklets.filter(sb => sb.payment_status === 'paid')
      for (const sb of paidBooklets) {
        // Revert status to unpaid directly
        const { error: sbError } = await supabase
          .from('student_booklets')
          .update({
            payment_status: 'unpaid',
            payment_date: null,
            paid_by: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', sb.id)
        if (sbError) throw sbError

        // Delete logs for this booklet
        await supabase
          .from('booklet_payment_logs')
          .delete()
          .eq('student_booklet_id', sb.id)
      }

      // Delete the payment transaction entries from finance_transactions completely
      const { error: ftError } = await supabase
        .from('finance_transactions')
        .delete()
        .eq('student_id', studentId)
        .like('description', 'كتيب:%')
      if (ftError) throw ftError
    }
  }

  // Invalidate caches
  invalidatePrefix('student-payments-')
  invalidatePrefix('admin-payments')
  invalidatePrefix('finance')
  invalidatePrefix('booklets')

  return true
}

