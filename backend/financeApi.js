import { supabase } from './supabase'
import { invalidatePrefix } from '../src/utils/cache'

/* ---------------------------------------------------------------------------
   Financial ledger API (Feature: "Financial Ledger").

   EXTENDS the existing payment system (student_ledger) — subscriptions keep
   flowing through paymentsApi unchanged. This module adds:
     * finance_categories     admin-defined revenue/expense categories
     * finance_transactions   custom revenue + expenses (with backdating)
     * report RPCs            daily cash ledger w/ running balance, period
                              report, cash balance, outstanding student debts
     * partial payments       charge-then-payment per billing period
   All tables are tenant-isolated by RLS; the RPCs check the caller's
   'payments' permission server-side.
   --------------------------------------------------------------------------- */

// ── Categories ──────────────────────────────────────────────────────────────

export async function listFinanceCategories({ kind = null, includeInactive = false } = {}) {
  let query = supabase
    .from('finance_categories')
    .select('id, name, kind, is_active, created_at')
    .order('name', { ascending: true })
  if (kind) query = query.eq('kind', kind)
  if (!includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function createFinanceCategory({ name, kind }) {
  const { data, error } = await supabase
    .from('finance_categories')
    .insert({ name: name.trim(), kind })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('يوجد تصنيف بهذا الاسم بالفعل')
    throw error
  }
  return data
}

export async function updateFinanceCategory(id, { name, is_active }) {
  const patch = {}
  if (name !== undefined) patch.name = name.trim()
  if (is_active !== undefined) patch.is_active = is_active
  const { data, error } = await supabase
    .from('finance_categories')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteFinanceCategory(id) {
  // Transactions keep their history (category_id becomes NULL via FK).
  const { error } = await supabase.from('finance_categories').delete().eq('id', id)
  if (error) throw error
  return true
}

// ── Revenue / expense transactions ─────────────────────────────────────────

export async function addFinanceTransaction({
  categoryId = null,
  direction,            // 'in' (revenue) | 'out' (expense)
  amount,
  description = '',
  notes = null,
  studentId = null,
  transactionDate = null, // 'YYYY-MM-DD' — backdating supported
  createdBy = null,
}) {
  const value = parseFloat(amount)
  if (!(value > 0)) throw new Error('أدخل مبلغاً صالحاً')
  const { data, error } = await supabase
    .from('finance_transactions')
    .insert({
      category_id: categoryId || null,
      direction,
      amount: value,
      description: description || '',
      notes,
      student_id: studentId || null,
      transaction_date: transactionDate || new Date().toISOString().split('T')[0],
      created_by: createdBy,
    })
    .select()
    .single()
  if (error) throw error
  invalidatePrefix('finance')
  return data
}

export async function updateFinanceTransaction(id, patch, { actorId = null } = {}) {
  const updates = { updated_at: new Date().toISOString() }
  if (patch.categoryId !== undefined) updates.category_id = patch.categoryId || null
  if (patch.amount !== undefined) {
    const value = parseFloat(patch.amount)
    if (!(value > 0)) throw new Error('أدخل مبلغاً صالحاً')
    updates.amount = value
  }
  if (patch.description !== undefined) updates.description = patch.description
  if (patch.notes !== undefined) updates.notes = patch.notes
  if (patch.transactionDate !== undefined) updates.transaction_date = patch.transactionDate
  if (patch.direction !== undefined) updates.direction = patch.direction

  const { data, error } = await supabase
    .from('finance_transactions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  logAudit(actorId, 'finance_transaction_updated', { id, updates })
  invalidatePrefix('finance')
  return data
}

export async function deleteFinanceTransaction(id, { actorId = null } = {}) {
  const { error } = await supabase.from('finance_transactions').delete().eq('id', id)
  if (error) throw error
  logAudit(actorId, 'finance_transaction_deleted', { id })
  invalidatePrefix('finance')
  return true
}

// ── Editing student-ledger entries (amount / date / description) ───────────
// RLS restricts this to 'payments' staff within their own tenant; edits are
// recorded in audit_logs to preserve data integrity.
export async function updateLedgerEntry(id, { amount, transactionDate, description, billingPeriod }, { actorId = null } = {}) {
  const updates = {}
  if (amount !== undefined) {
    const value = parseFloat(amount)
    if (!(value > 0)) throw new Error('أدخل مبلغاً صالحاً')
    updates.amount = value
  }
  if (transactionDate !== undefined) updates.transaction_date = transactionDate
  if (description !== undefined) updates.description = description
  if (billingPeriod !== undefined) updates.billing_period = billingPeriod

  const { data, error } = await supabase
    .from('student_ledger')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  logAudit(actorId, 'student_ledger_updated', { id, updates })
  invalidatePrefix('finance')
  invalidatePrefix('student-payments-')
  invalidatePrefix('admin-payments')
  return data
}

// Best-effort audit trail (audit_logs table exists since the architecture
// refactor; failures must never block the actual financial operation).
async function logAudit(actorId, action, { id, updates = null } = {}) {
  try {
    await supabase.from('audit_logs').insert({
      actor_id: actorId || null,
      action,
      entity_type: action.startsWith('student_ledger') ? 'student_ledger' : 'finance_transactions',
      entity_id: id || null,
      new_values: updates,
    })
  } catch { /* non-blocking */ }
}

// ── Partial payments ────────────────────────────────────────────────────────
// Ensures a monthly 'charge' exists for (student, billing period) — created
// once from the grade fee minus the student's exception discount — then
// records the (possibly partial) payment. Remaining balance is then simply
// charge − Σ payments, which the existing outstanding-balance logic
// (get_student_identity, getStudentBalance) already computes.
export async function recordSubscriptionPayment({
  studentId,
  amount,
  billingPeriod,        // e.g. «اشتراك شهر أغسطس»
  monthlyDue,           // fee − discount for this student (computed by caller)
  paymentMethod = 'Cash',
  transactionDate = null,
  adminId = null,
}) {
  const value = parseFloat(amount)
  if (!(value > 0)) throw new Error('أدخل مبلغاً صالحاً')

  const { data: studentProfile } = await supabase
    .from('profiles')
    .select('branch_id, academic_year_id')
    .eq('id', studentId)
    .single()

  const getTodayDate = () => {
    const d = new Date()
    const offset = d.getTimezoneOffset()
    const localDate = new Date(d.getTime() - offset * 60 * 1000)
    return localDate.toISOString().split('T')[0]
  }

  const base = {
    student_id: studentId,
    branch_id: studentProfile?.branch_id || null,
    academic_year_id: studentProfile?.academic_year_id || null,
    status: 'approved',
    billing_period: billingPeriod || null,
    transaction_date: transactionDate || getTodayDate(),
    created_by: adminId,
    resolved_at: new Date().toISOString(),
    resolved_by: adminId,
  }

  // 1) Canonical Subscription Obligation Management & Safe Scoped Reconciliation
  if (billingPeriod && Number(monthlyDue) > 0) {
    const dueAmount = Number(monthlyDue)

    // Query all existing ledger entries for this student & billing period
    const { data: existingRows, error: fetchErr } = await supabase
      .from('student_ledger')
      .select('id, type, amount, status, billing_period, description')
      .eq('student_id', studentId)
      .or(`billing_period.eq.${billingPeriod},and(billing_period.is.null,description.eq.${billingPeriod})`)

    if (fetchErr) throw fetchErr

    const rows = existingRows || []
    const chargeRows = rows.filter(r => r.type === 'charge' && r.status === 'approved')
    const paymentRows = rows.filter(r => r.type === 'payment' && r.status === 'approved')
    const paidSoFar = paymentRows.reduce((sum, r) => sum + Number(r.amount || 0), 0)

    if (chargeRows.length === 0) {
      // No charge exists yet: create single canonical charge
      const { error: chargeError } = await supabase
        .from('student_ledger')
        .insert({
          ...base,
          type: 'charge',
          amount: dueAmount,
          description: billingPeriod,
        })
      if (chargeError) throw chargeError
    } else {
      // One or more charges already exist for this specific period
      const primaryCharge = chargeRows[0]

      // Check if period is open / partially paid vs fully settled
      const currentChargeAmount = Number(primaryCharge.amount || 0)
      const isSettled = currentChargeAmount > 0 && paidSoFar >= currentChargeAmount

      if (!isSettled && currentChargeAmount !== dueAmount) {
        // Open/partially settled obligation: update primary charge amount to true canonical due
        const { error: updateErr } = await supabase
          .from('student_ledger')
          .update({
            amount: dueAmount,
            billing_period: billingPeriod,
            description: billingPeriod,
          })
          .eq('id', primaryCharge.id)
        if (updateErr) throw updateErr
      } else if (!primaryCharge.billing_period) {
        // Ensure billing_period is normalized on legacy row
        await supabase
          .from('student_ledger')
          .update({ billing_period: billingPeriod })
          .eq('id', primaryCharge.id)
      }

      // If duplicate charges exist for this exact student & period, safely remove redundant duplicates
      if (chargeRows.length > 1) {
        const duplicateIds = chargeRows.slice(1).map(r => r.id)
        const { error: delErr } = await supabase
          .from('student_ledger')
          .delete()
          .in('id', duplicateIds)
          .eq('student_id', studentId)
          .eq('type', 'charge')
        if (delErr) {
          console.warn('Failed to clean up verified duplicate charge rows:', delErr)
        }
      }
    }

    // 2) Authoritative Server-side Overpayment & Settlement Validation
    const effectiveCharge = dueAmount
    const remainingBeforeThisPayment = Math.max(0, effectiveCharge - paidSoFar)

    if (remainingBeforeThisPayment <= 0) {
      throw new Error(`هذا الاشتراك مسدد بالكامل بالفعل (${paidSoFar} ج.م مسددة من أصل ${effectiveCharge} ج.م).`)
    }
    if (value > remainingBeforeThisPayment) {
      throw new Error(`المبلغ المدخل (${value} ج.م) يتجاوز المبلغ المتبقي على هذا الاشتراك (${remainingBeforeThisPayment} ج.م).`)
    }
  }

  // 3) Record the (partial) payment itself.
  const { data, error } = await supabase
    .from('student_ledger')
    .insert({
      ...base,
      type: 'payment',
      amount: value,
      payment_method: paymentMethod,
      description: billingPeriod || 'دفعة اشتراك',
    })
    .select()
    .single()
  if (error) throw error

  // Activate the student's profile immediately — same behavior as the
  // original recordCashPayment (a paying student is an active student).
  try {
    await supabase
      .from('profiles')
      .update({ is_active: true, status: 'active' })
      .eq('id', studentId)
  } catch (err) {
    console.error('Failed to activate profile after payment:', err)
  }

  invalidatePrefix('finance')
  invalidatePrefix('student-payments-')
  invalidatePrefix('admin-payments')
  return data
}

// Paid-so-far for one student & billing period (drives the "remaining" hint).
export async function getBillingPeriodPaid(studentId, billingPeriod) {
  if (!studentId || !billingPeriod) return 0
  const monthName = billingPeriod.replace('اشتراك شهر ', '').trim()
  const { data, error } = await supabase
    .from('student_ledger')
    .select('amount, type, status, billing_period, description')
    .eq('student_id', studentId)
    .eq('status', 'approved')
  if (error) throw error
  return (data || [])
    .filter(r =>
      r.type === 'payment' &&
      ((r.billing_period || '').trim() === billingPeriod.trim() ||
       (r.billing_period || '').includes(monthName) ||
       (r.description || '').trim() === billingPeriod.trim() ||
       (r.description || '').includes(monthName))
    )
    .reduce((sum, r) => sum + Number(r.amount || 0), 0)
}

// ── Reports ─────────────────────────────────────────────────────────────────

export async function getDailyLedger(from, to) {
  const { data, error } = await supabase.rpc('finance_daily_ledger', { p_from: from, p_to: to })
  if (error) throw error
  return data || { opening_balance: 0, entries: [] }
}

export async function getFinanceReport(from, to) {
  const { data, error } = await supabase.rpc('finance_report', { p_from: from, p_to: to })
  if (error) throw error
  return data
}

export async function getCashBalance() {
  const { data, error } = await supabase.rpc('finance_cash_balance')
  if (error) throw error
  return Number(data) || 0
}

export async function getOutstandingBalances() {
  const { data, error } = await supabase.rpc('finance_outstanding_balances')
  if (error) throw error
  return data || []
}
