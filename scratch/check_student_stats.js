import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  console.log("Attempting sign in as admin...")
  await supabase.auth.signInWithPassword({
    email: '01099999999@masaar.app',
    password: '12345678'
  })

  const studentId = '5e4feea9-595c-4617-9a7a-925fbee7cbd8' // lolo

  console.log("\nSimulating getStudentGradesSummary step by step:")
  
  // 1. Fetch student profile details (grade and group) to query overrides
  const { data: profile } = await supabase
    .from('profiles')
    .select('grade, "group"')
    .eq('id', studentId)
    .single()

  console.log("Profile:", profile)
  const grade = profile?.grade || null
  const group = profile?.group || null

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

  console.log("Grades count:", gradesRes.data?.length)
  console.log("Attempts:", JSON.stringify(attemptsRes.data, null, 2))
  console.log("Overrides:", overridesRes.data)

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
    console.log(`Exam ID: ${a.exam_id}, title: ${exam?.title}, reveal_grades: ${exam?.reveal_grades}, isRevealed: ${isRevealed}`)
    if (!isRevealed) continue

    const scoreVal = parseFloat(a.score || 0)
    const maxVal = parseFloat(a.max_score || 0)
    
    const prev = bestAttempts.get(a.exam_id)
    if (!prev || scoreVal > prev.score) {
      bestAttempts.set(a.exam_id, { score: scoreVal, max_score: maxVal })
    }
  }

  console.log("Resolved Best Attempts:", Array.from(bestAttempts.entries()))

  let totalExamScore = 0
  let totalExamMax = 0
  let examCount = 0

  for (const best of bestAttempts.values()) {
    totalExamScore += best.score
    totalExamMax += best.max_score
    examCount++
  }

  console.log(`Summary: examCount = ${examCount}, totalExamScore = ${totalExamScore}, totalExamMax = ${totalExamMax}`)
}

main()
