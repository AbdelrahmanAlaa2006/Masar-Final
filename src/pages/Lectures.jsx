import React, { useState, useEffect } from 'react'
import './Lectures.css'

export default function Lectures() {
  const [currentGrade, setCurrentGrade] = useState('')
  const [gradeSelectionVisible, setGradeSelectionVisible] = useState(true)
  const [activeSections, setActiveSections] = useState({})
  const [userRole, setUserRole] = useState(null)

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('masar-user'))
      setUserRole(user?.role || null)
    } catch {
      setUserRole(null)
    }
  }, [])
  const [lectures, setLectures] = useState({
    first: [
      { name: 'مقدمة في الرياضيات - الأسبوع الأول', icon: '📄' },
      { name: 'أساسيات الجبر - الأسبوع الثاني', icon: '📄' }
    ],
    second: [
      { name: 'الهندسة المستوية - الأسبوع الأول', icon: '📄' },
      { name: 'المعادلات الخطية - الأسبوع الثاني', icon: '📄' }
    ],
    third: [
      { name: 'حساب المثلثات - الأسبوع الأول', icon: '📄' },
      { name: 'الإحصاء والاحتمالات - الأسبوع الثاني', icon: '📄' }
    ]
  })
  const [modalVisible, setModalVisible] = useState(false)
  const [formData, setFormData] = useState({ lectureName: '', lectureFile: null })

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

    // Theme from localStorage
    if (localStorage.getItem('theme') === 'dark') {
      document.body.classList.add('dark')
    }

    return () => clearInterval(particleInterval)
  }, [])

  const selectGrade = (grade) => {
    setCurrentGrade(grade)
    setGradeSelectionVisible(false)
    setActiveSections({ [grade + 'PrepSection']: true })
  }

  const backToSelection = () => {
    setGradeSelectionVisible(true)
    setActiveSections({})
    setCurrentGrade('')
  }

  const openAddLectureModal = (grade) => {
    setCurrentGrade(grade)
    setModalVisible(true)
  }

  const closeAddLectureModal = () => {
    setModalVisible(false)
    setFormData({ lectureName: '', lectureFile: null })
  }

  const handleAddLecture = (e) => {
    e.preventDefault()
    if (formData.lectureName && formData.lectureFile && currentGrade) {
      const newLecture = {
        name: formData.lectureName,
        icon: '📄'
      }
      setLectures(prev => ({
        ...prev,
        [currentGrade]: [...prev[currentGrade], newLecture]
      }))
      showNotification('تم إضافة المحاضرة بنجاح!', 'success')
      closeAddLectureModal()
    }
  }

  const showNotification = (message, type) => {
    const notification = document.createElement('div')
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? 'linear-gradient(45deg, #4ade80, #22c55e)' : 'linear-gradient(45deg, #3b82f6, #1d4ed8)'};
      color: white;
      padding: 15px 25px;
      border-radius: 12px;
      font-weight: 600;
      z-index: 3000;
      animation: slideInRight 0.3s ease-out;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      backdrop-filter: blur(10px);
    `
    notification.textContent = message
    document.body.appendChild(notification)

    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease-out'
      setTimeout(() => {
        document.body.removeChild(notification)
      }, 300)
    }, 3000)
  }

  const openPDF = (fileName) => {
    showNotification('سيتم فتح ملف: ' + fileName, 'info')
  }

  const logoutUser = () => {
    localStorage.removeItem('masar-user')
    let msg = document.createElement('div')
    msg.id = 'logout-message'
    msg.innerHTML = `
      <div class="logout-anim-icon">✔️</div>
      <div class="logout-anim-text" style="
        font-size: 1.7rem;
        font-weight: 900;
        color: #fff;
        text-shadow: 0 2px 8px #764ba2cc, 0 1px 0 #fff;
        letter-spacing: 1.5px;
        margin-top: 8px;
      ">تم تسجيل الخروج بنجاح</div>
    `
    msg.style.position = 'fixed'
    msg.style.top = '50%'
    msg.style.left = '50%'
    msg.style.transform = 'translate(-50%, -50%) scale(0.8)'
    msg.style.background = 'linear-gradient(135deg, #667eea, #764ba2)'
    msg.style.color = '#fff'
    msg.style.padding = '40px 60px'
    msg.style.borderRadius = '24px'
    msg.style.fontSize = '2rem'
    msg.style.fontWeight = 'bold'
    msg.style.boxShadow = '0 12px 40px 0 rgba(102,126,234,0.25), 0 2px 8px 0 rgba(0,0,0,0.10)'
    msg.style.zIndex = '9999'
    msg.style.textAlign = 'center'
    msg.style.letterSpacing = '1px'
    msg.style.overflow = 'hidden'
    msg.style.opacity = '0'
    msg.style.transition = 'opacity 0.4s cubic-bezier(.4,2,.6,1), transform 0.5s cubic-bezier(.4,2,.6,1)'
    msg.classList.add('logout-anim-in')
    document.body.appendChild(msg)

    setTimeout(() => {
      msg.style.opacity = '1'
      msg.style.transform = 'translate(-50%, -50%) scale(1)'
      msg.classList.add('logout-anim-in-active')
    }, 10)

    setTimeout(() => {
      msg.classList.remove('logout-anim-in-active')
      msg.classList.add('logout-anim-out')
      msg.style.opacity = '0'
      msg.style.transform = 'translate(-50%, -50%) scale(0.8)'
      setTimeout(() => {
        document.body.removeChild(msg)
        window.location.href = '/login'
      }, 400)
    }, 2000)

    if (!document.getElementById('logout-anim-style')) {
      const style = document.createElement('style')
      style.id = 'logout-anim-style'
      style.textContent = `
        .logout-anim-icon {
          font-size: 3.5rem;
          margin-bottom: 12px;
          animation: logout-bounce 0.7s cubic-bezier(.4,2,.6,1);
          filter: drop-shadow(0 2px 8px #fff8) drop-shadow(0 0px 16px #764ba2cc);
        }
        .logout-anim-text {
          animation: logout-fadein 1.2s cubic-bezier(.4,2,.6,1);
        }
        .logout-anim-in {
          animation: logout-in-anim 0.5s cubic-bezier(.4,2,.6,1);
        }
        .logout-anim-in-active {
        }
        .logout-anim-out {
          animation: logout-out-anim 0.4s cubic-bezier(.4,2,.6,1);
        }
        @keyframes logout-bounce {
          0% { transform: scale(0.5) rotate(-20deg); opacity: 0; }
          60% { transform: scale(1.2) rotate(8deg); opacity: 1; }
          80% { transform: scale(0.95) rotate(-4deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes logout-fadein {
          0% { opacity: 0; filter: blur(8px); }
          60% { opacity: 1; filter: blur(0); }
          100% { opacity: 1; filter: blur(0); }
        }
        @keyframes logout-in-anim {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes logout-out-anim {
          0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
        }
      `
      document.head.appendChild(style)
    }
  }

  const toggleTheme = () => {
    const isDark = document.body.classList.toggle('dark')
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }

  const renderLecturesSection = (grade, title, titleAr) => (
    <div key={grade} id={grade + 'PrepSection'} className={`lectures-section ${activeSections[grade + 'PrepSection'] ? 'active' : ''}`}>
      <button className="back-btn" onClick={backToSelection}>
        <span>←</span>
        العودة للاختيار
      </button>
      <div className="section-header">
        <h2 className="section-title">📚 {titleAr}</h2>
        {userRole === 'admin' && (
          <button className="add-lecture-btn" onClick={() => openAddLectureModal(grade)}>
            <span>+</span>
            إضافة محاضرة جديدة
          </button>
        )}
      </div>
      <div className="lectures" id={grade + 'PrepLectures'}>
        {lectures[grade].map((lecture, idx) => (
          <div key={idx} className="pdf">
            <a href="#" onClick={(e) => { e.preventDefault(); openPDF(lecture.name) }}>
              <span>{lecture.icon}</span>
              {lecture.name}
            </a>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div>
      <div className="main-content">
        <div className="container">
          {/* Grade Selection */}
          {gradeSelectionVisible && (
            <div id="gradeSelection">
              <h2>📚 اختر المرحلة الدراسية</h2>
              <div className="grade-selection">
                <div className="grade-card" onClick={() => selectGrade('first')}>
                  <span className="icon">🎓</span>
                  <h3>الصف الأول الإعدادي</h3>
                  <p>First Prep</p>
                </div>
                <div className="grade-card" onClick={() => selectGrade('second')}>
                  <span className="icon">📖</span>
                  <h3>الصف الثاني الإعدادي</h3>
                  <p>Second Prep</p>
                </div>
                <div className="grade-card" onClick={() => selectGrade('third')}>
                  <span className="icon">🏆</span>
                  <h3>الصف الثالث الإعدادي</h3>
                  <p>Third Prep</p>
                </div>
              </div>
            </div>
          )}

          {/* Lectures Sections */}
          {renderLecturesSection('first', 'First Prep', 'محاضرات الصف الأول الإعدادي')}
          {renderLecturesSection('second', 'Second Prep', 'محاضرات الصف الثاني الإعدادي')}
          {renderLecturesSection('third', 'Third Prep', 'محاضرات الصف الثالث الإعدادي')}
        </div>
      </div>

      {/* Add Lecture Modal */}
      {modalVisible && (
        <div id="addLectureModal" className="modal active" onClick={(e) => { if (e.target.id === 'addLectureModal') closeAddLectureModal() }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">إضافة محاضرة جديدة</h3>
              <button className="close-btn" onClick={closeAddLectureModal}>×</button>
            </div>
            <form id="addLectureForm" onSubmit={handleAddLecture}>
              <div className="form-group">
                <label htmlFor="lectureName">اسم المحاضرة:</label>
                <input
                  type="text"
                  id="lectureName"
                  name="lectureName"
                  placeholder="أدخل اسم المحاضرة"
                  value={formData.lectureName}
                  onChange={(e) => setFormData({ ...formData, lectureName: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="lectureFile">ملف PDF:</label>
                <input
                  type="file"
                  id="lectureFile"
                  name="lectureFile"
                  accept=".pdf"
                  onChange={(e) => setFormData({ ...formData, lectureFile: e.target.files[0] })}
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeAddLectureModal}>إلغاء</button>
                <button type="submit" className="btn btn-primary">إضافة المحاضرة</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
