import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { listHomeworks, getMySubmissionsBatch, listSubmissionsForHomework } from '@backend/homeworksApi'
import { getProfile } from '@backend/profilesApi'
import { cached, LIST_TTL } from '../utils/cache'
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
  const initialViewMode = (() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('masar-user'))
      return (u?.role === 'admin' || u?.role === 'assistant') ? 'table' : 'cards'
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
      setIsAdmin(u?.role === 'admin' || u?.role === 'assistant')
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

        // Share and hit the global 30-minute homeworks list cache
        const allHw = await cached('homeworks', LIST_TTL, listHomeworks)
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
          // Student viewing their own — cached internally with 5-second TTL
          subsMap = await getMySubmissionsBatch(hwIds, targetId)
        }

        const rows = hw.map((h) => {
          const sub = (subsMap && typeof subsMap.get === 'function' ? subsMap.get(h.id) : subsMap?.[h.id]) || null
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
            <h1>تقرير الواجبات</h1>
            <p>سجل الواجبات والدرجات التفصيلية للطلاب</p>
          </div>
          <div className="cp-page-icon">
            <i className="fas fa-book-open"></i>
          </div>
        </div>
        <div className="cp-header-divider"></div>

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
                <span><i className="fas fa-tasks"></i> الإكمال: {submitted} من {total} واجب</span>
              </div>
            </div>
          </div>
        )}

        {studentName && !isAdmin && (
          <HomeworkDashboard hwData={hwData} />
        )}

        {/* Stats Strip */}
        <div className="cp-stats-row">
          <div className="cp-stat">
            <i className="fas fa-list-ol" style={{color: '#5bc2e7', background: 'rgba(91, 194, 231, 0.1)'}}></i>
            <div>
              <div className="cp-stat-val">{total}</div>
              <div className="cp-stat-lbl">إجمالي الواجبات</div>
            </div>
          </div>
          <div className="cp-stat cp-stat-good">
            <i className="fas fa-check-circle"></i>
            <div>
              <div className="cp-stat-val">{submitted}</div>
              <div className="cp-stat-lbl">مُسلّمة</div>
            </div>
          </div>
          <div className="cp-stat cp-stat-bad">
            <i className="fas fa-clock"></i>
            <div>
              <div className="cp-stat-val">{pending}</div>
              <div className="cp-stat-lbl">لم تُسلَّم</div>
            </div>
          </div>
          <div className="cp-stat cp-stat-info">
            <i className="fas fa-percentage"></i>
            <div>
              <div className="cp-stat-val">{revealed.length > 0 ? `${avgScore}%` : '—'}</div>
              <div className="cp-stat-lbl">المتوسط</div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="cp-bulk-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div className="cp-filter-group" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: 'الكل', icon: 'fa-th-list' },
              { key: 'submitted', label: 'مُسلّمة', icon: 'fa-check' },
              { key: 'pending', label: 'لم تُسلَّم', icon: 'fa-hourglass-half' },
              { key: 'excellent', label: 'ممتاز', icon: 'fa-star' },
              { key: 'needs_work', label: 'يحتاج تحسين', icon: 'fa-exclamation-triangle' },
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
          عرض <strong>{filteredHw.length}</strong> واجب من أصل {total}
        </div>

        {/* TABLE VIEW — admin only */}
        {isAdmin && viewMode === 'table' && (
          <div className="cp-table-card" id="hr-reportTable">
            <div className="cp-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}><i className="fas fa-clipboard-list" style={{ color: '#5bc2e7', marginLeft: 8 }}></i> تقرير الواجبات التفصيلي</h2>
              </div>
              <button className="cp-crumbs-back" onClick={() => window.print()} style={{ padding: '6px 12px', background: 'transparent' }}>
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
                      <td colSpan={9} style={{ textAlign: 'center', padding: 24, color: 'var(--cp-text-muted)' }}>لا توجد واجبات تطابق هذا الفلتر</td>
                    </tr>
                  ) : (
                    filteredHw.map((hw, index) => (
                      <tr key={hw.id}>
                        <td>{index + 1}</td>
                        <td style={{ fontWeight: 700 }}>
                          <i className="fas fa-book-open" style={{ color: '#5bc2e7', marginLeft: 8 }}></i>
                          {hw.title}
                        </td>
                        <td>{hw.week || '—'}</td>
                        <td>{hw.dueDate}</td>
                        <td>{hw.status === 'submitted' ? hw.submitDate : '—'}</td>
                        <td>
                          {hw.status === 'pending' ? (
                            <span className="cp-badge cp-badge-danger"><i className="fas fa-hourglass-half"></i> لم تُسلَّم</span>
                          ) : (
                            <span className="cp-badge cp-badge-success"><i className="fas fa-check-circle"></i> مُسلّمة</span>
                          )}
                        </td>
                        <td>
                          {hw.status === 'pending' ? (
                            <span>—</span>
                          ) : hw.gradesRevealed ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 60, height: 6, background: 'var(--cp-divider)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: `${hw.score}%`, height: '100%', background: getScoreColor(hw.score), borderRadius: 3 }} />
                              </div>
                              <span style={{ color: getScoreColor(hw.score), fontWeight: 700 }}>{hw.rawScore}/{hw.maxScore}</span>
                            </div>
                          ) : (
                            <span className="cp-badge cp-badge-neutral"><i className="fas fa-lock"></i> لم تُعلَن</span>
                          )}
                        </td>
                        <td>
                          {hw.status !== 'pending' && hw.gradesRevealed ? (
                            <span className={`cp-badge ${hw.score >= 80 ? 'cp-badge-success' : hw.score >= 60 ? 'cp-badge-warning' : 'cp-badge-danger'}`}>{getRating(hw.score)}</span>
                          ) : (
                            <span>—</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="cp-crumbs-back" onClick={() => openDetail(hw)} style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'transparent' }}>
                              <i className="fas fa-info-circle"></i> تفاصيل
                            </button>
                            {hw.status === 'submitted' && hw.gradesRevealed && hw.questions.length > 0 && (
                              <button className="cp-crumbs-back" onClick={() => openReview(hw)} style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'transparent' }}>
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
            {filteredHw.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--cp-text-muted)' }}>لا توجد واجبات تطابق هذا الفلتر</div>
            ) : (
              filteredHw.map((hw) => (
                <div key={hw.id} className="cp-section-card cp-accent-teal" style={{ display: 'block', padding: '1.25rem', opacity: hw.status === 'pending' ? 0.75 : 1, textAlign: 'right' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div className="cp-section-icon" style={{ width: 40, height: 40, borderRadius: 10, margin: 0 }}>
                      <i className="fas fa-book-open"></i>
                    </div>
                    {hw.status === 'pending' ? (
                      <span className="cp-badge cp-badge-danger"><i className="fas fa-hourglass-half"></i> لم تُسلَّم</span>
                    ) : (
                      <span className="cp-badge cp-badge-success"><i className="fas fa-check-circle"></i> مُسلّمة</span>
                    )}
                  </div>

                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 6px', color: 'var(--cp-text-main)' }}>{hw.title}</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', margin: '0 0 12px' }}>{hw.subject}</p>

                  {hw.status !== 'pending' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, margin: '16px 0' }}>
                      {hw.gradesRevealed ? (
                        <>
                          <div style={{ width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `conic-gradient(${getScoreColor(hw.score)} ${hw.score}%, var(--cp-divider) 0%)` }}>
                            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--cp-card-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: '1.15rem', fontWeight: 700, color: getScoreColor(hw.score) }}>{hw.score}</span>
                              <span style={{ fontSize: '0.6rem', color: 'var(--cp-text-muted)' }}>/100</span>
                            </div>
                          </div>
                          <span className={`cp-badge ${hw.score >= 80 ? 'cp-badge-success' : hw.score >= 60 ? 'cp-badge-warning' : 'cp-badge-danger'}`}>{getRating(hw.score)}</span>
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
                    {hw.week && <span><i className="fas fa-calendar-week" style={{ marginLeft: 4 }}></i> {hw.week}</span>}
                    <span><i className="fas fa-calendar-alt" style={{ marginLeft: 4 }}></i> {hw.dueDate}</span>
                    {hw.status === 'submitted' && <span><i className="fas fa-paper-plane" style={{ marginLeft: 4 }}></i> {hw.submitDate}</span>}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="cp-crumbs-back" onClick={() => openDetail(hw)} style={{ flex: 1, padding: '6px', justifyContent: 'center', background: 'transparent' }}>
                      <i className="fas fa-info-circle"></i> تفاصيل
                    </button>
                    {hw.status === 'submitted' && hw.gradesRevealed && hw.questions.length > 0 && (
                      <button className="cp-crumbs-back" onClick={() => openReview(hw)} style={{ flex: 1, padding: '6px', justifyContent: 'center', background: 'transparent' }}>
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
        <div className="rp-modal-overlay" onClick={closeAll} role="dialog" aria-modal="true">
          <div className="rp-modal" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', color: 'var(--cp-text-main)', maxWidth: 480 }}>
            <div className="rp-modal-header" style={{ borderBottom: '1px solid var(--cp-divider)' }}>
              <div className="rp-modal-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                <i className="fas fa-book-open"></i>
              </div>
              <div className="rp-modal-title">
                <h3 style={{ color: 'var(--cp-text-main)', margin: 0 }}>{selectedHw.title}</h3>
                <p style={{ color: 'var(--cp-text-muted)', margin: '4px 0 0', fontSize: '0.85rem' }}>{selectedHw.subject}</p>
              </div>
              <button className="rp-modal-close" onClick={closeAll} style={{ background: 'var(--cp-back-bg)', border: '1px solid var(--cp-back-border)', color: 'var(--cp-text-muted)' }}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              {selectedHw.status !== 'pending' && selectedHw.gradesRevealed ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '20px 0' }}>
                  <div style={{ width: 100, height: 100, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `conic-gradient(${getScoreColor(selectedHw.score)} ${selectedHw.score}%, var(--cp-divider) 0%)` }}>
                    <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--cp-card-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '1.8rem', fontWeight: 800, color: getScoreColor(selectedHw.score) }}>{selectedHw.score}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)' }}>من 100</span>
                    </div>
                  </div>
                </div>
              ) : selectedHw.status !== 'pending' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 20, borderRadius: 12, background: 'var(--cp-hover-bg)', color: 'var(--cp-text-muted)', fontSize: '0.95rem', border: '1px dashed var(--cp-divider)', margin: '20px 0' }}>
                  <i className="fas fa-lock" style={{ fontSize: '1.3rem', color: '#5bc2e7' }}></i>
                  <span>الدرجات لم تُعلَن بعد</span>
                </div>
              ) : null}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                  <span style={{ color: 'var(--cp-text-muted)' }}>الحالة</span>
                  <span className={`cp-badge ${selectedHw.status === 'pending' ? 'cp-badge-danger' : 'cp-badge-success'}`}>{selectedHw.status === 'pending' ? 'لم تُسلَّم بعد' : 'مُسلّمة'}</span>
                </div>
                {selectedHw.status !== 'pending' && selectedHw.gradesRevealed && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                    <span style={{ color: 'var(--cp-text-muted)' }}>التقييم</span>
                    <span className={`cp-badge ${selectedHw.score >= 80 ? 'cp-badge-success' : selectedHw.score >= 60 ? 'cp-badge-warning' : 'cp-badge-danger'}`}>{getRating(selectedHw.score)}</span>
                  </div>
                )}
                {selectedHw.week && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                    <span style={{ color: 'var(--cp-text-muted)' }}>الأسبوع</span>
                    <span style={{ color: 'var(--cp-text-main)', fontWeight: 600 }}>{selectedHw.week}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                  <span style={{ color: 'var(--cp-text-muted)' }}>الموعد النهائي</span>
                  <span style={{ color: 'var(--cp-text-main)', fontWeight: 600 }}>{selectedHw.dueDate}</span>
                </div>
                {selectedHw.status === 'submitted' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                    <span style={{ color: 'var(--cp-text-muted)' }}>تاريخ التسليم</span>
                    <span style={{ color: 'var(--cp-text-main)', fontWeight: 600 }}>{selectedHw.submitDate}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                  <span style={{ color: 'var(--cp-text-muted)' }}>عدد الأسئلة</span>
                  <span style={{ color: 'var(--cp-text-main)', fontWeight: 600 }}>{selectedHw.totalQuestions}</span>
                </div>
                {selectedHw.status !== 'pending' && selectedHw.gradesRevealed && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: 'none' }}>
                    <span style={{ color: 'var(--cp-text-muted)' }}>الدرجة</span>
                    <span style={{ color: getScoreColor(selectedHw.score), fontWeight: 700 }}>{selectedHw.rawScore} / {selectedHw.maxScore}</span>
                  </div>
                )}
              </div>

              {selectedHw.feedback && selectedHw.gradesRevealed && (
                <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'var(--cp-hover-bg)', color: 'var(--cp-text-muted)', fontSize: '0.85rem', marginTop: 16, border: '1px solid var(--cp-divider)' }}>
                  <i className="fas fa-comment-dots" style={{ color: '#10b981', marginTop: 3 }}></i>
                  <span>{selectedHw.feedback}</span>
                </div>
              )}

              {selectedHw.status === 'submitted' && selectedHw.gradesRevealed && selectedHw.questions.length > 0 && (
                <button className="cp-btn cp-btn-success" onClick={() => { setShowDetailModal(false); setShowReviewModal(true) }} style={{ width: '100%', marginTop: 18, padding: 12, borderRadius: 12, display: 'flex', justifyContent: 'center', gap: 8 }}>
                  <i className="fas fa-eye"></i> مراجعة الإجابات التفصيلية
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ANSWER REVIEW MODAL */}
      {showReviewModal && selectedHw && (
        <div className="rp-modal-overlay" onClick={closeAll} role="dialog" aria-modal="true">
          <div className="rp-modal" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', color: 'var(--cp-text-main)', maxWidth: 640 }}>
            <div className="rp-modal-header" style={{ borderBottom: '1px solid var(--cp-divider)' }}>
              <div className="rp-modal-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                <i className="fas fa-book-open"></i>
              </div>
              <div className="rp-modal-title">
                <h3 style={{ color: 'var(--cp-text-main)', margin: 0 }}>مراجعة الإجابات</h3>
                <p style={{ color: 'var(--cp-text-muted)', margin: '4px 0 0', fontSize: '0.85rem' }}>{selectedHw.title}</p>
              </div>
              <button className="rp-modal-close" onClick={closeAll} style={{ background: 'var(--cp-back-bg)', border: '1px solid var(--cp-back-border)', color: 'var(--cp-text-muted)' }}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, borderRadius: 14, background: 'var(--cp-hover-bg)', padding: 14, border: '1px solid var(--cp-divider)', justifyContent: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
                  <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#10b981' }}>{selectedHw.correctCount}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--cp-text-muted)' }}>إجابة صحيحة</span>
                </div>
                <div style={{ width: 1, background: 'var(--cp-divider)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
                  <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ef4444' }}>{selectedHw.totalQuestions - selectedHw.correctCount}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--cp-text-muted)' }}>إجابة خاطئة</span>
                </div>
                <div style={{ width: 1, background: 'var(--cp-divider)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
                  <span style={{ fontSize: '1.3rem', fontWeight: 800, color: getScoreColor(selectedHw.score) }}>{selectedHw.score}%</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--cp-text-muted)' }}>الدرجة النهائية</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '50vh', overflowY: 'auto', paddingLeft: 4, paddingRight: 4 }}>
                {selectedHw.questions.map((q, qi) => {
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

              {selectedHw.feedback && (
                <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(99, 102, 241, 0.08)', color: '#a5b4fc', fontSize: '0.85rem', marginTop: 16, border: '1px solid rgba(99, 102, 241, 0.15)' }}>
                  <i className="fas fa-comment-dots" style={{ marginTop: 3, flexShrink: 0 }}></i>
                  <span>{selectedHw.feedback}</span>
                </div>
              )}

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

function HomeworkDashboard({ hwData }) {
  const total = hwData.length
  const submitted = hwData.filter((h) => h.status === 'submitted').length
  const pending = hwData.filter((h) => h.status === 'pending').length
  const revealed = hwData.filter((h) => h.gradesRevealed && h.status === 'submitted')
  const avgScore = revealed.length > 0
    ? Math.round(revealed.reduce((s, h) => s + h.score, 0) / revealed.length)
    : 0

  // Donut percentage calculations
  const completionRate = total > 0 ? Math.round((submitted / total) * 100) : 0
  const strokeDash = (completionRate / 100) * 251.2 // 2 * PI * r (r=40)

  // Filter recent 5 graded homeworks for the bar chart
  const recentGraded = [...revealed].slice(-5)

  const getScoreColor = (score) => {
    if (score >= 80) return '#10b981' // green
    if (score >= 60) return '#f59e0b' // orange
    return '#ef4444' // red
  }

  const getInsightMessage = () => {
    if (total === 0) return 'لا توجد واجبات مضافة بعد.'
    if (submitted === 0) return 'ابدأ بحل واجباتك للحصول على تقييم لأدائك.'
    if (avgScore >= 90) return 'أداء استثنائي! درجاتك ممتازة جداً وتدل على فهم كامل للمنهج. استمر في هذا التفوق الباهر!'
    if (avgScore >= 80) return 'أداء رائع وممتاز! درجاتك ممتازة ومستواك ثابت. حافظ على هذا التميز لتحقيق أعلى الدرجات.'
    if (avgScore >= 60) return 'أداء جيد جداً! مستواك جيد ولكن هناك مجال لبعض التحسين. ركز أكثر في المراجعة لرفع درجاتك.'
    return 'مستواك يحتاج إلى بذل المزيد من الجهد والمراجعة. يرجى التركيز ومراجعة الأخطاء مع معلمك لرفع مستواك الدراسي.'
  }

  const getInsightIcon = () => {
    if (avgScore >= 80) return 'fa-medal'
    if (avgScore >= 60) return 'fa-circle-up'
    return 'fa-circle-exclamation'
  }

  const getInsightClass = () => {
    if (avgScore >= 80) return 'hr-insight-excellent'
    if (avgScore >= 60) return 'hr-insight-good'
    return 'hr-insight-warning'
  }

  return (
    <div className="cp-panel" style={{ padding: '1.6rem', marginBottom: 24 }}>
      <h2 className="cp-panel-header" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.2rem', fontWeight: 700, margin: '0 0 20px' }}>
        <i className="fas fa-chart-pie" style={{ color: '#10b981' }}></i> لوحة تحليل الأداء والتقدم الدراسي
      </h2>

      <div className="hr-dashboard-layout">
        {/* Left column: Donut Progress */}
        <div className="hr-dashboard-donut-wrap">
          <div className="hr-dashboard-donut-inner">
            <svg viewBox="0 0 100 100" className="hr-donut-svg">
              <circle cx="50" cy="50" r="40" className="hr-donut-bg" style={{ fill: 'none', stroke: 'var(--cp-divider)', strokeWidth: 8 }} />
              <circle 
                cx="50" 
                cy="50" 
                r="40" 
                className="hr-donut-fill"
                style={{
                  fill: 'none',
                  strokeWidth: 8,
                  strokeLinecap: 'round',
                  strokeDasharray: `${strokeDash} 251.2`,
                  transform: 'rotate(-90deg)',
                  transformOrigin: '50% 50%',
                  stroke: '#10b981'
                }}
              />
            </svg>
            <div className="hr-donut-text">
              <span className="hr-donut-num" style={{ color: 'var(--cp-text-main)', fontSize: '1.6rem', fontWeight: 800 }}>{completionRate}%</span>
              <span className="hr-donut-lbl" style={{ color: 'var(--cp-text-muted)', fontSize: '0.72rem' }}>نسبة الإكمال</span>
            </div>
          </div>
          <div className="hr-donut-legend" style={{ display: 'flex', gap: 16, fontSize: '0.8rem', color: 'var(--cp-text-muted)' }}>
            <div><span className="legend-dot legend-submitted" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10b981', marginInlineEnd: 6 }}></span> مُسلّم ({submitted})</div>
            <div><span className="legend-dot legend-pending" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--cp-divider)', marginInlineEnd: 6 }}></span> غير مُسلّم ({pending})</div>
          </div>
        </div>

        {/* Right column: Recent Scores Chart */}
        <div className="hr-dashboard-chart-wrap">
          <h3 className="hr-chart-header" style={{ color: 'var(--cp-text-main)', fontSize: '0.95rem', fontWeight: 700, margin: '0 0 16px' }}>درجات آخر الواجبات المقيّمة</h3>
          {recentGraded.length === 0 ? (
            <div className="hr-chart-placeholder" style={{ border: '1px dashed var(--cp-divider)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', color: 'var(--cp-text-muted)' }}>
              <i className="fas fa-chart-bar" style={{ fontSize: '1.8rem', marginBottom: 8 }}></i>
              <p>ستظهر درجاتك هنا بمجرد تصحيح المعلم لواجباتك وإعلانها</p>
            </div>
          ) : (
            <div className="hr-svg-chart-container" style={{ background: 'rgba(15, 23, 42, 0.3)', border: '1px solid var(--cp-divider)', borderRadius: 12, padding: '16px 12px 6px' }}>
              <svg viewBox="0 0 100 65" className="hr-bar-svg" preserveAspectRatio="none" style={{ width: '100%', height: '150px' }}>
                {[0, 25, 50, 75, 100].map((grid, gi) => {
                  const y = 50 - (grid * 0.45);
                  return (
                    <g key={gi}>
                      <line x1="8" y1={y} x2="95" y2={y} className="hr-chart-gridline" style={{ stroke: 'var(--cp-divider)', strokeWidth: 0.3 }} />
                      <text x="3" y={y + 1} className="hr-chart-gridtext" style={{ fill: 'var(--cp-text-muted)', fontSize: 3, fontFamily: 'inherit' }}>{grid}%</text>
                    </g>
                  )
                })}

                {recentGraded.map((hw, idx) => {
                  const x = 12 + idx * 16;
                  const barHeight = hw.score * 0.45;
                  const y = 50 - barHeight;
                  const color = getScoreColor(hw.score);
                  return (
                    <g key={hw.id}>
                      <defs>
                        <linearGradient id={`grad-${hw.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} />
                          <stop offset="100%" stopColor={color} stopOpacity="0.4" />
                        </linearGradient>
                      </defs>
                      <rect 
                        x={x} 
                        y={y} 
                        width="8" 
                        height={barHeight} 
                        rx="2"
                        className="hr-chart-bar-rect"
                        fill={`url(#grad-${hw.id})`}
                      />
                      <text 
                        x={x + 4} 
                        y={y - 2} 
                        textAnchor="middle" 
                        className="hr-chart-bar-score"
                        fill={color}
                        style={{ fontSize: '3.2px', fontWeight: 800 }}
                      >
                        {hw.score}%
                      </text>
                      <text 
                        x={x + 4} 
                        y="55" 
                        textAnchor="middle" 
                        className="hr-chart-bar-label"
                        style={{ fill: 'var(--cp-text-muted)', fontSize: 3 }}
                      >
                        {hw.title.length > 5 ? hw.title.slice(0, 5) + '..' : hw.title}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
          )}
        </div>
      </div>

      <div className={`hr-dashboard-insight ${getInsightClass()}`} style={{
        display: 'flex',
        gap: 14,
        padding: 16,
        borderRadius: 12,
        marginTop: 20,
        background: avgScore >= 80 ? 'rgba(16, 185, 129, 0.08)' : avgScore >= 60 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(239, 68, 68, 0.08)',
        border: `1px solid ${avgScore >= 80 ? 'rgba(16, 185, 129, 0.15)' : avgScore >= 60 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)'}`
      }}>
        <div className="hr-insight-icon-wrap" style={{
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
        <div className="hr-insight-content" style={{ flex: 1 }}>
          <h4 style={{ color: 'var(--cp-text-main)', fontSize: '0.95rem', fontWeight: 700, margin: '0 0 4px' }}>ملاحظات الأداء العام</h4>
          <p style={{ color: 'var(--cp-text-muted)', fontSize: '0.88rem', margin: 0 }}>{getInsightMessage()}</p>
        </div>
      </div>
    </div>
  )
}

