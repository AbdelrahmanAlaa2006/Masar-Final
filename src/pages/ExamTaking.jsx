import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n'
import './ExamTaking.css'
import { getExam, startAttempt, submitAttempt } from '@backend/examsApi'

export default function ExamTaking() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { t, lang } = useI18n()
  const examId = params.get('id')

  const [exam, setExam] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [attemptId, setAttemptId] = useState(null)
  const [userId, setUserId] = useState(null)

  const [currentQuestion, setCurrentQuestion] = useState(0)
  // answers: { [qIdx]: Set<optIdx> } — works for both single and multi
  const [answers, setAnswers] = useState({})
  const [timeLeft, setTimeLeft] = useState(0)
  const [examFinished, setExamFinished] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [finalScore, setFinalScore] = useState(null)
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

    let cancelled = false
    const run = async () => {
      if (!examId) { setLoadError(t('examTaking.noExamSpecified')); return }
      try {
        const u = JSON.parse(localStorage.getItem('masar-user'))
        const sid = u?.id
        if (!sid) { setLoadError(t('examTaking.mustLogin')); return }
        setUserId(sid)

        const e = await getExam(examId)
        if (cancelled) return
        setExam(e)
        setTimeLeft((e.duration_minutes || 10) * 60)

        const att = await startAttempt({
          exam_id: e.id,
          student_id: sid,
          max_score: e.total_points,
        })
        if (!cancelled) setAttemptId(att.id)
      } catch (err) {
        if (!cancelled) setLoadError(err.message || t('examTaking.loadFailed'))
        // Allow a real retry if the load itself failed.
        startedRef.current = false
      }
    }
    run()
    return () => { cancelled = true }
  }, [examId])

  const questions = exam?.questions || []

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

  const handleFinishExam = async () => {
    if (submittedRef.current || submitting) return
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
    createConfetti()
  }

  const createConfetti = () => {
    const colors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#48bb78']
    for (let i = 0; i < 50; i++) {
      const el = document.createElement('div')
      el.style.cssText = `position:fixed;width:8px;height:8px;border-radius:50%;
        background:${colors[Math.floor(Math.random() * colors.length)]};
        left:${Math.random() * 100}vw;top:-10px;z-index:9999;
        animation:confettiFall ${Math.random() * 3 + 2}s ease-out forwards`
      document.body.appendChild(el)
      setTimeout(() => el.remove(), 5000)
    }
  }

  if (loadError) {
    return (
      <div className="et-wrapper">
        <div className="et-card" style={{ textAlign: 'center', padding: '40px' }}>
          <h2>{t('examTaking.error')}</h2>
          <p>{loadError}</p>
          <button className="et-btn et-btn-prev" onClick={() => navigate('/exams')}>
            {t('examTaking.backToExams')}
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
          <p>{t('examTaking.loading')}</p>
        </div>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="et-wrapper">
        <div className="et-card" style={{ textAlign: 'center', padding: '40px' }}>
          <h2>{t('examTaking.noQuestions')}</h2>
          <button className="et-btn et-btn-prev" onClick={() => navigate('/exams')}>{t('examTaking.back')}</button>
        </div>
      </div>
    )
  }

  const currentQ = questions[currentQuestion]
  const letters = lang === 'ar' ? ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح'] : ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
  const progress = ((currentQuestion + 1) / questions.length) * 100

  return (
    <div className="et-wrapper">
      {examFinished && (
        <div className="et-back-row">
          <button className="et-back-btn" onClick={() => navigate('/exams')}>
            {t('examTaking.backToExams')}
          </button>
        </div>
      )}
      <div className="et-card">
        {!examFinished ? (
          <>
            <div className="et-topbar">
              <div className="et-topbar-stat">
                <span>✅</span>
                <span>{t('examTaking.answered')} <strong>{answeredCount}</strong></span>
              </div>
              <div className="et-topbar-center">
                {t('examTaking.questionOf').replace('{current}', currentQuestion + 1).replace('{total}', questions.length)}
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
                <span className="et-q-badge et-q-pts">{currentQ.points || 1} {t('examTaking.points')}</span>
                <span className="et-q-badge et-q-rem">{t('examTaking.remaining')} {remainingCount}</span>
                {currentQ.isMultiple && (
                  <span className="et-q-badge et-q-rem">{t('examTaking.multipleChoice')}</span>
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

            <div className="et-navigator">
              {questions.map((_, idx) => (
                <button
                  key={idx}
                  className={`et-nav-dot
                    ${(answers[idx] && answers[idx].size > 0) ? 'et-dot-answered' : ''}
                    ${idx === currentQuestion ? 'et-dot-active' : ''}
                  `}
                  onClick={() => setCurrentQuestion(idx)}
                >
                  {idx + 1}
                </button>
              ))}
            </div>

            <div className="et-footer">
              <button
                className="et-btn et-btn-prev"
                onClick={() => setCurrentQuestion(q => q - 1)}
                disabled={currentQuestion === 0}
              >
                {t('examTaking.prevQuestion')}
              </button>
              {currentQuestion === questions.length - 1 ? (
                <button
                  className="et-btn et-btn-finish"
                  onClick={() => handleFinishExam(false)}
                  disabled={submitting}
                >
                  {submitting ? t('examTaking.submittingExam') : t('examTaking.finishExam')}
                </button>
              ) : (
                <button
                  className="et-btn et-btn-next"
                  onClick={() => setCurrentQuestion(q => q + 1)}
                >
                  {t('examTaking.nextQuestion')}
                </button>
              )}
            </div>
          </>
        ) : exam.reveal_grades === false ? (
          /* Admin hasn't released results yet — don't leak the score. */
          <div className="et-finished">
            <div className="et-finished-icon">🔒</div>
            <h2 className="et-finished-title">{t('examTaking.gradesHidden')}</h2>
            <p className="et-finished-sub">
              {t('examTaking.gradesHiddenSub')}
            </p>
            <div className="et-score-box">
              <div className="et-score-item">
                <span className="et-score-val">{answeredCount}/{questions.length}</span>
                <span className="et-score-lbl">{t('examTaking.answeredCount')}</span>
              </div>
              <div className="et-score-divider" />
              <div className="et-score-item">
                <span className="et-score-val">—</span>
                <span className="et-score-lbl">{t('examTaking.resultUnderReview')}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="et-finished">
            <div className="et-finished-icon">🎉</div>
            <h2 className="et-finished-title">{t('examTaking.examFinished')}</h2>
            <p className="et-finished-sub">{t('examTaking.thankYou')}</p>
            <div className="et-score-box">
              <div className="et-score-item">
                <span className="et-score-val">{finalScore ?? 0}</span>
                <span className="et-score-lbl">{t('examTaking.yourScore')}</span>
              </div>
              <div className="et-score-divider" />
              <div className="et-score-item">
                <span className="et-score-val">{exam.total_points}</span>
                <span className="et-score-lbl">{t('examTaking.outOf')}</span>
              </div>
              <div className="et-score-divider" />
              <div className="et-score-item">
                <span className="et-score-val">{answeredCount}/{questions.length}</span>
                <span className="et-score-lbl">{t('examTaking.answeredCount')}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
