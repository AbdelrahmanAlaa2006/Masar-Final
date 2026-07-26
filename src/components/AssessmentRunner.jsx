import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './QuizRunner.css'
import './AssessmentRunner.css'
import {
  getAssessmentQuestions,
  startPreVideoAttempt,
  submitPreVideoAttempt,
  getPreVideoAttemptReview,
} from '@backend/videoAssessmentsApi'

/**
 * Pre-Video Assessment gate.
 *
 * Replaces the old QuizRunner, which computed `passed` in the browser from an
 * answer key it had been handed. Here:
 *   - questions arrive WITHOUT their answers (the RPC strips them),
 *   - the score is computed and withheld server-side,
 *   - while the student still has attempts left this component is told
 *     nothing but "attempt N of M" — no score, no percentage, no marking of
 *     right/wrong, no review. That is the whole point: a failed attempt must
 *     not teach the answers before the retry.
 *
 * Props:
 *   gate:     row from get_video_gate_status()
 *   onUnlock: () => void   — called once the server reports the gate unlocked
 *   onClose:  () => void
 */

const fmtClock = (secs) => {
  const s = Math.max(0, Math.floor(secs || 0))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function AssessmentRunner({ gate, onUnlock, onClose }) {
  const [phase, setPhase] = useState('loading') // loading | answering | submitting | done | error
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [attempt, setAttempt] = useState(null)   // { attempt_id, attempt_number, ... }
  const [result, setResult] = useState(null)
  const [review, setReview] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [timeLeft, setTimeLeft] = useState(null)

  const submitLock = useRef(false)
  const unlockedRef = useRef(false)

  const allowedAttempts = gate?.allowed_attempts ?? 0
  const unlimited = allowedAttempts === 0
  const passingScore = Number(gate?.passing_score ?? 0)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // ── Open (or resume) an attempt and load its questions ───────
  const beginAttempt = useCallback(async () => {
    setPhase('loading')
    setErrorMsg('')
    setAnswers({})
    setResult(null)
    setReview(null)
    try {
      // Order matters: start_pre_video_attempt is the call that re-validates
      // enrollment, tenancy, attempts left and unlock state. If it refuses we
      // must never have shown the questions.
      const started = await startPreVideoAttempt(gate.video_assessment_id)
      const qs = await getAssessmentQuestions(gate.video_assessment_id)
      setAttempt(started)
      setQuestions(qs)
      setTimeLeft(started.duration_minutes > 0 ? started.duration_minutes * 60 : null)
      setPhase('answering')
    } catch (err) {
      setErrorMsg(translateError(err))
      setPhase('error')
    }
  }, [gate?.video_assessment_id])

  useEffect(() => { beginAttempt() }, [beginAttempt])

  // ── Countdown (only when the assessment carries a duration) ──
  const doSubmit = useRef(null)
  useEffect(() => {
    if (phase !== 'answering' || timeLeft == null) return
    if (timeLeft <= 0) { doSubmit.current?.(true); return }
    const t = setTimeout(() => setTimeLeft(v => (v == null ? null : v - 1)), 1000)
    return () => clearTimeout(t)
  }, [timeLeft, phase])

  // Escape closes only while nothing is in flight and nothing is decided.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && phase === 'answering') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, phase])

  const totalPoints = useMemo(
    () => questions.reduce((s, q) => s + (q.points || 1), 0),
    [questions]
  )

  const toggleOption = (qIdx, optIdx, isMultiple) => {
    if (phase !== 'answering') return
    setAnswers(prev => {
      const cur = new Set(prev[qIdx] || [])
      if (isMultiple) {
        cur.has(optIdx) ? cur.delete(optIdx) : cur.add(optIdx)
      } else {
        cur.clear()
        cur.add(optIdx)
      }
      return { ...prev, [qIdx]: cur }
    })
  }

  const isOptionSelected = (qIdx, optIdx) => answers[qIdx]?.has(optIdx) || false

  const allAnswered = questions.length > 0 &&
    questions.every((_, i) => answers[i] && answers[i].size > 0)

  const submit = useCallback(async (auto = false) => {
    if (submitLock.current || !attempt?.attempt_id) return
    if (!auto && !allAnswered) return
    submitLock.current = true
    setPhase('submitting')
    try {
      const responses = questions.map((_, i) => ({
        questionId: i,
        selected: Array.from(answers[i] || []).sort((a, b) => a - b),
      }))
      const res = await submitPreVideoAttempt(attempt.attempt_id, responses)
      setResult(res)
      setPhase('done')

      // The review is only fetchable once the server agrees it may be shown.
      if (res?.reveal) {
        try {
          const rev = await getPreVideoAttemptReview(gate.video_assessment_id)
          setReview(rev)
        } catch { /* review is a bonus; never block the result on it */ }
      }

      if (res?.unlocked && !unlockedRef.current) {
        unlockedRef.current = true
        setTimeout(() => onUnlock?.(), 1600)
      }
    } catch (err) {
      setErrorMsg(translateError(err))
      setPhase('error')
    } finally {
      submitLock.current = false
    }
  }, [attempt, answers, questions, allAnswered, gate?.video_assessment_id, onUnlock])

  doSubmit.current = submit

  const retry = () => {
    submitLock.current = false
    beginAttempt()
  }

  // ── Header meta ──────────────────────────────────────────────
  const attemptNumber = attempt?.attempt_number ?? (gate?.attempts_used ?? 0) + 1
  const attemptsLabel = unlimited
    ? `المحاولة ${attemptNumber} — محاولات غير محدودة`
    : `المحاولة ${attemptNumber} من ${allowedAttempts}`

  // After a submit, how many are left according to the SERVER.
  const remainingAfter = result
    ? (unlimited ? Infinity : result.attempts_remaining)
    : (unlimited ? Infinity : (gate?.attempts_remaining ?? 0))

  const reveal = !!result?.reveal
  const passed = !!result?.passed
  const percent = result?.percent != null ? Number(result.percent) : null

  return (
    <div className="qr-overlay" onClick={phase === 'answering' ? onClose : undefined}>
      <div className="qr-modal" onClick={(e) => e.stopPropagation()} dir="rtl">
        <header className="qr-head">
          <div className="qr-head-info">
            <span className="qr-badge">
              <i className="fas fa-clipboard-check"></i> {gate?.type_label || 'تقييم'} مطلوب
            </span>
            <h2 className="qr-title">{gate?.title || 'تقييم قبل المشاهدة'}</h2>
            <div className="qr-meta">
              <span><i className="fas fa-list-ol"></i> {questions.length || gate?.questions_count || 0} سؤال</span>
              <span className="qr-dot">·</span>
              <span><i className="fas fa-bullseye"></i> النجاح: {passingScore}%</span>
              <span className="qr-dot">·</span>
              <span><i className="fas fa-repeat"></i> {attemptsLabel}</span>
              {timeLeft != null && phase === 'answering' && (
                <>
                  <span className="qr-dot">·</span>
                  <span className={timeLeft <= 60 ? 'ar-clock is-urgent' : 'ar-clock'}>
                    <i className="fas fa-stopwatch"></i> {fmtClock(timeLeft)}
                  </span>
                </>
              )}
            </div>
          </div>
          {phase === 'answering' && (
            <button className="qr-close" onClick={onClose} aria-label="إغلاق">
              <i className="fas fa-xmark"></i>
            </button>
          )}
        </header>

        <div className="qr-body">
          {phase === 'loading' && (
            <div className="ar-center">
              <i className="fas fa-spinner fa-spin"></i>
              <p>جاري تجهيز التقييم...</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="qr-result is-fail">
              <div className="qr-result-icon"><i className="fas fa-triangle-exclamation"></i></div>
              <div className="qr-result-text">
                <h3>تعذر المتابعة</h3>
                <p>{errorMsg}</p>
              </div>
            </div>
          )}

          {(phase === 'answering' || phase === 'submitting') && (
            <>
              <p className="qr-intro">
                يجب اجتياز هذا التقييم بنسبة {passingScore}% على الأقل قبل أن تتمكن من مشاهدة
                {gate?.part_id ? ' هذا الجزء' : ' هذا الفيديو'}.
                {!unlimited && ` لديك ${gate?.attempts_remaining ?? allowedAttempts} محاولة متبقية.`}
              </p>

              <ol className="qr-questions">
                {questions.map((q, qIdx) => (
                  <li key={qIdx} className="qr-q">
                    <div className="qr-q-head">
                      <span className="qr-q-num">{qIdx + 1}</span>
                      <span className="qr-q-text">{q.question}</span>
                      <span className="qr-q-points">{q.points || 1} نقطة</span>
                    </div>
                    {q.image && (
                      <div className="qr-q-image">
                        <img src={q.image} alt="صورة السؤال" />
                      </div>
                    )}
                    <div className="qr-options">
                      {(q.options || []).map((opt, oIdx) => (
                        <button
                          type="button"
                          key={oIdx}
                          className={`qr-opt ${isOptionSelected(qIdx, oIdx) ? 'is-selected' : ''}`}
                          onClick={() => toggleOption(qIdx, oIdx, q.isMultiple)}
                          disabled={phase !== 'answering'}
                        >
                          <span className="qr-opt-mark">
                            {q.isMultiple
                              ? <i className={`far ${isOptionSelected(qIdx, oIdx) ? 'fa-square-check' : 'fa-square'}`}></i>
                              : <i className={`far ${isOptionSelected(qIdx, oIdx) ? 'fa-circle-dot' : 'fa-circle'}`}></i>}
                          </span>
                          <span className="qr-opt-text">{opt}</span>
                        </button>
                      ))}
                    </div>
                    {q.isMultiple && (
                      <div className="qr-q-hint">
                        <i className="fas fa-circle-info"></i> اختر كل الإجابات الصحيحة
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}

          {/* ── Result ────────────────────────────────────────────
              While attempts remain and the student has not passed, the
              server sends back no score at all — so there is literally
              nothing here to reveal. */}
          {phase === 'done' && result && !reveal && (
            <div className="ar-withheld">
              <div className="ar-withheld-icon"><i className="fas fa-hourglass-half"></i></div>
              <h3>تم تسجيل {unlimited ? `المحاولة ${result.attempt_number}` : `المحاولة ${result.attempt_number} من ${result.allowed_attempts}`}</h3>
              <p>لم تحقق نسبة النجاح المطلوبة ({passingScore}%). حاول مرة أخرى.</p>
              <div className="ar-withheld-note">
                <i className="fas fa-lock"></i>
                <span>
                  ستظهر لك النتيجة والإجابات الصحيحة بعد اجتياز التقييم أو بعد انتهاء كل محاولاتك.
                </span>
              </div>
              {!unlimited && (
                <div className="ar-remaining">
                  <i className="fas fa-repeat"></i> المحاولات المتبقية: {result.attempts_remaining}
                </div>
              )}
            </div>
          )}

          {phase === 'done' && result && reveal && (
            <>
              <div className={`qr-result ${passed ? 'is-pass' : 'is-fail'}`}>
                <div className="qr-result-icon">
                  <i className={`fas ${passed ? 'fa-circle-check' : 'fa-circle-xmark'}`}></i>
                </div>
                <div className="qr-result-text">
                  <h3>{passed ? 'مبروك! لقد اجتزت التقييم' : 'انتهت محاولاتك'}</h3>
                  <p>
                    نتيجتك {result.score} من {result.max_score}
                    {percent != null && ` — ${percent}%`}
                    {' '}(المطلوب {passingScore}%)
                  </p>
                </div>
              </div>

              {review && (
                <>
                  <h4 className="ar-review-head">
                    <i className="fas fa-list-check"></i> مراجعة الإجابات
                  </h4>
                  <ol className="qr-questions">
                    {(review.questions || []).map((q, qIdx) => {
                      const correctSet = new Set(q.answers || [])
                      const picked = new Set(
                        (review.responses || []).find(r => r.questionId === qIdx)?.selected || []
                      )
                      return (
                        <li key={qIdx} className="qr-q">
                          <div className="qr-q-head">
                            <span className="qr-q-num">{qIdx + 1}</span>
                            <span className="qr-q-text">{q.question}</span>
                            <span className="qr-q-points">{q.points || 1} نقطة</span>
                          </div>
                          {q.image && (
                            <div className="qr-q-image">
                              <img src={q.image} alt="صورة السؤال" />
                            </div>
                          )}
                          <div className="qr-options">
                            {(q.options || []).map((opt, oIdx) => {
                              const isCorrect = correctSet.has(oIdx)
                              const wasPicked = picked.has(oIdx)
                              const cls = isCorrect ? 'is-correct' : (wasPicked ? 'is-wrong' : '')
                              return (
                                <button type="button" key={oIdx} className={`qr-opt ${cls}`} disabled>
                                  <span className="qr-opt-mark">
                                    <i className={`far ${wasPicked ? 'fa-circle-dot' : 'fa-circle'}`}></i>
                                  </span>
                                  <span className="qr-opt-text">{opt}</span>
                                  {isCorrect && <i className="fas fa-check qr-opt-flag"></i>}
                                  {!isCorrect && wasPicked && <i className="fas fa-xmark qr-opt-flag"></i>}
                                </button>
                              )
                            })}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </>
              )}
            </>
          )}
        </div>

        <footer className="qr-foot">
          {phase === 'error' && (
            <button className="qr-btn qr-btn-ghost" onClick={onClose}>إغلاق</button>
          )}

          {(phase === 'answering' || phase === 'submitting') && (
            <>
              <button className="qr-btn qr-btn-ghost" onClick={onClose} disabled={phase === 'submitting'}>
                إلغاء
              </button>
              <button
                className="qr-btn qr-btn-primary"
                onClick={() => submit(false)}
                disabled={!allAnswered || phase === 'submitting'}
              >
                <i className={`fas ${phase === 'submitting' ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
                {' '}{phase === 'submitting' ? 'جاري التصحيح...' : 'إرسال الإجابات'}
              </button>
            </>
          )}

          {phase === 'done' && result && !passed && remainingAfter > 0 && (
            <>
              <button className="qr-btn qr-btn-ghost" onClick={onClose}>إغلاق</button>
              <button className="qr-btn qr-btn-primary" onClick={retry}>
                <i className="fas fa-rotate-right"></i>{' '}
                إعادة المحاولة{unlimited ? '' : ` (${remainingAfter} متبقية)`}
              </button>
            </>
          )}

          {phase === 'done' && result && !passed && remainingAfter <= 0 && (
            <button className="qr-btn qr-btn-ghost" onClick={onClose}>إغلاق</button>
          )}

          {phase === 'done' && result && passed && (
            <button className="qr-btn qr-btn-success" disabled>
              <i className="fas fa-circle-check"></i> جاري فتح المحتوى...
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

/* The RPCs raise plain-text errors; map the ones a student can actually hit
   to Arabic so the modal never shows a Postgres string. */
function translateError(err) {
  const raw = String(err?.message || err || '')
  if (raw.includes('no attempts remaining'))  return 'لقد استنفدت جميع المحاولات المتاحة لهذا التقييم.'
  if (raw.includes('already unlocked'))       return 'لقد اجتزت هذا التقييم بالفعل — الفيديو متاح لك.'
  if (raw.includes('not enrolled'))           return 'هذا الفيديو غير متاح لصفك أو لباقتك.'
  if (raw.includes('assessment is disabled')) return 'تم إيقاف هذا التقييم مؤقتاً. تواصل مع المعلم.'
  if (raw.includes('assessment not found'))   return 'التقييم المرتبط بهذا الفيديو غير موجود. تواصل مع المعلم.'
  if (raw.includes('already submitted'))      return 'تم إرسال هذه المحاولة بالفعل.'
  if (raw.includes('review not available'))   return 'المراجعة غير متاحة بعد.'
  if (raw.includes('has no questions'))       return 'التقييم المرتبط بهذا الفيديو لا يحتوي على أسئلة. تواصل مع المعلم.'
  if (raw.includes('forbidden'))              return 'غير مصرح لك بهذا الإجراء.'
  return raw || 'حدث خطأ غير متوقع.'
}
