import { supabase } from './supabase'
import { fetchAllRows } from './fetchAllRows'

/**
 * Fetch chat messages for a specific student.
 * Joins with `public_profiles` to fetch the sender's display metadata.
 */
export async function listChatMessages(studentId) {
  if (!studentId) throw new Error('مطلوب معرف الطالب')
  
  const { data, error } = await supabase
    .from('chat_messages')
    .select(`
      id,
      student_id,
      sender_id,
      content,
      file_url,
      file_type,
      is_read,
      created_at,
      sender:public_profiles!sender_id(
        name,
        role,
        avatar_url
      )
    `)
    .eq('student_id', studentId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error listing chat messages:', error)
    throw error
  }
  return data || []
}

/**
 * Lightweight unread-count for a student's own thread — badge only.
 * A head-only COUNT of admin→student messages still unread. Lets the floating
 * widget keep its badge fresh while CLOSED without downloading the whole
 * message list every poll (the list is only needed when the window is open).
 * Matches the client-side rule: not sent by the student AND is_read = false.
 */
export async function countUnreadForStudent(studentId) {
  if (!studentId) return 0
  const { count, error } = await supabase
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('is_read', false)
    .neq('sender_id', studentId)
  if (error) {
    console.error('Error counting unread chat:', error)
    return 0
  }
  return count || 0
}

/**
 * Send a new chat message.
 */
export async function sendChatMessage({ studentId, content, fileUrl, fileType, senderId }) {
  if (!studentId) throw new Error('مطلوب معرف الطالب')
  if (!senderId) throw new Error('مطلوب معرف المرسل')
  if (!content && !fileUrl) throw new Error('محتوى الرسالة لا يمكن أن يكون فارغاً')

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      student_id: studentId,
      sender_id: senderId,
      content: content || null,
      file_url: fileUrl || null,
      file_type: fileType || null,
      is_read: false
    })
    .select(`
      id,
      student_id,
      sender_id,
      content,
      file_url,
      file_type,
      is_read,
      created_at,
      sender:public_profiles!sender_id(
        name,
        role,
        avatar_url
      )
    `)
    .single()

  if (error) {
    console.error('Error sending chat message:', error)
    throw error
  }
  return data
}

/**
 * Fetch all chat threads overview. (Admin only)
 * Groups messages by student and calculates unread count.
 */
export async function listChatsOverview() {
  // One row per conversation, built in the database (list_chat_threads).
  // This used to download every chat message ever sent just to keep the
  // latest one per student: the transfer grew forever, and past 1000
  // messages older conversations dropped out of the list.
  let threads = []
  try {
    threads = await fetchAllRows(() => supabase
      .rpc('list_chat_threads')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true }))
  } catch (error) {
    console.error('Error listing chats overview:', error)
    throw error
  }

  return threads.map(t => ({
    student: t.student_name == null && t.student_phone == null
      ? null
      : { id: t.student_id, name: t.student_name, avatar_url: t.student_avatar_url, phone: t.student_phone },
    latestMessage: {
      id: t.id,
      student_id: t.student_id,
      sender_id: t.sender_id,
      content: t.content,
      file_url: t.file_url,
      file_type: t.file_type,
      is_read: t.is_read,
      created_at: t.created_at,
      student: t.student_name == null && t.student_phone == null
        ? null
        : { id: t.student_id, name: t.student_name, avatar_url: t.student_avatar_url, phone: t.student_phone },
    },
    unreadCount: Number(t.unread_count) || 0,
  }))
}

/**
 * Mark messages in a thread as read.
 * If role is 'admin', marks student's messages as read.
 * If role is 'student', marks admin's messages as read.
 */
export async function markMessagesAsRead(studentId, role) {
  if (!studentId) throw new Error('مطلوب معرف الطالب')

  let query = supabase
    .from('chat_messages')
    .update({ is_read: true })
    .eq('student_id', studentId)
    .eq('is_read', false)

  if (role === 'admin') {
    // Admin reading: mark student's sent messages as read
    query = query.eq('sender_id', studentId)
  } else {
    // Student reading: mark admin's replies as read
    query = query.neq('sender_id', studentId)
  }

  const { error } = await query
  if (error) {
    console.error('Error marking messages as read:', error)
    throw error
  }
  return true
}

/**
 * Delete all chat messages for a specific student.
 */
export async function clearChatMessages(studentId) {
  if (!studentId) throw new Error('مطلوب معرف الطالب')

  const { error } = await supabase
    .from('chat_messages')
    .delete()
    .eq('student_id', studentId)

  if (error) {
    console.error('Error clearing chat messages:', error)
    throw error
  }
  return true
}

