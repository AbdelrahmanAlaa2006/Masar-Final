import { supabase } from './supabase'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../src/utils/cache'

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
  
  records.forEach(r => {
    if (r.parent_phone && r.parent_phone.trim() !== '') {
      let typeLabel = ''
      if (r.type === 'homework') typeLabel = 'واجب'
      else if (r.type === 'exam') typeLabel = 'امتحان'
      else if (r.type === 'participation') typeLabel = 'مشاركة وتفاعل'
      else if (r.type === 'behavior') typeLabel = 'تقييم سلوكي'

      const subjectLabel = r.subject ? ` في مادة ${r.subject}` : ''
      const titleLabel = r.title ? ` (${r.title})` : ''
      
      let message = `نود إعلامكم بأنه تم إضافة تقييم ${typeLabel} جديد للطالب(ة) ${r.student_name}${subjectLabel}${titleLabel}: ${r.score} من ${r.max_score}.`
      
      if (r.notes && r.notes.trim() !== '') {
        message += ` ملاحظة المعلم: ${r.notes}`
      }

      notifications.push({
        student_id: r.student_id,
        phone: r.parent_phone.trim(),
        message,
        type: 'grade_added',
        status: 'pending'
      })
    }
  })

  if (notifications.length > 0) {
    const { error: notifError } = await supabase
      .from('parent_notifications')
      .insert(notifications)
    
    if (notifError) console.error('Failed to queue parent notification for grades:', notifError)
  }

  return data || []
}

// Get student grades summary aggregates for dashboard widgets
export async function getStudentGradesSummary(studentId) {
  if (!studentId) return null
  return cached(`grades-summary:${studentId}`, LIST_TTL, async () => {
    const { data, error } = await supabase
      .from('grades')
      .select('type, score, max_score')
      .eq('student_id', studentId)

    if (error) throw error

    let totalHomeworkScore = 0
    let totalHomeworkMax = 0
    let homeworkCount = 0

    let totalExamScore = 0
    let totalExamMax = 0
    let examCount = 0

    let participationCount = 0
    let behaviorNotesCount = 0

    data.forEach(r => {
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
      } else if (r.type === 'participation') {
        participationCount++
      } else if (r.type === 'behavior') {
        behaviorNotesCount++
      }
    })

    const homeworkAverage = totalHomeworkMax > 0 
      ? Math.round((totalHomeworkScore / totalHomeworkMax) * 100) 
      : 100

    const examAverage = totalExamMax > 0 
      ? Math.round((totalExamScore / totalExamMax) * 100) 
      : 100

    return {
      homeworkCount,
      homeworkAverage,
      examCount,
      examAverage,
      participationCount,
      behaviorNotesCount
    }
  })
}
