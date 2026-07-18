import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import './ExamsGroupReport.css'
import { listStudentsByGrade } from '@backend/profilesApi'
import { listExams } from '@backend/examsApi'
import { supabase } from '@backend/supabase'
import { listCenterUniqueEvaluations, listCenterGradesForEvaluation } from '@backend/reportsApi'
import { listBranches } from '@backend/branchesApi'
import { cached, LIST_TTL } from '../utils/cache'
import PrintReportHeader from '../components/PrintReportHeader'

import { GRADE_LABEL, GRADE_ORDER } from './ControlPanel/shared'

export default function ExamsGroupReport() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const [students, setStudents] = useState([])
  const [exams, setExams]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [currentGrade, setCurrentGrade] = useState('')
  const [currentGroup, setCurrentGroup] = useState('') // class group label, '' = all
  const [currentExam, setCurrentExam]   = useState('') // exam id
  const [currentFilter, setCurrentFilter] = useState('all')

  const [branches, setBranches] = useState([])
  const [branchFilter, setBranchFilter] = useState('all')

  // Load branches
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await cached('branches-list', LIST_TTL, listBranches)
        if (!cancelled) setBranches(list)
      } catch (err) {
        console.error('Failed to load branches:', err)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const reportSource = searchParams.get('reportType') || 'online'
  const reportType = searchParams.get('type') || 'exam'
  const isQuiz = reportType === 'quiz'
  const pageTitle = reportSource === 'center'
    ? (isQuiz ? 'التقرير الجماعي لتسميعات السنتر' : 'التقرير الجماعي لامتحانات السنتر')
    : (isQuiz ? 'التقرير الجماعي للتسميعات' : 'التقرير الجماعي للامتحانات')
  const pageDesc = reportSource === 'center'
    ? (isQuiz ? 'تحليل نتائج الطلاب وأداء كل صف دراسي في التسميعات الشفوية والمتابعة بالسنتر' : 'تحليل نتائج الطلاب المسجلين بالسنتر وأداء كل صف دراسي')
    : (isQuiz ? 'تحليل نتائج الطلاب وأداء كل صف دراسي في التسميعات الأسبوعية' : 'تحليل نتائج الطلاب المسجلين وأداء كل صف دراسي')
  const selectLabel = isQuiz ? 'اختر التسميع' : 'اختر الامتحان'
  const selectPlaceholder = isQuiz ? '-- اختر التسميع --' : '-- اختر الامتحان --'

  const [allStudentsData, setAllStudentsData] = useState([])
  const [displayedStudents, setDisplayedStudents] = useState([])
  const [reportLoading, setReportLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (reportSource === 'center') {
          setExams([])
          setLoading(false)
        } else {
          const e = await cached('exams-lean', LIST_TTL, () => listExams({ lean: true }))
          if (cancelled) return
          setExams(e.filter(exam => (exam.exam_type || 'exam') === reportType))
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'تعذر تحميل البيانات')
      } finally {
        if (reportSource !== 'center') {
          if (!cancelled) setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [reportType, reportSource])

  // Grade chips come from the grades that actually have exams — you can only
  // report on a grade that has content anyway. Avoids scanning all students.
  const availableGrades = useMemo(() => {
    if (reportSource === 'center') {
      return GRADE_ORDER
    }
    const set = new Set(exams.map(e => e.grade).filter(Boolean))
    return GRADE_ORDER.filter(g => set.has(g))
  }, [exams, reportSource])

  // Load this grade's students only (lazy, scoped) when a grade is selected.
  useEffect(() => {
    if (!currentGrade) { setStudents([]); return }
    let cancelled = false
    ;(async () => {
      try {
        const rows = await cached(`students:grade:${currentGrade}`, LIST_TTL, () => listStudentsByGrade(currentGrade))
        if (!cancelled) setStudents(rows)

        if (reportSource === 'center') {
          const evals = await listCenterUniqueEvaluations(currentGrade, reportType)
          if (!cancelled) setExams(evals)
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'تعذر تحميل الطلاب')
      }
    })()
    return () => { cancelled = true }
  }, [currentGrade, reportSource, reportType])

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

  // Students after the (optional) group and branch filters are applied.
  const studentsForGrade = useMemo(() => {
    let result = studentsInGrade
    if (currentGroup) {
      result = result.filter(s => (s.group || '').trim() === currentGroup)
    }
    if (reportSource === 'center' && branchFilter !== 'all') {
      result = result.filter(s => s.branch_id === branchFilter)
    }
    return result
  }, [studentsInGrade, currentGroup, branchFilter, reportSource])

  const selectGrade = (grade) => {
    setCurrentGrade(grade)
    setCurrentGroup('')
    setCurrentExam('')
    setAllStudentsData([])
    setDisplayedStudents([])
    setCurrentFilter('all')
    setBranchFilter('all')
  }

  const selectGroup = (group) => {
    setCurrentGroup(group)
    // Cached rows are scoped to the previous group — clear them.
    setCurrentExam('')
    setAllStudentsData([])
    setDisplayedStudents([])
    setCurrentFilter('all')
    setBranchFilter('all')
  }

  const handleExamChange = (examId) => {
    setCurrentExam(examId)
  }

  // Centralized effect to trigger report loading when selections change
  useEffect(() => {
    if (currentExam && currentGrade) {
      loadReport(currentExam)
    } else {
      setAllStudentsData([])
      setDisplayedStudents([])
    }
    // `students` is included so the report runs once this grade's students
    // finish loading lazily (they may arrive after the exam is selected).
  }, [currentExam, currentGrade, currentGroup, students, branchFilter])

  // Handle auto-preselection from router state (e.g. clicked notification)
  const initialLoadRef = useRef(false)
  useEffect(() => {
    if (loading || exams.length === 0 || initialLoadRef.current) return
    const targetExamId = location.state?.examId
    if (targetExamId) {
      const exam = exams.find(e => e.id === targetExamId)
      if (exam) {
        initialLoadRef.current = true
        setCurrentGrade(exam.grade)   // triggers the lazy student load
        setCurrentExam(exam.id)
      }
    }
  }, [loading, exams, location.state])

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
      // Cache the attempts payload per exam+grade. Flipping the dropdown
      // back to a previously-viewed exam serves from memory; the 5min TTL
      // is fine because admins refresh the page if they need live numbers.
      let attempts = []
      if (reportSource === 'center') {
        const gradesList = await listCenterGradesForEvaluation(reportType, examId)
        attempts = gradesList.map(g => ({
          student_id: g.student_id,
          score: parseFloat(g.score) || 0,
          max_score: parseFloat(g.max_score) || maxScore || 100,
          submitted_at: g.created_at,
          teacher: g.creator?.name || '—',
          branch: g.profiles?.branches?.name || '—'
        }))
      } else {
        const cacheKey = `exam_attempts:${examId}:${currentGrade || 'all'}`
        attempts = await cached(cacheKey, LIST_TTL, async () => {
          const { data, error } = await supabase
            .from('exam_attempts')
            .select('student_id, score, max_score, submitted_at')
            .eq('exam_id', examId)
            .in('student_id', ids)
            .not('submitted_at', 'is', null)
          if (error) throw error
          return data || []
        })
      }

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
          teacher: entry?.best?.teacher || '—',
          branch: entry?.best?.branch || '—',
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

  const exportToCsv = () => {
    const csvCell = (val) => `"${String(val == null ? '' : val).replace(/"/g, '""')}"`
    const isCenter = reportSource === 'center'
    const headers = [
      '#',
      'اسم الطالب',
      'رقم الطالب',
      'المجموعة',
      ...(isCenter ? ['المعلم', 'الفرع'] : []),
      isCenter ? 'التاريخ' : 'آخر تسليم',
      'النتيجة',
      'التقييم',
      ...(isCenter ? [] : ['المحاولات']),
      'الدرجة الفردية',
      'الدرجة الكلية',
      'النسبة المئوية'
    ]
    const rows = displayedStudents.map((s, idx) => [
      idx + 1,
      s.name,
      s.id,
      s.group,
      ...(isCenter ? [s.teacher, s.branch] : []),
      s.date,
      s.result,
      s.rating,
      ...(isCenter ? [] : [`${s.attempts}/${s.maxAttempts}`]),
      s.rawScore,
      s.maxScore,
      `${s.score}%`
    ])

    const content = '\uFEFF' + [headers.map(csvCell).join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\n')
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${isQuiz ? 'quizzes' : 'exams'}-group-report-${currentGrade}-${currentExam || 'all'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <main className="cp-page">
        <div className="cp-container">
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--cp-text-muted)' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '2.5rem', marginBottom: 16 }}></i>
            <p style={{ margin: 0, fontSize: '1.1rem' }}>جاري التحميل...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="cp-page">
      <div className="cp-container">

        {/* Back */}
        <button className="cp-crumbs-back" onClick={() => navigate(-1)} style={{ marginBottom: '1.5rem' }}>
          <i className="fas fa-arrow-right"></i>
          <span>رجوع</span>
        </button>

        {/* Header */}
        <div className="cp-page-header">
          <div className="cp-page-header-text">
            <h1>{pageTitle}</h1>
            <p>{pageDesc}</p>
          </div>
          <div className="cp-page-icon">
            <i className={`fas ${isQuiz ? 'fa-chart-line' : 'fa-chart-pie'}`}></i>
          </div>
        </div>
        <div className="cp-header-divider"></div>

        {loadError && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', padding: '12px 16px', borderRadius: 12, marginBottom: 20, direction: 'rtl' }}>
            <p style={{ margin: 0 }}>{loadError}</p>
          </div>
        )}

        {/* Stepper */}
        <div className="cp-panel" style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center', padding: '1rem', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: currentGrade ? '#10b981' : '#5bc2e7',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700
            }}>
              {currentGrade ? <i className="fas fa-check"></i> : 1}
            </div>
            <span style={{ color: 'var(--cp-text-main)', fontWeight: 600 }}>الصف الدراسي</span>
          </div>
          <div style={{ flex: 1, maxWidth: 100, height: 2, background: 'var(--cp-divider)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: currentExam ? '#10b981' : currentGrade ? '#5bc2e7' : 'var(--cp-divider)',
              color: currentGrade ? '#fff' : 'var(--cp-text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700
            }}>
              {currentExam ? <i className="fas fa-check"></i> : 2}
            </div>
            <span style={{ color: currentGrade ? 'var(--cp-text-main)' : 'var(--cp-text-muted)', fontWeight: 600 }}>{isQuiz ? 'التسميع' : 'الامتحان'}</span>
          </div>
        </div>

        {/* Grade */}
        <div className="cp-panel" style={{ padding: '1.5rem', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 16px', color: 'var(--cp-text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-school" style={{ color: '#5bc2e7' }}></i> اختر الصف الدراسي
          </h2>
          {availableGrades.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--cp-text-muted)' }}>لا يوجد طلاب مسجلون بعد.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {availableGrades.map((grade) => (
                <button
                  key={grade}
                  className={`cp-btn ${currentGrade === grade ? 'cp-btn-success' : 'cp-btn-ghost'}`}
                  onClick={() => selectGrade(grade)}
                  style={{ borderRadius: 12, padding: '10px 18px' }}
                >
                  <i className="fas fa-graduation-cap" style={{ marginLeft: 6 }}></i>
                  {GRADE_LABEL[grade]}
                  <span className="cp-badge cp-badge-neutral" style={{ marginInlineStart: 8, background: 'rgba(255,255,255,0.15)', color: 'inherit' }}>
                    {students.filter(s => s.grade === grade).length}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Group */}
        {currentGrade && groupsForGrade.length > 0 && (
          <div className="cp-panel" style={{ padding: '1.5rem', marginBottom: 20 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 16px', color: 'var(--cp-text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-user-group" style={{ color: '#10b981' }}></i> اختر المجموعة
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <button
                className={`cp-btn ${currentGroup === '' ? 'cp-btn-success' : 'cp-btn-ghost'}`}
                onClick={() => selectGroup('')}
                style={{ borderRadius: 12, padding: '10px 18px' }}
              >
                <i className="fas fa-layer-group" style={{ marginLeft: 6 }}></i>
                كل المجموعات
                <span className="cp-badge cp-badge-neutral" style={{ marginInlineStart: 8, background: 'rgba(255,255,255,0.15)', color: 'inherit' }}>
                  {studentsInGrade.length}
                </span>
              </button>
              {groupsForGrade.map((g) => (
                <button
                  key={g}
                  className={`cp-btn ${currentGroup === g ? 'cp-btn-success' : 'cp-btn-ghost'}`}
                  onClick={() => selectGroup(g)}
                  style={{ borderRadius: 12, padding: '10px 18px' }}
                >
                  <i className="fas fa-user-group" style={{ marginLeft: 6 }}></i>
                  {g}
                  <span className="cp-badge cp-badge-neutral" style={{ marginInlineStart: 8, background: 'rgba(255,255,255,0.15)', color: 'inherit' }}>
                    {studentsInGrade.filter(s => (s.group || '').trim() === g).length}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Exam & Branch (For Center) */}
        {currentGrade && (
          <div className="cp-panel" style={{ padding: '1.5rem', marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: reportSource === 'center' ? '1fr 1fr' : '1fr', gap: 20 }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 16px', color: 'var(--cp-text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className={`fas ${isQuiz ? 'fa-book-open' : 'fa-file-alt'}`} style={{ color: '#8b5cf6' }}></i> {selectLabel}
                </h2>
                {examsForGrade.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--cp-text-muted)' }}>لا توجد {isQuiz ? 'تسميعات' : 'امتحانات'} منشورة لهذا الصف.</p>
                ) : (
                  <div style={{ position: 'relative', width: '100%' }}>
                    <i className="fas fa-clipboard-list" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--cp-text-muted)', zIndex: 1 }}></i>
                    <select
                      className="cp-input"
                      value={currentExam}
                      onChange={(e) => handleExamChange(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 42px 12px 16px',
                        borderRadius: 12,
                        background: 'var(--cp-card-bg)',
                        border: '1px solid var(--cp-card-border)',
                        color: 'var(--cp-text-main)',
                        fontSize: '0.95rem',
                        fontWeight: 600,
                        appearance: 'none',
                        cursor: 'pointer',
                        outline: 'none',
                        height: 48
                      }}
                    >
                      <option value="">{selectPlaceholder}</option>
                      {examsForGrade.map((exam) => (
                        <option key={exam.id} value={exam.id} style={{ background: 'var(--cp-card-bg)', color: 'var(--cp-text-main)' }}>
                          {exam.number ? `${exam.number} — ` : ''}{exam.title}
                        </option>
                      ))}
                    </select>
                    <i className="fas fa-chevron-down" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--cp-text-muted)', pointerEvents: 'none' }}></i>
                  </div>
                )}
              </div>

              {reportSource === 'center' && (
                <div>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 16px', color: 'var(--cp-text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="fas fa-building" style={{ color: '#5bc2e7' }}></i> الفرع
                  </h2>
                  <div style={{ position: 'relative', width: '100%' }}>
                    <i className="fas fa-building" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--cp-text-muted)', zIndex: 1 }}></i>
                    <select
                      className="cp-input"
                      value={branchFilter}
                      onChange={(e) => setBranchFilter(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 42px 12px 16px',
                        borderRadius: 12,
                        background: 'var(--cp-card-bg)',
                        border: '1px solid var(--cp-card-border)',
                        color: 'var(--cp-text-main)',
                        fontSize: '0.95rem',
                        fontWeight: 600,
                        appearance: 'none',
                        cursor: 'pointer',
                        outline: 'none',
                        height: 48
                      }}
                    >
                      <option value="all">جميع الفروع</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    <i className="fas fa-chevron-down" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--cp-text-muted)', pointerEvents: 'none' }}></i>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {reportLoading && (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--cp-text-muted)' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.5rem', marginBottom: 8 }}></i>
            <p style={{ margin: 0 }}>جاري حساب التقرير...</p>
          </div>
        )}

        {/* Summary Stats */}
        {displayedStudents.length > 0 && (
          <div className="cp-stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
            <div className="cp-stat">
              <i className="fas fa-users" style={{ color: '#5bc2e7' }}></i>
              <div>
                <div className="cp-stat-val" style={{ color: 'var(--cp-text-main)' }}>{totalStudents}</div>
                <div className="cp-stat-lbl">إجمالي الطلاب</div>
              </div>
            </div>
            <div className="cp-stat cp-stat-good">
              <i className="fas fa-check-circle"></i>
              <div>
                <div className="cp-stat-val">{passedCount}</div>
                <div className="cp-stat-lbl">ناجحون</div>
              </div>
            </div>
            <div className="cp-stat cp-stat-bad">
              <i className="fas fa-times-circle"></i>
              <div>
                <div className="cp-stat-val">{failedCount}</div>
                <div className="cp-stat-lbl">راسبون</div>
              </div>
            </div>
            <div className="cp-stat cp-stat-info">
              <i className="fas fa-star" style={{ color: '#f59e0b' }}></i>
              <div>
                <div className="cp-stat-val" style={{ color: '#f59e0b' }}>{excellentCount}</div>
                <div className="cp-stat-lbl">ممتازون</div>
              </div>
            </div>
            <div className="cp-stat" style={{ borderRight: '3px solid #ed8936' }}>
              <i className="fas fa-percentage" style={{ color: '#ed8936' }}></i>
              <div>
                <div className="cp-stat-val" style={{ color: '#ed8936' }}>{avgScore}%</div>
                <div className="cp-stat-lbl">متوسط الدرجات</div>
              </div>
            </div>
            <div className="cp-stat" style={{ borderRight: '3px solid #818cf8' }}>
              <i className="fas fa-trophy" style={{ color: '#818cf8' }}></i>
              <div>
                <div className="cp-stat-val" style={{ color: '#818cf8' }}>{passRate}%</div>
                <div className="cp-stat-lbl">نسبة النجاح</div>
              </div>
            </div>
          </div>
        )}

        {/* Filter Chips */}
        {currentExam && allStudentsData.length > 0 && (
          <div className="cp-panel" style={{ padding: '1.5rem', marginBottom: 20 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 16px', color: 'var(--cp-text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-filter" style={{ color: '#5bc2e7' }}></i> تصفية النتائج
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {[
                { key: 'all', label: 'الجميع', icon: 'fa-th-list' },
                { key: 'passed', label: 'ناجحون (≥60%)', icon: 'fa-check' },
                { key: 'failed', label: 'راسبون (<60%)', icon: 'fa-times' },
                { key: 'high', label: 'ممتازون (≥80%)', icon: 'fa-star' },
              ].map(({ key, label, icon }) => (
                <button
                  key={key}
                  className={`cp-btn ${currentFilter === key ? 'cp-btn-success' : 'cp-btn-ghost'}`}
                  onClick={() => filterStudents(key)}
                  style={{ borderRadius: 12, padding: '8px 16px' }}
                >
                  <i className={`fas ${icon}`} style={{ marginLeft: 6 }}></i>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Report Table */}
        {displayedStudents.length > 0 && (
          <div className="cp-table-card" id="egr-reportTable">
        <PrintReportHeader subtitle={reportSource === 'center' ? (isQuiz ? 'التقرير الجماعي لتسميعات السنتر' : 'التقرير الجماعي لامتحانات السنتر') : 'التقرير الجماعي للامتحانات'} />
        <div className="cp-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--cp-text-main)' }}>
              <i className="fas fa-clipboard-list" style={{ color: '#5bc2e7', marginLeft: 8 }}></i>
              تقرير النتائج التفصيلي
            </h2>
            <span className="cp-badge cp-badge-neutral">{displayedStudents.length}</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={exportToCsv} className="cp-crumbs-back" style={{ padding: '6px 12px', background: 'transparent' }}>
              <i className="fas fa-file-csv" style={{ marginLeft: 6 }}></i>
              تصدير CSV
            </button>
            <button onClick={() => window.print()} className="cp-crumbs-back" style={{ padding: '6px 12px', background: 'transparent' }}>
              <i className="fas fa-print" style={{ marginLeft: 6 }}></i>
              طباعة التقرير
            </button>
          </div>
        </div>

        <div className="cp-table-container">
          <table className="cp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>اسم الطالب</th>
                <th>رقم الطالب</th>
                <th>المجموعة</th>
                {reportSource === 'center' && <th>المعلم</th>}
                {reportSource === 'center' && <th>الفرع</th>}
                <th>{reportSource === 'center' ? 'التاريخ' : 'آخر تسليم'}</th>
                <th>النتيجة</th>
                <th>التقييم</th>
                {reportSource !== 'center' && <th>المحاولات</th>}
                <th>الدرجة</th>
              </tr>
            </thead>
            <tbody>
              {displayedStudents.map((student, index) => (
                <tr key={student.id + index}>
                  <td>{index + 1}</td>
                  <td style={{ fontWeight: 700 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="cp-avatar cp-avatar-purple" style={{ width: 32, height: 32, fontSize: '0.9rem' }}>
                        <i className="fas fa-user"></i>
                      </div>
                      <span>{student.name}</span>
                    </div>
                  </td>
                  <td><span className="cp-id-pill"><i className="fas fa-id-badge"></i> {student.id}</span></td>
                  <td>{student.group}</td>
                  {reportSource === 'center' && <td>{student.teacher}</td>}
                  {reportSource === 'center' && <td>{student.branch}</td>}
                  <td>{student.date}</td>
                  <td>
                    <span className={`cp-badge ${
                      student.status === 'passed' ? 'cp-badge-success' : 'cp-badge-danger'
                    }`}>
                      <i className={`fas ${
                        student.status === 'passed' ? 'fa-check-circle' :
                        student.status === 'failed' ? 'fa-times-circle' : 'fa-minus-circle'
                      }`}></i>
                      {student.result}
                    </span>
                  </td>
                  <td>
                    <span className={`cp-badge ${
                      student.status === 'not_taken' ? 'cp-badge-danger' :
                      student.score >= 80 ? 'cp-badge-success' :
                      student.score >= 60 ? 'cp-badge-warning' : 'cp-badge-danger'
                    }`}>{student.rating}</span>
                  </td>
                  {reportSource !== 'center' && <td><span style={{ color: 'var(--cp-text-muted)', fontWeight: 600 }}>{`${student.attempts}/${student.maxAttempts}`}</span></td>}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="hide-on-print" style={{ flex: 1, minWidth: 60, height: 6, background: 'var(--cp-divider)', borderRadius: 3, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${student.score}%`,
                            height: '100%',
                            background: student.score >= 80 ? '#10b981' : student.score >= 60 ? '#f59e0b' : '#ef4444',
                            borderRadius: 3
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>
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
