import { supabase } from './supabase'
import { cached, LIST_TTL } from '../src/utils/cache'

/**
 * Fetch manual grades of a specific type (e.g. 'exam' or 'quiz') for a student,
 * mapped to match the shape expected by ExamsReport.jsx.
 */
export async function listCenterAttemptsForStudent(studentId, type) {
  if (!studentId) return []
  const { data, error } = await supabase
    .from('grades')
    .select(`
      id,
      title,
      subject,
      score,
      max_score,
      notes,
      created_at,
      creator:created_by ( name )
    `)
    .eq('student_id', studentId)
    .eq('type', type)
    .order('created_at', { ascending: false })
  
  if (error) throw error

  return (data || []).map(g => ({
    id: g.id,
    exam_id: g.id,
    submitted_at: g.created_at,
    score: parseFloat(g.score) || 0,
    max_score: parseFloat(g.max_score) || 100,
    responses: [],
    exams: {
      id: g.id,
      title: g.title,
      number: null,
      total_points: parseFloat(g.max_score) || 100,
      duration_minutes: 0,
      reveal_grades: true
    },
    notes: g.notes || '',
    teacher: g.creator?.name || 'الإدارة'
  }))
}

/**
 * List unique manual evaluation titles for a grade,
 * mapped to match the shape expected by ExamsGroupReport.jsx.
 */
export async function listCenterUniqueEvaluations(grade, type) {
  if (!grade) return []
  const { data, error } = await supabase
    .from('grades')
    .select(`
      title,
      max_score,
      profiles!student_id ( grade )
    `)
    .eq('type', type)
  
  if (error) throw error

  const filtered = (data || []).filter(r => r.profiles?.grade === grade)
  const seen = new Set()
  const unique = []

  filtered.forEach(item => {
    const title = (item.title || '').trim()
    if (title && !seen.has(title)) {
      seen.add(title)
      unique.push({
        id: title, // Use title as ID for evaluations dropdown
        title: title,
        grade: grade,
        exam_type: type,
        total_points: parseFloat(item.max_score) || 0,
        duration_minutes: 0,
        reveal_grades: true
      })
    }
  })

  return unique
}

/**
 * Fetch manual grades for all students for a specific title and type.
 */
