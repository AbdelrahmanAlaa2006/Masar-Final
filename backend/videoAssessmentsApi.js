import { supabase } from './supabase'
import { cached, invalidate as invalidateCache, invalidatePrefix, LIST_TTL } from '../src/utils/cache'

/**
 * Pre-Video Assessment System.
 *
 * A "gate" (row in `video_assessments`) says: before this video — or this one
 * part of it — the student must sit assessment X of type T, score at least
 * P percent, within N attempts.
 *
 * Everything that decides whether a video opens is computed in Postgres:
 *   - the answer key never reaches the browser (get_assessment_questions
 *     strips `answers`),
 *   - the score is withheld until the student passes or burns every attempt
 *     (submit_pre_video_attempt returns NULLs until then),
 *   - the unlock row can only be written by the SECURITY DEFINER RPC.
 * The functions here are thin wrappers; do not re-implement any of that logic
 * client-side, and never treat a value returned here as authoritative for
 * anything other than what to draw.
 *
 * See backend/migrations/2026_07_26_pre_video_assessments.sql.
 */

const GATE_TTL = 60 * 1000 // gates change as the student attempts — keep it short

// ──────────── Assessment type registry ────────────
// Types live in a table, so adding "تسميع مصور" later is an INSERT, not a
// frontend release.
export async function listAssessmentTypes() {
  return cached('assessment-types', LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('assessment_types')
      .select('code, label_ar, label_en, icon, source_filter, sort_order')
      .eq('is_active', true)
      .order('sort_order')
    if (error) throw error
    return data || []
  })
}

/* Assessments an admin can attach for a given type. `source_filter` on the
   type row tells us which exams.exam_type backs it, so this stays generic:
   'exam' -> exam_type='exam', 'tasmee3' -> exam_type='tasmee3'. */
export async function listSelectableAssessments(typeCode, { grade = null } = {}) {
  const types = await listAssessmentTypes()
  const type = types.find(t => t.code === typeCode)
  if (!type) throw new Error(`نوع تقييم غير معروف: ${typeCode}`)

  let q = supabase
    .from('exams')
    .select('id, title, number, grade, exam_type, total_points, questions_count, duration_minutes, origin')
    .eq('is_archived', false)
    .order('created_at', { ascending: false })

  if (type.source_filter) q = q.eq('exam_type', type.source_filter)
  if (grade) q = q.in('grade', [grade, 'packages'])

  const { data, error } = await q
  if (error) throw error
  return data || []
}

// ──────────── Admin: read / write the gates on a video ────────────

const GATE_COLS = `
  id, video_id, part_id, assessment_type, assessment_id,
  allowed_attempts, passing_score, trigger_type, timestamp_seconds,
  is_enabled, title_override, created_at
`

/* `assessment_id` is POLYMORPHIC — it has no foreign key, because which table
   it points at depends on assessment_type. That means PostgREST cannot embed
   the target with `exam:assessment_id(...)`; there is no relationship to
   traverse. So we resolve the titles in a second, batched query and stitch
   them on. Two queries total regardless of how many gates come back. */
async function attachAssessmentDetails(rows) {
  if (!rows.length) return rows
  const ids = [...new Set(rows.map(r => r.assessment_id).filter(Boolean))]
  if (!ids.length) return rows

  // Every type registered today is backed by `exams`. When a future type gets
  // its own table, branch here on assessment_type and merge both lookups.
  const { data, error } = await supabase
    .from('exams')
    .select('id, title, exam_type, total_points, questions_count, duration_minutes')
    .in('id', ids)
  if (error) throw error

  const byId = new Map((data || []).map(e => [e.id, e]))
  for (const r of rows) r.assessment = byId.get(r.assessment_id) || null
  return rows
}

export async function listVideoAssessments(videoId) {
  if (!videoId) return []
  const { data, error } = await supabase
    .from('video_assessments')
    .select(GATE_COLS)
    .eq('video_id', videoId)
    .order('created_at')
  if (error) throw error
  return attachAssessmentDetails(data || [])
}

/* Batch variant for the admin video list — one query for every video instead
   of one per card. */
export async function listVideoAssessmentsForVideos(videoIds) {
  const ids = (videoIds || []).filter(Boolean)
  if (!ids.length) return new Map()
  const { data, error } = await supabase
    .from('video_assessments')
    .select(GATE_COLS)
    .in('video_id', ids)
  if (error) throw error

  const rows = await attachAssessmentDetails(data || [])
  const byVideo = new Map()
  for (const row of rows) {
    if (!byVideo.has(row.video_id)) byVideo.set(row.video_id, [])
    byVideo.get(row.video_id).push(row)
  }
  return byVideo
}

