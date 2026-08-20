import { supabase } from './supabase'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../src/utils/cache'
import { renderNotificationTemplate, getGradeUiLabel } from './whatsappTemplates'

// Fetch all grades for a single student
export async function getStudentGrades(studentId) {
  if (!studentId) return []
  return cached(`grades-list:${studentId}`, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('grades')
      .select(`
        id,
        session_id,
        type,
        title,
        subject,
        score,
        max_score,
        notes,
        created_at,
        homeworks (
          title
        )
      `)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  })
}

// Bulk save grades and automatically queue parent notifications
export async function saveGradesBatch(records) {
  if (!records || records.length === 0) return []

  const formattedRecords = records.map(r => ({
    student_id: r.student_id,
    session_id: r.session_id || null,
    type: r.type,
    title: r.title,
    subject: r.subject || null,
    score: r.score,
    max_score: r.max_score,
    notes: r.notes || null,
    created_by: r.created_by || null,
  }))

  // Step 1: Batch insert into grades table
  const { data, error } = await supabase
    .from('grades')
    .insert(formattedRecords)
    .select()

  if (error) throw error

  // Invalidate grades cache for these students
  records.forEach(r => {
    invalidateCache(`grades-list:${r.student_id}`)
    invalidateCache(`grades-summary:${r.student_id}`)
  })

  // Step 2: Queue parent notifications if parent phone is present
  const notifications = []
  
  let tenant = null
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
      console.error('Failed to fetch profiles/tenant configuration for grades template:', err)
    }
  }

  // Create notifications asynchronously
  for (const r of records) {
    if (r.parent_phone && r.parent_phone.trim() !== '') {
      let notification_type = 'general'
      if (r.type === 'homework') notification_type = 'homework'
      else if (r.type === 'exam') notification_type = 'exam'
      else if (r.type === 'quiz') notification_type = 'quiz'
      else if (r.type === 'participation') notification_type = 'participation'
      else if (r.type === 'behavior') notification_type = 'behavior'

      // Find the database inserted row to get the grade ID
      const insertedGrade = (data || []).find(dg => 
        dg.student_id === r.student_id && 
        dg.type === r.type && 
        dg.score === r.score && 
        dg.max_score === r.max_score
      )
      const gradeId = insertedGrade ? insertedGrade.id : null

      const studentProfile = profilesMap.get(r.student_id)
      const gradeLabel = getGradeUiLabel(studentProfile?.grade)
      const groupLabel = studentProfile?.group || ''
      const lessonNameResolved = [gradeLabel, groupLabel].filter(Boolean).join(' - ') || 'الدرس'

      // Construct placeholders payload
      const payload = {
        student_name: r.student_name,
        grade: r.score,
        total_grade: r.max_score,
        quiz_name: r.type === 'quiz' ? r.title : '',
        exam_name: r.type === 'exam' ? r.title : '',
        homework_name: r.type === 'homework' ? r.title : '',
        lesson_name: lessonNameResolved,
        date: new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }),
        day_name: new Date().toLocaleDateString('ar-EG', { weekday: 'long' }),
        course_name: r.subject || tenant?.config?.subject || ''
      }

      try {
        const renderedMessage = await renderNotificationTemplate({
          tenant,
          notification_type,
          locale: 'ar-EG',
          payload
        })

        notifications.push({
          student_id: r.student_id,
          title: 'تقييم جديد',
          message: renderedMessage,
          type: 'grade_added',
          channels: ['whatsapp', 'portal'],
          status: { whatsapp: 'pending', portal: 'pending' },
          created_by: r.created_by || null,
          grade_id: gradeId
        })
      } catch (renderErr) {
        console.error('Failed to render grade template message:', renderErr)
      }
    }
  }

  if (notifications.length > 0) {
    const { error: notifError } = await supabase
      .from('unified_notifications')
      .insert(notifications)
    
    if (notifError) console.error('Failed to queue parent notification for grades:', notifError)
  }

  return data || []
}

