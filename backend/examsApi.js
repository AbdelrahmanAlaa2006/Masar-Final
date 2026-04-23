import { supabase } from './supabase'

// UI grade id ↔ DB enum, same mapping as lectures.
const UI_TO_DB = { first: 'first-prep', second: 'second-prep', third: 'third-prep' }
const DB_TO_UI = { 'first-prep': 'first', 'second-prep': 'second', 'third-prep': 'third' }
export const uiToDbGrade = (ui) => UI_TO_DB[ui] || null
export const dbToUiGrade = (db) => DB_TO_UI[db] || null

export async function listExams() {
  const { data, error } = await supabase
    .from('exams')
    .select('id, number, title, grade, duration_minutes, max_attempts, available_hours, total_points, questions, reveal_grades, created_at')
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

// How many times this student has *submitted* this exam. In-flight attempts
// (submitted_at is null) don't count — so a page refresh mid-exam doesn't
// burn an attempt.
export async function countSubmittedAttempts(examId, studentId) {
  const { count, error } = await supabase
    .from('exam_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('exam_id', examId)
    .eq('student_id', studentId)
    .not('submitted_at', 'is', null)
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

export async function submitAttempt(attemptId, { score, max_score, responses }) {
  const { data, error } = await supabase
    .from('exam_attempts')
    .update({
      score: parseInt(score) || 0,
      max_score: parseInt(max_score) || 0,
      responses: responses || [],
      submitted_at: new Date().toISOString(),
    })
    .eq('id', attemptId)
    .select()
    .single()
  if (error) throw error
  return data
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
