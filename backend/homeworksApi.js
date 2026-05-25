import { supabase } from './supabase'
import { cached, invalidate as invalidateCache, invalidatePrefix, LIST_TTL } from '../src/utils/cache'

// UI grade id  ('first'/'second'/'third')  <->  DB grade enum  ('first-prep'/...)
const UI_TO_DB = { first: 'first-prep', second: 'second-prep', third: 'third-prep' }
const DB_TO_UI = { 'first-prep': 'first', 'second-prep': 'second', 'third-prep': 'third' }
export const uiToDbGrade = (ui) => UI_TO_DB[ui] || null
export const dbToUiGrade = (db) => DB_TO_UI[db] || null

// ────────────────────────────────────────────────────────────────────
// Homeworks (the assignments admins post)
// ────────────────────────────────────────────────────────────────────

// RLS scopes students to their grade; admins see all.
// answer_key holds the MCQ answer key — students get it too (RLS allows
// SELECT) which means an attacker could read it. That's acceptable for
// homework (not exam) since the score is ALSO stored server-side and
// computed by submit_homework() — students learning the answer key just
// guarantees themselves a perfect score, which they could do with a PDF
// hint anyway. If you want the key hidden, move it to a server-only view
// or strip it on the client. (For now we expose it so admin UI can edit.)
export async function listHomeworks() {
  const { data, error } = await supabase
    .from('homeworks')
    .select(
      'id, title, description, subject, teacher, week, grade, ' +
      'cover_url, pdf_url, pdf_key, due_at, max_score, answer_key, reveal_grades, created_at'
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createHomework(input) {
  // answer_key shape: [{ options: 4, correct: 1 }, ...]
  // Total questions = answer_key.length. Each correct answer is worth
  // round(max_score / questions) points.
  const key = Array.isArray(input.answer_key) ? input.answer_key : []
  const cleanKey = key.map((q) => ({
    options: Math.max(2, Math.min(10, parseInt(q?.options, 10) || 4)),
    correct: Math.max(0, parseInt(q?.correct, 10) || 0),
  }))

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
    max_score:   input.max_score == null ? Math.max(1, cleanKey.length) : Math.max(0, parseInt(input.max_score, 10) || 0),
    answer_key:  cleanKey,
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

// Update an existing homework. Only the keys present in `input` are
// written — pass `pdf_url`/`pdf_key` only when REPLACING the file (the
// caller is responsible for cleaning up the old R2 object first if it
// wants to). answer_key is replaced wholesale when present.
export async function updateHomework(id, input) {
  const patch = {}
  const copy = (k) => { if (input[k] !== undefined) patch[k] = input[k] }
  copy('title'); copy('description'); copy('subject'); copy('teacher')
  copy('week'); copy('grade'); copy('cover_url')
  copy('pdf_url'); copy('pdf_key'); copy('due_at'); copy('reveal_grades')

  if (input.max_score !== undefined) {
    patch.max_score = Math.max(0, parseInt(input.max_score, 10) || 0)
  }
  if (Array.isArray(input.answer_key)) {
    patch.answer_key = input.answer_key.map((q) => ({
      options: Math.max(2, Math.min(10, parseInt(q?.options, 10) || 4)),
      correct: Math.max(0, parseInt(q?.correct, 10) || 0),
    }))
  }

  // If the admin uploaded a NEW pdf, we need to delete the OLD one in R2
  // — fetch the previous key first.
  let oldPdfKey = null
  if (patch.pdf_key !== undefined) {
    const { data: prev } = await supabase
      .from('homeworks').select('pdf_key').eq('id', id).maybeSingle()
    oldPdfKey = prev?.pdf_key || null
  }

  const { data, error } = await supabase
    .from('homeworks').update(patch).eq('id', id).select().single()
  if (error) throw error

  if (oldPdfKey && oldPdfKey !== patch.pdf_key) {
    try {
      const { deleteR2Object } = await import('./r2')
      await deleteR2Object({ key: oldPdfKey }).catch(() => {})
    } catch { /* ignore */ }
  }
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
  const key = `student-hw-subs-batch:${studentId}`
  return cached(key, 30000, async () => {
    const { data, error } = await supabase
      .from('homework_submissions')
      .select('*')
      .eq('student_id', studentId)
      .in('homework_id', homeworkIds)
    if (error) throw error
    const out = new Map()
    for (const row of data || []) out.set(row.homework_id, row)
    return out
  })
}

// Submit (or re-submit) MCQ answers. The server reads the answer key,
// auto-grades, and writes the row — the client never computes the score.
// Returns { score, max_score, correct, total }.
export async function submitHomework(homeworkId, responses) {
  const { data, error } = await supabase.rpc('submit_homework', {
    p_homework_id: homeworkId,
    p_responses:   Array.isArray(responses) ? responses : [],
  })
  if (error) throw error
  invalidatePrefix('student-hw-subs-batch:')
  invalidatePrefix('student-hws-')
  return Array.isArray(data) ? data[0] : data
}

// Admin: list all submissions for a homework (joins profile name/phone
// so the grading screen doesn't have to join client-side).
export async function listSubmissionsForHomework(homeworkId) {
  if (!homeworkId) return []
  return cached(`hw_subs:${homeworkId}`, 60_000, async () => {
    const { data, error } = await supabase
      .from('homework_submissions')
      .select(
        'id, homework_id, student_id, submission_url, submission_key, ' +
        'note, submitted_at, score, max_score, responses, ' +
        'feedback, graded_at, graded_by, ' +
        'profiles:student_id ( name, phone, grade, "group" )'
      )
      .eq('homework_id', homeworkId)
      .order('submitted_at', { ascending: false })
    if (error) throw error
    return data || []
  })
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
  // Wipe submission caches — we don't know which homework this was for
  // without an extra round-trip, and there are very few such caches.
  invalidatePrefix('hw_subs:')
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
