import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTenant } from '../contexts/TenantContext'
import './Videos.css'
import PrepIllustration from '../components/PrepIllustration'
import AssessmentRunner from '../components/AssessmentRunner'
import VideoTitleCard from '../components/VideoTitleCard'
import VideoPlayerWorkspace from '../components/VideoPlayerWorkspace'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog'
import YouTubePlayer from '../components/YouTubePlayer'
import DrivePlayer from '../components/DrivePlayer'
import BunnyPlayer from '../components/BunnyPlayer'
import ScreenGuard from '../components/ScreenGuard'
import useExitGuard, { confirmExit } from '../hooks/useExitGuard'
import ConfirmExitDialog from '../components/ConfirmExitDialog'
import VideoComments from '../components/VideoComments'
import { listVideos, deleteVideo, updateVideo, setVideoArchived } from '@backend/videosApi'
import { listStudentContentAccess } from '@backend/packagesApi'
import { listPlaylists } from '@backend/playlistsApi'
import { listNotes, createNote, deleteNote } from '@backend/videoNotesApi'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../utils/cache'
import { useAuth } from '../contexts/AuthContext'
import { uploadLecturePdf, deleteR2Object } from '@backend/r2'
import { notify } from '../utils/notify'
import {
  listProgressForVideo,
  incrementPartView,
  updatePartProgress,
} from '@backend/progressApi'
import {
  getVideoGateStatus,
  invalidateGateCache,
  listVideoAssessments,
  syncVideoAssessments,
} from '@backend/videoAssessmentsApi'
import PreAssessmentEditor, {
  gatesToPayload,
  payloadToGates,
  validateGates,
} from '../components/PreAssessmentEditor'
import { listEffectiveOverrides, reduceEffective } from '@backend/overridesApi'
import { dbToUiGrade, uiToDbGrade } from '@backend/examsApi'

const PREP_META = {
  first: { ar: 'الصف الأول الإعدادي', en: 'First Prep', accent: 'green', desc: 'بداية المرحلة الإعدادية والتأسيس' },
  second: { ar: 'الصف الثاني الإعدادي', en: 'Second Prep', accent: 'blue', desc: 'تعميق المفاهيم وبناء المهارات' },
  third: { ar: 'الصف الثالث الإعدادي', en: 'Third Prep', accent: 'orange', desc: 'الاستعداد لاختبارات الشهادة' },
  'first-sec': { ar: 'الصف الأول الثانوي', en: 'First Sec', accent: 'teal', desc: 'بداية المرحلة الثانوية والتأسيس' },
  'second-sec': { ar: 'الصف الثاني الثانوي', en: 'Second Sec', accent: 'pink', desc: 'تحديد المسار وبناء المهارات' },
  'third-sec': { ar: 'الصف الثالث الثانوي', en: 'Third Sec', accent: 'red', desc: 'الاستعداد لاختبارات الثانوية العامة' },
  // Primary
  'primary-1': { ar: 'الصف الأول الابتدائي', en: 'Primary 1', accent: 'black', desc: 'المرحلة الابتدائية - الصف الأول' },
  'primary-2': { ar: 'الصف الثاني الابتدائي', en: 'Primary 2', accent: 'black', desc: 'المرحلة الابتدائية - الصف الثاني' },
  'primary-3': { ar: 'الصف الثالث الابتدائي', en: 'Primary 3', accent: 'black', desc: 'المرحلة الابتدائية - الصف الثالث' },
  'primary-4': { ar: 'الصف الرابع الابتدائي', en: 'Primary 4', accent: 'black', desc: 'المرحلة الابتدائية - الصف الرابع' },
  'primary-5': { ar: 'الصف الخامس الابتدائي', en: 'Primary 5', accent: 'black', desc: 'المرحلة الابتدائية - الصف الخامس' },
  'primary-6': { ar: 'الصف السادس الابتدائي', en: 'Primary 6', accent: 'black', desc: 'المرحلة الابتدائية - الصف السادس' },
  // Baccalaureate
  'bac-1': { ar: 'البكالوريا - المستوى الأول', en: 'Bac 1', accent: 'black', desc: 'مرحلة البكالوريا - المستوى الأول' },
  'bac-2': { ar: 'البكالوريا - المستوى الثاني', en: 'Bac 2', accent: 'black', desc: 'مرحلة البكالوريا - المستوى الثاني' },
  'bac-3': { ar: 'البكالوريا - المستوى الثالث', en: 'Bac 3', accent: 'black', desc: 'مرحلة البكالوريا - المستوى الثالث' },
  packages: { ar: 'باقات مدفوعة 📦', en: 'Paid Packages', accent: 'violet', desc: 'محتويات الباقات المدفوعة والخاصة' },
}

