import { supabase } from './supabase'

// UI grade id  ('first'/'second'/'third')  <->  DB grade enum  ('first-prep'/...)
const UI_TO_DB = { first: 'first-prep', second: 'second-prep', third: 'third-prep' }
const DB_TO_UI = { 'first-prep': 'first', 'second-prep': 'second', 'third-prep': 'third' }
export const uiToDbGrade = (ui) => UI_TO_DB[ui] || null
export const dbToUiGrade = (db) => DB_TO_UI[db] || null

// ────────────────────────────────────────────────────────────────────
// Homeworks (the assignments admins post)
// ────────────────────────────────────────────────────────────────────

// RLS scopes students to their grade; admins see all.
export async function listHomeworks() {
  const { data, error } = await supabase
    .from('homeworks')
    .select(
      'id, title, description, subject, teacher, week, grade, ' +
      'cover_url, pdf_url, pdf_key, due_at, max_score, created_at'
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createHomework(input) {
  const payload = {
    title:       input.title,
    description: input.description || null,
    subject:     input.subject || null,
    teacher:     input.teacher || null,
    week:        input.week || null,
    grade:       input.grade,
    cover_url:   input.cover_url || null,
    pdf_url:     input.pdf_url || null,
    pdf_key:     input.pdf_key || null,
    due_at:      input.due_at || null,
    max_score:   input.max_score == null ? 100 : Math.max(0, parseInt(input.max_score, 10) || 0),
    created_by:  input.created_by || null,
  }
  const { data, error } = await supabase
    .from('homeworks')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteHomework(id) {
  // Pull the row so we can clean up R2 objects after the DB delete.
  // homework_submissions are removed by the FK ON DELETE CASCADE — but
  // their R2 files would orphan. We fetch + clean those too.
  const { data: row } = await supabase
    .from('homeworks')
    .select('pdf_key, pdf_url, cover_url')
    .eq('id', id)
    .maybeSingle()

  // Submission files belonging to this homework
  const { data: subs } = await supabase
    .from('homework_submissions')
    .select('submission_key, submission_url')
    .eq('homework_id', id)

  const { error } = await supabase.from('homeworks').delete().eq('id', id)
  if (error) throw error

  try {
    const { deleteR2Object } = await import('./r2')
    const tasks = []
    if (row?.pdf_key || row?.pdf_url) {
      tasks.push(deleteR2Object({ key: row.pdf_key, url: row.pdf_url }).catch(() => {}))
    }
    if (row?.cover_url) {
      tasks.push(deleteR2Object({ url: row.cover_url }).catch(() => {}))
    }
    for (const s of subs || []) {
      if (s.submission_key || s.submission_url) {
        tasks.push(deleteR2Object({ key: s.submission_key, url: s.submission_url }).catch(() => {}))
      }
    }
    await Promise.all(tasks)
  } catch { /* orphans in R2 — admin can clean up later */ }
}

// ────────────────────────────────────────────────────────────────────
// Submissions (student answers)
// ────────────────────────────────────────────────────────────────────

// One row per student per homework — used by the student to know whether
// they've already submitted. Returns the row or null.
export async function getMySubmission(homeworkId, studentId) {
  if (!homeworkId || !studentId) return null
  const { data, error } = await supabase
    .from('homework_submissions')
    .select('*')
    .eq('homework_id', homeworkId)
    .eq('student_id', studentId)
    .maybeSingle()
  if (error) throw error
  return data || null
}

// Batch: get the current student's submission status across many homeworks.
// Returns Map<homeworkId, submissionRow>. One round-trip.
export async function getMySubmissionsBatch(homeworkIds, studentId) {
  if (!homeworkIds?.length || !studentId) return new Map()
  const { data, error } = await supabase
    .from('homework_submissions')
    .select('*')
    .eq('student_id', studentId)
    .in('homework_id', homeworkIds)
  if (error) throw error
  const out = new Map()
  for (const row of data || []) out.set(row.homework_id, row)
  return out
}

// Create or update the student's submission. RLS prevents writing
// score/feedback/graded_* — those columns are admin-only.
export async function upsertSubmission({
  homework_id, student_id,
  submission_url = null, submission_key = null, note = null,
}) {
  const payload = {
    homework_id, student_id,
    submission_url, submission_key, note,
    submitted_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('homework_submissions')
    .upsert(payload, { onConflict: 'homework_id,student_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

// Admin: list all submissions for a homework (joins profile name/phone
// so the grading screen doesn't have to join client-side).
export async function listSubmissionsForHomework(homeworkId) {
  if (!homeworkId) return []
  const { data, error } = await supabase
    .from('homework_submissions')
    .select(
      'id, homework_id, student_id, submission_url, submission_key, ' +
      'note, submitted_at, score, feedback, graded_at, graded_by, ' +
      'profiles:student_id ( name, phone, grade, "group" )'
    )
    .eq('homework_id', homeworkId)
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Admin: write a grade + feedback. Pass null to clear.
export async function gradeSubmission(submissionId, { score, feedback, graderId }) {
  const payload = {
    score: score == null || score === '' ? null : parseInt(score, 10),
    feedback: feedback || null,
    graded_at: new Date().toISOString(),
    graded_by: graderId || null,
  }
  const { data, error } = await supabase
    .from('homework_submissions')
    .update(payload)
    .eq('id', submissionId)
    .select()
    .single()
  if (error) throw error
  return data
}

// Admin: delete a submission entirely (also frees the R2 file).
export async function deleteSubmission(submissionId) {
  const { data: row } = await supabase
    .from('homework_submissions')
    .select('submission_key, submission_url')
    .eq('id', submissionId)
    .maybeSingle()

  const { error } = await supabase.from('homework_submissions').delete().eq('id', submissionId)
  if (error) throw error

  if (row?.submission_key || row?.submission_url) {
    try {
      const { deleteR2Object } = await import('./r2')
      await deleteR2Object({ key: row.submission_key, url: row.submission_url }).catch(() => {})
    } catch { /* ignore */ }
  }
}
