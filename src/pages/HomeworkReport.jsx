import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { listHomeworks, getMySubmissionsBatch, listSubmissionsForHomework } from '@backend/homeworksApi'
import { getProfile } from '@backend/profilesApi'
import './HomeworkReport.css'

/* Format a JS date as dd/mm/yyyy */
const fmtDate = (d) => {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date)) return '—'
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
}

export default function HomeworkReport() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [studentName, setStudentName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [currentFilter, setCurrentFilter] = useState('all')
  const initialViewMode = (() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('masar-user'))
      return u?.role === 'admin' ? 'table' : 'cards'
    } catch { return 'cards' }
  })()
  const [viewMode, setViewMode] = useState(initialViewMode)
  const [selectedHw, setSelectedHw] = useState(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [remoteData, setRemoteData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('masar-user'))
      setIsAdmin(u?.role === 'admin')
    } catch { setIsAdmin(false) }
  }, [])

  /* Load data */
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

        // Resolve grade
        let targetGrade = u?.grade || null
        if (paramId && paramId !== u?.id) {
          const p = await getProfile(paramId)
          targetGrade = p?.grade || null
          if (p?.name) setStudentName(p.name)
          if (p?.phone) setStudentId(p.phone)
        }

        // Always fetch fresh — reveal_grades must be live, not cached
        const allHw = await listHomeworks()
        const hw = targetGrade ? allHw.filter((h) => h.grade === targetGrade) : allHw

        // Get submissions
        const hwIds = hw.map((h) => h.id)
        let subsMap = new Map()

        if (paramId && paramId !== u?.id) {
          // Admin viewing a specific student: batch-fetch all submissions for each homework
          // then find rows for the target student
          const allSubs = await Promise.all(
            hwIds.map((hId) => listSubmissionsForHomework(hId))
          )
          for (let i = 0; i < hwIds.length; i++) {
            const sub = (allSubs[i] || []).find((s) => s.student_id === paramId)
            if (sub) subsMap.set(hwIds[i], sub)
          }
        } else {
          // Student viewing their own
          subsMap = await getMySubmissionsBatch(hwIds, targetId)
        }

        const rows = hw.map((h) => {
          const sub = subsMap.get(h.id) || null
          const maxScore = h.max_score || 0
          const studentScore = sub?.score ?? null
          const scorePct = studentScore !== null && maxScore > 0
            ? Math.round((studentScore / maxScore) * 100)
            : 0
          const totalQ = Array.isArray(h.answer_key) ? h.answer_key.length : 0
          const responses = Array.isArray(sub?.responses) ? sub.responses : []
          const answerKey = Array.isArray(h.answer_key) ? h.answer_key : []

          // Build per-question review data
          const questions = answerKey.map((q, qi) => {
            const studentAnswer = responses[qi] ?? -1
            const numOpts = q.options || 4
            const options = Array.from({ length: numOpts }, (_, i) => `الخيار ${i + 1}`)
            return {
              text: `السؤال ${qi + 1}`,
              options,
              correct: q.correct ?? -1,
              studentAnswer: typeof studentAnswer === 'number' ? studentAnswer : -1,
            }
          })

          return {
            id: h.id,
            title: h.title,
            subject: h.subject || 'عام',
            week: h.week || '',
            dueDate: fmtDate(h.due_at),
            submitDate: fmtDate(sub?.submitted_at),
            score: scorePct,
            rawScore: studentScore,
            maxScore,
            status: sub?.submitted_at ? 'submitted' : 'pending',
            gradesRevealed: h.reveal_grades === true,
            questions,
            totalQuestions: totalQ,
            correctCount: questions.filter((q) => q.studentAnswer === q.correct).length,
            feedback: sub?.feedback || '',
            note: sub?.note || '',
          }
        })
        if (!cancelled) setRemoteData(rows)
      } catch (e) {
        if (!cancelled) setLoadError(e.message || 'تعذّر تحميل التقرير')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [searchParams])

  const hwData = remoteData ?? []

  const filteredHw =
    currentFilter === 'all'
      ? hwData
      : currentFilter === 'submitted'
      ? hwData.filter((h) => h.status === 'submitted')
      : currentFilter === 'pending'
      ? hwData.filter((h) => h.status === 'pending')
      : currentFilter === 'excellent'
      ? hwData.filter((h) => h.gradesRevealed && h.score >= 80 && h.status === 'submitted')
      : currentFilter === 'needs_work'
      ? hwData.filter((h) => h.gradesRevealed && h.score < 60 && h.status === 'submitted')
      : hwData

  useEffect(() => {
    const student = searchParams.get('student')
    const idParam = searchParams.get('id')
    if (student) {
      setStudentName(student)
      setStudentId(idParam || '')
    } else {
      try {
        const stored = sessionStorage.getItem('masar-user')
        if (stored) {
          const u = JSON.parse(stored)
          if (u?.name) setStudentName(u.name)
          if (u?.phone) setStudentId(u.phone)
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
    if (score >= 80) return 'hr-rating-excellent'
    if (score >= 60) return 'hr-rating-good'
    return 'hr-rating-poor'
  }

  const openReview = (hw) => { setSelectedHw(hw); setShowReviewModal(true) }
  const openDetail = (hw) => { setSelectedHw(hw); setShowDetailModal(true) }
  const closeAll = () => { setShowReviewModal(false); setShowDetailModal(false); setSelectedHw(null) }

  const total = hwData.length
  const submitted = hwData.filter((h) => h.status === 'submitted').length
  const pending = hwData.filter((h) => h.status === 'pending').length
  const revealed = hwData.filter((h) => h.gradesRevealed && h.status === 'submitted')
  const avgScore = revealed.length > 0
    ? Math.round(revealed.reduce((s, h) => s + h.score, 0) / revealed.length)
    : 0

  const letters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي']

  return (
    <main className="hr-page">
      <div className="hr-container">

        {/* Back button */}
        <button className="hr-back-btn" onClick={() => navigate(-1)}>
          <i className="fas fa-arrow-right"></i>
          رجوع
        </button>

        {/* Page Header */}
        <div className="hr-header">
          <div className="hr-header-icon">
            <i className="fas fa-book-open"></i>
          </div>
          <h1>تقرير الواجبات</h1>
          <p>سجل الواجبات والدرجات التفصيلية</p>
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
          <div className="hr-student-card">
            <div className="hr-student-avatar">
              <i className="fas fa-user-graduate"></i>
            </div>
            <div className="hr-student-info">
              <table className="hr-student-table">
                <tbody>
                  <tr>
                    <td className="hr-info-label"><i className="fas fa-user"></i> الاسم</td>
                    <td className="hr-info-value">{studentName}</td>
                  </tr>
                  {studentId && (
                    <tr>
                      <td className="hr-info-label"><i className="fas fa-id-badge"></i> رقم الطالب</td>
                      <td className="hr-info-value">{studentId}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="hr-info-label"><i className="fas fa-chart-line"></i> المتوسط</td>
                    <td className="hr-info-value">{revealed.length > 0 ? `${avgScore}%` : '—'}</td>
                  </tr>
                  <tr>
                    <td className="hr-info-label"><i className="fas fa-tasks"></i> الإكمال</td>
                    <td className="hr-info-value">{submitted} من {total} واجب</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Stats Strip */}
        <div className="hr-stats">
          <div className="hr-stat-card">
            <i className="fas fa-list-ol hr-stat-icon" style={{color: '#10b981'}}></i>
            <span className="hr-stat-value" style={{color: '#10b981'}}>{total}</span>
            <span className="hr-stat-label">إجمالي</span>
          </div>
          <div className="hr-stat-card">
            <i className="fas fa-check-circle hr-stat-icon" style={{color: '#48bb78'}}></i>
            <span className="hr-stat-value" style={{color: '#48bb78'}}>{submitted}</span>
            <span className="hr-stat-label">مُسلّمة</span>
          </div>
          <div className="hr-stat-card">
            <i className="fas fa-clock hr-stat-icon" style={{color: '#a0aec0'}}></i>
            <span className="hr-stat-value" style={{color: '#a0aec0'}}>{pending}</span>
            <span className="hr-stat-label">لم تُسلَّم</span>
          </div>
          <div className="hr-stat-card">
            <i className="fas fa-percentage hr-stat-icon" style={{color: '#ed8936'}}></i>
            <span className="hr-stat-value" style={{color: '#ed8936'}}>{revealed.length > 0 ? `${avgScore}%` : '—'}</span>
            <span className="hr-stat-label">المتوسط</span>
          </div>
        </div>

        {/* Controls */}
        <div className="hr-controls">
          <div className="hr-filter-group">
            {[
              { key: 'all', label: 'الكل', icon: 'fa-th-list' },
              { key: 'submitted', label: 'مُسلّمة', icon: 'fa-check' },
              { key: 'pending', label: 'لم تُسلَّم', icon: 'fa-hourglass-half' },
              { key: 'excellent', label: 'ممتاز', icon: 'fa-star' },
              { key: 'needs_work', label: 'يحتاج تحسين', icon: 'fa-exclamation-triangle' },
            ].map(({ key, label, icon }) => (
              <button
                key={key}
                className={`hr-filter-btn ${currentFilter === key ? 'active' : ''}`}
                onClick={() => setCurrentFilter(key)}
              >
                <i className={`fas ${icon}`}></i> {label}
              </button>
            ))}
          </div>

          {isAdmin && (
            <div className="hr-view-toggle">
              <button className={`hr-view-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>
                <i className="fas fa-table"></i> جدول
              </button>
              <button className={`hr-view-btn ${viewMode === 'cards' ? 'active' : ''}`} onClick={() => setViewMode('cards')}>
                <i className="fas fa-th-large"></i> بطاقات
              </button>
            </div>
          )}
        </div>

        <div className="hr-results-count">
          عرض <strong>{filteredHw.length}</strong> واجب من أصل {total}
        </div>

        {/* TABLE VIEW — admin only */}
        {isAdmin && viewMode === 'table' && (
          <div className="hr-card" id="hr-reportTable">
            <div className="hr-table-header">
              <h2 className="hr-card-title"><i className="fas fa-clipboard-list"></i> تقرير الواجبات التفصيلي</h2>
              <button className="hr-print-btn" onClick={() => window.print()}>
                <i className="fas fa-print"></i> طباعة
              </button>
            </div>

            <div className="hr-table-container">
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>الواجب</th>
                    <th>الأسبوع</th>
                    <th>الموعد النهائي</th>
                    <th>تاريخ التسليم</th>
                    <th>الحالة</th>
                    <th>الدرجة</th>
                    <th>التقييم</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHw.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="hr-empty-row">لا توجد واجبات تطابق هذا الفلتر</td>
                    </tr>
                  ) : (
                    filteredHw.map((hw, index) => (
                      <tr key={hw.id} className="hr-tr">
                        <td className="hr-td-num">{index + 1}</td>
                        <td className="hr-td-title">
                          <i className="fas fa-book-open"></i>
                          {hw.title}
                        </td>
                        <td>{hw.week || '—'}</td>
                        <td>{hw.dueDate}</td>
                        <td>{hw.status === 'submitted' ? hw.submitDate : '—'}</td>
                        <td>
                          {hw.status === 'pending' ? (
                            <span className="hr-badge hr-badge-pending"><i className="fas fa-hourglass-half"></i> لم تُسلَّم</span>
                          ) : (
                            <span className="hr-badge hr-badge-done"><i className="fas fa-check-circle"></i> مُسلّمة</span>
                          )}
                        </td>
                        <td>
                          {hw.status === 'pending' ? (
                            <span className="hr-text-muted">—</span>
                          ) : hw.gradesRevealed ? (
                            <div className="hr-td-score-wrap">
                              <div className="hr-mini-bar">
                                <div className="hr-mini-fill" style={{ width: `${hw.score}%`, background: getScoreColor(hw.score) }} />
                              </div>
                              <span className="hr-score-text" style={{ color: getScoreColor(hw.score) }}>{hw.rawScore}/{hw.maxScore}</span>
                            </div>
                          ) : (
                            <span className="hr-badge hr-badge-hidden"><i className="fas fa-lock"></i> لم تُعلَن</span>
                          )}
                        </td>
                        <td>
                          {hw.status !== 'pending' && hw.gradesRevealed ? (
                            <span className={`hr-rating ${getRatingClass(hw.score)}`}>{getRating(hw.score)}</span>
                          ) : (
                            <span className="hr-text-muted">—</span>
                          )}
                        </td>
                        <td>
                          <div className="hr-actions">
                            <button className="hr-btn-detail" onClick={() => openDetail(hw)}>
                              <i className="fas fa-info-circle"></i> تفاصيل
                            </button>
                            {hw.status === 'submitted' && hw.gradesRevealed && hw.questions.length > 0 && (
                              <button className="hr-btn-review" onClick={() => openReview(hw)}>
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
          <div className="hr-cards-grid">
            {filteredHw.length === 0 ? (
              <div className="hr-no-results">لا توجد واجبات تطابق هذا الفلتر</div>
            ) : (
              filteredHw.map((hw) => (
                <div key={hw.id} className={`hr-hw-card ${hw.status === 'pending' ? 'hr-card-pending' : ''}`}>
                  <div className="hr-card-top">
                    <div className="hr-card-icon-wrap">
                      <i className="fas fa-book-open"></i>
                    </div>
                    {hw.status === 'pending' ? (
                      <span className="hr-badge hr-badge-pending"><i className="fas fa-hourglass-half"></i> لم تُسلَّم</span>
                    ) : (
                      <span className="hr-badge hr-badge-done"><i className="fas fa-check-circle"></i> مُسلّمة</span>
                    )}
                  </div>

                  <h3 className="hr-card-name">{hw.title}</h3>
                  <p className="hr-card-subject">{hw.subject}</p>

                  {hw.status !== 'pending' && (
                    <div className="hr-card-score-area">
                      {hw.gradesRevealed ? (
                        <>
                          <div className="hr-score-ring" style={{ background: `conic-gradient(${getScoreColor(hw.score)} ${hw.score}%, rgba(16,185,129,0.1) 0%)` }}>
                            <div className="hr-ring-inner">
                              <span className="hr-ring-num" style={{ color: getScoreColor(hw.score) }}>{hw.score}</span>
                              <span className="hr-ring-max">/100</span>
                            </div>
                          </div>
                          <span className={`hr-rating ${getRatingClass(hw.score)}`}>{getRating(hw.score)}</span>
                        </>
                      ) : (
                        <div className="hr-grades-pending-box">
                          <i className="fas fa-lock hr-grades-lock-icon"></i>
                          <span>الدرجات لم تُعلَن بعد</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="hr-card-meta">
                    {hw.week && <span><i className="fas fa-calendar-week"></i> {hw.week}</span>}
                    <span><i className="fas fa-calendar-alt"></i> {hw.dueDate}</span>
                    {hw.status === 'submitted' && <span><i className="fas fa-paper-plane"></i> {hw.submitDate}</span>}
                  </div>

                  <div className="hr-card-actions">
                    <button className="hr-btn-detail" onClick={() => openDetail(hw)}>
                      <i className="fas fa-info-circle"></i> تفاصيل
                    </button>
                    {hw.status === 'submitted' && hw.gradesRevealed && hw.questions.length > 0 && (
                      <button className="hr-btn-review" onClick={() => openReview(hw)}>
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
      {showDetailModal && selectedHw && (
        <div className="hr-modal-overlay" onClick={closeAll}>
          <div className="hr-modal hr-detail-modal" onClick={(e) => e.stopPropagation()}>
            <button className="hr-modal-close" onClick={closeAll}><i className="fas fa-times"></i></button>

            <div className="hr-modal-icon-wrap">
              <i className="fas fa-book-open"></i>
            </div>
            <h2 className="hr-modal-title">{selectedHw.title}</h2>
            <p className="hr-modal-subject">{selectedHw.subject}</p>

            {selectedHw.status !== 'pending' && selectedHw.gradesRevealed ? (
              <div className="hr-detail-ring" style={{ background: `conic-gradient(${getScoreColor(selectedHw.score)} ${selectedHw.score}%, rgba(16,185,129,0.1) 0%)` }}>
                <div className="hr-ring-inner-lg">
                  <span className="hr-ring-num-lg" style={{ color: getScoreColor(selectedHw.score) }}>{selectedHw.score}</span>
                  <span className="hr-ring-max-lg">من 100</span>
                </div>
              </div>
            ) : selectedHw.status !== 'pending' ? (
              <div className="hr-grades-pending-box hr-grades-box-lg">
                <i className="fas fa-lock hr-grades-lock-icon"></i>
                <span>الدرجات لم تُعلَن بعد</span>
              </div>
            ) : null}

            <div className="hr-modal-rows">
              <div className="hr-modal-row">
                <span className="hr-modal-label">الحالة</span>
                <span>{selectedHw.status === 'pending' ? 'لم تُسلَّم بعد' : 'مُسلّمة'}</span>
              </div>
              {selectedHw.status !== 'pending' && selectedHw.gradesRevealed && (
                <div className="hr-modal-row">
                  <span className="hr-modal-label">التقييم</span>
                  <span className={`hr-rating ${getRatingClass(selectedHw.score)}`}>{getRating(selectedHw.score)}</span>
                </div>
              )}
              {selectedHw.week && (
                <div className="hr-modal-row">
                  <span className="hr-modal-label">الأسبوع</span>
                  <span>{selectedHw.week}</span>
                </div>
              )}
              <div className="hr-modal-row">
                <span className="hr-modal-label">الموعد النهائي</span>
                <span>{selectedHw.dueDate}</span>
              </div>
              {selectedHw.status === 'submitted' && (
                <div className="hr-modal-row">
                  <span className="hr-modal-label">تاريخ التسليم</span>
                  <span>{selectedHw.submitDate}</span>
                </div>
              )}
              <div className="hr-modal-row">
                <span className="hr-modal-label">عدد الأسئلة</span>
                <span>{selectedHw.totalQuestions}</span>
              </div>
              {selectedHw.status !== 'pending' && selectedHw.gradesRevealed && (
                <div className="hr-modal-row">
                  <span className="hr-modal-label">الدرجة</span>
                  <span style={{ color: getScoreColor(selectedHw.score), fontWeight: 700 }}>{selectedHw.rawScore} / {selectedHw.maxScore}</span>
                </div>
              )}
            </div>

            {selectedHw.feedback && selectedHw.gradesRevealed && (
              <div className="hr-note-box">
                <i className="fas fa-comment-dots"></i>
                <span>{selectedHw.feedback}</span>
              </div>
            )}

            {selectedHw.status === 'submitted' && selectedHw.gradesRevealed && selectedHw.questions.length > 0 && (
              <button className="hr-btn-review hr-review-full" onClick={() => { setShowDetailModal(false); setShowReviewModal(true) }}>
                <i className="fas fa-eye"></i> مراجعة الإجابات التفصيلية
              </button>
            )}
          </div>
        </div>
      )}

      {/* ANSWER REVIEW MODAL */}
      {showReviewModal && selectedHw && (
        <div className="hr-modal-overlay" onClick={closeAll}>
          <div className="hr-modal hr-review-modal" onClick={(e) => e.stopPropagation()}>
            <button className="hr-modal-close" onClick={closeAll}><i className="fas fa-times"></i></button>

            <div className="hr-review-header">
              <div className="hr-review-icon-wrap">
                <i className="fas fa-book-open"></i>
              </div>
              <div>
                <h2 className="hr-review-title">مراجعة الإجابات</h2>
                <p className="hr-review-exam-name">{selectedHw.title}</p>
              </div>
            </div>

            <div className="hr-review-summary">
              <div className="hr-sum-item hr-sum-correct">
                <span className="hr-sum-val">{selectedHw.correctCount}</span>
                <span className="hr-sum-lbl">إجابة صحيحة</span>
              </div>
              <div className="hr-sum-divider" />
              <div className="hr-sum-item hr-sum-wrong">
                <span className="hr-sum-val">{selectedHw.totalQuestions - selectedHw.correctCount}</span>
                <span className="hr-sum-lbl">إجابة خاطئة</span>
              </div>
              <div className="hr-sum-divider" />
              <div className="hr-sum-item hr-sum-score">
                <span className="hr-sum-val" style={{ color: getScoreColor(selectedHw.score) }}>{selectedHw.score}%</span>
                <span className="hr-sum-lbl">الدرجة النهائية</span>
              </div>
            </div>

            <div className="hr-review-questions">
              {selectedHw.questions.map((q, qi) => {
                const isCorrect = q.studentAnswer === q.correct
                return (
                  <div key={qi} className={`hr-review-q ${isCorrect ? 'hr-q-correct' : 'hr-q-wrong'}`}>
                    <div className="hr-q-header">
                      <span className="hr-q-num">س{qi + 1}</span>
                      <span className={`hr-q-result ${isCorrect ? 'hr-res-correct' : 'hr-res-wrong'}`}>
                        {isCorrect ? (<><i className="fas fa-check"></i> صحيح</>) : (<><i className="fas fa-times"></i> خطأ</>)}
                      </span>
                    </div>
                    <p className="hr-q-text">{q.text}</p>
                    <div className="hr-q-options">
                      {q.options.map((opt, oi) => {
                        const isStudentPick = oi === q.studentAnswer
                        const isCorrectOpt = oi === q.correct
                        let cls = 'hr-opt'
                        if (isCorrectOpt) cls += ' hr-opt-correct'
                        else if (isStudentPick && !isCorrectOpt) cls += ' hr-opt-wrong'
                        return (
                          <div key={oi} className={cls}>
                            <span className="hr-opt-letter">{letters[oi] || oi + 1}</span>
                            <span className="hr-opt-text">{opt}</span>
                            <span className="hr-opt-indicator">
                              {isCorrectOpt && <i className="fas fa-check-circle" style={{color:'#48bb78'}}></i>}
                              {isStudentPick && !isCorrectOpt && <i className="fas fa-times-circle" style={{color:'#ef4444'}}></i>}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    {!isCorrect && (
                      <div className="hr-q-correction">
                        <i className="fas fa-lightbulb"></i>
                        <span> الإجابة الصحيحة: </span>
                        <strong>{letters[q.correct] || q.correct + 1}. {q.options[q.correct]}</strong>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {selectedHw.feedback && (
              <div className="hr-note-box" style={{ marginTop: 16 }}>
                <i className="fas fa-comment-dots"></i>
                <span>{selectedHw.feedback}</span>
              </div>
            )}

            <button className="hr-close-review-btn" onClick={closeAll}>
              <i className="fas fa-times"></i> إغلاق المراجعة
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