export async function listCenterGradesForEvaluation(type, title) {
  if (!title) return []
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
        id,
        name,
        phone,
        grade,
        "group",
        parent_phone,
        branch_id,
        branches ( name )
      ),
      creator:created_by ( name )
    `)
    .eq('type', type)
    .eq('title', title)

  if (error) throw error
  return data || []
}

/**
 * Get all manual grades for a single student (combined view).
 */
export async function getCenterStudentGradesCombined(studentId) {
  if (!studentId) return []
  const { data, error } = await supabase
    .from('grades')
    .select(`
      id,
      type,
      title,
      subject,
      score,
      max_score,
      notes,
      created_at,
      creator:created_by ( name )
    `)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return data || []
}

/**
 * Fetch manual grades for all students in a grade/group for the collective report.
 */
export async function listCenterGradesGroupCombined(grade, groupId = 'all') {
  if (!grade) return []
  const { data, error } = await supabase
    .from('grades')
    .select(`
      id,
      type,
      title,
      subject,
      score,
      max_score,
      notes,
      created_at,
      profiles!student_id (
        id,
        name,
        phone,
        grade,
        "group",
        branch_id,
        branches ( name )
      ),
      creator:created_by ( name )
    `)
    .order('created_at', { ascending: false })

  if (error) throw error

  let filtered = (data || []).filter(r => r.profiles?.grade === grade)
  if (groupId && groupId !== 'all') {
    filtered = filtered.filter(r => r.profiles?.group === groupId)
  }
  return filtered
}

/**
 * Fetch detailed attendance log and summary statistics for a student.
 */
export async function getCenterStudentAttendance(studentId) {
  if (!studentId) return []
  const { data, error } = await supabase
    .from('attendance_records')
    .select(`
      id,
      status,
      notes,
      session_id,
      attendance_sessions (
        title,
        date,
        creator:created_by ( name )
      )
    `)
    .eq('student_id', studentId)
  
  if (error) throw error

  return (data || []).map(r => ({
    id: r.id,
    status: r.status,
    notes: r.notes || '',
    title: r.attendance_sessions?.title || 'حصة دراسية',
    date: r.attendance_sessions?.date || '—',
    teacher: r.attendance_sessions?.creator?.name || 'الإدارة'
  })).sort((a, b) => new Date(b.date) - new Date(a.date))
}

/**
 * Fetch attendance metrics (counts of present, absent, late, excused) for all students in a grade/group.
 */
export async function listCenterAttendanceGroup(grade, groupId = 'all', branchId = 'all') {
  if (!grade) return []
  const { data, error } = await supabase
    .from('attendance_records')
    .select(`
      id,
      status,
      student_id,
      session_id,
      profiles!student_id (
        id,
        name,
        phone,
        grade,
        "group",
        branch_id,
        branches ( name )
      )
    `)

  if (error) throw error

  let filtered = (data || []).filter(r => r.profiles?.grade === grade)
  if (groupId && groupId !== 'all') {
    filtered = filtered.filter(r => r.profiles?.group === groupId)
  }
  if (branchId && branchId !== 'all') {
    filtered = filtered.filter(r => r.profiles?.branch_id === branchId)
  }

  // Aggregate by student
  const studentMap = {}
  for (const r of filtered) {
    const s = r.profiles
    if (!s) continue
    if (!studentMap[s.id]) {
      studentMap[s.id] = {
        student: s,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0
      }
    }
    if (r.status === 'present') studentMap[s.id].present++
    else if (r.status === 'absent') studentMap[s.id].absent++
    else if (r.status === 'late') studentMap[s.id].late++
    else if (r.status === 'excused') studentMap[s.id].excused++
  }

  return Object.values(studentMap)
}

/**
 * Fetch payments and charges from student_ledger for a single student.
 */
export async function getCenterStudentFinance(studentId) {
  if (!studentId) return []
  const { data, error } = await supabase
    .from('student_ledger')
    .select(`
      id,
      type,
      amount,
      payment_method,
      status,
      description,
      notes,
      created_at,
      transaction_date,
      billing_period,
      branches ( name )
    `)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Fetch billing and collection aggregates for all students in a grade/group/branch.
 */
export async function listCenterFinanceGroup(grade, groupId = 'all', branchId = 'all') {
  if (!grade) return []
  const { data, error } = await supabase
    .from('student_ledger')
    .select(`
      id,
      type,
      amount,
      status,
      billing_period,
      transaction_date,
      profiles!student_id (
        id,
        name,
        phone,
        grade,
        "group",
        branch_id,
        branches ( name )
      )
    `)

  if (error) throw error

  let filtered = (data || []).filter(r => r.profiles?.grade === grade)
  if (groupId && groupId !== 'all') {
    filtered = filtered.filter(r => r.profiles?.group === groupId)
  }
  if (branchId && branchId !== 'all') {
    filtered = filtered.filter(r => r.profiles?.branch_id === branchId)
  }

  // Aggregate values by student id
  const studentMap = {}
  for (const r of filtered) {
    const s = r.profiles
    if (!s) continue
    if (!studentMap[s.id]) {
      studentMap[s.id] = {
        student: s,
        charged: 0,
        paid: 0,
        remaining: 0,
        billing_periods: [],
        last_payment_date: null
      }
    }
    const amountVal = parseFloat(r.amount) || 0
    if (r.type === 'charge') {
      studentMap[s.id].charged += amountVal
      if (r.billing_period && !studentMap[s.id].billing_periods.includes(r.billing_period)) {
        studentMap[s.id].billing_periods.push(r.billing_period)
      }
    } else if (r.type === 'payment' && r.status === 'approved') {
      studentMap[s.id].paid += amountVal
      const payDate = r.transaction_date || r.created_at
      if (payDate) {
        if (!studentMap[s.id].last_payment_date || payDate > studentMap[s.id].last_payment_date) {
          studentMap[s.id].last_payment_date = payDate
        }
      }
    }
  }

  // Compute outstanding balance
  for (const key in studentMap) {
    studentMap[key].remaining = Math.max(0, studentMap[key].charged - studentMap[key].paid)
  }

  return Object.values(studentMap)
}
