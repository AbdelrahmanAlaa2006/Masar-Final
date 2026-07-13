import { supabase } from './supabase'
import { invalidatePrefix } from '../src/utils/cache'

/* ---------------------------------------------------------------------------
   Booklets Management & Payment API (Feature: "Booklets").

   EXTENDS the existing payment system — booklet revenue is recorded through
   the finance module (finance_transactions, category «مبيعات الكتيبات») so it
   appears in the daily ledger and financial reports automatically.

     * booklets              catalog: stage/branch/group + year-or-term scope
     * student_booklets      auto-assigned per matching student (unpaid)
     * booklet_payment_logs  append-only payment audit trail
     * RPCs                  assignment sync, transactional payment (duplicate-
                             proof), revert, and a one-pass report with totals

   All tables are tenant-isolated by RLS; the RPCs check the caller's
   'payments' permission server-side (see 2026_07_15_booklets.sql).
   --------------------------------------------------------------------------- */

export const BOOKLET_SCOPE_LABEL = {
  year: 'العام الدراسي الكامل',
  term: 'ترم دراسي',
}

export const BOOKLET_TERM_LABEL = {
  first: 'الترم الأول',
  second: 'الترم الثاني',
}

// Human label for a booklet's scope ("العام الدراسي الكامل" / "الترم الأول"...).
export const bookletScopeLabel = (scope, term) =>
  scope === 'year' ? BOOKLET_SCOPE_LABEL.year : (BOOKLET_TERM_LABEL[term] || BOOKLET_SCOPE_LABEL.term)

const sanitizeSearch = (term) => (term || '').trim().replace(/[%,()]/g, ' ')

// ── Booklets CRUD ───────────────────────────────────────────────────────────

export async function listBooklets({ search = '', grade = null, branchId = null, scope = null, term = null, status = null } = {}) {
  let query = supabase
    .from('booklets')
    .select(`
      id, name, description, grade, branch_id, group_id, academic_scope, term,
      price, status, created_at, updated_at,
      branches ( name ),
      groups ( name ),
      student_booklets ( count )
    `)
    .order('created_at', { ascending: false })
  const q = sanitizeSearch(search)
  if (q) query = query.ilike('name', `%${q}%`)
  if (grade) query = query.eq('grade', grade)
  if (branchId) query = query.eq('branch_id', branchId)
  if (scope) query = query.eq('academic_scope', scope)
  if (term) query = query.eq('term', term)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

function validateBookletPayload({ name, grade, academicScope, term, price }) {
  if (!(name || '').trim()) throw new Error('أدخل اسم الكتيب')
  if (!grade) throw new Error('اختر المرحلة الدراسية')
  if (academicScope !== 'year' && academicScope !== 'term') throw new Error('اختر النطاق الأكاديمي')
  if (academicScope === 'term' && term !== 'first' && term !== 'second') throw new Error('اختر الترم الدراسي')
  if (!(parseFloat(price) >= 0)) throw new Error('أدخل سعراً صالحاً')
}

function bookletRow({ name, description, grade, branchId, groupId, academicScope, term, price, status }) {
  return {
    name: name.trim(),
    description: (description || '').trim() || null,
    grade,
    branch_id: branchId || null,
    group_id: groupId || null,
    academic_scope: academicScope,
    term: academicScope === 'term' ? term : null,
    price: parseFloat(price),
    status: status || 'active',
  }
}

// Create then immediately assign to every matching student.
// Returns { booklet, assignment: { added, removed } }.
export async function createBooklet(payload) {
  validateBookletPayload(payload)
  const { data, error } = await supabase
    .from('booklets')
    .insert(bookletRow(payload))
    .select()
    .single()
  if (error) throw error
  const assignment = await syncBookletAssignments(data.id)
  invalidatePrefix('booklets')
  return { booklet: data, assignment }
}

// Update then re-sync assignments (unpaid rows follow the new criteria/price;
// paid rows are preserved as financial history).
export async function updateBooklet(id, payload) {
  validateBookletPayload(payload)
  const { data, error } = await supabase
    .from('booklets')
    .update({ ...bookletRow(payload), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  const assignment = await syncBookletAssignments(id)
  invalidatePrefix('booklets')
  return { booklet: data, assignment }
}

export async function setBookletStatus(id, status) {
  const { data, error } = await supabase
    .from('booklets')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  invalidatePrefix('booklets')
  return data
}

// Deleting a booklet cascades its assignments; payment logs keep denormalized
// names so the financial history survives.
export async function deleteBooklet(id) {
  const { error } = await supabase.from('booklets').delete().eq('id', id)
  if (error) throw error
  invalidatePrefix('booklets')
  return true
}

// (Re)assign one booklet to every matching student — set-based, idempotent,
// duplicate-proof (server-side RPC). Returns { added, removed }.
export async function syncBookletAssignments(bookletId) {
  const { data, error } = await supabase.rpc('booklet_sync_assignments', { p_booklet_id: bookletId })
  if (error) throw error
  return data || { added: 0, removed: 0 }
}

// ── Student payment screen ──────────────────────────────────────────────────

// All booklet assignments of one student (active booklets only), optionally
// narrowed to a scope/term — year and term booklets never mix in one view.
export async function listStudentBooklets(studentId, { scope = null, term = null } = {}) {
  let query = supabase
    .from('student_booklets')
    .select(`
      id, price, payment_status, payment_date, notes, created_at,
      booklets!inner ( id, name, description, academic_scope, term, status )
    `)
    .eq('student_id', studentId)
    .eq('booklets.status', 'active')
    .order('created_at', { ascending: true })
  if (scope) query = query.eq('booklets.academic_scope', scope)
  if (scope === 'term' && term) query = query.eq('booklets.term', term)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

// Mark a set of assignments paid — one transaction on the server: status +
// date + acting admin + audit log + finance-ledger revenue row. Already-paid
// rows are skipped, so duplicate payments are impossible.
// Returns { updated, skipped, total_amount }.
export async function markBookletsPaid(studentBookletIds, notes = null) {
  const { data, error } = await supabase.rpc('booklet_mark_paid', {
    p_ids: studentBookletIds,
    p_notes: notes || null,
  })
  if (error) throw error
  invalidatePrefix('booklets')
  invalidatePrefix('finance')
  return data
}

// Admin correction: back to unpaid, logged, with a compensating ledger entry.
export async function revertBookletPayment(studentBookletId) {
  const { data, error } = await supabase.rpc('booklet_revert_payment', { p_id: studentBookletId })
  if (error) throw error
  invalidatePrefix('booklets')
  invalidatePrefix('finance')
  return data
}

// ── Reports ─────────────────────────────────────────────────────────────────

// One-pass server-side report: filtered rows + totals (assigned/paid/unpaid/
// amounts). The date range filters by payment date.
export async function getBookletReport({
  search = '',
  grade = null,
  branchId = null,
  groupId = null,
  scope = null,
  term = null,
  bookletId = null,
  status = null,
  from = null,
  to = null,
} = {}) {
  const { data, error } = await supabase.rpc('booklet_report', {
    p_search: sanitizeSearch(search) || null,
    p_grade: grade || null,
    p_branch: branchId || null,
    p_group: groupId || null,
    p_scope: scope || null,
    p_term: scope === 'term' ? (term || null) : null,
    p_booklet: bookletId || null,
    p_status: status || null,
    p_from: from || null,
    p_to: to || null,
  })
  if (error) throw error
  return data || { rows: [], totals: { assigned: 0, paid: 0, unpaid: 0, paid_amount: 0, remaining_amount: 0 } }
}
