import { supabase } from './supabase'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../src/utils/cache'
import { queueNotification } from './unifiedNotificationsApi'

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
      groups ( name, grade )
    `)
  
  if (branchId) {
    query = query.eq('branch_id', branchId)
  }

  const { data, error } = await query.order('date', { ascending: false })
  if (error) throw error

  // Filter by grade client-side or from joined groups grade
  return (data || []).filter(s => !s.groups || s.groups.grade === grade)
}

// Create a new attendance session
export async function createAttendanceSession({ title, date, branchId, academicYearId, groupId, createdBy }) {
  const { data, error } = await supabase
    .from('attendance_sessions')
    .insert({
      title,
      date,
      branch_id: branchId || null,
      academic_year_id: academicYearId || null,
      group_id: groupId || null,
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

  // Step 2: Queue notifications for absent/late students using the unified queue
  const dateLabel = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  
  const notifPromises = records.map(async (r) => {
    if (r.parent_phone && r.parent_phone.trim() !== '') {
      let message = ''
      let type = ''
      if (r.status === 'absent') {
        message = `نود إعلامكم بأن الطالب(ة) ${r.student_name} غاب اليوم ${dateLabel} عن حضور حصة ${sessionTitle || 'الدرس'}.`
        type = 'attendance_absent'
      } else if (r.status === 'late') {
        message = `نود إعلامكم بأن الطالب(ة) ${r.student_name} حضر اليوم متأخراً عن حصة ${sessionTitle || 'الدرس'}.`
        type = 'attendance_makeup' // or mapping to similar type
      }

      if (message && type) {
        try {
          await queueNotification({
            studentId: r.student_id,
            title: 'تنبيه الحضور والغياب',
            message,
            type,
            channels: ['whatsapp', 'portal'],
            createdBy: r.created_by
          })
        } catch (notifErr) {
          console.error('Failed to queue unified notification for student:', r.student_id, notifErr)
        }
      }
    }
  })

  await Promise.all(notifPromises)

  // Fetch updated records to return
  const sessionIds = [...new Set(records.map(r => r.session_id))]
  const { data: updatedRecords } = await supabase
    .from('attendance_records')
    .select('*')
    .in('session_id', sessionIds)

  return updatedRecords || []
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

    const totalMarked = present + absent + late
    const attendancePercentage = totalMarked > 0 
      ? Math.round(((present + late) / totalMarked) * 100) 
      : 100

    return {
      present,
      absent,
      late,
      excused,
      attendancePercentage,
      totalMarked: totalMarked + excused
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
