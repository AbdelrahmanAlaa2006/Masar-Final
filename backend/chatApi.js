import { supabase } from './supabase'

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
      student:profiles!chat_messages_student_id_fkey(
        id,
        name,
        avatar_url,
        phone
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error listing chats overview:', error)
    throw error
  }

  // Process in memory to get unique threads
  const map = new Map()
  for (const msg of (data || [])) {
    const sid = msg.student_id
    if (!map.has(sid)) {
      map.set(sid, {
        student: msg.student,
        latestMessage: msg,
        unreadCount: 0
      })
    }
    // Increment unread count for teacher if message is from the student
    if (!msg.is_read && msg.sender_id === sid) {
      map.get(sid).unreadCount += 1
    }
  }

  return Array.from(map.values())
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
