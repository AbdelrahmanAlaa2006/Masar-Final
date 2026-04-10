import { useState, useEffect } from 'react'
import './ExamTaking.css'

export default function ExamTaking() {
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [userAnswers, setUserAnswers] = useState(new Array(3).fill(null))
  const [timeLeft, setTimeLeft] = useState(600) // 10 minutes
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

  // Timer effect
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
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const answeredCount = userAnswers.filter(ans => ans !== null).length
  const remainingCount = questions.length - answeredCount

  const handleSelectOption = optionIndex => {
    const newAnswers = [...userAnswers]
    newAnswers[currentQuestion] = optionIndex
    setUserAnswers(newAnswers)
  }

  const handleNextQuestion = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1)
    }
  }

  const handlePrevQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1)
    }
  }

  const handleFinishExam = () => {
    setExamFinished(true)
    createConfetti()
  }

  const createConfetti = () => {
    const colors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#48bb78']
    for (let i = 0; i < 50; i++) {
      const confetti = document.createElement('div')
      confetti.style.position = 'fixed'
      confetti.style.width = '8px'
      confetti.style.height = '8px'
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)]
      confetti.style.borderRadius = '50%'
      confetti.style.left = Math.random() * 100 + 'vw'
      confetti.style.top = '-10px'
      confetti.style.zIndex = '9999'
      confetti.style.animation = `confettiFall ${Math.random() * 3 + 2}s ease-out forwards`
      document.body.appendChild(confetti)

      setTimeout(() => {
        confetti.remove()
      }, 5000)
    }
  }

  const currentQ = questions[currentQuestion]

  return (
    <div className="exam-taking">
      <div className="exam-container">
        {!examFinished ? (
          <>
            <div className="exam-header">
              <div className="counter">Answered: {answeredCount}</div>
              <div className="counter">Remaining: {remainingCount}</div>
              <div className={`timer ${timeLeft <= 60 ? 'critical' : ''}`}>
                Time left: {formatTime(timeLeft)}
              </div>
            </div>

            <div id="question-container">
              <h2>
                <span className="question-points">{currentQ.points} درجات</span>
                Q{currentQuestion + 1}: {currentQ.question}
              </h2>

              <div className="options">
                {currentQ.options.map((option, index) => (
                  <div
                    key={index}
                    className={`option ${userAnswers[currentQuestion] === index ? 'selected' : ''}`}
                    onClick={() => handleSelectOption(index)}
                  >
                    {option}
                  </div>
                ))}
              </div>
            </div>

            <div className="navigation">
              <button onClick={handlePrevQuestion} disabled={currentQuestion === 0}>
                ⬅️ السابق
              </button>
              {currentQuestion === questions.length - 1 ? (
                <button className="finish-btn" onClick={handleFinishExam}>
                  ✅ إنهاء الامتحان
                </button>
              ) : (
                <button onClick={handleNextQuestion}>التالي ➡️</button>
              )}
            </div>

            <div className="question-slides">
              {questions.map((_, index) => (
                <div
                  key={index}
                  className={`question-slide ${userAnswers[index] !== null ? 'answered' : ''} ${
                    index === currentQuestion ? 'active' : ''
                  }`}
                  onClick={() => setCurrentQuestion(index)}
                >
                  {index + 1}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="exam-finished">
            <div className="success-message">🎉 تم إنهاء الامتحان بنجاح!</div>
            <p>شكراً لك على إكمال الاختبار</p>
          </div>
        )}
      </div>
    </div>
  )
}
