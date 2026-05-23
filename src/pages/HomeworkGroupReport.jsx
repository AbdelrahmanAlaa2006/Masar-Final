import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import './HomeworkGroupReport.css'
import { listStudents } from '@backend/profilesApi'
import { listHomeworks, listSubmissionsForHomework } from '@backend/homeworksApi'
import { cached, LIST_TTL } from '../utils/cache'

const GRADE_LABEL = {
  'first-prep':  'الأول الإعدادي',
  'second-prep': 'الثاني الإعدادي',
  'third-prep':  'الثالث الإعدادي',
}
const GRADE_ORDER = ['first-prep', 'second-prep', 'third-prep']

export default function HomeworkGroupReport() {
  const navigate = useNavigate()
  const location = useLocation()

  const [students, setStudents] = useState([])
  const [homeworks, setHomeworks] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [currentGrade, setCurrentGrade] = useState('')
  const [currentGroup, setCurrentGroup] = useState('')
  const [currentHomework, setCurrentHomework] = useState('')
  const [currentFilter, setCurrentFilter] = useState('all')

  const [allStudentsData, setAllStudentsData] = useState([])
  const [displayedStudents, setDisplayedStudents] = useState([])
  const [reportLoading, setReportLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [s, h] = await Promise.all([
          cached('students', LIST_TTL, listStudents),
          cached('homeworks', LIST_TTL, listHomeworks),
        ])
        if (cancelled) return
        setStudents(s)
        setHomeworks(h)
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

  const hwForGrade = useMemo(
    () => homeworks.filter(h => h.grade === currentGrade),
    [homeworks, currentGrade]
  )

  const studentsInGrade = useMemo(
    () => students.filter(s => s.grade === currentGrade),
    [students, currentGrade]
  )

  const groupsForGrade = useMemo(() => {
    const set = new Set(
      studentsInGrade.map(s => (s.group || '').trim()).filter(Boolean)
    )
    return [...set].sort((a, b) => a.localeCompare(b, 'ar'))
  }, [studentsInGrade])

  const studentsForGrade = useMemo(() => {
    if (!currentGroup) return studentsInGrade
    return studentsInGrade.filter(s => (s.group || '').trim() === currentGroup)
  }, [studentsInGrade, currentGroup])

  const selectGrade = (grade) => {
    setCurrentGrade(grade)
    setCurrentGroup('')
    setCurrentHomework('')
    setAllStudentsData([])
    setDisplayedStudents([])
    setCurrentFilter('all')
  }

  const selectGroup = (group) => {
    setCurrentGroup(group)
    setCurrentHomework('')
    setAllStudentsData([])
    setDisplayedStudents([])
    setCurrentFilter('all')
  }

  const handleHomeworkChange = (hwId) => {
    setCurrentHomework(hwId)
  }

  // Centralized effect to trigger report loading when selections change
  useEffect(() => {
    if (currentHomework && currentGrade) {
      loadReport(currentHomework)
    } else {
      setAllStudentsData([])
      setDisplayedStudents([])
    }
  }, [currentHomework, currentGrade, currentGroup])

  // Handle auto-preselection from router state (e.g. clicked notification)
  const initialLoadRef = useRef(false)
  useEffect(() => {
    if (loading || homeworks.length === 0 || students.length === 0 || initialLoadRef.current) return
    const targetHwId = location.state?.homeworkId
    if (targetHwId) {
      const hw = homeworks.find(h => h.id === targetHwId)
      if (hw) {
        initialLoadRef.current = true
        setCurrentGrade(hw.grade)
        setCurrentHomework(hw.id)
      }
    }
  }, [loading, homeworks, students, location.state])

  const loadReport = async (hwId) => {
    const hw = homeworks.find(h => h.id === hwId)
    if (!hw) return
    const maxScore = hw.max_score || 0
    const gradeStudents = studentsForGrade
    if (gradeStudents.length === 0) {
      setAllStudentsData([]); setDisplayedStudents([]); return
    }

    setReportLoading(true)
    try {
      const submissions = await cached(
        `hw_subs:${hwId}`, LIST_TTL,
        () => listSubmissionsForHomework(hwId)
      )

      // Build a map: student_id -> submission row
      const subByStudent = {}
      for (const s of (submissions || [])) {
        // Keep the latest submission per student
        const prev = subByStudent[s.student_id]
        if (!prev || new Date(s.submitted_at) > new Date(prev.submitted_at)) {
          subByStudent[s.student_id] = s
        }
      }

      const rows = gradeStudents.map(stu => {
        const sub = subByStudent[stu.id]
        const rawScore = sub?.score ?? 0
        const subMax = sub?.max_score || maxScore || 1
        const pct = sub ? Math.round((rawScore / subMax) * 100) : 0

        let rating = 'ممتاز'
        if (!sub)              rating = 'لم يُسلِّم'
        else if (pct < 60)     rating = 'يحتاج تحسين'
        else if (pct < 80)     rating = 'جيد'

        const status = !sub ? 'not_submitted' : (pct >= 60 ? 'passed' : 'failed')
        const result = !sub ? 'لم يُسلِّم' : (pct >= 60 ? 'نجح' : 'لم ينجح')
        const date = sub?.submitted_at
          ? new Date(sub.submitted_at).toLocaleDateString('ar-EG')
          : '—'

        return {
          name: stu.name,
          id: stu.phone || stu.id.slice(0, 8),
          group: (stu.group || '').trim() || GRADE_LABEL[stu.grade] || '',
          homework: hw.title,
          date,
          score: pct,
          rawScore: sub ? rawScore : 0,
          maxScore: subMax,
          result,
          rating,
          status,
        }
      })

      setAllStudentsData(rows)
      setDisplayedStudents(rows)
    } catch (e) {
      setLoadError(e.message || 'تعذر تحميل تقرير الواجب')
    } finally {
      setReportLoading(false)
    }
  }

  const filterStudents = (filter) => {
    setCurrentFilter(filter)
    let filteredData = allStudentsData
    switch (filter) {
      case 'passed': filteredData = allStudentsData.filter(s => s.status === 'passed'); break
      case 'failed': filteredData = allStudentsData.filter(s => s.status === 'failed'); break
      case 'high':   filteredData = allStudentsData.filter(s => s.score >= 80 && s.status !== 'not_submitted'); break
      default:       filteredData = allStudentsData
    }
    setDisplayedStudents(filteredData)
  }

  // Summary stats
  const submitted = allStudentsData.filter(s => s.status !== 'not_submitted')
  const totalStudents  = allStudentsData.length
  const passedCount    = allStudentsData.filter(s => s.status === 'passed').length
  const failedCount    = allStudentsData.filter(s => s.status === 'failed').length
  const excellentCount = allStudentsData.filter(s => s.score >= 80 && s.status !== 'not_submitted').length
  const avgScore = submitted.length > 0
    ? Math.round(submitted.reduce((s, x) => s + x.score, 0) / submitted.length)
    : 0
  const submitRate = totalStudents > 0 ? Math.round((submitted.length / totalStudents) * 100) : 0

  if (loading) {
    return (
      <main className="hgr-page">
        <div className="hgr-container">
          <div className="hgr-header" style={{textAlign:'center', padding:'40px'}}>
            <i className="fas fa-spinner fa-spin" style={{fontSize:'2rem'}}></i>
            <p>جاري التحميل...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="hgr-page">
      <div className="hgr-container">

        {/* Back */}
        <button className="hgr-back-btn" onClick={() => navigate(-1)}>
          <i className="fas fa-arrow-right"></i>
          رجوع
        </button>

        {/* Header */}
        <div className="hgr-header">
          <div className="hgr-header-icon">
            <i className="fas fa-chart-bar"></i>
          </div>
          <h1>التقرير الجماعي للواجبات</h1>
          <p>تحليل نتائج تسليم الواجبات وأداء كل صف</p>
        </div>

        {loadError && (
          <div className="hgr-header" style={{background:'#fee2e2', color:'#991b1b', padding:'12px', borderRadius:12}}>
            <p style={{margin:0}}>{loadError}</p>
          </div>
        )}

        {/* Stepper */}
        <div className="hgr-stepper">
          <div className={`hgr-step ${currentGrade ? 'done' : 'active'}`}>
            <div className="hgr-step-num">
              {currentGrade ? <i className="fas fa-check"></i> : 1}
            </div>
            <span>الصف</span>
          </div>
          <div className="hgr-step-line"></div>
          <div className={`hgr-step ${currentHomework ? 'done' : currentGrade ? 'active' : ''}`}>
            <div className="hgr-step-num">
              {currentHomework ? <i className="fas fa-check"></i> : 2}
            </div>
            <span>الواجب</span>
          </div>
        </div>

        {/* Grade */}
        <div className="hgr-section">
          <h2 className="hgr-section-title">
            <i className="fas fa-school"></i>
            اختر الصف الدراسي
          </h2>
          {availableGrades.length === 0 ? (
            <p style={{textAlign:'center', color:'#6b7280'}}>لا يوجد طلاب مسجلون بعد.</p>
          ) : (
            <div className="hgr-chips">
              {availableGrades.map((grade) => (
                <button
                  key={grade}
                  className={`hgr-chip ${currentGrade === grade ? 'active' : ''}`}
                  onClick={() => selectGrade(grade)}
                >
                  <i className="fas fa-graduation-cap"></i>
                  {GRADE_LABEL[grade]}
                  <span className="hgr-count-badge" style={{marginInlineStart:8}}>
                    {students.filter(s => s.grade === grade).length}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Group */}
        {currentGrade && groupsForGrade.length > 0 && (
          <div className="hgr-section">
            <h2 className="hgr-section-title">
              <i className="fas fa-user-group"></i>
              اختر المجموعة
            </h2>
            <div className="hgr-chips">
              <button
                className={`hgr-chip ${currentGroup === '' ? 'active' : ''}`}
                onClick={() => selectGroup('')}
              >
                <i className="fas fa-layer-group"></i>
                كل المجموعات
                <span className="hgr-count-badge" style={{marginInlineStart:8}}>
                  {studentsInGrade.length}
                </span>
              </button>
              {groupsForGrade.map((g) => (
                <button
                  key={g}
                  className={`hgr-chip ${currentGroup === g ? 'active' : ''}`}
                  onClick={() => selectGroup(g)}
                >
                  <i className="fas fa-user-group"></i>
                  {g}
                  <span className="hgr-count-badge" style={{marginInlineStart:8}}>
                    {studentsInGrade.filter(s => (s.group || '').trim() === g).length}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Homework */}
        {currentGrade && (
          <div className="hgr-section">
            <h2 className="hgr-section-title">
              <i className="fas fa-book-open"></i>
              اختر الواجب
            </h2>
            {hwForGrade.length === 0 ? (
              <p style={{textAlign:'center', color:'#6b7280'}}>لا توجد واجبات منشورة لهذا الصف.</p>
            ) : (
              <div className="hgr-select-wrap">
                <i className="fas fa-clipboard-list hgr-select-icon"></i>
                <select
                  className="hgr-select"
                  value={currentHomework}
                  onChange={(e) => handleHomeworkChange(e.target.value)}
                >
                  <option value="">-- اختر الواجب --</option>
                  {hwForGrade.map((hw) => (
                    <option key={hw.id} value={hw.id}>
                      {hw.week ? `${hw.week} — ` : ''}{hw.title}
                    </option>
                  ))}
                </select>
                <i className="fas fa-chevron-down hgr-select-arrow"></i>
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
          <div className="hgr-summary">
            <div className="hgr-sum-card">
              <i className="fas fa-users hgr-sum-icon" style={{color:'#10b981'}}></i>
              <span className="hgr-sum-val" style={{color:'#10b981'}}>{totalStudents}</span>
              <span className="hgr-sum-lbl">إجمالي الطلاب</span>
            </div>
            <div className="hgr-sum-card">
              <i className="fas fa-check-circle hgr-sum-icon" style={{color:'#48bb78'}}></i>
              <span className="hgr-sum-val" style={{color:'#48bb78'}}>{passedCount}</span>
              <span className="hgr-sum-lbl">ناجحون</span>
            </div>
            <div className="hgr-sum-card">
              <i className="fas fa-times-circle hgr-sum-icon" style={{color:'#ef4444'}}></i>
              <span className="hgr-sum-val" style={{color:'#ef4444'}}>{failedCount}</span>
              <span className="hgr-sum-lbl">راسبون</span>
            </div>
            <div className="hgr-sum-card">
              <i className="fas fa-star hgr-sum-icon" style={{color:'#f59e0b'}}></i>
              <span className="hgr-sum-val" style={{color:'#f59e0b'}}>{excellentCount}</span>
              <span className="hgr-sum-lbl">ممتازون</span>
            </div>
            <div className="hgr-sum-card">
              <i className="fas fa-percentage hgr-sum-icon" style={{color:'#ed8936'}}></i>
              <span className="hgr-sum-val" style={{color:'#ed8936'}}>{avgScore}%</span>
              <span className="hgr-sum-lbl">متوسط الدرجات</span>
            </div>
            <div className="hgr-sum-card">
              <i className="fas fa-paper-plane hgr-sum-icon" style={{color:'var(--secondary, #818cf8)'}}></i>
              <span className="hgr-sum-val" style={{color:'var(--secondary, #818cf8)'}}>{submitRate}%</span>
              <span className="hgr-sum-lbl">نسبة التسليم</span>
            </div>
          </div>
        )}

        {/* Filter Chips */}
        {currentHomework && allStudentsData.length > 0 && (
          <div className="hgr-section">
            <h2 className="hgr-section-title">
              <i className="fas fa-filter"></i>
              تصفية النتائج
            </h2>
            <div className="hgr-chips">
              {[
                { key: 'all', label: 'الجميع', icon: 'fa-th-list' },
                { key: 'passed', label: 'ناجحون (≥60%)', icon: 'fa-check' },
                { key: 'failed', label: 'راسبون (<60%)', icon: 'fa-times' },
                { key: 'high', label: 'ممتازون (≥80%)', icon: 'fa-star' },
              ].map(({ key, label, icon }) => (
                <button
                  key={key}
                  className={`hgr-chip hgr-filter-chip ${currentFilter === key ? 'active' : ''}`}
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
          <div className="hgr-card" id="hgr-reportTable">
            <div className="hgr-card-header">
              <h2 className="hgr-card-title">
                <i className="fas fa-clipboard-list"></i>
                تقرير الواجبات التفصيلي
                <span className="hgr-count-badge">{displayedStudents.length}</span>
              </h2>
              <button onClick={() => window.print()} className="hgr-print-btn">
                <i className="fas fa-print"></i>
                طباعة التقرير
              </button>
            </div>

            <div className="hgr-table-container">
              <table className="hgr-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>اسم الطالب</th>
                    <th>رقم الطالب</th>
                    <th>المجموعة</th>
                    <th>تاريخ التسليم</th>
                    <th>النتيجة</th>
                    <th>التقييم</th>
                    <th>الدرجة</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedStudents.map((student, index) => (
                    <tr key={student.id + index} className="hgr-tr">
                      <td className="hgr-td-num">{index + 1}</td>
                      <td className="hgr-td-name">
                        <div className="hgr-name-cell">
                          <div className="hgr-mini-avatar">
                            <i className="fas fa-user"></i>
                          </div>
                          <span>{student.name}</span>
                        </div>
                      </td>
                      <td><span className="hgr-id-pill">{student.id}</span></td>
                      <td>{student.group}</td>
                      <td>{student.date}</td>
                      <td>
                        <span className={`hgr-badge ${
                          student.status === 'passed' ? 'hgr-badge-passed' :
                          student.status === 'failed' ? 'hgr-badge-failed' : 'hgr-badge-failed'
                        }`}>
                          <i className={`fas ${
                            student.status === 'passed' ? 'fa-check-circle' :
                            student.status === 'failed' ? 'fa-times-circle' : 'fa-minus-circle'
                          }`}></i>
                          {student.result}
                        </span>
                      </td>
                      <td>
                        <span className={`hgr-rating ${
                          student.status === 'not_submitted' ? 'hgr-rating-poor' :
                          student.score >= 80 ? 'hgr-rating-excellent' :
                          student.score >= 60 ? 'hgr-rating-good' : 'hgr-rating-poor'
                        }`}>
                          {student.rating}
                        </span>
                      </td>
                      <td>
                        <div className="hgr-score-cell">
                          <div className="hgr-progress-bar">
                            <div
                              className={`hgr-progress-fill ${
                                student.score >= 80 ? 'hgr-prog-high' :
                                student.score >= 60 ? 'hgr-prog-medium' : 'hgr-prog-low'
                              }`}
                              style={{ width: `${student.score}%` }}
                            ></div>
                          </div>
                          <span className="hgr-pct-text">
                            {student.status === 'not_submitted' ? '—' : `${student.rawScore}/${student.maxScore}`}
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
