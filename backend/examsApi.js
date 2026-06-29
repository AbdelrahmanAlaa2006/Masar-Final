import { supabase } from './supabase'
import { cached, invalidatePrefix, LIST_TTL } from '../src/utils/cache'

// UI grade id ↔ DB enum
const UI_TO_DB = {
  first: 'first-prep',
  second: 'second-prep',
  third: 'third-prep',
  'first-sec': 'first-sec',
  'second-sec': 'second-sec',
  'third-sec': 'third-sec',
  packages: 'packages'
}
const DB_TO_UI = {
  'first-prep': 'first',
  'second-prep': 'second',
  'third-prep': 'third',
  'first-sec': 'first-sec',
  'second-sec': 'second-sec',
  'third-sec': 'third-sec',
  packages: 'packages'
}
export const uiToDbGrade = (ui) => UI_TO_DB[ui] || ui
export const dbToUiGrade = (db) => DB_TO_UI[db] || db

// Default returns full exam rows (including the `questions` JSON column)
// because ExamsReport / ExamsGroupReport / Exams render question counts
// and answer reviews from it. Pass { lean: true } to skip the heavy
// `questions` payload — useful for ControlPanel where only metadata is
// needed (cuts payload by 10–100x for big exams).
export async function listExams({ lean = false } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  let isAdmin = false
  let isStudent = false
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profile) {
      if (profile.role === 'admin' || profile.role === 'super_admin') {
        isAdmin = true
      } else if (profile.role === 'assistant') {
        const { data: adminData } = await supabase
          .from('tenant_admins')
          .select('permissions')
          .eq('user_id', user.id)
          .maybeSingle()
        if (adminData && Array.isArray(adminData.permissions) && adminData.permissions.includes('exams')) {
          isAdmin = true
        }
      }
      isStudent = profile.role === 'student'
    }
  }

  const cols = lean
    ? 'id, number, title, grade, duration_minutes, max_attempts, available_hours, total_points, reveal_grades, is_archived, created_at, questions_count'
    : 'id, number, title, grade, duration_minutes, max_attempts, available_hours, total_points, questions, questions_count, reveal_grades, is_archived, created_at'

  let query = supabase
    .from('exams')
    .select(cols)

  if (!isAdmin) {
    query = query.eq('is_archived', false)
  }

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  let rows = data || []

  // Package-level gating for student role
  if (user && isStudent) {
    const { listStudentContentAccess } = await import('./packagesApi')
    const access = await listStudentContentAccess(user.id)
    const allowedExamIds = new Set(access.filter(a => a.content_type === 'exam').map(a => a.content_id))
    rows = rows.filter(e => e.grade !== 'packages' || allowedExamIds.has(e.id))
  }

  return rows
}

/* Admin-only: flip the reveal_grades flag on an exam. Enforced by RLS. */
export async function setExamRevealGrades(examId, reveal) {
  const { data, error } = await supabase
    .from('exams')
    .update({ reveal_grades: !!reveal })
    .eq('id', examId)
    .select('id, reveal_grades')
    .single()
  if (error) throw error
  invalidatePrefix('grades-summary:')
  return data
}

export async function getExam(id) {
  const { data, error } = await supabase
    .from('exams')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error

  // Check packages gating
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profile && profile.role === 'student' && data.grade === 'packages') {
      const { listStudentContentAccess } = await import('./packagesApi')
      const access = await listStudentContentAccess(user.id)
      const allowedExamIds = new Set(access.filter(a => a.content_type === 'exam').map(a => a.content_id))
      if (!allowedExamIds.has(id)) {
        throw new Error('This exam is locked inside a package you have not purchased.')
      }
    }
  }

  return data
}