// Get student grades summary aggregates for dashboard widgets
export async function getStudentGradesSummary(studentId) {
  if (!studentId) return null
  return cached(`grades-summary:${studentId}`, LIST_TTL, async () => {
    // 1. Fetch student profile details (grade and group) to query overrides
    const { data: profile } = await supabase
      .from('profiles')
      .select('grade, "group"')
      .eq('id', studentId)
      .single()

    const grade = profile?.grade || null
    const group = profile?.group || null

    // Compose OR clause for overrides lookup
    const clauses = [
      `and(scope.eq.student,target_id.eq.${studentId})`,
    ]
    if (grade) {
      clauses.push(`and(scope.eq.prep,target_id.eq.${grade})`)
      if (group) {
        const groupTarget = `${grade}:${group}`
        clauses.push(`and(scope.eq.group,target_id.eq.${groupTarget})`)
      }
    }

    // 2. Fetch manual grades, online exam attempts, and overrides in parallel
    const [gradesRes, attemptsRes, overridesRes] = await Promise.all([
      supabase
        .from('grades')
        .select('type, score, max_score')
        .eq('student_id', studentId),
      supabase
        .from('exam_attempts')
        .select('exam_id, score, max_score, exams ( reveal_grades )')
        .eq('student_id', studentId)
        .not('submitted_at', 'is', null)
        // Gate attempts belong to the pre-video assessment report, not to the
        // student's exam grade summary.
        .is('video_assessment_id', null),
      grade
        ? supabase
            .from('access_overrides')
            .select('scope, item_id, allowed')
            .eq('item_type', 'exam_reveal')
            .or(clauses.join(','))
        : Promise.resolve({ data: [] })
    ])

    if (gradesRes.error) throw gradesRes.error
    if (attemptsRes.error) throw attemptsRes.error
    if (overridesRes.error) throw overridesRes.error

    const grades = gradesRes.data || []
    const attempts = attemptsRes.data || []
    const overrides = overridesRes.data || []

    // 3. Resolve reveal overrides
    const SCOPE_RANK = { prep: 1, group: 2, student: 3 }
    const revealMap = new Map()
    for (const r of overrides) {
      const cur = revealMap.get(r.item_id)
      if (!cur || (SCOPE_RANK[r.scope] || 0) > (SCOPE_RANK[cur.scope] || 0)) {
        revealMap.set(r.item_id, r)
      }
    }

    // 4. Resolve best attempt score per online exam
    const bestAttempts = new Map()
    for (const a of attempts) {
      const exam = a.exams
      const isRevealed = exam?.reveal_grades === true || revealMap.get(a.exam_id)?.allowed === true
      if (!isRevealed) continue

      const scoreVal = parseFloat(a.score || 0)
      const maxVal = parseFloat(a.max_score || 0)
      
      const prev = bestAttempts.get(a.exam_id)
      if (!prev || scoreVal > prev.score) {
        bestAttempts.set(a.exam_id, { score: scoreVal, max_score: maxVal })
      }
    }

    let totalHomeworkScore = 0
    let totalHomeworkMax = 0
    let homeworkCount = 0

    let totalExamScore = 0
    let totalExamMax = 0
    let examCount = 0

    let totalQuizScore = 0
    let totalQuizMax = 0
    let quizCount = 0

    let participationCount = 0
    let behaviorNotesCount = 0

    // Add online exams (best attempt per exam)
    for (const best of bestAttempts.values()) {
      totalExamScore += best.score
      totalExamMax += best.max_score
      examCount++
    }

    // Add manual grades
    grades.forEach(r => {
      const scoreVal = parseFloat(r.score)
      const maxVal = parseFloat(r.max_score)

      if (r.type === 'homework') {
        totalHomeworkScore += scoreVal
        totalHomeworkMax += maxVal
        homeworkCount++
      } else if (r.type === 'exam') {
        totalExamScore += scoreVal
        totalExamMax += maxVal
        examCount++
      } else if (r.type === 'quiz') {
        totalQuizScore += scoreVal
        totalQuizMax += maxVal
        quizCount++
      } else if (r.type === 'participation') {
        participationCount++
      } else if (r.type === 'behavior') {
        behaviorNotesCount++
      }
    })

    // No graded items yet → average is unknown, not 100%.
    const homeworkAverage = totalHomeworkMax > 0
      ? Math.round((totalHomeworkScore / totalHomeworkMax) * 100)
      : null

    const examAverage = totalExamMax > 0
      ? Math.round((totalExamScore / totalExamMax) * 100)
      : null

    const quizAverage = totalQuizMax > 0
      ? Math.round((totalQuizScore / totalQuizMax) * 100)
      : null

    return {
      homeworkCount,
      homeworkAverage,
      homeworkScore: totalHomeworkScore,
      homeworkMax: totalHomeworkMax,
      examCount,
      examAverage,
      examScore: totalExamScore,
      examMax: totalExamMax,
      quizCount,
      quizAverage,
      quizScore: totalQuizScore,
      quizMax: totalQuizMax,
      participationCount,
      behaviorNotesCount
    }
  })
}

