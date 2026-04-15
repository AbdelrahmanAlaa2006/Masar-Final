import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import './ExamsReport.css'

export default function ExamsReport() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [studentName, setStudentName] = useState('')
  const [currentFilter, setCurrentFilter] = useState('all')
  const [viewMode, setViewMode] = useState('table')
  const [selectedExam, setSelectedExam] = useState(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)

  // Each exam has `gradesRevealed` — admin sets this in DB/control panel.
  // When false, scores and answers are hidden from the student.
  const examsData = [
    {
      id: 1,
      title: 'امتحان الرياضيات - الوحدة الأولى',
      icon: '📘',
      subject: 'رياضيات',
      score: 85,
      maxScore: 100,
      status: 'completed',
      attempts: 1,
      maxAttempts: 2,
      duration: '60 دقيقة',
      date: '15/4/2024',
      gradesRevealed: true,
      questions: [
        {
          text: 'ما هو حاصل ضرب 7 × 8؟',
          options: ['54', '56', '48', '64'],
          correct: 1,
          studentAnswer: 1,
        },
        {
          text: 'ما هي قيمة س في المعادلة: 2س + 4 = 10؟',
          options: ['2', '3', '4', '5'],
          correct: 1,
          studentAnswer: 2,
        },
        {
          text: 'ما هو ناتج 144 ÷ 12؟',
          options: ['10', '11', '12', '13'],
          correct: 2,
          studentAnswer: 2,
        },
        {
          text: 'أيٌّ من التالي عدد أولي؟',
          options: ['9', '15', '17', '21'],
          correct: 2,
          studentAnswer: 2,
        },
        {
          text: 'ما هو مربع العدد 13؟',
          options: ['156', '169', '144', '196'],
          correct: 1,
          studentAnswer: 3,
        },
      ],
    },
    {
      id: 2,
      title: 'امتحان العلوم - الفصل الأول',
      icon: '🔬',
      subject: 'علوم',
      score: 72,
      maxScore: 100,
      status: 'completed',
      attempts: 2,
      maxAttempts: 2,
      duration: '45 دقيقة',
      date: '20/4/2024',
      gradesRevealed: true,
      questions: [
        {
          text: 'ما هو أصغر وحدة في الكائن الحي؟',
          options: ['النسيج', 'الخلية', 'الجزيء', 'العضو'],
          correct: 1,
          studentAnswer: 1,
        },
        {
          text: 'أي الغازات يُستخدم في عملية التنفس؟',
          options: ['ثاني أكسيد الكربون', 'النيتروجين', 'الأكسجين', 'الهيدروجين'],
          correct: 2,
          studentAnswer: 0,
        },
        {
          text: 'كم عدد كواكب المجموعة الشمسية؟',
          options: ['7', '8', '9', '10'],
          correct: 1,
          studentAnswer: 1,
        },
      ],
    },
    {
      id: 3,
      title: 'امتحان الجبر المتقدم',
      icon: '📊',
      subject: 'رياضيات',
      score: 0,
      maxScore: 100,
      status: 'pending',
      attempts: 0,
      maxAttempts: 2,
      duration: '90 دقيقة',
      date: '—',
      gradesRevealed: false,
      questions: [],
    },
    {
      id: 4,
      title: 'امتحان الهندسة',
      icon: '📏',
      subject: 'رياضيات',
      score: 91,
      maxScore: 100,
      status: 'completed',
      attempts: 1,
      maxAttempts: 3,
      duration: '75 دقيقة',
      date: '18/4/2024',
      gradesRevealed: false, // grades NOT revealed yet
      questions: [
        {
          text: 'ما مساحة مثلث قاعدته 6 وارتفاعه 4؟',
          options: ['10', '12', '24', '8'],
          correct: 1,
          studentAnswer: 1,
        },
      ],
    },
  ]

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
    if (student) {
      setStudentName(student)
    } else {
      try {
        const stored = localStorage.getItem('masar-user')
        if (stored) {
          const u = JSON.parse(stored)
          if (u?.name) setStudentName(u.name)
        }
      } catch {}
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
    if (score >= 80) return 'rating-excellent'
    if (score >= 60) return 'rating-good'
    return 'rating-poor'
  }

  const openReview = (exam) => {
    setSelectedExam(exam)
    setShowReviewModal(true)
  }

  const openDetail = (exam) => {
    setSelectedExam(exam)
    setShowDetailModal(true)
  }

  const closeAll = () => {
    setShowReviewModal(false)
    setShowDetailModal(false)
    setSelectedExam(null)
  }

  // Summary stats (only count revealed grades for scores)
  const total = examsData.length
  const completed = examsData.filter((e) => e.status === 'completed').length
  const pending = examsData.filter((e) => e.status === 'pending').length
  const revealed = examsData.filter((e) => e.gradesRevealed && e.status === 'completed')
  const passed = revealed.filter((e) => e.score >= 60).length
  const avgScore =
    revealed.length > 0
      ? Math.round(revealed.reduce((s, e) => s + e.score, 0) / revealed.length)
      : 0

  // Answer review helpers
  const correctCount = (exam) =>
    exam.questions.filter((q) => q.studentAnswer === q.correct).length
  const wrongCount = (exam) =>
    exam.questions.filter((q) => q.studentAnswer !== q.correct).length

  const letters = ['أ', 'ب', 'ج', 'د']

  return (
    <main className="er-page">
      <div className="er-container">

        {/* ── Page Header ── */}
        <div className="er-header">
          <div className="er-header-text">
            <h1 className="er-title">
              <span className="er-title-icon">📚</span>
              تقرير الامتحانات
            </h1>
            <p className="er-subtitle">
              مرحباً، <span className="er-student-name">{studentName || 'الطالب'}</span> — إليك سجل امتحاناتك
            </p>
          </div>
          <button className="er-back-btn" onClick={() => navigate(-1)}>
            ← رجوع
          </button>
        </div>

        {/* ── Stats Strip ── */}
        <div className="er-stats">
          <div className="er-stat-card er-stat-total">
            <span className="er-stat-value">{total}</span>
            <span className="er-stat-label">إجمالي الامتحانات</span>
          </div>
          <div className="er-stat-card er-stat-done">
            <span className="er-stat-value">{completed}</span>
            <span className="er-stat-label">مُكتملة</span>
          </div>
          <div className="er-stat-card er-stat-pending">
            <span className="er-stat-value">{pending}</span>
            <span className="er-stat-label">لم تُؤدَّ بعد</span>
          </div>
          <div className="er-stat-card er-stat-pass">
            <span className="er-stat-value">{passed}</span>
            <span className="er-stat-label">ناجح</span>
          </div>
          <div className="er-stat-card er-stat-avg">
            <span className="er-stat-value">{revealed.length > 0 ? `${avgScore}%` : '—'}</span>
            <span className="er-stat-label">متوسط الدرجات</span>
          </div>
        </div>

        {/* ── Controls ── */}
        <div className="er-controls">
          <div className="er-filter-group">
            {[
              { key: 'all', label: 'الكل', icon: '📋' },
              { key: 'passed', label: 'ناجح (≥60%)', icon: '✅' },
              { key: 'failed', label: 'راسب (<60%)', icon: '❌' },
              { key: 'excellent', label: 'ممتاز (≥80%)', icon: '🌟' },
              { key: 'pending', label: 'لم يُؤدَّ', icon: '⏳' },
            ].map(({ key, label, icon }) => (
              <button
                key={key}
                className={`er-filter-btn ${currentFilter === key ? 'active' : ''}`}
                onClick={() => setCurrentFilter(key)}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          <div className="er-view-toggle">
            <button
              className={`er-view-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              ☰ جدول
            </button>
            <button
              className={`er-view-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
            >
              ⊞ بطاقات
            </button>
          </div>
        </div>

        <div className="er-results-count">
          عرض <strong>{filteredExams.length}</strong> امتحان من أصل {total}
        </div>

        {/* ══════════════ TABLE VIEW ══════════════ */}
        {viewMode === 'table' && (
          <div className="er-card" id="er-reportTable">
            <div className="er-table-header">
              <h2 className="er-card-title">تقرير النتائج التفصيلي</h2>
              <button className="er-print-btn" onClick={() => window.print()}>
                🖨️ طباعة
              </button>
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
                      <td colSpan={9} className="er-empty-row">
                        لا توجد امتحانات تطابق هذا الفلتر
                      </td>
                    </tr>
                  ) : (
                    filteredExams.map((exam, index) => (
                      <tr key={exam.id} className="er-tr">
                        <td className="er-td-num">{index + 1}</td>
                        <td className="er-td-title">
                          <span className="er-row-icon">{exam.icon}</span>
                          {exam.title}
                        </td>
                        <td>{exam.subject}</td>
                        <td>{exam.date}</td>
                        <td>
                          {exam.status === 'pending' ? (
                            <span className="er-attempts-zero">—</span>
                          ) : (
                            <span className="er-attempts">
                              {exam.attempts}/{exam.maxAttempts}
                            </span>
                          )}
                        </td>
                        <td>
                          {exam.status === 'pending' ? (
                            <span className="er-badge er-badge-pending">⏳ لم يُؤدَّ</span>
                          ) : (
                            <span className="er-badge er-badge-done">✅ مُكتمل</span>
                          )}
                        </td>
                        <td>
                          {exam.status === 'pending' ? (
                            <span className="er-score-hidden">—</span>
                          ) : exam.gradesRevealed ? (
                            <div className="er-td-score-wrap">
                              <div className="er-mini-bar">
                                <div
                                  className="er-mini-fill"
                                  style={{
                                    width: `${exam.score}%`,
                                    background: getScoreColor(exam.score),
                                  }}
                                />
                              </div>
                              <span
                                className="er-score-text"
                                style={{ color: getScoreColor(exam.score) }}
                              >
                                {exam.score}/{exam.maxScore}
                              </span>
                            </div>
                          ) : (
                            <span className="er-badge er-badge-hidden">🔒 لم تُعلَن بعد</span>
                          )}
                        </td>
                        <td>
                          {exam.status !== 'pending' && exam.gradesRevealed ? (
                            <span className={`er-rating ${getRatingClass(exam.score)}`}>
                              {getRating(exam.score)}
                            </span>
                          ) : (
                            <span className="er-score-hidden">—</span>
                          )}
                        </td>
                        <td>
                          <div className="er-actions">
                            <button
                              className="er-btn-detail"
                              onClick={() => openDetail(exam)}
                            >
                              تفاصيل
                            </button>
                            {exam.status === 'completed' &&
                              exam.gradesRevealed &&
                              exam.questions.length > 0 && (
                                <button
                                  className="er-btn-review"
                                  onClick={() => openReview(exam)}
                                >
                                  مراجعة الإجابات
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

        {/* ══════════════ CARDS VIEW ══════════════ */}
        {viewMode === 'cards' && (
          <div className="er-cards-grid">
            {filteredExams.length === 0 ? (
              <div className="er-no-results">لا توجد امتحانات تطابق هذا الفلتر</div>
            ) : (
              filteredExams.map((exam, i) => (
                <div
                  key={exam.id}
                  className={`er-exam-card ${exam.status === 'pending' ? 'er-card-pending' : ''}`}
                  style={{ animationDelay: `${i * 0.07}s` }}
                >
                  {/* Card top */}
                  <div className="er-card-top">
                    <span className="er-card-icon">{exam.icon}</span>
                    {exam.status === 'pending' ? (
                      <span className="er-badge er-badge-pending">⏳ لم يُؤدَّ</span>
                    ) : (
                      <span className="er-badge er-badge-done">✅ مُكتمل</span>
                    )}
                  </div>

                  <h3 className="er-card-name">{exam.title}</h3>
                  <p className="er-card-subject">{exam.subject}</p>

                  {/* Score area */}
                  {exam.status !== 'pending' && (
                    <div className="er-card-score-area">
                      {exam.gradesRevealed ? (
                        <>
                          <div
                            className="er-score-ring"
                            style={{
                              background: `conic-gradient(${getScoreColor(exam.score)} ${exam.score}%, rgba(102,126,234,0.1) 0%)`,
                            }}
                          >
                            <div className="er-ring-inner">
                              <span
                                className="er-ring-num"
                                style={{ color: getScoreColor(exam.score) }}
                              >
                                {exam.score}
                              </span>
                              <span className="er-ring-max">/{exam.maxScore}</span>
                            </div>
                          </div>
                          <span className={`er-rating ${getRatingClass(exam.score)}`}>
                            {getRating(exam.score)}
                          </span>
                        </>
                      ) : (
                        <div className="er-grades-pending-box">
                          <span className="er-grades-lock">🔒</span>
                          <span className="er-grades-pending-text">الدرجات لم تُعلَن بعد</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Meta */}
                  <div className="er-card-meta">
                    <div className="er-meta-row">
                      <span>⏱️ {exam.duration}</span>
                      <span>📅 {exam.date}</span>
                    </div>
                    <div className="er-meta-row">
                      <span>📋 محاولات: {exam.attempts}/{exam.maxAttempts}</span>
                    </div>
                  </div>

                  {/* Card actions */}
                  <div className="er-card-actions">
                    <button
                      className="er-btn-detail"
                      onClick={() => openDetail(exam)}
                    >
                      تفاصيل
                    </button>
                    {exam.status === 'completed' &&
                      exam.gradesRevealed &&
                      exam.questions.length > 0 && (
                        <button
                          className="er-btn-review"
                          onClick={() => openReview(exam)}
                        >
                          🔍 مراجعة الإجابات
                        </button>
                      )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ══════════════ DETAIL MODAL ══════════════ */}
      {showDetailModal && selectedExam && (
        <div className="er-modal-overlay" onClick={closeAll}>
          <div className="er-modal er-detail-modal" onClick={(e) => e.stopPropagation()}>
            <button className="er-modal-close" onClick={closeAll}>✕</button>

            <div className="er-modal-icon-big">{selectedExam.icon}</div>
            <h2 className="er-modal-title">{selectedExam.title}</h2>
            <p className="er-modal-subject">{selectedExam.subject}</p>

            {selectedExam.status !== 'pending' && selectedExam.gradesRevealed ? (
              <div
                className="er-detail-ring"
                style={{
                  background: `conic-gradient(${getScoreColor(selectedExam.score)} ${selectedExam.score}%, rgba(102,126,234,0.1) 0%)`,
                }}
              >
                <div className="er-ring-inner-lg">
                  <span
                    className="er-ring-num-lg"
                    style={{ color: getScoreColor(selectedExam.score) }}
                  >
                    {selectedExam.score}
                  </span>
                  <span className="er-ring-max-lg">من {selectedExam.maxScore}</span>
                </div>
              </div>
            ) : selectedExam.status !== 'pending' ? (
              <div className="er-grades-pending-box er-grades-box-lg">
                <span className="er-grades-lock">🔒</span>
                <span className="er-grades-pending-text">الدرجات لم تُعلَن بعد</span>
              </div>
            ) : null}

            <div className="er-modal-rows">
              <div className="er-modal-row">
                <span className="er-modal-label">الحالة</span>
                <span>
                  {selectedExam.status === 'pending'
                    ? '⏳ لم يُؤدَّ بعد'
                    : '✅ مُكتمل'}
                </span>
              </div>
              {selectedExam.status !== 'pending' && selectedExam.gradesRevealed && (
                <div className="er-modal-row">
                  <span className="er-modal-label">التقييم</span>
                  <span className={`er-rating ${getRatingClass(selectedExam.score)}`}>
                    {getRating(selectedExam.score)}
                  </span>
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

            {selectedExam.status === 'completed' &&
              selectedExam.gradesRevealed &&
              selectedExam.questions.length > 0 && (
                <button
                  className="er-btn-review er-review-full"
                  onClick={() => {
                    setShowDetailModal(false)
                    setShowReviewModal(true)
                  }}
                >
                  🔍 مراجعة الإجابات التفصيلية
                </button>
              )}
          </div>
        </div>
      )}

      {/* ══════════════ ANSWER REVIEW MODAL ══════════════ */}
      {showReviewModal && selectedExam && (
        <div className="er-modal-overlay" onClick={closeAll}>
          <div
            className="er-modal er-review-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="er-modal-close" onClick={closeAll}>✕</button>

            {/* Review header */}
            <div className="er-review-header">
              <span className="er-review-icon">{selectedExam.icon}</span>
              <div>
                <h2 className="er-review-title">مراجعة إجاباتك</h2>
                <p className="er-review-exam-name">{selectedExam.title}</p>
              </div>
            </div>

            {/* Score summary */}
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
                <span
                  className="er-sum-val"
                  style={{ color: getScoreColor(selectedExam.score) }}
                >
                  {selectedExam.score}%
                </span>
                <span className="er-sum-lbl">الدرجة النهائية</span>
              </div>
            </div>

            {/* Questions list */}
            <div className="er-review-questions">
              {selectedExam.questions.map((q, qi) => {
                const isCorrect = q.studentAnswer === q.correct
                return (
                  <div
                    key={qi}
                    className={`er-review-q ${isCorrect ? 'er-q-correct' : 'er-q-wrong'}`}
                  >
                    <div className="er-q-header">
                      <span className="er-q-num">س{qi + 1}</span>
                      <span className={`er-q-result ${isCorrect ? 'er-res-correct' : 'er-res-wrong'}`}>
                        {isCorrect ? '✅ صحيح' : '❌ خطأ'}
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
                              {isCorrectOpt && '✅'}
                              {isStudentPick && !isCorrectOpt && '❌'}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    {!isCorrect && (
                      <div className="er-q-correction">
                        <span>الإجابة الصحيحة: </span>
                        <strong>{letters[q.correct]}. {q.options[q.correct]}</strong>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <button className="er-close-review-btn" onClick={closeAll}>
              إغلاق المراجعة
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
