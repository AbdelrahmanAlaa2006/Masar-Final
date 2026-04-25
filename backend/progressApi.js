import { supabase } from './supabase'

// ──────────── Quiz attempts (video gating) ────────────
// One row per (student, video, quiz_local_id). Upserted on every submit.

export async function listQuizAttemptsForVideo(videoId, studentId) {
  const { data, error } = await supabase
    .from('quiz_attempts')
    .select('*')
    .eq('video_id', videoId)
    .eq('student_id', studentId)
  if (error) throw error
  return data || []
}

export async function recordQuizAttempt({
  student_id,
  video_id,
  quiz_local_id,
  passed,
  best_correct,
  attempts,
}) {
  const payload = {
    student_id,
    video_id,
    quiz_local_id,
    passed,
    best_correct,
    attempts,
    last_attempt_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('quiz_attempts')
    .upsert(payload, { onConflict: 'student_id,video_id,quiz_local_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

// ──────────── Video progress (view limits per part) ────────────

export async function listProgressForVideo(videoId, studentId) {
  const { data, error } = await supabase
    .from('video_progress')
    .select('*')
    .eq('video_id', videoId)
    .eq('student_id', studentId)
  if (error) throw error
  return data || []
}

// Not atomic — read-modify-write. Fine for MVP since a student only watches
// from one tab at a time.
export async function incrementPartView({ student_id, video_id, part_id }) {
  const { data: existing, error: readErr } = await supabase
    .from('video_progress')
    .select('views_used')
    .eq('student_id', student_id)
    .eq('part_id', part_id)
    .maybeSingle()
  if (readErr) throw readErr

  const views_used = (existing?.views_used || 0) + 1
  const { data, error } = await supabase
    .from('video_progress')
    .upsert(
      {
        student_id,
        video_id,
        part_id,
        views_used,
        last_watched_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,part_id' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

// Persist watched seconds for a part, monotonically — we only ever raise
// the stored value, so scrubbing backwards or rewatching doesn't lose
// progress. Throttled at the call site (every ~5s while playing).
export async function updatePartProgress({ student_id, video_id, part_id, seconds }) {
  const secs = Math.max(0, Math.floor(seconds || 0))
  const { data: existing } = await supabase
    .from('video_progress')
    .select('seconds_watched')
    .eq('student_id', student_id)
    .eq('part_id', part_id)
    .maybeSingle()

  const prev = existing?.seconds_watched || 0
  if (secs <= prev) return existing  // never lower

  const { data, error } = await supabase
    .from('video_progress')
    .upsert(
      {
        student_id,
        video_id,
        part_id,
        seconds_watched: secs,
        last_watched_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,part_id' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}
