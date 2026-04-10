import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import './ExamsReport.css'

export default function ExamsReport() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [studentName, setStudentName] = useState('')

  const examsData = [
    {
      id: 1,
      title: 'امتحان الرياضيات - الوحدة الأولى',
      icon: '📘',
      score: 85,
      maxScore: 100,
      status: 'completed',
      statusText: 'تم إنجاز الامتحان',
      attempts: 1,
      maxAttempts: 2,
      duration: '60 دقيقة',
      date: '15/5/2023'
    },
    {
      id: 2,
      title: 'امتحان العلوم - الفصل الأول',
      icon: '🔬',
      score: 72,
      maxScore: 100,
      status: 'completed',
      statusText: 'تم إنجاز الامتحان',
      attempts: 2,
      maxAttempts: 2,
      duration: '45 دقيقة',
      date: '20/5/2023'
    },
    {
      id: 3,
      title: 'امتحان الجبر المتقدم',
      icon: '📊',
      score: 0,
      maxScore: 100,
      status: 'pending',
      statusText: 'لم يتم البدء بعد',
      attempts: 0,
      maxAttempts: 2,
      duration: '90 دقيقة',
      date: 'قادم'
    },
    {
      id: 4,
      title: 'امتحان الهندسة',
      icon: '📏',
      score: 91,
      maxScore: 100,
      status: 'completed',
      statusText: 'تم إنجاز الامتحان بنجاح',
      attempts: 1,
      maxAttempts: 3,
      duration: '75 دقيقة',
      date: '18/5/2023'
    }
  ]

  useEffect(() => {
    const student = searchParams.get('student')
    if (student) {
      setStudentName(student)
    }

    // Create floating particles
    const createParticle = () => {
      const particle = document.createElement('div')
      particle.className = 'particle'
      particle.style.left = Math.random() * 100 + 'vw'
      particle.style.animationDelay = Math.random() * 15 + 's'
      particle.style.animationDuration = Math.random() * 10 + 10 + 's'
      document.body.appendChild(particle)

      setTimeout(() => {
        particle.remove()
      }, 25000)
    }

    // Generate particles periodically
    const particleInterval = setInterval(createParticle, 3000)

    // Initial particles
    for (let i = 0; i < 5; i++) {
      setTimeout(createParticle, i * 1000)
    }

    return () => clearInterval(particleInterval)
  }, [searchParams])

  const getScoreColor = (score) => {
    if (score >= 80) return '#48bb78'
    if (score >= 60) return '#ed8936'
    return '#f56565'
  }

  const getScoreStatus = (score) => {
    if (score >= 80) return 'ممتاز'
    if (score >= 60) return 'جيد'
    return 'يحتاج تحسين'
  }

  return (
    <main className="exams-report-page">
      <div className="main-container">
        <h1 className="page-title">
          📚 تقرير الامتحانات - <span className="student-name">{studentName || 'الطالب'}</span>
        </h1>

        <div className="exams-list">
          {examsData.map((exam) => (
            <div key={exam.id} className={`exam-card exam-${exam.status}`}>
              <div className="exam-header">
                <div className="exam-title">
                  <span className="exam-icon">{exam.icon}</span>
                  <div className="exam-info">
                    <h3>{exam.title}</h3>
                    <p className="exam-date">{exam.date}</p>
                  </div>
                </div>
                
                {exam.status !== 'pending' && (
                  <div className="exam-score">
                    <div className="score-circle" style={{
                      background: `conic-gradient(${getScoreColor(exam.score)} ${exam.score}%, #e2e8f0 0%)`
                    }}>
                      <div className="score-text">
                        <span className="score-number">{exam.score}</span>
                        <span className="score-max">من {exam.maxScore}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="exam-details">
                <div className="detail-item">
                  <span className="detail-label">المدة:</span>
                  <span className="detail-value">⏱️ {exam.duration}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">المحاولات:</span>
                  <span className="detail-value">📋 {exam.attempts}/{exam.maxAttempts}</span>
                </div>
                {exam.status !== 'pending' && (
                  <div className="detail-item">
                    <span className="detail-label">التقييم:</span>
                    <span className="detail-value" style={{ color: getScoreColor(exam.score) }}>
                      {getScoreStatus(exam.score)}
                    </span>
                  </div>
                )}
              </div>

              <div className={`exam-status status-${exam.status}`}>
                <span className="status-icon">
                  {exam.status === 'completed' && '✅'}
                  {exam.status === 'pending' && '⏳'}
                </span>
                {exam.statusText}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