function normalizeGateInput(input) {
  const trigger = input.trigger_type === 'timestamp' ? 'timestamp' : 'before'
  // 0 = unlimited. Anything else is clamped to a sane 1..99.
  const rawAttempts = input.allowed_attempts
  const attempts = rawAttempts === 0 || rawAttempts === '0' || rawAttempts === 'unlimited'
    ? 0
    : Math.max(1, Math.min(99, parseInt(rawAttempts, 10) || 2))
  const passing = Math.max(0, Math.min(100, Number(input.passing_score ?? 50)))

  return {
    video_id: input.video_id,
    part_id: input.part_id || null,
    assessment_type: input.assessment_type || 'exam',
    assessment_id: input.assessment_id,
    allowed_attempts: attempts,
    passing_score: passing,
    trigger_type: trigger,
    timestamp_seconds: trigger === 'timestamp'
      ? Math.max(0, parseInt(input.timestamp_seconds, 10) || 0)
      : null,
    is_enabled: input.is_enabled !== false,
    title_override: (input.title_override || '').trim() || null,
    created_by: input.created_by || null,
  }
}

export async function createVideoAssessment(input) {
  const payload = normalizeGateInput(input)
  if (!payload.video_id)      throw new Error('الفيديو مطلوب')
  if (!payload.assessment_id) throw new Error('يجب اختيار التقييم')

  const { data, error } = await supabase
    .from('video_assessments')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  invalidatePrefix('video-gates:')
  invalidatePrefix('videos')
  return data
}

export async function updateVideoAssessment(id, input) {
  const full = normalizeGateInput({ video_id: 'x', assessment_id: 'x', ...input })
  const patch = {}
  const fields = [
    'part_id', 'assessment_type', 'assessment_id', 'allowed_attempts',
    'passing_score', 'trigger_type', 'timestamp_seconds', 'is_enabled',
    'title_override',
  ]
  for (const f of fields) {
    if (input[f] !== undefined) patch[f] = full[f]
  }
  // trigger_type and timestamp_seconds move together — a gate switched back to
  // 'before' must not keep a stale timestamp (the CHECK constraint allows it,
  // but the player would read it).
  if (patch.trigger_type === 'before') patch.timestamp_seconds = null

  const { data, error } = await supabase
    .from('video_assessments')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  invalidatePrefix('video-gates:')
  invalidatePrefix('videos')
  return data
}

export async function deleteVideoAssessment(id) {
  const { error } = await supabase.from('video_assessments').delete().eq('id', id)
  if (error) throw error
  invalidatePrefix('video-gates:')
  invalidatePrefix('videos')
}

/* Replace the full gate set for one video in a single save (mirrors how
   updateVideo() syncs video_parts). Rows the admin removed are deleted,
   surviving rows are patched, new ones inserted. */
export async function syncVideoAssessments(videoId, gates, { created_by = null } = {}) {
  const { data: existing, error: exErr } = await supabase
    .from('video_assessments')
    .select('id')
    .eq('video_id', videoId)
  if (exErr) throw exErr

  const existingIds = (existing || []).map(r => r.id)
  const incoming = (gates || []).filter(g => g.assessment_id)
  const keepIds = incoming.filter(g => g.id && existingIds.includes(g.id)).map(g => g.id)
  const toDelete = existingIds.filter(id => !keepIds.includes(id))

  if (toDelete.length) {
    const { error } = await supabase.from('video_assessments').delete().in('id', toDelete)
    if (error) throw error
  }

  for (const g of incoming) {
    if (g.id && existingIds.includes(g.id)) {
      await updateVideoAssessment(g.id, { ...g, video_id: videoId })
    } else {
      await createVideoAssessment({ ...g, id: undefined, video_id: videoId, created_by })
    }
  }

  invalidatePrefix('video-gates:')
  invalidatePrefix('videos')
  return listVideoAssessments(videoId)
}

/* Admin remedy: clear a student's attempts on one gate so they get a fresh
   allowance (and re-lock them if the unlock was granted in error).
   Done in ONE RPC rather than two deletes: the exam_attempts policy admits
   only role admin/super_admin while the unlocks policy also admits assistants
   with the 'videos' permission, so split client-side deletes would silently
   half-apply for an assistant. */
export async function resetStudentGate({ video_assessment_id, student_id }) {
  const { error } = await supabase.rpc('reset_pre_video_gate', {
    p_video_assessment_id: video_assessment_id,
    p_student_id: student_id,
  })
  if (error) throw error
  invalidatePrefix('video-gates:')
}

