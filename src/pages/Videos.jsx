import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import './Videos.css'
import PrepIllustration from '../components/PrepIllustration'
import QuizRunner from '../components/QuizRunner'
import { listVideos, deleteVideo } from '@backend/videosApi'
import {
  listQuizAttemptsForVideo,
  listProgressForVideo,
  incrementPartView,
} from '@backend/progressApi'
import { listEffectiveOverrides, reduceEffective } from '@backend/overridesApi'

const GRADES = [
  { id: 'first-prep',  ar: 'الصف الأول الإعدادي',  en: 'First Prep',  accent: 'green',  desc: 'بداية المرحلة الإعدادية والتأسيس' },
  { id: 'second-prep', ar: 'الصف الثاني الإعدادي', en: 'Second Prep', accent: 'blue',   desc: 'تعميق المفاهيم وبناء المهارات' },
  { id: 'third-prep',  ar: 'الصف الثالث الإعدادي', en: 'Third Prep',  accent: 'orange', desc: 'الاستعداد لاختبارات الشهادة' },
]

// Convert a DB video row (with embedded video_parts) into the shape the
// rest of the page was built around (parts[], totalParts, quizzes[]).
function shapeVideo(row) {
  const parts = (row.video_parts || []).map((p) => ({
    id: p.id,
    title: p.title,
    videoUrl: p.youtube_url,
    duration: p.duration_minutes ? `${p.duration_minutes} دقيقة` : '—',
    part_index: p.part_index,
  }))
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    grade: row.grade,
    totalParts: parts.length,
    parts,
    viewLimit: row.view_limit,
    activeHours: row.active_hours,
    expiryTime: row.expiry_at,
    createdAt: row.created_at,
    quizzes: row.quizzes || [],
  }
}

