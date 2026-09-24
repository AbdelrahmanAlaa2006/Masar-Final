import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { selectInChunks } from '@backend/fetchAllRows'
import {
  listCourseChapters,
  listCourseLectures,
  getLectureDetails,
  checkContentUnlocked,
  getLectureFileAccess,
  withLectureLocks
} from '@backend/courseLecturesApi'
import { supabase } from '@backend/supabase'
import { useAuth } from '../contexts/AuthContext'
import { notify } from '../utils/notify'
import PrerequisiteLockModal from './PrerequisiteLockModal'
import { subscribeToPrerequisiteUnlocked } from '../utils/unlockEvents'
import './StudentCurriculumView.css'

const GRADE_LABELS = {
  sec1: 'الصف الأول الثانوي',
  sec2: 'الصف الثاني الثانوي',
  sec3: 'الصف الثالث الثانوي',
  prep1: 'الصف الأول الإعدادي',
  prep2: 'الصف الثاني الإعدادي',
  prep3: 'الصف الثالث الإعدادي',
  general: 'عام'
}

export default function StudentCurriculumView({
  package: pkgProp,
  pkg: pkgAlias,
  onSelectVideo,
  onSelectExam,
  onDownloadFile,
  onLockedClick,
  onBack
}) {
  const pkg = pkgProp || pkgAlias
  const { user } = useAuth()

  // ── State ─────────────────────────────────────────────────────────────
  const [chapters, setChapters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedChapters, setExpandedChapters] = useState({})
  const [expandedLectures, setExpandedLectures] = useState({})
  const [searchQuery, setSearchQuery] = useState('')

  // Student operational progress & attempts
  const [videoProgressMap, setVideoProgressMap] = useState({}) // { [videoId]: [progressRows] }
  const [examAttemptsMap, setExamAttemptsMap] = useState({})   // { [examId]: [attemptRows] }

  // Action busy states
  const [downloadingFileId, setDownloadingFileId] = useState(null)
  const [activeLockModal, setActiveLockModal] = useState(null)

  // ── Data Fetching ─────────────────────────────────────────────────────
  const loadCurriculum = useCallback(async () => {
    if (!pkg?.id) return
    setLoading(true)
    setError(null)

    try {
      // 1. Fetch Chapters for package
      const rawChapters = await listCourseChapters(pkg.id)

      // 2. Parallel fetch lectures and details for all chapters
      const chapsWithDetails = await Promise.all(
        rawChapters.map(async (chap) => {
          const rawLectures = await listCourseLectures(chap.id)

          const detailedLectures = await Promise.all(
            rawLectures.map(async (lec) => {
              try {
                const details = await getLectureDetails(lec.id)
                // Students get their prerequisite locks; staff see everything open.
                if (user?.role !== 'student') {
                  return { ...details, lockStatus: { unlocked: true }, files: details.files || [] }
                }
                const locked = await withLectureLocks(details)
                return { ...locked, files: details.files || [] }
              } catch (err) {
                console.error(`Error loading details for lecture ${lec.id}:`, err)
                return {
                  ...lec,
                  videos: [],
                  exams: [],
                  files: [],
                  lockStatus: { unlocked: true }
                }
              }
            })
          )

          return {
            ...chap,
            lectures: detailedLectures
          }
        })
      )

      // 3. Batch fetch student progress and exam attempts for operational status
      const allVideoIds = []
      const allExamIds = []
      chapsWithDetails.forEach((c) => {
        (c.lectures || []).forEach((l) => {
          (l.videos || []).forEach((v) => allVideoIds.push(v.id))
          (l.exams || []).forEach((e) => allExamIds.push(e.id))
        })
      })

      const vProgMap = {}
      const exAttMap = {}

      if (user?.id && (allVideoIds.length > 0 || allExamIds.length > 0)) {
        const fetchJobs = []

        if (allVideoIds.length > 0) {
          // Chunked: every id travels in the request URL, and a large
          // curriculum would push a single request past the gateway limit.
          fetchJobs.push(
            selectInChunks(Array.from(new Set(allVideoIds)), (part) => supabase
              .from('video_progress')
              .select('video_id, part_id, seconds_watched, views_used')
              .eq('student_id', user.id)
              .in('video_id', part)
              .order('video_id', { ascending: true }))
              .then((data) => {
                data.forEach((row) => {
                  if (!vProgMap[row.video_id]) vProgMap[row.video_id] = []
                  vProgMap[row.video_id].push(row)
                })
              })
              .catch((err) => console.warn('Could not fetch video progress:', err))
          )
        }

        if (allExamIds.length > 0) {
          fetchJobs.push(
            selectInChunks(Array.from(new Set(allExamIds)), (part) => supabase
              .from('exam_attempts')
              .select('exam_id, score, max_score, submitted_at')
              .eq('student_id', user.id)
              .in('exam_id', part)
              .not('submitted_at', 'is', null)
              .is('video_assessment_id', null)
              .order('exam_id', { ascending: true }))
              .then((data) => {
                data.forEach((row) => {
                  if (!exAttMap[row.exam_id]) exAttMap[row.exam_id] = []
                  exAttMap[row.exam_id].push(row)
                })
              })
              .catch((err) => console.warn('Could not fetch exam attempts:', err))
          )
        }

        await Promise.all(fetchJobs)
      }

      setChapters(chapsWithDetails)
      setVideoProgressMap(vProgMap)
      setExamAttemptsMap(exAttMap)

      // Automatically expand the first chapter by default
      if (rawChapters.length > 0) {
        setExpandedChapters((prev) => {
          if (Object.keys(prev).length === 0) {
            return { [rawChapters[0].id]: true }
          }
          return prev
        })
      }
    } catch (err) {
      console.error('Failed to load curriculum:', err)
      setError(err.message || 'تعذر تحميل المنهج الدراسي')
    } finally {
      setLoading(false)
    }
  }, [pkg?.id, user?.id, user?.role])

  useEffect(() => {
    loadCurriculum()
  }, [loadCurriculum])

  // ── Phase 7 Step 3: Reactive Unlock Listener ──────────────────────────
  useEffect(() => {
    let isSubscribed = true

    const unsubscribe = subscribeToPrerequisiteUnlocked(async (detail) => {
      if (!isSubscribed) return

      const { unlockTargetType, unlockTargetId, contextLectureId } = detail || {}
      if (!unlockTargetType || !unlockTargetId) return

      // Authoritative access revalidation: verify against backend RPC checkContentUnlocked
      try {
        const reval = await checkContentUnlocked({
          targetType: unlockTargetType,
          targetId: unlockTargetId,
          contextLectureId: contextLectureId || null
        })

        if (!isSubscribed) return

        // Update UI only if backend authoritatively confirms unlocked: true
        if (reval?.unlocked === true) {
          // 1. Close prerequisite modal if currently open for this target
          setActiveLockModal((prev) => {
            if (prev && String(prev.target?.id) === String(unlockTargetId)) {
              return null
            }
            return prev
          })

          // 2. Update affected content's lock status immediately in state
          setChapters((prevChapters) => {
            return prevChapters.map((chap) => ({
              ...chap,
              lectures: (chap.lectures || []).map((lec) => {
                // If contextLectureId is specified, only update matching lecture context
                if (contextLectureId && String(lec.id) !== String(contextLectureId)) {
                  return lec
                }

                // If target is the lecture itself
                if (unlockTargetType === 'lecture' && String(lec.id) === String(unlockTargetId)) {
                  return { ...lec, lockStatus: reval }
                }

                // If target is a video within this lecture
                if (unlockTargetType === 'video') {
                  const updatedVideos = (lec.videos || []).map((v) => {
                    if (String(v.id) === String(unlockTargetId)) {
                      return { ...v, lockStatus: reval }
                    }
                    return v
                  })
                  return { ...lec, videos: updatedVideos }
                }

                // If target is an exam within this lecture
                if (unlockTargetType === 'exam') {
                  const updatedExams = (lec.exams || []).map((e) => {
                    if (String(e.id) === String(unlockTargetId)) {
                      return { ...e, lockStatus: reval }
                    }
                    return e
                  })
                  return { ...lec, exams: updatedExams }
                }

                return lec
              })
            }))
          })

          // 3. Trigger curriculum reload in background to sync cascade dependencies
          loadCurriculum()
        }
        // If reval?.unlocked is false or reval is null: do NOT unlock. Fail safely.
      } catch (err) {
        console.warn('StudentCurriculumView unlock revalidation failed, keeping content locked:', err)
        // Fail safely: keep content locked
      }
    })

    return () => {
      isSubscribed = false
      unsubscribe()
    }
  }, [loadCurriculum])

  // ── Accordion Toggles ─────────────────────────────────────────────────
  const toggleChapter = (chapId) => {
    setExpandedChapters((prev) => ({
      ...prev,
      [chapId]: !prev[chapId]
    }))
  }

  const toggleLecture = (lecId) => {
    setExpandedLectures((prev) => ({
      ...prev,
      [lecId]: !prev[lecId]
    }))
  }

  const expandAll = () => {
    const allChaps = {}
    const allLecs = {}
    chapters.forEach((c) => {
      allChaps[c.id] = true
      ;(c.lectures || []).forEach((l) => {
        allLecs[l.id] = true
      })
    })
    setExpandedChapters(allChaps)
    setExpandedLectures(allLecs)
  }

  const collapseAll = () => {
    setExpandedChapters({})
    setExpandedLectures({})
  }

  // ── Formatter Helpers ─────────────────────────────────────────────────
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return 'ملف PDF'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatSeconds = (seconds) => {
    if (!seconds || seconds <= 0) return null
    const mins = Math.round(seconds / 60)
    if (mins < 60) return `${mins} دقيقة`
    const hrs = Math.floor(mins / 60)
    const remMins = mins % 60
    return remMins > 0 ? `${hrs} ساعة و ${remMins} دقيقة` : `${hrs} ساعة`
  }

  // ── Content Status Helpers ────────────────────────────────────────────
  const getVideoWatchStatus = (video) => {
    const progressRows = videoProgressMap[video.id] || []
    if (progressRows.length === 0) return { label: 'لم تبدأ بعد', status: 'unstarted' }

    const parts = video.video_parts || []
    const totalPartsCount = parts.length || 1
    const watchedPartsCount = progressRows.filter((p) => (p.seconds_watched || 0) > 30 || (p.views_used || 0) > 0).length

    if (watchedPartsCount >= totalPartsCount && watchedPartsCount > 0) {
      return { label: 'مكتمل ✅', status: 'done' }
    }
    if (watchedPartsCount > 0 || progressRows.some((p) => (p.seconds_watched || 0) > 0)) {
      return { label: `قيد المشاهدة (${watchedPartsCount}/${totalPartsCount})`, status: 'wip' }
    }
    return { label: 'لم تبدأ بعد', status: 'unstarted' }
  }

  const getExamStatus = (exam) => {
    const attempts = examAttemptsMap[exam.id] || []
    if (attempts.length === 0) return { label: 'لم يبدأ بعد', status: 'unstarted', bestScore: null }

    const bestScorePercent = Math.max(
      ...attempts.map((a) => Math.round(((a.score || 0) / (a.max_score || 1)) * 100)),
      0
    )

    return {
      label: `محاولات: ${attempts.length}${exam.max_attempts ? ` / ${exam.max_attempts}` : ''}`,
      status: 'submitted',
      bestScore: exam.reveal_grades !== false ? bestScorePercent : null
    }
  }

  // ── Curriculum Aggregate Statistics ───────────────────────────────────
  const stats = useMemo(() => {
    let chaptersCount = chapters.length
    let lecturesCount = 0
    let videosCount = 0
    let examsCount = 0
    let filesCount = 0

    let completedVideosCount = 0
    let submittedExamsCount = 0

    chapters.forEach((c) => {
      const lecs = c.lectures || []
      lecturesCount += lecs.length
      lecs.forEach((l) => {
        const vids = l.videos || []
        const exs = l.exams || []
        const fls = l.files || []

        videosCount += vids.length
        examsCount += exs.length
        filesCount += fls.length

        vids.forEach((v) => {
          const st = getVideoWatchStatus(v)
          if (st.status === 'done') completedVideosCount++
        })

        exs.forEach((e) => {
          const st = getExamStatus(e)
          if (st.status === 'submitted') submittedExamsCount++
        })
      })
    })

    const totalTrackableItems = videosCount + examsCount
    const completedItems = completedVideosCount + submittedExamsCount
    const overallProgressPercent =
      totalTrackableItems > 0 ? Math.min(100, Math.round((completedItems / totalTrackableItems) * 100)) : 0

    return {
      chaptersCount,
      lecturesCount,
      videosCount,
      examsCount,
      filesCount,
      overallProgressPercent,
      completedItems,
      totalTrackableItems
    }
  }, [chapters, videoProgressMap, examAttemptsMap])

  // ── Filtering ─────────────────────────────────────────────────────────
  const filteredChapters = useMemo(() => {
    if (!searchQuery.trim()) return chapters
    const q = searchQuery.trim().toLowerCase()

    return chapters
      .map((chap) => {
        const chapMatches =
          chap.title?.toLowerCase().includes(q) || chap.description?.toLowerCase().includes(q)

        const matchingLectures = (chap.lectures || []).filter((lec) => {
          const lecMatches =
            lec.title?.toLowerCase().includes(q) || lec.description?.toLowerCase().includes(q)
          const vidMatches = (lec.videos || []).some((v) => v.title?.toLowerCase().includes(q))
          const examMatches = (lec.exams || []).some((e) => e.title?.toLowerCase().includes(q))
          const fileMatches = (lec.files || []).some((f) => f.title?.toLowerCase().includes(q))
          return lecMatches || vidMatches || examMatches || fileMatches
        })

        if (chapMatches || matchingLectures.length > 0) {
          return {
            ...chap,
            lectures: matchingLectures.length > 0 ? matchingLectures : chap.lectures
          }
        }
        return null
      })
      .filter(Boolean)
  }, [chapters, searchQuery])

  // ── Item Action Click Handlers ────────────────────────────────────────
  const handleVideoClick = (video, lecture) => {
    if (video.lockStatus?.unlocked === false) {
      const lockData = {
        type: 'video',
        target: video,
        contextLecture: lecture,
        contextLectureId: lecture.id,
        lockStatus: video.lockStatus
      }
      if (onLockedClick) {
        onLockedClick(lockData)
      } else {
        setActiveLockModal(lockData)
      }
      return
    }

    if (onSelectVideo) {
      onSelectVideo(video, lecture)
    } else {
      notify(`تم اختيار الفيديو: ${video.title}`, { type: 'info' })
    }
  }

  const handleExamClick = (exam, lecture) => {
    if (exam.lockStatus?.unlocked === false) {
      const lockData = {
        type: 'exam',
        target: exam,
        contextLecture: lecture,
        contextLectureId: lecture.id,
        lockStatus: exam.lockStatus
      }
      if (onLockedClick) {
        onLockedClick(lockData)
      } else {
        setActiveLockModal(lockData)
      }
      return
    }

    if (onSelectExam) {
      onSelectExam(exam, lecture)
    } else {
      notify(`تم اختيار الامتحان: ${exam.title}`, { type: 'info' })
    }
  }

  const handleFileDownload = async (file, lecture) => {
    if (lecture.lockStatus?.unlocked === false) {
      const lockData = {
        type: 'file',
        target: file,
        contextLecture: lecture,
        contextLectureId: lecture.id,
        lockStatus: lecture.lockStatus
      }
      if (onLockedClick) {
        onLockedClick(lockData)
      } else {
        setActiveLockModal(lockData)
      }
      return
    }

    if (onDownloadFile) {
      onDownloadFile(file, lecture)
      return
    }

    // Default authoritative secure R2 download using deployed Edge Function
    try {
      setDownloadingFileId(file.id)
      const accessRes = await getLectureFileAccess({
        fileId: file.id,
        contextLectureId: lecture.id
      })

      if (accessRes?.downloadUrl) {
        window.open(accessRes.downloadUrl, '_blank')
        notify(`جاري تحميل ملف: ${file.title} 📄`, { type: 'success' })
      } else {
        throw new Error('تعذر إنشاء رابط التحميل الآمن')
      }
    } catch (err) {
      console.error('File download error:', err)
      notify(err.message || 'فشل تحميل الملف', { type: 'error' })
    } finally {
      setDownloadingFileId(null)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="scv-container" dir="rtl">
        <div className="scv-header">
          <div className="scv-skeleton-line" style={{ width: '40%', height: 28 }}></div>
          <div className="scv-skeleton-line" style={{ width: '70%', height: 16 }}></div>
          <div className="scv-skeleton-line" style={{ width: '100%', height: 12, marginTop: 16 }}></div>
        </div>
        <div className="scv-skeleton-wrap">
          <div className="scv-skeleton-card">
            <div className="scv-skeleton-line" style={{ width: '50%', height: 24 }}></div>
            <div className="scv-skeleton-line" style={{ width: '90%', height: 16 }}></div>
          </div>
          <div className="scv-skeleton-card">
            <div className="scv-skeleton-line" style={{ width: '45%', height: 24 }}></div>
            <div className="scv-skeleton-line" style={{ width: '80%', height: 16 }}></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="scv-container" dir="rtl">
        <div className="scv-error-banner">
          <i className="fas fa-triangle-exclamation" style={{ fontSize: '2rem', marginBottom: 10 }}></i>
          <h3>حدث خطأ أثناء تحميل المنهج الدراسي</h3>
          <p>{error}</p>
          <button onClick={loadCurriculum} className="scv-retry-btn">
            <i className="fas fa-arrow-rotate-right"></i>
            <span>إعادة المحاولة</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="scv-container" dir="rtl">
      {/* ── Level 1: Course / Package Header ───────────────────────────── */}
      <section className="scv-header">
        <div className="scv-header-top">
          <div className="scv-header-main">
            {onBack && (
              <button onClick={onBack} className="scv-back-btn" title="الرجوع للباقات">
                <i className="fas fa-arrow-right"></i>
                <span>رجوع للباقات</span>
              </button>
            )}
            <div className="scv-title-area">
              <h1>
                <span>{pkg?.title || 'المنهج الدراسي'}</span>
                {pkg?.grade && (
                  <span className="scv-pkg-badge scv-badge-grade">
                    {GRADE_LABELS[pkg.grade] || pkg.grade}
                  </span>
                )}
                {pkg?.price !== undefined && (
                  <span className="scv-pkg-badge scv-badge-price">
                    {pkg.price > 0 ? `${pkg.price} ج.م` : 'مجانية'}
                  </span>
                )}
              </h1>
              {pkg?.description && <p>{pkg.description}</p>}
            </div>
          </div>
        </div>

        {/* Overall Curriculum Progress Bar */}
        <div className="scv-progress-section">
          <div className="scv-progress-info">
            <span>
              <i className="fas fa-chart-line" style={{ marginInlineEnd: 6, color: '#6366f1' }}></i>
              إنجازك العام في المنهج
            </span>
            <span>{stats.overallProgressPercent}%</span>
          </div>
          <div className="scv-progress-bar-wrap">
            <div
              className="scv-progress-bar-fill"
              style={{ width: `${stats.overallProgressPercent}%` }}
            ></div>
          </div>
        </div>

        {/* Hierarchy Stats Chips */}
        <div className="scv-stats-bar">
          <div className="scv-stat-pill pill-blue">
            <i className="fas fa-folder"></i>
            <span>{stats.chaptersCount} فصول دراسية</span>
          </div>
          <div className="scv-stat-pill pill-purple">
            <i className="fas fa-chalkboard-teacher"></i>
            <span>{stats.lecturesCount} محاضرات</span>
          </div>
          <div className="scv-stat-pill pill-orange">
            <i className="fas fa-play-circle"></i>
            <span>{stats.videosCount} فيديوهات</span>
          </div>
          <div className="scv-stat-pill pill-green">
            <i className="fas fa-file-alt"></i>
            <span>{stats.examsCount} امتحانات</span>
          </div>
          <div className="scv-stat-pill">
            <i className="fas fa-file-pdf" style={{ color: '#dc2626' }}></i>
            <span>{stats.filesCount} ملفات PDF</span>
          </div>
        </div>
      </section>

      {/* ── Search & Filter Toolbar ─────────────────────────────────────── */}
      <div className="scv-toolbar">
        <div className="scv-search-wrap">
          <i className="fas fa-search"></i>
          <input
            type="text"
            className="scv-search-input"
            placeholder="ابحث عن محاضرة أو فيديو أو امتحان..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={expandAll} className="scv-expand-all-btn">
            <i className="fas fa-angles-down"></i>
            <span>توسيع الكل</span>
          </button>
          <button onClick={collapseAll} className="scv-expand-all-btn">
            <i className="fas fa-angles-up"></i>
            <span>طي الكل</span>
          </button>
        </div>
      </div>

      {/* ── Level 2: Chapters List ─────────────────────────────────────── */}
      {filteredChapters.length === 0 ? (
        <div className="scv-empty-box">
          <div className="scv-empty-icon">
            <i className="fas fa-book-open"></i>
          </div>
          <h3>{searchQuery ? 'لا توجد نتائج مطابقة لبحثك' : 'لا توجد فصول دراسية متاحة حالياً'}</h3>
          <p>
            {searchQuery
              ? 'جرّب البحث بكلمات أخرى أو امسح شريط البحث'
              : 'سيقوم المدرس بإضافة الفصول والمحاضرات التعليمية قريباً.'}
          </p>
        </div>
      ) : (
        <div className="scv-chapters-list">
          {filteredChapters.map((chap, chapIndex) => {
            const isChapExpanded = !!expandedChapters[chap.id]
            const lectures = chap.lectures || []

            return (
              <article
                key={chap.id}
                className={`scv-chapter-card ${isChapExpanded ? 'is-active-chapter' : ''}`}
              >
                {/* Chapter Accordion Header */}
                <header
                  className="scv-chapter-header"
                  onClick={() => toggleChapter(chap.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleChapter(chap.id)}
                >
                  <div className="scv-chapter-header-left">
                    <div className="scv-chapter-icon-box">
                      <i className="fas fa-book-bookmark"></i>
                    </div>
                    <div className="scv-chapter-title-box">
                      <h3>
                        <span>
                          الفصل {chapIndex + 1}: {chap.title}
                        </span>
                      </h3>
                      {chap.description && <p>{chap.description}</p>}
                    </div>
                  </div>

                  <div className="scv-chapter-header-right">
                    <span className="scv-stat-pill pill-purple" style={{ fontSize: '0.78rem' }}>
                      {lectures.length} محاضرات
                    </span>
                    <div className={`scv-chevron-icon ${isChapExpanded ? 'open' : ''}`}>
                      <i className="fas fa-chevron-down"></i>
                    </div>
                  </div>
                </header>

                {/* Chapter Accordion Body (Lectures) */}
                {isChapExpanded && (
                  <div className="scv-chapter-body">
                    {lectures.length === 0 ? (
                      <div className="scv-empty-box" style={{ padding: '24px 16px', margin: '16px 0 0 0' }}>
                        <i className="fas fa-chalkboard" style={{ fontSize: '1.8rem', color: '#cbd5e1' }}></i>
                        <p style={{ marginTop: 8 }}>لا توجد محاضرات في هذا الفصل بعد.</p>
                      </div>
                    ) : (
                      <div className="scv-lectures-list">
                        {lectures.map((lec, lecIndex) => {
                          const isLecLocked = lec.lockStatus?.unlocked === false
                          const isLecExpanded =
                            expandedLectures[lec.id] !== undefined
                              ? expandedLectures[lec.id]
                              : true // Default lectures to open for effortless viewing

                          const videos = lec.videos || []
                          const exams = lec.exams || []
                          const files = lec.files || []

                          return (
                            <div
                              key={lec.id}
                              className={`scv-lecture-card ${
                                isLecLocked ? 'is-locked' : 'is-unlocked'
                              }`}
                            >
                              {/* Lecture Header */}
                              <div className="scv-lecture-header">
                                <div className="scv-lecture-title-box">
                                  <h4>
                                    <span className="scv-lecture-badge-num">
                                      محاضرة {lecIndex + 1}
                                    </span>
                                    <span>{lec.title}</span>
                                    {isLecLocked ? (
                                      <span className="scv-lock-badge locked">
                                        <i className="fas fa-lock"></i> مقفلة بمتطلب سابق
                                      </span>
                                    ) : (
                                      <span className="scv-lock-badge unlocked">
                                        <i className="fas fa-lock-open"></i> متاحة
                                      </span>
                                    )}
                                  </h4>
                                  {lec.description && <p>{lec.description}</p>}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => toggleLecture(lec.id)}
                                  className="scv-expand-all-btn"
                                  style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                >
                                  <i
                                    className={`fas fa-chevron-${isLecExpanded ? 'up' : 'down'}`}
                                  ></i>
                                  <span>{isLecExpanded ? 'إخفاء المحتوى' : 'عرض المحتوى'}</span>
                                </button>
                              </div>

                              {/* ── Prerequisite Notification Callout ────────── */}
                              {isLecLocked && lec.lockStatus && (
                                <div className="scv-prereq-alert">
                                  <div className="scv-prereq-alert-text">
                                    <i className="fas fa-shield-halved"></i>
                                    <div>
                                      <span>يتطلب فتح هذه المحاضرة اجتياز: </span>
                                      <strong>
                                        {lec.lockStatus.required_exam_title || 'الامتحان المشروط'}
                                      </strong>{' '}
                                      بنسبة نجاح{' '}
                                      <span className="scv-prereq-score-tag">
                                        {lec.lockStatus.required_score || 70}%
                                      </span>{' '}
                                      فأكثر.
                                      {lec.lockStatus.student_score !== undefined && (
                                        <span style={{ display: 'block', marginTop: 3, fontSize: '0.82rem' }}>
                                          درجتك الحالية: {lec.lockStatus.student_score}%
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const lockData = {
                                        type: 'lecture',
                                        target: lec,
                                        contextLecture: lec,
                                        contextLectureId: lec.id,
                                        lockStatus: lec.lockStatus
                                      }
                                      if (onLockedClick) {
                                        onLockedClick(lockData)
                                      } else {
                                        setActiveLockModal(lockData)
                                      }
                                    }}
                                    className="scv-prereq-action-btn"
                                  >
                                    <i className="fas fa-key"></i>
                                    <span>تفاصيل المتطلب</span>
                                  </button>
                                </div>
                              )}

                              {/* ── Level 4: Content Sections (Videos, Exams, Files) ── */}
                              {isLecExpanded && (
                                <>
                                  {/* 1. Videos Section */}
                                  {videos.length > 0 && (
                                    <div className="scv-content-block">
                                      <div className="scv-content-block-title">
                                        <i className="fas fa-play-circle" style={{ color: '#d97706' }}></i>
                                        <span>الفيديوهات والشروحات ({videos.length})</span>
                                      </div>
                                      <div className="scv-content-grid">
                                        {videos.map((vid) => {
                                          const isVidLocked =
                                            isLecLocked || vid.lockStatus?.unlocked === false
                                          const parts = vid.video_parts || []
                                          const totalSecs = parts.reduce(
                                            (acc, p) => acc + (p.duration_seconds || 0),
                                            0
                                          )
                                          const watchSt = getVideoWatchStatus(vid)

                                          return (
                                            <div
                                              key={vid.id}
                                              className={`scv-item-card ${
                                                isVidLocked ? 'is-item-locked' : ''
                                              }`}
                                            >
                                              <div className="scv-item-top">
                                                <div className="scv-item-icon icon-video">
                                                  <i className="fas fa-video"></i>
                                                </div>
                                                <div className="scv-item-meta">
                                                  <h5 className="scv-item-title" title={vid.title}>
                                                    {vid.title}
                                                  </h5>
                                                  <div className="scv-item-chips">
                                                    {parts.length > 0 && (
                                                      <span className="scv-chip">
                                                        <i className="fas fa-layer-group"></i>
                                                        {parts.length === 1
                                                          ? 'جزء واحد'
                                                          : `${parts.length} أجزاء`}
                                                      </span>
                                                    )}
                                                    {totalSecs > 0 && (
                                                      <span className="scv-chip">
                                                        <i className="fas fa-clock"></i>
                                                        {formatSeconds(totalSecs)}
                                                      </span>
                                                    )}
                                                    <span
                                                      className={`scv-chip ${
                                                        watchSt.status === 'done'
                                                          ? 'chip-status-done'
                                                          : watchSt.status === 'wip'
                                                          ? 'chip-status-wip'
                                                          : ''
                                                      }`}
                                                    >
                                                      {watchSt.label}
                                                    </span>
                                                  </div>
                                                </div>
                                              </div>

                                              <button
                                                type="button"
                                                onClick={() => handleVideoClick(vid, lec)}
                                                className={`scv-item-btn ${
                                                  isVidLocked ? 'btn-locked' : 'btn-play'
                                                }`}
                                              >
                                                {isVidLocked ? (
                                                  <>
                                                    <i className="fas fa-lock"></i>
                                                    <span>محتوى مقفل</span>
                                                  </>
                                                ) : (
                                                  <>
                                                    <i className="fas fa-play"></i>
                                                    <span>مشاهدة الفيديو</span>
                                                  </>
                                                )}
                                              </button>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {/* 2. Exams Section */}
                                  {exams.length > 0 && (
                                    <div className="scv-content-block">
                                      <div className="scv-content-block-title">
                                        <i className="fas fa-file-alt" style={{ color: '#4f46e5' }}></i>
                                        <span>الامتحانات والتقييمات ({exams.length})</span>
                                      </div>
                                      <div className="scv-content-grid">
                                        {exams.map((exam) => {
                                          const isExamLocked =
                                            isLecLocked || exam.lockStatus?.unlocked === false
                                          const examSt = getExamStatus(exam)

                                          return (
                                            <div
                                              key={exam.id}
                                              className={`scv-item-card ${
                                                isExamLocked ? 'is-item-locked' : ''
                                              }`}
                                            >
                                              <div className="scv-item-top">
                                                <div className="scv-item-icon icon-exam">
                                                  <i className="fas fa-pen-to-square"></i>
                                                </div>
                                                <div className="scv-item-meta">
                                                  <h5 className="scv-item-title" title={exam.title}>
                                                    {exam.title}
                                                  </h5>
                                                  <div className="scv-item-chips">
                                                    {exam.questions_count !== undefined && (
                                                      <span className="scv-chip">
                                                        <i className="fas fa-list-check"></i>
                                                        {exam.questions_count} سؤال
                                                      </span>
                                                    )}
                                                    {exam.total_points !== undefined && (
                                                      <span className="scv-chip">
                                                        <i className="fas fa-award"></i>
                                                        {exam.total_points} درجة
                                                      </span>
                                                    )}
                                                    {exam.duration_minutes > 0 && (
                                                      <span className="scv-chip">
                                                        <i className="fas fa-stopwatch"></i>
                                                        {exam.duration_minutes} دقيقة
                                                      </span>
                                                    )}
                                                    {examSt.bestScore !== null && (
                                                      <span className="scv-chip chip-score">
                                                        الدرجة: {examSt.bestScore}%
                                                      </span>
                                                    )}
                                                    <span className="scv-chip">
                                                      {examSt.label}
                                                    </span>
                                                  </div>
                                                </div>
                                              </div>

                                              <button
                                                type="button"
                                                onClick={() => handleExamClick(exam, lec)}
                                                className={`scv-item-btn ${
                                                  isExamLocked ? 'btn-locked' : 'btn-exam'
                                                }`}
                                              >
                                                {isExamLocked ? (
                                                  <>
                                                    <i className="fas fa-lock"></i>
                                                    <span>امتحان مقفل</span>
                                                  </>
                                                ) : (
                                                  <>
                                                    <i className="fas fa-pen"></i>
                                                    <span>بدء / عرض الامتحان</span>
                                                  </>
                                                )}
                                              </button>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {/* 3. PDF Files Section */}
                                  {files.length > 0 && (
                                    <div className="scv-content-block">
                                      <div className="scv-content-block-title">
                                        <i className="fas fa-file-pdf" style={{ color: '#dc2626' }}></i>
                                        <span>المذكرات وملفات الـ PDF ({files.length})</span>
                                      </div>
                                      <div className="scv-content-grid">
                                        {files.map((file) => {
                                          const isFileLocked = isLecLocked
                                          const isDownloadingThis = downloadingFileId === file.id

                                          return (
                                            <div
                                              key={file.id}
                                              className={`scv-item-card ${
                                                isFileLocked ? 'is-item-locked' : ''
                                              }`}
                                            >
                                              <div className="scv-item-top">
                                                <div className="scv-item-icon icon-pdf">
                                                  <i className="fas fa-file-pdf"></i>
                                                </div>
                                                <div className="scv-item-meta">
                                                  <h5 className="scv-item-title" title={file.title}>
                                                    {file.title}
                                                  </h5>
                                                  <div className="scv-item-chips">
                                                    <span className="scv-chip">
                                                      <i className="fas fa-hard-drive"></i>
                                                      {formatBytes(file.file_size)}
                                                    </span>
                                                    {file.file_key && (
                                                      <span className="scv-chip">
                                                        <i className="fas fa-shield-check"></i>
                                                        محمي عبر Cloudflare R2
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>

                                              <button
                                                type="button"
                                                onClick={() => handleFileDownload(file, lec)}
                                                disabled={isDownloadingThis}
                                                className={`scv-item-btn ${
                                                  isFileLocked ? 'btn-locked' : 'btn-pdf'
                                                }`}
                                              >
                                                {isFileLocked ? (
                                                  <>
                                                    <i className="fas fa-lock"></i>
                                                    <span>الملف مقفل</span>
                                                  </>
                                                ) : isDownloadingThis ? (
                                                  <>
                                                    <i className="fas fa-spinner fa-spin"></i>
                                                    <span>جاري تجهيز الرابط...</span>
                                                  </>
                                                ) : (
                                                  <>
                                                    <i className="fas fa-download"></i>
                                                    <span>تحميل الملزمة الآمن</span>
                                                  </>
                                                )}
                                              </button>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {/* Empty Lecture Content Notice */}
                                  {videos.length === 0 && exams.length === 0 && files.length === 0 && (
                                    <div
                                      style={{
                                        padding: '16px',
                                        textAlign: 'center',
                                        color: '#94a3b8',
                                        fontSize: '0.88rem'
                                      }}
                                    >
                                      <i
                                        className="fas fa-circle-info"
                                        style={{ marginInlineEnd: 6 }}
                                      ></i>
                                      <span>سيتم إضافة محتوى هذه المحاضرة قريباً.</span>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {/* ── Prerequisite Lock Modal ────────────────────────────────────── */}
      {activeLockModal && (
        <PrerequisiteLockModal
          isOpen={!!activeLockModal}
          lockInfo={activeLockModal}
          onClose={() => setActiveLockModal(null)}
          onStartExam={(examPayload) => {
            setActiveLockModal(null)
            if (onSelectExam) {
              onSelectExam(examPayload.exam, examPayload.contextLecture)
            } else {
              notify(`جاري فتح الامتحان المشروط: ${examPayload.exam?.title || 'الامتحان المشروط'}`, { type: 'info' })
            }
          }}
        />
      )}
    </div>
  )
}
