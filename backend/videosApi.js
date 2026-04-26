import { supabase } from './supabase'

// List all videos (admins see all, students see only their grade via RLS) with
// their parts embedded. Parts are sorted by part_index. We still select the
// legacy `youtube_url` column so older rows keep working; new writes put the
// id in `youtube_id`.
export async function listVideos() {
  const { data, error } = await supabase
    .from('videos')
    .select(`
      id, title, description, grade,
      active_hours, expiry_at, quizzes, created_at,
      video_parts (
        id, part_index, title,
        source, youtube_id, youtube_url, drive_id, duration_seconds,
        view_limit
      )
    `)
    .order('created_at', { ascending: false })
  if (error) throw error
  const rows = data || []
  for (const v of rows) {
    v.video_parts = (v.video_parts || []).sort((a, b) => a.part_index - b.part_index)
    // Back-compat: if an old row only has youtube_url, derive the id here.
    for (const p of v.video_parts) {
      if (!p.youtube_id && p.youtube_url) {
        p.youtube_id = extractYouTubeId(p.youtube_url)
      }
    }
  }
  return rows
}

function extractYouTubeId(s) {
  if (!s) return ''
  const t = String(s).trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(t)) return t
  try {
    const u = new URL(t)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') return u.pathname.slice(1, 12)
    if (host.endsWith('youtube.com')) {
      if (u.pathname === '/watch') return (u.searchParams.get('v') || '').slice(0, 11)
      const m = u.pathname.match(/\/(embed|shorts|v)\/([a-zA-Z0-9_-]{11})/)
      if (m) return m[2]
    }
  } catch {}
  return ''
}

// Create a video + its parts. Quizzes live in the videos.quizzes JSONB column.
// Duration + view-limit are intentionally NOT part of the MVP input — the
// player reads real duration at watch time and there's no view limit.
export async function createVideo(input) {
  const activeHours = parseInt(input.active_hours) || 24
  const expiry_at = new Date(Date.now() + activeHours * 3600 * 1000).toISOString()

  const videoPayload = {
    title: input.title,
    description: input.description || null,
    grade: input.grade,
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
    const rows = input.parts.map((p, i) => {
      const source = p.source === 'drive' ? 'drive' : 'youtube'
      return {
        video_id: video.id,
        part_index: i,
        title: p.title,
        source,
        // YouTube fields populated only when source = 'youtube'.
        youtube_id: source === 'youtube'
          ? (p.youtube_id || extractYouTubeId(p.youtube_url || ''))
          : null,
        // Drive fields populated only when source = 'drive'.
        drive_id: source === 'drive' ? (p.drive_id || null) : null,
        duration_seconds: source === 'drive' && p.duration_seconds
          ? Math.max(1, parseInt(p.duration_seconds, 10) || 0) || null
          : null,
        // null = unlimited views; otherwise the per-part default cap.
        view_limit: p.view_limit == null || p.view_limit === ''
          ? null
          : Math.max(1, Math.min(99, parseInt(p.view_limit, 10) || 1)),
      }
    })
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

/* Admin: change a video's availability window after the fact. We both
   store the new `active_hours` (for display / future recomputes) and
   push the `expiry_at` forward by recomputing `created_at + hours`. */
export async function updateVideoAvailability(videoId, hours) {
  const h = Math.max(1, parseInt(hours, 10) || 1)
  // Fetch created_at so expiry_at stays consistent with the original anchor.
  const { data: row, error: getErr } = await supabase
    .from('videos')
    .select('created_at')
    .eq('id', videoId)
    .single()
  if (getErr) throw getErr
  const anchor = new Date(row.created_at).getTime()
  const expiry_at = new Date(anchor + h * 3600 * 1000).toISOString()

  const { data, error } = await supabase
    .from('videos')
    .update({ active_hours: h, expiry_at })
    .eq('id', videoId)
    .select('id, active_hours, expiry_at, created_at')
    .single()
  if (error) throw error
  return data
}
