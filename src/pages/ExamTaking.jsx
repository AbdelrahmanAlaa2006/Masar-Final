import { useState, useEffect } from 'react'
import './ExamTaking.css'

export default function ExamTaking() {
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [userAnswers, setUserAnswers] = useState(new Array(3).fill(null))
  const [timeLeft, setTimeLeft] = useState(600)
  const [examFinished, setExamFinished] = useState(false)

  const questions = [
    {
      question: 'What is the determinant of a 2x2 matrix [[a, b], [c, d]]?',
      options: ['ad - bc', 'ab + cd', 'a + d', 'ac - bd'],
      answer: 0,
      points: 2,
    },
    {
      question: 'Which of these is a property of matrix multiplication?',
      options: ['Commutative', 'Associative', 'Divisible', 'Differentiable'],
      answer: 1,
      points: 3,
    },
    {
      question: 'What does it mean if a matrix has a zero determinant?',
      options: ['It is invertible', 'It is singular', 'It is orthogonal', 'It is diagonal'],
      answer: 1,
      points: 5,
    },
  ]

  useEffect(() => {
    if (examFinished) return
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setExamFinished(true)
          createConfetti()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [examFinished])

  const formatTime = seconds => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const answeredCount = userAnswers.filter(a => a !== null).length
  const remainingCount = questions.length - answeredCount

  const handleSelectOption = idx => {
    const next = [...userAnswers]
    next[currentQuestion] = idx
    setUserAnswers(next)
  }

  const handleFinishExam = () => {
    setExamFinished(true)
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

  const currentQ = questions[currentQuestion]
  const letters = ['أ', 'ب', 'ج', 'د']
  const progress = ((currentQuestion + 1) / questions.length) * 100

  return (
    <div className="et-wrapper">
      <div className="et-card">

        {!examFinished ? (
          <>
            {/* ── Top Bar ── */}
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

            {/* ── Progress Bar ── */}
            <div className="et-progress-track">
              <div className="et-progress-fill" style={{ width: `${progress}%` }} />
            </div>

            {/* ── Question ── */}
            <div className="et-question-area">
              <div className="et-question-meta">
                <span className="et-q-badge et-q-num">س {currentQuestion + 1}</span>
                <span className="et-q-badge et-q-pts">{currentQ.points} درجات</span>
                <span className="et-q-badge et-q-rem">متبقي: {remainingCount}</span>
              </div>
              <p className="et-question-text">{currentQ.question}</p>
            </div>

            {/* ── Options ── */}
            <div className="et-options">
              {currentQ.options.map((opt, idx) => (
                <div
                  key={idx}
                  className={`et-option ${userAnswers[currentQuestion] === idx ? 'et-option-selected' : ''}`}
                  onClick={() => handleSelectOption(idx)}
                >
                  <span className="et-option-letter">{letters[idx]}</span>
                  <span className="et-option-text">{opt}</span>
                </div>
              ))}
            </div>

            {/* ── Question Navigator ── */}
            <div className="et-navigator">
              {questions.map((_, idx) => (
                <button
                  key={idx}
                  className={`et-nav-dot
                    ${userAnswers[idx] !== null ? 'et-dot-answered' : ''}
                    ${idx === currentQuestion ? 'et-dot-active' : ''}
                  `}
                  onClick={() => setCurrentQuestion(idx)}
                >
                  {idx + 1}
                </button>
              ))}
            </div>

            {/* ── Footer Navigation ── */}
            <div className="et-footer">
              <button
                className="et-btn et-btn-prev"
                onClick={() => setCurrentQuestion(q => q - 1)}
                disabled={currentQuestion === 0}
              >
                ← السابق
              </button>

              {currentQuestion === questions.length - 1 ? (
                <button className="et-btn et-btn-finish" onClick={handleFinishExam}>
                  إنهاء الامتحان ✓
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
        ) : (
          /* ── Finished Screen ── */
          <div className="et-finished">
            <div className="et-finished-icon">🎉</div>
            <h2 className="et-finished-title">تم إنهاء الامتحان بنجاح!</h2>
            <p className="et-finished-sub">شكراً لك على إكمال الاختبار</p>
            <div className="et-score-box">
              <div className="et-score-item">
                <span className="et-score-val">{answeredCount}</span>
                <span className="et-score-lbl">أجبت</span>
              </div>
              <div className="et-score-divider" />
              <div className="et-score-item">
                <span className="et-score-val">{questions.length}</span>
                <span className="et-score-lbl">إجمالي الأسئلة</span>
              </div>
              <div className="et-score-divider" />
              <div className="et-score-item">
                <span className="et-score-val">{remainingCount}</span>
                <span className="et-score-lbl">لم يُجب عنها</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
