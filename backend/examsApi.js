import { supabase } from './supabase'

// UI grade id ↔ DB enum, same mapping as lectures.
const UI_TO_DB = { first: 'first-prep', second: 'second-prep', third: 'third-prep' }
const DB_TO_UI = { 'first-prep': 'first', 'second-prep': 'second', 'third-prep': 'third' }
export const uiToDbGrade = (ui) => UI_TO_DB[ui] || null
export const dbToUiGrade = (db) => DB_TO_UI[db] || null

// Default returns full exam rows (including the `questions` JSON column)
// because ExamsReport / ExamsGroupReport / Exams render question counts
// and answer reviews from it. Pass { lean: true } to skip the heavy
// `questions` payload — useful for ControlPanel where only metadata is
// needed (cuts payload by 10–100x for big exams).
export async function listExams({ lean = false } = {}) {
  const cols = lean
    ? 'id, number, title, grade, duration_minutes, max_attempts, available_hours, total_points, reveal_grades, created_at'
    : 'id, number, title, grade, duration_minutes, max_attempts, available_hours, total_points, questions, reveal_grades, created_at'
  const { data, error } = await supabase
    .from('exams')
    .select(cols)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
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
  return data
}

export async function getExam(id) {
  const { data, error } = await supabase
    .from('exams')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
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
  // RPC returns a single row {score, max_score}
  const row = Array.isArray(data) ? data[0] : data
  return row || { score: 0, max_score: 0 }
}

// Used by /exams-report. RLS restricts students to their own id automatically.
export async function listAttemptsForStudent(studentId) {
  const { data, error } = await supabase
    .from('exam_attempts')
    .select('*, exams ( id, title, number, total_points, duration_minutes, reveal_grades )')
    .eq('student_id', studentId)
    .order('submitted_at', { ascending: false, nullsFirst: false })
  if (error) throw error
  return data || []
}
