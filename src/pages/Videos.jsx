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

    // Quiz gate: if any applicable quiz hasn't been passed, run it first —
    // unless the student has already used up all allowed attempts, in which
    // case we just tell them the part is locked.
    const blocking = findBlockingQuiz(currentVideo, part)
    if (blocking) {
      const key = `quiz-results-${currentVideo.id}-${blocking.localId}`
      const stored = JSON.parse(localStorage.getItem(key) || '{}')
      const attempts = stored.attempts || 0
      const max = blocking.maxAttempts || 1
      if (!stored.passed && attempts >= max) {
        showAlertModal(
          'انتهت محاولات الامتحان',
          `لقد استخدمت جميع المحاولات (${max}) لامتحان «${blocking.title}» ولم تجتزه. تواصل مع المعلم.`
        )
        return
      }
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
        <div className="vp-wrap">
          <div className="vp-toolbar">
            <button className="vp-back" onClick={goBackToGrades}>
              <i className="fas fa-arrow-right"></i>
              <span>العودة للصفوف</span>
            </button>

            <div className="vp-toolbar-title">
              <div className="vp-toolbar-sub">مكتبة الفيديوهات</div>
              <h1>الفيديوهات التعليمية</h1>
            </div>

            {userRole === 'admin' ? (
              <button className="vp-add" onClick={openAddVideoModal}>
                <i className="fas fa-plus"></i>
                <span>إضافة فيديو</span>
              </button>
            ) : <span className="vp-toolbar-spacer" />}
          </div>

          {(!videos[currentGrade] || videos[currentGrade].length === 0) ? (
            <div className="vp-empty">
              <i className="fas fa-video-slash"></i>
              <h3>لا توجد فيديوهات حالياً</h3>
              <p>
                {userRole === 'admin'
                  ? 'ابدأ بإضافة أول فيديو لهذا الصف من زر «إضافة فيديو» في الأعلى.'
                  : 'لم يتم رفع فيديوهات لهذا الصف بعد. يرجى المراجعة لاحقاً.'}
              </p>
            </div>
          ) : (
            <div className="vp-grid">
              {videos[currentGrade].map((video, index) => {
                const expiry = new Date(video.expiryTime)
                const isAvailable = new Date() < expiry
                const formattedExpiry = expiry.toLocaleDateString('ar-EG', {
                  year: 'numeric', month: 'long', day: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                })
                const totalDuration = video.parts.reduce((sum, p) => {
                  const mins = parseInt(p.duration) || 0
                  return sum + mins
                }, 0)
                const quizCount = (video.quizzes || []).length
                const handleDelete = (e) => {
                  e.stopPropagation()
                  setVideos(prev => ({
                    ...prev,
                    [currentGrade]: prev[currentGrade].filter(v => v.id !== video.id)
                  }))
                }

                return (
                  <article key={video.id} className="vp-card" onClick={() => openVideoPlayer(video)}>
                    <div className="vp-card-poster">
                      <div className="vp-poster-glow" />
                      <span className="vp-poster-num">#{index + 1}</span>
                      <span className="vp-card-play" aria-hidden="true">
                        <i className="fas fa-play"></i>
                      </span>
                      <span className={`vp-status ${isAvailable ? 'vp-status-ok' : 'vp-status-off'}`}>
                        <span className="vp-status-dot" />
                        {isAvailable ? 'متاح' : 'منتهي'}
                      </span>
                      {quizCount > 0 && (
                        <span className="vp-quiz-chip" title="يتطلب اجتياز امتحان قبل المشاهدة">
                          <i className="fas fa-graduation-cap"></i>
                          {quizCount} {quizCount === 1 ? 'امتحان' : 'امتحانات'}
                        </span>
                      )}
                    </div>

                    <div className="vp-card-body">
                      <h3 className="vp-card-title">{video.title}</h3>
                      <p className="vp-card-desc">{video.description || 'لا يوجد وصف'}</p>

                      <div className="vp-card-stats">
                        <span className="vp-stat"><i className="fas fa-film"></i>{video.totalParts} جزء</span>
                        <span className="vp-stat"><i className="fas fa-clock"></i>{totalDuration || video.totalParts * 18} د</span>
                        <span className="vp-stat"><i className="fas fa-eye"></i>{video.viewLimit} مشاهدات</span>
                        <span className="vp-stat"><i className="fas fa-hourglass-half"></i>{video.activeHours} س</span>
                      </div>

                      <div className="vp-card-foot">
                        <span className="vp-card-expiry">
                          <i className="far fa-calendar"></i>
                          حتى {formattedExpiry}
                        </span>
                        {userRole === 'admin' && (
                          <button className="vp-card-delete" onClick={handleDelete} aria-label="حذف">
                            <i className="fas fa-trash"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Video Player View */}
      {view === 'player' && currentVideo && (
        <div className="vp-player">
          <div className="vp-player-topbar">
            <button className="vp-back" onClick={goBackToVideos}>
              <i className="fas fa-arrow-right"></i>
              <span>العودة</span>
            </button>

            <div className="vp-player-titles">
              <h1>{currentVideo.title}</h1>
              {currentVideo.description && <p>{currentVideo.description}</p>}
            </div>
          </div>

          <div className="vp-player-layout">
            <div className="vp-stage">
              <div id="videoFrame" className="vp-stage-frame">
                <div className="vp-stage-idle">
                  <div className="vp-stage-idle-icon"><i className="fas fa-play"></i></div>
                  <h3>اختر جزء لبدء المشاهدة</h3>
                  <p>اختر أي جزء من القائمة الجانبية لتشغيل الفيديو</p>
                </div>
              </div>

              {selectedPart && (
                <div className="vp-now-playing">
                  <div className="vp-now-label">
                    <span className="vp-now-pulse" />
                    يُعرض الآن
                  </div>
                  <div className="vp-now-title">{selectedPart.title}</div>
                </div>
              )}
            </div>

            <aside className="vp-sidebar">
              <div className="vp-sidebar-head">
                <h3>أجزاء الفيديو</h3>
                <span className="vp-sidebar-count">{currentVideo.parts.length} جزء</span>
              </div>

              <div className="vp-parts" data-quiz-tick={quizTick}>
                {currentVideo.parts.map((part, index) => {
                  const blocking = findBlockingQuiz(currentVideo, part)
                  const locked = !!blocking
                  const active = selectedPart?.id === part.id
                  return (
                    <button
                      key={part.id}
                      type="button"
                      className={`vp-part ${locked ? 'is-locked' : ''} ${active ? 'is-active' : ''}`}
                      onClick={() => playVideoPart(part)}
                    >
                      <div className="vp-part-index">
                        {locked
                          ? <i className="fas fa-lock"></i>
                          : active
                            ? <i className="fas fa-volume-high"></i>
                            : <span>{index + 1}</span>}
                      </div>
                      <div className="vp-part-main">
                        <div className="vp-part-title">{part.title}</div>
                        <div className="vp-part-meta">
                          <span><i className="far fa-clock"></i>{part.duration}</span>
                          <span><i className="fas fa-eye"></i>متبقي {part.remainingViews}</span>
                        </div>
                        {locked && (
                          <div className="vp-part-gate">
                            <i className="fas fa-graduation-cap"></i>
                            امتحان: {blocking.title}
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </aside>
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
