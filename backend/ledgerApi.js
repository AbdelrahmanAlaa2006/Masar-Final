import { supabase } from './supabase'
import { invalidate as invalidateCache } from '../src/utils/cache'

export async function listLedgerForStudent(studentId) {
  const { data, error } = await supabase
    .from('student_ledger')
    .select(`
      id,
      student_id,
      branch_id,
      academic_year_id,
      type,
      amount,
      payment_method,
      screenshot_url,
      screenshot_key,
      status,
      description,
      notes,
      created_at,
      resolved_at,
      branches ( name ),
      academic_years ( name )
    `)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addLedgerEntry(entry) {
  const { data, error } = await supabase
    .from('student_ledger')
    .insert({
      student_id: entry.studentId,
      branch_id: entry.branchId || null,
      academic_year_id: entry.academicYearId || null,
      type: entry.type,
      amount: parseFloat(entry.amount),
      payment_method: entry.paymentMethod || null,
      screenshot_url: entry.screenshotUrl || null,
      screenshot_key: entry.screenshotKey || null,
      status: entry.status || 'approved',
      description: entry.description || '',
      notes: entry.notes || '',
      created_by: entry.createdBy || null
    })
    .select()
    .single()
  if (error) throw error
  invalidateCache(`attendance-summary:${entry.studentId}`) // refresh QR results if cached
  return data
}

export async function updateLedgerStatus(id, { status, resolvedBy, notes }) {
  const { data, error } = await supabase
    .from('student_ledger')
    .update({
      status,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
      notes: notes || null
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  if (data) {
    invalidateCache(`attendance-summary:${data.student_id}`)
  }
  return data
}

export async function getStudentBalance(studentId) {
  const { data, error } = await supabase
    .from('student_ledger')
    .select('type, amount, status')
    .eq('student_id', studentId)
  if (error) throw error

  let balance = 0.0
  ;(data || []).forEach(row => {
    if (row.status === 'approved') {
      if (row.type === 'charge' || row.type === 'refund') {
        balance += parseFloat(row.amount)
      } else if (
        row.type === 'payment' ||
        row.type === 'discount' ||
        row.type === 'scholarship' ||
        row.type === 'waiver'
      ) {
        balance -= parseFloat(row.amount)
      }
    }
  })
  return balance
}

// Admin helper: list all pending payment verification requests
export async function listPendingPayments() {
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
      profiles:student_id ( name, phone, grade, "group" )
    `)
    .eq('type', 'payment')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}