export default function Videos() {
  const navigate = useNavigate()
  const [userRole, setUserRole] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)

  const [currentGrade, setCurrentGrade] = useState('')
  const [currentVideo, setCurrentVideo] = useState(null)
  const [selectedPart, setSelectedPart] = useState(null)
  const [view, setView] = useState('grades')

  const [allVideos, setAllVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [videoOverrides, setVideoOverrides] = useState(new Map()) // videoId -> {allowed, attempts}

  // Per-video progress+quiz cache for the one currently-open video
  const [quizAttempts, setQuizAttempts] = useState([]) // rows from quiz_attempts
  const [progressRows, setProgressRows] = useState([]) // rows from video_progress
  const [quizTick, setQuizTick] = useState(0)

  const [activeQuiz, setActiveQuiz] = useState(null)
  const [pendingPart, setPendingPart] = useState(null)

  const [showAlert, setShowAlert] = useState(false)
  const [alertData, setAlertData] = useState({ title: '', message: '' })

  // ── Load current user ────────────────────────────────────────
  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('masar-user'))
      if (user) {
        setCurrentUser(user)
        setUserRole(user.role || null)
        // Students auto-land on their own grade
        if (user.role !== 'admin' && user.grade) {
          setCurrentGrade(user.grade)
          setView('videos')
        }
      }
    } catch (err) {
      console.error('Error loading user:', err)
    }
  }, [])

  // ── Load videos from Supabase ────────────────────────────────
  const refreshVideos = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await listVideos()
      setAllVideos(data.map(shapeVideo))
    } catch (err) {
      setLoadError(err.message || 'تعذر تحميل الفيديوهات')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refreshVideos() }, [])

  // Load admin-set overrides for this student (prep + student scope merged).
  useEffect(() => {
    if (!currentUser?.id || !currentUser?.grade || currentUser.role === 'admin') return
    let cancelled = false
    ;(async () => {
      try {
        const rows = await listEffectiveOverrides({
          studentId: currentUser.id,
          grade: currentUser.grade,
          itemType: 'video',
        })
        if (!cancelled) setVideoOverrides(reduceEffective(rows))
      } catch { /* defaults apply */ }
    })()
    return () => { cancelled = true }
  }, [currentUser])

  // ── Group by grade for the grid ──────────────────────────────
  const videosByGrade = useMemo(() => {
    const out = { 'first-prep': [], 'second-prep': [], 'third-prep': [] }
    for (const v of allVideos) {
      if (out[v.grade]) out[v.grade].push(v)
    }
    return out
  }, [allVideos])

  // ── Load per-video quiz attempts & progress when player opens ─
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!currentVideo || !currentUser?.id) {
        setQuizAttempts([])
        setProgressRows([])
        return
      }
      try {
        const [qa, pr] = await Promise.all([
          listQuizAttemptsForVideo(currentVideo.id, currentUser.id),
          listProgressForVideo(currentVideo.id, currentUser.id),
        ])
        if (!cancelled) {
          setQuizAttempts(qa)
          setProgressRows(pr)
        }
      } catch (err) {
        console.error('progress load failed', err)
      }
    }
    run()
    return () => { cancelled = true }
  }, [currentVideo, currentUser, quizTick])

  // ── Helpers ──────────────────────────────────────────────────
  const extractVideoId = (url) => {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^\&\n\r\t\v\f?]+)/
    const match = url?.match(regex)
    return match ? match[1] : null
  }

  const findBlockingQuiz = (video, part) => {
    if (!video || !video.quizzes || video.quizzes.length === 0) return null
    const partIdx = video.parts.findIndex(p => p.id === part.id)
    const applies = (qz) =>
      qz.scope === 'whole' ||
      (qz.scope === 'part' && qz.partIndex === partIdx)
    for (const qz of video.quizzes) {
      if (!applies(qz)) continue
      const att = quizAttempts.find(a => a.quiz_local_id === qz.localId)
      if (!att?.passed) return qz
    }
    return null
  }

  const viewsUsedFor = (partId) =>
    progressRows.find(p => p.part_id === partId)?.views_used || 0

  // Admin-set override beats the video's own default view_limit.
  const effectiveViewLimit = (video) => {
    const o = videoOverrides.get(video?.id)
    if (o && typeof o.attempts === 'number') return o.attempts
    return video?.viewLimit || 0
  }
  const isVideoAllowed = (video) => {
    const o = videoOverrides.get(video?.id)
    return o ? o.allowed !== false : true
  }

  const viewsRemainingFor = (partId) =>
    Math.max(0, effectiveViewLimit(currentVideo) - viewsUsedFor(partId))

  // ── Navigation ───────────────────────────────────────────────
  const selectGrade = (gradeId) => { setCurrentGrade(gradeId); setView('videos') }
  const goBackToGrades = () => {
    if (userRole !== 'admin') return // students don't go back to grade picker
    setCurrentGrade(''); setCurrentVideo(null); setSelectedPart(null); setView('grades')
  }
  const goBackToVideos = () => {
    setCurrentVideo(null); setSelectedPart(null); setView('videos')
  }
  const openVideoPlayer = (video) => {
    if (userRole !== 'admin' && !isVideoAllowed(video)) {
      return showAlertModal('الوصول محظور', 'تم تقييد هذا الفيديو من قِبَل الإدارة.')
    }
    setCurrentVideo(video); setSelectedPart(null); setView('player')
  }
  const goToAddVideo = () => {
    localStorage.setItem('selectedVideoGrade', currentGrade)
    navigate('/video-add')
  }

  const showAlertModal = (title, message) => { setAlertData({ title, message }); setShowAlert(true) }
  const closeAlertModal = () => setShowAlert(false)

  // ── Delete (admin) ───────────────────────────────────────────
  const handleDeleteVideo = async (video, e) => {
    e?.stopPropagation()
    if (!window.confirm(`حذف «${video.title}»؟`)) return
    try {
      await deleteVideo(video.id)
      setAllVideos(prev => prev.filter(v => v.id !== video.id))
    } catch (err) {
      showAlertModal('خطأ', err.message || 'تعذر الحذف')
    }
  }

  // ── Play a part ──────────────────────────────────────────────
  const playVideoPart = async (part) => {
    const now = new Date()
    const expiryDate = currentVideo.expiryTime ? new Date(currentVideo.expiryTime) : null
    if (expiryDate && now > expiryDate) {
      return showAlertModal('انتهت المدة', 'انتهت مدة تفعيل هذا الفيديو')
    }

    if (userRole !== 'admin' && viewsRemainingFor(part.id) <= 0) {
      return showAlertModal('انتهت المحاولات', 'لم تعد لديك محاولات متبقية لمشاهدة هذا الجزء')
    }

    // Quiz gate
    const blocking = findBlockingQuiz(currentVideo, part)
    if (blocking && userRole !== 'admin') {
      const att = quizAttempts.find(a => a.quiz_local_id === blocking.localId)
      const attempts = att?.attempts || 0
      const max = blocking.maxAttempts || 1
      if (!att?.passed && attempts >= max) {
        return showAlertModal(
          'انتهت محاولات الامتحان',
          `لقد استخدمت جميع المحاولات (${max}) لامتحان «${blocking.title}» ولم تجتزه. تواصل مع المعلم.`
        )
      }
      setPendingPart(part)
      setActiveQuiz(blocking)
      return
    }

    // Record a view for students (admins watch freely)
    if (userRole !== 'admin' && currentUser?.id) {
      try {
        const updated = await incrementPartView({
          student_id: currentUser.id,
          video_id: currentVideo.id,
          part_id: part.id,
        })
        setProgressRows(prev => {
          const others = prev.filter(p => p.part_id !== part.id)
          return [...others, updated]
        })
      } catch (err) {
        console.error('incrementPartView failed', err)
      }
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
    setQuizTick(t => t + 1) // re-fetch quiz_attempts so gating flips
    const part = pendingPart
    setPendingPart(null)
    if (part) setTimeout(() => playVideoPart(part), 50)
  }

  const handleQuizClose = () => {
    setActiveQuiz(null)
    setPendingPart(null)
    setQuizTick(t => t + 1) // reflect attempts count bump in UI
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="videos-page" dir="rtl">

      {/* Grade Selection (admins only — students auto-land) */}
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
            {GRADES.map((p) => {
              const count = (videosByGrade[p.id] || []).length
              return (
                <button key={p.id} className={`prep-card prep-${p.accent}`} onClick={() => selectGrade(p.id)}>
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

      {/* Videos list */}
      {view === 'videos' && (
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            {userRole === 'admin' ? (
              <button className="btn btn-outline" onClick={goBackToGrades}>
                ← العودة للصفوف
              </button>
            ) : <div style={{ width: '120px' }} />}

            <div className="text-center">
              <h1 id="gradeTitle" className="title-main gradient-text">📺 الفيديوهات التعليمية</h1>
            </div>

            {userRole === 'admin' ? (
              <button className="btn btn-primary" onClick={goToAddVideo}>
                ➕ إضافة فيديو جديد
              </button>
            ) : <div style={{ width: '120px' }} />}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem' }}></i>
              <p>جاري التحميل...</p>
            </div>
          ) : loadError ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#e53e3e' }}>
              <i className="fas fa-triangle-exclamation"></i> {loadError}
            </div>
          ) : (
            <div className="videos-grid" id="videosGrid">
              {(videosByGrade[currentGrade] || []).map((video, index) => {
                const expiry = video.expiryTime ? new Date(video.expiryTime) : null
                const isAvailable = !expiry || new Date() < expiry
                const formattedExpiry = expiry ? expiry.toLocaleDateString('ar-EG', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                }) : '—'
                const totalDuration = video.parts.reduce((sum, p) => sum + (parseInt(p.duration) || 0), 0)

                return (
                  <div key={video.id} className="vc-card" onClick={() => openVideoPlayer(video)}>
                    <div className={`vc-status-bar ${isAvailable ? 'vc-available' : 'vc-unavailable'}`}>
                      <span className="vc-status-dot" />
                      <span>{isAvailable ? 'متاح' : 'غير متاح'}</span>
                      {userRole === 'admin' && (
                        <button className="vc-delete-btn" onClick={(e) => handleDeleteVideo(video, e)}>
                          🗑 حذف
                        </button>
                      )}
                    </div>

                    <div className="vc-header">
                      <div className="vc-play-btn">▶</div>
                      <div className="vc-titles">
                        <div className="vc-title">{video.title}</div>
                        <div className="vc-desc">{video.description}</div>
                      </div>
                      <div className="vc-badge">{index + 1}</div>
                    </div>

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
                        <span className="vc-stat-value">{effectiveViewLimit(video)} مرات</span>
                      </div>
                      <div className="vc-stat">
                        <span className="vc-stat-icon">🕒</span>
                        <span className="vc-stat-label">متاح لمدة</span>
                        <span className="vc-stat-value">{video.activeHours} ساعة</span>
                      </div>
                    </div>

                    <div className="vc-footer">
                      <span>⏳</span>
                      <span>متاح حتى {formattedExpiry}</span>
                    </div>
                  </div>
                )
              })}
              {!loading && (videosByGrade[currentGrade] || []).length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px' }}>
                  <i className="fas fa-folder-open" style={{ fontSize: '2rem', color: '#a0aec0' }}></i>
                  <p>لا توجد فيديوهات في هذه المرحلة بعد</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Video player */}
      {view === 'player' && (
        <div>
          <div className="flex justify-between items-center mb-8 max-w-7xl mx-auto">
            <button className="btn btn-outline" onClick={goBackToVideos}>← العودة للفيديوهات</button>
            <div className="text-center">
              <h1 className="title-main gradient-text">{currentVideo?.title}</h1>
              <p style={{ color: 'var(--text-secondary)' }}>{currentVideo?.description}</p>
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
                <h3 className="title-section text-center" style={{ color: 'var(--text-primary)' }}>أجزاء المحاضرة</h3>
                <div id="partsList" data-quiz-tick={quizTick}>
                  {currentVideo?.parts.map((part, index) => {
                    const blocking = findBlockingQuiz(currentVideo, part)
                    const locked = !!blocking && userRole !== 'admin'
                    const remaining = userRole === 'admin' ? '∞' : viewsRemainingFor(part.id)
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
                          👁️ المتبقي: {remaining}
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

      {/* Quiz Gate */}
      {activeQuiz && currentVideo && currentUser && (
        <QuizRunner
          quiz={activeQuiz}
          videoId={currentVideo.id}
          studentId={currentUser.id}
          priorAttempt={quizAttempts.find(a => a.quiz_local_id === activeQuiz.localId)}
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
