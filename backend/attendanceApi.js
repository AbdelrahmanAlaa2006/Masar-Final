import { supabase } from './supabase'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../src/utils/cache'
import { queueNotification } from './unifiedNotificationsApi'
import { renderNotificationTemplate, getGradeUiLabel } from './whatsappTemplates'

// Fetch sessions for a grade, optionally filtered by branch
export async function listAttendanceSessions(grade, branchId = null) {
  let query = supabase
    .from('attendance_sessions')
    .select(`
      id,
      title,
      date,
      group_id,
      branch_id,
      academic_year_id,
      grade,
      groups ( name, grade )
    `)
    .eq('grade', grade)
  
  if (branchId) {
    query = query.eq('branch_id', branchId)
  }

  const { data, error } = await query.order('date', { ascending: false })
  if (error) throw error

  return data || []
}

// Create a new attendance session
export async function createAttendanceSession({ title, date, branchId, academicYearId, groupId, grade, createdBy }) {
  const { data, error } = await supabase
    .from('attendance_sessions')
    .insert({
      title,
      date,
      branch_id: branchId || null,
      academic_year_id: academicYearId || null,
      group_id: groupId || null,
      grade,
      created_by: createdBy
    })
    .select()
    .single()

  if (error) throw error
  invalidateCache('attendance-sessions-list')
  return data
}

// Get attendance for a class on a specific date/session
export async function listAttendanceForSession(sessionId, dateStr = null) {
  let query = supabase.from('attendance_records').select(`
    id,
    student_id,
    status,
    session_id,
    notes,
    profiles:student_id (
      id,
      name,
      phone,
      grade,
      "group",
      parent_phone
    )
  `)

  if (sessionId) {
    query = query.eq('session_id', sessionId)
  } else if (dateStr) {
    // If no sessionId, find session matching dateStr
    const { data: sessions } = await supabase
      .from('attendance_sessions')
      .select('id')
      .eq('date', dateStr)
    
    if (sessions && sessions.length > 0) {
      query = query.in('session_id', sessions.map(s => s.id))
    } else {
      return []
    }
  } else {
    return []
  }

  const { data, error } = await query
  if (error) throw error

  // Format to match expected legacy keys if needed
  return (data || []).map(r => ({
    id: r.id,
    student_id: r.student_id,
    status: r.status,
    session_id: r.session_id,
    notes: r.notes,
    profiles: r.profiles
  }))
}

