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
  const [examData, setExamData] = useState({
    first: [
      {
        id: 'exam1_first',
        title: "رياضيات | الوحدة الأولى",
        lecture: "الأعداد الطبيعية والصحيحة",
        icon: "📘",
        duration: 60,
        availableHours: 72,
        maxAttempts: 2,
        questions: 15,
        grade: 30,
        createdAt: "2023-05-15T10:00:00"
      },
      {
        id: 'exam2_first',
        title: "علوم | الفصل الأول",
        lecture: "المادة وخواصها",
        icon: "🔬",
        duration: 45,
        availableHours: 48,
        maxAttempts: 1,
        questions: 10,
        grade: 20,
        createdAt: "2023-05-20T14:30:00"
      }
    ],
    second: [
      {
        id: 'exam1_second',
        title: "جبر | المعادلات",
        lecture: "المعادلات والمتباينات",
        icon: "📐",
        duration: 90,
        availableHours: 96,
        maxAttempts: 3,
        questions: 20,
        grade: 40,
        createdAt: "2023-05-10T09:15:00"
      },
      {
        id: 'exam2_second',
        title: "هندسة | الدائرة والمثلث",
        lecture: "خصائص الأشكال الهندسية",
        icon: "📏",
        duration: 75,
        availableHours: 72,
        maxAttempts: 2,
        questions: 18,
        grade: 36,
        createdAt: "2023-05-18T11:45:00"
      },
      {
        id: 'exam3_second',
        title: "علوم | التفاعلات الكيميائية",
        lecture: "أنواع التفاعلات ومعادلاتها",
        icon: "🧪",
        duration: 60,
        availableHours: 48,
        maxAttempts: 1,
        questions: 15,
        grade: 30,
        createdAt: "2023-05-22T16:20:00"
      }
    ],
    third: [
      {
        id: 'exam1_third',
        title: "جبر | الإحصاء",
        lecture: "الإحصاء والاحتمالات",
        icon: "📊",
        duration: 120,
        availableHours: 120,
        maxAttempts: 2,
        questions: 25,
        grade: 50,
        createdAt: "2023-05-05T08:00:00"
      },
      {
        id: 'exam2_third',
        title: "هندسة | الإحداثيات",
        lecture: "الرسم البياني والإحداثيات",
        icon: "📈",
        duration: 90,
        availableHours: 96,
        maxAttempts: 2,
        questions: 20,
        grade: 40,
        createdAt: "2023-05-12T13:30:00"
      },
      {
        id: 'exam3_third',
        title: "فيزياء | الكهرباء",
        lecture: "الكهرباء والمغناطيسية",
        icon: "⚡",
        duration: 75,
        availableHours: 72,
        maxAttempts: 1,
        questions: 18,
        grade: 36,
        createdAt: "2023-05-17T10:15:00"
      },
      {
        id: 'exam4_third',
        title: "كيمياء | التركيب الذري",
        lecture: "الذرة والجزيء والروابط",
        icon: "🧬",
        duration: 60,
        availableHours: 48,
        maxAttempts: 1,
        questions: 15,
        grade: 30,
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

  const PREP_META = {
    first:  { ar: 'الصف الأول الإعدادي',  en: 'First Prep',  icon: 'fa-seedling',         accent: 'green',  desc: 'بداية المرحلة الإعدادية والتأسيس' },
    second: { ar: 'الصف الثاني الإعدادي', en: 'Second Prep', icon: 'fa-book-open-reader', accent: 'blue',   desc: 'تعميق المفاهيم وبناء المهارات' },
    third:  { ar: 'الصف الثالث الإعدادي', en: 'Third Prep',  icon: 'fa-trophy',           accent: 'orange', desc: 'الاستعداد لاختبارات الشهادة' },
  }

  const renderLevelCard = (level) => {
    const m = PREP_META[level]
    return (
      <button key={level} className={`prep-card prep-${m.accent}`} onClick={() => showExams(level)}>
        <div className="prep-cover">
          <div className="prep-cover-deco" />
          <div className="prep-icon"><i className={`fas ${m.icon}`}></i></div>
          <div className="prep-stage">{m.en}</div>
        </div>
        <div className="prep-body">
          <h3>{m.ar}</h3>
          <p>{m.desc}</p>
          <div className="prep-foot">
            <span className="prep-count"><i className="fas fa-file-alt"></i> {examData[level].length} امتحان</span>
            <span className="prep-cta">عرض <i className="fas fa-arrow-left"></i></span>
          </div>
        </div>
      </button>
    )
  }

  const deleteExam = (level, examId) => {
    setExamData(prev => ({
      ...prev,
      [level]: prev[level].filter(e => e.id !== examId)
    }))
  }

  const renderExamItem = (exam, index, level) => {
    const remainingAttempts = getRemainingAttempts(exam.id)
    const createdAt = new Date(exam.createdAt)
    const availableUntil = new Date(createdAt.getTime() + (exam.availableHours * 60 * 60 * 1000))
    const isAvailable = new Date() < availableUntil
    const formattedDate = availableUntil.toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    return (
      <div key={exam.id} className="ec-card" style={{ animationDelay: `${(index + 1) * 0.1}s` }} onClick={() => startExam(exam.id)}>

        {/* Status Bar */}
        <div className={`ec-status-bar ${isAvailable ? 'ec-available' : 'ec-unavailable'}`}>
          <span className="ec-status-dot" />
          <span>{isAvailable ? 'متاح' : 'غير متاح'}</span>
          {userRole === 'admin' && (
            <button className="ec-delete-btn" onClick={e => { e.stopPropagation(); deleteExam(level, exam.id) }}>
              🗑 حذف
            </button>
          )}
        </div>

        {/* Header */}
        <div className="ec-header">
          <div className="ec-badge">{index + 1}</div>
          <div className="ec-titles">
            <div className="ec-title">{exam.title}</div>
            <div className="ec-lecture">{exam.icon} {exam.lecture}</div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="ec-stats">
          <div className="ec-stat">
            <span className="ec-stat-icon">⏱️</span>
            <span className="ec-stat-label">مدة الامتحان</span>
            <span className="ec-stat-value">{exam.duration} دقيقة</span>
          </div>
          <div className="ec-stat">
            <span className="ec-stat-icon">🕒</span>
            <span className="ec-stat-label">المدة المتاحة</span>
            <span className="ec-stat-value">{exam.availableHours} ساعة</span>
          </div>
          <div className="ec-stat">
            <span className="ec-stat-icon">❓</span>
            <span className="ec-stat-label">عدد الأسئلة</span>
            <span className="ec-stat-value">{exam.questions} سؤال</span>
          </div>
          <div className="ec-stat">
            <span className="ec-stat-icon">🏆</span>
            <span className="ec-stat-label">درجة الامتحان</span>
            <span className="ec-stat-value">{exam.grade} درجة</span>
          </div>
          <div className="ec-stat">
            <span className="ec-stat-icon">🔁</span>
            <span className="ec-stat-label">عدد المحاولات</span>
            <span className="ec-stat-value">{remainingAttempts}/{exam.maxAttempts}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="ec-footer">
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
      {/* Header (only on selection screen) */}
      {!currentLevel && (
        <div className="exm-prep-wrap">
          <div className="exm-prep-head">
            <div className="exm-prep-icon"><i className="fas fa-file-alt"></i></div>
            <div>
              <h1>الامتحانات</h1>
              <p>اختر المرحلة الدراسية لاستعراض الامتحانات المتاحة</p>
            </div>
          </div>
          <div className="prep-grid">
            {renderLevelCard('first')}
            {renderLevelCard('second')}
            {renderLevelCard('third')}
          </div>
        </div>
      )}

      {/* Breadcrumb (only on inner views) */}
      {currentLevel && (
        <div className="breadcrumb" id="breadcrumb">
          <span className="breadcrumb-item active" onClick={() => showLevels()}>الامتحانات</span>
          <span>›</span>
          <span className="breadcrumb-item active">{levelTitles[currentLevel]}</span>
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
