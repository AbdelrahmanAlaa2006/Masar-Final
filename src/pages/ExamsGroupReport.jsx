import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import './ExamsGroupReport.css'
import { listStudents } from '@backend/profilesApi'
import { listExams } from '@backend/examsApi'
import { supabase } from '@backend/supabase'

const GRADE_LABEL = {
  'first-prep':  'الأول الإعدادي',
  'second-prep': 'الثاني الإعدادي',
  'third-prep':  'الثالث الإعدادي',
}
const GRADE_ORDER = ['first-prep', 'second-prep', 'third-prep']

export default function ExamsGroupReport() {
  const navigate = useNavigate()

  const [students, setStudents] = useState([])
  const [exams, setExams]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [currentGrade, setCurrentGrade] = useState('')
  const [currentGroup, setCurrentGroup] = useState('') // class group label, '' = all
  const [currentExam, setCurrentExam]   = useState('') // exam id
  const [currentFilter, setCurrentFilter] = useState('all')

  const [allStudentsData, setAllStudentsData] = useState([])
  const [displayedStudents, setDisplayedStudents] = useState([])
  const [reportLoading, setReportLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [s, e] = await Promise.all([listStudents(), listExams()])
        if (cancelled) return
        setStudents(s)
        setExams(e)
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'تعذر تحميل البيانات')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const availableGrades = useMemo(() => {
    const set = new Set(students.map(s => s.grade).filter(Boolean))
    return GRADE_ORDER.filter(g => set.has(g))
  }, [students])

  const examsForGrade = useMemo(
    () => exams.filter(e => e.grade === currentGrade),
    [exams, currentGrade]
  )
  // All students in the chosen grade — used to derive group chips.
  const studentsInGrade = useMemo(
    () => students.filter(s => s.grade === currentGrade),
    [students, currentGrade]
  )

  // Distinct, non-empty groups within the selected grade.
  const groupsForGrade = useMemo(() => {
    const set = new Set(
      studentsInGrade.map(s => (s.group || '').trim()).filter(Boolean)
    )
    return [...set].sort((a, b) => a.localeCompare(b, 'ar'))
  }, [studentsInGrade])

  // Students after the (optional) group filter is applied.
  const studentsForGrade = useMemo(() => {
    if (!currentGroup) return studentsInGrade
    return studentsInGrade.filter(s => (s.group || '').trim() === currentGroup)
  }, [studentsInGrade, currentGroup])

  const selectGrade = (grade) => {
    setCurrentGrade(grade)
    setCurrentGroup('')
    setCurrentExam('')
    setAllStudentsData([])
    setDisplayedStudents([])
    setCurrentFilter('all')
  }

  const selectGroup = (group) => {
    setCurrentGroup(group)
    // Cached rows are scoped to the previous group — clear them.
    setCurrentExam('')
    setAllStudentsData([])
    setDisplayedStudents([])
    setCurrentFilter('all')
  }

  const handleExamChange = (examId) => {
    setCurrentExam(examId)
    if (examId) loadReport(examId)
    else { setAllStudentsData([]); setDisplayedStudents([]) }
  }

  const loadReport = async (examId) => {
    const exam = exams.find(ex => ex.id === examId)
    if (!exam) return
    const maxScore = exam.total_points || 0
    const maxAttempts = exam.max_attempts || 1
    const gradeStudents = studentsForGrade
    if (gradeStudents.length === 0) {
      setAllStudentsData([]); setDisplayedStudents([]); return
    }

    setReportLoading(true)
    try {
      const ids = gradeStudents.map(s => s.id)
      const { data: attempts, error } = await supabase
        .from('exam_attempts')
        .select('student_id, score, max_score, submitted_at')
        .eq('exam_id', examId)
        .in('student_id', ids)
        .not('submitted_at', 'is', null)
      if (error) throw error

      // group attempts by student — keep best score + count
      const byStudent = {}
      for (const a of (attempts || [])) {
        const cur = byStudent[a.student_id] || { best: null, count: 0, latest: 0 }
        cur.count += 1
        const t = a.submitted_at ? new Date(a.submitted_at).getTime() : 0
        if (t > cur.latest) cur.latest = t
        if (!cur.best || (a.score || 0) > (cur.best.score || 0)) cur.best = a
        byStudent[a.student_id] = cur
      }

      const rows = gradeStudents.map(stu => {
        const entry = byStudent[stu.id]
        const attemptsUsed = entry?.count || 0
        const bestRaw = entry?.best?.score || 0
        const bestMax = entry?.best?.max_score || maxScore || 100
        const pct = bestMax > 0 ? Math.round((bestRaw / bestMax) * 100) : 0

        let rating = 'ممتاز'
        if (!entry)              rating = 'لم يؤدِ'
        else if (pct < 60)       rating = 'يحتاج تحسين'
        else if (pct < 80)       rating = 'جيد'

        const status = !entry ? 'not_taken' : (pct >= 60 ? 'passed' : 'failed')
        const result = !entry ? 'لم يؤدِ' : (pct >= 60 ? 'نجح' : 'لم ينجح')
        const date = entry?.latest
          ? new Date(entry.latest).toLocaleDateString('ar-EG')
          : '—'

        return {
          name: stu.name,
          id: stu.phone || stu.id.slice(0, 8),
          group: (stu.group || '').trim() || GRADE_LABEL[stu.grade] || '',
          exam: exam.title,
          date,
          score: pct,      // percentage, used by summary/filter
          rawScore: bestRaw,
          maxScore: bestMax,
          result,
          rating,
          attempts: attemptsUsed,
          maxAttempts,
          status,
        }
      })

      setAllStudentsData(rows)
      setDisplayedStudents(rows)
    } catch (e) {
      setLoadError(e.message || 'تعذر تحميل تقرير الامتحان')
    } finally {
      setReportLoading(false)
    }
  }

  const filterStudents = (filter) => {
    setCurrentFilter(filter)
    let filteredData = allStudentsData
    switch (filter) {
      case 'passed': filteredData = allStudentsData.filter((s) => s.status === 'passed'); break
      case 'failed': filteredData = allStudentsData.filter((s) => s.status === 'failed'); break
      case 'high':   filteredData = allStudentsData.filter((s) => s.score >= 80 && s.status !== 'not_taken'); break
      default:       filteredData = allStudentsData
    }
    setDisplayedStudents(filteredData)
  }

  // Summary stats (only over students who took the exam)
  const tookExam = allStudentsData.filter(s => s.status !== 'not_taken')
  const totalStudents  = allStudentsData.length
  const passedCount    = allStudentsData.filter((s) => s.status === 'passed').length
  const failedCount    = allStudentsData.filter((s) => s.status === 'failed').length
  const excellentCount = allStudentsData.filter((s) => s.score >= 80 && s.status !== 'not_taken').length
  const avgScore = tookExam.length > 0
    ? Math.round(tookExam.reduce((s, x) => s + x.score, 0) / tookExam.length)
    : 0
  const passRate = tookExam.length > 0 ? Math.round((passedCount / tookExam.length) * 100) : 0

  if (loading) {
    return (
      <main className="egr-page">
        <div className="egr-container">
          <div className="egr-header" style={{textAlign:'center', padding:'40px'}}>
            <i className="fas fa-spinner fa-spin" style={{fontSize:'2rem'}}></i>
            <p>جاري التحميل...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="egr-page">
      <div className="egr-container">

        {/* Back */}
        <button className="egr-back-btn" onClick={() => navigate(-1)}>
          <i className="fas fa-arrow-right"></i>
          رجوع
        </button>

        {/* Header */}
        <div className="egr-header">
          <div className="egr-header-icon">
            <i className="fas fa-chart-pie"></i>
          </div>
          <h1>التقرير الجماعي للامتحانات</h1>
          <p>تحليل نتائج الطلاب المسجلين وأداء كل صف</p>
        </div>

        {loadError && (
          <div className="egr-header" style={{background:'#fee2e2', color:'#991b1b', padding:'12px', borderRadius:12}}>
            <p style={{margin:0}}>{loadError}</p>
          </div>
        )}

        {/* Stepper */}
        <div className="egr-stepper">
          <div className={`egr-step ${currentGrade ? 'done' : 'active'}`}>
            <div className="egr-step-num">
              {currentGrade ? <i className="fas fa-check"></i> : 1}
            </div>
            <span>الصف</span>
          </div>
          <div className="egr-step-line"></div>
          <div className={`egr-step ${currentExam ? 'done' : currentGrade ? 'active' : ''}`}>
            <div className="egr-step-num">
              {currentExam ? <i className="fas fa-check"></i> : 2}
            </div>
            <span>الامتحان</span>
          </div>
        </div>

        {/* Grade */}
        <div className="egr-section">
          <h2 className="egr-section-title">
            <i className="fas fa-school"></i>
            اختر الصف الدراسي
          </h2>
          {availableGrades.length === 0 ? (
            <p style={{textAlign:'center', color:'#6b7280'}}>لا يوجد طلاب مسجلون بعد.</p>
          ) : (
            <div className="egr-chips">
              {availableGrades.map((grade) => (
                <button
                  key={grade}
                  className={`egr-chip ${currentGrade === grade ? 'active' : ''}`}
                  onClick={() => selectGrade(grade)}
                >
                  <i className="fas fa-graduation-cap"></i>
                  {GRADE_LABEL[grade]}
                  <span className="egr-count-badge" style={{marginInlineStart:8}}>
                    {students.filter(s => s.grade === grade).length}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Group — only when the chosen grade actually has groups defined.
            "الكل" keeps the legacy behaviour for grades without groups. */}
        {currentGrade && groupsForGrade.length > 0 && (
          <div className="egr-section">
            <h2 className="egr-section-title">
              <i className="fas fa-user-group"></i>
              اختر المجموعة
            </h2>
            <div className="egr-chips">
              <button
                className={`egr-chip ${currentGroup === '' ? 'active' : ''}`}
                onClick={() => selectGroup('')}
              >
                <i className="fas fa-layer-group"></i>
                كل المجموعات
                <span className="egr-count-badge" style={{marginInlineStart:8}}>
                  {studentsInGrade.length}
                </span>
              </button>
              {groupsForGrade.map((g) => (
                <button
                  key={g}
                  className={`egr-chip ${currentGroup === g ? 'active' : ''}`}
                  onClick={() => selectGroup(g)}
                >
                  <i className="fas fa-user-group"></i>
                  {g}
                  <span className="egr-count-badge" style={{marginInlineStart:8}}>
                    {studentsInGrade.filter(s => (s.group || '').trim() === g).length}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Exam */}
        {currentGrade && (
          <div className="egr-section">
            <h2 className="egr-section-title">
              <i className="fas fa-file-alt"></i>
              اختر الامتحان
            </h2>
            {examsForGrade.length === 0 ? (
              <p style={{textAlign:'center', color:'#6b7280'}}>لا توجد امتحانات منشورة لهذا الصف.</p>
            ) : (
              <div className="egr-select-wrap">
                <i className="fas fa-clipboard-list egr-select-icon"></i>
                <select
                  className="egr-select"
                  value={currentExam}
                  onChange={(e) => handleExamChange(e.target.value)}
                >
                  <option value="">-- اختر الامتحان --</option>
                  {examsForGrade.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.number ? `${exam.number} — ` : ''}{exam.title}
                    </option>
                  ))}
                </select>
                <i className="fas fa-chevron-down egr-select-arrow"></i>
              </div>
            )}
          </div>
        )}

        {reportLoading && (
          <div style={{textAlign:'center', padding:'20px'}}>
            <i className="fas fa-spinner fa-spin"></i>
            <span style={{marginInlineStart:8}}>جاري حساب التقرير...</span>
          </div>
        )}

        {/* Summary Stats */}
        {displayedStudents.length > 0 && (
          <div className="egr-summary">
            <div className="egr-sum-card">
              <i className="fas fa-users egr-sum-icon" style={{color:'var(--primary)'}}></i>
              <span className="egr-sum-val" style={{color:'var(--primary)'}}>{totalStudents}</span>
              <span className="egr-sum-lbl">إجمالي الطلاب</span>
            </div>
            <div className="egr-sum-card">
              <i className="fas fa-check-circle egr-sum-icon" style={{color:'#48bb78'}}></i>
              <span className="egr-sum-val" style={{color:'#48bb78'}}>{passedCount}</span>
              <span className="egr-sum-lbl">ناجحون</span>
            </div>
            <div className="egr-sum-card">
              <i className="fas fa-times-circle egr-sum-icon" style={{color:'#ef4444'}}></i>
              <span className="egr-sum-val" style={{color:'#ef4444'}}>{failedCount}</span>
              <span className="egr-sum-lbl">راسبون</span>
            </div>
            <div className="egr-sum-card">
              <i className="fas fa-star egr-sum-icon" style={{color:'#f59e0b'}}></i>
              <span className="egr-sum-val" style={{color:'#f59e0b'}}>{excellentCount}</span>
              <span className="egr-sum-lbl">ممتازون</span>
            </div>
            <div className="egr-sum-card">
              <i className="fas fa-percentage egr-sum-icon" style={{color:'#ed8936'}}></i>
              <span className="egr-sum-val" style={{color:'#ed8936'}}>{avgScore}%</span>
              <span className="egr-sum-lbl">متوسط الدرجات</span>
            </div>
            <div className="egr-sum-card">
              <i className="fas fa-trophy egr-sum-icon" style={{color:'var(--secondary)'}}></i>
              <span className="egr-sum-val" style={{color:'var(--secondary)'}}>{passRate}%</span>
              <span className="egr-sum-lbl">نسبة النجاح</span>
            </div>
          </div>
        )}

        {/* Filter Chips */}
        {currentExam && allStudentsData.length > 0 && (
          <div className="egr-section">
            <h2 className="egr-section-title">
              <i className="fas fa-filter"></i>
              تصفية النتائج
            </h2>
            <div className="egr-chips">
              {[
                { key: 'all', label: 'الجميع', icon: 'fa-th-list' },
                { key: 'passed', label: 'ناجحون (≥60%)', icon: 'fa-check' },
                { key: 'failed', label: 'راسبون (<60%)', icon: 'fa-times' },
                { key: 'high', label: 'ممتازون (≥80%)', icon: 'fa-star' },
              ].map(({ key, label, icon }) => (
                <button
                  key={key}
                  className={`egr-chip egr-filter-chip ${currentFilter === key ? 'active' : ''}`}
                  onClick={() => filterStudents(key)}
                >
                  <i className={`fas ${icon}`}></i>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Report Table */}
        {displayedStudents.length > 0 && (
          <div className="egr-card" id="egr-reportTable">
            <div className="egr-card-header">
              <h2 className="egr-card-title">
                <i className="fas fa-clipboard-list"></i>
                تقرير النتائج التفصيلي
                <span className="egr-count-badge">{displayedStudents.length}</span>
              </h2>
              <button onClick={() => window.print()} className="egr-print-btn">
                <i className="fas fa-print"></i>
                طباعة التقرير
              </button>
            </div>

            <div className="egr-table-container">
              <table className="egr-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>اسم الطالب</th>
                    <th>رقم الطالب</th>
                    <th>الصف</th>
                    <th>آخر تسليم</th>
                    <th>النتيجة</th>
                    <th>التقييم</th>
                    <th>المحاولات</th>
                    <th>الدرجة</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedStudents.map((student, index) => (
                    <tr key={student.id + index} className="egr-tr">
                      <td className="egr-td-num">{index + 1}</td>
                      <td className="egr-td-name">
                        <div className="egr-name-cell">
                          <div className="egr-mini-avatar">
                            <i className="fas fa-user"></i>
                          </div>
                          <span>{student.name}</span>
                        </div>
                      </td>
                      <td><span className="egr-id-pill">{student.id}</span></td>
                      <td>{student.group}</td>
                      <td>{student.date}</td>
                      <td>
                        <span className={`egr-badge ${
                          student.status === 'passed' ? 'egr-badge-passed' :
                          student.status === 'failed' ? 'egr-badge-failed' : 'egr-badge-failed'
                        }`}>
                          <i className={`fas ${
                            student.status === 'passed' ? 'fa-check-circle' :
                            student.status === 'failed' ? 'fa-times-circle' : 'fa-minus-circle'
                          }`}></i>
                          {student.result}
                        </span>
                      </td>
                      <td>
                        <span className={`egr-rating ${
                          student.status === 'not_taken' ? 'egr-rating-poor' :
                          student.score >= 80 ? 'egr-rating-excellent' :
                          student.score >= 60 ? 'egr-rating-good' : 'egr-rating-poor'
                        }`}>
                          {student.rating}
                        </span>
                      </td>
                      <td><span className="egr-attempts">{student.attempts}/{student.maxAttempts}</span></td>
                      <td>
                        <div className="egr-score-cell">
                          <div className="egr-progress-bar">
                            <div
                              className={`egr-progress-fill ${
                                student.score >= 80 ? 'egr-prog-high' :
                                student.score >= 60 ? 'egr-prog-medium' : 'egr-prog-low'
                              }`}
                              style={{ width: `${student.score}%` }}
                            ></div>
                          </div>
                          <span className="egr-pct-text">
                            {student.status === 'not_taken' ? '—' : `${student.rawScore}/${student.maxScore}`}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