// Bulk save attendance records using RPC (avoiding N+1 queries)
export async function saveAttendanceBatch(records, sessionTitle = '') {
  if (!records || records.length === 0) return []

  // Step 1: Format for save_attendance_batch_v2 RPC
  const payload = records.map(r => ({
    student_id: r.student_id,
    session_id: r.session_id,
    status: r.status,
    notes: r.notes || null,
    created_by: r.created_by || null
  }))

  const { error: rpcError } = await supabase.rpc('save_attendance_batch_v2', {
    p_records: payload
  })

  if (rpcError) throw rpcError

  // Invalidate attendance caches
  records.forEach(r => {
    invalidateCache(`attendance-summary:${r.student_id}`)
    invalidateCache(`attendance-history:${r.student_id}`)
  })

  // Fetch updated records first to obtain the database-generated attendance_records IDs
  const sessionIds = [...new Set(records.map(r => r.session_id))]
  const { data: updatedRecords } = await supabase
    .from('attendance_records')
    .select('*')
    .in('session_id', sessionIds)

  const activeRecords = updatedRecords || []

  // Step 2: Queue notifications for absent/late students using the unified queue (idempotent)
  let tenant = null
  let groupName = ''
  const profilesMap = new Map()
  if (records.length > 0) {
    try {
      const studentIds = records.map(r => r.student_id)
      const { data: profilesList } = await supabase
        .from('profiles')
        .select('id, tenant_id, grade, "group"')
        .in('id', studentIds)
      
      if (profilesList && profilesList.length > 0) {
        profilesList.forEach(p => profilesMap.set(p.id, p))
        
        const tenantId = profilesList[0].tenant_id
        if (tenantId) {
          const { data: tenantData } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', tenantId)
            .maybeSingle()
          tenant = tenantData
        }
      }
    } catch (err) {
      console.error('Failed to fetch profiles/tenant configuration for attendance template:', err)
    }

    try {
      if (sessionIds.length > 0) {
        const { data: sessionData } = await supabase
          .from('attendance_sessions')
          .select('group_id, groups(name)')
          .eq('id', sessionIds[0])
          .maybeSingle()
        groupName = sessionData?.groups?.name || ''
      }
    } catch (err) {
      console.error('Failed to fetch group details for attendance template:', err)
    }
  }

  const notifPromises = records.map(async (r) => {
    // Find the database record row
    const recordRow = activeRecords.find(ur => ur.student_id === r.student_id && ur.session_id === r.session_id)
    if (!recordRow) return

    const attendanceRecordId = recordRow.id

    // A. If student status is 'present' or 'excused':
    // Clear any pending/unprocessed WhatsApp notifications for this attendance entry.
    if (r.status === 'present' || r.status === 'excused') {
      try {
        await supabase
          .from('unified_notifications')
          .delete()
          .eq('attendance_record_id', attendanceRecordId)
          .eq('status->>whatsapp', 'pending')
      } catch (err) {
        console.error('Failed to clear pending notifications on attendance update:', err)
      }
      return
    }

    // B. If student status is 'absent' or 'late':
    if (r.parent_phone && r.parent_phone.trim() !== '') {
      let type = ''
      if (r.status === 'absent') {
        type = 'attendance_absent'
      } else if (r.status === 'late') {
        type = 'attendance_makeup'
      }

      if (type) {
        try {
          // Check if a notification already exists for this attendance record and type
          const { data: existing } = await supabase
            .from('unified_notifications')
            .select('id')
            .eq('attendance_record_id', attendanceRecordId)
            .eq('type', type)
            .maybeSingle()

          if (existing) {
            // Already exists (either pending, sent, or failed). Do not duplicate!
            return
          }

          // If they changed status between absent and late, there might be a pending notification of the OTHER type.
          // Delete it first so we don't dispatch both.
          const otherType = type === 'attendance_absent' ? 'attendance_makeup' : 'attendance_absent'
          await supabase
            .from('unified_notifications')
            .delete()
            .eq('attendance_record_id', attendanceRecordId)
            .eq('type', otherType)
            .eq('status->>whatsapp', 'pending')

          const studentProfile = profilesMap.get(r.student_id)
          const gradeLabel = getGradeUiLabel(studentProfile?.grade)
          const groupLabel = studentProfile?.group || groupName || ''
          const groupNameResolved = [gradeLabel, groupLabel].filter(Boolean).join(' - ')

          // Render template dynamically
          const payload = {
            student_name: r.student_name,
            lesson_name: sessionTitle || 'الدرس',
            group_name: groupNameResolved || 'العامة',
            date: new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }),
            day_name: new Date().toLocaleDateString('ar-EG', { weekday: 'long' }),
            attendance_status: r.status === 'absent' ? 'تغيب' : 'حضر متأخراً'
          }

          const renderedMessage = await renderNotificationTemplate({
            tenant,
            notification_type: type,
            locale: 'ar-EG',
            payload
          })

          // Queue the new notification linked to this attendance record
          await queueNotification({
            studentId: r.student_id,
            title: 'تنبيه الحضور والغياب',
            message: renderedMessage,
            type,
            channels: ['whatsapp', 'portal'],
            createdBy: r.created_by,
            attendanceRecordId
          })
        } catch (notifErr) {
          console.error('Failed to queue unified notification for student:', r.student_id, notifErr)
        }
      }
    }
  })

  await Promise.all(notifPromises)

  return activeRecords
}

// Get optimized attendance statistics for a single student (cached to reduce Supabase queries)
export async function getStudentAttendanceSummary(studentId) {
  if (!studentId) return null
  return cached(`attendance-summary:${studentId}`, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('status')
      .eq('student_id', studentId)

    if (error) throw error

    let present = 0
    let absent = 0
    let late = 0
    let excused = 0

    data.forEach(r => {
      if (r.status === 'present') present++
      else if (r.status === 'absent') absent++
      else if (r.status === 'late') late++
      else if (r.status === 'excused') excused++
    })

    const totalSessions = present + absent + late
    const attended = present + late
    // No sessions marked yet → percentage is unknown, not 100%.
    const attendancePercentage = totalSessions > 0
      ? Math.round((attended / totalSessions) * 100)
      : null

    return {
      present,
      absent,
      late,
      excused,
      attended,
      totalSessions,
      attendancePercentage,
      totalMarked: totalSessions + excused
    }
  })
}

// Get student's detailed attendance history
export async function getStudentAttendanceHistory(studentId) {
  if (!studentId) return []
  return cached(`attendance-history:${studentId}`, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('attendance_records')
      .select(`
        id,
        status,
        session_id,
        attendance_sessions (
          title,
          date
        )
      `)
      .eq('student_id', studentId)

    if (error) throw error
    
    // Map to structure expected by client UI
    return (data || []).map(r => ({
      id: r.id,
      date: r.attendance_sessions?.date || '—',
      status: r.status,
      session_id: r.session_id,
      homeworks: {
        title: r.attendance_sessions?.title || 'حصة دراسية'
      }
    })).sort((a, b) => new Date(b.date) - new Date(a.date))
  })
}

// Get list of unique dates where attendance has been saved for this grade
export async function listCustomAttendanceDates(grade) {
  const { data, error } = await supabase
    .from('attendance_sessions')
    .select('date')
  
  if (error) throw error

  const filtered = (data || []).map(r => r.date)
  return [...new Set(filtered)].sort((a, b) => new Date(b) - new Date(a))
}

