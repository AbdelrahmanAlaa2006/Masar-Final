import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './Report.css'

export default function Report() {
  const navigate = useNavigate()
  const [studentInput, setStudentInput] = useState('')
  const [selectedStudent, setSelectedStudent] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filteredNames, setFilteredNames] = useState([])

  const studentNames = ['محمد أحمد', 'محمود عبد الله', 'منى حسين', 'محمد حسين']

  useEffect(() => {
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
  }, [])

  const filterNames = (value) => {
    setStudentInput(value)
    setSelectedStudent('')

    if (value.trim().length === 0) {
      setShowSuggestions(false)
      setFilteredNames([])
      return
    }

    const filtered = studentNames.filter(name => name.includes(value))
    setFilteredNames(filtered)
    setShowSuggestions(filtered.length > 0)
  }

  const selectStudent = (name) => {
    setSelectedStudent(name)
    setStudentInput(name)
    setShowSuggestions(false)
  }

  const searchStudent = () => {
    const input = studentInput.trim()
    if (input) {
      setSelectedStudent(input)
      alert('تم اختيار الطالب: ' + input)
    } else {
      alert('من فضلك أدخل اسم الطالب أولاً.')
    }
  }

  const goTo = (type) => {
    const student = selectedStudent || studentInput.trim()
    if (!student) {
      alert('من فضلك اختر اسم الطالب أولاً.')
      return
    }
    if (type === 'videos') {
      navigate(`/videos-report?student=${encodeURIComponent(student)}`)
    } else if (type === 'exams') {
      navigate(`/exams-report?student=${encodeURIComponent(student)}`)
    }
  }

  const goToGroupReport = (type) => {
    if (type === 'videos') {
      navigate('/videos-group-report')
    } else if (type === 'exams') {
      navigate('/exams-group-report')
    }
  }

  return (
    <main className="report-page">
      <div className="main-container">
        <h1 className="page-title">تقرير الطالب</h1>

        <div className="search-container">
          <input
            type="text"
            placeholder="ابحث باسم الطالب..."
            value={studentInput}
            onChange={(e) => filterNames(e.target.value)}
            className="search-input"
          />
          <button onClick={searchStudent} className="search-btn">
            🔍 بحث
          </button>
          {showSuggestions && (
            <ul className="suggestions">
              {filteredNames.map((name, index) => (
                <li key={index} onClick={() => selectStudent(name)}>
                  {name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="action-cards">
          <div
            className="action-card"
            onClick={() => goTo('videos')}
          >
            <div className="card-icon">🎬</div>
            <h2 className="card-title">الفيديوهات التعليمية</h2>
            <p className="card-description">
              عرض حالة المشاهدة وتتبع تقدم الطالب في جميع الفيديوهات التعليمية المتاحة
            </p>
          </div>

          <div
            className="action-card"
            onClick={() => goTo('exams')}
          >
            <div className="card-icon">📚</div>
            <h2 className="card-title">الامتحانات والاختبارات</h2>
            <p className="card-description">
              مراجعة النتائج وحالة الحل لجميع الامتحانات والاختبارات التي تم إجراؤها
            </p>
          </div>
        </div>

        {/* قسم التقرير الجماعي الجديد */}
        <div className="group-report-section">
          <h2 className="group-report-title">التقرير الجماعي</h2>

          <div className="group-report-cards">
            <div
              className="action-card"
              onClick={() => goToGroupReport('videos')}
            >
              <div className="card-icon">
                <i className="fas fa-chart-line"></i>
              </div>
              <h2 className="card-title">تقرير جماعي للفيديوهات</h2>
              <p className="card-description">
                عرض إحصائيات المشاهدة وتقرير الأداء لجميع الطلاب
              </p>
            </div>

            <div
              className="action-card"
              onClick={() => goToGroupReport('exams')}
            >
              <div className="card-icon">
                <i className="fas fa-chart-pie"></i>
              </div>
              <h2 className="card-title">تقرير جماعي للامتحانات</h2>
              <p className="card-description">
                عرض نتائج الامتحانات وتحليل الأداء لجميع الطلاب
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
