import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTenant } from '../contexts/TenantContext'
import { supabase } from '@backend/supabase'
import { listMyPurchases, listPackages } from '@backend/packagesApi'
import { listVideos } from '@backend/videosApi'
import { listHomeworks, getMySubmissionsBatch, submitHomework } from '@backend/homeworksApi'
import { listExams, countSubmittedAttemptsBatch } from '@backend/examsApi'
import { listProgressForVideo, incrementPartView, updatePartProgress } from '@backend/progressApi'
import { getVideoGateStatus, invalidateGateCache } from '@backend/videoAssessmentsApi'
import { listEffectiveOverrides, reduceEffective } from '@backend/overridesApi'
import { listNotes, createNote, deleteNote } from '@backend/videoNotesApi'
import YouTubePlayer from '../components/YouTubePlayer'
import DrivePlayer from '../components/DrivePlayer'
import BunnyPlayer from '../components/BunnyPlayer'
import VideoComments from '../components/VideoComments'
import AssessmentRunner from '../components/AssessmentRunner'
import VideoTitleCard from '../components/VideoTitleCard'
import VideoPlayerWorkspace from '../components/VideoPlayerWorkspace'
import ScreenGuard from '../components/ScreenGuard'
import ConfirmExitDialog from '../components/ConfirmExitDialog'
import useExitGuard from '../hooks/useExitGuard'
import './Videos.css'
import './Homework.css'
import './Exams.css'
import './Packages.css'

const OPT_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي']

