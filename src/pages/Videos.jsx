import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
import './Videos.css'
import PrepIllustration from '../components/PrepIllustration'
import QuizRunner from '../components/QuizRunner'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog'
import YouTubePlayer from '../components/YouTubePlayer'
import { listVideos, deleteVideo } from '@backend/videosApi'
import {
  listQuizAttemptsForVideo,
  listProgressForVideo,
  incrementPartView,
  updatePartProgress,
} from '@backend/progressApi'
import { listEffectiveOverrides, reduceEffective } from '@backend/overridesApi'

export default function Videos() {
  const navigate = useNavigate()
  const { t, lang } = useI18n()

  const GRADES = [
    { id: 'first-prep',  ar: t('grades.first'), en: 'First Prep',  accent: 'green',  desc: lang === 'ar' ? 'بداية المرحلة الإعدادية والتأسيس' : 'Start of prep stage and foundation' },
    { id: 'second-prep', ar: t('grades.second'), en: 'Second Prep', accent: 'blue',   desc: lang === 'ar' ? 'تعميق المفاهيم وبناء المهارات' : 'Deepening concepts and skill building' },
    { id: 'third-prep',  ar: t('grades.third'), en: 'Third Prep',  accent: 'orange', desc: lang === 'ar' ? 'الاستعداد لاختبارات الشهادة' : 'Preparing for certificate exams' },
  ]

// Convert a DB video row (with embedded video_parts) into the shape the
// rest of the page was built around (parts[], totalParts, quizzes[]).
function shapeVideo(row) {
  const parts = (row.video_parts || []).map((p) => ({
    id: p.id,
    title: p.title,
    youtubeId: p.youtube_id || '',
    part_index: p.part_index,
    viewLimit: p.view_limit ?? null, // null = unlimited
  }))
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    grade: row.grade,
    totalParts: parts.length,
    parts,
    activeHours: row.active_hours,
    expiryTime: row.expiry_at,
    createdAt: row.created_at,
    quizzes: row.quizzes || [],
  }
}


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
      setLoadError(err.message || t('videos.loading'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refreshVideos() }, [])

  // Load admin-set overrides. For students we filter by their own id+grade
  // (RLS would do it anyway). For admins we load by the grade they're
  // currently browsing so the green/red dot reflects what students see.
  useEffect(() => {
    if (!currentUser?.id) return
    const isAdmin = currentUser.role === 'admin'
    const grade = isAdmin ? currentGrade : currentUser.grade
    if (!grade) { setVideoOverrides(new Map()); return }
    let cancelled = false
    ;(async () => {
      try {
        const rows = await listEffectiveOverrides({
          studentId: isAdmin ? '00000000-0000-0000-0000-000000000000' : currentUser.id,
          grade,
          itemType: 'video',
        })
        if (!cancelled) setVideoOverrides(reduceEffective(rows))
      } catch { /* defaults apply */ }
    })()
    return () => { cancelled = true }
  }, [currentUser, currentGrade])

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

  const isVideoAllowed = (video) => {
    const o = videoOverrides.get(video?.id)
    return o ? o.allowed !== false : true
  }

  // ── Per-part view-limit helpers ──────────────────────────────
  // Effective trial cap for a part = its own view_limit (default from
  // VideoAdd) PLUS any bonus attempts the admin granted via the override.
  // null on view_limit means "unlimited" — the override can't take that away.
  const partViewCap = (video, part) => {
    if (part.viewLimit == null) return Infinity
    const bonus = videoOverrides.get(video?.id)?.attempts || 0
    return part.viewLimit + bonus
  }

  // How many times this student has actually opened this part (rows in
  // video_progress.views_used). Returns 0 when nothing's been logged yet.
  const partViewsUsed = (part) => {
    const row = progressRows.find(r => r.part_id === part.id)
    return row?.views_used || 0
  }

  // Remaining trials for the trial-counter UI on the sidebar (Task 4).
  // Infinity stays Infinity so the UI can show "غير محدود".
  const partTrialsLeft = (video, part) => {
    const cap = partViewCap(video, part)
    if (cap === Infinity) return Infinity
    return Math.max(0, cap - partViewsUsed(part))
  }

  // Effective expiry for the current student. If the admin has set a
  // per-audience `availableHours` override (grade- or student-scoped), we
  // recompute expiry as `created_at + hours`. Otherwise we fall back to the
  // video's own `expiry_at` which was computed at create time.
  const effectiveExpiryFor = (video) => {
    const o = videoOverrides.get(video?.id)
    const hours = o?.availableHours
    if (hours && video?.createdAt) {
      return new Date(new Date(video.createdAt).getTime() + hours * 3600 * 1000)
    }
    return video?.expiryTime ? new Date(video.expiryTime) : null
  }

  const effectiveHoursFor = (video) => {
    const o = videoOverrides.get(video?.id)
    return o?.availableHours ?? video?.activeHours
  }

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
      return showAlertModal(t('common.error'), t('videos.unavailable'))
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
  const [confirmDelete, setConfirmDelete] = useState(null) // { id, title } | null

  const handleDeleteVideo = (video, e) => {
    e?.stopPropagation()
    setConfirmDelete({ id: video.id, title: video.title })
  }

  const performDeleteVideo = async () => {
    const target = confirmDelete
    if (!target) return
    try {
      await deleteVideo(target.id)
      setAllVideos(prev => prev.filter(v => v.id !== target.id))
      setConfirmDelete(null)
    } catch (err) {
      setConfirmDelete(null)
      showAlertModal(t('common.error'), err.message || t('common.error'))
    }
  }

  // ── Play a part ──────────────────────────────────────────────
  const playVideoPart = async (part) => {
    const now = new Date()
    const expiryDate = effectiveExpiryFor(currentVideo)
    if (expiryDate && now > expiryDate) {
      return showAlertModal(t('common.error'), t('videos.unavailable'))
    }

    // Trial-cap gate (per-part view limit). Admins are exempt — they need
    // to be able to preview content without burning trials.
    if (userRole !== 'admin') {
      const left = partTrialsLeft(currentVideo, part)
      if (left <= 0) {
        return showAlertModal(
          'انتهت محاولاتك',
          `لقد استخدمت كل محاولات مشاهدة هذا الجزء (${partViewCap(currentVideo, part)}). تواصل مع المعلم للحصول على محاولات إضافية.`
        )
      }
    }

    // Quiz gate
    const blocking = findBlockingQuiz(currentVideo, part)
    if (blocking && userRole !== 'admin') {
      const att = quizAttempts.find(a => a.quiz_local_id === blocking.localId)
      const attempts = att?.attempts || 0
      const max = blocking.maxAttempts || 1
      if (!att?.passed && attempts >= max) {
        return showAlertModal(
          t('common.error'),
          t('common.error')
        )
      }
      setPendingPart(part)
      setActiveQuiz(blocking)
      return
    }

    // Log the view (powers VideosReport). Not used for enforcement anymore.
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

    // The YouTubePlayer component mounts against `part.youtubeId`.
    setSelectedPart(part)
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
              <h1>{t('videos.pageTitle')}</h1>
              <p>{t('videos.pickGrade')}</p>
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
                      <span className="prep-count"><i className="fas fa-play-circle"></i> {count} {t('videos.video')}</span>
                      <span className="prep-cta">{t('common.view')} <i className={`fas ${lang === 'ar' ? 'fa-arrow-left' : 'fa-arrow-right'}`}></i></span>
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
                ← {t('common.back')}
              </button>
            ) : <div style={{ width: '120px' }} />}

            <div className="text-center">
              <h1 id="gradeTitle" className="title-main gradient-text">📺 {t('videos.pageTitle')}</h1>
            </div>

            {userRole === 'admin' ? (
              <button className="btn btn-primary" onClick={goToAddVideo}>
                ➕ {t('videos.addVideo')}
              </button>
            ) : <div style={{ width: '120px' }} />}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem' }}></i>
              <p>{t('videos.loading')}</p>
            </div>
          ) : loadError ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#e53e3e' }}>
              <i className="fas fa-triangle-exclamation"></i> {loadError}
            </div>
          ) : (
            <div className="videos-grid" id="videosGrid">
              {(videosByGrade[currentGrade] || []).map((video, index) => {
                const expiry = effectiveExpiryFor(video)
                const notExpired = !expiry || new Date() < expiry
                // Card status reflects BOTH the toggle (allowed flag) and the
                // expiry window. If either says "no", the dot turns red.
                const isAvailable = notExpired && isVideoAllowed(video)
                const hours = effectiveHoursFor(video)
                const formattedExpiry = expiry ? expiry.toLocaleDateString('ar-EG', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                }) : '—'

                return (
                  <div key={video.id} className="vc-card" onClick={() => openVideoPlayer(video)}>
                    <div className={`vc-status-bar ${isAvailable ? 'vc-available' : 'vc-unavailable'}`}>
                      <span className="vc-status-dot" />
                      <span>{isAvailable ? t('videos.available') : t('videos.unavailable')}</span>
                      {userRole === 'admin' && (
                        <button className="vc-delete-btn" onClick={(e) => handleDeleteVideo(video, e)}>
                          🗑 {t('common.delete')}
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
                        <span className="vc-stat-label">{t('videos.parts')}</span>
                        <span className="vc-stat-value">{video.totalParts} {t('common.part')}</span>
                      </div>
                      <div className="vc-stat">
                        <span className="vc-stat-icon">🕒</span>
                        <span className="vc-stat-label">{t('videos.availableFor')}</span>
                        <span className="vc-stat-value">{hours} {t('common.hours')}</span>
                      </div>
                    </div>

                    <div className="vc-footer">
                      <span>⏳</span>
                      <span>{lang === 'ar' ? 'متاح حتى' : 'Available until'} {formattedExpiry}</span>
                    </div>
                  </div>
                )
              })}
              {!loading && (videosByGrade[currentGrade] || []).length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px' }}>
                  <i className="fas fa-folder-open" style={{ fontSize: '2rem', color: '#a0aec0' }}></i>
                  <p>{t('videos.noVideos')}</p>
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
            <button className="btn btn-outline" onClick={goBackToVideos}>← {t('common.back')}</button>
            <div className="text-center">
              <h1 className="title-main gradient-text">{currentVideo?.title}</h1>
              <p style={{ color: 'var(--text-secondary)' }}>{currentVideo?.description}</p>
            </div>
            <div style={{ width: '120px' }}></div>
          </div>

          <div className="video-player-container">
            <div className="video-main">
              <div className="card" style={{ padding: 12 }}>
                {selectedPart && selectedPart.youtubeId ? (
                  <YouTubePlayer
                    key={selectedPart.id}
                    videoId={selectedPart.youtubeId}
                    initialWatchedSeconds={
                      progressRows.find(r => r.part_id === selectedPart.id)?.seconds_watched || 0
                    }
                    onProgress={({ watchedSeconds }) => {
                      // Students only — admins shouldn't pollute progress rows.
                      if (userRole === 'admin' || !currentUser?.id) return
                      // We store ACTUAL watched time (not currentTime), so a
                      // student who scrubs from 0:10 → 9:00 doesn't get 9 mins
                      // credited. The 5s skip button does count (see player).
                      updatePartProgress({
                        student_id: currentUser.id,
                        video_id: currentVideo.id,
                        part_id: selectedPart.id,
                        seconds: watchedSeconds,
                      }).then((row) => {
                        if (!row) return
                        setProgressRows(prev => {
                          const others = prev.filter(p => p.part_id !== selectedPart.id)
                          return [...others, row]
                        })
                      }).catch((e) => console.error('updatePartProgress failed', e))
                    }}
                  />
                ) : (
                  <div className="placeholder-video">
                    <div>
                      <div style={{ fontSize: '4rem', marginBottom: '16px' }}>▶️</div>
                      <h3 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{t('videos.selectPart')}</h3>
                      <p style={{ opacity: 0.8 }}>{t('videos.selectPartDesc')}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="video-sidebar">
              <div className="card">
                <h3 className="title-section text-center" style={{ color: 'var(--text-primary)' }}>{t('videos.partsTitle')}</h3>
                <div id="partsList" data-quiz-tick={quizTick}>
                  {currentVideo?.parts.map((part, index) => {
                    const blocking = findBlockingQuiz(currentVideo, part)
                    const left = partTrialsLeft(currentVideo, part)
                    const cap  = partViewCap(currentVideo, part)
                    const outOfTrials = userRole !== 'admin' && left <= 0
                    const locked = (!!blocking && userRole !== 'admin') || outOfTrials
                    const isActive = selectedPart?.id === part.id
                    const showTrials = userRole !== 'admin' && cap !== Infinity
                    // Tint the trial pill: green when 2+ left, orange at 1, red at 0
                    const trialColor = left <= 0 ? '#e53e3e' : left === 1 ? '#ed8936' : '#38a169'
                    return (
                      <div
                        key={part.id}
                        className={`part-item ${locked ? 'part-item-locked' : ''} ${isActive ? 'part-item-active' : ''}`}
                        onClick={() => playVideoPart(part)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="title-card" style={{ color: 'var(--text-primary)', flex: 1 }}>
                            {locked && <i className="fas fa-lock" style={{ marginInlineEnd: 6, color: '#ed8936' }}></i>}
                            {t('videos.partLabel')} {index + 1}: {part.title}
                          </div>
                          {showTrials && (
                            <span
                              title="المحاولات المتبقية"
                              style={{
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                padding: '4px 10px',
                                borderRadius: 999,
                                background: `${trialColor}1a`,
                                color: trialColor,
                                border: `1px solid ${trialColor}55`,
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                              }}
                            >
                              <i className="fas fa-eye" style={{ marginInlineEnd: 4 }}></i>
                              {left} / {cap}
                            </span>
                          )}
                        </div>
                        {blocking && userRole !== 'admin' && (
                          <div style={{ fontSize: '0.8rem', color: '#ed8936', marginTop: '6px', fontWeight: 700 }}>
                            <i className="fas fa-graduation-cap"></i> {t('videos.quizRequired')}: {blocking.title}
                          </div>
                        )}
                        {outOfTrials && (
                          <div style={{ fontSize: '0.8rem', color: '#e53e3e', marginTop: '6px', fontWeight: 700 }}>
                            <i className="fas fa-circle-xmark"></i> انتهت محاولاتك لهذا الجزء
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
            <button className="btn btn-primary" onClick={closeAlertModal}>{t('common.confirm')}</button>
          </div>
        </div>
      )}

      {/* Delete-confirmation modal */}
      {confirmDelete && (
        <ConfirmDeleteDialog
          title={t('videos.confirmDeleteTitle')}
          itemLabel={confirmDelete.title}
          message={t('videos.deleteWarning')}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={performDeleteVideo}
        />
      )}
    </div>
  )
}
