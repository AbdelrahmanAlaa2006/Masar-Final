import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import './Videos.css'

export default function Videos() {
  const navigate = useNavigate()
  // State
  const [currentGrade, setCurrentGrade] = useState('')
  const [currentVideo, setCurrentVideo] = useState(null)
  const [selectedPart, setSelectedPart] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [showAddVideoModal, setShowAddVideoModal] = useState(false)
  const [view, setView] = useState('grades') // 'grades', 'videos', 'player'
  const [videos, setVideos] = useState({
    'first-prep': [
      {
        id: '1',
        title: 'مقدمة في الرياضيات',
        description: 'أساسيات الرياضيات للصف الأول الإعدادي - شرح مفصل لأهم المفاهيم',
        grade: 'first-prep',
        totalParts: 3,
        parts: [
          {
            id: '1-1',
            title: 'الأعداد الطبيعية',
            videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            duration: '15 دقيقة',
            viewLimit: 3,
            remainingViews: 3
          },
          {
            id: '1-2',
            title: 'العمليات الحسابية',
            videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            duration: '20 دقيقة',
            viewLimit: 3,
            remainingViews: 3
          },
          {
            id: '1-3',
            title: 'حل المسائل',
            videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            duration: '18 دقيقة',
            viewLimit: 3,
            remainingViews: 3
          }
        ],
        viewLimit: 3,
        activeHours: 24,
        expiryTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        quiz: []
      }
    ],
    'second-prep': [],
    'third-prep': []
  })
  const [studentQuizData, setStudentQuizData] = useState({})
  const [showAlert, setShowAlert] = useState(false)
  const [alertData, setAlertData] = useState({ title: '', message: '' })

  const scientificElements = [
    'x² + y² = r²', 'E = mc²', 'F = ma', 'a² + b² = c²', 'PV = nRT',
    '∫ f(x)dx', '∑ n=1', '∆x → 0', 'lim x→∞', 'dy/dx',
    '∞', '∂', '∇', '∆', '∑', '∏', '∫', '√', '±', '∝',
    'α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'π', 'σ', 'φ', 'ψ', 'ω',
    'H₂O', 'CO₂', 'NaCl', 'C₆H₁₂O₆', 'CH₄', 'NH₃', 'H₂SO₄',
    'v = u + at', 's = ut + ½at²', 'P = F/A', 'W = Fd', 'Q = mcΔT',
    '△', '⬠', '⬢', '⬟', '⬝', '◯', '⬜', '⬛',
    '1', '2', '3', '5', '7', '11', '13', '17', '19', '23',
  ]

  // Load current user
  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('masar-user'))
      if (user && user.username) {
        setCurrentUser(user)
      }
    } catch (err) {
      console.error('Error loading user:', err)
    }
  }, [])

  // Initialize floating elements
  useEffect(() => {
    const bgDiv = document.getElementById('scientificBg')
    if (!bgDiv) return

    const createFloatingElement = () => {
      const element = document.createElement('div')
      const sizes = ['small', 'medium', 'large']
      element.className = `floating-element ${sizes[Math.floor(Math.random() * 3)]}`
      element.textContent = scientificElements[Math.floor(Math.random() * scientificElements.length)]
      element.style.left = Math.random() * 100 + '%'
      element.style.animationDelay = Math.random() * 10 + 's'
      
      bgDiv.appendChild(element)
      
      setTimeout(() => {
        if (element.parentNode) {
          element.parentNode.removeChild(element)
        }
      }, 25000)
    }

    for (let i = 0; i < 15; i++) {
      setTimeout(createFloatingElement, i * 1000)
    }

    const interval = setInterval(createFloatingElement, 2000)
    return () => clearInterval(interval)
  }, [])

  // Extract video ID from YouTube URL
  const extractVideoId = (url) => {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^\&\n\r\t\v\f]+)/
    const match = url.match(regex)
    return match ? match[1] : null
  }

  const selectGrade = (gradeId, gradeTitle) => {
    setCurrentGrade(gradeId)
    setView('videos')
  }

  const goBackToGrades = () => {
    setCurrentGrade('')
    setCurrentVideo(null)
    setSelectedPart(null)
    setView('grades')
  }

  const goBackToVideos = () => {
    setCurrentVideo(null)
    setSelectedPart(null)
    setView('videos')
  }

  const openVideoPlayer = (video) => {
    setCurrentVideo(video)
    setSelectedPart(null)
    setView('player')
  }

  const openAddVideoModal = () => {
    localStorage.setItem('selectedVideoGrade', currentGrade)
    navigate('/video-add')
  }

  const closeAddVideoModal = () => {
    setShowAddVideoModal(false)
  }

  const showAlertModal = (title, message) => {
    setAlertData({ title, message })
    setShowAlert(true)
  }

  const closeAlertModal = () => {
    setShowAlert(false)
  }

  const playVideoPart = (part) => {
    const now = new Date()
    const expiryDate = new Date(currentVideo.expiryTime)
    
    if (now > expiryDate) {
      showAlertModal('انتهت المدة', 'انتهت مدة تفعيل هذا الفيديو')
      return
    }

    if (part.remainingViews <= 0) {
      showAlertModal('انتهت المحاولات', 'لم تعد لديك محاولات متبقية لمشاهدة هذا الجزء')
      return
    }

    setSelectedPart(part)
    const videoId = extractVideoId(part.videoUrl)
    
    if (videoId) {
      const videoFrame = document.getElementById('videoFrame')
      if (videoFrame) {
        videoFrame.innerHTML = `<iframe class="video-frame" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>`
      }
    }
  }

  return (
    <div className="videos-page" dir="rtl">
      <div className="scientific-bg" id="scientificBg"></div>

      {/* Grade Selection View */}
      {view === 'grades' && (
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="title-main gradient-text">📚 اختر الصف الدراسي</h1>
            <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
              اختر الصف المناسب لعرض الفيديوهات التعليمية
            </p>
          </div>

          <div className="grade-grid">
            <div className="card grade-card" onClick={() => selectGrade('first-prep', 'الصف الأول الإعدادي')}>
              <div className="grade-icon">🎓</div>
              <h3 className="title-card" style={{ color: 'var(--text-primary)' }}>First Prep</h3>
              <p style={{ color: 'var(--text-secondary)' }}>الصف الأول الإعدادي</p>
            </div>

            <div className="card grade-card" onClick={() => selectGrade('second-prep', 'الصف الثاني الإعدادي')}>
              <div className="grade-icon">📖</div>
              <h3 className="title-card" style={{ color: 'var(--text-primary)' }}>Second Prep</h3>
              <p style={{ color: 'var(--text-secondary)' }}>الصف الثاني الإعدادي</p>
            </div>

            <div className="card grade-card" onClick={() => selectGrade('third-prep', 'الصف الثالث الإعدادي')}>
              <div className="grade-icon">🏆</div>
              <h3 className="title-card" style={{ color: 'var(--text-primary)' }}>Third Prep</h3>
              <p style={{ color: 'var(--text-secondary)' }}>الصف الثالث الإعدادي</p>
            </div>
          </div>
        </div>
      )}

      {/* Videos List View */}
      {view === 'videos' && (
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <button className="btn btn-outline" onClick={goBackToGrades}>
              ← العودة للصفوف
            </button>

            <div className="text-center">
              <h1 id="gradeTitle" className="title-main gradient-text">📺 الفيديوهات التعليمية</h1>
            </div>

            <button className="btn btn-primary" onClick={openAddVideoModal}>
              ➕ إضافة فيديو جديد
            </button>
          </div>

          <div className="videos-grid" id="videosGrid">
            {currentGrade && videos[currentGrade] && videos[currentGrade].map((video) => (
              <div key={video.id} className="card video-card" onClick={() => openVideoPlayer(video)}>
                <div className="video-thumbnail">
                  <div className="play-icon">▶️</div>
                  <span className="badge badge-secondary" style={{ position: 'absolute', top: '10px', right: '10px' }}>
                    {video.totalParts} أجزاء
                  </span>
                </div>
                <div className="video-info">
                  <h3>{video.title}</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '10px' }}>
                    {video.description}
                  </p>
                  <div className="info-grid">
                    <div className="info-item">
                      <span className="info-label">👁️ المشاهدات</span>
                      <span className="info-value">{video.viewLimit}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">⏱️ المدة</span>
                      <span className="info-value">{video.totalParts * 20} دقيقة</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video Player View */}
      {view === 'player' && (
        <div>
          <div className="flex justify-between items-center mb-8 max-w-7xl mx-auto">
            <button className="btn btn-outline" onClick={goBackToVideos}>
              ← العودة للفيديوهات
            </button>

            <div className="text-center">
              <h1 id="videoTitle" className="title-main gradient-text">
                {currentVideo?.title}
              </h1>
              <p id="videoDescription" style={{ color: 'var(--text-secondary)' }}>
                {currentVideo?.description}
              </p>
            </div>

            <div style={{ width: '120px' }}></div>
          </div>

          <div className="video-player-container">
            <div className="video-main">
              <div className="card">
                <div id="videoFrame">
                  <div className="placeholder-video">
                    <div>
                      <div style={{ fontSize: '4rem', marginBottom: '16px' }}>▶️</div>
                      <h3 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>اختر جزء لبدء المشاهدة</h3>
                      <p style={{ opacity: 0.8 }}>اضغط على أحد الأجزاء من القائمة الجانبية</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="video-sidebar">
              <div className="card">
                <h3 className="title-section text-center" style={{ color: 'var(--text-primary)' }}>
                  أجزاء المحاضرة
                </h3>
                <div id="partsList">
                  {currentVideo?.parts.map((part, index) => (
                    <div
                      key={part.id}
                      className="part-item"
                      onClick={() => playVideoPart(part)}
                    >
                      <div className="title-card" style={{ color: 'var(--text-primary)' }}>
                        الجزء {index + 1}: {part.title}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                        ⏱️ {part.duration}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--educational-accent)', marginTop: '4px' }}>
                        👁️ المتبقي: {part.remainingViews}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Video Modal */}
      {showAddVideoModal && (
        <div className="modal show" onClick={closeAddVideoModal}>
          <div className="modal-content" style={{ width: '800px', maxWidth: '90%' }} onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={closeAddVideoModal}>&times;</button>
            <h2 className="title-section gradient-text text-center mb-6">إضافة فيديو جديد</h2>
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
              وظيفة إضافة الفيديو متاحة فقط للمعلمين والمديرين
            </p>
          </div>
        </div>
      )}

      {/* Alert Modal */}
      {showAlert && (
        <div className="modal show" onClick={closeAlertModal}>
          <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={closeAlertModal}>&times;</button>
            <h3 className="title-card mb-4">{alertData.title}</h3>
            <p className="mb-6">{alertData.message}</p>
            <button className="btn btn-primary" onClick={closeAlertModal}>حسناً</button>
          </div>
        </div>
      )}
    </div>
  )
}
