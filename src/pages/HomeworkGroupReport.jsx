import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import './HomeworkGroupReport.css'
import { listStudentsByGrade } from '@backend/profilesApi'
import { listHomeworks, listSubmissionsForHomework } from '@backend/homeworksApi'
import { cached, LIST_TTL } from '../utils/cache'
import PrintReportHeader from '../components/PrintReportHeader'

import { GRADE_LABEL, GRADE_ORDER } from './ControlPanel/shared'

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
        // Load only the homeworks list upfront. Students load lazily per grade.
        const h = await cached('homeworks', LIST_TTL, listHomeworks)
        if (cancelled) return
        setHomeworks(h)
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'تعذر تحميل البيانات')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Grade chips come from grades that have homeworks (you can only report on a
  // grade that has content). Avoids scanning the whole student roster.
  const availableGrades = useMemo(() => {
    const set = new Set(homeworks.map(h => h.grade).filter(Boolean))
    return GRADE_ORDER.filter(g => set.has(g))
  }, [homeworks])

  // Load this grade's students only (lazy, scoped) when a grade is selected.
  useEffect(() => {
    if (!currentGrade) { setStudents([]); return }
    let cancelled = false
    ;(async () => {
      try {
        const rows = await cached(`students:grade:${currentGrade}`, LIST_TTL, () => listStudentsByGrade(currentGrade))
        if (!cancelled) setStudents(rows)
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'تعذر تحميل الطلاب')
      }
    })()
    return () => { cancelled = true }
  }, [currentGrade])

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

  // Centralized effect to trigger report loading when selections change.
  // `students` is included so the report runs once this grade's students
  // finish loading lazily (they may arrive after the homework is selected).
  useEffect(() => {
    if (currentHomework && currentGrade) {
      loadReport(currentHomework)
    } else {
      setAllStudentsData([])
      setDisplayedStudents([])
    }
  }, [currentHomework, currentGrade, currentGroup, students])

  // Handle auto-preselection from router state (e.g. clicked notification)
  const initialLoadRef = useRef(false)
  useEffect(() => {
    if (loading || homeworks.length === 0 || initialLoadRef.current) return
    const targetHwId = location.state?.homeworkId
    if (targetHwId) {
      const hw = homeworks.find(h => h.id === targetHwId)
      if (hw) {
        initialLoadRef.current = true
        setCurrentGrade(hw.grade)   // triggers the lazy student load
        setCurrentHomework(hw.id)
      }
    }
  }, [loading, homeworks, location.state])

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
            <h1>التقرير الجماعي للواجبات</h1>
            <p>تحليل نتائج تسليم الواجبات وأداء كل صف دراسي</p>
          </div>
          <div className="cp-page-icon">
            <i className="fas fa-chart-bar"></i>
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
              background: currentHomework ? '#10b981' : currentGrade ? '#5bc2e7' : 'var(--cp-divider)',
              color: currentGrade ? '#fff' : 'var(--cp-text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700
            }}>
              {currentHomework ? <i className="fas fa-check"></i> : 2}
            </div>
            <span style={{ color: currentGrade ? 'var(--cp-text-main)' : 'var(--cp-text-muted)', fontWeight: 600 }}>الواجب</span>
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

        {/* Homework */}
        {currentGrade && (
          <div className="cp-panel" style={{ padding: '1.5rem', marginBottom: 20 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 16px', color: 'var(--cp-text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-book-open" style={{ color: '#8b5cf6' }}></i> اختر الواجب
            </h2>
            {hwForGrade.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--cp-text-muted)' }}>لا توجد واجبات منشورة لهذا الصف.</p>
            ) : (
              <div style={{ position: 'relative', maxWidth: '400px' }}>
                <i className="fas fa-clipboard-list" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--cp-text-muted)', zIndex: 1 }}></i>
                <select
                  className="cp-select"
                  value={currentHomework}
                  onChange={(e) => handleHomeworkChange(e.target.value)}
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
                    outline: 'none'
                  }}
                >
                  <option value="">-- اختر الواجب --</option>
                  {hwForGrade.map((hw) => (
                    <option key={hw.id} value={hw.id} style={{ background: 'var(--cp-card-bg)', color: 'var(--cp-text-main)' }}>
                      {hw.week ? `${hw.week} — ` : ''}{hw.title}
                    </option>
                  ))}
                </select>
                <i className="fas fa-chevron-down" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--cp-text-muted)', pointerEvents: 'none' }}></i>
              </div>
            )}
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
              <i className="fas fa-paper-plane" style={{ color: '#818cf8' }}></i>
              <div>
                <div className="cp-stat-val" style={{ color: '#818cf8' }}>{submitRate}%</div>
                <div className="cp-stat-lbl">نسبة التسليم</div>
              </div>
            </div>
          </div>
        )}

        {/* Filter Chips */}
        {currentHomework && allStudentsData.length > 0 && (
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
          <div className="cp-table-card" id="hgr-reportTable">
            <PrintReportHeader subtitle="التقرير الجماعي للواجبات" />
            <div className="cp-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--cp-text-main)' }}>
                  <i className="fas fa-clipboard-list" style={{ color: '#5bc2e7', marginLeft: 8 }}></i>
                  تقرير الواجبات التفصيلي
                </h2>
                <span className="cp-badge cp-badge-neutral">{displayedStudents.length}</span>
              </div>
              <button onClick={() => window.print()} className="cp-crumbs-back" style={{ padding: '6px 12px', background: 'transparent' }}>
                <i className="fas fa-print" style={{ marginLeft: 6 }}></i>
                طباعة التقرير
              </button>
            </div>

            <div className="cp-table-container">
              <table className="cp-table">
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
                          student.status === 'not_submitted' ? 'cp-badge-danger' :
                          student.score >= 80 ? 'cp-badge-success' :
                          student.score >= 60 ? 'cp-badge-warning' : 'cp-badge-danger'
                        }`}>{student.rating}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 60, height: 6, background: 'var(--cp-divider)', borderRadius: 3, overflow: 'hidden' }}>
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