// ──────────── Student: gate status, sitting, submitting ────────────

/* One round trip for every gate across the given videos: config + this
   student's attempts used/remaining + whether it is already unlocked.
   Returns Map<videoId, gate[]>. */
export async function getVideoGateStatus(videoIds, studentId = 'me') {
  const ids = (videoIds || []).filter(Boolean)
  if (!ids.length) return new Map()

  const key = `video-gates:${studentId}:${[...ids].sort().join(',')}`
  const rows = await cached(key, GATE_TTL, async () => {
    const { data, error } = await supabase.rpc('get_video_gate_status', { p_video_ids: ids })
    if (error) throw error
    return data || []
  })

  const byVideo = new Map()
  for (const g of rows) {
    if (!byVideo.has(g.video_id)) byVideo.set(g.video_id, [])
    byVideo.get(g.video_id).push(g)
  }
  return byVideo
}

export function invalidateGateCache() {
  invalidatePrefix('video-gates:')
}

/* Questions with the answer key stripped server-side. There is deliberately
   no client-side fallback that reads `videos.quizzes` — that column is the
   old, leaky path and is no longer consulted. */
export async function getAssessmentQuestions(videoAssessmentId) {
  const { data, error } = await supabase.rpc('get_assessment_questions', {
    p_video_assessment_id: videoAssessmentId,
  })
  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function startPreVideoAttempt(videoAssessmentId) {
  const { data, error } = await supabase.rpc('start_pre_video_attempt', {
    p_video_assessment_id: videoAssessmentId,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('تعذر بدء المحاولة')
  return row
}

/* The returned row carries score/max_score/percent ONLY when `reveal` is true
   (student passed, or spent every attempt). While attempts remain they come
   back null — by design, so a failed attempt teaches nothing about which
   answers were wrong. */
export async function submitPreVideoAttempt(attemptId, responses) {
  const { data, error } = await supabase.rpc('submit_pre_video_attempt', {
    p_attempt_id: attemptId,
    p_responses: responses || [],
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  invalidatePrefix('video-gates:')
  invalidatePrefix('student-vids-')
  return row
}

/* Full answer review. The RPC itself refuses until the student has passed or
   exhausted their attempts, so calling it early throws rather than leaking. */
export async function getPreVideoAttemptReview(videoAssessmentId) {
  const { data, error } = await supabase.rpc('get_pre_video_attempt_review', {
    p_video_assessment_id: videoAssessmentId,
  })
  if (error) throw error
  return data || null
}

// ──────────── Reporting ────────────

function reportArgs(f = {}) {
  return {
    p_search:        f.search || null,
    p_grade:         f.grade || null,
    p_branch_id:     f.branchId || null,
    p_group_id:      f.groupId || null,
    p_teacher_id:    f.teacherId || null,
    p_video_id:      f.videoId || null,
    p_assessment_id: f.assessmentId || null,
    p_status:        f.status && f.status !== 'all' ? f.status : null,
    p_from:          f.from || null,
    p_to:            f.to || null,
    // 'exam' | 'tasmee3' — narrows the report to one assessment type.
    // null/'all' = both, which is the default (one combined report).
    p_type:          f.type && f.type !== 'all' ? f.type : null,
    // Set = individual student report (one student, all their gates).
    p_student_id:    f.studentId || null,
  }
}

/* Paginated + filtered + aggregated entirely in SQL. `total_count` rides along
   on every row (window function) so the pager needs no second count query. */
export async function listPreAssessmentReport(filters = {}, { limit = 50, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('pre_assessment_report', {
    ...reportArgs(filters),
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  const rows = data || []
  return { rows, total: rows.length ? Number(rows[0].total_count) : 0 }
}

export async function getPreAssessmentStats(filters = {}) {
  const { data, error } = await supabase.rpc('pre_assessment_report_stats', reportArgs(filters))
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row || {
    total_students: 0, passed_count: 0, failed_count: 0, completed_count: 0,
    not_started_count: 0, average_score: 0, highest_score: 0, lowest_score: 0,
    average_attempts: 0, pass_rate: 0, failure_rate: 0,
  }
}

export async function getPreAssessmentFilterOptions() {
  return cached('pre-assessment-filter-options', LIST_TTL, async () => {
    const { data, error } = await supabase.rpc('pre_assessment_filter_options')
    if (error) throw error
    return data || { videos: [], assessments: [], teachers: [] }
  })
}

export function invalidatePreAssessmentReport() {
  invalidateCache('pre-assessment-filter-options')
}