// Delete an attendance session and clear related caches
export async function deleteAttendanceSession(sessionId) {
  if (!sessionId) return null

  // 1. Fetch student IDs associated with this session to invalidate their caches
  const { data: records, error: fetchError } = await supabase
    .from('attendance_records')
    .select('student_id')
    .eq('session_id', sessionId)

  if (fetchError) console.error('Error fetching student IDs for session cache invalidation:', fetchError)

  // 2. Delete the session (which deletes attendance_records via cascade)
  const { data, error } = await supabase
    .from('attendance_sessions')
    .delete()
    .eq('id', sessionId)
    .select()

  if (error) throw error

  // 3. Invalidate caches
  invalidateCache('attendance-sessions-list')
  if (records && records.length > 0) {
    records.forEach(r => {
      invalidateCache(`attendance-summary:${r.student_id}`)
      invalidateCache(`attendance-history:${r.student_id}`)
    })
  }

  return data
}

// Rebuild and send WhatsApp notifications for a past attendance session
export async function rebuildAndSendAttendanceNotifications(sessionId, tenantId, createdBy = null) {
  if (!sessionId || !tenantId) {
    throw new Error('Session ID and tenant ID are required')
  }

  // 1. Fetch all attendance records in this session
  const { data: records, error: fetchError } = await supabase
    .from('attendance_records')
    .select('id, student_id, status, attendance_sessions(title, date, group_id)')
    .eq('session_id', sessionId)

  if (fetchError) throw fetchError
  if (!records || records.length === 0) return 0

  const attendanceRecordIds = records.map(r => r.id)
  const studentIds = records.map(r => r.student_id)

  // 2. Fetch profiles of all students
  const { data: profilesList, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, phone, parent_phone, grade, "group"')
    .in('id', studentIds)

  if (profileError) throw profileError
  const profilesMap = new Map((profilesList || []).map(p => [p.id, p]))

  // 3. Fetch tenant config
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single()

  if (tenantError || !tenant) {
    throw new Error('Failed to load tenant configuration: ' + (tenantError?.message || 'Tenant not found'))
  }

  // 4. Fetch all existing notifications for these attendance records to identify sent, failed, or pending status
  const { data: existingNotifs, error: notifFetchError } = await supabase
    .from('unified_notifications')
    .select('id, attendance_record_id, status')
    .in('attendance_record_id', attendanceRecordIds)

  if (notifFetchError) throw notifFetchError

  const hasSentOrFailed = new Set()
  const pendingNotifIdsToDelete = []

  if (existingNotifs) {
    existingNotifs.forEach(notif => {
      const whatsappStatus = notif.status?.whatsapp || 'pending'
      if (whatsappStatus === 'sent' || whatsappStatus === 'failed') {
        hasSentOrFailed.add(notif.attendance_record_id)
      } else if (whatsappStatus === 'pending') {
        pendingNotifIdsToDelete.push(notif.id)
      }
    })
  }

  // 5. Delete only the PENDING notifications related to this session
  if (pendingNotifIdsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('unified_notifications')
      .delete()
      .in('id', pendingNotifIdsToDelete)

    if (deleteError) throw deleteError
  }

  // 6. Generate and insert new notifications for students who haven't received them yet
  const notificationsToInsert = []

  for (const r of records) {
    if (r.status !== 'absent' && r.status !== 'late') {
      continue // Skip present or excused students
    }
    if (hasSentOrFailed.has(r.id)) {
      continue // Keep sent and failed states untouched
    }

    const profile = profilesMap.get(r.student_id)
    const recipientPhone = profile?.parent_phone || profile?.phone
    if (!recipientPhone || recipientPhone.trim() === '') {
      continue
    }

    const gradeLabel = getGradeUiLabel(profile?.grade)
    const groupLabel = profile?.group || ''
    const groupNameResolved = [gradeLabel, groupLabel].filter(Boolean).join(' - ')

    const sessionTitle = r.attendance_sessions?.title || 'الدرس'
    const dateObj = new Date(r.attendance_sessions?.date)

    // Construct structured payload variables
    const payload = {
      student_name: profile?.name || '',
      session_title: sessionTitle,
      lesson_name: groupNameResolved || 'العامة',
      date: dateObj.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }),
      day_name: dateObj.toLocaleDateString('ar-EG', { weekday: 'long' }),
      attendance_status: r.status === 'absent' ? 'تغيب' : 'حضر متأخراً'
    }

    const type = r.status === 'absent' ? 'attendance_absent' : 'attendance_makeup'

    try {
      const renderedMessage = await renderNotificationTemplate({
        tenant,
        notification_type: type,
        locale: 'ar-EG',
        payload
      })

      notificationsToInsert.push({
        tenant_id: tenantId,
        student_id: r.student_id,
        title: 'تنبيه الحضور والغياب',
        message: renderedMessage,
        type,
        channels: ['whatsapp', 'portal'],
        status: { whatsapp: 'pending', portal: 'pending' },
        created_by: createdBy || null,
        attendance_record_id: r.id,
        recipient_phone: recipientPhone
      })
    } catch (renderErr) {
      console.error(`Failed to render template during rebuild for student ${r.student_id}:`, renderErr)
    }
  }

  if (notificationsToInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('unified_notifications')
      .insert(notificationsToInsert)

    if (insertError) throw insertError
  }

  return notificationsToInsert.length
}

