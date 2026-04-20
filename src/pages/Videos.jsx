import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import './Videos.css'
import PrepIllustration from '../components/PrepIllustration'
import QuizRunner from '../components/QuizRunner'

export default function Videos() {
  const navigate = useNavigate()
  const [userRole, setUserRole] = useState(null)
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
        title: 'رياضيات | مقدمة الأعداد',
        description: 'شرح الأعداد الطبيعية والعمليات الحسابية مع أمثلة محلولة',
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

  // Quiz gating
  const [activeQuiz, setActiveQuiz] = useState(null)   // quiz currently being run
  const [pendingPart, setPendingPart] = useState(null) // part the student wanted to play
  const [quizTick, setQuizTick] = useState(0)          // bump to re-evaluate gates after a pass

  // Find the next unpassed quiz that gates this part (whole-video first, then part-specific)
  const findBlockingQuiz = (video, part) => {
    if (!video || !video.quizzes || video.quizzes.length === 0) return null
    const partIdx = video.parts.findIndex(p => p.id === part.id)
    const applies = (qz) =>
      qz.scope === 'whole' ||
      (qz.scope === 'part' && qz.partIndex === partIdx)
    for (const qz of video.quizzes) {
      if (!applies(qz)) continue
      const key = `quiz-results-${video.id}-${qz.localId}`
      const stored = JSON.parse(localStorage.getItem(key) || '{}')
      if (!stored.passed) return qz
    }
    return null
  }

  const isPartUnlocked = (video, part) => !findBlockingQuiz(video, part)

  // Load current user
  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('masar-user'))
      if (user) {
        setCurrentUser(user)
        setUserRole(user.role || null)
      }
    } catch (err) {
      console.error('Error loading user:', err)
    }
  }, [])

  // Merge admin-created videos (from VideoAdd → localStorage['videos']) into the
  // grade buckets so quizzes and new uploads are visible to students.
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('videos')) || []
      if (!Array.isArray(stored) || stored.length === 0) return
      setVideos(prev => {
        const next = { ...prev }
        for (const g of Object.keys(next)) next[g] = [...(next[g] || [])]
        for (const v of stored) {
          const g = v.grade
          if (!next[g]) next[g] = []
          if (!next[g].some(x => x.id === v.id)) next[g].push(v)
        }
        return next
      })
    } catch (err) {
      console.error('Error loading stored videos:', err)
    }
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

    // Quiz gate: if any applicable quiz hasn't been passed, run it first.
    const blocking = findBlockingQuiz(currentVideo, part)
    if (blocking) {
      setPendingPart(part)
      setActiveQuiz(blocking)
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

  const handleQuizPass = () => {
    setActiveQuiz(null)
    setQuizTick(t => t + 1)
    // Re-attempt to play the part the student originally clicked. If there's
    // still another blocking quiz (e.g. whole-video then part-specific), the
    // next call to playVideoPart will surface it.
    const part = pendingPart
    setPendingPart(null)
    if (part) playVideoPart(part)
  }

  const handleQuizClose = () => {
    setActiveQuiz(null)
    setPendingPart(null)
  }

  return (
    <div className="videos-page" dir="rtl">

      {/* Grade Selection View */}
      {view === 'grades' && (
        <div className="vid-prep-wrap">
          <div className="vid-prep-head">
            <div className="vid-prep-icon"><i className="fas fa-video"></i></div>
            <div>
              <h1>الفيديوهات التعليمية</h1>
              <p>اختر المرحلة الدراسية لعرض الفيديوهات الخاصة بها</p>
            </div>
          </div>

          <div className="prep-grid">
            {[
              { id: 'first-prep',  ar: 'الصف الأول الإعدادي',  en: 'First Prep',  icon: 'fa-seedling',          accent: 'green',  desc: 'بداية المرحلة الإعدادية والتأسيس' },
              { id: 'second-prep', ar: 'الصف الثاني الإعدادي', en: 'Second Prep', icon: 'fa-book-open-reader',  accent: 'blue',   desc: 'تعميق المفاهيم وبناء المهارات' },
              { id: 'third-prep',  ar: 'الصف الثالث الإعدادي', en: 'Third Prep',  icon: 'fa-trophy',            accent: 'orange', desc: 'الاستعداد لاختبارات الشهادة' },
            ].map((p) => {
              const count = (videos[p.id] || []).length
              return (
                <button key={p.id} className={`prep-card prep-${p.accent}`} onClick={() => selectGrade(p.id, p.ar)}>
                  <div className="prep-cover">
                    <div className="prep-cover-deco" />
                    <PrepIllustration kind={p.id.replace('-prep','')} stage={p.en} />
                  </div>
                  <div className="prep-body">
                    <h3>{p.ar}</h3>
                    <p>{p.desc}</p>
                    <div className="prep-foot">
                      <span className="prep-count"><i className="fas fa-play-circle"></i> {count} فيديو</span>
                      <span className="prep-cta">عرض <i className="fas fa-arrow-left"></i></span>
                    </div>
                  </div>
                </button>
              )
            })}
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

            {userRole === 'admin' && (
              <button className="btn btn-primary" onClick={openAddVideoModal}>
                ➕ إضافة فيديو جديد
              </button>
            )}
          </div>

          <div className="videos-grid" id="videosGrid">
            {currentGrade && videos[currentGrade] && videos[currentGrade].map((video, index) => {
              const expiry = new Date(video.expiryTime)
              const isAvailable = new Date() < expiry
              const formattedExpiry = expiry.toLocaleDateString('ar-EG', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })
              const totalDuration = video.parts.reduce((sum, p) => {
                const mins = parseInt(p.duration) || 0
                return sum + mins
              }, 0)

              const handleDelete = (e) => {
                e.stopPropagation()
                setVideos(prev => ({
                  ...prev,
                  [currentGrade]: prev[currentGrade].filter(v => v.id !== video.id)
                }))
              }

              return (
                <div key={video.id} className="vc-card" onClick={() => openVideoPlayer(video)}>

                  {/* Status Bar */}
                  <div className={`vc-status-bar ${isAvailable ? 'vc-available' : 'vc-unavailable'}`}>
                    <span className="vc-status-dot" />
                    <span>{isAvailable ? 'متاح' : 'غير متاح'}</span>
                    {userRole === 'admin' && (
                      <button className="vc-delete-btn" onClick={handleDelete}>
                        🗑 حذف
                      </button>
                    )}
                  </div>

                  {/* Header */}
                  <div className="vc-header">
                    <div className="vc-play-btn">▶</div>
                    <div className="vc-titles">
                      <div className="vc-title">{video.title}</div>
                      <div className="vc-desc">{video.description}</div>
                    </div>
                    <div className="vc-badge">{index + 1}</div>
                  </div>

                  {/* Stats */}
                  <div className="vc-stats">
                    <div className="vc-stat">
                      <span className="vc-stat-icon">🎬</span>
                      <span className="vc-stat-label">عدد الأجزاء</span>
                      <span className="vc-stat-value">{video.totalParts} جزء</span>
                    </div>
                    <div className="vc-stat">
                      <span className="vc-stat-icon">⏱️</span>
                      <span className="vc-stat-label">المدة الكلية</span>
                      <span className="vc-stat-value">{totalDuration || video.totalParts * 18} دقيقة</span>
                    </div>
                    <div className="vc-stat">
                      <span className="vc-stat-icon">👁️</span>
                      <span className="vc-stat-label">عدد المشاهدات</span>
                      <span className="vc-stat-value">{video.viewLimit} مرات</span>
                    </div>
                    <div className="vc-stat">
                      <span className="vc-stat-icon">🕒</span>
                      <span className="vc-stat-label">متاح لمدة</span>
                      <span className="vc-stat-value">{video.activeHours} ساعة</span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="vc-footer">
                    <span>⏳</span>
                    <span>متاح حتى {formattedExpiry}</span>
                  </div>

                </div>
              )
            })}
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
                <div id="partsList" data-quiz-tick={quizTick}>
                  {currentVideo?.parts.map((part, index) => {
                    const blocking = findBlockingQuiz(currentVideo, part)
                    const locked = !!blocking
                    return (
                      <div
                        key={part.id}
                        className={`part-item ${locked ? 'part-item-locked' : ''}`}
                        onClick={() => playVideoPart(part)}
                      >
                        <div className="title-card" style={{ color: 'var(--text-primary)' }}>
                          {locked && <i className="fas fa-lock" style={{ marginInlineEnd: 6, color: '#ed8936' }}></i>}
                          الجزء {index + 1}: {part.title}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                          ⏱️ {part.duration}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--educational-accent)', marginTop: '4px' }}>
                          👁️ المتبقي: {part.remainingViews}
                        </div>
                        {locked && (
                          <div style={{ fontSize: '0.8rem', color: '#ed8936', marginTop: '6px', fontWeight: 700 }}>
                            <i className="fas fa-graduation-cap"></i> امتحان مطلوب: {blocking.title}
                          </div>
                        )}
                      </div>
                    )
                  })}
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

      {/* Quiz Gate */}
      {activeQuiz && currentVideo && (
        <QuizRunner
          quiz={activeQuiz}
          videoId={currentVideo.id}
          onPass={handleQuizPass}
          onClose={handleQuizClose}
        />
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
