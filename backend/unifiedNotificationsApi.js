import { supabase } from './supabase'

export async function listNotificationsForStudent(studentId) {
  const { data, error } = await supabase
    .from('unified_notifications')
    .select('id, title, message, type, created_at')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function queueNotification({ studentId, title, message, type, channels, createdBy }) {
  const statusMap = {}
  channels.forEach(ch => {
    statusMap[ch] = 'pending'
  })

  const { data, error } = await supabase
    .from('unified_notifications')
    .insert({
      student_id: studentId || null,
      title,
      message,
      type,
      channels,
      status: statusMap,
      created_by: createdBy || null
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateNotificationStatus(id, channel, status, errorMsg = '') {
  // Read current row status first to preserve other channels
  const { data: row, error: fetchError } = await supabase
    .from('unified_notifications')
    .select('status')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) throw fetchError

  const updatedStatus = { ...(row?.status || {}) }
  updatedStatus[channel] = status
  if (errorMsg) {
    updatedStatus[channel + '_error'] = errorMsg
  }

  const { data, error } = await supabase
    .from('unified_notifications')
    .update({ status: updatedStatus })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listPendingNotifications(channel) {
  // Select rows where status->>channel = 'pending'
  const { data, error } = await supabase
    .from('unified_notifications')
    .select(`
      id,
      student_id,
      title,
      message,
      type,
      status,
      created_at,
      profiles:student_id ( name, parent_phone, phone )
    `)
  
  if (error) throw error

  // Filter rows client-side or build Postgres query
  // For safety, filter where row.status[channel] === 'pending'
  return (data || []).filter(row => row.status && row.status[channel] === 'pending')
}
