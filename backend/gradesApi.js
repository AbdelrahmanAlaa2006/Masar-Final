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
        .not('submitted_at', 'is', null),
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

// Get unique list of past evaluation titles and types for a grade
export async function listUniqueEvaluations(grade) {
  const { data, error } = await supabase
    .from('grades')
    .select(`
      type,
      title,
      profiles!student_id (
        grade
      )
    `)

  if (error) throw error

  const filtered = (data || [])
    .filter(r => r.profiles?.grade === grade)
    .map(r => ({ type: r.type, title: r.title }))

  const seen = new Set()
  const unique = []
  filtered.forEach(item => {
    const key = `${item.type}:${item.title}`
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(item)
    }
  })

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
