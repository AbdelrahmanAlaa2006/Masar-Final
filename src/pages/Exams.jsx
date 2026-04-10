import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './Exams.css'

export default function Exams() {
  const navigate = useNavigate()
  const [currentLevel, setCurrentLevel] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [userRole, setUserRole] = useState(null)

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('masar-user'))
      setUserRole(user?.role || null)
    } catch {
      setUserRole(null)
    }
  }, [])
  const [examData] = useState({
    first: [
      {
        id: 'exam1_first',
        title: "امتحان الرياضيات - الوحدة الأولى",
        lecture: "الأعداد الطبيعية والصحيحة",
        icon: "📘",
        duration: 60,
        availableHours: 72,
        maxAttempts: 2,
        questions: 15,
        createdAt: "2023-05-15T10:00:00"
      },
      {
        id: 'exam2_first',
        title: "امتحان العلوم - الفصل الأول",
        lecture: "المادة وخواصها",
        icon: "🔬",
        duration: 45,
        availableHours: 48,
        maxAttempts: 1,
        questions: 10,
        createdAt: "2023-05-20T14:30:00"
      }
    ],
    second: [
      {
        id: 'exam1_second',
        title: "امتحان الجبر",
        lecture: "المعادلات والمتباينات",
        icon: "📐",
        duration: 90,
        availableHours: 96,
        maxAttempts: 3,
        questions: 20,
        createdAt: "2023-05-10T09:15:00"
      },
      {
        id: 'exam2_second',
        title: "امتحان الهندسة",
        lecture: "الدائرة والمثلث",
        icon: "📏",
        duration: 75,
        availableHours: 72,
        maxAttempts: 2,
        questions: 18,
        createdAt: "2023-05-18T11:45:00"
      },
      {
        id: 'exam3_second',
        title: "امتحان العلوم المتقدم",
        lecture: "التفاعلات الكيميائية",
        icon: "🧪",
        duration: 60,
        availableHours: 48,
        maxAttempts: 1,
        questions: 15,
        createdAt: "2023-05-22T16:20:00"
      }
    ],
    third: [
      {
        id: 'exam1_third',
        title: "امتحان الجبر المتقدم",
        lecture: "الإحصاء والاحتمالات",
        icon: "📊",
        duration: 120,
        availableHours: 120,
        maxAttempts: 2,
        questions: 25,
        createdAt: "2023-05-05T08:00:00"
      },
      {
        id: 'exam2_third',
        title: "امتحان الهندسة التحليلية",
        lecture: "الإحداثيات والرسم البياني",
        icon: "📈",
        duration: 90,
        availableHours: 96,
        maxAttempts: 2,
        questions: 20,
        createdAt: "2023-05-12T13:30:00"
      },
      {
        id: 'exam3_third',
        title: "امتحان الفيزياء",
        lecture: "الكهرباء والمغناطيسية",
        icon: "⚡",
        duration: 75,
        availableHours: 72,
        maxAttempts: 1,
        questions: 18,
        createdAt: "2023-05-17T10:15:00"
      },
      {
        id: 'exam4_third',
        title: "امتحان الكيمياء",
        lecture: "التركيب الذري والجزيئي",
        icon: "🧬",
        duration: 60,
        availableHours: 48,
        maxAttempts: 1,
        questions: 15,
        createdAt: "2023-05-25T15:45:00"
      }
    ]
  })

  useEffect(() => {
    // Ensure we have a user ID
    if (!localStorage.getItem('currentUserId')) {
      localStorage.setItem('currentUserId', 'user_' + Math.random().toString(36).substr(2, 9))
    }
    loadRemainingAttempts()
  }, [])

  const getCurrentUserId = () => {
    return localStorage.getItem('currentUserId') || 'user_' + Math.random().toString(36).substr(2, 9)
  }

  const loadRemainingAttempts = () => {
    const userId = getCurrentUserId()
    Object.keys(examData).forEach(level => {
      examData[level].forEach(exam => {
        const attemptsKey = `attempts_${userId}_${exam.id}`
        if (localStorage.getItem(attemptsKey) === null) {
          localStorage.setItem(attemptsKey, exam.maxAttempts)
        }
      })
    })
  }

  const getRemainingAttempts = (examId) => {
    const userId = getCurrentUserId()
    const attemptsKey = `attempts_${userId}_${examId}`
    const savedAttempts = localStorage.getItem(attemptsKey)
    return savedAttempts !== null ? parseInt(savedAttempts) : 0
  }

  const decreaseRemainingAttempts = (examId) => {
    const userId = getCurrentUserId()
    const attemptsKey = `attempts_${userId}_${examId}`
    const currentAttempts = getRemainingAttempts(examId)
    if (currentAttempts > 0) {
      localStorage.setItem(attemptsKey, currentAttempts - 1)
    }
  }

  const showLevels = () => {
    setCurrentLevel(null)
  }

  const showExams = (level) => {
    setCurrentLevel(level)
  }

  const startExam = (examId) => {
    const remainingAttempts = getRemainingAttempts(examId)
    
    if (remainingAttempts <= 0) {
      setShowModal(true)
      return
    }
    
    decreaseRemainingAttempts(examId)
    navigate('/exam-taking')
  }

  const addExam = (level) => {
    localStorage.setItem('selectedGrade', level)
    navigate('/exam-add')
  }

  const levelTitles = {
    first: 'امتحانات الصف الأول الإعدادي',
    second: 'امتحانات الصف الثاني الإعدادي',
    third: 'امتحانات الصف الثالث الإعدادي'
  }

  const levelEmojis = {
    first: '1️⃣',
    second: '2️⃣',
    third: '3️⃣'
  }

  const renderLevelCard = (level) => (
    <div key={level} className="level-card" onClick={() => showExams(level)}>
      <div className="level-icon">{levelEmojis[level]}</div>
      <div className="level-title">{levelTitles[level]}</div>
      <div className="level-subtitle">{level === 'first' ? 'First Prep' : level === 'second' ? 'Second Prep' : 'Third Prep'}</div>
      <div className="exam-count">
        <span>📚</span>
        <span>{examData[level].length}</span> امتحان متاح
      </div>
    </div>
  )

  const renderExamItem = (exam, index, level) => {
    const remainingAttempts = getRemainingAttempts(exam.id)
    const createdAt = new Date(exam.createdAt)
    const availableUntil = new Date(createdAt.getTime() + (exam.availableHours * 60 * 60 * 1000))
    const formattedDate = availableUntil.toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    return (
      <div key={exam.id} className="exam-item" style={{ animationDelay: `${(index + 1) * 0.1}s` }} onClick={() => startExam(exam.id)}>
        <div className="exam-title">
          <div className="exam-number">{index + 1}</div>
          <span>{exam.title}</span>
        </div>
        <div className="exam-lecture">
          {exam.icon} {exam.lecture}
        </div>
        <div className="exam-details">
          <div className="exam-detail">
            <span>⏱️</span>
            <span>{exam.duration} دقيقة</span>
          </div>
          <div className="exam-detail">
            <span>🕒</span>
            <span>متاح لمدة {exam.availableHours} ساعة</span>
          </div>
          <div className="exam-detail">
            <span>🔁</span>
            <span>{remainingAttempts}/{exam.maxAttempts} محاولة</span>
          </div>
          <div className="exam-detail">
            <span>❓</span>
            <span>{exam.questions} سؤال</span>
          </div>
        </div>
        <div className="exam-detail" style={{ marginTop: '12px', background: 'rgba(255, 193, 7, 0.1)', color: 'var(--text-color)' }}>
          <span>⏳</span>
          <span>متاح حتى {formattedDate}</span>
        </div>
      </div>
    )
  }

  const renderExamSection = (level) => (
    <div key={level} className={`exam-section ${currentLevel === level ? 'active' : ''}`}>
      <button className="back-button" onClick={() => showLevels()}>
        ← العودة للمستويات
      </button>
      <div className="section-header">
        <div className="section-title">
          <span>{levelEmojis[level]}</span>
          {levelTitles[level]}
        </div>
        {userRole === 'admin' && (
          <button className="add-exam" onClick={() => addExam(level)}>
            ➕ إضافة امتحان جديد
          </button>
        )}
      </div>
      <div className="exam-list">
        {examData[level].map((exam, idx) => renderExamItem(exam, idx, level))}
      </div>
    </div>
  )

  return (
    <div className="exams-container">
      {/* Hero Section */}
 <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="title-main gradient-text">📚 اختر الصف الدراسي</h1>
            <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
              اختر الصف المناسب للوصول إلى الامتحانات المتاحة وتحسين مهاراتك الدراسية
            </p>
          </div>
        </div>
      {/* Breadcrumb */}
      <div className="breadcrumb" id="breadcrumb">
        <span className="breadcrumb-item active" onClick={() => showLevels()}>الامتحانات</span>
        {currentLevel && (
          <>
            <span>›</span>
            <span className="breadcrumb-item active">{levelTitles[currentLevel]}</span>
          </>
        )}
      </div>

      {/* Level Selection */}
      {!currentLevel && (
        <div className="level-selection" id="levelSelection">
          {renderLevelCard('first')}
          {renderLevelCard('second')}
          {renderLevelCard('third')}
        </div>
      )}

      {/* Exam Sections */}
      {renderExamSection('first')}
      {renderExamSection('second')}
      {renderExamSection('third')}

      {/* Modal */}
      {showModal && (
        <div className="modal active">
          <div className="modal-content">
            <h3 className="modal-title">انتهت المحاولات</h3>
            <p className="modal-message">لقد استنفذت جميع المحاولات المسموح بها لهذا الامتحان.</p>
            <button className="modal-button" onClick={() => setShowModal(false)}>حسناً</button>
          </div>
        </div>
      )}
    </div>
  )
}
