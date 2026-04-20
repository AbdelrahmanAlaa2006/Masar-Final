import React, { useEffect, useMemo, useState } from 'react'
import './QuizRunner.css'

/**
 * Quiz gate modal. Runs a quiz inline; calls onPass when the student
 * meets the passing percentage. Stores the result in localStorage
 * under `quiz-results-{videoId}-{quizId}`.
 *
 * Props:
 *   quiz: { localId, title, scope, partIndex, passingPercentage, questions }
 *   videoId: string
 *   onPass: (result) => void
 *   onClose: () => void
 */
export default function QuizRunner({ quiz, videoId, onPass, onClose }) {
  // Map of questionIndex -> Set(optionIndex) — supports multi-answer
  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState(null) // { score, total, percentage, passed }

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

  const submit = () => {
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

    const storageKey = `quiz-results-${videoId}-${quiz.localId}`
    const prev = JSON.parse(localStorage.getItem(storageKey) || '{}')
    const next = {
      passed: passed || prev.passed === true,
      lastScore: earned,
      lastCorrect: correctCount,
      bestCorrect: Math.max(prev.bestCorrect || 0, correctCount),
      attempts: (prev.attempts || 0) + 1,
      lastAttemptAt: new Date().toISOString()
    }
    localStorage.setItem(storageKey, JSON.stringify(next))

    setResult({ score: earned, total: totalPoints, correctCount, totalQuestions, passed })
    setSubmitted(true)

    if (passed) {
      // Give the user a moment to see the success state, then unlock.
      setTimeout(() => onPass(next), 1400)
    }
  }

  const retry = () => {
    setAnswers({})
    setSubmitted(false)
    setResult(null)
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

          {submitted && result && (
            <div className={`qr-result ${result.passed ? 'is-pass' : 'is-fail'}`}>
              <div className="qr-result-icon">
                <i className={`fas ${result.passed ? 'fa-circle-check' : 'fa-circle-xmark'}`}></i>
              </div>
              <div className="qr-result-text">
                <h3>{result.passed ? 'مبروك! نجحت' : 'لم تنجح هذه المحاولة'}</h3>
                <p>
                  أجبت إجابة صحيحة على {result.correctCount} من {result.totalQuestions} سؤال
                  {' — '}
                  المطلوب {passingQuestions} من {result.totalQuestions}
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
              <button className="qr-btn qr-btn-ghost" onClick={onClose}>
                إلغاء
              </button>
              <button
                className="qr-btn qr-btn-primary"
                onClick={submit}
                disabled={!allAnswered}
              >
                <i className="fas fa-paper-plane"></i> إرسال الإجابات
              </button>
            </>
          )}
          {submitted && !result.passed && (
            <>
              <button className="qr-btn qr-btn-ghost" onClick={onClose}>
                إغلاق
              </button>
              <button className="qr-btn qr-btn-primary" onClick={retry}>
                <i className="fas fa-rotate-right"></i> إعادة المحاولة
              </button>
            </>
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