export default function Videos() {
  const navigate = useNavigate()
  const { isGradeEnabled, gradesList } = useTenant()
  // Record this visit for the home "Continue" widget.
  useEffect(() => { import('../utils/trackVisit').then(m => m.trackVisit('videos')) }, [])

  const { user: rawUser, role: rawRole } = useAuth()
  const currentUser = useMemo(() => {
    if (!rawUser) return null
    if (rawUser.role === 'super_admin') {
      return { ...rawUser, role: 'admin' }
    }
    return rawUser
  }, [rawUser])
  const userRole = rawRole === 'super_admin' ? 'admin' : rawRole

  const levelsMeta = useMemo(() => {
    const meta = {}
    for (const g of gradesList || []) {
      const legacyKey = dbToUiGrade(g.id)
      const key = legacyKey || g.id
      const legacyMeta = PREP_META[key]
      meta[key] = {
        ar: g.name,
        en: legacyMeta?.en || g.stageName || g.stageId,
        accent: legacyMeta?.accent || 'violet',
        desc: legacyMeta?.desc || `فيديوهات ومحاضرات ${g.name}`,
        dbGrade: g.id
      }
    }
    if (userRole === 'admin' || userRole === 'assistant') {
      meta['packages'] = PREP_META['packages']
    }
    return meta
  }, [gradesList, userRole])

  const filteredLevels = useMemo(() => Object.keys(levelsMeta), [levelsMeta])

  // Convert a DB video row (with embedded video_parts) into the shape the
  // rest of the page was built around (parts[], totalParts).
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
      pdf_url: row.pdf_url || null,
      pdf_key: row.pdf_key || null,
      isArchived: !!row.is_archived,
    }
  }


  const [currentGrade, setCurrentGrade] = useState(() => {
    if (currentUser && currentUser.role !== 'admin' && currentUser.role !== 'assistant' && currentUser.grade) {
      return dbToUiGrade(currentUser.grade) || currentUser.grade
    }
    return ''
  })
  const [currentVideo, setCurrentVideo] = useState(null)
  const [showPdf, setShowPdf] = useState(false)
  const [selectedPart, setSelectedPart] = useState(null)
  const [view, setView] = useState(() => {
    if (currentUser && currentUser.role !== 'admin' && currentUser.role !== 'assistant' && currentUser.grade) {
      return 'videos'
    }
    return 'grades'
  })

  const [allVideos, setAllVideos] = useState([])
  const [showArchived, setShowArchived] = useState(false)
  const [playlists, setPlaylists] = useState([])
  const [expandedPlaylists, setExpandedPlaylists] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [videoOverrides, setVideoOverrides] = useState(new Map()) // videoId -> {allowed, attempts}

  // Per-video gate + progress cache for the one currently-open video.
  // `gates` are rows from get_video_gate_status(): the gate config PLUS this
  // student's attempts-used / attempts-remaining / unlocked flags, all decided
  // server-side. Nothing here is authoritative — it only drives what we draw.
  const [gates, setGates] = useState([])
  const [progressRows, setProgressRows] = useState([]) // rows from video_progress
  const [quizTick, setQuizTick] = useState(0)

  const [activeGate, setActiveGate] = useState(null)
  const [pendingPart, setPendingPart] = useState(null)

  // Smart Video Notes state
  const [currentTime, setCurrentTime] = useState(0)
  const [notes, setNotes] = useState([])
  const [noteContent, setNoteContent] = useState('')
  const [seekTrigger, setSeekTrigger] = useState(null)
  const [loadingNotes, setLoadingNotes] = useState(false)
  // Gates the student has just unlocked in this session. We add to this set
  // the moment the server reports a pass so the immediate `playVideoPart`
  // retry doesn't re-read a stale `gates` array (refetched async) and re-show
  // the assessment that was literally just passed.
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
  const [allowedContentIds, setAllowedContentIds] = useState(new Set())

  // ── Load videos from Supabase ────────────────────────────────
  // 60s cache: videos rarely change between navigations. Admins who just
  // added/deleted a video invalidate from VideoAdd / handleDeleteVideo.
  const refreshVideos = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [data, plist] = await Promise.all([
        cached('videos', LIST_TTL, listVideos),
        listPlaylists()
      ])
      setAllVideos(data.map(shapeVideo))
      setPlaylists(plist)
    } catch (err) {
      setLoadError(err.message || 'جاري التحميل...')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refreshVideos() }, [])

  useEffect(() => {
    if (!currentUser?.id) return
    if (currentUser.role === 'admin' || currentUser.role === 'assistant') return
    let cancelled = false
    ;(async () => {
      try {
        const access = await listStudentContentAccess(currentUser.id)
        if (!cancelled) {
          const ids = new Set(access.filter(a => a.content_type === 'video').map(a => a.content_id))
          setAllowedContentIds(ids)
        }
      } catch (err) {
        console.error('Failed to load content access:', err)
      }
    })()
    return () => { cancelled = true }
  }, [currentUser?.id])

  // Load admin-set overrides — STUDENTS ONLY. Admins manage overrides
  // through ControlPanel; on the Videos page they see all videos as
  // "available" without per-student override resolution. This skips a
  // network round-trip for every admin visit.
  useEffect(() => {
    if (!currentUser?.id) return
    if (currentUser.role === 'admin' || currentUser.role === 'assistant') { setVideoOverrides(new Map()); return }
    const grade = currentUser.grade
    if (!grade) { setVideoOverrides(new Map()); return }
    let cancelled = false
      ; (async () => {
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

  // ── Group by level for the grid ──────────────────────────────
  const videosByLevel = useMemo(() => {
    const out = {}
    for (const key of Object.keys(levelsMeta)) {
      out[key] = []
    }
    for (const v of allVideos) {
      const legacyKey = dbToUiGrade(v.grade)
      const key = legacyKey || v.grade
      if (out[key]) out[key].push(v)
    }
    return out
  }, [allVideos, levelsMeta])

  // Group active/accessible videos by Playlist
  const playlistGroups = useMemo(() => {
    let gradeVideos = videosByLevel[currentGrade] || []
    
    if (userRole === 'admin' || userRole === 'assistant') {
      gradeVideos = gradeVideos.filter(v => v.isArchived === showArchived)
    } else {
      gradeVideos = gradeVideos.filter(v => !v.isArchived)
    }

    if (gradeVideos.length === 0) return []

    const grouped = []

    // 1. Process playlists that are active (or all if admin)
    const activePlaylists = playlists.filter(p => p.is_active || userRole === 'admin' || userRole === 'assistant')

    for (const playlist of activePlaylists) {
      const plistVideos = []
      // The playlist_items are sorted by sort_order
      const itemIds = (playlist.playlist_items || [])
        .filter(item => item.content_type === 'video')
        
      for (const item of itemIds) {
        const v = gradeVideos.find(vid => vid.id === item.content_id)
        if (v) {
          plistVideos.push(v)
        }
      }

      if (plistVideos.length > 0) {
        grouped.push({
          id: playlist.id,
          title: playlist.title,
          description: playlist.description,
          videos: plistVideos
        })
      }
    }

    // 2. Unassigned videos (General Syllabus)
    const unassignedVideos = gradeVideos.filter(v => {
      return !playlists.some(p => 
        (p.playlist_items || []).some(pi => pi.content_type === 'video' && pi.content_id === v.id)
      )
    })

    if (unassignedVideos.length > 0) {
      grouped.push({
        id: 'general',
        title: 'مخطط المنهج العام',
        description: 'الفيديوهات والمحاضرات العامة لمرحلتك الدراسية',
        videos: unassignedVideos
      })
    }

    return grouped
  }, [playlists, videosByLevel, currentGrade, userRole, showArchived])

  const togglePlaylistExpanded = (playlistId) => {
    setExpandedPlaylists(prev => ({
      ...prev,
      [playlistId]: prev[playlistId] === false ? true : false
    }))
  }

  // ── Load per-video gates & progress when the player opens ────
  // Admins don't have progress/attempts of their own — skip entirely.
  // They preview videos without burning view counts (already enforced
  // below) and aren't gated by assessments.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!currentVideo || !currentUser?.id) {
        setGates([])
        setProgressRows([])
        passedThisSessionRef.current = new Set()
        return
      }
      if (currentUser.role === 'admin' || currentUser.role === 'assistant') {
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
        console.error('gate/progress load failed', err)
      }
    }
    run()
    return () => { cancelled = true }
  }, [currentVideo?.id, currentUser?.id, quizTick])

  // ── Helpers ──────────────────────────────────────────────────
  // A gate with part_id = null guards the WHOLE video; one with a part_id
  // guards only that part. `unlocked` is the server's word — we never derive
  // it from a score here, because the client is not told the score.
  const gatesForPart = (part) =>
    gates.filter(g => g.trigger_type === 'before' && (!g.part_id || g.part_id === part?.id))

  const findBlockingGate = (video, part) => {
    if (!part || gates.length === 0) return null
    for (const g of gatesForPart(part)) {
      // Just-unlocked gates are remembered in a ref so the immediate retry in
      // handleGateUnlock doesn't re-block on an un-refreshed cache.
      if (passedThisSessionRef.current.has(g.video_assessment_id)) continue
      if (!g.unlocked) return g
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
  const selectGrade = (gradeId) => { setCurrentGrade(gradeId); setView('videos'); window.scrollTo(0, 0) }
  const goBackToGrades = () => {
    if (userRole !== 'admin' && userRole !== 'assistant') return // students don't go back to grade picker
    setCurrentGrade(''); setCurrentVideo(null); setSelectedPart(null); setView('grades'); window.scrollTo(0, 0)
  }
  const goBackToVideos = () => {
    // Confirm before leaving an actively-playing part so a mistouch
    // doesn't burn a view-counter (or close mid-video for the student).
    // Admins are exempt — they preview without using attempts.
    if (selectedPart && userRole !== 'admin' && userRole !== 'assistant') {
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

    if (userRole === 'admin' || userRole === 'assistant' || !currentUser?.id || !selectedPart || !currentVideo) return

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

    // Trigger timestamp-based assessments (mid-video checkpoints). These are
    // preserved from the legacy quizzes feature — the migration carried them
    // across as gates with trigger_type = 'timestamp'.
    if (activeGate) return

    for (const g of gates) {
      if (g.trigger_type !== 'timestamp') continue
      if (g.part_id && g.part_id !== selectedPart.id) continue
      const tSec = parseInt(g.timestamp_seconds, 10)
      if (!Number.isFinite(tSec) || seconds < tSec) continue

      if (g.unlocked || passedThisSessionRef.current.has(g.video_assessment_id)) continue

      if (g.attempts_remaining <= 0) {
        // Out of attempts — seek back so we don't loop the modal open.
        showAlertModal(
          'انتهت محاولاتك',
          `لقد استنفدت جميع المحاولات (${g.allowed_attempts}) في "${g.title}" ولم تجتزه. يُرجى التواصل مع المعلم.`
        )
        handleSeekToNote(Math.max(0, tSec - 5))
        return
      }

      // Playback pauses via forcePause, which is bound to activeGate.
      setPendingPart(selectedPart)
      setActiveGate(g)
      return
    }
  }
  const openVideoPlayer = (video) => {
    const isAllowedByPackage = allowedContentIds.has(video.id)
    if (userRole !== 'admin' && userRole !== 'assistant' && currentUser?.is_active === false && !isAllowedByPackage) {
      setShowLockModal(true)
      return
    }
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
  // Lock screen mode while a student is actively watching a part:
  //   • exit guard intercepts back-button + tab-close
  //   • body class hides the global Header / Footer so the only way out
  //     is the page's own back button (which calls confirmExit)
  // Admins are exempt — they preview videos without view-counter cost.
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

  const goToAddVideo = () => {
    localStorage.setItem('selectedVideoGrade', uiToDbGrade(currentGrade) || currentGrade)
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
    // `gates` is not a videos column — it belongs to video_assessments and is
    // synced separately, after the parts are written (a gate scoped to a part
    // added in this same save needs that part's fresh id).
    const { gates: gatePatch, ...videoPatch } = patch
    try {
      const saved = await updateVideo(editVideo.id, videoPatch)
      if (gatePatch) {
        await syncVideoAssessments(
          editVideo.id,
          gatesToPayload(gatePatch, saved.parts || []),
          { created_by: currentUser?.id || null }
        )
      }
      invalidateCache('videos')
      invalidateGateCache()
      // Refresh the entire videos list from Supabase so all nested parts and
      // IDs stay in sync.
      await refreshVideos()
      setEditVideo(null)
    } catch (err) {
      showAlertModal('خطأ', err.message || 'تعذر حفظ التعديلات')
    }
  }

  const handleToggleArchive = async (video, e) => {
    e?.stopPropagation()
    try {
      await setVideoArchived(video.id, !video.isArchived)
      invalidateCache('videos')
      await refreshVideos()
      notify(video.isArchived ? 'تم إلغاء أرشفة الفيديو بنجاح' : 'تم أرشفة الفيديو بنجاح')
    } catch (err) {
      showAlertModal('خطأ', err.message || 'حدث خطأ أثناء تغيير حالة الأرشيف')
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
  const playVideoPart = async (part, overrideVideo = null) => {
    const activeVid = overrideVideo || currentVideo
    const now = new Date()
    const expiryDate = effectiveExpiryFor(activeVid)
    if (expiryDate && now > expiryDate) {
      return showAlertModal('خطأ', 'انتهت صلاحية إتاحة هذا الفيديو')
    }

    // Trial-cap gate (per-part view limit). Admins are exempt — they need
    // to be able to preview content without burning trials.
    if (userRole !== 'admin' && userRole !== 'assistant') {
      const left = partTrialsLeft(activeVid, part)
      if (left <= 0) {
        return showAlertModal(
          'انتهت محاولاتك',
          `لقد استخدمت كل محاولات مشاهدة هذا الجزء (${partViewCap(activeVid, part)}). تواصل مع المعلم للحصول على محاولات إضافية.`
        )
      }
    }

    // Pre-video assessment gate. This check is a courtesy for the UI only —
    // the real enforcement is start_pre_video_attempt() + the unlock row, so
    // skipping past this in devtools gains a student nothing.
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

    if (!selectedPart || userRole === 'admin' || userRole === 'assistant' || !currentUser?.id || !currentVideo?.id) return

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

  const handleGateUnlock = () => {
    // Remember the unlock synchronously — findBlockingGate reads this ref so
    // the immediate retry below doesn't get tricked into re-prompting while
    // the refreshed gate status is still in flight.
    if (activeGate?.video_assessment_id) {
      passedThisSessionRef.current.add(activeGate.video_assessment_id)
    }
    setActiveGate(null)
    invalidateGateCache()
    setQuizTick(t => t + 1) // re-fetch gate status so the lock flips
    const part = pendingPart
    setPendingPart(null)
    if (part) setTimeout(() => playVideoPart(part), 50)
  }

  const handleGateClose = () => {
    // A mid-video checkpoint that wasn't passed: seek back 5s so closing the
    // modal isn't a way to skip past it.
    if (activeGate && activeGate.trigger_type === 'timestamp') {
      const unlocked = passedThisSessionRef.current.has(activeGate.video_assessment_id)
      if (!unlocked) {
        handleSeekToNote(Math.max(0, (activeGate.timestamp_seconds || 0) - 5))
      }
    }
    setActiveGate(null)
    setPendingPart(null)
    invalidateGateCache()
    setQuizTick(t => t + 1) // reflect the attempts-used bump in the UI
  }

  // ── Render ───────────────────────────────────────────────────
  // Anti-screenshot label — student name + phone tiled across the video
  // page only when actually playing a part. Admins are exempt so they
  // can debug freely; the rest of the app stays unguarded so students
  // can screenshot bug reports etc.
  const guardActive = view === 'player' && !!selectedPart && userRole !== 'admin' && userRole !== 'assistant'
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
            {filteredLevels.map((key, index) => {
              const m = levelsMeta[key]
              if (!m) return null
              const count = (videosByLevel[key] || []).length
              return (
                <button
                  key={key}
                  className={`prep-card prep-${m.accent}`}
                  style={{
                    animation: 'fadeInCard 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
                    animationDelay: `${index * 0.06}s`
                  }}
                  onClick={() => selectGrade(key)}
                >
                  <div className="prep-cover">
                    <div className="prep-cover-deco" />
                    <PrepIllustration kind={key} stage={m.en} />
                  </div>
                  <div className="prep-body">
                    <h3>{m.ar}</h3>
                    <p>{m.desc}</p>
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
          <div className="premium-page-header">
            <div className="premium-header-content">
              <span className="premium-pre-title">المحاضرات المرئية</span>
              <h1 id="gradeTitle" className="premium-title-main">
                الفيديوهات التعليمية
                <span className="premium-title-accent">
                  ({levelsMeta[currentGrade]?.ar || ''})
                </span>
              </h1>
              <p className="premium-subtitle-desc">
                {(userRole === 'admin' || userRole === 'assistant')
                  ? 'إدارة المحاضرات والدروس المصورة لهذه المرحلة الدراسية'
                  : 'شاهد المحاضرات والدروس المصورة المتاحة لمرحلتك الدراسية'}
              </p>
            </div>
            <div className="premium-header-actions">
              {(userRole === 'admin' || userRole === 'assistant') && (
                <button className="premium-back-btn" onClick={goBackToGrades}>
                  <i className="fas fa-arrow-right"></i> العودة للصفوف
                </button>
              )}
              {(userRole === 'admin' || userRole === 'assistant') && (
                <button className="premium-action-btn btn-primary" onClick={goToAddVideo}>
                  <i className="fas fa-plus"></i> إضافة فيديو جديد
                </button>
              )}
            </div>
          </div>

          {(userRole === 'admin' || userRole === 'assistant') && (
            <div style={{
              display: 'flex',
              gap: 12,
              marginBottom: 20,
              background: 'rgba(255,255,255,0.02)',
              padding: '6px 8px',
              borderRadius: 12,
              width: 'fit-content',
              border: '1.5px solid var(--border-color, rgba(255,255,255,0.06))'
            }}>
              <button
                type="button"
                onClick={() => setShowArchived(false)}
                style={{
                  background: !showArchived ? 'var(--primary-gradient, linear-gradient(135deg, #667eea 0%, #764ba2 100%))' : 'transparent',
                  color: !showArchived ? '#fff' : 'var(--text-secondary, #a0aec0)',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: 8,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                🎬 الفيديوهات النشطة
              </button>
              <button
                type="button"
                onClick={() => setShowArchived(true)}
                style={{
                  background: showArchived ? 'var(--primary-gradient, linear-gradient(135deg, #667eea 0%, #764ba2 100%))' : 'transparent',
                  color: showArchived ? '#fff' : 'var(--text-secondary, #a0aec0)',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: 8,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                📦 الأرشيف
              </button>
            </div>
          )}

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} id="videosGrid">
              {playlistGroups.map((group) => {
                const isExpanded = expandedPlaylists[group.id] !== false
                return (
                  <div key={group.id} className="playlist-section" style={{
                    background: 'var(--card-bg, #1e1e2f)',
                    border: '1.5px solid var(--border-color, rgba(255,255,255,0.06))',
                    borderRadius: 16,
                    overflow: 'hidden'
                  }}>
                    {/* Playlist Header Accordion Trigger */}
                    <div
                      onClick={() => togglePlaylistExpanded(group.id)}
                      style={{
                        padding: '16px 20px',
                        background: 'rgba(124, 58, 237, 0.05)',
                        borderBottom: isExpanded ? '1.5px solid var(--border-color, rgba(255,255,255,0.06))' : 'none',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <i className={`fas ${group.id === 'general' ? 'fa-folder-open' : 'fa-list-check'}`} style={{ color: '#7c3aed', fontSize: '1.2rem' }}></i>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{group.title}</h3>
                          {group.description && <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{group.description}</p>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{
                          fontSize: '0.75rem',
                          background: 'rgba(124, 58, 237, 0.12)',
                          color: '#a78bfa',
                          padding: '3px 8px',
                          borderRadius: 8,
                          fontWeight: 'bold'
                        }}>
                          {group.videos.length} فيديو
                        </span>
                        <i className={`fas ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`} style={{ color: '#a78bfa' }}></i>
                      </div>
                    </div>

                    {/* Videos Grid inside Playlist */}
                    {isExpanded && (
                      <div className="videos-grid" style={{ padding: 20 }}>
                        {group.videos.map((video, index) => {
                          const expiry = effectiveExpiryFor(video)
                          const notExpired = !expiry || new Date() < expiry
                          // Card status reflects BOTH the toggle (allowed flag) and the
                          // expiry window. If either says "no", the dot turns red.
                          const isAvailable = notExpired && isVideoAllowed(video)
                          const hours = effectiveHoursFor(video)
                          let formattedExpiry = '—'
                          if (expiry) {
                            try {
                              formattedExpiry = expiry.toLocaleDateString('ar-EG', {
                                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                                hour: '2-digit', minute: '2-digit'
                              })
                            } catch {
                              formattedExpiry = expiry.toLocaleDateString()
                            }
                          }

                          return (
                            <div
                              key={video.id}
                              className="vc-card"
                              style={{ animationDelay: `${index * 0.05}s` }}
                              onClick={() => openVideoPlayer(video)}
                            >
                              <div className={`vc-status-bar ${isAvailable ? 'vc-available' : 'vc-unavailable'}`}>
                                <span className="vc-status-dot" />
                                <span>{isAvailable ? 'متاح' : 'غير متاح'}</span>
                                {(userRole === 'admin' || userRole === 'assistant') && (
                                  <>
                                    <button className="vc-delete-btn" onClick={(e) => handleToggleArchive(video, e)} style={{ marginInlineEnd: 6, background: 'rgba(255,255,255,0.08)' }}>
                                      {video.isArchived ? '📦 إلغاء الأرشيف' : '📦 أرشفة'}
                                    </button>
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
                                  <span className="vc-stat-label">نوع المحتوى</span>
                                  <span className="vc-stat-value">{video.totalParts > 1 ? `${video.totalParts} أجزاء` : 'فيديو كامل'}</span>
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
                      </div>
                    )}
                  </div>
                )
              })}
              {!loading && playlistGroups.length === 0 && (
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
      {view === 'player' && currentVideo && (
        <VideoPlayerWorkspace
          video={currentVideo}
          selectedPart={selectedPart}
          onSelectPart={playVideoPart}
          onBack={goBackToVideos}
          backLabel="العودة للفيديوهات"
          levelEyebrow={levelsMeta[currentGrade]?.ar}
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

      {/* Pre-Video Assessment gate */}
      {activeGate && currentVideo && currentUser && (
        <AssessmentRunner
          gate={activeGate}
          onUnlock={handleGateUnlock}
          onClose={handleGateClose}
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
   auto-extraction, Bunny Stream uploading, and pre-video assessments. */
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

function BunnyUploader({ part, title, onChange }) {
  const [file, setFile] = useState(null)
  const [pct, setPct] = useState(0)
  const [status, setStatus] = useState(part.bunnyVideoId ? 'done' : 'idle')
  const [error, setError] = useState('')

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

function EditVideoModal({ video, onCancel, onSave }) {
  const { isGradeEnabled, gradesList } = useTenant()
  const [title, setTitle] = useState(video.title || '')
  const [desc, setDesc] = useState(video.description || '')
  const [grade, setGrade] = useState(video.grade || 'first-prep')
  const [hours, setHours] = useState(video.activeHours || 24)
  const [busy, setBusy] = useState(false)
  const [pdfFile, setPdfFile] = useState(null)
  const [uploadPct, setUploadPct] = useState(0)
  const [currentPdfUrl, setCurrentPdfUrl] = useState(video.pdf_url || null)
  const [currentPdfKey, setCurrentPdfKey] = useState(video.pdf_key || null)
  const [pdfCleared, setPdfCleared] = useState(false)

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

  // Pre-video assessment gates. These live in their own table now, so unlike
  // parts they can't be seeded from the `video` prop — we fetch them.
  const [gates, setGates] = useState([])
  const [gatesLoading, setGatesLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await listVideoAssessments(video.id)
        if (!cancelled) setGates(payloadToGates(rows, video.parts || []))
      } catch (err) {
        console.error('failed to load pre-video assessments', err)
      } finally {
        if (!cancelled) setGatesLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [video.id])

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

    // Validate the pre-video assessments. The database re-checks all of it;
    // these messages just fail fast in Arabic before the round trip.
    const gateError = validateGates(gates)
    if (gateError) {
      notify(gateError, { type: 'warning' })
      return null
    }

    return {
      title: title.trim(),
      description: desc.trim() || null,
      grade,
      active_hours: parseInt(hours, 10) || 24,
      gates,
      parts: videoParts.map(p => {
        const src = p.source === 'drive' ? 'drive'
          : p.source === 'bunny' ? 'bunny'
            : 'youtube'
        const mins = parseFloat(p.durationMinutes)
        const libId = parseInt(p.bunnyLibraryId, 10)

        const formattedPart = {
          title: p.title.trim(),
          source: src,
          youtube_id: src === 'youtube' ? p.videoId.trim() : null,
          drive_id: src === 'drive' ? p.driveId.trim() : null,
          bunny_video_id: src === 'bunny' ? p.bunnyVideoId.trim() : null,
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
    let uploadedKey = null
    let uploadedUrl = null
    try {
      if (pdfFile) {
        setUploadPct(1)
        const { key, publicUrl } = await uploadLecturePdf(pdfFile, {
          onProgress: (p) => setUploadPct(Math.max(1, p)),
        })
        uploadedKey = key
        uploadedUrl = publicUrl
      }

      const finalPayload = {
        ...payload,
      }
      if (uploadedUrl) {
        finalPayload.pdf_url = uploadedUrl
        finalPayload.pdf_key = uploadedKey
      } else if (pdfCleared) {
        finalPayload.pdf_url = null
        finalPayload.pdf_key = null
      }

      await onSave(finalPayload)
      notify('تم تعديل الفيديو بنجاح!', { type: 'success' })
    } catch (err) {
      if (uploadedKey || uploadedUrl) {
        deleteR2Object({ key: uploadedKey, url: uploadedUrl }).catch(() => {})
      }
      notify(err.message || 'حدث خطأ أثناء تعديل الفيديو', { type: 'warning' })
    } finally {
      setBusy(false)
      setUploadPct(0)
    }
  }

  const gradeNames = {
    'first-prep': 'الصف الأول الإعدادي',
    'second-prep': 'الصف الثاني الإعدادي',
    'third-prep': 'الصف الثالث الإعدادي',
    'first-sec': 'الصف الأول الثانوي',
    'second-sec': 'الصف الثاني الثانوي',
    'third-sec': 'الصف الثالث الثانوي'
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
          font-family: 'Tajawal', sans-serif;
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
          font-family: 'Tajawal', sans-serif;
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
          font-family: 'Tajawal', sans-serif;
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
                {gradesList.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
                <option value="packages">باقات مدفوعة 📦</option>
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

          <div className="edit-field" style={{ border: '1px dashed rgba(167, 139, 250, 0.2)', borderRadius: 12, padding: 15, background: 'rgba(255,255,255,0.01)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fas fa-file-pdf" style={{ color: '#ef4444' }}></i>
              <span>مذكرة / ملخص المحاضرة (ملف PDF) - اختياري</span>
            </label>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              {currentPdfUrl && !pdfCleared ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, padding: '10px 12px', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 10, background: 'rgba(16, 185, 129, 0.05)' }}>
                  <i className="fas fa-circle-check" style={{ color: '#10b981' }}></i>
                  <span style={{ flex: 1, color: '#f7fafc', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    هناك مذكرة مرفوعة بالفعل للمحاضرة.
                  </span>
                  <button type="button" className="edit-btn-sm edit-btn-delete" style={{ margin: 0 }} onClick={() => { setPdfCleared(true); setPdfFile(null); }}>
                    حذف المذكرة
                  </button>
                </div>
              ) : (
                <label htmlFor="edit-pdf-file-input" style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                  border: '1.5px dashed rgba(167, 139, 250, 0.25)', borderRadius: 12, background: 'rgba(255,255,255,0.02)',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  flex: 1,
                  color: '#e2e8f0', fontWeight: 500,
                }}>
                  <i className="fas fa-cloud-arrow-up" style={{ color: '#ef4444', fontSize: '1.2rem' }}></i>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.9rem' }}>
                    {pdfFile ? pdfFile.name : 'اختر ملف PDF جديد للمحاضرة'}
                  </span>
                  {pdfFile && (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {(pdfFile.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  )}
                </label>
              )}
              <input
                id="edit-pdf-file-input"
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  setPdfFile(e.target.files?.[0] || null)
                  setPdfCleared(false)
                }}
                style={{ display: 'none' }}
                disabled={busy}
              />
              {pdfFile && (
                <button
                  type="button"
                  className="edit-btn-sm edit-btn-delete"
                  style={{ margin: 0 }}
                  onClick={() => setPdfFile(null)}
                  disabled={busy}
                >
                  إلغاء
                </button>
              )}
              {pdfCleared && !pdfFile && (
                <button
                  type="button"
                  className="edit-btn-sm"
                  style={{ margin: 0 }}
                  onClick={() => {
                    setPdfCleared(false)
                    setPdfFile(null)
                  }}
                  disabled={busy}
                >
                  تراجع عن الحذف
                </button>
              )}
            </div>
            {uploadPct > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ height: 6, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${uploadPct}%`, height: '100%', background: 'var(--gradient-primary)', transition: 'width .15s ease' }} />
                </div>
                <span style={{ fontSize: 12, color: '#a0aec0' }}>جاري رفع المذكرة... {uploadPct}%</span>
              </div>
            )}
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
                    <small style={{ color: 'var(--text-secondary)', fontSize: 12, display: 'block', marginTop: 4 }}>
                      سيتم استخراج معرّف الفيديو تلقائياً إذا قمت بلصق الرابط بالكامل.
                    </small>
                    <div style={{ marginTop: 6, padding: '6px 10px', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.25)', borderRadius: '6px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                      <strong style={{ color: '#eab308' }}>⚠️ ملاحظة:</strong> اضبط خصوصية الفيديو في يوتيوب على <strong>«غير مدرج» (Unlisted)</strong> ليعمل داخل المنصة.
                    </div>
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

          {/* ── Pre-Video Assessment ──────────────────────────────
               Replaces the old inline quiz builder: the teacher attaches an
               existing امتحان or تسميع, sets attempts + pass mark, and the
               server does the grading and unlocking. */}
          {gatesLoading ? (
            <div className="pae" style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>
              <i className="fas fa-spinner fa-spin"></i> جاري تحميل التقييمات...
            </div>
          ) : (
            <PreAssessmentEditor
              gates={gates}
              onChange={setGates}
              parts={videoParts}
              grade={grade}
            />
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
              <div><strong>الصف:</strong> {gradesList?.find(g => g.id === previewData.grade)?.name || (previewData.grade === 'packages' ? 'باقات مدفوعة 📦' : previewData.grade)}</div>
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

            {previewData.gates && previewData.gates.length > 0 && (
              <div>
                <h4 style={{ color: '#10b981', borderBottom: '1px solid rgba(16, 185, 129, 0.2)', paddingBottom: 6 }}>التقييمات المطلوبة:</h4>
                {previewData.gates.map((g, gi) => (
                  <div key={g.localKey || gi} style={{ padding: 15, background: 'rgba(255,255,255,0.02)', borderRadius: 8, marginBottom: 12 }}>
                    <strong>{g.assessment_type === 'tasmee3' ? 'تسميع' : 'امتحان'}</strong>
                    {' '}&middot; التفعيل:{' '}
                    <code>
                      {g.trigger_type === 'timestamp'
                        ? `أثناء المشاهدة عند الثانية ${g.timestamp_seconds ?? 0}`
                        : (g.part_index === '' || g.part_index == null)
                          ? 'كامل الفيديو'
                          : `جزء ${Number(g.part_index) + 1}`}
                    </code>
                    {' '}&middot; النجاح: <code>{g.passing_score}%</code>
                    {' '}&middot; المحاولات:{' '}
                    <code>{g.allowed_attempts === 0 ? 'غير محدود' : g.allowed_attempts}</code>
                    {!g.is_enabled && <span style={{ color: '#f59e0b' }}> &middot; موقوف</span>}
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

/* Route all PDFs through Google Docs Viewer on every platform so the
   browser never falls back to its native viewer (which has a built-in
   download/print toolbar the user can access).
   We then clip the viewer's own toolbar row off-screen with a negative-
   margin trick: the wrapper is overflow-hidden, the iframe is pushed up
   48 px so Google's header is above the visible area, and the container
   height grows by the same amount to compensate so the page content
   is still fully visible. */
function PdfInline({ url, title }) {
  const src = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`
  const CLIP = 48  // px height of the Google Docs Viewer toolbar
  return (
    <div
      tabIndex={-1}
      style={{
        width: '100%', height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
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
