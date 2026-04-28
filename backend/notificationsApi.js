import { supabase } from './supabase'

/* DB-backed notifications (replaces the old localStorage version).
   RLS filters rows for students automatically, so students only ever see
   notifications that actually target them. Admins see everything. */

export async function listNotifications({ limit = 50 } = {}) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, message, level, scope, target_grade, target_group, target_student, meta, created_by, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

/* Per-user read state. We return just the ids the user has marked read. */
export async function listMyReadIds(userId) {
  if (!userId) return []
  const { data, error } = await supabase
    .from('notification_reads')
    .select('notification_id')
    .eq('user_id', userId)
  if (error) throw error
  return (data || []).map((r) => r.notification_id)
}

export async function markRead(notificationId, userId) {
  if (!userId) return
  // Upsert-style — ignore conflict so double-marking is a no-op.
  const { error } = await supabase
    .from('notification_reads')
    .upsert(
      { notification_id: notificationId, user_id: userId },
      { onConflict: 'notification_id,user_id', ignoreDuplicates: true }
    )
  if (error && error.code !== '23505') throw error
}

export async function markAllRead(notificationIds, userId) {
  if (!userId || !notificationIds.length) return
  const rows = notificationIds.map((id) => ({ notification_id: id, user_id: userId }))
  const { error } = await supabase
    .from('notification_reads')
    .upsert(rows, { onConflict: 'notification_id,user_id', ignoreDuplicates: true })
  if (error && error.code !== '23505') throw error
}

/* Admin-only: create a notification targeted at one of {all, one grade,
   one group, one student}. Exactly one of target_grade / target_group /
   target_student is set depending on scope. target_group is the literal
   "<grade>:<group>" composite — same convention as access_overrides. */
export async function createNotification({
  title,
  message = '',
  level = 'info',
  scope,                 // 'all' | 'grade' | 'group' | 'student'
  targetGrade = null,    // when scope='grade'
  targetGroup = null,    // when scope='group' — "<grade>:<group>"
  targetStudent = null,  // when scope='student'
  meta = {},
  createdBy = null,
}) {
  const payload = {
    title,
    message,
    level,
    scope,
    target_grade:   scope === 'grade'   ? targetGrade   : null,
    target_group:   scope === 'group'   ? targetGroup   : null,
    target_student: scope === 'student' ? targetStudent : null,
    meta,
    created_by: createdBy,
  }
  const { data, error } = await supabase
    .from('notifications')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteNotification(id) {
  const { error } = await supabase.from('notifications').delete().eq('id', id)
  if (error) throw error
}
