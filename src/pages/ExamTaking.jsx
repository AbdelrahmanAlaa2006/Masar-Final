import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import './ExamTaking.css'
import { getExam, startAttempt, submitAttempt } from '@backend/examsApi'

export default function ExamTaking() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const examId = params.get('id')

  const [exam, setExam] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [attemptId, setAttemptId] = useState(null)
  const [userId, setUserId] = useState(null)

  const [currentQuestion, setCurrentQuestion] = useState(0)
  // answers: { [qIdx]: Set<optIdx> } — works for both single and multi
  const [answers, setAnswers] = useState({})
  const [timeLeft, setTimeLeft] = useState(0)
  // Storage key for resuming after a refresh. Scoped to exam + browser
  // session — same exam in different tabs share state, which is fine
  // since the server attempt row is the source of truth on submit.
  const storageKey = examId ? `masar-exam-progress:${examId}` : null
  const [examFinished, setExamFinished] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [finalScore, setFinalScore] = useState(null)
  const [unansweredAlert, setUnansweredAlert] = useState(null)
  const submittedRef = useRef(false)
  // Guard against StrictMode's mount→unmount→mount cycle (dev-only) so
  // we don't create two attempt rows for the same load. In production
  // this just no-ops on the second pass.
  const startedRef = useRef(false)

  // ── Load the exam + start an attempt ──────────────────────────
  useEffect(() => {
    // Run-once guard: in React StrictMode (dev), this effect mounts
    // twice. Without this guard we'd insert two attempt rows and the
    // exam-lock would flicker on/off, causing the visible "refreshing"
    // behaviour students were seeing.
    if (startedRef.current) return
    startedRef.current = true

    const run = async () => {
      if (!examId) { setLoadError('لم يتم تحديد الامتحان'); return }
      try {
        const u = JSON.parse(sessionStorage.getItem('masar-user'))
        const sid = u?.id
        if (!sid) { setLoadError('يجب تسجيل الدخول'); return }
        setUserId(sid)

        const e = await getExam(examId)
        setExam(e)
        // Restore prior in-flight progress (answers, current question,
        // remaining time) so a refresh mid-exam doesn't reset everything.
        let resumedTime = null
        if (storageKey) {
          try {
            const saved = JSON.parse(localStorage.getItem(storageKey))
            if (saved && saved.answers) {
              const restored = {}
              for (const [k, v] of Object.entries(saved.answers)) {
                restored[k] = new Set(v)
              }
              setAnswers(restored)
            }
            if (saved && Number.isInteger(saved.currentQuestion)) {
              setCurrentQuestion(saved.currentQuestion)
            }
            if (saved && Number.isFinite(saved.deadline)) {
              const remaining = Math.max(0, Math.floor((saved.deadline - Date.now()) / 1000))
              resumedTime = remaining
            }
          } catch {}
        }
        setTimeLeft(resumedTime != null ? resumedTime : (e.duration_minutes || 10) * 60)

        try {
          const att = await startAttempt({
            exam_id: e.id,
            student_id: sid,
            max_score: e.total_points,
          })
          setAttemptId(att.id)
        } catch (attErr) {
          // Non-fatal for admins / preview: log it but let the exam render
          // so the user can review questions even if the attempt row could
          // not be created (e.g. RLS blocked the insert).
          console.error('startAttempt failed', attErr)
        }
      } catch (err) {
        console.error('ExamTaking load failed', err)
        setLoadError(err.message || 'تعذر تحميل الامتحان')
        startedRef.current = false
      }
    }
    run()
  }, [examId])

  const questions = exam?.questions || []

  // ── Persist progress on every change so a refresh resumes mid-exam.
  // We store the absolute deadline (not the remaining seconds) so the
  // clock keeps ticking even while the page is closed. Cleared on submit.
  useEffect(() => {
    if (!storageKey || !exam || examFinished) return
    try {
      const serialAnswers = {}
      for (const [k, v] of Object.entries(answers)) {
        serialAnswers[k] = Array.from(v || [])
      }
      const deadline = Date.now() + timeLeft * 1000
      localStorage.setItem(storageKey, JSON.stringify({
        answers: serialAnswers,
        currentQuestion,
        deadline,
      }))
    } catch {}
  }, [answers, currentQuestion, timeLeft, storageKey, exam, examFinished])

  // ── Timer ─────────────────────────────────────────────────────
  useEffect(() => {
    if (examFinished || !exam) return
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          handleFinishExam(true) // auto
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [examFinished, exam])

  const formatTime = seconds => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const answeredCount = useMemo(
    () => Object.values(answers).filter(s => s && s.size > 0).length,
    [answers]
  )
  const remainingCount = questions.length - answeredCount

  const toggleOption = (qIdx, optIdx) => {
    if (examFinished) return
    const q = questions[qIdx]
    setAnswers(prev => {
      const cur = new Set(prev[qIdx] || [])
      if (q.isMultiple) {
        cur.has(optIdx) ? cur.delete(optIdx) : cur.add(optIdx)
      } else {
        cur.clear()
        cur.add(optIdx)
      }
      return { ...prev, [qIdx]: cur }
    })
  }

  const isSelected = (qIdx, optIdx) =>
    (answers[qIdx] && answers[qIdx].has(optIdx)) || false

  const computeScore = () => {
    let earned = 0
    questions.forEach((q, qIdx) => {
      const picked = Array.from(answers[qIdx] || []).sort((a, b) => a - b)
      const correct = [...(q.answers || [])].sort((a, b) => a - b)
      const allMatch =
        picked.length === correct.length &&
        picked.every((v, i) => v === correct[i])
      if (allMatch) earned += (q.points || 1)
    })
    return earned
  }

  const unansweredIndices = useMemo(
    () => questions.map((_, i) => i).filter(i => !answers[i] || answers[i].size === 0),
    [questions, answers]
  )

  const handleFinishExam = async (auto = false) => {
    if (submittedRef.current || submitting) return
    // Manual submit requires answering every question. Auto-submit on
    // timeout still goes through with whatever the student has.
    if (!auto && unansweredIndices.length > 0) {
      setUnansweredAlert(unansweredIndices)
      return
    }
    submittedRef.current = true
    setSubmitting(true)
    const score = computeScore()
    const responses = questions.map((q, qIdx) => ({
      questionId: qIdx,
      selected: Array.from(answers[qIdx] || []),
    }))
    try {
      if (attemptId) {
        await submitAttempt(attemptId, {
          score,
          max_score: exam.total_points,
          responses,
        })
      }
    } catch (err) {
      console.error('submitAttempt failed', err)
    }
    setFinalScore(score)
    setExamFinished(true)
    setSubmitting(false)
    if (storageKey) {
      try { localStorage.removeItem(storageKey) } catch {}
    }
  }

  if (loadError) {
    return (
      <div className="et-wrapper">
        <div className="et-card" style={{ textAlign: 'center', padding: '40px' }}>
          <h2>خطأ</h2>
          <p>{loadError}</p>
          <button className="et-btn et-btn-prev" onClick={() => navigate('/exams')}>
            العودة إلى الامتحانات
          </button>
        </div>
      </div>
    )
  }

  if (!exam) {
    return (
      <div className="et-wrapper">
        <div className="et-card" style={{ textAlign: 'center', padding: '40px' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem' }}></i>
          <p>جاري تحميل الامتحان...</p>
        </div>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="et-wrapper">
        <div className="et-card" style={{ textAlign: 'center', padding: '40px' }}>
          <h2>لا توجد أسئلة في هذا الامتحان</h2>
          <button className="et-btn et-btn-prev" onClick={() => navigate('/exams')}>العودة</button>
        </div>
      </div>
    )
  }

  const currentQ = questions[currentQuestion]
  const letters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح']
  const progress = ((currentQuestion + 1) / questions.length) * 100

  return (
    <div className="et-wrapper">
      {examFinished && (
        <div className="et-back-row">
          <button className="et-back-btn" onClick={() => navigate('/exams')}>
            العودة إلى الامتحانات
          </button>
        </div>
      )}
      <div className={`et-layout ${examFinished ? 'is-finished' : ''}`}>
      {!examFinished && (
        <aside className="et-sidepanel" aria-label="قائمة الأسئلة">
          <div className="et-sidepanel-head">
            <h3>الأسئلة</h3>
            <span className="et-sidepanel-count">
              {answeredCount} / {questions.length}
            </span>
          </div>
          <div className="et-sidepanel-grid">
            {questions.map((_, idx) => {
              const answered = answers[idx] && answers[idx].size > 0
              const active = idx === currentQuestion
              return (
                <button
                  key={idx}
                  className={`et-side-num ${answered ? 'is-answered' : 'is-pending'} ${active ? 'is-active' : ''}`}
                  onClick={() => setCurrentQuestion(idx)}
                  aria-label={`السؤال ${idx + 1}${answered ? ' - تمت الإجابة' : ' - لم يُجَب بعد'}`}
                  title={answered ? 'تمت الإجابة' : 'لم يُجَب بعد'}
                >
                  {idx + 1}
                  {answered && <i className="fas fa-check et-side-num-tick" aria-hidden="true"></i>}
                </button>
              )
            })}
          </div>
          <div className="et-sidepanel-legend">
            <span><span className="et-legend-swatch is-answered"></span> أجبت</span>
            <span><span className="et-legend-swatch is-pending"></span> متبقي</span>
          </div>
        </aside>
      )}
      <div className="et-card">
        {!examFinished ? (
          <>
            <div className="et-topbar">
              <div className="et-topbar-stat">
                <span>✅</span>
                <span>أجبت: <strong>{answeredCount}</strong></span>
              </div>
              <div className="et-topbar-center">
                السؤال {currentQuestion + 1} من {questions.length}
              </div>
              <div className={`et-timer ${timeLeft <= 60 ? 'et-timer-critical' : ''}`}>
                <span>⏱</span>
                <span>{formatTime(timeLeft)}</span>
              </div>
            </div>

            <div className="et-progress-track">
              <div className="et-progress-fill" style={{ width: `${progress}%` }} />
            </div>

            <div className="et-question-area">
              <div className="et-question-meta">
                <span className="et-q-badge et-q-num">س {currentQuestion + 1}</span>
                <span className="et-q-badge et-q-pts">{currentQ.points || 1} درجات</span>
                <span className="et-q-badge et-q-rem">متبقي: {remainingCount}</span>
                {currentQ.isMultiple && (
                  <span className="et-q-badge et-q-rem">اختيارات متعددة</span>
                )}
              </div>
              <p className="et-question-text">{currentQ.question}</p>
            </div>

            <div className="et-options">
              {currentQ.options.map((opt, idx) => (
                <div
                  key={idx}
                  className={`et-option ${isSelected(currentQuestion, idx) ? 'et-option-selected' : ''}`}
                  onClick={() => toggleOption(currentQuestion, idx)}
                >
                  <span className="et-option-letter">{letters[idx] || String.fromCharCode(65 + idx)}</span>
                  <span className="et-option-text">{opt}</span>
                </div>
              ))}
            </div>

            <div className="et-footer">
              <button
                className="et-btn et-btn-prev"
                onClick={() => setCurrentQuestion(q => q - 1)}
                disabled={currentQuestion === 0}
              >
                ← السابق
              </button>
              {currentQuestion === questions.length - 1 ? (
                <button
                  className="et-btn et-btn-finish"
                  onClick={() => handleFinishExam(false)}
                  disabled={submitting}
                  title={unansweredIndices.length > 0 ? `متبقي ${unansweredIndices.length} سؤال` : ''}
                >
                  {submitting ? '⏳ جاري الإرسال...' : 'إنهاء الامتحان ✓'}
                </button>
              ) : (
                <button
                  className="et-btn et-btn-next"
                  onClick={() => setCurrentQuestion(q => q + 1)}
                >
                  التالي →
                </button>
              )}
            </div>
          </>
        ) : exam.reveal_grades === false ? (
          /* Admin hasn't released results yet — don't leak the score. */
          <div className="et-finished">
            <div className="et-finished-icon">🔒</div>
            <h2 className="et-finished-title">تم تسليم الامتحان بنجاح!</h2>
            <p className="et-finished-sub">
              إجاباتك تم حفظها. ستظهر درجتك عند إعلان المدرس النتائج في تقرير الامتحانات.
            </p>
            <div className="et-score-box">
              <div className="et-score-item">
                <span className="et-score-val">{answeredCount}/{questions.length}</span>
                <span className="et-score-lbl">أجبت</span>
              </div>
              <div className="et-score-divider" />
              <div className="et-score-item">
                <span className="et-score-val">—</span>
                <span className="et-score-lbl">النتيجة قيد المراجعة</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="et-finished">
            <div className="et-finished-icon">🎉</div>
            <h2 className="et-finished-title">تم إنهاء الامتحان بنجاح!</h2>
            <p className="et-finished-sub">شكراً لك على إكمال الاختبار</p>
            <div className="et-score-box">
              <div className="et-score-item">
                <span className="et-score-val">{finalScore ?? 0}</span>
                <span className="et-score-lbl">درجتك</span>
              </div>
              <div className="et-score-divider" />
              <div className="et-score-item">
                <span className="et-score-val">{exam.total_points}</span>
                <span className="et-score-lbl">من</span>
              </div>
              <div className="et-score-divider" />
              <div className="et-score-item">
                <span className="et-score-val">{answeredCount}/{questions.length}</span>
                <span className="et-score-lbl">أجبت</span>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>

      {unansweredAlert && (
        <div className="et-modal-backdrop" onClick={() => setUnansweredAlert(null)}>
          <div className="et-modal" onClick={(e) => e.stopPropagation()}>
            <div className="et-modal-icon">⚠️</div>
            <h3 className="et-modal-title">يجب الإجابة على جميع الأسئلة</h3>
            <p className="et-modal-sub">
              لم تُجب بعد على {unansweredAlert.length} سؤال. يجب إكمال جميع الأسئلة قبل إنهاء الامتحان.
            </p>
            <div className="et-modal-list">
              {unansweredAlert.map((idx) => (
                <button
                  key={idx}
                  className="et-modal-chip"
                  onClick={() => {
                    setCurrentQuestion(idx)
                    setUnansweredAlert(null)
                  }}
                >
                  السؤال {idx + 1}
                </button>
              ))}
            </div>
            <button className="et-btn et-btn-prev" onClick={() => setUnansweredAlert(null)}>
              العودة للإجابة
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