export async function createExam(input) {
  const payload = {
    number: input.number || null,
    title: input.title,
    grade: input.grade,
    duration_minutes: parseInt(input.duration_minutes),
    max_attempts: parseInt(input.max_attempts) || 1,
    available_hours: parseInt(input.available_hours) || 72,
    questions: input.questions || [],
    total_points: parseInt(input.total_points) || 0,
    created_by: input.created_by || null,
  }
  const { data, error } = await supabase
    .from('exams')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

// Patch exam metadata (title / number / grade / duration / max_attempts /
// available_hours / total_points / reveal_grades). Editing the
// `questions` array is NOT supported here — re-build the exam if you
// need to change individual questions.
export async function updateExam(id, input) {
  const patch = {}
  if (input.title           !== undefined) patch.title = String(input.title).trim()
  if (input.number          !== undefined) patch.number = input.number || null
  if (input.grade           !== undefined) patch.grade = input.grade
  if (input.duration_minutes !== undefined) patch.duration_minutes = Math.max(1, parseInt(input.duration_minutes, 10) || 1)
  if (input.max_attempts     !== undefined) patch.max_attempts = Math.max(1, parseInt(input.max_attempts, 10) || 1)
  if (input.available_hours  !== undefined) patch.available_hours = Math.max(1, parseInt(input.available_hours, 10) || 1)
  if (input.total_points     !== undefined) patch.total_points = Math.max(0, parseInt(input.total_points, 10) || 0)
  if (input.reveal_grades    !== undefined) patch.reveal_grades = !!input.reveal_grades
  if (input.questions        !== undefined) patch.questions = input.questions || []

  const { data, error } = await supabase
    .from('exams').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteExam(id) {
  const { error } = await supabase.from('exams').delete().eq('id', id)
  if (error) throw error
}

/* Admin: change an exam's availability window after the fact.
   Exams.jsx computes `availableUntil = created_at + available_hours`, so
   updating this column alone extends / shortens the window. */
export async function updateExamAvailability(examId, hours) {
  const h = Math.max(1, parseInt(hours, 10) || 1)
  const { data, error } = await supabase
    .from('exams')
    .update({ available_hours: h })
    .eq('id', examId)
    .select('id, available_hours, created_at')
    .single()
  if (error) throw error
  return data
}

// How many times this student has *submitted* this exam. In-flight attempts
// (submitted_at is null) don't count — so a page refresh mid-exam doesn't
// burn an attempt.
//
// `sinceIso` optionally restricts the count to attempts submitted at or
// after that timestamp. We use it when an admin override exists: the
// override's updated_at acts as a "reset point" so each time the admin
// re-saves the bonus, the student's historical attempts stop counting
// against the new allowance.
export async function countSubmittedAttempts(examId, studentId, sinceIso = null) {
  let q = supabase
    .from('exam_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('exam_id', examId)
    .eq('student_id', studentId)
    .not('submitted_at', 'is', null)
  if (sinceIso) q = q.gte('submitted_at', sinceIso)
  const { count, error } = await q
  if (error) throw error
  return count || 0
}

// Batch version: one query for all of the student's submitted attempts
// across the given exam IDs, returns a Map<examId, count>. Used by
// Exams.jsx so the badge "X/Y محاولات" doesn't fire one request per exam.
//
// `sinceMap` is { [examId]: ISO-string|null } — when an override exists for
// an exam, only attempts at/after that timestamp count. We do the date
// filtering client-side (one round-trip) instead of issuing one filtered
// query per exam.
export async function countSubmittedAttemptsBatch(examIds, studentId, sinceMap = {}) {
  if (!examIds?.length || !studentId || studentId === 'undefined') return []
  const key = `student-exam-attempts-batch:${studentId}`
  return cached(key, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('exam_attempts')
      .select('exam_id, submitted_at')
      .eq('student_id', studentId)
      .in('exam_id', examIds)
      .not('submitted_at', 'is', null)
    if (error) throw error
    const out = {}
    for (const id of examIds) out[id] = 0
    for (const r of data || []) {
      const cutoff = sinceMap[r.exam_id]
      if (cutoff && r.submitted_at < cutoff) continue
      out[r.exam_id] = (out[r.exam_id] || 0) + 1
    }
    return Object.entries(out)
  })
}

// Create an in-flight attempt row. Returns the row id to update on submit.
export async function startAttempt({ exam_id, student_id, max_score }) {
  const { data, error } = await supabase
    .from('exam_attempts')
    .insert({ exam_id, student_id, max_score: max_score || 0 })
    .select()
    .single()
  if (error) throw error
  return data
}

// Submit answers and let the SERVER compute the score. The client does NOT
// pass `score` — it can't be trusted. The Postgres function reads the
// exam's correct answers, scores responses, and writes the row atomically.
// See backend/migrations/2026_05_05_hardening.sql → submit_exam_attempt.
export async function submitAttempt(attemptId, { responses }) {
  const { data, error } = await supabase.rpc('submit_exam_attempt', {
    p_attempt_id: attemptId,
    p_responses: responses || [],
  })
  if (error) throw error
  invalidatePrefix('attempts:')
  invalidatePrefix('student-exam-attempts-batch:')
  invalidatePrefix('student-exams-')
  invalidatePrefix('upcoming-exam-')
  invalidatePrefix('grades-summary:')
  // RPC returns a single row {score, max_score}
  const row = Array.isArray(data) ? data[0] : data
  return row || { score: 0, max_score: 0 }
}

// Used by /exams-report. RLS restricts students to their own id automatically.
export async function listAttemptsForStudent(studentId) {
  const key = `attempts:${studentId}`
  return cached(key, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('exam_attempts')
      .select('*, exams ( id, title, number, total_points, duration_minutes, reveal_grades )')
      .eq('student_id', studentId)
      .order('submitted_at', { ascending: false, nullsFirst: false })
    if (error) throw error
    return data || []
  })
}

export async function setExamArchived(id, archived) {
  const { data, error } = await supabase
    .from('exams')
    .update({ is_archived: !!archived })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