export default function Packages() {
  const navigate = useNavigate()
  const { user: currentUser, role: userRole } = useAuth()
  const { isFeatureEnabled, tenantId } = useTenant()

  const [packages, setPackages] = useState([])
  const [selectedPackage, setSelectedPackage] = useState(null)
  const [view, setView] = useState('packages') // 'packages', 'detail', 'player'
  const [activeTab, setActiveTab] = useState('videos') // 'videos', 'homeworks', 'exams'
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  // Package content items
  const [allPackageItems, setAllPackageItems] = useState([]) // rows from package_items
  const [videos, setVideos] = useState([])
  const [homeworks, setHomeworks] = useState([])
  const [exams, setExams] = useState([])

  // Progress/Submissions/Attempts maps
  const [submissions, setSubmissions] = useState({}) // homeworkId -> submission row
  const [attemptsMap, setAttemptsMap] = useState({}) // examId -> count
  const [overridesMap, setOverridesMap] = useState(new Map()) // examId -> override
  const [videoOverrides, setVideoOverrides] = useState(new Map()) // videoId -> override

  // Video player state
  const [currentVideo, setCurrentVideo] = useState(null)
  const [selectedPart, setSelectedPart] = useState(null)
  const [progressRows, setProgressRows] = useState([])
  const [gates, setGates] = useState([])
  const [quizTick, setQuizTick] = useState(0)
  const [activeGate, setActiveGate] = useState(null)
  const [pendingPart, setPendingPart] = useState(null)
  const [showPdf, setShowPdf] = useState(false)

  // Notes state
  const [currentTime, setCurrentTime] = useState(0)
  const [notes, setNotes] = useState([])
  const [noteContent, setNoteContent] = useState('')
  const [seekTrigger, setSeekTrigger] = useState(null)
  const [loadingNotes, setLoadingNotes] = useState(false)
  const passedThisSessionRef = useRef(new Set())

  // Modal / alerts
  const [submitModal, setSubmitModal] = useState(null) // homework | null
  const [showAlert, setShowAlert] = useState(false)
  const [alertData, setAlertData] = useState({ title: '', message: '' })
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  // 1. Load user packages
  useEffect(() => {
    if (!currentUser?.id || currentUser.id === 'undefined') return
    let cancelled = false
    const fetchPackages = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        let list = []
        if (userRole === 'admin' || userRole === 'assistant') {
          list = await listPackages(tenantId)
        } else {
          const purchases = await listMyPurchases(currentUser.id)
          list = purchases
            .filter((p) => p.payment_status === 'approved')
            .map((p) => p.packages)
            .filter(Boolean)
        }
        if (!cancelled) {
          setPackages(list)
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'تعذر تحميل الباقات')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchPackages()
    return () => { cancelled = true }
  }, [currentUser?.id, userRole, tenantId])

  // 1.5. Auto-select package from query parameter
  useEffect(() => {
    if (packages.length > 0) {
      const params = new URLSearchParams(window.location.search)
      const pkgId = params.get('id')
      if (pkgId) {
        const match = packages.find((p) => p.id === pkgId)
        if (match) {
          handleSelectPackage(match)
        }
      }
    }
  }, [packages])

  // 2. Load package items when a package is selected
  const handleSelectPackage = async (pkg) => {
    setSelectedPackage(pkg)
    setLoading(true)
    setLoadError(null)
    setView('detail')
    setActiveTab('videos')
    if (!pkg?.id || pkg.id === 'undefined') {
      setLoadError('معرف الباقة غير صالح أو غير موجود.')
      setLoading(false)
      return
    }
    try {
      // Fetch package items
      const { data: items, error: itemsErr } = await supabase
        .from('package_items')
        .select('*')
        .eq('package_id', pkg.id)
      if (itemsErr) throw itemsErr
      setAllPackageItems(items || [])

      // Resolve items
      const videoIds = items.filter((i) => i.item_type === 'video').map((i) => i.item_id)
      const homeworkIds = items.filter((i) => i.item_type === 'homework').map((i) => i.item_id)
      const examIds = items.filter((i) => i.item_type === 'exam').map((i) => i.item_id)

      // Fetch all items from database (which are package-gated in API, but student has access to)
      const [vList, hwList, exList] = await Promise.all([
        listVideos(),
        listHomeworks(),
        listExams({ lean: true }),
      ])

      const shapedVideos = vList.map(shapeVideo).filter((v) => videoIds.includes(v.id))
      const pkgHomeworks = hwList.filter((h) => homeworkIds.includes(h.id))
      const pkgExams = exList.filter((e) => examIds.includes(e.id))

      setVideos(shapedVideos)
      setHomeworks(pkgHomeworks)
      setExams(pkgExams)

      // Fetch student progress / attempts / overrides if student
      if (currentUser?.id && currentUser.id !== 'undefined' && userRole !== 'admin' && userRole !== 'assistant') {
        const [hwSubs, exAttempts, exOverrides, vidOverrides] = await Promise.all([
          getMySubmissionsBatch(homeworkIds, currentUser.id),
          countSubmittedAttemptsBatch(examIds, currentUser.id, {}),
          listEffectiveOverrides({ studentId: currentUser.id, grade: currentUser.grade, group: currentUser.group, itemType: 'exam' }),
          listEffectiveOverrides({ studentId: currentUser.id, grade: currentUser.grade, group: currentUser.group, itemType: 'video' }),
        ])
        setSubmissions(hwSubs || {})
        setAttemptsMap(Object.fromEntries(exAttempts || []))
        setOverridesMap(reduceEffective(exOverrides))
        setVideoOverrides(reduceEffective(vidOverrides))
      }
    } catch (err) {
      setLoadError(err.message || 'حدث خطأ أثناء تحميل محتويات الباقة')
    } finally {
      setLoading(false)
    }
  }

  // Back actions
  const goBackToPackages = () => {
    setSelectedPackage(null)
    setVideos([])
    setHomeworks([])
    setExams([])
    setView('packages')
  }

  const goBackToDetail = () => {
    if (selectedPart && userRole !== 'admin' && userRole !== 'assistant') {
      setShowExitConfirm(true)
    } else {
      setCurrentVideo(null)
      setSelectedPart(null)
      setView('detail')
    }
  }

  // 3. Video player helpers & progress
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
      viewLimit: p.view_limit ?? null,
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
      pdf_url: row.pdf_url || null,
      pdf_key: row.pdf_key || null,
    }
  }

  useEffect(() => {
    if (view === 'player' && selectedPart && currentUser?.id) {
      setLoadingNotes(true)
      listNotes(selectedPart.id)
        .then((data) => {
          setNotes(data)
          setLoadingNotes(false)
        })
        .catch((err) => {
          console.error(err)
          setLoadingNotes(false)
        })
    } else {
      setNotes([])
      setCurrentTime(0)
      setNoteContent('')
    }
  }, [selectedPart?.id, view, currentUser?.id])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!currentVideo || !currentUser?.id) {
        setGates([])
        setProgressRows([])
        passedThisSessionRef.current = new Set()
        return
      }
      if (userRole === 'admin' || userRole === 'assistant') {
        setGates([])
        setProgressRows([])
        return
      }
      try {
        const [gateMap, pr] = await Promise.all([
          getVideoGateStatus([currentVideo.id], currentUser.id),
          listProgressForVideo(currentVideo.id, currentUser.id),
        ])
        if (!cancelled) {
          setGates(gateMap.get(currentVideo.id) || [])
          setProgressRows(pr)
        }
      } catch (err) {
        console.error(err)
      }
    }
    run()
    return () => { cancelled = true }
  }, [currentVideo?.id, currentUser?.id, quizTick])

  // Mirrors Videos.jsx. `unlocked` is the server's decision; this check only
  // decides what to draw — start_pre_video_attempt() is the real gate.
  const gatesForPart = (part) =>
    gates.filter((g) => g.trigger_type === 'before' && (!g.part_id || g.part_id === part?.id))

  const findBlockingGate = (video, part) => {
    if (!part || gates.length === 0) return null
    for (const g of gatesForPart(part)) {
      if (passedThisSessionRef.current.has(g.video_assessment_id)) continue
      if (!g.unlocked) return g
    }
    return null
  }

  const isVideoAllowed = (video) => {
    const o = videoOverrides.get(video?.id)
    return o ? o.allowed !== false : true
  }

  const partViewCap = (video, part) => {
    if (part.viewLimit == null) return Infinity
    const bonus = videoOverrides.get(video?.id)?.attempts || 0
    return part.viewLimit + bonus
  }

  const partViewsUsed = (part) => {
    const row = progressRows.find((r) => r.part_id === part.id)
    return row?.views_used || 0
  }

  const partTrialsLeft = (video, part) => {
    const cap = partViewCap(video, part)
    if (cap === Infinity) return Infinity
    return Math.max(0, cap - partViewsUsed(part))
  }

  const playVideoPart = async (part, overrideVideo = null) => {
    const activeVid = overrideVideo || currentVideo
    if (userRole !== 'admin' && userRole !== 'assistant') {
      const left = partTrialsLeft(activeVid, part)
      if (left <= 0) {
        return showAlertModal(
          'انتهت محاولاتك',
          `لقد استخدمت كل محاولات مشاهدة هذا الجزء (${partViewCap(activeVid, part)}). تواصل مع المعلم للحصول على محاولات إضافية.`
        )
      }
    }

    const blocking = findBlockingGate(activeVid, part)
    if (blocking && userRole !== 'admin' && userRole !== 'assistant') {
      if (blocking.attempts_remaining <= 0) {
        return showAlertModal(
          'انتهت محاولاتك',
          `لقد استنفدت جميع المحاولات (${blocking.allowed_attempts}) في "${blocking.title}" ولم تحقق نسبة النجاح المطلوبة (${blocking.passing_score}%). يُرجى التواصل مع المعلم.`
        )
      }
      setPendingPart(part)
      setActiveGate(blocking)
      return
    }

    setSelectedPart(part)
  }

  const viewCountedRef = useRef(false)
  useEffect(() => {
    viewCountedRef.current = false
    if (!selectedPart || userRole === 'admin' || userRole === 'assistant' || !currentUser?.id || !currentVideo?.id) return
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
            .catch((err) => console.error(err))
        }
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [selectedPart?.id, currentUser?.id, currentVideo?.id, userRole])

  const handleTimeUpdate = ({ seconds }) => {
    setCurrentTime(seconds)
    if (gates.length === 0 || activeGate || userRole === 'admin' || userRole === 'assistant') return
    const due = gates.find((g) => {
      if (g.trigger_type !== 'timestamp') return false
      if (g.part_id && g.part_id !== selectedPart?.id) return false
      if (g.unlocked || passedThisSessionRef.current.has(g.video_assessment_id)) return false
      return Math.abs(seconds - (g.timestamp_seconds || 0)) <= 1.0
    })
    if (due && due.attempts_remaining > 0) {
      setPendingPart(selectedPart)
      setActiveGate(due)
    }
  }

  const handleGateUnlock = () => {
    if (activeGate?.video_assessment_id) {
      passedThisSessionRef.current.add(activeGate.video_assessment_id)
    }
    setActiveGate(null)
    invalidateGateCache()
    setQuizTick((t) => t + 1)
    const part = pendingPart
    setPendingPart(null)
    if (part) setTimeout(() => playVideoPart(part), 50)
  }

  const handleGateClose = () => {
    if (activeGate && activeGate.trigger_type === 'timestamp') {
      const unlocked = passedThisSessionRef.current.has(activeGate.video_assessment_id)
      if (!unlocked) {
        handleSeekToNote(Math.max(0, (activeGate.timestamp_seconds || 0) - 5))
      }
    }
    setActiveGate(null)
    setPendingPart(null)
    invalidateGateCache()
    setQuizTick((t) => t + 1)
  }

  // Exit guard handling
  const isWatching = view === 'player' && !!selectedPart && userRole !== 'admin' && userRole !== 'assistant'
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

  const openVideoPlayer = (video) => {
    if (userRole !== 'admin' && userRole !== 'assistant' && !isVideoAllowed(video)) {
      return showAlertModal('خطأ', 'غير متاح')
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    setCurrentVideo(video)
    setView('player')
    setShowPdf(!!video.pdf_url)

    const firstPart = video.parts && video.parts.length > 0 ? video.parts[0] : null
    if (firstPart) {
      playVideoPart(firstPart, video)
    } else {
      setSelectedPart(null)
    }
  }

  // Smart Notes saving/seeking
  const formatTime = (sec) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const handleSeekToNote = (sec) => {
    setSeekTrigger({ seconds: sec, at: Date.now() })
  }

  const handleSaveNote = async (e) => {
    e.preventDefault()
    if (!noteContent.trim() || !selectedPart || !currentUser?.id) return
    try {
      const note = await createNote({
        partId: selectedPart.id,
        content: noteContent.trim(),
        timestampSeconds: Math.floor(currentTime),
      })
      setNotes((prev) => [note, ...prev].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds))
      setNoteContent('')
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteNote = async (noteId) => {
    try {
      await deleteNote(noteId)
      setNotes((prev) => prev.filter((n) => n.id !== noteId))
    } catch (err) {
      console.error(err)
    }
  }

  // 4. Exams runner
  const effectiveMaxAttempts = (exam) => {
    const o = overridesMap.get(exam.id)
    const base = exam.max_attempts || 1
    const extra = o && typeof o.attempts === 'number' ? o.attempts : 0
    return base + extra
  }

  const remainingFor = (exam) =>
    Math.max(0, effectiveMaxAttempts(exam) - (attemptsMap[exam.id] || 0))

  const startExam = (exam) => {
    if (userRole !== 'admin' && userRole !== 'assistant' && remainingFor(exam) <= 0) {
      showAlertModal('انتهت محاولاتك', 'لقد استنفدت جميع محاولاتك المتاحة لهذا الامتحان.')
      return
    }
    navigate(`/exam-taking?id=${exam.id}`)
  }

  const showAlertModal = (title, message) => {
    setAlertData({ title, message })
    setShowAlert(true)
  }

  const closeAlertModal = () => setShowAlert(false)

  const guardActive = view === 'player' && !!selectedPart && userRole !== 'admin' && userRole !== 'assistant'
  const guardLabel = currentUser ? `${currentUser.name || ''} · ${currentUser.phone || ''}` : ''

  return (
    <div className={view === 'player' ? "videos-page" : "packages-page"} dir="rtl">
      <ScreenGuard active={guardActive} label={guardLabel} strict={false} />

      {/* 1. Catalog screen */}
      {view === 'packages' && (
        <div className="packages-container">
          <div className="packages-header">
            <div className="header-icon"><i className="fas fa-cubes"></i></div>
            <div>
              <h1>باقاتي الدراسية</h1>
              <p>تصفح وافتح جميع المحتويات والدروس الخاصة بالباقات التي اشتركت فيها</p>
            </div>
          </div>

          {loading ? (
            <div className="loader-box">
              <i className="fas fa-spinner fa-spin"></i>
              <p>جاري تحميل باقاتك الدراسية...</p>
            </div>
          ) : loadError ? (
            <div className="error-box">
              <i className="fas fa-circle-exclamation"></i>
              <p>{loadError}</p>
            </div>
          ) : packages.length === 0 ? (
            <div className="empty-box">
              <i className="fas fa-box-open"></i>
              <h3>لا توجد باقات مفعلة حالياً</h3>
              <p>يمكنك الانتقال لصفحة الباقات والاشتراك في باقات دراسية لتظهر لك هنا.</p>
              <button className="btn-go-shop" onClick={() => navigate('/shop')}>الانتقال إلى المتجر</button>
            </div>
          ) : (
            <div className="packages-grid">
              {packages.map((pkg, idx) => (
                <div key={pkg.id} className="pkg-card" onClick={() => handleSelectPackage(pkg)}>
                  <div className="pkg-cover">
                    {pkg.thumbnail ? (
                      <img src={pkg.thumbnail} alt={pkg.title} />
                    ) : (
                      <div className="pkg-placeholder"><i className="fas fa-graduation-cap"></i></div>
                    )}
                    <span className="pkg-badge"><i className="fas fa-check-circle"></i> مفعلة</span>
                  </div>
                  <div className="pkg-body">
                    <h3>{pkg.title}</h3>
                    <p>{pkg.description || 'باقة دراسية متكاملة تحتوي على دروس، واجبات، واختبارات.'}</p>
                    <div className="pkg-footer">
                      <span>عرض محتوى الباقة</span>
                      <i className="fas fa-arrow-left"></i>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. Detail tabbed screen */}
      {view === 'detail' && selectedPackage && (
        <div className="packages-container">
          <div className="pkg-detail-header">
            <button className="pkg-back-btn" onClick={goBackToPackages}><i className="fas fa-arrow-right"></i> العودة للباقات</button>
            <div className="pkg-detail-meta">
              <div className="pkg-meta-img">
                {selectedPackage.thumbnail ? (
                  <img src={selectedPackage.thumbnail} alt={selectedPackage.title} />
                ) : (
                  <div className="pkg-placeholder"><i className="fas fa-graduation-cap"></i></div>
                )}
              </div>
              <div>
                <h2>{selectedPackage.title}</h2>
                <p>{selectedPackage.description || 'دروس مخصصة وواجبات واختبارات متكاملة.'}</p>
              </div>
            </div>
          </div>

          <div className="tabs-nav-bar">
            <button className={`tab-nav-btn ${activeTab === 'videos' ? 'active' : ''}`} onClick={() => setActiveTab('videos')}>
              <i className="fas fa-play-circle"></i> الفيديوهات والدروس ({videos.length})
            </button>
            <button className={`tab-nav-btn ${activeTab === 'homeworks' ? 'active' : ''}`} onClick={() => setActiveTab('homeworks')}>
              <i className="fas fa-clipboard-list"></i> الواجبات والتمارين ({homeworks.length})
            </button>
            <button className={`tab-nav-btn ${activeTab === 'exams' ? 'active' : ''}`} onClick={() => setActiveTab('exams')}>
              <i className="fas fa-file-alt"></i> الامتحانات والتقييمات ({exams.length})
            </button>
          </div>

          <div className="tab-content-container">
            {loading ? (
              <div className="loader-box">
                <i className="fas fa-spinner fa-spin"></i>
                <p>جاري تحميل المحتويات...</p>
              </div>
            ) : loadError ? (
              <div className="error-box">
                <i className="fas fa-circle-exclamation"></i>
                <p>{loadError}</p>
              </div>
            ) : (
              <>
                {/* Videos Content */}
                {activeTab === 'videos' && (
                  <div className="videos-grid" style={{ padding: 20 }}>
                    {videos.map((vid, idx) => {
                      const isAvailable = isVideoAllowed(vid)
                      return (
                        <div
                          key={vid.id}
                          className="vc-card"
                          onClick={() => openVideoPlayer(vid)}
                        >
                          <div className={`vc-status-bar ${isAvailable ? 'vc-available' : 'vc-unavailable'}`}>
                            <span className="vc-status-dot" />
                            <span>{isAvailable ? 'متاح' : 'غير متاح'}</span>
                          </div>

                          <div className="vc-header">
                            <div className="vc-play-btn">▶</div>
                            <div className="vc-titles">
                              <div className="vc-title">{vid.title}</div>
                              <div className="vc-desc">{vid.description}</div>
                            </div>
                            <div className="vc-badge">{idx + 1}</div>
                          </div>

                          <div className="vc-stats">
                            <div className="vc-stat">
                              <span className="vc-stat-icon">🎬</span>
                              <span className="vc-stat-label">نوع المحتوى</span>
                              <span className="vc-stat-value">{vid.totalParts > 1 ? `${vid.totalParts} أجزاء` : 'فيديو كامل'}</span>
                            </div>
                            <div className="vc-stat">
                              <span className="vc-stat-icon">🕒</span>
                              <span className="vc-stat-label">متاح لمدة</span>
                              <span className="vc-stat-value">{vid.activeHours} ساعة</span>
                            </div>
                          </div>

                          <div className="vc-footer">
                            <span>⏳</span>
                            <span>متاح للمشاهدة</span>
                          </div>
                        </div>
                      )
                    })}
                    {videos.length === 0 && (
                      <div className="tab-empty" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px' }}>
                        <i className="fas fa-photo-film" style={{ fontSize: '2rem', color: '#a0aec0' }}></i>
                        <p>لا توجد فيديوهات مضافة لهذه الباقة</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Homeworks Content */}
                {activeTab === 'homeworks' && (
                  <div className="hw-grid" style={{ padding: 20 }}>
                    {homeworks.map((hw, idx) => {
                      const sub = submissions[hw.id]
                      const isGraded = sub?.score != null
                      const hasSub = !!sub?.submitted_at
                      
                      let status = null
                      if (isGraded) {
                        status = { label: `الدرجة: ${sub.score}/${hw.max_score}`, cls: 'hw-status-graded', icon: 'fa-circle-check' }
                      } else if (hasSub) {
                        status = { label: 'تم التسليم بنجاح', cls: 'hw-status-graded', icon: 'fa-circle-check' }
                      } else {
                        status = { label: 'لم يتم التسليم بعد', cls: 'hw-status-pending', icon: 'fa-hourglass-half' }
                      }

                      const cover = hw.cover_url || 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=400&q=80'

                      return (
                        <article key={hw.id} className="hw-card">
                          <div className="hw-card-cover">
                            <img src={cover} alt={hw.title} loading="lazy" />
                            <div className="hw-card-cover-grad"></div>
                            <div className="hw-card-ribbon">
                              <i className="fas fa-clipboard-list"></i> واجب
                            </div>
                            {hw.week && (
                              <div className="hw-card-title-pill">
                                <i className="fas fa-bookmark"></i> {hw.week}
                              </div>
                            )}
                          </div>

                          <div className="hw-card-body">
                            <h3 className="hw-card-title">{hw.title}</h3>
                            {hw.description && <p className="hw-card-desc">{hw.description}</p>}

                            {status && (
                              <div className={`hw-status ${status.cls}`}>
                                <i className={`fas ${status.icon}`}></i>
                                <span>{status.label}</span>
                              </div>
                            )}

                            <div className="hw-card-meta">
                              <span><i className="fas fa-calendar"></i> {new Date(hw.created_at).toLocaleDateString('ar-EG')}</span>
                              {hw.pdf_url && (
                                <span className="hw-meta-file"><i className="fas fa-file-pdf"></i> PDF</span>
                              )}
                              <span><i className="fas fa-star"></i> {hw.max_score} درجة</span>
                            </div>

                            <div className="hw-card-actions">
                              <button className="hw-btn hw-btn-primary" onClick={() => setSubmitModal(hw)}>
                                <i className="fas fa-cloud-arrow-up"></i>
                                {' '}{hasSub ? 'تعديل الإجابات' : 'حل الواجب'}
                              </button>
                            </div>
                          </div>
                        </article>
                      )
                    })}
                    {homeworks.length === 0 && (
                      <div className="tab-empty" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px' }}>
                        <i className="fas fa-clipboard-list" style={{ fontSize: '2rem', color: '#a0aec0' }}></i>
                        <p>لا توجد واجبات مضافة لهذه الباقة</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Exams Content */}
                {activeTab === 'exams' && (
                  <div className="exam-list" style={{ padding: 20 }}>
                    {exams.map((ex, idx) => {
                      const remain = remainingFor(ex)
                      return (
                        <div key={ex.id} className="ec-card" onClick={() => startExam(ex)}>
                          <div className="ec-header">
                            <div className="ec-badge">{idx + 1}</div>
                            <div className="ec-titles">
                              <div className="ec-title">{ex.title}</div>
                              <div className="ec-lecture">📝 {ex.number ? `رقم ${ex.number}` : ''}</div>
                            </div>
                          </div>
                          <div className="ec-stats">
                            <div className="ec-stat">
                              <span className="ec-stat-icon">🕒</span>
                              <span className="ec-stat-label">المدة</span>
                              <span className="ec-stat-value">{ex.duration_minutes} دقيقة</span>
                            </div>
                            <div className="ec-stat">
                              <span className="ec-stat-icon">⭐</span>
                              <span className="ec-stat-label">الدرجة الكلية</span>
                              <span className="ec-stat-value">{ex.total_points} درجة</span>
                            </div>
                            <div className="ec-stat">
                              <span className="ec-stat-icon">🔄</span>
                              <span className="ec-stat-label">المحاولات المتاحة</span>
                              <span className="ec-stat-value">{remain}/{effectiveMaxAttempts(ex)}</span>
                            </div>
                          </div>
                          <div className="ec-footer">
                            <span>⏳</span>
                            <span>جاهز للامتحان</span>
                          </div>
                        </div>
                      )
                    })}
                    {exams.length === 0 && (
                      <div className="tab-empty" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px' }}>
                        <i className="fas fa-file-alt" style={{ fontSize: '2rem', color: '#a0aec0' }}></i>
                        <p>لا توجد امتحانات مضافة لهذه الباقة</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 3. Inline video player view */}
      {view === 'player' && currentVideo && (
        <VideoPlayerWorkspace
          video={currentVideo}
          selectedPart={selectedPart}
          onSelectPart={playVideoPart}
          onBack={goBackToDetail}
          backLabel="العودة لمحتوى الباقة"
          levelEyebrow="من محتوى الباقة"
          userRole={userRole}
          currentUser={currentUser}
          partTrialsLeft={partTrialsLeft}
          partViewCap={partViewCap}
          findBlockingGate={findBlockingGate}
          gatesForPart={gatesForPart}
          notes={notes}
          loadingNotes={loadingNotes}
          noteContent={noteContent}
          onNoteContentChange={setNoteContent}
          onSaveNote={handleSaveNote}
          onDeleteNote={handleDeleteNote}
          onSeekToNote={handleSeekToNote}
          currentTime={currentTime}
          formatTime={formatTime}
          discussionSlot={<VideoComments videoId={currentVideo.id} currentUser={currentUser} />}
          pdfSlot={currentVideo?.pdf_url ? <PdfInline url={currentVideo.pdf_url} title={currentVideo.title} /> : null}
        >
          {selectedPart && (() => {
            const handleProgress = ({ watchedSeconds }) => {
              if (userRole === 'admin' || userRole === 'assistant' || !currentUser?.id) return
              updatePartProgress({
                student_id: currentUser.id,
                video_id: currentVideo.id,
                part_id: selectedPart.id,
                seconds: watchedSeconds,
              }).then((row) => {
                if (!row) return
                setProgressRows((prev) => {
                  const others = prev.filter((p) => p.part_id !== selectedPart.id)
                  return [...others, row]
                })
              }).catch((e) => console.error('updatePartProgress failed', e))
            }
            const seed = progressRows.find((r) => r.part_id === selectedPart.id)?.seconds_watched || 0
            return (
              <PlayerFacade key={selectedPart.id} part={selectedPart}>
                {selectedPart.source === 'bunny' ? (
                  <BunnyPlayer
                    partId={selectedPart.id}
                    initialWatchedSeconds={seed}
                    onProgress={handleProgress}
                    onTimeUpdate={handleTimeUpdate}
                    forcePause={!!activeGate}
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
                    forcePause={!!activeGate}
                  />
                )}
              </PlayerFacade>
            )
          })()}
        </VideoPlayerWorkspace>
      )}

      {/* 4. Homework Submit Modal */}
      {submitModal && (
        <SubmitModal
          homework={submitModal}
          existing={submissions[submitModal.id] || null}
          onClose={() => setSubmitModal(null)}
          onDone={(res) => {
            setSubmissions((prev) => ({
              ...prev,
              [submitModal.id]: {
                ...prev[submitModal.id],
                ...res,
              },
            }))
            setSubmitModal(null)
          }}
          onError={(msg) => showAlertModal('خطأ في التسليم', msg)}
        />
      )}

      {/* 5. Pre-Video Assessment gate */}
      {activeGate && currentVideo && currentUser && (
        <AssessmentRunner
          gate={activeGate}
          onUnlock={handleGateUnlock}
          onClose={handleGateClose}
        />
      )}

      {/* 6. Custom Alert Modal */}
      {showAlert && (
        <div className="packages-modalactive" onClick={closeAlertModal}>
          <div className="pmodal-box" onClick={(e) => e.stopPropagation()}>
            <button className="pmodal-closebtn" onClick={closeAlertModal}>&times;</button>
            <h3>{alertData.title}</h3>
            <p>{alertData.message}</p>
            <button className="pmodal-okbtn" onClick={closeAlertModal}>موافق</button>
          </div>
        </div>
      )}

      {/* 7. Exit Confirmation Dialog */}
      {showExitConfirm && (
        <ConfirmExitDialog
          title="هل تريد الخروج من الفيديو؟"
          message="لو خرجت دلوقتي، المحاولة قد تُحتسب عليك ويتم خصمها من رصيدك. هل أنت متأكد من الخروج؟"
          confirmText="نعم، خروج"
          cancelText="إلغاء"
          onConfirm={() => {
            setShowExitConfirm(false)
            exitGuard.disable()
            setCurrentVideo(null)
            setSelectedPart(null)
            setView('detail')
          }}
          onCancel={() => {
            setShowExitConfirm(false)
          }}
        />
      )}
    </div>
  )
}

// Inline PDF player façade helper
function PlayerFacade({ part, children }) {
  const [armed, setArmed] = useState(false)
  if (armed) return children

  let poster = null
  if (part.source === 'youtube' && part.youtubeId) {
    poster = `https://i.ytimg.com/vi/${part.youtubeId}/hqdefault.jpg`
  }

  return (
    <button
      type="button"
      onClick={() => setArmed(true)}
      className="player-facade-btn"
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16/9',
        background: poster
          ? `#000 center/cover no-repeat url(${poster})`
          : 'linear-gradient(135deg, #1f2937, #4338ca)',
        border: 0,
        borderRadius: 12,
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
          color: 'var(--primary, #7c3aed)', fontSize: 28,
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
        {part.source === 'bunny' ? 'Bunny Stream' : part.source === 'drive' ? 'Google Drive' : 'YouTube'}
      </div>
    </button>
  )
}

// Inline PDF viewer component
function PdfInline({ url, title }) {
  const src = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`
  const CLIP = 48
  return (
    <div
      tabIndex={-1}
      style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}
    >
      <iframe
        src={src}
        title={title}
        tabIndex={-1}
        loading="lazy"
        style={{
          position: 'absolute',
          top: -CLIP,
          left: 0,
          width: '100%',
          height: `calc(100% + ${CLIP}px)`,
          border: 0,
          display: 'block',
        }}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </div>
  )
}

// Student Homework Submit Modal Component
function SubmitModal({ homework, existing, onClose, onDone, onError }) {
  const key = Array.isArray(homework.answer_key) ? homework.answer_key : []
  const initial = useMemo(() => {
    const prev = Array.isArray(existing?.responses) ? existing.responses : []
    return key.map((_, i) => (typeof prev[i] === 'number' ? prev[i] : null))
  }, [key, existing])

  const [picks, setPicks] = useState(initial)
  const [busy, setBusy] = useState(false)
  const answeredCount = picks.filter((p) => p != null).length

  const choose = (qIdx, optIdx) => {
    setPicks((prev) => {
      const next = prev.slice()
      next[qIdx] = optIdx
      return next
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (key.length === 0) {
      onError('لا توجد أسئلة في هذا الواجب')
      return
    }
    if (answeredCount < key.length) {
      if (!window.confirm(`لم تجب على ${key.length - answeredCount} سؤال. هل تريد التسليم رغم ذلك؟`)) return
    }
    setBusy(true)
    try {
      const res = await submitHomework(homework.id, picks)
      onDone({ ...res, responses: picks })
    } catch (err) {
      console.error(err)
      const detail = err?.message || err?.details || err?.code || 'تعذر التسليم'
      onError(`تعذر التسليم — ${detail}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hw-modal-overlay" onClick={onClose}>
      <form className="hw-modal hw-modal-wide" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="hw-modal-head">
          <div className="hw-modal-icon"><i className="fas fa-paper-plane"></i></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3>تسليم الواجب</h3>
            <p style={{ margin: 0, color: '#a0aec0', fontSize: 13 }}>{homework.title}</p>
          </div>
          <button type="button" className="hw-modal-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="hw-modal-body">
          {existing?.submitted_at && (
            <div className="hw-existing">
              <i className="fas fa-circle-check"></i>
              <span>لديك تسليم سابق</span>
              {existing.score != null && homework.reveal_grades === true && (
                <strong>— الدرجة: {existing.score}/{existing.max_score ?? homework.max_score}</strong>
              )}
              <small>— يمكنك تعديل إجاباتك وإعادة التسليم</small>
            </div>
          )}

          <div className="hw-split">
            {homework.pdf_url ? (
              <div className="hw-split-pdf">
                <PdfInline url={homework.pdf_url} title={homework.title} />
              </div>
            ) : (
              <div className="hw-pdf-link" style={{ background: '#fef3c7', color: '#92400e' }}>
                <i className="fas fa-triangle-exclamation"></i>
                <span>هذا الواجب لا يحتوي على ملف PDF</span>
              </div>
            )}

            <div className="hw-split-form">
              {key.length === 0 ? (
                <div className="hw-empty">
                  <i className="fas fa-circle-info"></i>
                  <p>لا توجد أسئلة لهذا الواجب بعد</p>
                </div>
              ) : (
                <div className="hw-mcq-list">
                  <div className="hw-mcq-progress">
                    <strong>{answeredCount}</strong> / {key.length} أجوبة
                  </div>
                  {key.map((q, qi) => {
                    const opts = Math.max(2, parseInt(q?.options, 10) || 4)
                    return (
                      <div key={qi} className="hw-mcq-row">
                        <div className="hw-mcq-q">السؤال {qi + 1}</div>
                        <div className="hw-mcq-opts">
                          {Array.from({ length: opts }).map((_, oi) => {
                            const isOn = picks[qi] === oi
                            return (
                              <label key={oi} className={`hw-mcq-opt ${isOn ? 'is-on' : ''}`}>
                                <input
                                  type="radio"
                                  name={`q-${qi}`}
                                  checked={isOn}
                                  onChange={() => choose(qi, oi)}
                                />
                                <span className="hw-mcq-letter">{OPT_LETTERS[oi] || String.fromCharCode(65 + oi)}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="hw-modal-foot">
          <button type="button" className="hw-btn hw-btn-ghost" onClick={onClose} disabled={busy}>إلغاء</button>
          <button type="submit" className="hw-btn hw-btn-primary" disabled={busy || key.length === 0}>
            <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>{' '}
            {busy ? 'جاري التسليم...' : 'إرسال الإجابات'}
          </button>
        </div>
      </form>
    </div>
  )
}
