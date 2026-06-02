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
    <main className="er-page">
      <div className="er-container">

        {/* Back button */}
        <button className="er-back-btn" onClick={() => navigate(-1)}>
          <i className="fas fa-arrow-right"></i>
          رجوع
        </button>

        {/* Page Header */}
        <div className="er-header">
          <div className="er-header-icon">
            <i className="fas fa-file-alt"></i>
          </div>
          <h1>تقرير الامتحانات</h1>
          <p>سجل الامتحانات والنتائج التفصيلية</p>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--muted, #666)' }}>
            <i className="fas fa-spinner fa-spin"></i> جارٍ تحميل التقرير...
          </div>
        )}
        {loadError && (
          <div style={{ textAlign: 'center', padding: 16, color: '#c53030' }}>
            <i className="fas fa-exclamation-triangle"></i> {loadError}
          </div>
        )}

        {/* Student Info Card */}
        {studentName && (
          <div className="er-student-card">
            <div className="er-student-avatar">
              <i className="fas fa-user-graduate"></i>
            </div>
            <div className="er-student-info">
              <table className="er-student-table">
                <tbody>
                  <tr>
                    <td className="er-info-label"><i className="fas fa-user"></i> الاسم</td>
                    <td className="er-info-value">{studentName}</td>
                  </tr>
                  {studentId && (
                    <tr>
                      <td className="er-info-label"><i className="fas fa-id-badge"></i> رقم الطالب</td>
                      <td className="er-info-value">{studentId}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="er-info-label"><i className="fas fa-chart-line"></i> المتوسط</td>
                    <td className="er-info-value">{revealed.length > 0 ? `${avgScore}%` : '—'}</td>
                  </tr>
                  <tr>
                    <td className="er-info-label"><i className="fas fa-tasks"></i> الإكمال</td>
                    <td className="er-info-value">{completed} من {total} امتحان</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {studentName && !isAdmin && (
          <ExamsDashboard examsData={examsData} />
        )}

        {/* Stats Strip */}
        <div className="er-stats">
          <div className="er-stat-card">
            <i className="fas fa-list-ol er-stat-icon" style={{color: 'var(--primary)'}}></i>
            <span className="er-stat-value" style={{color: 'var(--primary)'}}>{total}</span>
            <span className="er-stat-label">إجمالي</span>
          </div>
          <div className="er-stat-card">
            <i className="fas fa-check-circle er-stat-icon" style={{color: '#48bb78'}}></i>
            <span className="er-stat-value" style={{color: '#48bb78'}}>{completed}</span>
            <span className="er-stat-label">مُكتملة</span>
          </div>
          <div className="er-stat-card">
            <i className="fas fa-clock er-stat-icon" style={{color: '#a0aec0'}}></i>
            <span className="er-stat-value" style={{color: '#a0aec0'}}>{pending}</span>
            <span className="er-stat-label">لم تُؤدَّ</span>
          </div>
          <div className="er-stat-card">
            <i className="fas fa-trophy er-stat-icon" style={{color: '#38a169'}}></i>
            <span className="er-stat-value" style={{color: '#38a169'}}>{passed}</span>
            <span className="er-stat-label">ناجح</span>
          </div>
          <div className="er-stat-card">
            <i className="fas fa-percentage er-stat-icon" style={{color: '#ed8936'}}></i>
            <span className="er-stat-value" style={{color: '#ed8936'}}>{revealed.length > 0 ? `${avgScore}%` : '—'}</span>
            <span className="er-stat-label">المتوسط</span>
          </div>
        </div>

        {/* Controls */}
        <div className="er-controls">
          <div className="er-filter-group">
            {[
              { key: 'all', label: 'الكل', icon: 'fa-th-list' },
              { key: 'passed', label: 'ناجح', icon: 'fa-check' },
              { key: 'failed', label: 'راسب', icon: 'fa-times' },
              { key: 'excellent', label: 'ممتاز', icon: 'fa-star' },
              { key: 'pending', label: 'لم يُؤدَّ', icon: 'fa-hourglass-half' },
            ].map(({ key, label, icon }) => (
              <button
                key={key}
                className={`er-filter-btn ${currentFilter === key ? 'active' : ''}`}
                onClick={() => setCurrentFilter(key)}
              >
                <i className={`fas ${icon}`}></i> {label}
              </button>
            ))}
          </div>

          {isAdmin && (
            <div className="er-view-toggle">
              <button className={`er-view-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>
                <i className="fas fa-table"></i> جدول
              </button>
              <button className={`er-view-btn ${viewMode === 'cards' ? 'active' : ''}`} onClick={() => setViewMode('cards')}>
                <i className="fas fa-th-large"></i> بطاقات
              </button>
            </div>
          )}
        </div>

        <div className="er-results-count">
          عرض <strong>{filteredExams.length}</strong> امتحان من أصل {total}
        </div>

        {/* TABLE VIEW — admin only (the detailed report card) */}
        {isAdmin && viewMode === 'table' && (
          <div className="er-card" id="er-reportTable">
            <div className="er-table-header">
              <h2 className="er-card-title"><i className="fas fa-clipboard-list"></i> تقرير النتائج التفصيلي</h2>
              {isAdmin && (
                <button className="er-print-btn" onClick={() => window.print()}>
                  <i className="fas fa-print"></i> طباعة
                </button>
              )}
            </div>

            <div className="er-table-container">
              <table className="er-table">
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
                      <td colSpan={9} className="er-empty-row">لا توجد امتحانات تطابق هذا الفلتر</td>
                    </tr>
                  ) : (
                    filteredExams.map((exam, index) => (
                      <tr key={exam.id} className="er-tr">
                        <td className="er-td-num">{index + 1}</td>
                        <td className="er-td-title">
                          <i className={`fas ${getExamIcon(exam.subject)} er-row-icon`}></i>
                          {exam.title}
                        </td>
                        <td>{exam.subject}</td>
                        <td>{exam.date}</td>
                        <td>
                          {exam.status === 'pending' ? (
                            <span className="er-text-muted">—</span>
                          ) : (
                            <span className="er-attempts">{exam.attempts}/{exam.maxAttempts}</span>
                          )}
                        </td>
                        <td>
                          {exam.status === 'pending' ? (
                            <span className="er-badge er-badge-pending"><i className="fas fa-hourglass-half"></i> لم يُؤدَّ</span>
                          ) : (
                            <span className="er-badge er-badge-done"><i className="fas fa-check-circle"></i> مُكتمل</span>
                          )}
                        </td>
                        <td>
                          {exam.status === 'pending' ? (
                            <span className="er-text-muted">—</span>
                          ) : exam.gradesRevealed ? (
                            <div className="er-td-score-wrap">
                              <div className="er-mini-bar">
                                <div className="er-mini-fill" style={{ width: `${exam.score}%`, background: getScoreColor(exam.score) }} />
                              </div>
                              <span className="er-score-text" style={{ color: getScoreColor(exam.score) }}>{exam.score}/{exam.maxScore}</span>
                            </div>
                          ) : (
                            <span className="er-badge er-badge-hidden"><i className="fas fa-lock"></i> لم تُعلَن</span>
                          )}
                        </td>
                        <td>
                          {exam.status !== 'pending' && exam.gradesRevealed ? (
                            <span className={`er-rating ${getRatingClass(exam.score)}`}>{getRating(exam.score)}</span>
                          ) : (
                            <span className="er-text-muted">—</span>
                          )}
                        </td>
                        <td>
                          <div className="er-actions">
                            <button className="er-btn-detail" onClick={() => openDetail(exam)}>
                              <i className="fas fa-info-circle"></i> تفاصيل
                            </button>
                            {exam.status === 'completed' && exam.gradesRevealed && exam.questions.length > 0 && (
                              <button className="er-btn-review" onClick={() => openReview(exam)}>
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
          <div className="er-cards-grid">
            {filteredExams.length === 0 ? (
              <div className="er-no-results">لا توجد امتحانات تطابق هذا الفلتر</div>
            ) : (
              filteredExams.map((exam) => (
                <div key={exam.id} className={`er-exam-card ${exam.status === 'pending' ? 'er-card-pending' : ''}`}>
                  <div className="er-card-top">
                    <div className="er-card-icon-wrap">
                      <i className={`fas ${getExamIcon(exam.subject)}`}></i>
                    </div>
                    {exam.status === 'pending' ? (
                      <span className="er-badge er-badge-pending"><i className="fas fa-hourglass-half"></i> لم يُؤدَّ</span>
                    ) : (
                      <span className="er-badge er-badge-done"><i className="fas fa-check-circle"></i> مُكتمل</span>
                    )}
                  </div>

                  <h3 className="er-card-name">{exam.title}</h3>
                  <p className="er-card-subject">{exam.subject}</p>

                  {exam.status !== 'pending' && (
                    <div className="er-card-score-area">
                      {exam.gradesRevealed ? (
                        <>
                          <div className="er-score-ring" style={{ background: `conic-gradient(${getScoreColor(exam.score)} ${exam.score}%, rgba(102,126,234,0.1) 0%)` }}>
                            <div className="er-ring-inner">
                              <span className="er-ring-num" style={{ color: getScoreColor(exam.score) }}>{exam.score}</span>
                              <span className="er-ring-max">/{exam.maxScore}</span>
                            </div>
                          </div>
                          <span className={`er-rating ${getRatingClass(exam.score)}`}>{getRating(exam.score)}</span>
                        </>
                      ) : (
                        <div className="er-grades-pending-box">
                          <i className="fas fa-lock er-grades-lock-icon"></i>
                          <span>الدرجات لم تُعلَن بعد</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="er-card-meta">
                    <span><i className="fas fa-clock"></i> {exam.duration}</span>
                    <span><i className="fas fa-calendar-alt"></i> {exam.date}</span>
                    <span><i className="fas fa-redo-alt"></i> محاولات: {exam.attempts}/{exam.maxAttempts}</span>
                  </div>

                  <div className="er-card-actions">
                    <button className="er-btn-detail" onClick={() => openDetail(exam)}>
                      <i className="fas fa-info-circle"></i> تفاصيل
                    </button>
                    {exam.status === 'completed' && exam.gradesRevealed && exam.questions.length > 0 && (
                      <button className="er-btn-review" onClick={() => openReview(exam)}>
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
        <div className="er-modal-overlay" onClick={closeAll}>
          <div className="er-modal er-detail-modal" onClick={(e) => e.stopPropagation()}>
            <button className="er-modal-close" onClick={closeAll}><i className="fas fa-times"></i></button>

            <div className="er-modal-icon-wrap">
              <i className={`fas ${getExamIcon(selectedExam.subject)}`}></i>
            </div>
            <h2 className="er-modal-title">{selectedExam.title}</h2>
            <p className="er-modal-subject">{selectedExam.subject}</p>

            {selectedExam.status !== 'pending' && selectedExam.gradesRevealed ? (
              <div className="er-detail-ring" style={{ background: `conic-gradient(${getScoreColor(selectedExam.score)} ${selectedExam.score}%, rgba(102,126,234,0.1) 0%)` }}>
                <div className="er-ring-inner-lg">
                  <span className="er-ring-num-lg" style={{ color: getScoreColor(selectedExam.score) }}>{selectedExam.score}</span>
                  <span className="er-ring-max-lg">من {selectedExam.maxScore}</span>
                </div>
              </div>
            ) : selectedExam.status !== 'pending' ? (
              <div className="er-grades-pending-box er-grades-box-lg">
                <i className="fas fa-lock er-grades-lock-icon"></i>
                <span>الدرجات لم تُعلَن بعد</span>
              </div>
            ) : null}

            <div className="er-modal-rows">
              <div className="er-modal-row">
                <span className="er-modal-label">الحالة</span>
                <span>{selectedExam.status === 'pending' ? 'لم يُؤدَّ بعد' : 'مُكتمل'}</span>
              </div>
              {selectedExam.status !== 'pending' && selectedExam.gradesRevealed && (
                <div className="er-modal-row">
                  <span className="er-modal-label">التقييم</span>
                  <span className={`er-rating ${getRatingClass(selectedExam.score)}`}>{getRating(selectedExam.score)}</span>
                </div>
              )}
              <div className="er-modal-row">
                <span className="er-modal-label">المدة</span>
                <span>{selectedExam.duration}</span>
              </div>
              <div className="er-modal-row">
                <span className="er-modal-label">المحاولات</span>
                <span>{selectedExam.attempts} / {selectedExam.maxAttempts}</span>
              </div>
              <div className="er-modal-row">
                <span className="er-modal-label">التاريخ</span>
                <span>{selectedExam.date}</span>
              </div>
            </div>

            {selectedExam.status === 'completed' && selectedExam.gradesRevealed && selectedExam.questions.length > 0 && (
              <button className="er-btn-review er-review-full" onClick={() => { setShowDetailModal(false); setShowReviewModal(true) }}>
                <i className="fas fa-eye"></i> مراجعة الإجابات التفصيلية
              </button>
            )}
          </div>
        </div>
      )}

      {/* ANSWER REVIEW MODAL */}
      {showReviewModal && selectedExam && (
        <div className="er-modal-overlay" onClick={closeAll}>
          <div className="er-modal er-review-modal" onClick={(e) => e.stopPropagation()}>
            <button className="er-modal-close" onClick={closeAll}><i className="fas fa-times"></i></button>

            <div className="er-review-header">
              <div className="er-review-icon-wrap">
                <i className={`fas ${getExamIcon(selectedExam.subject)}`}></i>
              </div>
              <div>
                <h2 className="er-review-title">مراجعة الإجابات</h2>
                <p className="er-review-exam-name">{selectedExam.title}</p>
              </div>
            </div>

            <div className="er-review-summary">
              <div className="er-sum-item er-sum-correct">
                <span className="er-sum-val">{correctCount(selectedExam)}</span>
                <span className="er-sum-lbl">إجابة صحيحة</span>
              </div>
              <div className="er-sum-divider" />
              <div className="er-sum-item er-sum-wrong">
                <span className="er-sum-val">{wrongCount(selectedExam)}</span>
                <span className="er-sum-lbl">إجابة خاطئة</span>
              </div>
              <div className="er-sum-divider" />
              <div className="er-sum-item er-sum-score">
                <span className="er-sum-val" style={{ color: getScoreColor(selectedExam.score) }}>{selectedExam.score}%</span>
                <span className="er-sum-lbl">الدرجة النهائية</span>
              </div>
            </div>

            <div className="er-review-questions">
              {selectedExam.questions.map((q, qi) => {
                const isCorrect = q.studentAnswer === q.correct
                return (
                  <div key={qi} className={`er-review-q ${isCorrect ? 'er-q-correct' : 'er-q-wrong'}`}>
                    <div className="er-q-header">
                      <span className="er-q-num">س{qi + 1}</span>
                      <span className={`er-q-result ${isCorrect ? 'er-res-correct' : 'er-res-wrong'}`}>
                        {isCorrect ? (<><i className="fas fa-check"></i> صحيح</>) : (<><i className="fas fa-times"></i> خطأ</>)}
                      </span>
                    </div>
                    <p className="er-q-text">{q.text}</p>
                    <div className="er-q-options">
                      {q.options.map((opt, oi) => {
                        const isStudentPick = oi === q.studentAnswer
                        const isCorrectOpt = oi === q.correct
                        let cls = 'er-opt'
                        if (isCorrectOpt) cls += ' er-opt-correct'
                        else if (isStudentPick && !isCorrectOpt) cls += ' er-opt-wrong'
                        return (
                          <div key={oi} className={cls}>
                            <span className="er-opt-letter">{letters[oi]}</span>
                            <span className="er-opt-text">{opt}</span>
                            <span className="er-opt-indicator">
                              {isCorrectOpt && <i className="fas fa-check-circle" style={{color:'#48bb78'}}></i>}
                              {isStudentPick && !isCorrectOpt && <i className="fas fa-times-circle" style={{color:'#ef4444'}}></i>}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    {!isCorrect && (
                      <div className="er-q-correction">
                        <i className="fas fa-lightbulb"></i>
                        <span> الإجابة الصحيحة: </span>
                        <strong>{letters[q.correct]}. {q.options[q.correct]}</strong>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <button className="er-close-review-btn" onClick={closeAll}>
              <i className="fas fa-times"></i> إغلاق المراجعة
            </button>
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
    <div className="er-dashboard-card card">
      <h2 className="er-dashboard-title">
        <i className="fas fa-chart-line"></i> لوحة تحليل نتائج الامتحانات ومستوى التحصيل
      </h2>

      <div className="er-dashboard-layout">
        {/* Left: Gauge for passing rate */}
        <div className="er-dashboard-donut-wrap">
          <div className="er-dashboard-donut-inner">
            <svg viewBox="0 0 100 100" className="er-donut-svg">
              <circle cx="50" cy="50" r="40" className="er-donut-bg" />
              <circle 
                cx="50" 
                cy="50" 
                r="40" 
                className="er-donut-fill"
                style={{
                  strokeDasharray: `${strokeDash} 251.2`,
                  transform: 'rotate(-90deg)',
                  transformOrigin: '50% 50%',
                  stroke: passingRate >= 60 ? '#818cf8' : '#ef4444'
                }}
              />
            </svg>
            <div className="er-donut-text">
              <span className="er-donut-num">{passingRate}%</span>
              <span className="er-donut-lbl">نسبة النجاح</span>
            </div>
          </div>
          <div className="er-donut-legend">
            <div><span className="legend-dot legend-passed"></span> اجتياز ({passed})</div>
            <div><span className="legend-dot legend-failed"></span> إخفاق ({failed})</div>
          </div>
        </div>

        {/* Right: Trend line of scores over exams */}
        <div className="er-dashboard-chart-wrap">
          <h3 className="er-chart-header">منحنى أداء وتطوّر الدرجات</h3>
          {revealed.length === 0 ? (
            <div className="er-chart-placeholder">
              <i className="fas fa-chart-line"></i>
              <p>ستظهر إحصائيات ومنحنيات درجاتك هنا فور إعلان نتائج امتحاناتك الأولى</p>
            </div>
          ) : chronological.length === 1 ? (
            <div className="er-chart-placeholder">
              <i className="fas fa-chart-line"></i>
              <p>يتطلب رسم منحنى الأداء أداء امتحانين على الأقل. لديك حالياً امتحان واحد مصحح بدرجة ({chronological[0].score}%)</p>
            </div>
          ) : (
            <div className="er-svg-chart-container">
              <svg viewBox="0 0 100 50" className="er-line-svg" preserveAspectRatio="none">
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
                      <line x1="8" y1={y} x2="95" y2={y} className="er-chart-gridline" />
                      <text x="3" y={y + 1} className="er-chart-gridtext">{grid}%</text>
                    </g>
                  )
                })}

                {/* Filled Gradient Area */}
                <path d={fillPath} className="er-chart-fill-path" fill="url(#area-grad)" />

                {/* Main Trend Line */}
                <path d={linePath} className="er-chart-line-path" />

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
                      >
                        {exam.score}%
                      </text>
                      <text 
                        x={p.x} 
                        y="45" 
                        textAnchor="middle" 
                        className="er-chart-x-label"
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

      <div className={`er-dashboard-insight ${getInsightClass()}`}>
        <div className="er-insight-icon-wrap">
          <i className={`fas ${getInsightIcon()}`}></i>
        </div>
        <div className="er-insight-content">
          <h4>ملاحظات الأداء العام</h4>
          <p>{getInsightMessage()}</p>
        </div>
      </div>
    </div>
  )
}
