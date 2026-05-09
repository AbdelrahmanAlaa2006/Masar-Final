import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import './Videos.css'
import PrepIllustration from '../components/PrepIllustration'
import QuizRunner from '../components/QuizRunner'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog'
import YouTubePlayer from '../components/YouTubePlayer'
import DrivePlayer from '../components/DrivePlayer'
import BunnyPlayer from '../components/BunnyPlayer'
import ScreenGuard from '../components/ScreenGuard'
import useExitGuard, { confirmExit } from '../hooks/useExitGuard'
import { listVideos, deleteVideo, updateVideo } from '@backend/videosApi'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../utils/cache'
import {
  listQuizAttemptsForVideo,
  listProgressForVideo,
  incrementPartView,
  updatePartProgress,
} from '@backend/progressApi'
import { listEffectiveOverrides, reduceEffective } from '@backend/overridesApi'

export default function Videos() {
  const navigate = useNavigate()
  // Record this visit for the home "Continue" widget.
  useEffect(() => { import('../utils/trackVisit').then(m => m.trackVisit('videos')) }, [])

  const GRADES = [
    { id: 'first-prep',  ar: 'الصف الأول الإعدادي',  en: 'First Prep',  accent: 'green',  desc: 'بداية المرحلة الإعدادية والتأسيس' },
    { id: 'second-prep', ar: 'الصف الثاني الإعدادي', en: 'Second Prep', accent: 'blue',   desc: 'تعميق المفاهيم وبناء المهارات' },
    { id: 'third-prep',  ar: 'الصف الثالث الإعدادي',  en: 'Third Prep',  accent: 'orange', desc: 'الاستعداد لاختبارات الشهادة' },
  ]

// Convert a DB video row (with embedded video_parts) into the shape the
// rest of the page was built around (parts[], totalParts, quizzes[]).
function shapeVideo(row) {
  const parts = (row.video_parts || []).map((p) => ({
    id: p.id,
    title: p.title,
    source: p.source || 'youtube',
    youtubeId: p.youtube_id || '',
    driveId: p.drive_id || '',
    bunnyVideoId: p.bunny_video_id || '',
    bunnyLibraryId: p.bunny_library_id || null,
    durationSeconds: p.duration_seconds || null,
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
  // Quizzes the student has just passed in this session. We add to this set
  // the moment a pass fires so the immediate `playVideoPart` retry doesn't
  // re-read stale `quizAttempts` (which is fetched async) and re-show the
  // quiz that was literally just passed.
  const passedThisSessionRef = useRef(new Set())

  const [showAlert, setShowAlert] = useState(false)
  const [alertData, setAlertData] = useState({ title: '', message: '' })

  // ── Load current user ────────────────────────────────────────
  useEffect(() => {
    try {
      const user = JSON.parse(sessionStorage.getItem('masar-user'))
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
  // 60s cache: videos rarely change between navigations. Admins who just
  // added/deleted a video invalidate from VideoAdd / handleDeleteVideo.
  const refreshVideos = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await cached('videos', LIST_TTL, listVideos)
      setAllVideos(data.map(shapeVideo))
    } catch (err) {
      setLoadError(err.message || 'جاري التحميل...')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refreshVideos() }, [])

  // Load admin-set overrides — STUDENTS ONLY. Admins manage overrides
  // through ControlPanel; on the Videos page they see all videos as
  // "available" without per-student override resolution. This skips a
  // network round-trip for every admin visit.
  useEffect(() => {
    if (!currentUser?.id) return
    if (currentUser.role === 'admin') { setVideoOverrides(new Map()); return }
    const grade = currentUser.grade
    if (!grade) { setVideoOverrides(new Map()); return }
    let cancelled = false
    ;(async () => {
      try {
        const rows = await listEffectiveOverrides({
          studentId: currentUser.id,
          grade,
          group: currentUser.group || null,
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
  // Admins don't have progress/attempts of their own — skip entirely.
  // They preview videos without burning view counts (already enforced
  // below) and aren't gated by quizzes.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!currentVideo || !currentUser?.id) {
        setQuizAttempts([])
        setProgressRows([])
        passedThisSessionRef.current = new Set()
        return
      }
      if (currentUser.role === 'admin') {
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
      // Just-passed quizzes are remembered in a ref so the immediate retry
      // in handleQuizPass doesn't re-block on an un-refreshed cache.
      if (passedThisSessionRef.current.has(qz.localId)) continue
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
    // Confirm before leaving an actively-playing part so a mistouch
    // doesn't burn a view-counter (or close mid-video for the student).
    // Admins are exempt — they preview without using attempts.
    if (selectedPart && userRole !== 'admin') {
      if (!confirmExit('هل تريد الخروج من الفيديو؟ المحاولة قد تُحتسب.')) return
    }
    setCurrentVideo(null); setSelectedPart(null); setView('videos')
  }
  const openVideoPlayer = (video) => {
    if (userRole !== 'admin' && !isVideoAllowed(video)) {
      return showAlertModal('خطأ', 'غير متاح')
    }
    setCurrentVideo(video); setSelectedPart(null); setView('player')
  }
  // Lock screen mode while a student is actively watching a part:
  //   • exit guard intercepts back-button + tab-close
  //   • body class hides the global Header / Footer so the only way out
  //     is the page's own back button (which calls confirmExit)
  // Admins are exempt — they preview videos without view-counter cost.
  const isWatching = view === 'player' && !!selectedPart && userRole !== 'admin'
  useExitGuard({
    active: isWatching,
    message: 'هل تريد الخروج من الفيديو؟ المحاولة قد تُحتسب إذا غادرت الآن.',
  })
  useEffect(() => {
    if (!isWatching) return
    document.body.classList.add('is-watching-video')
    return () => document.body.classList.remove('is-watching-video')
  }, [isWatching])

  const goToAddVideo = () => {
    localStorage.setItem('selectedVideoGrade', currentGrade)
    navigate('/video-add')
  }

  const showAlertModal = (title, message) => { setAlertData({ title, message }); setShowAlert(true) }
  const closeAlertModal = () => setShowAlert(false)

  // ── Edit / Delete (admin) ─────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(null) // { id, title } | null
  const [editVideo, setEditVideo] = useState(null)         // video object | null

  const handleEditVideo = (video, e) => {
    e?.stopPropagation()
    setEditVideo(video)
  }

  const handleDeleteVideo = (video, e) => {
    e?.stopPropagation()
    setConfirmDelete({ id: video.id, title: video.title })
  }

  const saveVideoEdit = async (patch) => {
    if (!editVideo) return
    try {
      const updated = await updateVideo(editVideo.id, patch)
      invalidateCache('videos')
      // Patch the in-memory list so the card reflects the change
      // immediately without a re-fetch round-trip.
      setAllVideos(prev => prev.map(v => v.id === editVideo.id
        ? { ...v, title: updated.title, description: updated.description,
            grade: updated.grade, activeHours: updated.active_hours,
            expiryTime: updated.expiry_at }
        : v))
      setEditVideo(null)
    } catch (err) {
      showAlertModal('خطأ', err.message || 'تعذر حفظ التعديلات')
    }
  }

  const performDeleteVideo = async () => {
    const target = confirmDelete
    if (!target) return
    try {
      await deleteVideo(target.id)
      invalidateCache('videos')
      setAllVideos(prev => prev.filter(v => v.id !== target.id))
      setConfirmDelete(null)
    } catch (err) {
      setConfirmDelete(null)
      showAlertModal('خطأ', err.message || 'حدث خطأ')
    }
  }

  // ── Play a part ──────────────────────────────────────────────
  const playVideoPart = async (part) => {
    const now = new Date()
    const expiryDate = effectiveExpiryFor(currentVideo)
    if (expiryDate && now > expiryDate) {
      return showAlertModal('خطأ', 'انتهت صلاحية إتاحة هذا الفيديو')
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
          'انتهت محاولات الامتحان',
          `لقد استنفدت جميع المحاولات (${max}) لامتحان "${blocking.title}" ولم تنجح. يُرجى التواصل مع المعلم.`
        )
      }
      setPendingPart(part)
      setActiveQuiz(blocking)
      return
    }

    // NOTE: we no longer increment views_used here. Counting on click was
    // double-charging students who navigated in/out of the player without
    // actually watching. The view is now logged ONCE on exit (when the
    // selected part changes or the player closes) — see the cleanup effect
    // below.

    // The YouTubePlayer component mounts against `part.youtubeId`.
    setSelectedPart(part)
  }

  // ── Count an attempt on EXIT, not on click ────────────────────
  // The cleanup function fires when:
  //   • the student picks a different part,
  //   • the player view closes (currentVideo / selectedPart -> null),
  //   • or the page unmounts.
  // We snapshot the part/video/student IDs so the API call uses a stable
  // reference even if the underlying state has already moved on.
  useEffect(() => {
    if (!selectedPart || userRole === 'admin' || !currentUser?.id || !currentVideo?.id) return
    const partId    = selectedPart.id
    const studentId = currentUser.id
    const videoId   = currentVideo.id
    return () => {
      // student_id derived from auth.uid() server-side; arg ignored.
      incrementPartView({ video_id: videoId, part_id: partId })
        .then((updated) => {
          if (!updated) return
          setProgressRows((prev) => {
            const others = prev.filter((p) => p.part_id !== partId)
            return [...others, updated]
          })
        })
        .catch((err) => console.error('exit-time view increment failed', err))
    }
  }, [selectedPart, currentUser, currentVideo, userRole])

  const handleQuizPass = () => {
    // Remember the pass synchronously — findBlockingQuiz reads this ref so
    // the immediate retry below doesn't get tricked into re-prompting while
    // the new `quiz_attempts` row is still in flight.
    if (activeQuiz?.localId != null) {
      passedThisSessionRef.current.add(activeQuiz.localId)
    }
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
  // Anti-screenshot label — student name + phone tiled across the video
  // page only when actually playing a part. Admins are exempt so they
  // can debug freely; the rest of the app stays unguarded so students
  // can screenshot bug reports etc.
  const guardActive = view === 'player' && !!selectedPart && userRole !== 'admin'
  const guardLabel = (() => {
    if (!currentUser) return ''
    return `${currentUser.name || ''} · ${currentUser.phone || ''}`
  })()

  return (
    <div className="videos-page" dir="rtl">
      {/* strict=false → cursor leaving the player or a brief alt-tab
          won't black the page out. Only real screenshot-keys arm the
          blackout for the videos page; exams keep the strict default. */}
      <ScreenGuard active={guardActive} label={guardLabel} strict={false} />

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
                      <span>{isAvailable ? 'متاح' : 'غير متاح'}</span>
                      {userRole === 'admin' && (
                        <>
                          <button className="vc-delete-btn" onClick={(e) => handleEditVideo(video, e)} style={{ marginInlineEnd: 6 }}>
                            ✏️ تعديل
                          </button>
                          <button className="vc-delete-btn" onClick={(e) => handleDeleteVideo(video, e)}>
                            🗑 حذف
                          </button>
                        </>
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
                        <span className="vc-stat-icon">🕒</span>
                        <span className="vc-stat-label">متاح لمدة</span>
                        <span className="vc-stat-value">{hours} ساعة</span>
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
          <div className="vid-player-header max-w-7xl mx-auto">
            <button className="btn btn-outline vid-player-back" onClick={goBackToVideos}>← العودة للفيديوهات</button>
            <div className="vid-player-titles">
              <h1 className="title-main gradient-text">{currentVideo?.title}</h1>
              <p style={{ color: 'var(--text-secondary)' }}>{currentVideo?.description}</p>
            </div>
            <div className="vid-player-spacer" />
          </div>

          <div className="video-player-container">
            <div className="video-main">
              <div className="card" style={{ padding: 12 }}>
                {selectedPart && (selectedPart.youtubeId || selectedPart.driveId || selectedPart.bunnyVideoId) ? (
                  (() => {
                    // Both players share the same onProgress contract, so
                    // we hoist the handler and just swap the component.
                    const handleProgress = ({ watchedSeconds }) => {
                      if (userRole === 'admin' || !currentUser?.id) return
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
                    }
                    const seed = progressRows.find(r => r.part_id === selectedPart.id)?.seconds_watched || 0
                    return (
                      <PlayerFacade key={selectedPart.id} part={selectedPart}>
                        {selectedPart.source === 'bunny' ? (
                          <BunnyPlayer
                            partId={selectedPart.id}
                            initialWatchedSeconds={seed}
                            onProgress={handleProgress}
                          />
                        ) : selectedPart.source === 'drive' ? (
                          <DrivePlayer
                            driveId={selectedPart.driveId}
                            initialWatchedSeconds={seed}
                            onProgress={handleProgress}
                          />
                        ) : (
                          <YouTubePlayer
                            videoId={selectedPart.youtubeId}
                            initialWatchedSeconds={seed}
                            onProgress={handleProgress}
                          />
                        )}
                      </PlayerFacade>
                    )
                  })()
                ) : (
                  <div className="placeholder-video">
                    <div>
                      <div style={{ fontSize: '4rem', marginBottom: '16px' }}>▶️</div>
                      <h3 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>اختر جزء لبدء المشاهدة</h3>
                      <p style={{ opacity: 0.8 }}>اضغط على أحد الأجزاء من القائمة الجانبية</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="video-sidebar">
              <div className="card">
                <h3 className="title-section text-center" style={{ color: 'var(--text-primary)' }}>أجزاء المحاضرة</h3>
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
                            الجزء {index + 1}: {part.title}
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
                            <i className="fas fa-graduation-cap"></i> امتحان مطلوب: {blocking.title}
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
            <button className="btn btn-primary" onClick={closeAlertModal}>حسناً</button>
          </div>
        </div>
      )}

      {/* Delete-confirmation modal */}
      {confirmDelete && (
        <ConfirmDeleteDialog
          title="تأكيد حذف الفيديو"
          itemLabel={confirmDelete.title}
          message="سيتم حذف الفيديو وجميع أجزائه وبيانات تقدّم الطلاب المرتبطة به نهائياً. لا يمكن التراجع عن هذا الإجراء."
          onCancel={() => setConfirmDelete(null)}
          onConfirm={performDeleteVideo}
        />
      )}

      {/* Edit-video modal (basic metadata only) */}
      {editVideo && (
        <EditVideoModal
          video={editVideo}
          onCancel={() => setEditVideo(null)}
          onSave={saveVideoEdit}
        />
      )}
    </div>
  )
}

/* ── Inline edit modal for an existing video ───────────────────
   Edits only metadata: title / description / grade / active_hours.
   Editing parts/quizzes is intentionally NOT supported here — those
   are nested arrays. To change them, delete the video and re-add. */
function EditVideoModal({ video, onCancel, onSave }) {
  const [title, setTitle] = useState(video.title || '')
  const [desc,  setDesc]  = useState(video.description || '')
  const [grade, setGrade] = useState(video.grade || 'first-prep')
  const [hours, setHours] = useState(video.activeHours || 24)
  const [busy,  setBusy]  = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (!title.trim()) return
    setBusy(true)
    try {
      await onSave({
        title: title.trim(),
        description: desc.trim(),
        grade,
        active_hours: parseInt(hours, 10) || 24,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal show" onClick={onCancel}>
      <div className="modal-content" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onCancel}>&times;</button>
        <h3 className="title-card mb-4">تعديل الفيديو</h3>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>
            <span style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>العنوان</span>
            <input
              type="text" value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e0', borderRadius: 8 }}
            />
          </label>
          <label>
            <span style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>الوصف</span>
            <textarea
              rows={3} value={desc}
              onChange={(e) => setDesc(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e0', borderRadius: 8 }}
            />
          </label>
          <label>
            <span style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>الصف الدراسي</span>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e0', borderRadius: 8 }}
            >
              <option value="first-prep">الصف الأول الإعدادي</option>
              <option value="second-prep">الصف الثاني الإعدادي</option>
              <option value="third-prep">الصف الثالث الإعدادي</option>
            </select>
          </label>
          <label>
            <span style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>مدة التفعيل (ساعة)</span>
            <input
              type="number" min="1" value={hours}
              onChange={(e) => setHours(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e0', borderRadius: 8 }}
            />
            <small style={{ display: 'block', marginTop: 4, color: '#718096' }}>
              يُحتسب موعد الانتهاء من تاريخ الإنشاء + هذه المدة.
            </small>
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start', marginTop: 8 }}>
            <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>إلغاء</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? '⏳ جاري الحفظ...' : '✓ حفظ التعديلات'}
            </button>
          </div>
        </form>
        <p style={{ marginTop: 12, fontSize: 12, color: '#718096' }}>
          ملاحظة: لتعديل أجزاء الفيديو أو الامتحانات داخله، احذف الفيديو وأعد إنشاءه.
        </p>
      </div>
    </div>
  )
}

/* PlayerFacade — render a static thumbnail + custom play button until
   the user clicks. ONLY THEN do we mount the real player (which loads
   the YouTube IFrame API / Bunny iframe / Drive viewer). For YouTube
   videos the thumbnail is fetched directly from i.ytimg.com — one
   image request instead of the ~20 requests YouTube's embed normally
   pulls (iframe_api, widgetapi, fonts, lottie, telemetry, etc.).

   This is the standard "lite-youtube-embed" pattern but extended to
   cover Drive + Bunny too. The wrapped child only mounts when the
   admin/student actually clicks ▶. */
function PlayerFacade({ part, children }) {
  const [armed, setArmed] = useState(false)
  if (armed) return children

  // Pick the best free thumbnail per source.
  let poster = null
  if (part.source === 'youtube' && part.youtubeId) {
    // hqdefault always exists for any public/unlisted video; smaller +
    // faster than maxresdefault (which 404s for some videos).
    poster = `https://i.ytimg.com/vi/${part.youtubeId}/hqdefault.jpg`
  }
  // Drive & Bunny don't expose a public thumbnail without auth; we
  // render the gradient placeholder. (Bunny's preview URL needs a
  // signed token, not worth a request just for a poster.)

  return (
    <button
      type="button"
      onClick={() => setArmed(true)}
      aria-label="تشغيل الفيديو"
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16/9',
        background: poster
          ? `#000 center/cover no-repeat url(${poster})`
          : 'linear-gradient(135deg, #1f2937, #4338ca)',
        border: 0,
        borderRadius: 8,
        overflow: 'hidden',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.25)',
        transition: 'background .15s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'rgba(255,255,255,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
          color: '#7c3aed', fontSize: 28,
        }}>
          <i className="fas fa-play" aria-hidden="true"></i>
        </span>
      </div>
      <div style={{
        position: 'absolute', bottom: 12, insetInlineStart: 12,
        background: 'rgba(0,0,0,0.65)', color: '#fff',
        padding: '4px 10px', borderRadius: 6,
        fontSize: 12, fontWeight: 600,
      }}>
        {part.source === 'bunny' ? 'Bunny Stream' :
         part.source === 'drive' ? 'Google Drive' :
         'YouTube'}
      </div>
    </button>
  )
}
