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
import ConfirmExitDialog from '../components/ConfirmExitDialog'
import VideoComments from '../components/VideoComments'
import { listVideos, deleteVideo, updateVideo } from '@backend/videosApi'
import { listNotes, createNote, deleteNote } from '@backend/videoNotesApi'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../utils/cache'
import { useAuth } from '../contexts/AuthContext'
import QuestionImagePicker from '../components/QuestionImagePicker'
import { notify } from '../utils/notify'
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


  const { user: currentUser, role: userRole } = useAuth()

  const [currentGrade, setCurrentGrade] = useState(() => {
    if (currentUser && currentUser.role !== 'admin' && currentUser.grade) {
      return currentUser.grade
    }
    return ''
  })
  const [currentVideo, setCurrentVideo] = useState(null)
  const [selectedPart, setSelectedPart] = useState(null)
  const [view, setView] = useState(() => {
    if (currentUser && currentUser.role !== 'admin' && currentUser.grade) {
      return 'videos'
    }
    return 'grades'
  })

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

  // Smart Video Notes state
  const [currentTime, setCurrentTime] = useState(0)
  const [notes, setNotes] = useState([])
  const [noteContent, setNoteContent] = useState('')
  const [seekTrigger, setSeekTrigger] = useState(null)
  const [loadingNotes, setLoadingNotes] = useState(false)
  // Quizzes the student has just passed in this session. We add to this set
  // the moment a pass fires so the immediate `playVideoPart` retry doesn't
  // re-read stale `quizAttempts` (which is fetched async) and re-show the
  // quiz that was literally just passed.
  const passedThisSessionRef = useRef(new Set())

  // Load notes for the active video part
  useEffect(() => {
    if (view === 'player' && selectedPart && currentUser?.id) {
      setLoadingNotes(true)
      listNotes(selectedPart.id)
        .then((data) => {
          setNotes(data)
          setLoadingNotes(false)
        })
        .catch((err) => {
          console.error('Failed to load notes:', err)
          setLoadingNotes(false)
        })
    } else {
      setNotes([])
      setCurrentTime(0)
      setNoteContent('')
    }
  }, [selectedPart?.id, view, currentUser?.id])

  const [showAlert, setShowAlert] = useState(false)
  const [alertData, setAlertData] = useState({ title: '', message: '' })
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [showLockModal, setShowLockModal] = useState(false)

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
  }, [currentUser?.id, currentUser?.grade, currentUser?.group, currentUser?.role])

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
  }, [currentVideo?.id, currentUser?.id, quizTick])

  // ── Helpers ──────────────────────────────────────────────────
  const findBlockingQuiz = (video, part) => {
    if (!video || !video.quizzes || video.quizzes.length === 0) return null
    const partIdx = video.parts.findIndex(p => p.id === part.id)
    const applies = (qz) =>
      (qz.scope === 'whole' || (qz.scope === 'part' && Number(qz.partIndex) === partIdx)) &&
      qz.triggerType !== 'timestamp'
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
      setShowExitConfirm(true)
    } else {
      setCurrentVideo(null); setSelectedPart(null); setView('videos')
    }
  }

  const handleSaveNote = async (e) => {
    e.preventDefault()
    if (!noteContent || !noteContent.trim()) return
    if (!selectedPart || !currentVideo || !currentUser?.id) return

    try {
      const newNote = await createNote({
        videoId: currentVideo.id,
        partId: selectedPart.id,
        content: noteContent,
        timestampSeconds: currentTime,
        profileId: currentUser.id
      })
      setNotes(prev => [...prev, newNote].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds))
      setNoteContent('')
    } catch (err) {
      console.error('Failed to create note:', err)
      notify('تعذر حفظ الملاحظة', 'error')
    }
  }

  const handleDeleteNote = async (noteId) => {
    try {
      await deleteNote(noteId)
      setNotes(prev => prev.filter(n => n.id !== noteId))
    } catch (err) {
      console.error('Failed to delete note:', err)
      notify('تعذر حذف الملاحظة', 'error')
    }
  }

  const handleSeekToNote = (seconds) => {
    setSeekTrigger({ seconds, timestamp: Date.now() })
  }

  const handleTimeUpdate = (seconds) => {
    setCurrentTime(seconds)

    if (userRole === 'admin' || !currentUser?.id || !selectedPart || !currentVideo) return

    // Count attempt when student watches 5 seconds of the video part
    if (seconds >= 5 && !viewCountedRef.current) {
      viewCountedRef.current = true
      incrementPartView({ video_id: currentVideo.id, part_id: selectedPart.id })
        .then((updated) => {
          if (!updated) return
          setProgressRows((prev) => {
            const others = prev.filter((p) => p.part_id !== selectedPart.id)
            return [...others, updated]
          })
        })
        .catch((err) => console.error('youtube view increment failed', err))
    }

    // Trigger timestamp-based quizzes
    if (activeQuiz) return

    const partIdx = currentVideo.parts.findIndex(p => p.id === selectedPart.id)
    if (partIdx !== -1 && currentVideo.quizzes && currentVideo.quizzes.length > 0) {
      for (const qz of currentVideo.quizzes) {
        if (qz.triggerType === 'timestamp' && qz.scope === 'part' && Number(qz.partIndex) === partIdx) {
          const tSec = parseInt(qz.timestampSeconds, 10)
          if (Number.isFinite(tSec) && seconds >= tSec) {
            // Check if student has already passed the quiz
            const passed = passedThisSessionRef.current.has(qz.localId) ||
                           quizAttempts.some(a => a.quiz_local_id === qz.localId && a.passed)
            if (!passed) {
              const att = quizAttempts.find(a => a.quiz_local_id === qz.localId)
              const attempts = att?.attempts || 0
              const max = qz.maxAttempts || 1

              if (attempts >= max) {
                // Out of attempts, show alert and seek back to prevent infinite loop
                showAlertModal(
                  'انتهت محاولات الامتحان',
                  `لقد استنفدت جميع المحاولات (${max}) لامتحان "${qz.title}" ولم تنجح. يُرجى التواصل مع المعلم.`
                )
                const targetSeek = Math.max(0, tSec - 5)
                handleSeekToNote(targetSeek)
                return
              } else {
                // Playback paused by setting activeQuiz, which triggers forcePause on player components
                setPendingPart(selectedPart)
                setActiveQuiz(qz)
                return
              }
            }
          }
        }
      }
    }
  }
  const openVideoPlayer = (video) => {
    if (userRole !== 'admin' && currentUser?.is_active === false) {
      setShowLockModal(true)
      return
    }
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
  const exitGuard = useExitGuard({
    active: isWatching,
    message: 'هل تريد الخروج من الفيديو؟ المحاولة قد تُحتسب إذا غادرت الآن.',
    onExitAttempt: () => setShowExitConfirm(true),
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
      await updateVideo(editVideo.id, patch)
      invalidateCache('videos')
      // Refresh the entire videos list from Supabase so all nested parts, IDs, and quizzes are perfectly in sync!
      await refreshVideos()
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

  // ── Count an attempt after 5 seconds of watching ──────────────
  const viewCountedRef = useRef(false)

  useEffect(() => {
    viewCountedRef.current = false

    if (!selectedPart || userRole === 'admin' || !currentUser?.id || !currentVideo?.id) return

    // For non-YouTube parts (Google Drive, Bunny), we count the attempt after a 5-second delay
    if (selectedPart.source !== 'youtube') {
      const timer = setTimeout(() => {
        if (!viewCountedRef.current) {
          viewCountedRef.current = true
          incrementPartView({ video_id: currentVideo.id, part_id: selectedPart.id })
            .then((updated) => {
              if (!updated) return
              setProgressRows((prev) => {
                const others = prev.filter((p) => p.part_id !== selectedPart.id)
                return [...others, updated]
              })
            })
            .catch((err) => console.error('non-youtube view increment failed', err))
        }
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [selectedPart?.id, currentUser?.id, currentVideo?.id, userRole])

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
    // If it was a timestamp quiz and they didn't pass, seek them back 5 seconds to prevent bypass
    if (activeQuiz && activeQuiz.triggerType === 'timestamp') {
      const passed = passedThisSessionRef.current.has(activeQuiz.localId) ||
                     quizAttempts.some(a => a.quiz_local_id === activeQuiz.localId && a.passed)
      if (!passed) {
        const targetSeek = Math.max(0, (activeQuiz.timestampSeconds || 0) - 5)
        handleSeekToNote(targetSeek)
      }
    }
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
                            onTimeUpdate={handleTimeUpdate}
                            forcePause={!!activeQuiz}
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
                            seekTrigger={seekTrigger}
                            onTimeUpdate={handleTimeUpdate}
                            forcePause={!!activeQuiz}
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
              {currentVideo && (
                <VideoComments videoId={currentVideo.id} currentUser={currentUser} />
              )}
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

              {/* Personal Smart Notes Card */}
              {true && (
                <div className="card notes-card mt-6" style={{ direction: 'rtl' }}>
                  <h3 className="title-section text-center" style={{ color: 'var(--text-primary)', marginBottom: 12 }}>
                    <i className="fas fa-book-open" style={{ marginInlineEnd: 8, color: 'var(--educational-primary)' }}></i>
                    ملاحظات وتوقيت الفيديو
                  </h3>

                  {selectedPart?.source !== 'youtube' ? (
                    <div className="notes-warning-box">
                      <i className="fas fa-triangle-exclamation" style={{ fontSize: '1.2rem', marginBottom: 8, color: '#e0a96d' }}></i>
                      <p>الملاحظات الذكية وتحديد التوقيت مدعومة حالياً فقط لفيديوهات اليوتيوب.</p>
                    </div>
                  ) : (
                    <>
                      {/* Note add form */}
                      {userRole === 'admin' && (
                        <form onSubmit={handleSaveNote} className="note-form mb-4">
                          <div className="note-input-container">
                            <textarea
                              className="note-textarea"
                              placeholder="اكتب ملاحظة هنا أثناء المشاهدة..."
                              value={noteContent}
                              onChange={(e) => setNoteContent(e.target.value)}
                              rows={3}
                            />
                            <div className="note-form-actions">
                              <button
                                type="button"
                                className="btn btn-outline btn-sm note-timestamp-btn"
                                title="التوقيت الحالي"
                              >
                                <i className="fas fa-clock" style={{ marginInlineEnd: 4 }}></i>
                                {formatTime(currentTime)}
                              </button>
                              <button type="submit" className="btn btn-primary btn-sm note-submit-btn" disabled={!noteContent.trim()}>
                                حفظ الملاحظة
                              </button>
                            </div>
                          </div>
                        </form>
                      )}

                      {/* Notes list */}
                      <div className="notes-list-container">
                        {loadingNotes ? (
                          <div className="text-center p-4" style={{ color: 'var(--text-muted)' }}>
                            <i className="fas fa-spinner fa-spin" style={{ marginInlineEnd: 6 }}></i>
                            جاري تحميل الملاحظات...
                          </div>
                        ) : notes.length === 0 ? (
                          <div className="text-center p-6 notes-empty-state">
                            <i className="far fa-note-sticky" style={{ fontSize: '2rem', display: 'block', marginBottom: 8, opacity: 0.5 }}></i>
                            <span>لا توجد ملاحظات محفوظة في هذا الجزء بعد.</span>
                          </div>
                        ) : (
                          <div className="notes-list">
                            {notes.map((note) => (
                              <div key={note.id} className="note-item">
                                <div className="note-header">
                                  <button
                                    onClick={() => handleSeekToNote(note.timestamp_seconds)}
                                    className="note-time-badge"
                                    title="انتقل إلى هذا الوقت"
                                  >
                                    <i className="fas fa-play" style={{ fontSize: '0.65rem', marginInlineEnd: 4 }}></i>
                                    {formatTime(note.timestamp_seconds)}
                                  </button>
                                  {userRole === 'admin' && (
                                    <button
                                      onClick={() => handleDeleteNote(note.id)}
                                      className="note-delete-btn"
                                      title="حذف الملاحظة"
                                    >
                                      <i className="fas fa-trash"></i>
                                    </button>
                                  )}
                                </div>
                                <p className="note-text">{note.content}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
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

      {/* Locked Modal for Inactive Students */}
      {showLockModal && (
        <div className="modal show" onClick={() => setShowLockModal(false)}>
          <div className="modal-content" style={{ maxWidth: '500px', textAlign: 'center', direction: 'rtl', padding: '32px 24px' }} onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowLockModal(false)}>&times;</button>
            <div style={{ fontSize: '3.5rem', color: '#e0a96d', marginBottom: '16px' }}>
              <i className="fas fa-lock"></i>
            </div>
            <h3 className="title-card mb-4" style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>المحتوى مغلق</h3>
            <p className="mb-6" style={{ lineHeight: '1.8', fontSize: '0.95rem' }}>
              عذرًا، حسابك قيد المراجعة والموافقة حاليًا من قبل الإدارة. سيتم تفعيل حسابك قريبًا جدًا (خلال 24-48 ساعة). 
              إذا قمت بالدفع بالفعل، يمكنك الانتظار أو تأكيد عملية الدفع من صفحة المدفوعات.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => { setShowLockModal(false); navigate('/payments') }}>
                بوابة التأكيد (المدفوعات)
              </button>
              <button className="btn btn-outline" onClick={() => setShowLockModal(false)}>إغلاق</button>
            </div>
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

      {/* Custom Confirm Exit Dialog */}
      {showExitConfirm && (
        <ConfirmExitDialog
          title="هل تريد الخروج من الفيديو؟"
          message="لو خرجت دلوقتي، المحاولة قد تُحتسب عليك ويتم خصمها من رصيدك. هل أنت متأكد من الخروج؟"
          confirmText="نعم، خروج"
          cancelText="إلغاء"
          onConfirm={() => {
            setShowExitConfirm(false)
            exitGuard.disable()
            if (exitGuard.isPopState()) {
              exitGuard.clearPopState()
              setCurrentVideo(null)
              setSelectedPart(null)
              setView('videos')
              window.history.go(-2) // Go back past sentinel and Videos player view
            } else {
              setCurrentVideo(null)
              setSelectedPart(null)
              setView('videos')
              window.history.back() // Pop the sentinel off the history stack
            }
          }}
          onCancel={() => {
            setShowExitConfirm(false)
          }}
        />
      )}
    </div>
  )
}

/* ── Inline edit modal for an existing video ───────────────────
   Upgraded to allow dynamic editing of video parts, Google Drive / Youtube
   auto-extraction, Bunny Stream uploading, and inline gating quizzes. */
function extractYouTubeId(input) {
  if (!input) return ''
  const s = String(input).trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s
  try {
    const u = new URL(s)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') return u.pathname.slice(1, 12)
    if (host.endsWith('youtube.com')) {
      if (u.pathname === '/watch') return (u.searchParams.get('v') || '').slice(0, 11)
      const m = u.pathname.match(/\/(embed|shorts|v)\/([a-zA-Z0-9_-]{11})/)
      if (m) return m[2]
    }
  } catch { /* not a URL */ }
  return ''
}

function extractDriveId(input) {
  if (!input) return ''
  const s = String(input).trim()
  if (/^[A-Za-z0-9_-]{15,}$/.test(s)) return s
  try {
    const u = new URL(s)
    if (!u.hostname.includes('drive.google.com')) return ''
    const m = u.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/)
    if (m) return m[1]
    const idParam = u.searchParams.get('id')
    if (idParam) return idParam
  } catch { /* not a URL */ }
  return ''
}

const makeQuestion = () => ({
  qid: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  question: '',
  image: '',
  options: ['', ''],
  answers: [0],
  points: 1,
  isMultiple: false,
})

const makeQuiz = () => ({
  localId: `qz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  title: '',
  scope: 'whole',
  partIndex: '',
  passingQuestions: '',
  maxAttempts: 1,
  questions: [makeQuestion()],
})

function BunnyUploader({ part, title, onChange }) {
  const [file, setFile]      = useState(null)
  const [pct, setPct]        = useState(0)
  const [status, setStatus]  = useState(part.bunnyVideoId ? 'done' : 'idle')
  const [error, setError]    = useState('')

  const startUpload = async () => {
    if (!file) return
    setError('')
    setStatus('uploading')
    setPct(0)
    try {
      const { createBunnyUpload, uploadBunnyVideo } = await import('@backend/bunnyApi')
      const params = await createBunnyUpload({ title })
      onChange({ bunnyVideoId: params.guid, bunnyLibraryId: params.libraryId })
      await uploadBunnyVideo(file, params, {
        onProgress: (p) => setPct(p),
      })
      setStatus('done')
    } catch (err) {
      setError(err?.message || 'فشل رفع الفيديو')
      setStatus('error')
    }
  }

  const reset = () => {
    setFile(null)
    setPct(0)
    setStatus('idle')
    setError('')
    onChange({ bunnyVideoId: '', bunnyLibraryId: '' })
  }

  return (
    <>
      <div className="edit-field" style={{ marginBottom: 12 }}>
        <label>ملف الفيديو</label>
        {status === 'done' && part.bunnyVideoId ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
            border: '1px solid #16a34a', borderRadius: 10, background: '#f0fdf4',
            color: '#15803d',
          }}>
            <i className="fas fa-circle-check"></i>
            <span style={{ flex: 1 }}>تم رفع الفيديو بنجاح إلى Bunny.</span>
            <button type="button" className="btn-link" onClick={reset}
              style={{ background: 'none', border: 0, color: '#15803d', textDecoration: 'underline', cursor: 'pointer' }}>
              استبدال
            </button>
          </div>
        ) : (
          <>
            <label htmlFor={`bunny-file-edit-${part.id}`} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              border: '1px dashed rgba(167, 139, 250, 0.25)', borderRadius: 10, background: 'rgba(255,255,255,0.02)',
              cursor: status === 'uploading' ? 'not-allowed' : 'pointer',
              opacity: status === 'uploading' ? 0.6 : 1,
              color: '#f7fafc', fontWeight: 500,
            }}>
              <i className="fas fa-cloud-arrow-up" style={{ color: '#f97316' }}></i>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file ? file.name : 'اختر ملف الفيديو من جهازك'}
              </span>
              {file && (
                <span style={{ fontSize: 12, color: '#a0aec0' }}>
                  {(file.size / (1024 * 1024)).toFixed(1)} MB
                </span>
              )}
            </label>
            <input
              id={`bunny-file-edit-${part.id}`}
              type="file"
              accept="video/*"
              style={{ display: 'none' }}
              disabled={status === 'uploading'}
              onChange={(e) => {
                const f = e.target.files?.[0] || null
                setFile(f)
                setStatus(f ? 'ready' : 'idle')
                setPct(0)
                setError('')
                onChange({ bunnyVideoId: '', bunnyLibraryId: '' })
              }}
            />
            {status === 'ready' && (
              <button type="button"
                onClick={startUpload}
                style={{
                  alignSelf: 'flex-start',
                  marginTop: 8, padding: '8px 14px',
                  background: '#f97316', color: '#fff',
                  border: 0, borderRadius: 8, fontWeight: 600, cursor: 'pointer',
                }}>
                <i className="fas fa-cloud-arrow-up"></i> ابدأ الرفع إلى Bunny
              </button>
            )}
            {status === 'uploading' && (
              <>
                <div style={{ marginTop: 8, height: 6, background: '#edf2f7', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    width: `${pct}%`, height: '100%',
                    background: 'linear-gradient(90deg, #f59e0b, #f97316)',
                    transition: 'width .15s ease',
                  }} />
                </div>
                <span style={{ fontSize: 12, color: '#a0aec0' }}>
                  جاري الرفع... {pct}% — يمكنك متابعة تعبئة باقي الحقول.
                </span>
              </>
            )}
            {status === 'error' && (
              <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: 13 }}>
                <i className="fas fa-triangle-exclamation"></i> {error}
                <button type="button" onClick={startUpload}
                  style={{ marginInlineStart: 12, background: 'none', border: 0, color: '#991b1b', textDecoration: 'underline', cursor: 'pointer' }}>
                  إعادة المحاولة
                </button>
              </div>
            )}
            <small style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 6, display: 'block' }}>
              الفيديو يُرفع مباشرة إلى Bunny Stream من جهازك — لا يمر بخادمنا.
            </small>
          </>
        )}
      </div>

      <div className="edit-field" style={{ marginBottom: 12 }}>
        <label>مدة الفيديو (بالدقائق) — اختياري</label>
        <input
          type="number"
          min="0"
          step="0.5"
          className="edit-input"
          value={part.durationMinutes}
          onChange={(e) => onChange({ durationMinutes: e.target.value })}
        />
        <small style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
          سيتم اكتشاف المدة تلقائياً عند تشغيل الفيديو لأول مرة إن تركتها فارغة.
        </small>
      </div>
    </>
  )
}

function parseTimestampToSeconds(str) {
  if (!str) return null
  const s = String(str).trim()
  const parts = s.split(':').map(Number)
  if (parts.some(Number.isNaN)) return null
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

function formatSecondsToTimestamp(sec) {
  if (sec == null || Number.isNaN(sec)) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function EditVideoModal({ video, onCancel, onSave }) {
  const [title, setTitle] = useState(video.title || '')
  const [desc,  setDesc]  = useState(video.description || '')
  const [grade, setGrade] = useState(video.grade || 'first-prep')
  const [hours, setHours] = useState(video.activeHours || 24)
  const [busy,  setBusy]  = useState(false)

  // Initialize parts state, preserving the database `id` of existing parts
  const [videoParts, setVideoParts] = useState(() => {
    return (video.parts || []).map((p) => ({
      id: p.id, // existing DB serial ID
      title: p.title || '',
      source: p.source || 'youtube',
      videoId: p.youtubeId || '',
      driveId: p.driveId || '',
      bunnyVideoId: p.bunnyVideoId || '',
      bunnyLibraryId: p.bunnyLibraryId || '',
      durationMinutes: p.durationSeconds ? String(parseFloat((p.durationSeconds / 60).toFixed(2))) : '',
      viewLimit: p.viewLimit ?? 3,
    }))
  })

  // Initialize quizzes state
  const [quizzes, setQuizzes] = useState(() => {
    return (video.quizzes || []).map((qz) => ({
      localId: qz.localId || `qz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: qz.title || '',
      scope: qz.scope || 'whole',
      partIndex: qz.scope === 'part' ? (qz.partIndex ?? '') : '',
      passingQuestions: qz.passingQuestions ?? '',
      maxAttempts: qz.maxAttempts ?? 1,
      triggerType: qz.triggerType || 'gate',
      timestamp: qz.timestamp || (qz.timestampSeconds != null ? formatSecondsToTimestamp(qz.timestampSeconds) : ''),
      timestampSeconds: qz.timestampSeconds ?? null,
      questions: (qz.questions || []).map((q) => ({
        qid: q.qid || `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        question: q.question || '',
        image: q.image || '',
        options: Array.isArray(q.options) && q.options.length >= 2 ? [...q.options] : ['', ''],
        answers: Array.isArray(q.answers) && q.answers.length > 0 ? [...q.answers] : [0],
        points: Math.max(1, parseInt(q.points, 10) || 1),
        isMultiple: !!q.isMultiple,
      })),
    }))
  })

  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState(null)

  const addPart = () => {
    const nextId = `new_part_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setVideoParts(prev => [
      ...prev,
      {
        id: nextId,
        title: '',
        source: 'youtube',
        videoId: '',
        driveId: '',
        bunnyVideoId: '',
        bunnyLibraryId: '',
        durationMinutes: '',
        viewLimit: 3,
      }
    ])
  }

  const removePart = (id) => {
    setVideoParts(prev => prev.filter(p => p.id !== id))
  }

  const updatePart = (id, field, value) => {
    setVideoParts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  const addQuiz = () => setQuizzes(prev => [...prev, makeQuiz()])
  const removeQuiz = (localId) => setQuizzes(prev => prev.filter(q => q.localId !== localId))
  const updateQuiz = (localId, field, value) =>
    setQuizzes(prev => prev.map(q => q.localId === localId ? { ...q, [field]: value } : q))

  const mapQuestions = (quizId, fn) =>
    setQuizzes(prev => prev.map(qz =>
      qz.localId === quizId ? { ...qz, questions: fn(qz.questions) } : qz
    ))

  const addQuestion = (quizId) =>
    mapQuestions(quizId, qs => [...qs, makeQuestion()])

  const removeQuestion = (quizId, qid) =>
    mapQuestions(quizId, qs => qs.length > 1 ? qs.filter(q => q.qid !== qid) : qs)

  const updateQuestionField = (quizId, qid, field, value) =>
    mapQuestions(quizId, qs => qs.map(q => q.qid === qid ? { ...q, [field]: value } : q))

  const addQuestionOption = (quizId, qid) =>
    mapQuestions(quizId, qs => qs.map(q =>
      q.qid === qid ? { ...q, options: [...q.options, ''] } : q
    ))

  const removeQuestionOption = (quizId, qid, optIdx) =>
    mapQuestions(quizId, qs => qs.map(q => {
      if (q.qid !== qid || q.options.length <= 2) return q
      const options = q.options.filter((_, i) => i !== optIdx)
      const answers = q.answers
        .filter(a => a !== optIdx)
        .map(a => a > optIdx ? a - 1 : a)
      return { ...q, options, answers: answers.length ? answers : [0] }
    }))

  const updateQuestionOption = (quizId, qid, optIdx, value) =>
    mapQuestions(quizId, qs => qs.map(q => {
      if (q.qid !== qid) return q
      const options = q.options.map((o, i) => i === optIdx ? value : o)
      return { ...q, options }
    }))

  const toggleMultiple = (quizId, qid) =>
    mapQuestions(quizId, qs => qs.map(q => {
      if (q.qid !== qid) return q
      const isMultiple = !q.isMultiple
      const answers = isMultiple ? q.answers : [q.answers[0] ?? 0]
      return { ...q, isMultiple, answers }
    }))

  const setCorrectAnswer = (quizId, qid, optIdx, checked) =>
    mapQuestions(quizId, qs => qs.map(q => {
      if (q.qid !== qid) return q
      let answers
      if (q.isMultiple) {
        answers = checked
          ? Array.from(new Set([...q.answers, optIdx]))
          : q.answers.filter(a => a !== optIdx)
        if (answers.length === 0) answers = [optIdx]
      } else {
        answers = [optIdx]
      }
      return { ...q, answers }
    }))

  const buildPayload = () => {
    if (!title.trim()) {
      notify('يرجى إدخال عنوان الفيديو', { type: 'warning' })
      return null
    }

    if (videoParts.length === 0) {
      notify('يرجى إضافة جزء واحد على الأقل للمحاضرة', { type: 'warning' })
      return null
    }

    if (videoParts.some(p => !p.title.trim())) {
      notify('يرجى ملء عنوان كل جزء', { type: 'warning' })
      return null
    }

    // Validate sources
    for (let i = 0; i < videoParts.length; i++) {
      const p = videoParts[i]
      if (p.source === 'bunny') {
        if (!p.bunnyVideoId || !p.bunnyVideoId.trim()) {
          notify(`الجزء ${i + 1}: ارفع ملف الفيديو إلى Bunny قبل الحفظ`, { type: 'warning' })
          return null
        }
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.bunnyVideoId.trim())) {
          notify(`الجزء ${i + 1}: معرّف Bunny غير صالح`, { type: 'warning' })
          return null
        }
      } else if (p.source === 'drive') {
        if (!p.driveId || !p.driveId.trim()) {
          notify(`الجزء ${i + 1}: أدخل معرّف ملف Google Drive`, { type: 'warning' })
          return null
        }
        if (!/^[A-Za-z0-9_-]{15,}$/.test(p.driveId.trim())) {
          notify(`الجزء ${i + 1}: معرّف Drive غير صالح`, { type: 'warning' })
          return null
        }
      } else {
        if (!p.videoId || !p.videoId.trim()) {
          notify(`الجزء ${i + 1}: أدخل معرّف فيديو يوتيوب`, { type: 'warning' })
          return null
        }
        if (!/^[a-zA-Z0-9_-]{11}$/.test(p.videoId.trim())) {
          notify(`الجزء ${i + 1}: معرّف يوتيوب غير صالح — تأكد أنه 11 حرفًا`, { type: 'warning' })
          return null
        }
      }
    }

    // Validate quizzes
    const parsedQuizzes = []
    for (let i = 0; i < quizzes.length; i++) {
      const qz = quizzes[i]
      const label = `الامتحان ${i + 1}`
      const questions = Array.isArray(qz.questions) ? qz.questions : []
      if (questions.length === 0) {
        notify(`${label}: أضف سؤالاً واحداً على الأقل`, { type: 'warning' })
        return null
      }
      for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi]
        if (!q.question.trim()) {
          notify(`${label} — السؤال ${qi + 1}: اكتب نص السؤال`, { type: 'warning' })
          return null
        }
        if (q.options.length < 2 || q.options.some(o => !String(o).trim())) {
          notify(`${label} — السؤال ${qi + 1}: أدخل اختيارين على الأقل وكلها مكتوبة`, { type: 'warning' })
          return null
        }
        if (!Array.isArray(q.answers) || q.answers.length === 0) {
          notify(`${label} — السؤال ${qi + 1}: حدد الإجابة الصحيحة`, { type: 'warning' })
          return null
        }
      }
      const triggerType = qz.triggerType || 'gate'
      let timestamp = qz.timestamp || ''
      let timestampSeconds = null

      if (triggerType === 'timestamp') {
        if (qz.scope !== 'part' || qz.partIndex === '' || qz.partIndex == null) {
          notify(`${label}: الاختبارات أثناء المشاهدة يجب أن تكون مرتبطة بجزء محدد من الفيديو`, { type: 'warning' })
          return null
        }
        if (!timestamp.trim()) {
          notify(`${label}: يرجى تحديد وقت ظهور الاختبار (مثال 02:30)`, { type: 'warning' })
          return null
        }
        const parsedSecs = parseTimestampToSeconds(timestamp)
        if (parsedSecs === null || parsedSecs < 0) {
          notify(`${label}: صيغة وقت ظهور الاختبار غير صالحة. يرجى إدخال الصيغة كـ (دقيقة:ثانية) مثل 02:30`, { type: 'warning' })
          return null
        }
        timestampSeconds = parsedSecs
      } else {
        if (qz.scope === 'part' && (qz.partIndex === '' || qz.partIndex == null)) {
          notify(`${label}: اختر الجزء المرتبط بالامتحان`, { type: 'warning' })
          return null
        }
      }

      const pqRaw = parseInt(qz.passingQuestions)
      const pq = Number.isNaN(pqRaw) ? questions.length : pqRaw
      if (pq < 1 || pq > questions.length) {
        notify(`${label}: عدد أسئلة النجاح يجب أن يكون بين 1 و ${questions.length}`, { type: 'warning' })
        return null
      }
      const maxAttRaw = parseInt(qz.maxAttempts)
      const maxAtt = Number.isNaN(maxAttRaw) ? 1 : maxAttRaw
      if (maxAtt < 1) {
        notify(`${label}: عدد المحاولات يجب أن يكون 1 على الأقل`, { type: 'warning' })
        return null
      }
      const cleanQuestions = questions.map(q => ({
        question: q.question.trim(),
        image: q.image || null,
        options: q.options.map(o => String(o).trim()),
        answers: [...q.answers].sort((a, b) => a - b),
        points: Math.max(1, parseInt(q.points, 10) || 1),
        isMultiple: !!q.isMultiple,
      }))
      const totalPoints = cleanQuestions.reduce((s, q) => s + q.points, 0)
      parsedQuizzes.push({
        localId: qz.localId,
        title: qz.title.trim() || label,
        scope: qz.scope,
        partIndex: qz.scope === 'part' ? parseInt(qz.partIndex) : null,
        passingQuestions: pq,
        maxAttempts: maxAtt,
        triggerType,
        timestamp: triggerType === 'timestamp' ? timestamp.trim() : '',
        timestampSeconds: triggerType === 'timestamp' ? timestampSeconds : null,
        questions: cleanQuestions,
        totalPoints,
      })
    }

    return {
      title: title.trim(),
      description: desc.trim() || null,
      grade,
      active_hours: parseInt(hours, 10) || 24,
      quizzes: parsedQuizzes,
      parts: videoParts.map(p => {
        const src = p.source === 'drive' ? 'drive'
                  : p.source === 'bunny' ? 'bunny'
                  : 'youtube'
        const mins = parseFloat(p.durationMinutes)
        const libId = parseInt(p.bunnyLibraryId, 10)

        const formattedPart = {
          title: p.title.trim(),
          source: src,
          youtube_id:       src === 'youtube' ? p.videoId.trim() : null,
          drive_id:         src === 'drive'   ? p.driveId.trim() : null,
          bunny_video_id:   src === 'bunny'   ? p.bunnyVideoId.trim() : null,
          bunny_library_id: src === 'bunny' && Number.isFinite(libId) && libId > 0 ? libId : null,
          duration_seconds: (src === 'drive' || src === 'bunny') && mins > 0
            ? Math.round(mins * 60)
            : null,
          view_limit: p.viewLimit,
        }

        // CRITICAL: Preserve database serial ID for existing video_parts so views logic (video_progress) remains intact!
        if (typeof p.id === 'number') {
          formattedPart.id = p.id
        }

        return formattedPart
      })
    }
  }

  const previewVideo = () => {
    const payload = buildPayload()
    if (!payload) return
    setPreviewData(payload)
    setShowPreview(true)
    setTimeout(() => {
      document.querySelector('.edit-preview-block')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    const payload = buildPayload()
    if (!payload) return

    setBusy(true)
    try {
      await onSave(payload)
      notify('تم تعديل الفيديو بنجاح!', { type: 'success' })
    } catch (err) {
      notify(err.message || 'حدث خطأ أثناء تعديل الفيديو', { type: 'warning' })
    } finally {
      setBusy(false)
    }
  }

  const gradeNames = {
    'first-prep': 'الصف الأول الإعدادي',
    'second-prep': 'الصف الثاني الإعدادي',
    'third-prep': 'الصف الثالث الإعدادي'
  }

  return (
    <div className="modal show active" onClick={onCancel} style={{ display: 'flex', overflowY: 'auto', padding: '20px 10px', alignItems: 'flex-start', justifyContent: 'center' }}>
      <style>{`
        .edit-video-modal-content {
          background-color: var(--card-bg, #1a1f2e);
          padding: 30px;
          border-radius: 20px;
          max-width: 960px;
          width: 95%;
          box-shadow: var(--shadow-hover);
          margin: auto;
          position: relative;
          direction: rtl;
          border: 1px solid rgba(167, 139, 250, 0.18);
          animation: fadeInUp 0.4s ease;
          color: var(--text-color, #f7fafc);
        }
        body.dark .edit-video-modal-content {
          background-color: #1a1f2e;
          border-color: rgba(167, 139, 250, 0.18);
        }
        .edit-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(167, 139, 250, 0.15);
          padding-bottom: 15px;
          margin-bottom: 20px;
        }
        .edit-modal-header h3 {
          margin: 0;
          font-size: 1.6rem;
          font-weight: 700;
          background: linear-gradient(45deg, #6366f1, #8b5cf6, #06b6d4);
          background-clip: text;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .edit-close-btn {
          background: transparent;
          border: none;
          color: var(--text-secondary, #a0aec0);
          font-size: 2rem;
          cursor: pointer;
          line-height: 1;
          transition: color 0.2s;
        }
        .edit-close-btn:hover {
          color: #f56565;
        }
        .edit-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 768px) {
          .edit-grid {
            grid-template-columns: 1fr;
          }
        }
        .edit-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .edit-field label {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-color, #e2e8f0);
        }
        .edit-input, .edit-select, .edit-textarea {
          width: 100%;
          padding: 12px 14px;
          font-size: 0.95rem;
          border-radius: 10px;
          border: 1.5px solid rgba(99, 102, 241, 0.18);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-color, #f7fafc);
          font-family: 'Cairo', sans-serif;
          transition: all 0.2s;
        }
        body.dark .edit-input, body.dark .edit-select, body.dark .edit-textarea {
          background: #0f172a;
          border-color: rgba(167, 139, 250, 0.22);
          color: #e2e8f0;
        }
        .edit-input:focus, .edit-select:focus, .edit-textarea:focus {
          outline: none;
          border-color: #8b5cf6;
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
        }
        .edit-textarea {
          height: 70px;
          resize: vertical;
        }
        .section-divider-title {
          font-size: 1.25rem;
          font-weight: 700;
          margin: 30px 0 15px;
          color: #8b5cf6;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(139, 92, 246, 0.2);
          padding-bottom: 8px;
        }
        .part-block-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
          position: relative;
        }
        body.dark .part-block-card {
          background: #1e2538;
          border-color: rgba(167, 139, 250, 0.1);
        }
        .part-block-card:hover {
          border-color: rgba(139, 92, 246, 0.4);
        }
        .part-block-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
          padding-bottom: 10px;
          margin-bottom: 15px;
        }
        .edit-btn-sm {
          padding: 6px 12px;
          font-size: 0.8rem;
          font-weight: 600;
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.05);
          color: var(--text-color, #e2e8f0);
          cursor: pointer;
          font-family: 'Cairo', sans-serif;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .edit-btn-sm:hover {
          background: #6366f1;
          color: white;
        }
        .edit-btn-sm.active {
          background: #10b981;
          color: white;
          border-color: #10b981;
        }
        .edit-btn-delete {
          color: #f87171;
          border-color: rgba(248, 113, 113, 0.2);
        }
        .edit-btn-delete:hover {
          background: #f87171;
          color: white;
          border-color: #f87171;
        }
        .source-picker-flex {
          display: flex;
          gap: 10px;
          margin-top: 5px;
        }
        .source-option-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.02);
          color: var(--text-color, #e2e8f0);
          cursor: pointer;
          font-family: 'Cairo', sans-serif;
          font-weight: 600;
          transition: all 0.2s;
        }
        .source-option-btn:hover {
          background: rgba(255, 255, 255, 0.07);
        }
        .source-option-btn.selected-yt {
          background: rgba(239, 68, 68, 0.15);
          border-color: #ef4444;
          color: #fca5a5;
        }
        .source-option-btn.selected-drive {
          background: rgba(66, 133, 244, 0.15);
          border-color: #4285f4;
          color: #93c5fd;
        }
        .source-option-btn.selected-bunny {
          background: rgba(249, 115, 22, 0.15);
          border-color: #f97316;
          color: #fdba74;
        }
        .edit-opts-wrapper {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin: 12px 0;
        }
        .edit-opt-item {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .edit-ans-wrapper {
          display: flex;
          flex-wrap: wrap;
          gap: 15px;
          margin-top: 10px;
          background: rgba(255, 255, 255, 0.02);
          padding: 10px;
          border-radius: 8px;
        }
        .edit-ans-item {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }
        .edit-action-row {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 30px;
          border-top: 1px solid rgba(255,255,255,0.1);
          padding-top: 20px;
        }
        .quizzes-section-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(167, 139, 250, 0.2);
          padding-bottom: 8px;
          margin: 30px 0 15px;
        }
        .qb-questions-box {
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          padding: 15px;
          margin-top: 15px;
          background: rgba(255, 255, 255, 0.01);
        }
        .qb-q-block {
          border-right: 3px solid #8b5cf6;
          background: rgba(255,255,255,0.02);
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 15px;
        }
        @media (max-width: 480px) {
          .edit-video-modal-content {
            padding: 16px 12px;
            width: 98%;
          }
          .edit-modal-header h3 {
            font-size: 1.25rem;
          }
          .part-block-card {
            padding: 12px;
          }
          .source-picker-flex {
            flex-direction: column;
            gap: 8px;
          }
          .source-option-btn {
            width: 100%;
            padding: 10px;
          }
        }
      `}</style>
      <div className="edit-video-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="edit-modal-header">
          <h3>تعديل الفيديو والمحاضرة</h3>
          <button className="edit-close-btn" onClick={onCancel}>&times;</button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Metadata Section */}
          <div className="edit-grid">
            <div className="edit-field">
              <label>العنوان</label>
              <input type="text" className="edit-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="edit-field">
              <label>الصف الدراسي</label>
              <select className="edit-select" value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="first-prep">الصف الأول الإعدادي</option>
                <option value="second-prep">الصف الثاني الإعدادي</option>
                <option value="third-prep">الصف الثالث الإعدادي</option>
              </select>
            </div>
          </div>

          <div className="edit-grid">
            <div className="edit-field">
              <label>الوصف</label>
              <textarea className="edit-textarea" value={desc} onChange={(e) => setDesc(e.target.value)} />
            </div>
            <div className="edit-field">
              <label>مدة التفعيل (ساعة)</label>
              <input type="number" min="1" className="edit-input" value={hours} onChange={(e) => setHours(e.target.value)} required />
              <small style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                مدة الإتاحة التلقائية للطلاب من تاريخ النشر.
              </small>
            </div>
          </div>

          {/* Parts Manager Section */}
          <div className="section-divider-title">
            <span>🎬 أجزاء الفيديو ({videoParts.length})</span>
            <button type="button" className="edit-btn-sm" onClick={addPart}>
              <i className="fas fa-plus"></i> إضافة جزء جديد
            </button>
          </div>

          <div className="edit-parts-list">
            {videoParts.map((part, index) => (
              <div className="part-block-card" key={part.id}>
                <div className="part-block-header">
                  <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#8b5cf6' }}>
                    الجزء {index + 1} {part.title ? `— ${part.title}` : ''}
                  </span>
                  <button type="button" className="edit-btn-sm edit-btn-delete" onClick={() => removePart(part.id)} disabled={videoParts.length <= 1}>
                    <i className="fas fa-trash"></i> حذف الجزء
                  </button>
                </div>

                <div className="edit-grid" style={{ marginBottom: 12 }}>
                  <div className="edit-field">
                    <label>عنوان الجزء</label>
                    <input
                      type="text"
                      className="edit-input"
                      value={part.title}
                      onChange={(e) => updatePart(part.id, 'title', e.target.value)}
                      placeholder="مثال: مقدمة المحاضرة"
                      required
                    />
                  </div>
                  <div className="edit-field">
                    <label>عدد المحاولات لكل طالب</label>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      className="edit-input"
                      value={part.viewLimit ?? 3}
                      onChange={(e) => {
                        const n = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1))
                        updatePart(part.id, 'viewLimit', n)
                      }}
                    />
                  </div>
                </div>

                <div className="edit-field" style={{ marginBottom: 12 }}>
                  <label>مصدر الفيديو</label>
                  <div className="source-picker-flex">
                    <button
                      type="button"
                      className={`source-option-btn ${part.source === 'youtube' ? 'selected-yt' : ''}`}
                      onClick={() => updatePart(part.id, 'source', 'youtube')}
                    >
                      <i className="fab fa-youtube" style={{ color: '#ef4444' }}></i>
                      <span>YouTube</span>
                    </button>
                    <button
                      type="button"
                      className={`source-option-btn ${part.source === 'drive' ? 'selected-drive' : ''}`}
                      onClick={() => updatePart(part.id, 'source', 'drive')}
                    >
                      <i className="fab fa-google-drive" style={{ color: '#4285f4' }}></i>
                      <span>Google Drive</span>
                    </button>
                    <button
                      type="button"
                      className={`source-option-btn ${part.source === 'bunny' ? 'selected-bunny' : ''}`}
                      onClick={() => updatePart(part.id, 'source', 'bunny')}
                    >
                      <i className="fas fa-cloud" style={{ color: '#f97316' }}></i>
                      <span>Bunny Stream</span>
                    </button>
                  </div>
                </div>

                {part.source === 'bunny' ? (
                  <BunnyUploader
                    part={part}
                    title={title ? `${title} — ${part.title || `الجزء ${index + 1}`}` : (part.title || 'video')}
                    onChange={(patch) => Object.entries(patch).forEach(([k, v]) => updatePart(part.id, k, v))}
                  />
                ) : part.source === 'youtube' ? (
                  <div className="edit-field" style={{ marginBottom: 12 }}>
                    <label>رابط أو معرّف فيديو يوتيوب (11 حرفاً)</label>
                    <input
                      type="text"
                      className="edit-input"
                      value={part.videoId}
                      onChange={(e) => {
                        const v = e.target.value
                        const extracted = extractYouTubeId(v)
                        updatePart(part.id, 'videoId', extracted || v)
                      }}
                      placeholder="مثال: dQw4w9WgXcQ"
                      required
                    />
                    <small style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      سيتم استخراج معرّف الفيديو تلقائياً إذا قمت بلصق الرابط بالكامل.
                    </small>
                  </div>
                ) : (
                  <div className="edit-grid" style={{ marginBottom: 12 }}>
                    <div className="edit-field">
                      <label>رابط أو معرّف ملف Google Drive</label>
                      <input
                        type="text"
                        className="edit-input"
                        value={part.driveId}
                        onChange={(e) => {
                          const v = e.target.value
                          const extracted = extractDriveId(v)
                          updatePart(part.id, 'driveId', extracted || v)
                        }}
                        placeholder="ألصق رابط Drive أو معرّف الملف"
                        required
                      />
                      <small style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 4 }}>
                        <strong>مهم:</strong> يجب أن يكون ملف الفيديو في Drive مضبوطاً على «أي شخص لديه الرابط يمكنه العرض».
                      </small>
                    </div>
                    <div className="edit-field">
                      <label>مدة الفيديو (بالدقائق) — اختياري</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        className="edit-input"
                        value={part.durationMinutes}
                        onChange={(e) => updatePart(part.id, 'durationMinutes', e.target.value)}
                        placeholder="مثال: 15"
                      />
                      <small style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                        تُستخدم لتقرير المشاهدة. إن تركتها فارغة فستُكتشف عند التشغيل.
                      </small>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Quizzes Gating Builder */}
          <div className="quizzes-section-head">
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#8b5cf6' }}>
              📝 اختبارات بوابة المشاهدة (اختياري)
            </h3>
            <button type="button" className="edit-btn-sm" onClick={addQuiz}>
              ➕ إضافة اختبار
            </button>
          </div>

          {quizzes.length === 0 ? (
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12, padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              لا توجد اختبارات بوابة مضافة لهذه المحاضرة حالياً. الطلاب سيشاهدون المحاضرة مباشرة دون حواجز امتحانات.
            </div>
          ) : (
            <div className="quizzes-wrapper">
              {quizzes.map((qz, qi) => {
                const questionCount = qz.questions.length
                const totalPoints = qz.questions.reduce((sum, q) => sum + (parseInt(q.points, 10) || 1), 0)

                return (
                  <div className="part-block-card" key={qz.localId}>
                    <div className="part-block-header">
                      <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#10b981' }}>
                        اختبار {qi + 1}: {qz.title || 'امتحان بدون عنوان'}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginInlineStart: 10 }}>
                        {questionCount} سؤال · {totalPoints} نقطة
                      </span>
                      <button type="button" className="edit-btn-sm edit-btn-delete" onClick={() => removeQuiz(qz.localId)}>
                        <i className="fas fa-trash"></i> حذف الاختبار
                      </button>
                    </div>

                    <div className="edit-grid" style={{ marginBottom: 12 }}>
                      <div className="edit-field">
                        <label>عنوان الاختبار</label>
                        <input
                          type="text"
                          className="edit-input"
                          value={qz.title}
                          onChange={(e) => updateQuiz(qz.localId, 'title', e.target.value)}
                          placeholder="مثال: اختبار سريع قبل الجزء الثاني"
                          required
                        />
                      </div>
                      <div className="edit-field">
                        <label>محاولات الحل المتاحة للطالب</label>
                        <input
                          type="number"
                          min="1"
                          className="edit-input"
                          value={qz.maxAttempts}
                          onChange={(e) => updateQuiz(qz.localId, 'maxAttempts', parseInt(e.target.value, 10) || 1)}
                          required
                        />
                      </div>
                    </div>

                    <div className="edit-grid" style={{ marginBottom: 12 }}>
                      <div className="edit-field">
                        <label>طريقة تفعيل الاختبار</label>
                        <select
                          className="edit-select"
                          value={qz.triggerType || 'gate'}
                          onChange={(e) => {
                            const val = e.target.value
                            const patch = { triggerType: val }
                            if (val === 'timestamp') {
                              patch.scope = 'part'
                            }
                            updateQuiz(qz.localId, 'triggerType', val)
                            if (patch.scope) {
                              updateQuiz(qz.localId, 'scope', patch.scope)
                            }
                          }}
                        >
                          <option value="gate">قبل البدء بالمشاهدة (بوابة دخول)</option>
                          <option value="timestamp">أثناء المشاهدة (عند وقت محدد)</option>
                        </select>
                      </div>

                      {qz.triggerType === 'timestamp' ? (
                        <div className="edit-field">
                          <label>وقت ظهور الاختبار (دقيقة:ثانية)</label>
                          <input
                            type="text"
                            placeholder="مثال: 02:30"
                            className="edit-input"
                            value={qz.timestamp || ''}
                            onChange={(e) => updateQuiz(qz.localId, 'timestamp', e.target.value)}
                            required
                          />
                          <small style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                            الوقت الذي سيظهر عنده الاختبار أثناء تشغيل الجزء.
                          </small>
                        </div>
                      ) : (
                        <div className="edit-field">
                          <label>نطاق الاختبار</label>
                          <select
                            className="edit-select"
                            value={qz.scope}
                            onChange={(e) => updateQuiz(qz.localId, 'scope', e.target.value)}
                          >
                            <option value="whole">قبل بدء مشاهدة الفيديو بالكامل</option>
                            <option value="part">قبل بدء جزء محدد من المحاضرة</option>
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="edit-grid" style={{ marginBottom: 12 }}>
                      {(qz.scope === 'part' || qz.triggerType === 'timestamp') ? (
                        <>
                          <div className="edit-field">
                            <label>الجزء المرتبط بالاختبار</label>
                            <select
                              className="edit-select"
                              value={qz.partIndex}
                              onChange={(e) => updateQuiz(qz.localId, 'partIndex', e.target.value)}
                              required
                            >
                              <option value="">-- اختر الجزء --</option>
                              {videoParts.map((p, pidx) => (
                                <option key={p.id} value={pidx}>
                                  الجزء {pidx + 1} {p.title ? `— ${p.title}` : ''}
                                </option>
                              ))}
                            </select>
                            {qz.triggerType === 'timestamp' && qz.partIndex !== '' && videoParts[parseInt(qz.partIndex)]?.source === 'drive' && (
                              <small style={{ color: '#d97706', fontSize: 11, marginTop: 4 }}>
                                ⚠️ فيديوهات Google Drive لا تدعم تفعيل الاختبار أثناء المشاهدة.
                              </small>
                            )}
                          </div>
                          <div className="edit-field">
                            <label>الأسئلة المطلوبة للنجاح</label>
                            <input
                              type="number"
                              min="1"
                              max={questionCount}
                              className="edit-input"
                              value={qz.passingQuestions}
                              onChange={(e) => updateQuiz(qz.localId, 'passingQuestions', e.target.value)}
                              placeholder={`الافتراضي: الكل (${questionCount})`}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="edit-field">
                            <label>الأسئلة المطلوبة للنجاح</label>
                            <input
                              type="number"
                              min="1"
                              max={questionCount}
                              className="edit-input"
                              value={qz.passingQuestions}
                              onChange={(e) => updateQuiz(qz.localId, 'passingQuestions', e.target.value)}
                              placeholder={`الافتراضي: الكل (${questionCount})`}
                            />
                          </div>
                          <div className="edit-field" />
                        </>
                      )}
                    </div>

                    {/* Questions box */}
                    <div className="qb-questions-box">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#a78bfa' }}>
                          أسئلة هذا الاختبار
                        </h4>
                        <button type="button" className="edit-btn-sm" onClick={() => addQuestion(qz.localId)}>
                          ➕ سؤال جديد
                        </button>
                      </div>

                      {qz.questions.map((q, qidx) => (
                        <div className="qb-q-block" key={q.qid}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <span style={{ fontWeight: 800, color: '#8b5cf6' }}>سؤال {qidx + 1}</span>
                            <button
                              type="button"
                              className={`edit-btn-sm ${q.isMultiple ? 'active' : ''}`}
                              onClick={() => toggleMultiple(qz.localId, q.qid)}
                            >
                              <i className={`fas ${q.isMultiple ? 'fa-check-double' : 'fa-check'}`}></i>
                              {q.isMultiple ? ' متعدد الإجابات' : ' إجابة واحدة'}
                            </button>

                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginInlineStart: 10 }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>النقاط:</span>
                              <input
                                type="number"
                                min="1"
                                className="edit-input"
                                style={{ width: 60, padding: '4px 8px', fontSize: '0.8rem' }}
                                value={q.points}
                                onChange={(e) => updateQuestionField(qz.localId, q.qid, 'points', Math.max(1, parseInt(e.target.value, 10) || 1))}
                              />
                            </div>

                            <button type="button" className="edit-btn-sm" style={{ marginInlineStart: 8 }} onClick={() => addQuestionOption(qz.localId, q.qid)}>
                              ➕ إضافة خيار
                            </button>
                            <button type="button" className="edit-btn-sm" onClick={() => removeQuestionOption(qz.localId, q.qid, q.options.length - 1)} disabled={q.options.length <= 2}>
                              ➖ حذف خيار
                            </button>

                            <button type="button" className="edit-btn-sm edit-btn-delete" style={{ marginRight: 'auto' }} onClick={() => removeQuestion(qz.localId, q.qid)} disabled={qz.questions.length <= 1}>
                              🗑 حذف
                            </button>
                          </div>

                          <div className="edit-field" style={{ marginBottom: 10 }}>
                            <textarea
                              className="edit-textarea"
                              value={q.question}
                              onChange={(e) => updateQuestionField(qz.localId, q.qid, 'question', e.target.value)}
                              placeholder="اكتب نص السؤال هنا..."
                              required
                            />
                          </div>

                          {/* Optional Question Image illustration picker */}
                          <div style={{ marginBottom: 12 }}>
                            <QuestionImagePicker
                              value={q.image}
                              onChange={(url) => updateQuestionField(qz.localId, q.qid, 'image', url)}
                            />
                          </div>

                          {/* Option builder inputs */}
                          <div className="edit-opts-wrapper">
                            {q.options.map((opt, oidx) => (
                              <div className="edit-opt-item" key={oidx}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
                                  {String.fromCharCode(65 + oidx)}
                                </span>
                                <input
                                  type="text"
                                  className="edit-input"
                                  style={{ padding: '8px 12px' }}
                                  value={opt}
                                  onChange={(e) => updateQuestionOption(qz.localId, q.qid, oidx, e.target.value)}
                                  placeholder={`الخيار ${oidx + 1}`}
                                  required
                                />
                              </div>
                            ))}
                          </div>

                          {/* Answer Picker checkboxes/radios */}
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10b981', marginTop: 10 }}>
                            ✓ حدد الاختيار الصحيح:
                          </div>
                          <div className="edit-ans-wrapper">
                            {q.options.map((opt, oidx) => {
                              const isChecked = q.answers.includes(oidx)
                              return (
                                <label className="edit-ans-item" key={oidx}>
                                  <input
                                    type={q.isMultiple ? 'checkbox' : 'radio'}
                                    name={`edit-correct-ans-${q.qid}`}
                                    checked={isChecked}
                                    onChange={(e) => setCorrectAnswer(qz.localId, q.qid, oidx, e.target.checked)}
                                    style={{ width: 16, height: 16, accentColor: '#10b981' }}
                                  />
                                  <span>{opt.trim() || `الخيار ${String.fromCharCode(65 + oidx)}`}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Action Row */}
          <div className="edit-action-row">
            <button type="button" className="btn btn-outline" style={{ marginTop: 0, padding: '10px 20px', fontSize: 14 }} onClick={onCancel} disabled={busy}>
              إلغاء
            </button>
            <button type="button" className="btn btn-preview" style={{ marginTop: 0, padding: '10px 20px', fontSize: 14, color: '#fbbf24', borderColor: '#fbbf24' }} onClick={previewVideo} disabled={busy}>
              🔍 معاينة التعديلات
            </button>
            <button type="submit" className="btn btn-primary" style={{ marginTop: 0, padding: '10px 20px', fontSize: 14 }} disabled={busy}>
              {busy ? '⏳ جاري الحفظ...' : '✓ حفظ التغييرات'}
            </button>
          </div>
        </form>

        {/* Live Preview Block */}
        {showPreview && previewData && (
          <div className="preview edit-preview-block" style={{ marginTop: 30, background: 'rgba(255, 255, 255, 0.01)', border: '1px solid rgba(255, 255, 255, 0.08)', padding: 20, borderRadius: 12 }}>
            <h2><i className="fas fa-magnifying-glass" style={{ color: '#fbbf24', marginInlineEnd: 8 }}></i> معاينة تفاصيل التعديل</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.9rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 15, marginBottom: 20 }}>
              <div><strong>العنوان:</strong> {previewData.title}</div>
              <div><strong>الوصف:</strong> {previewData.description || 'بدون وصف'}</div>
              <div><strong>الصف:</strong> {gradeNames[previewData.grade]}</div>
              <div><strong>مدة التفعيل:</strong> {previewData.active_hours} ساعة</div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <h4 style={{ color: '#8b5cf6', borderBottom: '1px solid rgba(139, 92, 246, 0.2)', paddingBottom: 6 }}>أجزاء المحاضرة:</h4>
              {previewData.parts.map((p, pidx) => (
                <div key={pidx} style={{ fontSize: '0.85rem', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, marginBottom: 6 }}>
                  <strong>جزء {pidx + 1}: {p.title}</strong> &middot; المصدر: <code>{p.source}</code> &middot; 
                  {p.source === 'youtube' && ` معرّف: ${p.youtube_id}`}
                  {p.source === 'drive' && ` معرّف: ${p.drive_id}`}
                  {p.source === 'bunny' && ` معرّف Bunny: ${p.bunny_video_id}`}
                  {p.duration_seconds && ` &middot; المدة: ${Math.round(p.duration_seconds / 60)} دقيقة`}
                  {` &middot; حد المحاولات: ${p.view_limit ?? 'غير محدود'}`}
                </div>
              ))}
            </div>

            {previewData.quizzes && previewData.quizzes.length > 0 && (
              <div>
                <h4 style={{ color: '#10b981', borderBottom: '1px solid rgba(16, 185, 129, 0.2)', paddingBottom: 6 }}>الامتحانات المضافة:</h4>
                {previewData.quizzes.map((qz, qzi) => (
                  <div key={qzi} style={{ padding: 15, background: 'rgba(255,255,255,0.02)', borderRadius: 8, marginBottom: 12 }}>
                    <strong>{qz.title}</strong> &middot; التفعيل: <code>{qz.triggerType === 'timestamp' ? `أثناء مشاهدة جزء ${qz.partIndex + 1} عند (${qz.timestamp})` : qz.scope === 'whole' ? 'كامل الفيديو (بوابة)' : `جزء ${qz.partIndex + 1} (بوابة)`}</code> &middot; النجاح: <code>{qz.passingQuestions}</code> من <code>{qz.questions.length}</code> أسئلة &middot; المحاولات: <code>{qz.maxAttempts}</code>
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {qz.questions.map((q, qidx) => (
                        <div key={qidx} style={{ paddingInlineStart: 12, borderRight: '2px solid rgba(255,255,255,0.1)' }}>
                          <strong>س{qidx + 1}: {q.question} ({q.points} نقطة)</strong>
                          <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap', marginTop: 4 }}>
                            {q.options.map((opt, oidx) => (
                              <span key={oidx} style={{ fontSize: '0.8rem', color: q.answers.includes(oidx) ? '#10b981' : 'var(--text-secondary)' }}>
                                {String.fromCharCode(65 + oidx)}. {opt} {q.answers.includes(oidx) && '✓'}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const mm = String(m).padStart(h ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
