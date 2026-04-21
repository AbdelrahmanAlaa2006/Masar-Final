import React, { useEffect, useMemo, useState } from 'react'
import './QuizRunner.css'
import { recordQuizAttempt } from '../services/progressApi'

/**
 * Quiz gate modal. Runs a quiz inline; calls onPass when the student meets
 * the passing threshold. Persists progress in Supabase `quiz_attempts`.
 *
 * Props:
 *   quiz: { localId, title, scope, partIndex, passingQuestions, maxAttempts, questions }
 *   videoId: string (UUID)
 *   studentId: string (UUID, profiles.id)
 *   priorAttempt: { passed, attempts, best_correct } | undefined
 *   onPass: (row) => void
 *   onClose: () => void
 */
export default function QuizRunner({ quiz, videoId, studentId, priorAttempt, onPass, onClose }) {
  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !submitted) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, submitted])

  const totalPoints = useMemo(
    () => quiz.questions.reduce((s, q) => s + (q.points || 1), 0),
    [quiz.questions]
  )
  const totalQuestions = quiz.questions.length
  const passingQuestions = quiz.passingQuestions ?? totalQuestions
  const maxAttempts = quiz.maxAttempts || 1

  const priorAttempts = priorAttempt?.attempts || 0
  const attemptNumber = priorAttempts + 1
  const outOfAttempts = priorAttempts >= maxAttempts && !priorAttempt?.passed

  const toggleOption = (qIdx, optIdx, isMultiple) => {
    if (submitted) return
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

  const isOptionSelected = (qIdx, optIdx) =>
    (answers[qIdx] && answers[qIdx].has(optIdx)) || false

  const submit = async () => {
    if (saving) return
    let earned = 0
    let correctCount = 0
    quiz.questions.forEach((q, qIdx) => {
      const picked = Array.from(answers[qIdx] || []).sort()
      const correct = [...q.answers].sort()
      const allMatch =
        picked.length === correct.length &&
        picked.every((v, i) => v === correct[i])
      if (allMatch) {
        earned += (q.points || 1)
        correctCount += 1
      }
    })

    const passed = correctCount >= passingQuestions
    const attempts = priorAttempts + 1
    const best_correct = Math.max(priorAttempt?.best_correct || 0, correctCount)
    const nextPassed = passed || priorAttempt?.passed === true

    setSaving(true)
    setSaveError(null)
    try {
      await recordQuizAttempt({
        student_id: studentId,
        video_id: videoId,
        quiz_local_id: quiz.localId,
        passed: nextPassed,
        best_correct,
        attempts,
      })
    } catch (err) {
      setSaveError(err.message || 'تعذر حفظ النتيجة')
      setSaving(false)
      return
    }
    setSaving(false)

    const exhausted = !nextPassed && attempts >= maxAttempts
    setResult({
      score: earned,
      total: totalPoints,
      correctCount,
      totalQuestions,
      passed: nextPassed,
      exhausted,
      attemptsUsed: attempts,
    })
    setSubmitted(true)

    if (nextPassed) {
      setTimeout(() => onPass({ passed: true, best_correct, attempts }), 1400)
    }
  }

  const retry = () => {
    setAnswers({})
    setSubmitted(false)
    setResult(null)
    setSaveError(null)
  }

  const allAnswered = quiz.questions.every(
    (_, i) => answers[i] && answers[i].size > 0
  )

  return (
    <div className="qr-overlay" onClick={onClose}>
      <div className="qr-modal" onClick={(e) => e.stopPropagation()} dir="rtl">
        <header className="qr-head">
          <div className="qr-head-info">
            <span className="qr-badge">
              <i className="fas fa-graduation-cap"></i> امتحان مطلوب
            </span>
            <h2 className="qr-title">{quiz.title || 'امتحان قبل المشاهدة'}</h2>
            <div className="qr-meta">
              <span><i className="fas fa-list-ol"></i> {quiz.questions.length} سؤال</span>
              <span className="qr-dot">·</span>
              <span><i className="fas fa-star"></i> {totalPoints} نقطة</span>
              <span className="qr-dot">·</span>
              <span><i className="fas fa-bullseye"></i> النجاح: {passingQuestions} من {totalQuestions}</span>
              <span className="qr-dot">·</span>
              <span>
                <i className="fas fa-repeat"></i>{' '}
                {submitted
                  ? `المحاولات: ${result?.attemptsUsed ?? priorAttempts} من ${maxAttempts}`
                  : `المحاولة ${attemptNumber} من ${maxAttempts}`}
              </span>
            </div>
          </div>
          {!submitted && (
            <button className="qr-close" onClick={onClose} aria-label="إغلاق">
              <i className="fas fa-xmark"></i>
            </button>
          )}
        </header>

        <div className="qr-body">
          {!submitted && (
            <p className="qr-intro">
              يجب اجتياز هذا الامتحان قبل أن تتمكن من مشاهدة هذا{' '}
              {quiz.scope === 'whole' ? 'الفيديو' : 'الجزء'}.
            </p>
          )}

          {saveError && (
            <div className="qr-result is-fail">
              <div className="qr-result-icon"><i className="fas fa-triangle-exclamation"></i></div>
              <div className="qr-result-text">
                <h3>خطأ</h3>
                <p>{saveError}</p>
              </div>
            </div>
          )}

          {submitted && result && (
            <div className={`qr-result ${result.passed ? 'is-pass' : 'is-fail'}`}>
              <div className="qr-result-icon">
                <i className={`fas ${result.passed ? 'fa-circle-check' : 'fa-circle-xmark'}`}></i>
              </div>
              <div className="qr-result-text">
                <h3>
                  {result.passed
                    ? 'مبروك! نجحت'
                    : result.exhausted
                      ? 'انتهت محاولاتك'
                      : 'لم تنجح هذه المحاولة'}
                </h3>
                <p>
                  أجبت إجابة صحيحة على {result.correctCount} من {result.totalQuestions} سؤال
                  {' — '}
                  المطلوب {passingQuestions} من {result.totalQuestions}
                  {result.exhausted && ' — استخدمت جميع محاولاتك'}
                </p>
              </div>
            </div>
          )}

          <ol className="qr-questions">
            {quiz.questions.map((q, qIdx) => {
              const correctSet = new Set(q.answers)
              return (
                <li key={qIdx} className="qr-q">
                  <div className="qr-q-head">
                    <span className="qr-q-num">{qIdx + 1}</span>
                    <span className="qr-q-text">{q.question}</span>
                    <span className="qr-q-points">{q.points} نقطة</span>
                  </div>
                  <div className="qr-options">
                    {q.options.map((opt, oIdx) => {
                      const selected = isOptionSelected(qIdx, oIdx)
                      const isCorrect = correctSet.has(oIdx)
                      let stateClass = ''
                      if (submitted) {
                        if (isCorrect) stateClass = 'is-correct'
                        else if (selected) stateClass = 'is-wrong'
                      } else if (selected) stateClass = 'is-selected'
                      return (
                        <button
                          type="button"
                          key={oIdx}
                          className={`qr-opt ${stateClass}`}
                          onClick={() => toggleOption(qIdx, oIdx, q.isMultiple)}
                          disabled={submitted}
                        >
                          <span className="qr-opt-mark">
                            {q.isMultiple ? (
                              <i className={`far ${selected ? 'fa-square-check' : 'fa-square'}`}></i>
                            ) : (
                              <i className={`far ${selected ? 'fa-circle-dot' : 'fa-circle'}`}></i>
                            )}
                          </span>
                          <span className="qr-opt-text">{opt}</span>
                          {submitted && isCorrect && (
                            <i className="fas fa-check qr-opt-flag"></i>
                          )}
                          {submitted && !isCorrect && selected && (
                            <i className="fas fa-xmark qr-opt-flag"></i>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {q.isMultiple && !submitted && (
                    <div className="qr-q-hint">
                      <i className="fas fa-circle-info"></i> اختر كل الإجابات الصحيحة
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </div>

        <footer className="qr-foot">
          {!submitted && (
            <>
              <button className="qr-btn qr-btn-ghost" onClick={onClose}>إلغاء</button>
              <button
                className="qr-btn qr-btn-primary"
                onClick={submit}
                disabled={!allAnswered || saving || outOfAttempts}
              >
                <i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
                {' '}{saving ? 'جاري الحفظ...' : 'إرسال الإجابات'}
              </button>
            </>
          )}
          {submitted && !result.passed && !result.exhausted && (
            <>
              <button className="qr-btn qr-btn-ghost" onClick={onClose}>إغلاق</button>
              <button className="qr-btn qr-btn-primary" onClick={retry}>
                <i className="fas fa-rotate-right"></i> إعادة المحاولة ({maxAttempts - result.attemptsUsed} متبقية)
              </button>
            </>
          )}
          {submitted && !result.passed && result.exhausted && (
            <button className="qr-btn qr-btn-ghost" onClick={onClose}>إغلاق</button>
          )}
          {submitted && result.passed && (
            <button className="qr-btn qr-btn-success" disabled>
              <i className="fas fa-circle-check"></i> جاري فتح المحتوى...
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
