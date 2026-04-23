import { supabase } from './supabase'

// List all videos (admins see all, students see only their grade via RLS) with
// their parts embedded. Parts are sorted by part_index.
export async function listVideos() {
  const { data, error } = await supabase
    .from('videos')
    .select(`
      id, title, description, grade, duration_minutes,
      view_limit, active_hours, expiry_at, quizzes, created_at,
      video_parts ( id, part_index, title, youtube_url, duration_minutes )
    `)
    .order('created_at', { ascending: false })
  if (error) throw error
  const rows = data || []
  for (const v of rows) {
    v.video_parts = (v.video_parts || []).sort((a, b) => a.part_index - b.part_index)
  }
  return rows
}

// Create a video + its parts. Quizzes live in the videos.quizzes JSONB column.
export async function createVideo(input) {
  const activeHours = parseInt(input.active_hours) || 24
  const expiry_at = new Date(Date.now() + activeHours * 3600 * 1000).toISOString()

  const videoPayload = {
    title: input.title,
    description: input.description || null,
    grade: input.grade,
    duration_minutes: input.duration_minutes ? parseInt(input.duration_minutes) : null,
    view_limit: parseInt(input.view_limit) || 3,
    active_hours: activeHours,
    expiry_at,
    quizzes: input.quizzes || [],
    created_by: input.created_by || null,
  }

  const { data: video, error } = await supabase
    .from('videos')
    .insert(videoPayload)
    .select()
    .single()
  if (error) throw error

  if (Array.isArray(input.parts) && input.parts.length) {
    const rows = input.parts.map((p, i) => ({
      video_id: video.id,
      part_index: i,
      title: p.title,
      youtube_url: p.youtube_url,
      duration_minutes: p.duration_minutes ? parseInt(p.duration_minutes) : null,
    }))
    const { error: partsErr } = await supabase.from('video_parts').insert(rows)
    if (partsErr) {
      // best-effort rollback so we don't leave a headless video row
      await supabase.from('videos').delete().eq('id', video.id)
      throw partsErr
    }
  }
  return video
}

export async function deleteVideo(id) {
  const { error } = await supabase.from('videos').delete().eq('id', id)
  if (error) throw error
}
