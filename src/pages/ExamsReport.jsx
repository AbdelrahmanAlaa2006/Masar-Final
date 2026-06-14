import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { listAttemptsForStudent, listExams } from '@backend/examsApi'
import { getProfile } from '@backend/profilesApi'
import { listEffectiveOverrides, reduceEffective } from '@backend/overridesApi'
import { cached, LIST_TTL } from '../utils/cache'
import './ExamsReport.css'

/* Format a JS date as dd/mm/yyyy in ar-EG digits-neutral form */
const fmtDate = (d) => {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date)) return '—'
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
}

/* Rough subject inference from exam title — we don't store subject on exams
   in the MVP schema, so we guess for the icon. */
const inferSubject = (title = '') => {
  const t = title.toLowerCase()
  if (/(رياض|جبر|هندس|حساب)/.test(title)) return 'رياضيات'
  if (/(علوم|فيزياء|كيمياء|أحياء)/.test(title)) return 'علوم'
  return 'عام'
}

export default function ExamsReport() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [studentName, setStudentName] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        const student = params.get('student')
        if (student) return student
        const stored = sessionStorage.getItem('masar-user')
        if (stored) {
          const u = JSON.parse(stored)
          return u?.name || ''
        }
      }
    } catch {}
    return ''
  })
  const [studentId, setStudentId] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        const idParam = params.get('id')
        if (idParam) return idParam
        const stored = sessionStorage.getItem('masar-user')
        if (stored) {
          const u = JSON.parse(stored)
          return u?.phone || ''
        }
      }
    } catch {}
    return ''
  })
  const [currentFilter, setCurrentFilter] = useState('all')
  // Students never see the detailed table view — force cards.
  const initialViewMode = (() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('masar-user'))
      return u?.role === 'admin' ? 'table' : 'cards'
    } catch { return 'cards' }
  })()
  const [viewMode, setViewMode] = useState(initialViewMode)
  const [selectedExam, setSelectedExam] = useState(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [remoteExams, setRemoteExams] = useState(null)   // null = not loaded, [] = empty
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('masar-user'))
      setIsAdmin(u?.role === 'admin')
    } catch { setIsAdmin(false) }
  }, [])

  /* Load real data when the current user is viewing their own report
     (i.e. no ?student= / ?id= param OR the id matches the logged-in user). */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const u = JSON.parse(sessionStorage.getItem('masar-user')) || null
        const paramId = searchParams.get('id')
        const targetId = paramId || u?.id
        if (!targetId) return

        setLoading(true)
        setLoadError('')

        // Resolve the target student's grade so we only show their grade's
        // exams. An admin would otherwise get every grade via RLS.
        let targetGrade = u?.grade || null
        let targetGroup = u?.group || null
        if (paramId && paramId !== u?.id) {
          const p = await getProfile(paramId)
          targetGrade = p?.grade || null
          targetGroup = p?.group || null
          if (p?.name) setStudentName(p.name)
          if (p?.phone) setStudentId(p.phone)
        }

        // All exams the viewer can see, then filter to the target's grade.
        const allExamsRaw = await cached('exams', LIST_TTL, listExams)
        const allExams = targetGrade
          ? allExamsRaw.filter((e) => e.grade === targetGrade)
          : allExamsRaw
        // The target student's attempts (admin can read any student via RLS).
        // Per-student key — cached internally so admins can flip back to the same
        // student without re-pulling the whole attempt history.
        const attempts = await listAttemptsForStudent(targetId)

        // Per-student / per-grade reveal overrides. An allow=true override
        // reveals an exam's results for this student even when the exam's
        // global reveal_grades flag is false.
        let revealMap = new Map()
        try {
          if (targetGrade) {
            const rows = await listEffectiveOverrides({
              studentId: targetId, grade: targetGrade, group: targetGroup,
              itemType: 'exam_reveal',
            })
            revealMap = reduceEffective(rows)
          }
        } catch { /* ignore — defaults to "not revealed" */ }

        // Pick the best submitted attempt per exam.
        const bestByExam = new Map()
        const attemptsByExam = new Map()
        for (const a of attempts) {
          const key = a.exam_id
          attemptsByExam.set(key, (attemptsByExam.get(key) || 0) + (a.submitted_at ? 1 : 0))
          if (!a.submitted_at) continue
          const prev = bestByExam.get(key)
          if (!prev || (a.score || 0) > (prev.score || 0)) bestByExam.set(key, a)
        }

        const rows = allExams.map((ex, idx) => {
          const best = bestByExam.get(ex.id) || null
          const submittedCount = attemptsByExam.get(ex.id) || 0
          const maxScore = ex.total_points || best?.max_score || 0
          const scorePct = best && maxScore > 0
            ? Math.round(((best.score || 0) / maxScore) * 100)
            : 0
          // Build review-friendly questions array from exam.questions + best.responses.
          const qs = Array.isArray(ex.questions) ? ex.questions : []
          const resp = Array.isArray(best?.responses) ? best.responses : []
          const questions = qs.map((q, qi) => {
            const r = resp[qi] || {}
            return {
              text: q.text || q.question || q.title || `سؤال ${qi + 1}`,
              options: q.options || q.choices || [],
              correct: typeof q.correct === 'number' ? q.correct
                : typeof q.correct_index === 'number' ? q.correct_index
                : typeof q.answer === 'number' ? q.answer : -1,
              studentAnswer: typeof r.answer === 'number' ? r.answer
                : typeof r.selected === 'number' ? r.selected : -1,
            }
          })
          return {
            id: ex.id,
            title: ex.title,
            subject: inferSubject(ex.title),
            score: scorePct,
            maxScore: 100,
            status: best ? 'completed' : 'pending',
            attempts: submittedCount,
            maxAttempts: ex.max_attempts || 1,
            duration: `${ex.duration_minutes} دقيقة`,
            date: fmtDate(best?.submitted_at),
            /* Grades are revealed if EITHER the exam's global reveal_grades
               flag is on, OR a per-target override (student/grade scope)
               explicitly allows it for this student. */
            gradesRevealed:
              ex.reveal_grades === true ||
              (revealMap.get(ex.id)?.allowed === true),
            questions,
          }
        })
        if (!cancelled) setRemoteExams(rows)
      } catch (e) {
        if (!cancelled) setLoadError(e.message || 'تعذّر تحميل التقرير')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [searchParams])

  /* All rows come from Supabase — the logged-in student's own exams, or the
     target student's exams when an admin passes ?id=. No mock placeholders. */
  const examsData = remoteExams ?? []

  const filteredExams =
    currentFilter === 'all'
      ? examsData
      : currentFilter === 'passed'
      ? examsData.filter((e) => e.gradesRevealed && e.score >= 60)
      : currentFilter === 'failed'
      ? examsData.filter((e) => e.gradesRevealed && e.score < 60 && e.status === 'completed')
      : currentFilter === 'excellent'
      ? examsData.filter((e) => e.gradesRevealed && e.score >= 80)
      : examsData.filter((e) => e.status === 'pending')

  useEffect(() => {
    const student = searchParams.get('student')
    const idParam  = searchParams.get('id')
    if (student) {
      setStudentName(student)
      setStudentId(idParam || '')
    } else {
      try {
        const stored = sessionStorage.getItem('masar-user')
        if (stored) {
          const u = JSON.parse(stored)
          if (u?.name)  setStudentName(u.name)
          if (u?.phone) setStudentId(u.phone)   // phone is the public-facing student id
        }
      } catch { /* ignore */ }
    }
  }, [searchParams])

  const getScoreColor = (score) => {
    if (score >= 80) return '#48bb78'
    if (score >= 60) return '#ed8936'
    return '#f56565'
  }

  const getRating = (score) => {
    if (score >= 80) return 'ممتاز'
    if (score >= 60) return 'جيد'
    return 'يحتاج تحسين'
  }

  const getRatingClass = (score) => {
    if (score >= 80) return 'er-rating-excellent'
    if (score >= 60) return 'er-rating-good'
    return 'er-rating-poor'
  }

  const getExamIcon = (subject) => {
    if (subject === 'رياضيات') return 'fa-calculator'
    if (subject === 'علوم') return 'fa-flask'
    return 'fa-book'
  }

  const openReview = (exam) => { setSelectedExam(exam); setShowReviewModal(true) }
  const openDetail = (exam) => { setSelectedExam(exam); setShowDetailModal(true) }
  const closeAll = () => { setShowReviewModal(false); setShowDetailModal(false); setSelectedExam(null) }

  const total = examsData.length
  const completed = examsData.filter((e) => e.status === 'completed').length
  const pending = examsData.filter((e) => e.status === 'pending').length
  const revealed = examsData.filter((e) => e.gradesRevealed && e.status === 'completed')
  const passed = revealed.filter((e) => e.score >= 60).length
  const avgScore = revealed.length > 0
    ? Math.round(revealed.reduce((s, e) => s + e.score, 0) / revealed.length)
    : 0

  const correctCount = (exam) => exam.questions.filter((q) => q.studentAnswer === q.correct).length
  const wrongCount = (exam) => exam.questions.filter((q) => q.studentAnswer !== q.correct).length
  const letters = ['أ', 'ب', 'ج', 'د']

  return (
    <main className="cp-page">
      <div className="cp-container">

        {/* Back button */}
        <button className="cp-crumbs-back" onClick={() => navigate(-1)} style={{ marginBottom: '1.5rem' }}>
          <i className="fas fa-arrow-right"></i>
          <span>رجوع</span>
        </button>

        {/* Page Header */}
        <div className="cp-page-header">
          <div className="cp-page-header-text">
            <h1>تقرير الامتحانات</h1>
            <p>سجل الامتحانات والنتائج التفصيلية للطلاب</p>
          </div>
          <div className="cp-page-icon">
            <i className="fas fa-file-alt"></i>
          </div>
        </div>
        <div className="cp-header-divider"></div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--cp-text-muted)' }}>
            <i className="fas fa-spinner fa-spin"></i> جارٍ تحميل التقرير...
          </div>
        )}
        {loadError && (
          <div style={{ textAlign: 'center', padding: 16, color: '#ef4444' }}>
            <i className="fas fa-exclamation-triangle"></i> {loadError}
          </div>
        )}

        {/* Student Info Card */}
        {studentName && (
          <div className="cp-target-banner">
            <div className="cp-avatar cp-avatar-purple">
              <i className="fas fa-user-graduate"></i>
            </div>
            <div className="cp-target-banner-body">
              <div className="cp-target-banner-label">
                <i className="fas fa-bullseye"></i> الطالب المستهدف
              </div>
              <div className="cp-target-banner-name">{studentName}</div>
              <div className="cp-target-banner-meta">
                {studentId && (
                  <span className="cp-id-pill"><i className="fas fa-id-badge"></i> {studentId}</span>
                )}
                <span><i className="fas fa-chart-line"></i> المتوسط: {revealed.length > 0 ? `${avgScore}%` : '—'}</span>
                <span><i className="fas fa-tasks"></i> الإكمال: {completed} من {total} امتحان</span>
              </div>
            </div>
          </div>
        )}

        {studentName && !isAdmin && (
          <ExamsDashboard examsData={examsData} />
        )}

        {/* Stats Strip */}
        <div className="cp-stats-row">
          <div className="cp-stat">
            <i className="fas fa-list-ol" style={{ color: 'var(--cp-primary)' }}></i>
            <div>
              <div className="cp-stat-val">{total}</div>
              <div className="cp-stat-lbl">إجمالي الامتحانات</div>
            </div>
          </div>
          <div className="cp-stat cp-stat-good">
            <i className="fas fa-check-circle"></i>
            <div>
              <div className="cp-stat-val">{completed}</div>
              <div className="cp-stat-lbl">مُكتملة</div>
            </div>
          </div>
          <div className="cp-stat cp-stat-neutral">
            <i className="fas fa-clock"></i>
            <div>
              <div className="cp-stat-val">{pending}</div>
              <div className="cp-stat-lbl">لم تُؤدَّ</div>
            </div>
          </div>
          <div className="cp-stat cp-stat-info">
            <i className="fas fa-trophy" style={{ color: '#10b981' }}></i>
            <div>
              <div className="cp-stat-val" style={{ color: '#10b981' }}>{passed}</div>
              <div className="cp-stat-lbl">ناجح</div>
            </div>
          </div>
          <div className="cp-stat cp-stat-warning">
            <i className="fas fa-percentage"></i>
            <div>
              <div className="cp-stat-val">{revealed.length > 0 ? `${avgScore}%` : '—'}</div>
              <div className="cp-stat-lbl">المتوسط</div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="cp-bulk-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="cp-filter-group" style={{ display: 'flex', gap: 8 }}>
            {[
              { key: 'all', label: 'الكل', icon: 'fa-th-list' },
              { key: 'passed', label: 'ناجح', icon: 'fa-check' },
              { key: 'failed', label: 'راسب', icon: 'fa-times' },
              { key: 'excellent', label: 'ممتاز', icon: 'fa-star' },
              { key: 'pending', label: 'لم يُؤدَّ', icon: 'fa-hourglass-half' },
            ].map(({ key, label, icon }) => (
              <button
                key={key}
                className={`cp-btn ${currentFilter === key ? 'cp-btn-success' : 'cp-btn-ghost'}`}
                onClick={() => setCurrentFilter(key)}
                style={{ borderRadius: 8 }}
              >
                <i className={`fas ${icon}`}></i> {label}
              </button>
            ))}
          </div>

          {isAdmin && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={`cp-btn ${viewMode === 'table' ? 'cp-btn-info-active' : 'cp-btn-ghost'}`} onClick={() => setViewMode('table')} style={{ borderRadius: 8 }}>
                <i className="fas fa-table"></i> جدول
              </button>
              <button className={`cp-btn ${viewMode === 'cards' ? 'cp-btn-info-active' : 'cp-btn-ghost'}`} onClick={() => setViewMode('cards')} style={{ borderRadius: 8 }}>
                <i className="fas fa-th-large"></i> بطاقات
              </button>
            </div>
          )}
        </div>

        <div style={{ margin: '1rem 0', fontSize: '0.88rem', color: 'var(--cp-text-muted)', direction: 'rtl' }}>
          عرض <strong>{filteredExams.length}</strong> امتحان من أصل {total}
        </div>

        {/* TABLE VIEW — admin only (the detailed report card) */}
        {isAdmin && viewMode === 'table' && (
          <div className="cp-table-card" id="er-reportTable">
            <div className="cp-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}><i className="fas fa-clipboard-list" style={{ color: '#5bc2e7', marginLeft: 8 }}></i> تقرير النتائج التفصيلي</h2>
              </div>
              {isAdmin && (
                <button className="cp-crumbs-back" onClick={() => window.print()} style={{ padding: '6px 12px', background: 'transparent' }}>
                  <i className="fas fa-print"></i> طباعة
                </button>
              )}
            </div>

            <div className="cp-table-container">
              <table className="cp-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>الامتحان</th>
                    <th>المادة</th>
                    <th>التاريخ</th>
                    <th>المحاولات</th>
                    <th>الحالة</th>
                    <th>الدرجة</th>
                    <th>التقييم</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExams.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: 24, color: 'var(--cp-text-muted)' }}>لا توجد امتحانات تطابق هذا الفلتر</td>
                    </tr>
                  ) : (
                    filteredExams.map((exam, index) => (
                      <tr key={exam.id}>
                        <td>{index + 1}</td>
                        <td style={{ fontWeight: 700 }}>
                          <i className={`fas ${getExamIcon(exam.subject)}`} style={{ color: '#5bc2e7', marginLeft: 8 }}></i>
                          {exam.title}
                        </td>
                        <td>{exam.subject}</td>
                        <td>{exam.date}</td>
                        <td>
                          {exam.status === 'pending' ? (
                            <span>—</span>
                          ) : (
                            <span style={{ color: 'var(--cp-text-muted)' }}>{exam.attempts}/{exam.maxAttempts}</span>
                          )}
                        </td>
                        <td>
                          {exam.status === 'pending' ? (
                            <span className="cp-badge cp-badge-danger"><i className="fas fa-hourglass-half"></i> لم يُؤدَّ</span>
                          ) : (
                            <span className="cp-badge cp-badge-success"><i className="fas fa-check-circle"></i> مُكتمل</span>
                          )}
                        </td>
                        <td>
                          {exam.status === 'pending' ? (
                            <span>—</span>
                          ) : exam.gradesRevealed ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 60, height: 6, background: 'var(--cp-divider)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: `${exam.score}%`, height: '100%', background: getScoreColor(exam.score), borderRadius: 3 }} />
                              </div>
                              <span style={{ color: getScoreColor(exam.score), fontWeight: 700 }}>{exam.score}/{exam.maxScore}</span>
                            </div>
                          ) : (
                            <span className="cp-badge cp-badge-neutral"><i className="fas fa-lock"></i> لم تُعلَن</span>
                          )}
                        </td>
                        <td>
                          {exam.status !== 'pending' && exam.gradesRevealed ? (
                            <span className={`cp-badge ${exam.score >= 80 ? 'cp-badge-success' : exam.score >= 60 ? 'cp-badge-warning' : 'cp-badge-danger'}`}>{getRating(exam.score)}</span>
                          ) : (
                            <span>—</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="cp-crumbs-back" onClick={() => openDetail(exam)} style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'transparent' }}>
                              <i className="fas fa-info-circle"></i> تفاصيل
                            </button>
                            {exam.status === 'completed' && exam.gradesRevealed && exam.questions.length > 0 && (
                              <button className="cp-crumbs-back" onClick={() => openReview(exam)} style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'transparent' }}>
                                <i className="fas fa-eye"></i> مراجعة
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CARDS VIEW */}
        {viewMode === 'cards' && (
          <div className="cp-home-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filteredExams.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--cp-text-muted)' }}>لا توجد امتحانات تطابق هذا الفلتر</div>
            ) : (
              filteredExams.map((exam) => (
                <div key={exam.id} className="cp-section-card cp-accent-indigo" style={{ display: 'block', padding: '1.25rem', opacity: exam.status === 'pending' ? 0.75 : 1, textAlign: 'right' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div className="cp-section-icon" style={{ width: 40, height: 40, borderRadius: 10, margin: 0 }}>
                      <i className={`fas ${getExamIcon(exam.subject)}`}></i>
                    </div>
                    {exam.status === 'pending' ? (
                      <span className="cp-badge cp-badge-danger"><i className="fas fa-hourglass-half"></i> لم يُؤدَّ</span>
                    ) : (
                      <span className="cp-badge cp-badge-success"><i className="fas fa-check-circle"></i> مُكتمل</span>
                    )}
                  </div>

                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 6px', color: 'var(--cp-text-main)' }}>{exam.title}</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', margin: '0 0 12px' }}>{exam.subject}</p>

                  {exam.status !== 'pending' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, margin: '16px 0' }}>
                      {exam.gradesRevealed ? (
                        <>
                          <div style={{ width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `conic-gradient(${getScoreColor(exam.score)} ${exam.score}%, var(--cp-divider) 0%)` }}>
                            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--cp-card-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: '1.15rem', fontWeight: 700, color: getScoreColor(exam.score) }}>{exam.score}</span>
                              <span style={{ fontSize: '0.6rem', color: 'var(--cp-text-muted)' }}>/{exam.maxScore}</span>
                            </div>
                          </div>
                          <span className={`cp-badge ${exam.score >= 80 ? 'cp-badge-success' : exam.score >= 60 ? 'cp-badge-warning' : 'cp-badge-danger'}`}>{getRating(exam.score)}</span>
                        </>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--cp-hover-bg)', borderRadius: 8, padding: '0.6rem 0.9rem', border: '1px dashed var(--cp-divider)', fontSize: '0.82rem', color: 'var(--cp-text-muted)', fontWeight: 600 }}>
                          <i className="fas fa-lock" style={{ color: '#5bc2e7' }}></i>
                          <span>الدرجات لم تُعلَن بعد</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: '0.78rem', color: 'var(--cp-text-muted)', marginBottom: 12 }}>
                    <span><i className="fas fa-clock" style={{ marginLeft: 4 }}></i> {exam.duration}</span>
                    <span><i className="fas fa-calendar-alt" style={{ marginLeft: 4 }}></i> {exam.date}</span>
                    <span><i className="fas fa-redo-alt" style={{ marginLeft: 4 }}></i> محاولات: {exam.attempts}/{exam.maxAttempts}</span>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="cp-crumbs-back" onClick={() => openDetail(exam)} style={{ flex: 1, padding: '6px', justifyContent: 'center', background: 'transparent' }}>
                      <i className="fas fa-info-circle"></i> تفاصيل
                    </button>
                    {exam.status === 'completed' && exam.gradesRevealed && exam.questions.length > 0 && (
                      <button className="cp-crumbs-back" onClick={() => openReview(exam)} style={{ flex: 1, padding: '6px', justifyContent: 'center', background: 'transparent' }}>
                        <i className="fas fa-eye"></i> مراجعة
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* DETAIL MODAL */}
      {showDetailModal && selectedExam && (
        <div className="rp-modal-overlay" onClick={closeAll} role="dialog" aria-modal="true">
          <div className="rp-modal" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', color: 'var(--cp-text-main)', maxWidth: 480 }}>
            <div className="rp-modal-header" style={{ borderBottom: '1px solid var(--cp-divider)' }}>
              <div className="rp-modal-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}>
                <i className={`fas ${getExamIcon(selectedExam.subject)}`}></i>
              </div>
              <div className="rp-modal-title">
                <h3 style={{ color: 'var(--cp-text-main)', margin: 0 }}>{selectedExam.title}</h3>
                <p style={{ color: 'var(--cp-text-muted)', margin: '4px 0 0', fontSize: '0.85rem' }}>{selectedExam.subject}</p>
              </div>
              <button className="rp-modal-close" onClick={closeAll} style={{ background: 'var(--cp-back-bg)', border: '1px solid var(--cp-back-border)', color: 'var(--cp-text-muted)' }}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              {selectedExam.status !== 'pending' && selectedExam.gradesRevealed ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '20px 0' }}>
                  <div style={{ width: 100, height: 100, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `conic-gradient(${getScoreColor(selectedExam.score)} ${selectedExam.score}%, var(--cp-divider) 0%)` }}>
                    <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--cp-card-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '1.8rem', fontWeight: 800, color: getScoreColor(selectedExam.score) }}>{selectedExam.score}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)' }}>من {selectedExam.maxScore}</span>
                    </div>
                  </div>
                </div>
              ) : selectedExam.status !== 'pending' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 20, borderRadius: 12, background: 'var(--cp-hover-bg)', color: 'var(--cp-text-muted)', fontSize: '0.95rem', border: '1px dashed var(--cp-divider)', margin: '20px 0' }}>
                  <i className="fas fa-lock" style={{ fontSize: '1.3rem', color: '#5bc2e7' }}></i>
                  <span>الدرجات لم تُعلَن بعد</span>
                </div>
              ) : null}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                  <span style={{ color: 'var(--cp-text-muted)' }}>الحالة</span>
                  <span className={`cp-badge ${selectedExam.status === 'pending' ? 'cp-badge-danger' : 'cp-badge-success'}`}>{selectedExam.status === 'pending' ? 'لم يُؤدَّ بعد' : 'مُكتمل'}</span>
                </div>
                {selectedExam.status !== 'pending' && selectedExam.gradesRevealed && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                    <span style={{ color: 'var(--cp-text-muted)' }}>التقييم</span>
                    <span className={`cp-badge ${selectedExam.score >= 80 ? 'cp-badge-success' : selectedExam.score >= 60 ? 'cp-badge-warning' : 'cp-badge-danger'}`}>{getRating(selectedExam.score)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                  <span style={{ color: 'var(--cp-text-muted)' }}>المدة</span>
                  <span style={{ color: 'var(--cp-text-main)', fontWeight: 600 }}>{selectedExam.duration}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                  <span style={{ color: 'var(--cp-text-muted)' }}>المحاولات</span>
                  <span style={{ color: 'var(--cp-text-main)', fontWeight: 600 }}>{selectedExam.attempts} / {selectedExam.maxAttempts}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: 'none' }}>
                  <span style={{ color: 'var(--cp-text-muted)' }}>التاريخ</span>
                  <span style={{ color: 'var(--cp-text-main)', fontWeight: 600 }}>{selectedExam.date}</span>
                </div>
              </div>

              {selectedExam.status === 'completed' && selectedExam.gradesRevealed && selectedExam.questions.length > 0 && (
                <button className="cp-btn cp-btn-success" onClick={() => { setShowDetailModal(false); setShowReviewModal(true) }} style={{ width: '100%', marginTop: 18, padding: 12, borderRadius: 12, display: 'flex', justifyContent: 'center', gap: 8 }}>
                  <i className="fas fa-eye"></i> مراجعة الإجابات التفصيلية
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ANSWER REVIEW MODAL */}
      {showReviewModal && selectedExam && (
        <div className="rp-modal-overlay" onClick={closeAll} role="dialog" aria-modal="true">
          <div className="rp-modal" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', color: 'var(--cp-text-main)', maxWidth: 640 }}>
            <div className="rp-modal-header" style={{ borderBottom: '1px solid var(--cp-divider)' }}>
              <div className="rp-modal-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}>
                <i className={`fas ${getExamIcon(selectedExam.subject)}`}></i>
              </div>
              <div className="rp-modal-title">
                <h3 style={{ color: 'var(--cp-text-main)', margin: 0 }}>مراجعة الإجابات</h3>
                <p style={{ color: 'var(--cp-text-muted)', margin: '4px 0 0', fontSize: '0.85rem' }}>{selectedExam.title}</p>
              </div>
              <button className="rp-modal-close" onClick={closeAll} style={{ background: 'var(--cp-back-bg)', border: '1px solid var(--cp-back-border)', color: 'var(--cp-text-muted)' }}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, borderRadius: 14, background: 'var(--cp-hover-bg)', padding: 14, border: '1px solid var(--cp-divider)', justifyContent: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
                  <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#10b981' }}>{correctCount(selectedExam)}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--cp-text-muted)' }}>إجابة صحيحة</span>
                </div>
                <div style={{ width: 1, background: 'var(--cp-divider)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
                  <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ef4444' }}>{wrongCount(selectedExam)}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--cp-text-muted)' }}>إجابة خاطئة</span>
                </div>
                <div style={{ width: 1, background: 'var(--cp-divider)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
                  <span style={{ fontSize: '1.3rem', fontWeight: 800, color: getScoreColor(selectedExam.score) }}>{selectedExam.score}%</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--cp-text-muted)' }}>الدرجة النهائية</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '50vh', overflowY: 'auto', paddingLeft: 4, paddingRight: 4 }}>
                {selectedExam.questions.map((q, qi) => {
                  const isCorrect = q.studentAnswer === q.correct
                  return (
                    <div key={qi} style={{
                      borderRadius: 14,
                      padding: 16,
                      border: `1px solid ${isCorrect ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                      background: isCorrect ? 'rgba(16, 185, 129, 0.02)' : 'rgba(239, 68, 68, 0.02)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--cp-text-muted)', background: 'var(--cp-hover-bg)', padding: '3px 10px', borderRadius: 8 }}>س{qi + 1}</span>
                        <span className={`cp-badge ${isCorrect ? 'cp-badge-success' : 'cp-badge-danger'}`}>
                          {isCorrect ? (<><i className="fas fa-check"></i> صحيح</>) : (<><i className="fas fa-times"></i> خطأ</>)}
                        </span>
                      </div>
                      <p style={{ color: 'var(--cp-text-main)', fontSize: '0.92rem', margin: '0 0 12px', lineHeight: 1.6 }}>{q.text}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {q.options.map((opt, oi) => {
                          const isStudentPick = oi === q.studentAnswer
                          const isCorrectOpt = oi === q.correct
                          let bg = 'var(--cp-hover-bg)'
                          let border = '1px solid var(--cp-divider)'
                          let color = 'var(--cp-text-muted)'
                          if (isCorrectOpt) {
                            bg = 'rgba(16, 185, 129, 0.1)'
                            border = '1px solid rgba(16, 185, 129, 0.3)'
                            color = '#10b981'
                          } else if (isStudentPick && !isCorrectOpt) {
                            bg = 'rgba(239, 68, 68, 0.08)'
                            border = '1px solid rgba(239, 68, 68, 0.2)'
                            color = '#ef4444'
                          }
                          return (
                            <div key={oi} style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '8px 12px',
                              borderRadius: 10,
                              background: bg,
                              border: border,
                              fontSize: '0.85rem',
                              color: color
                            }}>
                              <span style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                background: 'rgba(255, 255, 255, 0.05)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                flexShrink: 0
                              }}>{letters[oi] || oi + 1}</span>
                              <span style={{ flex: 1, color: isCorrectOpt || isStudentPick ? 'inherit' : 'var(--cp-text-main)' }}>{opt}</span>
                              <span style={{ flexShrink: 0, fontSize: '0.9rem' }}>
                                {isCorrectOpt && <i className="fas fa-check-circle" style={{ color: '#10b981' }}></i>}
                                {isStudentPick && !isCorrectOpt && <i className="fas fa-times-circle" style={{ color: '#ef4444' }}></i>}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                      {!isCorrect && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '8px 12px', borderRadius: 10, background: 'rgba(245, 158, 11, 0.08)', color: '#f59e0b', fontSize: '0.82rem' }}>
                          <i className="fas fa-lightbulb"></i>
                          <span> الإجابة الصحيحة: </span>
                          <strong>{letters[q.correct] || q.correct + 1}. {q.options[q.correct]}</strong>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <button className="cp-btn cp-btn-ghost" onClick={closeAll} style={{ width: '100%', marginTop: 20, padding: 12, borderRadius: 12, display: 'flex', justifyContent: 'center', gap: 8 }}>
                <i className="fas fa-times"></i> إغلاق المراجعة
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function ExamsDashboard({ examsData }) {
  const total = examsData.length
  const completed = examsData.filter((e) => e.status === 'completed').length
  const revealed = examsData.filter((e) => e.gradesRevealed && e.status === 'completed')
  const passed = revealed.filter((e) => e.score >= 60).length
  const failed = revealed.filter((e) => e.score < 60).length
  const avgScore = revealed.length > 0
    ? Math.round(revealed.reduce((s, e) => s + e.score, 0) / revealed.length)
    : 0

  // Passing rate calculations
  const passingRate = revealed.length > 0 ? Math.round((passed / revealed.length) * 100) : 0
  const strokeDash = (passingRate / 100) * 251.2 // 2 * PI * r (r=40)

  // Chronological scores for trend line
  const chronological = [...revealed].reverse()

  // Generate SVG path coordinates
  const generatePaths = () => {
    if (chronological.length < 2) return { linePath: '', fillPath: '' }
    const points = chronological.map((e, idx) => {
      const x = 10 + idx * (80 / (chronological.length - 1))
      const y = 40 - e.score * 0.35
      return { x, y }
    })

    const linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
    const fillPath = `${linePath} L ${points[points.length - 1].x} 40 L ${points[0].x} 40 Z`
    return { linePath, fillPath, points }
  }

  const { linePath, fillPath, points } = generatePaths()

  const getScoreColor = (score) => {
    if (score >= 80) return '#10b981' // green
    if (score >= 60) return '#f59e0b' // orange
    return '#ef4444' // red
  }

  const getInsightMessage = () => {
    if (total === 0) return 'لا توجد امتحانات مسجلة في هذا الصف بعد.'
    if (completed === 0) return 'ابدأ بأداء امتحاناتك وتدريباتك لترى مستوى تقدمك هنا.'
    if (avgScore >= 90) return 'ما شاء الله! مستواك الدراسي متميز جداً وثابت على الامتياز. استمر في التركيز للمحافظة على صدارة الترتيب!'
    if (avgScore >= 80) return 'أداء رائع وممتاز في الامتحانات. درجاتك تؤهلك للتفوق، فقط استمر على نفس وتيرة المذاكرة والتحصيل.'
    if (avgScore >= 60) return 'أداؤك مقبول وناجح بشكل عام، ولكنك تستطيع تحقيق درجات أعلى بكثير. راجع إجاباتك الخاطئة في نافذة المراجعة لتدعيم نقاط ضعفك.'
    return 'مستواك في الامتحانات يحتاج إلى مراجعة مكثفة والتركيز على الأساسيات. احرص على حل امتحانات تدريبية إضافية والتواصل مع المعلم.'
  }

  const getInsightIcon = () => {
    if (avgScore >= 80) return 'fa-trophy'
    if (avgScore >= 60) return 'fa-circle-up'
    return 'fa-circle-exclamation'
  }

  const getInsightClass = () => {
    if (avgScore >= 80) return 'er-insight-excellent'
    if (avgScore >= 60) return 'er-insight-good'
    return 'er-insight-warning'
  }

  return (
    <div className="cp-panel" style={{ padding: '1.6rem', marginBottom: 24 }}>
      <h2 className="cp-panel-header" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.2rem', fontWeight: 700, margin: '0 0 20px' }}>
        <i className="fas fa-chart-line" style={{ color: '#818cf8' }}></i> لوحة تحليل نتائج الامتحانات ومستوى التحصيل
      </h2>

      <div className="er-dashboard-layout">
        {/* Left: Gauge for passing rate */}
        <div className="er-dashboard-donut-wrap">
          <div className="er-dashboard-donut-inner">
            <svg viewBox="0 0 100 100" className="er-donut-svg">
              <circle cx="50" cy="50" r="40" className="er-donut-bg" style={{ fill: 'none', stroke: 'var(--cp-divider)', strokeWidth: 8 }} />
              <circle 
                cx="50" 
                cy="50" 
                r="40" 
                className="er-donut-fill"
                style={{
                  fill: 'none',
                  strokeWidth: 8,
                  strokeLinecap: 'round',
                  strokeDasharray: `${strokeDash} 251.2`,
                  transform: 'rotate(-90deg)',
                  transformOrigin: '50% 50%',
                  stroke: passingRate >= 60 ? '#10b981' : '#ef4444'
                }}
              />
            </svg>
            <div className="er-donut-text">
              <span className="er-donut-num" style={{ color: 'var(--cp-text-main)', fontSize: '1.6rem', fontWeight: 800 }}>{passingRate}%</span>
              <span className="er-donut-lbl" style={{ color: 'var(--cp-text-muted)', fontSize: '0.72rem' }}>نسبة النجاح</span>
            </div>
          </div>
          <div className="er-donut-legend" style={{ display: 'flex', gap: 16, fontSize: '0.8rem', color: 'var(--cp-text-muted)' }}>
            <div><span className="legend-dot legend-passed" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10b981', marginInlineEnd: 6 }}></span> اجتياز ({passed})</div>
            <div><span className="legend-dot legend-failed" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--cp-divider)', marginInlineEnd: 6 }}></span> إخفاق ({failed})</div>
          </div>
        </div>

        {/* Right: Trend line of scores over exams */}
        <div className="er-dashboard-chart-wrap">
          <h3 className="er-chart-header" style={{ color: 'var(--cp-text-main)', fontSize: '0.95rem', fontWeight: 700, margin: '0 0 16px' }}>منحنى أداء وتطوّر الدرجات</h3>
          {revealed.length === 0 ? (
            <div className="er-chart-placeholder" style={{ border: '1px dashed var(--cp-divider)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', color: 'var(--cp-text-muted)' }}>
              <i className="fas fa-chart-line" style={{ fontSize: '1.8rem', marginBottom: 8 }}></i>
              <p>ستظهر إحصائيات ومنحنيات درجاتك هنا فور إعلان نتائج امتحاناتك الأولى</p>
            </div>
          ) : chronological.length === 1 ? (
            <div className="er-chart-placeholder" style={{ border: '1px dashed var(--cp-divider)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', color: 'var(--cp-text-muted)' }}>
              <i className="fas fa-chart-line" style={{ fontSize: '1.8rem', marginBottom: 8 }}></i>
              <p>يتطلب رسم منحنى الأداء أداء امتحانين على الأقل. لديك حالياً امتحان واحد مصحح بدرجة ({chronological[0].score}%)</p>
            </div>
          ) : (
            <div className="er-svg-chart-container" style={{ background: 'rgba(15, 23, 42, 0.3)', border: '1px solid var(--cp-divider)', borderRadius: 12, padding: '16px 12px 6px' }}>
              <svg viewBox="0 0 100 50" className="er-line-svg" preserveAspectRatio="none" style={{ width: '100%', height: '150px' }}>
                <defs>
                  {/* Grid / Line Gradient */}
                  <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {/* Horizontal grids */}
                {[0, 25, 50, 75, 100].map((grid, gi) => {
                  const y = 40 - (grid * 0.35)
                  return (
                    <g key={gi}>
                      <line x1="8" y1={y} x2="95" y2={y} className="er-chart-gridline" style={{ stroke: 'var(--cp-divider)', strokeWidth: 0.3 }} />
                      <text x="3" y={y + 1} className="er-chart-gridtext" style={{ fill: 'var(--cp-text-muted)', fontSize: 3, fontFamily: 'inherit' }}>{grid}%</text>
                    </g>
                  )
                })}

                {/* Filled Gradient Area */}
                <path d={fillPath} className="er-chart-fill-path" fill="url(#area-grad)" />

                {/* Main Trend Line */}
                <path d={linePath} className="er-chart-line-path" style={{ stroke: '#818cf8', strokeWidth: 1.2, fill: 'none' }} />

                {/* Data point glowing circles */}
                {points.map((p, idx) => {
                  const exam = chronological[idx]
                  const color = getScoreColor(exam.score)
                  return (
                    <g key={exam.id}>
                      <circle 
                        cx={p.x} 
                        cy={p.y} 
                        r="1.4" 
                        fill="#fff" 
                        stroke={color} 
                        strokeWidth="0.8"
                        className="er-chart-dot"
                      />
                      <text 
                        x={p.x} 
                        y={p.y - 3} 
                        textAnchor="middle" 
                        className="er-chart-score-label"
                        fill={color}
                        style={{ fontSize: '3.2px', fontWeight: 800 }}
                      >
                        {exam.score}%
                      </text>
                      <text 
                        x={p.x} 
                        y="45" 
                        textAnchor="middle" 
                        className="er-chart-x-label"
                        style={{ fill: 'var(--cp-text-muted)', fontSize: 3 }}
                      >
                        {exam.title.length > 5 ? exam.title.slice(0, 5) + '..' : exam.title}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
          )}
        </div>
      </div>

      <div className={`er-dashboard-insight ${getInsightClass()}`} style={{
        display: 'flex',
        gap: 14,
        padding: 16,
        borderRadius: 12,
        marginTop: 20,
        background: avgScore >= 80 ? 'rgba(16, 185, 129, 0.08)' : avgScore >= 60 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(239, 68, 68, 0.08)',
        border: `1px solid ${avgScore >= 80 ? 'rgba(16, 185, 129, 0.15)' : avgScore >= 60 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)'}`
      }}>
        <div className="er-insight-icon-wrap" style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: avgScore >= 80 ? 'rgba(16, 185, 129, 0.15)' : avgScore >= 60 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          color: avgScore >= 80 ? '#10b981' : avgScore >= 60 ? '#f59e0b' : '#ef4444',
          flexShrink: 0
        }}>
          <i className={`fas ${getInsightIcon()}`}></i>
        </div>
        <div className="er-insight-content" style={{ flex: 1 }}>
          <h4 style={{ color: 'var(--cp-text-main)', fontSize: '0.95rem', fontWeight: 700, margin: '0 0 4px' }}>ملاحظات الأداء العام</h4>
          <p style={{ color: 'var(--cp-text-muted)', fontSize: '0.88rem', margin: 0 }}>{getInsightMessage()}</p>
        </div>
      </div>
    </div>
  )
}
