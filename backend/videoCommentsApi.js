import { supabase } from './supabase'

/**
 * Fetch comments for a specific video.
 * Joins with the `public_profiles` view to fetch the commenter's name, role, and avatar.
 */
export async function listComments(videoId) {
  if (!videoId) throw new Error('مطلوب معرف الفيديو')
  
  const { data, error } = await supabase
    .from('video_comments')
    .select(`
      id,
      video_id,
      profile_id,
      content,
      parent_id,
      created_at,
      author:public_profiles(
        name,
        role,
        avatar_url
      )
    `)
    .eq('video_id', videoId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching comments:', error)
    throw error
  }
  return data || []
}

/**
 * Post a new comment or reply to an existing comment.
 * Note: profile_id is validated against auth.uid() inside Supabase RLS.
 */
export async function createComment({ videoId, content, parentId, profileId }) {
  if (!videoId) throw new Error('مطلوب معرف الفيديو')
  if (!content || !content.trim()) throw new Error('محتوى التعليق لا يمكن أن يكون فارغاً')
  if (!profileId) throw new Error('مطلوب معرف المستخدم')

  const { data, error } = await supabase
    .from('video_comments')
    .insert({
      video_id: videoId,
      content: content.trim(),
      parent_id: parentId || null,
      profile_id: profileId
    })
    .select(`
      id,
      video_id,
      profile_id,
      content,
      parent_id,
      created_at,
      author:public_profiles(
        name,
        role,
        avatar_url
      )
    `)
    .single()

  if (error) {
    console.error('Error creating comment:', error)
    throw error
  }
  return data
}

/**
 * Delete a comment.
 * Will succeed only if the user is the comment owner or an admin (enforced by RLS).
 */
export async function deleteComment(commentId) {
  if (!commentId) throw new Error('مطلوب معرف التعليق')

  const { error } = await supabase
    .from('video_comments')
    .delete()
    .eq('id', commentId)

  if (error) {
    console.error('Error deleting comment:', error)
    throw error
  }
  return true
}