// Get unique list of past evaluation titles and types for a grade (sorted newest first)
export async function listUniqueEvaluations(grade) {
  const { data, error } = await supabase
    .from('grades')
    .select(`
      type,
      title,
      created_at,
      profiles!student_id (
        grade
      )
    `)
    .order('created_at', { ascending: false })

  if (error) throw error

  const filtered = (data || []).filter(r => r.profiles?.grade === grade)

  const map = new Map()
  filtered.forEach(r => {
    const rawTitle = (r.title || '').trim()
    if (!rawTitle) return
    const key = `${r.type}:${rawTitle}`
    if (!map.has(key)) {
      map.set(key, {
        type: r.type,
        title: rawTitle,
        created_at: r.created_at,
        count: 1
      })
    } else {
      const existing = map.get(key)
      existing.count += 1
      if (new Date(r.created_at) > new Date(existing.created_at)) {
        existing.created_at = r.created_at
      }
    }
  })

  // Sort strictly by latest created_at descending (newest evaluations at the top)
  const unique = Array.from(map.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return unique
}

// Get grades records for a specific evaluation type and title
export async function listGradesForEvaluation(type, title) {
  const { data, error } = await supabase
    .from('grades')
    .select(`
      id,
      student_id,
      type,
      title,
      subject,
      score,
      max_score,
      notes,
      created_at,
      profiles!student_id (
        name,
        phone,
        grade,
        "group",
        student_groups(group_id)
      )
    `)
    .eq('type', type)
    .eq('title', title)

  if (error) throw error
  return data || []
}

// Delete a whole evaluation (كشف درجات) and invalidate caches
export async function deleteEvaluation(type, title) {
  if (!type || !title) return null

  // 1. Fetch all student IDs who have a grade in this evaluation
  const { data: records, error: fetchError } = await supabase
    .from('grades')
    .select('student_id')
    .eq('type', type)
    .eq('title', title)

  if (fetchError) console.error('Error fetching student IDs for evaluation cache invalidation:', fetchError)

  // 2. Delete the grade records
  const { data, error } = await supabase
    .from('grades')
    .delete()
    .eq('type', type)
    .eq('title', title)
    .select()

  if (error) throw error

  // 3. Invalidate caches for all affected students
  if (records && records.length > 0) {
    const studentIds = [...new Set(records.map(r => r.student_id))]
    studentIds.forEach(id => {
      invalidateCache(`grades-list:${id}`)
      invalidateCache(`grades-summary:${id}`)
    })
  }

  return data
}

// Rebuild and send WhatsApp notifications for a past evaluation session
export async function rebuildAndSendGradeNotifications(type, title, tenantId, createdBy = null) {
  if (!type || !title || !tenantId) {
    throw new Error('Type, title, and tenant ID are required')
  }

  // 1. Fetch all grades in this session
  const grades = await listGradesForEvaluation(type, title)
  if (grades.length === 0) return 0

  const gradeIds = grades.map(g => g.id)
  const studentIds = grades.map(g => g.student_id)

  // 2. Fetch tenant config
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single()

  if (tenantError || !tenant) {
    throw new Error('Failed to load tenant configuration: ' + (tenantError?.message || 'Tenant not found'))
  }

  // 3. Fetch all existing notifications for these students to identify sent, failed, or pending status
  const { data: existingNotifs, error: notifFetchError } = await supabase
    .from('unified_notifications')
    .select('id, student_id, status, grade_id, message')
    .eq('tenant_id', tenantId)
    .eq('type', 'grade_added')
    .in('student_id', studentIds)

  if (notifFetchError) throw notifFetchError

  const hasSentOrFailed = new Set()
  const pendingNotifIdsToDelete = []

  if (existingNotifs) {
    existingNotifs.forEach(notif => {
      // Match by grade_id relation OR by parsing the title inside message (for legacy rows)
      const isMatch = (notif.grade_id && gradeIds.includes(notif.grade_id)) || 
                      (!notif.grade_id && notif.message && notif.message.includes(title))
      
      if (isMatch) {
        const whatsappStatus = notif.status?.whatsapp || 'pending'
        if (whatsappStatus === 'sent' || whatsappStatus === 'failed') {
          hasSentOrFailed.add(notif.student_id)
        } else if (whatsappStatus === 'pending') {
          pendingNotifIdsToDelete.push(notif.id)
        }
      }
    })
  }

  // 4. Delete only the PENDING notifications related to this session
  if (pendingNotifIdsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('unified_notifications')
      .delete()
      .in('id', pendingNotifIdsToDelete)

    if (deleteError) throw deleteError
  }

  // 5. Generate and insert new notifications for students who haven't received them yet
  const notificationsToInsert = []

  for (const g of grades) {
    if (hasSentOrFailed.has(g.student_id)) {
      continue // Keep sent and failed states untouched
    }

    const recipientPhone = g.profiles?.parent_phone || g.profiles?.phone
    if (!recipientPhone || recipientPhone.trim() === '') {
      continue
    }

    const gradeLabel = getGradeUiLabel(g.profiles?.grade)
    const groupLabel = g.profiles?.group || ''
    const lessonNameResolved = [gradeLabel, groupLabel].filter(Boolean).join(' - ') || 'الدرس'

    // Construct structured payload variables
    const payload = {
      student_name: g.profiles?.name || '',
      grade: g.score,
      total_grade: g.max_score,
      quiz_name: g.type === 'quiz' ? g.title : '',
      exam_name: g.type === 'exam' ? g.title : '',
      homework_name: g.type === 'homework' ? g.title : '',
      lesson_name: lessonNameResolved,
      date: new Date(g.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }),
      day_name: new Date(g.created_at).toLocaleDateString('ar-EG', { weekday: 'long' }),
      course_name: g.subject || tenant.config?.subject || ''
    }

    try {
      const renderedMessage = await renderNotificationTemplate({
        tenant,
        notification_type: type,
        locale: 'ar-EG',
        payload
      })

      notificationsToInsert.push({
        tenant_id: tenantId,
        student_id: g.student_id,
        title: 'تقييم جديد',
        message: renderedMessage,
        type: 'grade_added',
        channels: ['whatsapp', 'portal'],
        status: { whatsapp: 'pending', portal: 'pending' },
        created_by: createdBy || null,
        grade_id: g.id,
        recipient_phone: recipientPhone
      })
    } catch (renderErr) {
      console.error(`Failed to render template during rebuild for student ${g.student_id}:`, renderErr)
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

// Send WhatsApp notification for a single modified grade record
export async function sendUpdatedGradeNotification(gradeRecord, tenantId, createdBy = null) {
  // Fetch student profile details
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, name, phone, parent_phone, grade, "group"')
    .eq('id', gradeRecord.student_id)
    .single()
  
  if (profileErr || !profile) return
  
  // Fetch tenant configuration
  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single()

  const parentPhone = profile.parent_phone || profile.phone
  if (!parentPhone || parentPhone.trim() === '') return

  let notification_type = 'general'
  if (gradeRecord.type === 'homework') notification_type = 'homework'
  else if (gradeRecord.type === 'exam') notification_type = 'exam'
  else if (gradeRecord.type === 'quiz') notification_type = 'quiz'
  else if (gradeRecord.type === 'participation') notification_type = 'participation'
  else if (gradeRecord.type === 'behavior') notification_type = 'behavior'

  const gradeLabel = getGradeUiLabel(profile.grade)
  const groupLabel = profile.group || ''
  const lessonNameResolved = [gradeLabel, groupLabel].filter(Boolean).join(' - ') || 'الدرس'

  // Construct placeholders payload
  const payload = {
    student_name: profile.name,
    grade: gradeRecord.score,
    total_grade: gradeRecord.max_score,
    quiz_name: gradeRecord.type === 'quiz' ? gradeRecord.title : '',
    exam_name: gradeRecord.type === 'exam' ? gradeRecord.title : '',
    homework_name: gradeRecord.type === 'homework' ? gradeRecord.title : '',
    lesson_name: lessonNameResolved,
    date: new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }),
    day_name: new Date().toLocaleDateString('ar-EG', { weekday: 'long' }),
    course_name: gradeRecord.subject || tenant?.config?.subject || ''
  }

  try {
    const renderedMessage = await renderNotificationTemplate({
      tenant,
      notification_type,
      locale: 'ar-EG',
      payload
    })

    // Delete any existing pending whatsapp notification for this specific grade first
    await supabase
      .from('unified_notifications')
      .delete()
      .eq('grade_id', gradeRecord.id)
      .eq('status->>whatsapp', 'pending')

    const notification = {
      tenant_id: tenantId,
      student_id: gradeRecord.student_id,
      title: 'تعديل تقييم',
      message: renderedMessage,
      type: 'grade_added',
      channels: ['whatsapp', 'portal'],
      status: { whatsapp: 'pending', portal: 'pending' },
      created_by: createdBy || null,
      grade_id: gradeRecord.id,
      recipient_phone: parentPhone
    }

    await supabase
      .from('unified_notifications')
      .insert(notification)
  } catch (err) {
    console.error('Failed to send updated grade notification:', err)
  }
}


