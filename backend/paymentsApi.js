import { supabase } from './supabase'
import { cached, invalidatePrefix, LIST_TTL } from '../src/utils/cache'
import { createNotification } from './notificationsApi'

// ────────────────────────────────────────────────────────────────────
// Payments API
// ────────────────────────────────────────────────────────────────────

// Admin only: list all payments joined with student profile info
export async function listPayments() {
  const key = 'admin-payments'
  return cached(key, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('payments')
      .select(`
        *,
        profiles:student_id ( name, phone, grade, "group" )
      `)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  })
}

// Student only: list all payments for a specific student
export async function listMyPayments(studentId) {
  if (!studentId) return []
  const key = `student-payments-${studentId}`
  return cached(key, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  })
}

// Student: submit a new payment receipt
export async function submitPayment({ studentId, amount, paymentMethod, screenshotUrl, screenshotKey }) {
  const payload = {
    student_id: studentId,
    amount: parseFloat(amount),
    payment_method: paymentMethod,
    screenshot_url: screenshotUrl,
    screenshot_key: screenshotKey,
    status: 'pending',
  }
  const { data, error } = await supabase
    .from('payments')
    .insert(payload)
    .select()
    .single()
  if (error) throw error

  // Invalidate both caches immediately
  invalidatePrefix('student-payments-')
  invalidatePrefix('admin-payments')

  // Proactively notify all admins about the new pending payment
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
    admin_notes: adminNotes || null,
    resolved_at: new Date().toISOString(),
    resolved_by: adminId,
  }
  const { data, error } = await supabase
    .from('payments')
    .update(payload)
    .eq('id', paymentId)
    .select()
    .single()
  if (error) throw error

  // Create database-backed notification targeting the student
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

  // Invalidate both caches immediately
  invalidatePrefix('student-payments-')
  invalidatePrefix('admin-payments')

  return data
}

// Fetch all payment settings from dynamic DB table
export async function getPaymentSettings() {
  const key = 'payment-settings'
  return cached(key, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('payment_settings')
      .select('*')
    if (error) {
      console.warn('Failed to fetch payment settings, using local config fallback:', error)
      return null
    }
    
    const config = {}
    data.forEach(item => {
      config[item.key] = item.value
    })
    return config
  })
}

// Update payment settings in DB
export async function updatePaymentSetting(key, value) {
  const { data, error } = await supabase
    .from('payment_settings')
    .upsert({ key, value })
    .select()
    .single()
  if (error) throw error
  
  // Invalidate settings cache
  invalidatePrefix('payment-settings')
  
  return data
}

