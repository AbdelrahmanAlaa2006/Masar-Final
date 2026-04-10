import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import './VideosReport.css'

export default function VideosReport() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [studentName, setStudentName] = useState('')

  const videosData = [
    {
      id: 1,
      title: 'مقدمة في البرمجة',
      icon: '🎬',
      status: 'completed',
      statusText: 'تم مشاهدة الفيديو بالكامل',
      progress: 100
    },
    {
      id: 2,
      title: 'الدرس الثاني: المتغيرات',
      icon: '📚',
      status: 'partial',
      statusText: 'لم يتم مشاهدة نصف الفيديو بعد',
      progress: 50
    },
    {
      id: 3,
      title: 'الدرس الثالث: الدوال والطرق',
      icon: '🔧',
      status: 'completed',
      statusText: 'تم مشاهدة الفيديو بالكامل',
      progress: 100
    },
    {
      id: 4,
      title: 'الدرس الرابع: التطبيق العملي',
      icon: '🎯',
      status: 'partial',
      statusText: 'تم مشاهدة 75% من الفيديو',
      progress: 75
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

  const goHome = () => {
    if (studentName) {
      navigate(`/?student=${encodeURIComponent(studentName)}`)
    } else {
      navigate('/')
    }
  }

  return (
    <main className="videos-report-page">
      <div className="main-container">
        <h1 className="page-title">
          📺 تقرير الفيديوهات - <span className="student-name">{studentName || 'الطالب'}</span>
        </h1>

        <div className="videos-list">
          {videosData.map((video) => (
            <div key={video.id} className="video-card">
              <div className="video-title">
                <span className="video-icon">{video.icon}</span>
                {video.title}
              </div>
              <div className={`video-status status-${video.status}`}>
                <span className="status-icon">{video.status === 'completed' ? '✅' : '⚠️'}</span>
                {video.statusText}
              </div>
              <div className="progress-bar">
                <div
                  className={`progress-fill progress-${video.status}`}
                  style={{ width: `${video.progress}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
