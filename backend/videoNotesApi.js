import { supabase } from './supabase'

/**
 * Fetch notes for a specific video part, created by the current user.
 */
export async function listNotes(partId) {
  if (!partId) throw new Error('مطلوب معرف الجزء')

  const { data, error } = await supabase
    .from('video_notes')
    .select(`
      id,
      video_id,
      part_id,
      content,
      timestamp_seconds,
      created_at
    `)
    .eq('part_id', partId)
    .order('timestamp_seconds', { ascending: true })

  if (error) {
    console.error('Error fetching video notes:', error)
    throw error
  }
  return data || []
}

/**
 * Add a new private note for a video part.
 */
export async function createNote({ videoId, partId, content, timestampSeconds, profileId }) {
  if (!videoId) throw new Error('مطلوب معرف الفيديو')
  if (!partId) throw new Error('مطلوب معرف الجزء')
  if (!content || !content.trim()) throw new Error('محتوى الملاحظة لا يمكن أن يكون فارغاً')
  if (timestampSeconds === undefined || timestampSeconds === null) throw new Error('مطلوب تحديد وقت الملاحظة')
  if (!profileId) throw new Error('مطلوب معرف المستخدم')

  const { data, error } = await supabase
    .from('video_notes')
    .insert({
      video_id: videoId,
      part_id: partId,
      content: content.trim(),
      timestamp_seconds: timestampSeconds,
      profile_id: profileId
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating video note:', error)
    throw error
  }
  return data
}

/**
 * Delete a private note.
 */
export async function deleteNote(noteId) {
  if (!noteId) throw new Error('مطلوب معرف الملاحظة')

  const { error } = await supabase
    .from('video_notes')
    .delete()
    .eq('id', noteId)

  if (error) {
    console.error('Error deleting video note:', error)
    throw error
  }
  return true
}
