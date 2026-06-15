import { supabase } from './supabase'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../src/utils/cache'

// Get attendance for a class on a specific date/session
export async function listAttendanceForSession(sessionId, dateStr) {
  let query = supabase.from('attendance').select('id, student_id, status, session_id, date')
  if (sessionId) {
    query = query.eq('session_id', sessionId)
  } else if (dateStr) {
    query = query.eq('date', dateStr)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

// Bulk save attendance records and automatically queue parent notifications for absent students
export async function saveAttendanceBatch(records, sessionTitle = '') {
  if (!records || records.length === 0) return []

  const studentIds = records.map(r => r.student_id)
  
  // Step 1: Fetch existing attendance for these students in this tenant
  const { data: existing, error: fetchError } = await supabase
    .from('attendance')
    .select('id, student_id, session_id, date')
    .in('student_id', studentIds)
  
  if (fetchError) throw fetchError

  const toInsert = []
  const toUpdate = []
  const results = []

  records.forEach(r => {
    // Find matching record by session_id, or by date if session_id is null
    const match = existing?.find(e => 
      e.student_id === r.student_id && 
      (r.session_id 
        ? e.session_id === r.session_id 
        : (e.session_id === null && e.date === r.date)
      )
    )

    const row = {
      student_id: r.student_id,
      session_id: r.session_id || null,
      date: r.date,
      status: r.status,
      created_by: r.created_by || null,
    }

    if (match) {
      toUpdate.push({ id: match.id, ...row })
    } else {
      toInsert.push(row)
    }
  })

  // Perform bulk inserts
  if (toInsert.length > 0) {
    const { data: insData, error: insError } = await supabase
      .from('attendance')
      .insert(toInsert)
      .select()
    
    if (insError) throw insError
    if (insData) results.push(...insData)
  }

  // Perform updates in parallel
  if (toUpdate.length > 0) {
    const updatePromises = toUpdate.map(async (row) => {
      const { data: updData, error: updError } = await supabase
        .from('attendance')
        .update({ status: row.status, created_by: row.created_by })
        .eq('id', row.id)
        .select()
      
      if (updError) throw updError
      return updData ? updData[0] : null
    })

    const updatedRows = await Promise.all(updatePromises)
    results.push(...updatedRows.filter(Boolean))
  }

  // Invalidate attendance caches
  records.forEach(r => {
    invalidateCache(`attendance-summary:${r.student_id}`)
    invalidateCache(`attendance-history:${r.student_id}`)
  })

  // Step 2: Queue notifications for absent/late students if parent phone is present
  const notifications = []
  const dateLabel = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  
  records.forEach(r => {
    if (r.parent_phone && r.parent_phone.trim() !== '') {
      let message = ''
      if (r.status === 'absent') {
        message = `نود إعلامكم بأن الطالب(ة) ${r.student_name} غاب اليوم ${dateLabel} عن حضور حصة ${sessionTitle || 'الدرس'}.`
      } else if (r.status === 'late') {
        message = `نود إعلامكم بأن الطالب(ة) ${r.student_name} حضر اليوم متأخراً عن حصة ${sessionTitle || 'الدرس'}.`
      }

      if (message) {
        notifications.push({
          student_id: r.student_id,
          phone: r.parent_phone.trim(),
          message,
          type: 'attendance_absent',
          status: 'pending'
        })
      }
    }
  })

  if (notifications.length > 0) {
    const { error: notifError } = await supabase
      .from('parent_notifications')
      .insert(notifications)
    
    if (notifError) console.error('Failed to queue parent notifications:', notifError)
  }

  return results || []
}

// Get optimized attendance statistics for a single student (cached to reduce Supabase queries)
export async function getStudentAttendanceSummary(studentId) {
  if (!studentId) return null
  return cached(`attendance-summary:${studentId}`, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('attendance')
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
      .from('attendance')
      .select(`
        id,
        date,
        status,
        session_id,
        homeworks (
          title
        )
      `)
      .eq('student_id', studentId)
      .order('date', { ascending: false })

    if (error) throw error
    return data || []
  })
}
