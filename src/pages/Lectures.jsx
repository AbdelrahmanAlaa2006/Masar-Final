import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTenant } from '../contexts/TenantContext'
import {
  getStandaloneLecturesWithDetails,
  listStandaloneChapters,
  getChapterLecturesWithDetails,
  createCourseChapter,
  createCourseLecture,
  updateCourseLecture,
  deleteCourseLecture,
  setLectureArchived,
  addVideoToLecture,
  removeVideoFromLecture,
  addExamToLecture,
  removeExamFromLecture,
  addLectureFile,
  removeLectureFile,
  checkContentUnlocked,
  getLectureFileAccess,
  createUnlockRule
} from '@backend/courseLecturesApi'
import { listVideos, createVideo } from '@backend/videosApi'
import { listExams, createExam } from '@backend/examsApi'
import { listPackages, listMyPurchases } from '@backend/packagesApi'
import GradePicker from '../components/GradePicker'
import { uploadLecturePdf } from '@backend/r2'
import { saveExamSharedBlocks } from '@backend/examSharedBlocksApi'
import {
  listOverridesForTarget,
  listEffectiveOverrides,
  upsertOverride,
  deleteOverride,
  groupTargetId
} from '@backend/overridesApi'
import { listStudentsPaged } from '@backend/profilesApi'
import { listGroups } from '@backend/groupsApi'
import { supabase } from '@backend/supabase'
import { notify } from '../utils/notify'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog'
import PrerequisiteLockModal from '../components/PrerequisiteLockModal'
import StudentCurriculumView from '../components/StudentCurriculumView'
import YouTubePlayer from '../components/YouTubePlayer'
import DrivePlayer from '../components/DrivePlayer'
import BunnyPlayer from '../components/BunnyPlayer'
import ScreenGuard from '../components/ScreenGuard'
import QuestionImagePicker from '../components/QuestionImagePicker'
import SharedTextBlocksEditor, { editorBlocksToPayload } from '../components/SharedTextBlocksEditor'
import { parseNaturalFormat as parseQuestionsNatural } from '../utils/questionUtils'
import './Lectures.css'

const DEFAULT_GRADES = [
  { id: 'first-prep', name: 'الصف الأول الإعدادي' },
  { id: 'second-prep', name: 'الصف الثاني الإعدادي' },
  { id: 'third-prep', name: 'الصف الثالث الإعدادي' },
  { id: 'sec1', name: 'الصف الأول الثانوي' },
  { id: 'sec2', name: 'الصف الثاني الثانوي' },
  { id: 'sec3', name: 'الصف الثالث الثانوي' }
]

export function getLectureAvailabilityInfo(lec) {
  if (!lec) {
    return { status: 'unlimited', label: 'متاحة دائماً', detail: 'إتاحة مستمرة', icon: 'fa-infinity', colorClass: 'unlimited' }
  }

  // Check if explicitly locked or disabled
  if (lec.is_active === false || lec.allowed === false) {
    return { status: 'locked', label: 'غير متاحة حالياً', detail: 'تم تعطيل الوصول لهذه المحاضرة', icon: 'fa-lock', colorClass: 'expired' }
  }

  if (lec.available_until) {
    const untilDate = new Date(lec.available_until)
    const now = new Date()
    const diffMs = untilDate.getTime() - now.getTime()
    if (diffMs <= 0) {
      return {
        status: 'expired',
        label: 'انتهت الإتاحة',
        detail: `انتهت في ${untilDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}`,
        icon: 'fa-clock-rotate-left',
        colorClass: 'expired'
      }
    }
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays >= 1) {
      return {
        status: 'active',
        label: `متبقي ${diffDays} ${diffDays === 1 ? 'يوم' : diffDays === 2 ? 'يومان' : 'أيام'}`,
        detail: `متاحة حتى ${untilDate.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
        icon: 'fa-calendar-days',
        colorClass: diffDays <= 2 ? 'urgent' : 'active'
      }
    }
    return {
      status: 'urgent',
      label: diffHours > 0 ? `متبقي ${diffHours} س` : `متبقي أقل من ساعة`,
      detail: `متاحة حتى ${untilDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`,
      icon: 'fa-hourglass-half',
      colorClass: 'urgent'
    }
  }

  if (lec.available_hours) {
    if (lec.created_at) {
      const createdDate = new Date(lec.created_at)
      const expiryDate = new Date(createdDate.getTime() + lec.available_hours * 60 * 60 * 1000)
      const diffMs = expiryDate.getTime() - Date.now()
      if (diffMs <= 0) {
        return {
          status: 'expired',
          label: 'انتهت الإتاحة',
          detail: `انتهت فترة الـ ${lec.available_hours} ساعة`,
          icon: 'fa-clock-rotate-left',
          colorClass: 'expired'
        }
      }
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
      return {
        status: 'active',
        label: `متبقي ${diffHours} س`,
        detail: `متاحة لمدة ${lec.available_hours} ساعة`,
        icon: 'fa-stopwatch',
        colorClass: diffHours <= 6 ? 'urgent' : 'active'
      }
    }
    return {
      status: 'active',
      label: `متاحة ${lec.available_hours} ساعة`,
      detail: `متاحة لمدة ${lec.available_hours} ساعة من النشر`,
      icon: 'fa-stopwatch',
      colorClass: 'active'
    }
  }

  return {
    status: 'unlimited',
    label: 'متاحة دائماً',
    detail: 'إتاحة مستمرة بدون حد زمني',
    icon: 'fa-infinity',
    colorClass: 'unlimited'
  }
}

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

export default function Lectures() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user: currentUser, role: userRole, hasPermission } = useAuth()
  const { tenantId, gradesList } = useTenant()

  const canManage = useMemo(() => {
    return userRole === 'admin' || userRole === 'super_admin' || hasPermission('videos')
  }, [userRole, hasPermission])

  // ── Grade Options & Selection ─────────────────────────────────────────
  const gradeOptions = useMemo(() => {
    if (gradesList && gradesList.length > 0) {
      return gradesList.map((g) => ({ id: g.id, name: g.name }))
    }
    return DEFAULT_GRADES
  }, [gradesList])

  const [selectedGrade, setSelectedGrade] = useState(() => {
    if (userRole === 'student') {
      return currentUser?.grade || 'first-prep'
    }
    const searchParams = new URLSearchParams(location.search)
    const qGrade = searchParams.get('grade')
    if (qGrade) return qGrade
    if (currentUser?.grade) return currentUser.grade
    return gradeOptions[0]?.id || 'first-prep'
  })

  // Ensure student stays locked strictly to their own grade
  useEffect(() => {
    if (userRole === 'student' && currentUser?.grade && selectedGrade !== currentUser.grade) {
      setSelectedGrade(currentUser.grade)
    }
  }, [userRole, currentUser?.grade, selectedGrade])

  // ── Curriculum State ──────────────────────────────────────────────────
  const [standaloneLectures, setStandaloneLectures] = useState([])
  const [standaloneLessons, setStandaloneLessons] = useState([])
  const [packages, setPackages] = useState([])
  const [selectedPackage, setSelectedPackage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── Archive State & Filter Calculations ────────────────────────────────
  const [showArchived, setShowArchived] = useState(false)

  const totalActiveLectures = useMemo(() => {
    let count = standaloneLectures.filter(l => l.is_active !== false).length
    standaloneLessons.forEach(les => {
      count += (les.lectures || []).filter(l => l.is_active !== false).length
    })
    return count
  }, [standaloneLectures, standaloneLessons])

  const totalArchivedLectures = useMemo(() => {
    let count = standaloneLectures.filter(l => l.is_active === false).length
    standaloneLessons.forEach(les => {
      count += (les.lectures || []).filter(l => l.is_active === false).length
    })
    return count
  }, [standaloneLectures, standaloneLessons])

  const displayedStandaloneLectures = useMemo(() => {
    if (!canManage) return standaloneLectures
    if (showArchived) return standaloneLectures.filter(l => l.is_active === false)
    return standaloneLectures.filter(l => l.is_active !== false)
  }, [standaloneLectures, canManage, showArchived])

  const displayedLessons = useMemo(() => {
    if (!canManage) return standaloneLessons
    if (showArchived) {
      return standaloneLessons
        .map(les => ({
          ...les,
          lectures: (les.lectures || []).filter(l => l.is_active === false)
        }))
        .filter(les => (les.lectures || []).length > 0)
    }
    return standaloneLessons.map(les => ({
      ...les,
      lectures: (les.lectures || []).filter(l => l.is_active !== false)
    }))
  }, [standaloneLessons, canManage, showArchived])

  // Expand/Collapse state
  const [expandedLectures, setExpandedLectures] = useState({})
  const [expandedLessons, setExpandedLessons] = useState({})

  // Action busy states
  const [downloadingFileId, setDownloadingFileId] = useState(null)
  const [activeLockModal, setActiveLockModal] = useState(null)

  // ── Management Modals State (Admin / Teacher) ──────────────────────────
  const [modalType, setModalType] = useState(null)
  // 'create_lecture' | 'edit_lecture' | 'attach_video' | 'attach_exam' | 'upload_file'
  const [modalTarget, setModalTarget] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form Fields
  const [formTitle, setFormTitle] = useState('')
  const [formGrade, setFormGrade] = useState('')
  const [formChapterId, setFormChapterId] = useState('')
  const [formPackageId, setFormPackageId] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formSortOrder, setFormSortOrder] = useState('10')
  const [formIsActive, setFormIsActive] = useState(true)

  // ── Video Theater (Click to start, does not autoplay attempts) ─────────
  const [isVideoStarted, setIsVideoStarted] = useState(false)

  // ── Lecture Availability Duration (Studio Creation / Edit) ───────────
  const [formAvailabilityPreset, setFormAvailabilityPreset] = useState('unlimited')
  const [formAvailableHours, setFormAvailableHours] = useState('')
  const [formAvailableUntil, setFormAvailableUntil] = useState('')

  // ── Availability & Extension Management Modal State ───────────────────
  const [availTargetLecture, setAvailTargetLecture] = useState(null)
  const [availScope, setAvailScope] = useState('all') // 'all' | 'prep' | 'group' | 'student'
  const [availTargetGrade, setAvailTargetGrade] = useState('')
  const [availTargetGroup, setAvailTargetGroup] = useState('')
  const [availTargetStudent, setAvailTargetStudent] = useState(null)
  const [availStudentSearch, setAvailStudentSearch] = useState('')
  const [availStudentResults, setAvailStudentResults] = useState([])
  const [availSearchingStudents, setAvailSearchingStudents] = useState(false)
  const [availAllGroups, setAvailAllGroups] = useState([])
  const [availActionType, setAvailActionType] = useState('extend_preset') // 'extend_preset' | 'set_until' | 'unlimited' | 'lock'
  const [availPresetHours, setAvailPresetHours] = useState(24)
  const [availCustomUntilDate, setAvailCustomUntilDate] = useState('')
  const [availActiveOverridesList, setAvailActiveOverridesList] = useState([])
  const [availLoadingOverrides, setAvailLoadingOverrides] = useState(false)

  // ── Lecture Studio Staged Items (Direct All-In-One Creation) ───────────
  const [stagedVideos, setStagedVideos] = useState([])
  const [stagedExams, setStagedExams] = useState([])
  const [stagedFiles, setStagedFiles] = useState([])
  const [quickAttachPicker, setQuickAttachPicker] = useState(null) // 'video' | 'exam' | null

  // ── Dedicated Lecture Learning Workspace (In-place Video & Materials) ───
  const [activeLectureView, setActiveLectureView] = useState(null)
  const [activeVideoItem, setActiveVideoItem] = useState(null)
  const [activeVideoPartIndex, setActiveVideoPartIndex] = useState(0)

  // ── Multi-Lecture Lesson Studio State ──────────────────────────────────
  const [creationMode, setCreationMode] = useState('lecture') // 'lecture' | 'lesson'
  const [formLessonTitle, setFormLessonTitle] = useState('')
  const [formLessonDesc, setFormLessonDesc] = useState('')
  const [lessonLectures, setLessonLectures] = useState([])
  const [activeLessonLecIdx, setActiveLessonLecIdx] = useState(0)

  // Item Attachment & Catalogs
  const [selectedItemId, setSelectedItemId] = useState('')
  const [allVideosCatalog, setAllVideosCatalog] = useState([])
  const [allExamsCatalog, setAllExamsCatalog] = useState([])
  const [catalogSearch, setCatalogSearch] = useState('')
  const [uploadFileObj, setUploadFileObj] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Confirm Delete Dialog
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // ── Load Curriculum Data (Optimized with Parallel Batching) ──────────
  const loadCurriculum = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const gradeFilter = selectedGrade === 'all' ? null : selectedGrade

      // 1 & 2 & 3: Run independent data fetches simultaneously in parallel
      const [rawStandalone, rawLessons, pkgList] = await Promise.all([
        getStandaloneLecturesWithDetails({ grade: gradeFilter }),
        listStandaloneChapters({ grade: gradeFilter }),
        (async () => {
          try {
            if (canManage) {
              const allPkgs = await listPackages(tenantId)
              return (allPkgs || []).filter((p) => !gradeFilter || p.grade === gradeFilter || !p.grade)
            } else if (currentUser?.id) {
              const purchases = await listMyPurchases(currentUser.id)
              return (purchases || [])
                .filter((p) => p.payment_status === 'approved' && p.packages)
                .map((p) => p.packages)
                .filter(Boolean)
                .filter((p) => !gradeFilter || p.grade === gradeFilter || !p.grade)
            }
          } catch (pkgErr) {
            console.warn('Optional packages fetch encountered error:', pkgErr)
          }
          return []
        })()
      ])

      // Resolve lessons lectures in parallel
      const lessonsWithDetails = await Promise.all(
        (rawLessons || []).map(async (les) => {
          const lecs = await getChapterLecturesWithDetails(les.id)
          return { ...les, lectures: lecs || [] }
        })
      )

      // 4. For Students: Evaluate prerequisite lock states efficiently
      let processedStandalone = rawStandalone || []
      let processedLessons = lessonsWithDetails

      if (userRole === 'student') {
        processedStandalone = await Promise.all(
          processedStandalone.map(async (lec) => {
            try {
              const lockRes = await checkContentUnlocked({ targetType: 'lecture', targetId: lec.id }).catch(() => ({ unlocked: true }))
              const lectureLockStatus = lockRes || { unlocked: true }

              let videosWithLock = lec.videos || []
              let examsWithLock = lec.exams || []

              if (lectureLockStatus.unlocked === false) {
                // If the lecture itself is locked, immediately lock children in-memory without individual DB calls!
                videosWithLock = videosWithLock.map((v) => ({
                  ...v,
                  lockStatus: {
                    unlocked: false,
                    reason: 'lecture_locked',
                    parent_lecture_id: lec.id,
                    required_exam_id: lectureLockStatus.required_exam_id,
                    required_exam_title: lectureLockStatus.required_exam_title,
                    required_score: lectureLockStatus.required_score,
                    student_score: lectureLockStatus.student_score
                  }
                }))
                examsWithLock = examsWithLock.map((e) => ({
                  ...e,
                  lockStatus: {
                    unlocked: false,
                    reason: 'lecture_locked',
                    parent_lecture_id: lec.id,
                    required_exam_id: lectureLockStatus.required_exam_id,
                    required_exam_title: lectureLockStatus.required_exam_title,
                    required_score: lectureLockStatus.required_score,
                    student_score: lectureLockStatus.student_score
                  }
                }))
              } else {
                // Only if lecture is unlocked, check child items
                const [videoLocks, examLocks] = await Promise.all([
                  Promise.all(
                    videosWithLock.map((v) =>
                      checkContentUnlocked({ targetType: 'video', targetId: v.id, contextLectureId: lec.id }).catch(() => ({ unlocked: true }))
                    )
                  ),
                  Promise.all(
                    examsWithLock.map((e) =>
                      checkContentUnlocked({ targetType: 'exam', targetId: e.id, contextLectureId: lec.id }).catch(() => ({ unlocked: true }))
                    )
                  )
                ])
                videosWithLock = videosWithLock.map((v, idx) => ({ ...v, lockStatus: videoLocks[idx] || { unlocked: true } }))
                examsWithLock = examsWithLock.map((e, idx) => ({ ...e, lockStatus: examLocks[idx] || { unlocked: true } }))
              }

              return {
                ...lec,
                lockStatus: lectureLockStatus,
                videos: videosWithLock,
                exams: examsWithLock
              }
            } catch {
              return lec
            }
          })
        )
      }

      // Apply Student Effective Overrides (custom extensions / restrictions)
      if (userRole === 'student' && currentUser?.id) {
        try {
          const effOverrides = await listEffectiveOverrides({
            studentId: currentUser.id,
            grade: currentUser.grade || selectedGrade,
            group: currentUser.group,
            itemType: 'lecture'
          })
          if (effOverrides && effOverrides.length > 0) {
            const ovMap = new Map()
            for (const o of effOverrides) ovMap.set(o.item_id, o)

            const applyOv = (l) => {
              const ov = ovMap.get(l.id)
              if (!ov) return l
              return {
                ...l,
                allowed: ov.allowed !== false,
                available_until: ov.available_until || l.available_until,
                available_hours: ov.available_hours || l.available_hours
              }
            }
            processedStandalone = processedStandalone.map(applyOv)
            processedLessons = processedLessons.map((les) => ({
              ...les,
              lectures: (les.lectures || []).map(applyOv)
            }))
          }
        } catch (ovErr) {
          console.warn('Failed loading student lecture overrides:', ovErr)
        }
      }

      setStandaloneLectures(processedStandalone)
      setStandaloneLessons(processedLessons)
      setPackages(pkgList)

      // Sync activeLectureView if open
      setActiveLectureView((prev) => {
        if (!prev) return null
        const found = processedStandalone.find((l) => l.id === prev.id)
        return found || prev
      })

      // Expand first standalone lecture by default if closed
      if (processedStandalone.length > 0) {
        setExpandedLectures((prev) => {
          if (Object.keys(prev).length === 0) {
            return { [processedStandalone[0].id]: true }
          }
          return prev
        })
      }
    } catch (err) {
      console.error('Failed to load lectures curriculum:', err)
      setError(err.message || 'تعذر تحميل المحاضرات والمنهج الدراسي')
    } finally {
      setLoading(false)
    }
  }, [selectedGrade, canManage, currentUser?.id, currentUser?.grade, currentUser?.group, tenantId, userRole])

  useEffect(() => {
    loadCurriculum()
  }, [loadCurriculum])

  // Handle Grade Change
  const handleGradeChange = (gradeId) => {
    setSelectedGrade(gradeId)
    const searchParams = new URLSearchParams(location.search)
    searchParams.set('grade', gradeId)
    navigate({ search: searchParams.toString() }, { replace: true })
  }

  // ── Expand/Collapse Toggles ───────────────────────────────────────────
  const toggleLecture = (lecId) => {
    setExpandedLectures((prev) => ({ ...prev, [lecId]: !prev[lecId] }))
  }

  const toggleLesson = (lesId) => {
    setExpandedLessons((prev) => ({ ...prev, [lesId]: !prev[lesId] }))
  }

  // ── Dedicated Lecture Workspace & Content Navigation ─────────────────
  const handleOpenLectureView = useCallback((lecture, targetVideo = null, contextLesson = null) => {
    if (!lecture) return
    let resolvedLesson = contextLesson
    if (!resolvedLesson) {
      resolvedLesson = standaloneLessons.find(
        (les) => les.id === lecture.chapter_id || les.lectures?.some((l) => l.id === lecture.id)
      ) || null
    }
    setActiveLectureView({ ...lecture, contextLesson: resolvedLesson })
    const firstVid = targetVideo || lecture.videos?.[0] || null
    setActiveVideoItem(firstVid)
    setActiveVideoPartIndex(0)
    setIsVideoStarted(false) // Video does NOT autoplay until student clicks the center start button
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [standaloneLessons])

  const handleSelectVideo = useCallback((video, lecture) => {
    if (!lecture) return
    setIsVideoStarted(false)
    handleOpenLectureView(lecture, video)
  }, [handleOpenLectureView])

  // Deep link from the home page: /lectures?video=<id> opens the lecture that
  // contains that video with the video selected. Locked content shows the
  // lock modal instead, like a normal click would.
  const deepLinkedVideo = useRef(null)
  useEffect(() => {
    const videoId = new URLSearchParams(location.search).get('video')
    if (loading || !videoId || deepLinkedVideo.current === videoId) return
    deepLinkedVideo.current = videoId
    const allLectures = [
      ...standaloneLectures,
      ...standaloneLessons.flatMap((les) => les.lectures || []),
    ]
    const lecture = allLectures.find((l) => (l.videos || []).some((v) => v.id === videoId))
    if (!lecture) return
    const video = lecture.videos.find((v) => v.id === videoId)
    const lock = lecture.lockStatus?.unlocked === false ? lecture.lockStatus
      : video.lockStatus?.unlocked === false ? video.lockStatus : null
    if (lock) {
      setActiveLockModal(lock)
      return
    }
    handleOpenLectureView(lecture, video)
  }, [loading, location.search, standaloneLectures, standaloneLessons, handleOpenLectureView])

  const handleSelectExam = useCallback((exam, lecture) => {
    if (!exam?.id) return
    const lectureParam = lecture?.id ? `&lecture=${encodeURIComponent(lecture.id)}&contextLectureId=${encodeURIComponent(lecture.id)}` : ''
    const lectureTitleParam = lecture?.title ? `&lectureTitle=${encodeURIComponent(lecture.title)}` : ''
    navigate(`/exam-taking?id=${encodeURIComponent(exam.id)}${lectureParam}${lectureTitleParam}`)
  }, [navigate])

  const handleDownloadFile = async (file, lecture) => {
    if (!file?.id || !lecture?.id) return
    setDownloadingFileId(file.id)
    try {
      const res = await getLectureFileAccess({ fileId: file.id, contextLectureId: lecture.id })
      if (res?.downloadUrl) {
        window.open(res.downloadUrl, '_blank', 'noopener,noreferrer')
      } else {
        notify('تعذر استخراج رابط تحميل الملف', 'danger')
      }
    } catch (err) {
      if (err.status === 423 && err.unlockStatus) {
        setActiveLockModal(err.unlockStatus)
      } else {
        notify(err.message || 'تعذر تحميل الملف', 'danger')
      }
    } finally {
      setDownloadingFileId(null)
    }
  }

  // ── Management Actions (Admin / Teacher) ──────────────────────────────
  const handleOpenCreateLecture = (targetChapter = null) => {
    setCreationMode('lecture')
    setFormTitle('')
    setFormLessonTitle('')
    setFormLessonDesc('')
    setLessonLectures([
      { id: 'sub_1', title: 'المحاضرة 1: الشرح والتأسيس', desc: '', stagedVideos: [], stagedExams: [], stagedFiles: [] },
      { id: 'sub_2', title: 'المحاضرة 2: التدريبات والامتحان', desc: '', stagedVideos: [], stagedExams: [], stagedFiles: [] }
    ])
    setActiveLessonLecIdx(0)
    setFormGrade(selectedGrade === 'all' ? (gradeOptions[0]?.id || 'first-prep') : selectedGrade)
    setFormChapterId(targetChapter?.id || '')
    setFormPackageId('')
    setFormDesc('')
    setFormSortOrder(String((standaloneLectures.length + 1) * 10))
    setFormIsActive(true)
    setFormAvailabilityPreset('unlimited')
    setFormAvailableHours('')
    setFormAvailableUntil('')
    setStagedVideos([])
    setStagedExams([])
    setStagedFiles([])
    setQuickAttachPicker(null)
    setModalTarget(null)
    setModalType('create_lecture')
  }

  // Sub-Lectures switcher for Lesson Mode
  const handleSwitchLessonLecture = (targetIdx) => {
    if (targetIdx === activeLessonLecIdx) return
    setLessonLectures((prev) =>
      prev.map((l, i) => {
        if (i === activeLessonLecIdx) {
          return {
            ...l,
            title: formTitle,
            stagedVideos: [...stagedVideos],
            stagedExams: [...stagedExams],
            stagedFiles: [...stagedFiles]
          }
        }
        return l
      })
    )

    const target = lessonLectures[targetIdx]
    if (target) {
      setFormTitle(target.title || `المحاضرة ${targetIdx + 1}`)
      setStagedVideos(target.stagedVideos || [])
      setStagedExams(target.stagedExams || [])
      setStagedFiles(target.stagedFiles || [])
      setActiveLessonLecIdx(targetIdx)
    }
  }

  const handleAddLessonSubLecture = () => {
    const updated = lessonLectures.map((l, i) => {
      if (i === activeLessonLecIdx) {
        return {
          ...l,
          title: formTitle,
          stagedVideos: [...stagedVideos],
          stagedExams: [...stagedExams],
          stagedFiles: [...stagedFiles]
        }
      }
      return l
    })

    const newIdx = updated.length
    const newLec = {
      id: `sub_${Date.now()}`,
      title: `المحاضرة ${newIdx + 1}`,
      desc: '',
      stagedVideos: [],
      stagedExams: [],
      stagedFiles: []
    }

    setLessonLectures([...updated, newLec])
    setFormTitle(newLec.title)
    setStagedVideos([])
    setStagedExams([])
    setStagedFiles([])
    setActiveLessonLecIdx(newIdx)
  }

  const handleRemoveLessonSubLecture = (idxToRemove, e) => {
    if (e) e.stopPropagation()
    if (lessonLectures.length <= 1) {
      return notify('يجب أن يحتوي الدرس على محاضرة واحدة على الأقل', 'warning')
    }
    const filtered = lessonLectures.filter((_, i) => i !== idxToRemove)
    setLessonLectures(filtered)
    const nextIdx = Math.max(0, activeLessonLecIdx >= filtered.length ? filtered.length - 1 : activeLessonLecIdx)
    setActiveLessonLecIdx(nextIdx)
    const nextLec = filtered[nextIdx]
    if (nextLec) {
      setFormTitle(nextLec.title)
      setStagedVideos(nextLec.stagedVideos || [])
      setStagedExams(nextLec.stagedExams || [])
      setStagedFiles(nextLec.stagedFiles || [])
    }
  }

  const handleOpenEditLecture = (lec, e) => {
    if (e) e.stopPropagation()
    setCreationMode('lecture')
    setModalTarget(lec)
    setFormTitle(lec.title || '')
    setFormGrade(lec.grade || selectedGrade)
    setFormChapterId(lec.chapter_id || '')
    setFormPackageId(lec.package_id || '')
    setFormDesc(lec.description || '')
    setFormSortOrder(String(lec.sort_order ?? 10))
    setFormIsActive(lec.is_active !== false)

    if (lec.available_until) {
      setFormAvailabilityPreset('until_date')
      const d = new Date(lec.available_until)
      const pad = (n) => String(n).padStart(2, '0')
      const formatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      setFormAvailableUntil(formatted)
      setFormAvailableHours('')
    } else if (lec.available_hours) {
      if ([24, 48, 168, 720].includes(lec.available_hours)) {
        setFormAvailabilityPreset(lec.available_hours === 24 ? '24h' : lec.available_hours === 48 ? '48h' : lec.available_hours === 168 ? '7d' : '30d')
      } else {
        setFormAvailabilityPreset('custom_hours')
        setFormAvailableHours(String(lec.available_hours))
      }
      setFormAvailableUntil('')
    } else {
      setFormAvailabilityPreset('unlimited')
      setFormAvailableHours('')
      setFormAvailableUntil('')
    }

    setModalType('edit_lecture')
  }

  // ── Availability & Extension Modal Actions ────────────────────────────
  const handleOpenAvailabilityModal = async (lec, e) => {
    if (e) e.stopPropagation()
    setAvailTargetLecture(lec)
    setAvailScope('all')
    setAvailTargetGrade(lec.grade || selectedGrade || 'first-prep')
    setAvailTargetGroup('')
    setAvailTargetStudent(null)
    setAvailStudentSearch('')
    setAvailStudentResults([])
    setAvailActionType('extend_preset')
    setAvailPresetHours(24)
    setAvailCustomUntilDate('')
    setModalType('manage_availability')

    // Fetch groups and active overrides for this lecture
    try {
      setAvailLoadingOverrides(true)
      const [groups, allOv] = await Promise.all([
        listGroups().catch(() => []),
        supabase.from('access_overrides').select('*').eq('item_id', lec.id).catch(() => ({ data: [] }))
      ])
      setAvailAllGroups(groups || [])
      setAvailActiveOverridesList(allOv?.data || [])
    } catch (err) {
      console.warn('Error fetching availability metadata:', err)
    } finally {
      setAvailLoadingOverrides(false)
    }
  }

  const handleSearchStudentsForAvailability = async (query) => {
    setAvailStudentSearch(query)
    if (!query || query.trim().length < 2) {
      setAvailStudentResults([])
      return
    }
    setAvailSearchingStudents(true)
    try {
      const res = await listStudentsPaged({
        search: query.trim(),
        grade: availTargetGrade || 'all',
        pageSize: 10
      })
      setAvailStudentResults(res?.rows || [])
    } catch (err) {
      console.warn('Error searching students:', err)
    } finally {
      setAvailSearchingStudents(false)
    }
  }

  const handleApplyAvailabilityExtension = async () => {
    if (!availTargetLecture?.id) return
    setIsSubmitting(true)
    try {
      let finalUntil = null
      let finalHours = null
      let isAllowed = true

      if (availActionType === 'lock') {
        isAllowed = false
      } else if (availActionType === 'unlimited') {
        finalUntil = null
        finalHours = null
        isAllowed = true
      } else if (availActionType === 'extend_preset') {
        finalHours = availPresetHours
        const baseTime = availTargetLecture.available_until && new Date(availTargetLecture.available_until) > new Date()
          ? new Date(availTargetLecture.available_until).getTime()
          : Date.now()
        finalUntil = new Date(baseTime + availPresetHours * 3600 * 1000).toISOString()
        isAllowed = true
      } else if (availActionType === 'set_until') {
        if (!availCustomUntilDate) {
          notify('يرجى اختيار تاريخ ووقت انتهاء الإتاحة', 'warning')
          setIsSubmitting(false)
          return
        }
        finalUntil = new Date(availCustomUntilDate).toISOString()
        isAllowed = true
      }

      if (availScope === 'all') {
        // Update lecture directly for all students
        await updateCourseLecture(availTargetLecture.id, {
          available_until: finalUntil,
          available_hours: finalHours,
          is_active: isAllowed
        })
        notify('تم تطبيق وتحديث إتاحة المحاضرة للجميع بنجاح ✨', 'success')
      } else if (availScope === 'student') {
        if (!availTargetStudent?.id) {
          notify('يرجى اختيار الطالب المراد تمديد المحاضرة له', 'warning')
          setIsSubmitting(false)
          return
        }
        await upsertOverride({
          scope: 'student',
          targetId: availTargetStudent.id,
          itemType: 'lecture',
          itemId: availTargetLecture.id,
          allowed: isAllowed,
          availableHours: finalHours,
          availableUntil: finalUntil
        })
        notify(`تم تمديد المحاضرة للطالب (${availTargetStudent.name}) بنجاح 👍`, 'success')
      } else if (availScope === 'group') {
        if (!availTargetGroup) {
          notify('يرجى اختيار أو كتابة اسم المجموعة', 'warning')
          setIsSubmitting(false)
          return
        }
        const targetComposite = groupTargetId(availTargetGrade || availTargetLecture.grade, availTargetGroup)
        await upsertOverride({
          scope: 'group',
          targetId: targetComposite,
          itemType: 'lecture',
          itemId: availTargetLecture.id,
          allowed: isAllowed,
          availableHours: finalHours,
          availableUntil: finalUntil
        })
        notify(`تم تمديد المحاضرة لمجموعة (${availTargetGroup}) بنجاح 👍`, 'success')
      } else if (availScope === 'prep') {
        await upsertOverride({
          scope: 'prep',
          targetId: availTargetGrade || availTargetLecture.grade,
          itemType: 'lecture',
          itemId: availTargetLecture.id,
          allowed: isAllowed,
          availableHours: finalHours,
          availableUntil: finalUntil
        })
        notify('تم تمديد المحاضرة للمرحلة الدراسية بالكامل بنجاح 👍', 'success')
      }

      setModalType(null)
      loadCurriculum()
    } catch (err) {
      console.error('Error applying availability extension:', err)
      notify(err.message || 'تعذر تطبيق التمديد', 'danger')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteLectureOverride = async (ov) => {
    try {
      await deleteOverride({
        scope: ov.scope,
        targetId: ov.target_id,
        itemType: ov.item_type || 'lecture',
        itemId: ov.item_id
      })
      notify('تم حذف الاستثناء بنجاح 👍', 'success')
      setAvailActiveOverridesList((prev) => prev.filter((x) => x.id !== ov.id))
      loadCurriculum()
    } catch (err) {
      notify(err.message || 'تعذر حذف الاستثناء', 'danger')
    }
  }

  // Staged Videos Handlers
  const handleAddFreshVideo = () => {
    const id = `new_vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    setStagedVideos((prev) => [
      ...prev,
      {
        id,
        isNew: true,
        title: `الجزء ${prev.length + 1}`,
        source: 'youtube',
        youtubeUrl: '',
        driveUrl: '',
        bunnyVideoId: '',
        durationMinutes: '',
        viewLimit: 3,
        activeHours: 24
      }
    ])
  }

  const handleUpdateStagedVideo = (id, field, value) => {
    setStagedVideos((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v
        if (field === 'youtubeUrl') {
          const extracted = extractYouTubeId(value)
          return { ...v, youtubeUrl: extracted || value }
        }
        if (field === 'driveUrl') {
          const extracted = extractDriveId(value)
          return { ...v, driveUrl: extracted || value }
        }
        return { ...v, [field]: value }
      })
    )
  }

  const handleRemoveStagedVideo = (id) => {
    setStagedVideos((prev) => prev.filter((v) => v.id !== id))
    setStagedExams((prev) =>
      prev.map((e) => (e.targetVideoId === id ? { ...e, isPrerequisite: false, targetVideoId: '' } : e))
    )
  }

  const handleAddCatalogVideo = (video) => {
    if (!video?.id) return
    if (stagedVideos.some((v) => v.existingId === video.id)) {
      return notify('هذا الفيديو مضاف بالفعل في القائمة', 'warning')
    }
    setStagedVideos((prev) => [
      ...prev,
      {
        id: `existing_${video.id}`,
        isNew: false,
        existingId: video.id,
        title: video.title,
        source: video.video_parts?.[0]?.source || 'youtube',
        durationMinutes: ''
      }
    ])
  }

  // Staged Exams Handlers & Question Studio
  const handleAddFreshExam = () => {
    const id = `new_exam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    setStagedExams((prev) => [
      ...prev,
      {
        id,
        isNew: true,
        title: `امتحان المحاضرة ${prev.length + 1}`,
        examType: 'exam',
        durationMinutes: 30,
        maxAttempts: 1,
        totalPoints: 10,
        isPrerequisite: false,
        targetVideoId: stagedVideos[0]?.id || '',
        requiredScore: 70,
        questions: [],
        sharedBlocks: [],
        activeExamTab: 'questions',
        showQuestionsEditor: true,
        showBulkImport: false,
        bulkImportText: ''
      }
    ])
  }

  const handleAddCatalogExam = (exam) => {
    if (!exam?.id) return
    if (stagedExams.some((e) => e.existingId === exam.id)) {
      return notify('هذا الامتحان مضاف بالفعل في القائمة', 'warning')
    }
    setStagedExams((prev) => [
      ...prev,
      {
        id: `existing_${exam.id}`,
        isNew: false,
        existingId: exam.id,
        title: exam.title,
        examType: exam.exam_type || 'exam',
        durationMinutes: exam.duration_minutes || 30,
        isPrerequisite: false,
        targetVideoId: stagedVideos[0]?.id || '',
        requiredScore: 70,
        questions: [],
        sharedBlocks: []
      }
    ])
  }

  const handleUpdateStagedExam = (id, field, value) => {
    setStagedExams((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)))
  }

  const handleUpdateExamSharedBlocks = (examId, blocks) => {
    setStagedExams((prev) => prev.map((e) => (e.id === examId ? { ...e, sharedBlocks: blocks } : e)))
  }

  const handleRemoveStagedExam = (id) => {
    setStagedExams((prev) => prev.filter((e) => e.id !== id))
  }

  const handleToggleExamQuestions = (examId) => {
    setStagedExams((prev) =>
      prev.map((e) => (e.id === examId ? { ...e, showQuestionsEditor: !e.showQuestionsEditor } : e))
    )
  }

  const handleAddExamQuestion = (examId) => {
    const qId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    setStagedExams((prev) =>
      prev.map((e) => {
        if (e.id !== examId) return e
        const currentQuestions = e.questions || []
        const newQ = {
          id: qId,
          question: '',
          image: '',
          options: ['', ''],
          answers: [0],
          points: 1,
          isMultiple: false
        }
        const updatedQuestions = [...currentQuestions, newQ]
        const newTotalPoints = updatedQuestions.reduce((acc, q) => acc + (parseInt(q.points, 10) || 1), 0)
        return {
          ...e,
          questions: updatedQuestions,
          totalPoints: newTotalPoints
        }
      })
    )
  }

  const handleUpdateExamQuestion = (examId, qId, field, value) => {
    setStagedExams((prev) =>
      prev.map((e) => {
        if (e.id !== examId) return e
        const updatedQuestions = (e.questions || []).map((q) => {
          if (q.id !== qId) return q
          return { ...q, [field]: value }
        })
        const newTotalPoints = updatedQuestions.reduce((acc, q) => acc + (parseInt(q.points, 10) || 1), 0)
        return {
          ...e,
          questions: updatedQuestions,
          totalPoints: newTotalPoints
        }
      })
    )
  }

  const handleRemoveExamQuestion = (examId, qId) => {
    setStagedExams((prev) =>
      prev.map((e) => {
        if (e.id !== examId) return e
        const updatedQuestions = (e.questions || []).filter((q) => q.id !== qId)
        const newTotalPoints = updatedQuestions.reduce((acc, q) => acc + (parseInt(q.points, 10) || 1), 0)
        return {
          ...e,
          questions: updatedQuestions,
          totalPoints: newTotalPoints || 10
        }
      })
    )
  }

  const handleAddExamQuestionOption = (examId, qId) => {
    setStagedExams((prev) =>
      prev.map((e) => {
        if (e.id !== examId) return e
        return {
          ...e,
          questions: (e.questions || []).map((q) => {
            if (q.id !== qId) return q
            return { ...q, options: [...(q.options || []), ''] }
          })
        }
      })
    )
  }

  const handleRemoveExamQuestionOption = (examId, qId) => {
    setStagedExams((prev) =>
      prev.map((e) => {
        if (e.id !== examId) return e
        return {
          ...e,
          questions: (e.questions || []).map((q) => {
            if (q.id !== qId || (q.options || []).length <= 2) return q
            const newOpts = q.options.slice(0, -1)
            const newAnswers = (q.answers || [0]).filter((a) => a < newOpts.length)
            return {
              ...q,
              options: newOpts,
              answers: newAnswers.length > 0 ? newAnswers : [0]
            }
          })
        }
      })
    )
  }

  const handleUpdateExamQuestionOption = (examId, qId, optIndex, value) => {
    setStagedExams((prev) =>
      prev.map((e) => {
        if (e.id !== examId) return e
        return {
          ...e,
          questions: (e.questions || []).map((q) => {
            if (q.id !== qId) return q
            const newOpts = [...(q.options || [])]
            newOpts[optIndex] = value
            return { ...q, options: newOpts }
          })
        }
      })
    )
  }

  const handleToggleExamQuestionCorrect = (examId, qId, optIndex) => {
    setStagedExams((prev) =>
      prev.map((e) => {
        if (e.id !== examId) return e
        return {
          ...e,
          questions: (e.questions || []).map((q) => {
            if (q.id !== qId) return q
            let newAnswers = [optIndex]
            if (q.isMultiple) {
              const current = q.answers || []
              newAnswers = current.includes(optIndex)
                ? current.filter((x) => x !== optIndex)
                : [...current, optIndex]
              if (newAnswers.length === 0) newAnswers = [optIndex]
            }
            return { ...q, answers: newAnswers }
          })
        }
      })
    )
  }

  const handleExamBulkImport = (examId) => {
    const exam = stagedExams.find((e) => e.id === examId)
    if (!exam || !exam.bulkImportText?.trim()) {
      return notify('يرجى كتابة أو لصق الأسئلة أولاً', 'warning')
    }
    const parsed = parseQuestionsNatural(exam.bulkImportText.trim())
    if (!parsed || parsed.length === 0) {
      return notify('لم يتم العثور على أسئلة — تأكد من التنسيق (سؤال وتحته خيارات)', 'warning')
    }
    const formatted = parsed.map((p, idx) => ({
      id: `bulk_${Date.now()}_${idx}`,
      question: p.question || '',
      image: p.image || '',
      options: p.options || ['', ''],
      answers: Array.isArray(p.answers) && p.answers.length > 0 ? p.answers : [0],
      points: parseInt(p.points, 10) || 1,
      isMultiple: !!p.isMultiple
    }))

    setStagedExams((prev) =>
      prev.map((e) => {
        if (e.id !== examId) return e
        const updated = [...(e.questions || []), ...formatted]
        const newTotal = updated.reduce((acc, q) => acc + (q.points || 1), 0)
        return {
          ...e,
          questions: updated,
          totalPoints: newTotal,
          bulkImportText: '',
          showBulkImport: false
        }
      })
    )
    notify(`تم استيراد ${formatted.length} سؤال بنجاح! 🎉`, 'success')
  }

  // Staged Files Handlers
  const handleAddStagedFiles = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const newItems = files.map((file) => {
      const cleanName = file.name.replace(/\.[^/.]+$/, '')
      return {
        id: `staged_f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        file,
        title: cleanName,
        fileSize: file.size
      }
    })
    setStagedFiles((prev) => [...prev, ...newItems])
    e.target.value = ''
  }

  const handleUpdateStagedFile = (id, title) => {
    setStagedFiles((prev) => prev.map((f) => (f.id === id ? { ...f, title } : f)))
  }

  const handleRemoveStagedFile = (id) => {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id))
  }

  // Helper to persist videos, exams (with shared blocks & prerequisites), and files for a lecture
  const saveStagedLectureContents = async ({ lectureId, lectureTitle, videos, exams, files, grade, desc }) => {
    const stagedToRealVideoMap = {}

    // 1. Videos
    for (let i = 0; i < (videos || []).length; i++) {
      const sv = videos[i]
      let realVideoId = sv.existingId

      if (sv.isNew) {
        let ytId = null
        let drvId = null
        let bnId = null

        if (sv.source === 'drive') {
          drvId = extractDriveId(sv.driveUrl) || sv.driveUrl.trim()
        } else if (sv.source === 'bunny') {
          bnId = sv.bunnyVideoId.trim()
        } else {
          ytId = extractYouTubeId(sv.youtubeUrl) || sv.youtubeUrl.trim()
        }

        const partsPayload = [
          {
            title: sv.title.trim() || `الجزء ${i + 1}`,
            source: sv.source || 'youtube',
            youtube_id: ytId,
            drive_id: drvId,
            bunny_video_id: bnId,
            duration_seconds: sv.durationMinutes ? Math.round(parseFloat(sv.durationMinutes) * 60) : null,
            view_limit: sv.viewLimit ? parseInt(sv.viewLimit, 10) : 3
          }
        ]

        const createdVid = await createVideo({
          title: `${lectureTitle.trim()} — ${sv.title.trim()}`,
          grade,
          description: desc || null,
          active_hours: sv.activeHours || 24,
          parts: partsPayload
        })
        realVideoId = createdVid.id
      }

      if (realVideoId) {
        stagedToRealVideoMap[sv.id] = realVideoId
        await addVideoToLecture({
          lectureId,
          videoId: realVideoId,
          sortOrder: (i + 1) * 10
        })
      }
    }

    // 2. Exams & Prerequisite Unlock Rules
    for (let i = 0; i < (exams || []).length; i++) {
      const se = exams[i]
      let realExamId = se.existingId

      if (se.isNew) {
        const calculatedTotal = (se.questions || []).reduce((acc, q) => acc + (parseInt(q.points, 10) || 1), 0)
        const createdEx = await createExam({
          title: se.title.trim(),
          grade,
          duration_minutes: parseInt(se.durationMinutes, 10) || 30,
          max_attempts: parseInt(se.maxAttempts, 10) || 1,
          total_points: calculatedTotal || parseInt(se.totalPoints, 10) || 10,
          exam_type: se.examType || 'exam',
          reveal_grades: true,
          questions: se.questions || []
        })
        realExamId = createdEx.id

        // Save Shared Text / Image Blocks if any
        if (se.sharedBlocks && se.sharedBlocks.length > 0) {
          try {
            const blocksPayload = editorBlocksToPayload(se.sharedBlocks, se.questions || [])
            if (blocksPayload.length > 0) {
              await saveExamSharedBlocks(realExamId, blocksPayload)
            }
          } catch (blockErr) {
            console.warn('Failed to save exam shared blocks:', blockErr)
          }
        }
      }

      if (realExamId) {
        await addExamToLecture({
          lectureId,
          examId: realExamId,
          sortOrder: (i + 1) * 10
        })

        // Prerequisite Gate: if checked and has target video
        if (se.isPrerequisite && se.targetVideoId) {
          const targetRealVideoId = stagedToRealVideoMap[se.targetVideoId] || se.targetVideoId
          if (targetRealVideoId) {
            await createUnlockRule({
              targetType: 'video',
              targetId: targetRealVideoId,
              requiredExamId: realExamId,
              requiredScore: parseFloat(se.requiredScore) || 70.0
            }).catch((ruleErr) => {
              console.warn('Unlock rule warning:', ruleErr)
            })
          }
        }
      }
    }

    // 3. Upload & Link PDF Files
    for (let i = 0; i < (files || []).length; i++) {
      const sf = files[i]
      if (sf.file) {
        const { key } = await uploadLecturePdf(sf.file)
        await addLectureFile({
          lectureId,
          title: sf.title.trim() || sf.file.name,
          fileKey: key,
          fileSize: sf.fileSize || sf.file.size,
          sortOrder: (i + 1) * 10
        })
      }
    }
  }

  const handleSaveLecture = async (e) => {
    e.preventDefault()

    // ── CASE A: Creating a Full Lesson with Multiple Sub-Lectures ─────────
    if (modalType === 'create_lecture' && creationMode === 'lesson') {
      if (!formLessonTitle.trim()) return notify('يرجى إدخال عنوان الدرس / الوحدة', 'warning')
      if (!formGrade) return notify('يرجى اختيار الصف الدراسي', 'warning')

      // Sync active sub-lecture contents before saving
      const allSubs = lessonLectures.map((l, i) => {
        if (i === activeLessonLecIdx) {
          return {
            ...l,
            title: formTitle,
            stagedVideos: [...stagedVideos],
            stagedExams: [...stagedExams],
            stagedFiles: [...stagedFiles]
          }
        }
        return l
      })

      if (allSubs.length === 0) {
        return notify('يجب إضافة محاضرة واحدة على الأقل داخل الدرس', 'warning')
      }

      // Validate sub-lectures and any new videos
      for (let sIdx = 0; sIdx < allSubs.length; sIdx++) {
        const sub = allSubs[sIdx]
        if (!sub.title?.trim()) {
          return notify(`يرجى كتابة عنوان للمحاضرة رقم ${sIdx + 1}`, 'warning')
        }
        for (let vIdx = 0; vIdx < (sub.stagedVideos || []).length; vIdx++) {
          const v = sub.stagedVideos[vIdx]
          if (v.isNew) {
            if (!v.title?.trim()) {
              return notify(`المحاضرة (${sub.title}): الجزء ${vIdx + 1} - يرجى إدخال عنوان الفيديو`, 'warning')
            }
            if (v.source === 'youtube' && !v.youtubeUrl?.trim()) {
              return notify(`المحاضرة (${sub.title}): الجزء ${vIdx + 1} - يرجى إدخال رابط YouTube`, 'warning')
            }
            if (v.source === 'drive' && !v.driveUrl?.trim()) {
              return notify(`المحاضرة (${sub.title}): الجزء ${vIdx + 1} - يرجى إدخال رابط Drive`, 'warning')
            }
            if (v.source === 'bunny' && !v.bunnyVideoId?.trim()) {
              return notify(`المحاضرة (${sub.title}): الجزء ${vIdx + 1} - يرجى إدخال معرّف Bunny`, 'warning')
            }
          }
        }
      }

      setIsSubmitting(true)
      try {
        // 1. Create the Course Chapter (Lesson)
        const newChapter = await createCourseChapter({
          grade: formGrade,
          title: formLessonTitle.trim(),
          description: formLessonDesc.trim() || null,
          sortOrder: (standaloneLessons.length + 1) * 10
        })

        // Calculate availability limits if set
        const calculatedHours = formAvailabilityPreset === '24h' ? 24 :
          formAvailabilityPreset === '48h' ? 48 :
          formAvailabilityPreset === '7d' ? 168 :
          formAvailabilityPreset === '30d' ? 720 :
          formAvailabilityPreset === 'custom_hours' ? (parseInt(formAvailableHours, 10) || null) : null

        const calculatedUntil = formAvailabilityPreset === 'until_date' && formAvailableUntil ? new Date(formAvailableUntil).toISOString() : null

        // 2. Iterate and create each sub-lecture & contents
        for (let sIdx = 0; sIdx < allSubs.length; sIdx++) {
          const sub = allSubs[sIdx]
          const subLecture = await createCourseLecture({
            title: sub.title.trim() || `المحاضرة ${sIdx + 1}`,
            grade: formGrade,
            chapterId: newChapter.id,
            packageId: null,
            description: sub.desc?.trim() || formLessonDesc.trim() || null,
            sortOrder: (sIdx + 1) * 10,
            isActive: formIsActive,
            availableHours: calculatedHours,
            availableUntil: calculatedUntil
          })

          await saveStagedLectureContents({
            lectureId: subLecture.id,
            lectureTitle: sub.title.trim() || `المحاضرة ${sIdx + 1}`,
            videos: sub.stagedVideos || [],
            exams: sub.stagedExams || [],
            files: sub.stagedFiles || [],
            grade: formGrade,
            desc: sub.desc?.trim() || formLessonDesc.trim() || null
          })
        }

        notify('تم إنشاء ونشر الدرس الكامل وجميع محاضراته بنجاح ✨', 'success')
        setModalType(null)
        loadCurriculum()
      } catch (err) {
        console.error('Error creating lesson:', err)
        notify(err.message || 'تعذر حفظ بيانات الدرس ومحاضراته', 'danger')
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    // ── CASE B: Single Lecture Creation or Editing ────────────────────────
    if (!formTitle.trim()) return notify('يرجى إدخال عنوان المحاضرة', 'warning')
    if (!formGrade) return notify('يرجى اختيار الصف الدراسي', 'warning')

    // Validate any new videos
    for (let i = 0; i < stagedVideos.length; i++) {
      const v = stagedVideos[i]
      if (v.isNew) {
        if (!v.title?.trim()) {
          return notify(`الجزء ${i + 1}: يرجى إدخال عنوان الفيديو`, 'warning')
        }
        if (v.source === 'youtube' && !v.youtubeUrl?.trim()) {
          return notify(`الجزء ${i + 1}: يرجى إدخال رابط أو معرّف فيديو YouTube`, 'warning')
        }
        if (v.source === 'drive' && !v.driveUrl?.trim()) {
          return notify(`الجزء ${i + 1}: يرجى إدخال رابط أو معرّف ملف Google Drive`, 'warning')
        }
        if (v.source === 'bunny' && !v.bunnyVideoId?.trim()) {
          return notify(`الجزء ${i + 1}: يرجى إدخال معرّف Bunny Video GUID`, 'warning')
        }
      }
    }

    setIsSubmitting(true)
    try {
      const calculatedHours = formAvailabilityPreset === '24h' ? 24 :
        formAvailabilityPreset === '48h' ? 48 :
        formAvailabilityPreset === '7d' ? 168 :
        formAvailabilityPreset === '30d' ? 720 :
        formAvailabilityPreset === 'custom_hours' ? (parseInt(formAvailableHours, 10) || null) : null

      const calculatedUntil = formAvailabilityPreset === 'until_date' && formAvailableUntil ? new Date(formAvailableUntil).toISOString() : null

      if (modalType === 'create_lecture') {
        const newLecture = await createCourseLecture({
          title: formTitle.trim(),
          grade: formGrade,
          chapterId: formChapterId || null,
          packageId: formPackageId || null,
          description: formDesc.trim() || null,
          sortOrder: parseInt(formSortOrder, 10) || 10,
          isActive: formIsActive,
          availableHours: calculatedHours,
          availableUntil: calculatedUntil
        })

        await saveStagedLectureContents({
          lectureId: newLecture.id,
          lectureTitle: formTitle.trim(),
          videos: stagedVideos,
          exams: stagedExams,
          files: stagedFiles,
          grade: formGrade,
          desc: formDesc.trim() || null
        })

        notify('تم إنشاء ونشر المحاضرة بكافة محتوياتها بنجاح ✨', 'success')
      } else if (modalType === 'edit_lecture' && modalTarget?.id) {
        await updateCourseLecture(modalTarget.id, {
          title: formTitle.trim(),
          grade: formGrade,
          description: formDesc.trim() || null,
          sort_order: parseInt(formSortOrder, 10) || 10,
          is_active: formIsActive,
          available_hours: calculatedHours,
          available_until: calculatedUntil
        })
        notify('تم تحديث المحاضرة بنجاح 👍', 'success')
      }

      setModalType(null)
      loadCurriculum()
    } catch (err) {
      console.error('Error saving lecture:', err)
      notify(err.message || 'تعذر حفظ بيانات المحاضرة', 'danger')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleArchive = async (lec, e) => {
    if (e) e.stopPropagation()
    try {
      const nextArchived = lec.is_active !== false
      await setLectureArchived(lec.id, nextArchived)
      notify(nextArchived ? 'تم أرشفة المحاضرة بنجاح 📦' : 'تم إلغاء أرشفة المحاضرة بنجاح', 'success')
      await loadCurriculum()
      setActiveLectureView((prev) => {
        if (prev && prev.id === lec.id) {
          return { ...prev, is_active: !nextArchived }
        }
        return prev
      })
    } catch (err) {
      notify(err.message || 'حدث خطأ أثناء تغيير حالة الأرشيف', 'danger')
    }
  }

  const handleDeleteLectureConfirm = (lec, e) => {
    if (e) e.stopPropagation()
    setDeleteConfirm({
      type: 'lecture',
      id: lec.id,
      title: lec.title
    })
  }

  const handleDeleteConfirmed = async () => {
    if (!deleteConfirm) return
    try {
      if (deleteConfirm.type === 'lecture') {
        await deleteCourseLecture(deleteConfirm.id)
        notify('تم حذف المحاضرة بنجاح', 'success')
      } else if (deleteConfirm.type === 'detach_video') {
        await removeVideoFromLecture({
          lectureId: deleteConfirm.extra.lectureId,
          videoId: deleteConfirm.id
        })
        notify('تم فك ارتباط الفيديو بالمحاضرة', 'success')
      } else if (deleteConfirm.type === 'detach_exam') {
        await removeExamFromLecture({
          lectureId: deleteConfirm.extra.lectureId,
          examId: deleteConfirm.id
        })
        notify('تم فك ارتباط الامتحان بالمحاضرة', 'success')
      } else if (deleteConfirm.type === 'delete_file') {
        await removeLectureFile(deleteConfirm.id)
        notify('تم حذف الملف بنجاح', 'success')
      }
      setDeleteConfirm(null)
      loadCurriculum()
    } catch (err) {
      notify(err.message || 'فشلت العملية', 'danger')
    }
  }

  // ── Video Attachment ──────────────────────────────────────────────────
  const handleOpenAttachVideo = async (lec, e) => {
    if (e) e.stopPropagation()
    setModalTarget(lec)
    setSelectedItemId('')
    setCatalogSearch('')
    setModalType('attach_video')
    try {
      const vids = await listVideos()
      setAllVideosCatalog(vids || [])
    } catch (err) {
      console.error('Failed to load videos catalog:', err)
    }
  }

  const handleAttachVideoSubmit = async (e) => {
    e.preventDefault()
    if (!selectedItemId) return notify('يرجى اختيار فيديو لربطه بالمحاضرة', 'warning')
    setIsSubmitting(true)
    try {
      const nextOrder = (modalTarget.videos || []).length * 10 + 10
      await addVideoToLecture({
        lectureId: modalTarget.id,
        videoId: selectedItemId,
        sortOrder: nextOrder
      })
      notify('تم ربط الفيديو بالمحاضرة بنجاح 🎬', 'success')
      setModalType(null)
      loadCurriculum()
    } catch (err) {
      notify(err.message || 'تعذر ربط الفيديو', 'danger')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Exam Attachment ───────────────────────────────────────────────────
  const handleOpenAttachExam = async (lec, e) => {
    if (e) e.stopPropagation()
    setModalTarget(lec)
    setSelectedItemId('')
    setCatalogSearch('')
    setModalType('attach_exam')
    try {
      const exs = await listExams({ lean: true })
      setAllExamsCatalog(exs || [])
    } catch (err) {
      console.error('Failed to load exams catalog:', err)
    }
  }

  const handleAttachExamSubmit = async (e) => {
    e.preventDefault()
    if (!selectedItemId) return notify('يرجى اختيار امتحان لربطه بالمحاضرة', 'warning')
    setIsSubmitting(true)
    try {
      const nextOrder = (modalTarget.exams || []).length * 10 + 10
      await addExamToLecture({
        lectureId: modalTarget.id,
        examId: selectedItemId,
        sortOrder: nextOrder
      })
      notify('تم ربط الامتحان بالمحاضرة بنجاح 📝', 'success')
      setModalType(null)
      loadCurriculum()
    } catch (err) {
      if (err.message && err.message.includes('containment_cycle_detected')) {
        notify('⚠️ تم رفض الإضافة: هذا الامتحان مرتبط مسبقاً كمتطلب أو يحتوي على تبعية دائرية مع هذه المحاضرة!', 'danger')
      } else {
        notify(err.message || 'تعذر ربط الامتحان', 'danger')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── PDF File Upload ───────────────────────────────────────────────────
  const handleOpenUploadFile = (lec, e) => {
    if (e) e.stopPropagation()
    setModalTarget(lec)
    setFormTitle('')
    setUploadFileObj(null)
    setUploadProgress(0)
    setModalType('upload_file')
  }

  const handleUploadFileSubmit = async (e) => {
    e.preventDefault()
    if (!uploadFileObj) return notify('يرجى اختيار ملف PDF', 'warning')
    if (!formTitle.trim()) return notify('يرجى إدخال اسم الملف أو الملخص', 'warning')

    setIsSubmitting(true)
    try {
      const res = await uploadLecturePdf(uploadFileObj, {
        onProgress: (pct) => setUploadProgress(pct)
      })
      const nextOrder = (modalTarget.files || []).length * 10 + 10
      await addLectureFile({
        lectureId: modalTarget.id,
        title: formTitle.trim(),
        fileKey: res.key,
        fileSize: uploadFileObj.size,
        sortOrder: nextOrder
      })
      notify('تم رفع وربط ملف PDF بالمحاضرة بنجاح 📄', 'success')
      setModalType(null)
      loadCurriculum()
    } catch (err) {
      notify(err.message || 'تعذر رفع الملف', 'danger')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Render Lecture Card Component ─────────────────────────────────────
  const renderLectureCard = (lec, index, contextChapter = null) => {
    const isExpanded = !!expandedLectures[lec.id]
    const isLocked = lec.lockStatus && lec.lockStatus.unlocked === false
    const videos = lec.videos || []
    const exams = lec.exams || []
    const files = lec.files || []

    return (
      <div key={lec.id} className={`lecture-card ${isExpanded ? 'expanded' : ''} ${isLocked ? 'locked' : ''}`}>
        {/* Card Header */}
        <div className="lecture-card-header" onClick={() => toggleLecture(lec.id)}>
          <div className="lecture-card-title-group">
            <span className="lecture-card-num-badge">{index + 1}</span>
            <div className="lecture-card-title-wrap">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span className="lecture-card-title">{lec.title}</span>
                {lec.is_active === false && (
                  <span
                    className="lecture-archived-badge"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 8px',
                      borderRadius: 6,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: 'rgba(245, 158, 11, 0.12)',
                      color: '#f59e0b',
                      border: '1px solid rgba(245, 158, 11, 0.3)'
                    }}
                  >
                    <i className="fas fa-box-archive"></i> مؤرشفة
                  </span>
                )}
              </div>
              {lec.description && <p className="lecture-card-desc">{lec.description}</p>}
            </div>
          </div>

          <div className="lecture-card-meta">
            {isLocked && (
              <span className="lecture-stat-badge" style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }}>
                <i className="fas fa-lock"></i> مقفل بمتطلب
              </span>
            )}
            {(() => {
              const avail = getLectureAvailabilityInfo(lec)
              return (
                <span className={`lecture-stat-badge availability ${avail.colorClass}`} title={avail.detail}>
                  <i className={`fas ${avail.icon}`}></i> {avail.label}
                </span>
              )
            })()}
            <span className="lecture-stat-badge videos">
              <i className="fas fa-play"></i> {videos.length} فيديو
            </span>
            <span className="lecture-stat-badge exams">
              <i className="fas fa-clipboard-check"></i> {exams.length} امتحان
            </span>
            <span className="lecture-stat-badge files">
              <i className="fas fa-file-pdf"></i> {files.length} ملف
            </span>
            <button
              type="button"
              className="lecture-enter-btn"
              onClick={(e) => {
                e.stopPropagation()
                handleOpenLectureView(lec)
              }}
            >
              <i className="fas fa-circle-play"></i> دخول المحاضرة
            </button>
            <i className="fas fa-chevron-down lecture-card-expand-icon"></i>
          </div>
        </div>

        {/* Admin / Teacher Management Toolbar */}
        {canManage && (
          <div className="lecture-admin-toolbar" onClick={(e) => e.stopPropagation()}>
            <div className="lecture-admin-btns">
              <button
                type="button"
                className="lecture-tool-btn availability"
                onClick={(e) => handleOpenAvailabilityModal(lec, e)}
              >
                <i className="fas fa-clock-rotate-left"></i> الإتاحة والتمديد
              </button>
              <button
                type="button"
                className="lecture-tool-btn attach-video"
                onClick={(e) => handleOpenAttachVideo(lec, e)}
              >
                <i className="fas fa-video"></i> ربط فيديو
              </button>
              <button
                type="button"
                className="lecture-tool-btn attach-exam"
                onClick={(e) => handleOpenAttachExam(lec, e)}
              >
                <i className="fas fa-clipboard-list"></i> ربط امتحان
              </button>
              <button
                type="button"
                className="lecture-tool-btn attach-file"
                onClick={(e) => handleOpenUploadFile(lec, e)}
              >
                <i className="fas fa-file-upload"></i> رفع PDF
              </button>
            </div>

            <div className="lecture-admin-btns">
              <button
                type="button"
                className={`lecture-tool-btn archive-lec ${lec.is_active === false ? 'archived' : ''}`}
                onClick={(e) => handleToggleArchive(lec, e)}
                title={lec.is_active === false ? 'إلغاء أرشفة المحاضرة' : 'أرشفة المحاضرة'}
              >
                <i className={`fas ${lec.is_active === false ? 'fa-box-open' : 'fa-box-archive'}`}></i>
                <span>{lec.is_active === false ? '📦 إلغاء الأرشيف' : '📦 أرشفة'}</span>
              </button>
              <button
                type="button"
                className="lecture-tool-btn edit-lec"
                onClick={(e) => handleOpenEditLecture(lec, e)}
              >
                <i className="fas fa-pen"></i> تعديل
              </button>
              <button
                type="button"
                className="lecture-tool-btn delete-lec"
                onClick={(e) => handleDeleteLectureConfirm(lec, e)}
              >
                <i className="fas fa-trash-can"></i> حذف
              </button>
            </div>
          </div>
        )}

        {/* Card Body / Attached Items */}
        {isExpanded && (
          <div className="lecture-card-body">
            {videos.length === 0 && exams.length === 0 && files.length === 0 && (
              <div className="lectures-empty-box" style={{ padding: '20px' }}>
                <p style={{ margin: 0, fontSize: '0.88rem' }}>لم تتم إضافة فيديوهات أو امتحانات أو ملفات لهذه المحاضرة بعد.</p>
              </div>
            )}

            {/* Videos Subgroup */}
            {videos.length > 0 && (
              <div className="lecture-subgroup">
                <span className="lecture-subgroup-title">
                  <i className="fas fa-play-circle" style={{ color: '#3b82f6' }}></i> الفيديوهات والشروحات ({videos.length})
                </span>
                <div className="lecture-items-list">
                  {videos.map((vid) => (
                    <div key={vid.id || vid.junction_id} className="lecture-content-row">
                      <div className="lecture-content-info">
                        <div className="lecture-content-type-icon video">
                          <i className="fas fa-play"></i>
                        </div>
                        <div>
                          <div className="lecture-content-name">{vid.title}</div>
                          {vid.video_parts?.length > 1 && (
                            <div className="lecture-content-subtext">{vid.video_parts.length} أجزاء</div>
                          )}
                        </div>
                      </div>

                      <div className="lecture-content-actions">
                        <button
                          type="button"
                          className="lecture-play-btn"
                          onClick={() => handleSelectVideo(vid, lec)}
                        >
                          <i className="fas fa-play"></i> مشاهدة
                        </button>
                        {canManage && (
                          <button
                            type="button"
                            className="lecture-detach-btn"
                            title="فك ارتباط الفيديو"
                            onClick={() =>
                              setDeleteConfirm({
                                type: 'detach_video',
                                id: vid.id,
                                title: vid.title,
                                extra: { lectureId: lec.id }
                              })
                            }
                          >
                            <i className="fas fa-unlink"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Exams Subgroup */}
            {exams.length > 0 && (
              <div className="lecture-subgroup">
                <span className="lecture-subgroup-title">
                  <i className="fas fa-clipboard-check" style={{ color: '#8b5cf6' }}></i> الاختبارات والتقييمات ({exams.length})
                </span>
                <div className="lecture-items-list">
                  {exams.map((ex) => (
                    <div key={ex.id || ex.junction_id} className="lecture-content-row">
                      <div className="lecture-content-info">
                        <div className="lecture-content-type-icon exam">
                          <i className="fas fa-file-lines"></i>
                        </div>
                        <div>
                          <div className="lecture-content-name">{ex.title}</div>
                          <div className="lecture-content-subtext">
                            {ex.questions_count ? `${ex.questions_count} أسئلة` : ''} {ex.duration_minutes ? `• ${ex.duration_minutes} دقيقة` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="lecture-content-actions">
                        <button
                          type="button"
                          className="lecture-play-btn"
                          style={{ background: '#7c3aed' }}
                          onClick={() => handleSelectExam(ex, lec)}
                        >
                          <i className="fas fa-pen-to-square"></i> دخول الاختبار
                        </button>
                        {canManage && (
                          <button
                            type="button"
                            className="lecture-detach-btn"
                            title="فك ارتباط الامتحان"
                            onClick={() =>
                              setDeleteConfirm({
                                type: 'detach_exam',
                                id: ex.id,
                                title: ex.title,
                                extra: { lectureId: lec.id }
                              })
                            }
                          >
                            <i className="fas fa-unlink"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PDF Files Subgroup */}
            {files.length > 0 && (
              <div className="lecture-subgroup">
                <span className="lecture-subgroup-title">
                  <i className="fas fa-file-pdf" style={{ color: '#10b981' }}></i> المذكرات وملفات PDF ({files.length})
                </span>
                <div className="lecture-items-list">
                  {files.map((file) => (
                    <div key={file.id} className="lecture-content-row">
                      <div className="lecture-content-info">
                        <div className="lecture-content-type-icon file">
                          <i className="fas fa-file-pdf"></i>
                        </div>
                        <div>
                          <div className="lecture-content-name">{file.title}</div>
                          {file.file_size > 0 && (
                            <div className="lecture-content-subtext">
                              {(file.file_size / (1024 * 1024)).toFixed(2)} ميجابايت
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="lecture-content-actions">
                        <button
                          type="button"
                          className="lecture-play-btn"
                          style={{ background: '#059669' }}
                          disabled={downloadingFileId === file.id}
                          onClick={() => handleDownloadFile(file, lec)}
                        >
                          {downloadingFileId === file.id ? (
                            <>
                              <i className="fas fa-circle-notch fa-spin"></i> جاري التحميل...
                            </>
                          ) : (
                            <>
                              <i className="fas fa-download"></i> تحميل
                            </>
                          )}
                        </button>
                        {canManage && (
                          <button
                            type="button"
                            className="lecture-detach-btn"
                            title="حذف الملف"
                            onClick={() =>
                              setDeleteConfirm({
                                type: 'delete_file',
                                id: file.id,
                                title: file.title
                              })
                            }
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="lectures-page" dir="rtl">
      {/* ── If in Dedicated Lecture Workspace View ───────────────────── */}
      {activeLectureView ? (
        <main className="lectures-main-content">
          <div className="lecture-workspace">
            {/* Workspace Top Bar */}
            <div className="lecture-workspace-header">
              <button
                type="button"
                className="lecture-workspace-back-btn"
                onClick={() => {
                  setActiveLectureView(null)
                  setActiveVideoItem(null)
                }}
              >
                <i className="fas fa-arrow-right"></i> العودة لقائمة المحاضرات
              </button>

              <div className="lecture-workspace-title-wrap">
                <div className="lecture-workspace-badges">
                  <span className="lecture-workspace-grade">
                    <i className="fas fa-graduation-cap"></i> {gradeOptions.find((g) => g.id === activeLectureView.grade)?.name || activeLectureView.grade}
                  </span>
                  <span className="lecture-workspace-count">
                    <i className="fas fa-play-circle"></i> {activeLectureView.videos?.length || 0} فيديوهات
                  </span>
                  <span className="lecture-workspace-count">
                    <i className="fas fa-clipboard-check"></i> {activeLectureView.exams?.length || 0} امتحانات
                  </span>
                  <span className="lecture-workspace-count">
                    <i className="fas fa-file-pdf"></i> {activeLectureView.files?.length || 0} مذكرات
                  </span>
                  {(() => {
                    const avail = getLectureAvailabilityInfo(activeLectureView)
                    return (
                      <span className={`lecture-workspace-count availability ${avail.colorClass}`} title={avail.detail} style={{ fontWeight: 600 }}>
                        <i className={`fas ${avail.icon}`}></i> {avail.label}
                      </span>
                    )
                  })()}
                </div>
                <h1 className="lecture-workspace-title">{activeLectureView.title}</h1>
                {activeLectureView.description && (
                  <p className="lecture-workspace-desc">{activeLectureView.description}</p>
                )}
              </div>

              {canManage && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="lectures-btn lectures-btn-secondary"
                    style={{
                      borderColor: activeLectureView.is_active === false ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)',
                      color: activeLectureView.is_active === false ? '#10b981' : '#f59e0b'
                    }}
                    onClick={(e) => handleToggleArchive(activeLectureView, e)}
                    title={activeLectureView.is_active === false ? 'إلغاء أرشفة المحاضرة' : 'أرشفة المحاضرة'}
                  >
                    <i className={`fas ${activeLectureView.is_active === false ? 'fa-box-open' : 'fa-box-archive'}`}></i>{' '}
                    {activeLectureView.is_active === false ? '📦 إلغاء الأرشيف' : '📦 أرشفة'}
                  </button>
                  <button
                    type="button"
                    className="lectures-btn lectures-btn-secondary"
                    style={{ borderColor: 'rgba(245, 158, 11, 0.4)', color: '#f59e0b' }}
                    onClick={(e) => handleOpenAvailabilityModal(activeLectureView, e)}
                  >
                    <i className="fas fa-clock-rotate-left"></i> الإتاحة والتمديد
                  </button>
                  <button
                    type="button"
                    className="lectures-btn lectures-btn-secondary"
                    onClick={(e) => handleOpenEditLecture(activeLectureView, e)}
                  >
                    <i className="fas fa-pen"></i> تعديل المحاضرة
                  </button>
                </div>
              )}
            </div>

            {/* Video Player Theater Stage */}
            <div className="lecture-workspace-stage">
              {activeVideoItem ? (
                <div className="lecture-player-container">
                  <div className="lecture-video-player-frame">
                    {/* Student ScreenGuard Watermark */}
                    <ScreenGuard
                      active={true}
                      label={currentUser?.name ? `${currentUser.name} — ${currentUser.phone || ''}` : 'منصة مسار التعليمية'}
                    />

                    {!isVideoStarted ? (
                      <div className="lecture-player-start-cover" onClick={() => setIsVideoStarted(true)}>
                        <div className="lecture-start-overlay-gradient"></div>
                        <div className="lecture-start-center-content">
                          <button
                            type="button"
                            className="lecture-start-play-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              setIsVideoStarted(true)
                            }}
                            title="بدء تشغيل الفيديو"
                          >
                            <span className="lecture-start-pulse-ring"></span>
                            <span className="lecture-start-pulse-ring delay"></span>
                            <i className="fas fa-play"></i>
                          </button>
                          <div className="lecture-start-text-group">
                            <h3>اضغط هنا لبدء مشاهدة الفيديو</h3>
                            <p className="lecture-start-sub">
                              <i className="fas fa-shield-halved"></i> لن يتم احتساب أي محاولة مشاهدة حتى تضغط على زر التشغيل في المنتصف
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      (() => {
                        const currentPart = activeVideoItem.video_parts?.[activeVideoPartIndex] || activeVideoItem.video_parts?.[0]
                        const source = currentPart?.source || activeVideoItem.source || 'youtube'
                        const ytId = extractYouTubeId(currentPart?.youtube_id || activeVideoItem.youtube_id || activeVideoItem.url)
                        const drvId = extractDriveId(currentPart?.drive_id || activeVideoItem.drive_id || activeVideoItem.url)
                        const bnId = currentPart?.bunny_video_id || activeVideoItem.bunny_video_id
                        const partId = currentPart?.id

                        if (source === 'drive' && drvId) {
                          return <DrivePlayer driveId={drvId} />
                        } else if (source === 'bunny' && (partId || bnId)) {
                          return <BunnyPlayer partId={partId} videoId={bnId} />
                        } else if (ytId) {
                          return <YouTubePlayer videoId={ytId} />
                        } else {
                          return (
                            <div className="lecture-player-placeholder">
                              <i className="fas fa-video-slash"></i>
                              <p>رابط الفيديو غير صالح أو قيد المعالجة.</p>
                            </div>
                          )
                        }
                      })()
                    )}
                  </div>

                  {/* Under-Player Info Strip */}
                  <div className="lecture-player-info-strip">
                    <div className="lecture-player-active-info">
                      <span className="lecture-player-pill">
                        <i className="fas fa-circle-play"></i> قيد المشاهدة الآن
                      </span>
                      <h3>{activeVideoItem.title}</h3>
                    </div>
                    {activeVideoItem.video_parts?.length > 1 && (
                      <div className="lecture-parts-switcher">
                        <span>اختر الجزء:</span>
                        {activeVideoItem.video_parts.map((p, pIdx) => (
                          <button
                            key={p.id || pIdx}
                            type="button"
                            className={`lecture-part-chip ${activeVideoPartIndex === pIdx ? 'active' : ''}`}
                            onClick={() => {
                              setActiveVideoPartIndex(pIdx)
                              setIsVideoStarted(false)
                            }}
                          >
                            {p.title || `الجزء ${pIdx + 1}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="lecture-empty-player-box">
                  <i className="fas fa-film"></i>
                  <h3>لا توجد فيديوهات في هذه المحاضرة بعد</h3>
                  <p>يمكنك الاطلاع على الامتحانات والملفات المرفقة أدناه.</p>
                </div>
              )}
            </div>

            {/* ── Bottom Video Playlist ("و تبقى القايمه دى موجوده فالاخر تحت") ── */}
            {activeLectureView.videos && activeLectureView.videos.length > 0 && (
              <div className="lecture-bottom-playlist-section">
                <div className="lectures-section-header" style={{ marginBottom: '14px' }}>
                  <div className="lectures-section-icon" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
                    <i className="fas fa-list-ol"></i>
                  </div>
                  <div className="lectures-section-info">
                    <h2>فيديوهات وأجزاء المحاضرة ({activeLectureView.videos.length})</h2>
                    <p>اختر أي فيديو للانتقال إليه مباشرة دون مغادرة الصفحة</p>
                  </div>
                </div>

                <div className="lecture-bottom-playlist-grid">
                  {activeLectureView.videos.map((vid, vIdx) => {
                    const isPlaying = activeVideoItem?.id === vid.id
                    const isVidLocked = vid.lockStatus && vid.lockStatus.unlocked === false
                    return (
                      <div
                        key={vid.id || vIdx}
                        className={`lecture-playlist-card ${isPlaying ? 'active' : ''} ${isVidLocked ? 'locked' : ''}`}
                        onClick={() => {
                          if (isVidLocked) {
                            setActiveLockModal(vid.lockStatus)
                            return
                          }
                          setActiveVideoItem(vid)
                          setActiveVideoPartIndex(0)
                          setIsVideoStarted(false)
                          window.scrollTo({ top: 120, behavior: 'smooth' })
                        }}
                      >
                        <div className="lecture-playlist-card-badge">
                          {isPlaying ? (
                            <span className="playlist-playing-pulse"><i className="fas fa-play"></i> شغال الآن</span>
                          ) : (
                            <span>فيديو {vIdx + 1}</span>
                          )}
                        </div>
                        <div className="lecture-playlist-card-content">
                          <div className="lecture-playlist-card-icon">
                            <i className={`fas ${isPlaying ? 'fa-circle-play' : isVidLocked ? 'fa-lock' : 'fa-play'}`}></i>
                          </div>
                          <div className="lecture-playlist-card-details">
                            <h4>{vid.title}</h4>
                            {vid.video_parts?.length > 1 && (
                              <span className="lecture-playlist-parts-tag">
                                <i className="fas fa-layer-group"></i> {vid.video_parts.length} أجزاء
                              </span>
                            )}
                          </div>
                        </div>
                        {isVidLocked && (
                          <div className="lecture-playlist-locked-tag">
                            <i className="fas fa-lock"></i> يتطلب اجتياز امتحان
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Attached Exams & Homework Section ── */}
            {activeLectureView.exams && activeLectureView.exams.length > 0 && (
              <div className="lecture-workspace-attached-section">
                <div className="lectures-section-header" style={{ marginBottom: '14px' }}>
                  <div className="lectures-section-icon" style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899' }}>
                    <i className="fas fa-clipboard-check"></i>
                  </div>
                  <div className="lectures-section-info">
                    <h2>الامتحانات والواجبات الملحقة ({activeLectureView.exams.length})</h2>
                    <p>قيم استيعابك للمحاضرة وتجاوز الاختبارات المطلوبة</p>
                  </div>
                </div>

                <div className="lecture-attached-grid">
                  {activeLectureView.exams.map((ex, eIdx) => {
                    const isExLocked = ex.lockStatus && ex.lockStatus.unlocked === false
                    return (
                      <div key={ex.id || eIdx} className={`lecture-attached-card ${isExLocked ? 'locked' : ''}`}>
                        <div className="lecture-attached-icon exam">
                          <i className="fas fa-clipboard-question"></i>
                        </div>
                        <div className="lecture-attached-info">
                          <h4>{ex.title}</h4>
                          <div className="lecture-attached-meta">
                            <span><i className="fas fa-clock"></i> {ex.duration_minutes || 30} دقيقة</span>
                            <span><i className="fas fa-star"></i> {ex.total_points || 10} درجة</span>
                          </div>
                        </div>
                        <div className="lecture-attached-actions">
                          {isExLocked ? (
                            <button
                              type="button"
                              className="lecture-locked-btn"
                              onClick={() => setActiveLockModal(ex.lockStatus)}
                            >
                              <i className="fas fa-lock"></i> مقفل
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="lectures-btn lectures-btn-primary"
                              onClick={() => handleSelectExam(ex, activeLectureView)}
                            >
                              <i className="fas fa-pen-to-square"></i> بدء التقييم
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Attached PDF Files & Booklets Section ── */}
            {activeLectureView.files && activeLectureView.files.length > 0 && (
              <div className="lecture-workspace-attached-section">
                <div className="lectures-section-header" style={{ marginBottom: '14px' }}>
                  <div className="lectures-section-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                    <i className="fas fa-file-pdf"></i>
                  </div>
                  <div className="lectures-section-info">
                    <h2>المذكرات والملفات المرفقة ({activeLectureView.files.length})</h2>
                    <p>حمل ملخصات ومذكرات المحاضرة بصيغة PDF</p>
                  </div>
                </div>

                <div className="lecture-attached-grid">
                  {activeLectureView.files.map((file, fIdx) => (
                    <div key={file.id || fIdx} className="lecture-attached-card">
                      <div className="lecture-attached-icon file">
                        <i className="fas fa-file-arrow-down"></i>
                      </div>
                      <div className="lecture-attached-info">
                        <h4>{file.title}</h4>
                        <div className="lecture-attached-meta">
                          <span>{file.file_size ? `${(file.file_size / (1024 * 1024)).toFixed(1)} MB` : 'PDF'}</span>
                        </div>
                      </div>
                      <div className="lecture-attached-actions">
                        <button
                          type="button"
                          className="lectures-btn lectures-btn-secondary"
                          disabled={downloadingFileId === file.id}
                          onClick={() => handleDownloadFile(file, activeLectureView)}
                        >
                          {downloadingFileId === file.id ? (
                            <>
                              <i className="fas fa-circle-notch fa-spin"></i> جاري التحميل...
                            </>
                          ) : (
                            <>
                              <i className="fas fa-download"></i> تحميل المذكرة
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Bottom Lesson Sibling Navigation ("الانتقال للمحاضرة الثانية التي معها في نفس الدرس") ── */}
            {(() => {
              const contextLesson = activeLectureView.contextLesson || standaloneLessons.find(
                (les) => les.id === activeLectureView.chapter_id || les.lectures?.some((l) => l.id === activeLectureView.id)
              )
              const siblingLectures = contextLesson?.lectures || []
              if (!contextLesson || siblingLectures.length <= 1) return null

              const currentIdx = siblingLectures.findIndex((l) => l.id === activeLectureView.id)
              const prevLecture = currentIdx > 0 ? siblingLectures[currentIdx - 1] : null
              const nextLecture = currentIdx >= 0 && currentIdx < siblingLectures.length - 1 ? siblingLectures[currentIdx + 1] : null

              return (
                <div className="lecture-lesson-navigation-bar">
                  <div className="lesson-nav-info">
                    <div className="lesson-nav-badge">
                      <i className="fas fa-book-bookmark"></i> درس: <strong>{contextLesson.title}</strong>
                    </div>
                    <span className="lesson-nav-counter">
                      المحاضرة {currentIdx + 1} من {siblingLectures.length}
                    </span>
                  </div>

                  <div className="lesson-nav-actions">
                    {prevLecture && (
                      <button
                        type="button"
                        className="lesson-nav-btn prev"
                        onClick={() => handleOpenLectureView(prevLecture, null, contextLesson)}
                      >
                        <i className="fas fa-arrow-right"></i>
                        <div className="lesson-nav-btn-text">
                          <small>المحاضرة السابقة</small>
                          <strong>{prevLecture.title}</strong>
                        </div>
                      </button>
                    )}
                    {nextLecture && (
                      <button
                        type="button"
                        className="lesson-nav-btn next"
                        onClick={() => handleOpenLectureView(nextLecture, null, contextLesson)}
                      >
                        <div className="lesson-nav-btn-text">
                          <small>المحاضرة التالية</small>
                          <strong>{nextLecture.title}</strong>
                        </div>
                        <i className="fas fa-arrow-left"></i>
                      </button>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        </main>
      ) : (
        <>
          {/* ── Page Header / Hero (Curriculum View) ──────────────────────── */}
          <header className="lectures-hero">
            <div className="lectures-hero-top">
              <div>
                <div className="lectures-hero-badge">
                  <i className="fas fa-graduation-cap"></i>
                  <span>المنهج والمحاضرات الدراسية</span>
                </div>
                <h1 className="lectures-hero-title">المحاضرات التعليمية</h1>
                <p className="lectures-hero-desc">
                  تابع دروسك ومحاضراتك بالترتيب التعليمي المعتمد، شاهد الشروحات وحمل المذكرات وتجاوز التقييمات.
                </p>
              </div>

              {/* "إضافة محاضرة" Button (Admin / Authorized Teacher Only) */}
              {canManage && (
                <div className="lectures-hero-action">
                  <button
                    type="button"
                    className="lectures-btn-add-lecture"
                    onClick={() => handleOpenCreateLecture()}
                  >
                    <i className="fas fa-plus-circle"></i>
                    <span>إضافة محاضرة</span>
                  </button>
                </div>
              )}
            </div>

            {/* ── Grade Display: Student locked badge vs Admin switcher ───────── */}
            {userRole === 'student' ? (
              <div className="lectures-student-grade-bar">
                <div className="lectures-student-grade-badge">
                  <i className="fas fa-user-graduate"></i>
                  <span className="lectures-student-grade-label">الصف الدراسي:</span>
                  <strong className="lectures-student-grade-val">
                    {gradeOptions.find((g) => g.id === selectedGrade)?.name || selectedGrade}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="lectures-grade-bar">
                {/* Same compact picker the reports use: grades grouped by stage
                    instead of fifteen large pills wrapping over three rows. */}
                <GradePicker
                  bare
                  showCounts={false}
                  title="اختر الصف الدراسي"
                  grades={gradeOptions.map((g) => g.id)}
                  labels={Object.fromEntries(gradeOptions.map((g) => [g.id, g.name]))}
                  allLabel={canManage ? 'جميع الصفوف' : ''}
                  value={selectedGrade}
                  onChange={handleGradeChange}
                />
              </div>
            )}

            {/* ── Active vs Archive Tabs Bar (Admin / Assistant Only) ─── */}
            {canManage && (
              <div
                className="lectures-archive-bar"
                style={{
                  display: 'flex',
                  gap: '10px',
                  marginTop: '16px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                  flexWrap: 'wrap'
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowArchived(false)}
                  style={{
                    background: !showArchived ? 'var(--primary-gradient, linear-gradient(135deg, #667eea 0%, #764ba2 100%))' : 'transparent',
                    color: !showArchived ? '#fff' : 'var(--text-secondary, #a0aec0)',
                    border: !showArchived ? 'none' : '1px solid rgba(255,255,255,0.1)',
                    padding: '8px 18px',
                    borderRadius: 8,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '0.9rem'
                  }}
                >
                  <i className="fas fa-layer-group"></i>
                  <span>📂 المحاضرات النشطة</span>
                  <span
                    style={{
                      background: !showArchived ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: '0.78rem'
                    }}
                  >
                    {totalActiveLectures}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowArchived(true)}
                  style={{
                    background: showArchived ? 'var(--primary-gradient, linear-gradient(135deg, #667eea 0%, #764ba2 100%))' : 'transparent',
                    color: showArchived ? '#fff' : 'var(--text-secondary, #a0aec0)',
                    border: showArchived ? 'none' : '1px solid rgba(255,255,255,0.1)',
                    padding: '8px 18px',
                    borderRadius: 8,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '0.9rem'
                  }}
                >
                  <i className="fas fa-box-archive"></i>
                  <span>📦 الأرشيف</span>
                  <span
                    style={{
                      background: showArchived ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: '0.78rem'
                    }}
                  >
                    {totalArchivedLectures}
                  </span>
                </button>
              </div>
            )}
          </header>

          {/* ── Main Content Area ───────────────────────────────────────── */}
          <main className="lectures-main-content">
            {loading && (
              <div className="lectures-state-card lectures-loading-card">
                <i className="fas fa-circle-notch fa-spin lectures-spinner"></i>
                <h3>جاري تحميل المحاضرات...</h3>
                <p>نسترجع الآن محتويات وفصول المنهج الدراسي</p>
              </div>
            )}

            {!loading && error && (
              <div className="lectures-state-card lectures-error-card">
                <i className="fas fa-triangle-exclamation"></i>
                <h3>تعذر تحميل المحاضرات</h3>
                <p>{error}</p>
                <button
                  type="button"
                  className="lectures-btn lectures-btn-primary"
                  onClick={() => loadCurriculum()}
                >
                  <i className="fas fa-rotate-right"></i> إعادة المحاولة
                </button>
              </div>
            )}

            {!loading && !error && (
              <>
                {/* ── 1. Standalone Lectures Section ────────────────────── */}
                <section className="lectures-section">
                  <div className="lectures-section-header">
                    <div className="lectures-section-icon" style={{ background: showArchived ? 'rgba(245, 158, 11, 0.1)' : undefined, color: showArchived ? '#d97706' : undefined }}>
                      <i className={`fas ${showArchived ? 'fa-box-archive' : 'fa-layer-group'}`}></i>
                    </div>
                    <div className="lectures-section-info">
                      <h2>{showArchived ? 'المحاضرات المستقلة (الأرشيف)' : 'المحاضرات المستقلة'}</h2>
                      <p>{showArchived ? 'المحاضرات المؤرشفة وغير المتاحة للطلاب حالياً. يمكنك إلغاء أرشفتها في أي وقت.' : 'محاضرات تعليمية شاملة متاحة مباشرة لهذا الصف الدراسي'}</p>
                    </div>
                    <span className="lectures-section-count">
                      {displayedStandaloneLectures.length} {showArchived ? 'محاضرة مؤرشفة' : 'محاضرة'}
                    </span>
                  </div>

                  {displayedStandaloneLectures.length === 0 ? (
                    <div className="lectures-empty-box">
                      <i className={`fas ${showArchived ? 'fa-box-open' : 'fa-graduation-cap'}`}></i>
                      <p>{showArchived ? 'لا توجد محاضرات مستقلة مؤرشفة لهذا الصف.' : 'لا توجد محاضرات مستقلة لهذا الصف حالياً.'}</p>
                      {canManage && !showArchived && (
                        <button
                          type="button"
                          className="lectures-btn lectures-btn-primary"
                          onClick={() => handleOpenCreateLecture()}
                          style={{ marginTop: '8px' }}
                        >
                          <i className="fas fa-plus"></i> إضافة محاضرة جديدة الآن
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {displayedStandaloneLectures.map((lec, idx) => renderLectureCard(lec, idx))}
                    </div>
                  )}
                </section>

                {/* ── 2. Standalone Lessons / Chapters Section ───────────── */}
                {displayedLessons.length > 0 && (
                  <section className="lectures-section">
                    <div className="lectures-section-header">
                      <div className="lectures-section-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669' }}>
                        <i className="fas fa-book-open"></i>
                      </div>
                      <div className="lectures-section-info">
                        <h2>{showArchived ? 'محاضرات الدروس المؤرشفة' : 'الدروس والوحدات الدراسية'}</h2>
                        <p>{showArchived ? 'المحاضرات المؤرشفة التابعة لفصول ودروس المنهج' : 'أقسام تعليمية كبرى تضم مجموعات من المحاضرات المرتبطة'}</p>
                      </div>
                      <span className="lectures-section-count">
                        {displayedLessons.length} درس
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {displayedLessons.map((les) => {
                        const isLessonExpanded = !!expandedLessons[les.id]
                        return (
                          <div key={les.id} className="lecture-card" style={{ borderRight: '4px solid #059669' }}>
                            <div
                              className="lecture-card-header"
                              onClick={() => toggleLesson(les.id)}
                              style={{ background: 'rgba(16, 185, 129, 0.03)' }}
                            >
                              <div className="lecture-card-title-group">
                                <div className="lecture-card-num-badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#059669' }}>
                                  <i className="fas fa-book-bookmark"></i>
                                </div>
                                <div className="lecture-card-title-wrap">
                                  <span className="lecture-card-title">{les.title}</span>
                                  {les.description && <p className="lecture-card-desc">{les.description}</p>}
                                </div>
                              </div>
                              <div className="lecture-card-meta">
                                <span className="lecture-stat-badge">
                                  {les.lectures?.length || 0} محاضرات
                                </span>
                                <i className="fas fa-chevron-down lecture-card-expand-icon"></i>
                              </div>
                            </div>

                            {isLessonExpanded && (
                              <div className="lecture-card-body" style={{ background: 'transparent' }}>
                                {(les.lectures || []).length === 0 ? (
                                  <p style={{ color: 'var(--text-muted, #64748b)', margin: '8px 0' }}>لا توجد محاضرات داخل هذا الدرس بعد.</p>
                                ) : (
                                  (les.lectures || []).map((lec, idx) => renderLectureCard(lec, idx, les))
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

                {/* ── 3. Packages Section (If applicable / Optional) ──────── */}
                {packages.length > 0 && (
                  <section className="lectures-section">
                    <div className="lectures-section-header">
                      <div className="lectures-section-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#d97706' }}>
                        <i className="fas fa-box-archive"></i>
                      </div>
                      <div className="lectures-section-info">
                        <h2>الباقات والمناهج المسجلة</h2>
                        <p>مناهج وباقات خاصة باشتراكك أو متاحة في المنصة</p>
                      </div>
                      <span className="lectures-section-count">
                        {packages.length} باقة
                      </span>
                    </div>

                    <div className="lectures-package-tabs" style={{ marginBottom: '16px' }}>
                      {packages.map((pkg) => (
                        <button
                          key={pkg.id}
                          type="button"
                          className={`lectures-pkg-tab ${selectedPackage?.id === pkg.id ? 'active' : ''}`}
                          onClick={() => setSelectedPackage(selectedPackage?.id === pkg.id ? null : pkg)}
                        >
                          <i className="fas fa-graduation-cap"></i>
                          <span>{pkg.title}</span>
                        </button>
                      ))}
                    </div>

                    {selectedPackage && (
                      <div className="lectures-curriculum-wrapper">
                        <StudentCurriculumView
                          package={selectedPackage}
                          onSelectVideo={handleSelectVideo}
                          onSelectExam={handleSelectExam}
                        />
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
          </main>
        </>
      )}

      {/* ── CREATE / EDIT LECTURE MODAL ─────────────────────────────── */}
      {(modalType === 'create_lecture' || modalType === 'edit_lecture') && (
        <div className="lectures-modal-overlay" onClick={() => setModalType(null)}>
          <div className="lectures-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lectures-modal-header">
              <div className="lectures-studio-header-title">
                <h3>
                  <i className="fas fa-graduation-cap" style={{ color: '#6366f1' }}></i>
                  {modalType === 'create_lecture' ? 'استوديو إنشاء محاضرة متكاملة' : 'تعديل بيانات المحاضرة'}
                </h3>
                {modalType === 'create_lecture' && (
                  <div className="lectures-studio-header-badges">
                    <span className="studio-badge">
                      <i className="fas fa-video"></i> {stagedVideos.length} فيديو
                    </span>
                    <span className="studio-badge">
                      <i className="fas fa-clipboard-check"></i> {stagedExams.length} امتحان
                    </span>
                    <span className="studio-badge">
                      <i className="fas fa-file-pdf"></i> {stagedFiles.length} مذكرة
                    </span>
                  </div>
                )}
              </div>
              <button type="button" className="lectures-modal-close" onClick={() => setModalType(null)}>
                <i className="fas fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleSaveLecture}>
              <div className="lectures-modal-body">
                {/* ── STUDIO CREATION MODE SWITCHER ── */}
                {modalType === 'create_lecture' && (
                  <div className="studio-creation-mode-bar">
                    <button
                      type="button"
                      className={`studio-mode-pill ${creationMode === 'lecture' ? 'active' : ''}`}
                      onClick={() => setCreationMode('lecture')}
                    >
                      <i className="fas fa-chalkboard-user"></i>
                      <span>محاضرة فردية</span>
                    </button>
                    <button
                      type="button"
                      className={`studio-mode-pill ${creationMode === 'lesson' ? 'active' : ''}`}
                      onClick={() => {
                        setCreationMode('lesson')
                        if (!formLessonTitle && formTitle) {
                          setFormLessonTitle(formTitle)
                        }
                      }}
                    >
                      <i className="fas fa-layer-group"></i>
                      <span>درس كامل / وحدة (تضم عدة محاضرات)</span>
                    </button>
                  </div>
                )}

                {/* ── SECTION 1: BASIC INFO (LESSON MODE vs LECTURE MODE) ── */}
                {creationMode === 'lesson' && modalType === 'create_lecture' ? (
                  <div className="studio-section">
                    <div className="studio-section-header">
                      <div className="studio-section-title">
                        <span className="studio-section-num">1</span>
                        <div>
                          <h4>بيانات الدرس والمحاضرات التابعة له</h4>
                          <p className="studio-section-sub">
                            حدد عنوان الدرس والصف، وتنقل بين محاضرات الدرس لتحديد محتوى كل محاضرة (فيديوهات، امتحانات، مذكرات) بالأسفل.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="studio-grid-2">
                      <div className="lectures-form-group">
                        <label>عنوان الدرس / الوحدة الشاملة *</label>
                        <input
                          type="text"
                          className="lectures-form-input"
                          value={formLessonTitle}
                          onChange={(e) => setFormLessonTitle(e.target.value)}
                          placeholder="مثال: الدرس الأول — الميكانيكا وقوانين الحركة"
                          required
                        />
                      </div>

                      <div className="lectures-form-group">
                        <label>الصف الدراسي *</label>
                        <select
                          className="lectures-form-select"
                          value={formGrade}
                          onChange={(e) => setFormGrade(e.target.value)}
                          required
                        >
                          {gradeOptions.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="lectures-form-group">
                      <label>وصف الدرس (اختياري)</label>
                      <textarea
                        className="lectures-form-textarea"
                        rows={2}
                        value={formLessonDesc}
                        onChange={(e) => setFormLessonDesc(e.target.value)}
                        placeholder="وصف مختصر لمحتوى ومخرجات هذا الدرس..."
                      />
                    </div>

                    {/* Sub-Lectures Tab Bar */}
                    <div className="studio-lesson-subs-box">
                      <div className="studio-lesson-subs-header">
                        <span className="studio-subs-title">
                          <i className="fas fa-bars-staggered"></i> محاضرات هذا الدرس ({lessonLectures.length}):
                        </span>
                        <button
                          type="button"
                          className="studio-btn studio-btn-add"
                          onClick={handleAddLessonSubLecture}
                          style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                        >
                          <i className="fas fa-plus"></i> إضافة محاضرة أخرى للدرس
                        </button>
                      </div>

                      <div className="studio-lesson-subs-tabs">
                        {lessonLectures.map((sub, sIdx) => (
                          <div
                            key={sub.id || sIdx}
                            className={`studio-lesson-sub-tab ${activeLessonLecIdx === sIdx ? 'active' : ''}`}
                            onClick={() => handleSwitchLessonLecture(sIdx)}
                          >
                            <div className="sub-tab-content">
                              <span className="sub-tab-badge">{sIdx + 1}</span>
                              <span className="sub-tab-name">
                                {activeLessonLecIdx === sIdx ? (formTitle || `المحاضرة ${sIdx + 1}`) : (sub.title || `المحاضرة ${sIdx + 1}`)}
                              </span>
                            </div>
                            {lessonLectures.length > 1 && (
                              <button
                                type="button"
                                className="sub-tab-del"
                                onClick={(ev) => handleRemoveLessonSubLecture(sIdx, ev)}
                                title="إزالة هذه المحاضرة"
                              >
                                <i className="fas fa-xmark"></i>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="studio-active-sub-config">
                        <div className="lectures-form-group" style={{ marginBottom: 0 }}>
                          <label>
                            عنوان المحاضرة المحددة حالياً (المحاضرة {activeLessonLecIdx + 1}) *
                          </label>
                          <input
                            type="text"
                            className="lectures-form-input"
                            value={formTitle}
                            onChange={(e) => setFormTitle(e.target.value)}
                            placeholder={`مثال: المحاضرة ${activeLessonLecIdx + 1}: الشرح والتأسيس`}
                            required
                          />
                          <small className="studio-hint" style={{ color: '#6366f1', fontWeight: '600', marginTop: '6px', display: 'block' }}>
                            💡 الفيديوهات والامتحانات والمذكرات المضافة في الأقسام (2 و 3 و 4) أدناه ستضاف خصيصاً داخل هذه المحاضرة ({formTitle || `المحاضرة ${activeLessonLecIdx + 1}`}).
                          </small>
                        </div>
                      </div>
                    </div>

                    {/* Availability Duration Selector */}
                    <div className="lectures-form-group studio-availability-group" style={{ marginTop: '14px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                        <i className="fas fa-clock-rotate-left" style={{ color: '#f59e0b' }}></i>
                        مدة إتاحة وصلاحية المحاضرات للطلاب:
                      </label>
                      <div className="studio-avail-presets-bar">
                        {[
                          { id: 'unlimited', label: 'متاحة دائماً', icon: 'fa-infinity' },
                          { id: '24h', label: '24 ساعة (يوم)', icon: 'fa-stopwatch' },
                          { id: '48h', label: '48 ساعة (يومان)', icon: 'fa-stopwatch' },
                          { id: '7d', label: 'أسبوع (7 أيام)', icon: 'fa-calendar-week' },
                          { id: '30d', label: 'شهر (30 يوم)', icon: 'fa-calendar-days' },
                          { id: 'custom_hours', label: 'ساعات مخصصة', icon: 'fa-clock' },
                          { id: 'until_date', label: 'حتى تاريخ محدد', icon: 'fa-calendar-check' }
                        ].map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            className={`studio-avail-pill ${formAvailabilityPreset === preset.id ? 'active' : ''}`}
                            onClick={() => setFormAvailabilityPreset(preset.id)}
                          >
                            <i className={`fas ${preset.icon}`}></i>
                            <span>{preset.label}</span>
                          </button>
                        ))}
                      </div>

                      {formAvailabilityPreset === 'custom_hours' && (
                        <div style={{ marginTop: '10px' }}>
                          <label style={{ fontSize: '0.85rem' }}>عدد الساعات المتاحة بعد النشر *</label>
                          <input
                            type="number"
                            min="1"
                            className="lectures-form-input"
                            placeholder="مثال: 72 (لإتاحة المحاضرة لمدة 3 أيام)"
                            value={formAvailableHours}
                            onChange={(e) => setFormAvailableHours(e.target.value)}
                            required
                          />
                        </div>
                      )}

                      {formAvailabilityPreset === 'until_date' && (
                        <div style={{ marginTop: '10px' }}>
                          <label style={{ fontSize: '0.85rem' }}>تاريخ ووقت انتهاء الإتاحة *</label>
                          <input
                            type="datetime-local"
                            className="lectures-form-input"
                            value={formAvailableUntil}
                            onChange={(e) => setFormAvailableUntil(e.target.value)}
                            required
                          />
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                      <input
                        type="checkbox"
                        id="formIsActiveCheckbox"
                        checked={formIsActive}
                        onChange={(e) => setFormIsActive(e.target.checked)}
                      />
                      <label htmlFor="formIsActiveCheckbox" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>
                        الدرس ومحاضراته نشطة ومتاحة للطلاب
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="studio-section">
                    <div className="studio-section-header">
                      <div className="studio-section-title">
                        <span className="studio-section-num">1</span>
                        <h4>البيانات الأساسية للمحاضرة</h4>
                      </div>
                    </div>

                    <div className="studio-grid-2">
                      <div className="lectures-form-group">
                        <label>عنوان المحاضرة *</label>
                        <input
                          type="text"
                          className="lectures-form-input"
                          value={formTitle}
                          onChange={(e) => setFormTitle(e.target.value)}
                          placeholder="مثال: المحاضرة الأولى — شرح الحركة والسرعة"
                          required
                        />
                      </div>

                      <div className="lectures-form-group">
                        <label>الصف الدراسي *</label>
                        <select
                          className="lectures-form-select"
                          value={formGrade}
                          onChange={(e) => setFormGrade(e.target.value)}
                          required
                        >
                          {gradeOptions.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {standaloneLessons.length > 0 && (
                      <div className="lectures-form-group">
                        <label>الدرس / القسم (اختياري)</label>
                        <select
                          className="lectures-form-select"
                          value={formChapterId}
                          onChange={(e) => setFormChapterId(e.target.value)}
                        >
                          <option value="">-- بدون درس (محاضرة مستقلة) --</option>
                          {standaloneLessons.map((les) => (
                            <option key={les.id} value={les.id}>
                              {les.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="lectures-form-group">
                      <label>وصف المحاضرة (اختياري)</label>
                      <textarea
                        className="lectures-form-textarea"
                        rows={2}
                        value={formDesc}
                        onChange={(e) => setFormDesc(e.target.value)}
                        placeholder="تفاصيل المحاضرة والمواضيع المغطاة..."
                      />
                    </div>

                    {/* Availability Duration Selector */}
                    <div className="lectures-form-group studio-availability-group" style={{ marginTop: '14px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                        <i className="fas fa-clock-rotate-left" style={{ color: '#f59e0b' }}></i>
                        مدة إتاحة وصلاحية المحاضرة للطلاب:
                      </label>
                      <div className="studio-avail-presets-bar">
                        {[
                          { id: 'unlimited', label: 'متاحة دائماً', icon: 'fa-infinity' },
                          { id: '24h', label: '24 ساعة (يوم)', icon: 'fa-stopwatch' },
                          { id: '48h', label: '48 ساعة (يومان)', icon: 'fa-stopwatch' },
                          { id: '7d', label: 'أسبوع (7 أيام)', icon: 'fa-calendar-week' },
                          { id: '30d', label: 'شهر (30 يوم)', icon: 'fa-calendar-days' },
                          { id: 'custom_hours', label: 'ساعات مخصصة', icon: 'fa-clock' },
                          { id: 'until_date', label: 'حتى تاريخ محدد', icon: 'fa-calendar-check' }
                        ].map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            className={`studio-avail-pill ${formAvailabilityPreset === preset.id ? 'active' : ''}`}
                            onClick={() => setFormAvailabilityPreset(preset.id)}
                          >
                            <i className={`fas ${preset.icon}`}></i>
                            <span>{preset.label}</span>
                          </button>
                        ))}
                      </div>

                      {formAvailabilityPreset === 'custom_hours' && (
                        <div style={{ marginTop: '10px' }}>
                          <label style={{ fontSize: '0.85rem' }}>عدد الساعات المتاحة بعد النشر *</label>
                          <input
                            type="number"
                            min="1"
                            className="lectures-form-input"
                            placeholder="مثال: 72 (لإتاحة المحاضرة لمدة 3 أيام)"
                            value={formAvailableHours}
                            onChange={(e) => setFormAvailableHours(e.target.value)}
                            required
                          />
                        </div>
                      )}

                      {formAvailabilityPreset === 'until_date' && (
                        <div style={{ marginTop: '10px' }}>
                          <label style={{ fontSize: '0.85rem' }}>تاريخ ووقت انتهاء الإتاحة *</label>
                          <input
                            type="datetime-local"
                            className="lectures-form-input"
                            value={formAvailableUntil}
                            onChange={(e) => setFormAvailableUntil(e.target.value)}
                            required
                          />
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                      <input
                        type="checkbox"
                        id="formIsActiveCheckbox"
                        checked={formIsActive}
                        onChange={(e) => setFormIsActive(e.target.checked)}
                      />
                      <label htmlFor="formIsActiveCheckbox" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>
                        المحاضرة نشطة ومتاحة للطلاب
                      </label>
                    </div>
                  </div>
                )}

                {/* ONLY IN CREATE STUDIO: MULTI-PART VIDEOS, EXAMS & PDFS */}
                {modalType === 'create_lecture' && (
                  <>
                    {/* ── SECTION 2: VIDEOS STUDIO ── */}
                    <div className="studio-section">
                      <div className="studio-section-header">
                        <div className="studio-section-title">
                          <span className="studio-section-num">2</span>
                          <div>
                            <h4>فيديوهات وشروحات المحاضرة ({stagedVideos.length})</h4>
                            <p className="studio-section-sub">
                              أضف أجزاء الشرح (YouTube / Google Drive / Bunny) أو اختر من الفيديوهات المسجلة
                            </p>
                          </div>
                        </div>

                        <div className="studio-header-actions">
                          <button
                            type="button"
                            className="studio-btn studio-btn-add"
                            onClick={handleAddFreshVideo}
                          >
                            <i className="fas fa-plus"></i> إضافة جزء فيديو مباشر
                          </button>

                          {allVideosCatalog.length > 0 && (
                            <button
                              type="button"
                              className="studio-btn studio-btn-pick"
                              onClick={() => setQuickAttachPicker(quickAttachPicker === 'video' ? null : 'video')}
                            >
                              <i className="fas fa-list-ul"></i> اختر من المكتبة
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Video Quick Picker Dropdown */}
                      {quickAttachPicker === 'video' && (
                        <div className="studio-quick-picker">
                          <div className="studio-picker-title">
                            <span>اختر فيديو من المكتبة لضمه إلى المحاضرة:</span>
                            <button
                              type="button"
                              className="studio-picker-close"
                              onClick={() => setQuickAttachPicker(null)}
                            >
                              <i className="fas fa-xmark"></i>
                            </button>
                          </div>
                          <select
                            className="lectures-form-select"
                            onChange={(e) => {
                              const found = allVideosCatalog.find((v) => v.id === e.target.value)
                              if (found) {
                                handleAddCatalogVideo(found)
                                setQuickAttachPicker(null)
                              }
                            }}
                            defaultValue=""
                          >
                            <option value="" disabled>-- اضغط لاختيار الفيديو --</option>
                            {allVideosCatalog.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.title} ({v.grade || 'بدون صف'})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Staged Videos List */}
                      {stagedVideos.length === 0 ? (
                        <div className="studio-empty-notice">
                          <i className="fas fa-film"></i>
                          <span>لم يتم إضافة أي أجزاء فيديو بعد. اضغط على "إضافة جزء فيديو مباشر" لإضافة فيديو يوتيوب أو درايف أو Bunny.</span>
                        </div>
                      ) : (
                        <div className="studio-items-list">
                          {stagedVideos.map((sv, idx) => (
                            <div key={sv.id} className="studio-card">
                              <div className="studio-card-top">
                                <div className="studio-card-left">
                                  <span className="studio-card-badge">الجزء {idx + 1}</span>
                                  {sv.isNew ? (
                                    <input
                                      type="text"
                                      className="studio-card-title-input"
                                      value={sv.title}
                                      onChange={(e) => handleUpdateStagedVideo(sv.id, 'title', e.target.value)}
                                      placeholder={`عنوان الجزء ${idx + 1}`}
                                      required
                                    />
                                  ) : (
                                    <span className="studio-card-title-static">
                                      {sv.title} <small>(فيديو مسجل مسبقاً)</small>
                                    </span>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  className="studio-card-del-btn"
                                  onClick={() => handleRemoveStagedVideo(sv.id)}
                                  title="حذف هذا الجزء"
                                >
                                  <i className="fas fa-trash-can"></i>
                                </button>
                              </div>

                              {sv.isNew && (
                                <div className="studio-card-body">
                                  {/* Source Picker Tabs */}
                                  <div className="studio-source-tabs">
                                    <label className={`studio-source-pill ${sv.source === 'youtube' ? 'active' : ''}`}>
                                      <input
                                        type="radio"
                                        name={`source_${sv.id}`}
                                        checked={sv.source === 'youtube'}
                                        onChange={() => handleUpdateStagedVideo(sv.id, 'source', 'youtube')}
                                      />
                                      <i className="fab fa-youtube" style={{ color: '#ef4444' }}></i>
                                      <span>YouTube</span>
                                    </label>
                                    <label className={`studio-source-pill ${sv.source === 'drive' ? 'active' : ''}`}>
                                      <input
                                        type="radio"
                                        name={`source_${sv.id}`}
                                        checked={sv.source === 'drive'}
                                        onChange={() => handleUpdateStagedVideo(sv.id, 'source', 'drive')}
                                      />
                                      <i className="fab fa-google-drive" style={{ color: '#3b82f6' }}></i>
                                      <span>Google Drive</span>
                                    </label>
                                    <label className={`studio-source-pill ${sv.source === 'bunny' ? 'active' : ''}`}>
                                      <input
                                        type="radio"
                                        name={`source_${sv.id}`}
                                        checked={sv.source === 'bunny'}
                                        onChange={() => handleUpdateStagedVideo(sv.id, 'source', 'bunny')}
                                      />
                                      <i className="fas fa-cloud" style={{ color: '#f97316' }}></i>
                                      <span>Bunny Stream</span>
                                    </label>
                                  </div>

                                  {/* Source Input */}
                                  {sv.source === 'youtube' && (
                                    <div className="lectures-form-group">
                                      <label>رابط الفيديو أو معرف اليوتيوب (11 حرف) *</label>
                                      <input
                                        type="text"
                                        className="lectures-form-input"
                                        value={sv.youtubeUrl}
                                        onChange={(e) => handleUpdateStagedVideo(sv.id, 'youtubeUrl', e.target.value)}
                                        placeholder="مثال: https://youtu.be/dQw4w9WgXcQ أو dQw4w9WgXcQ"
                                        required
                                      />
                                      <small className="studio-hint">
                                        يتم استخراج المعرف تلقائياً. تأكد من ضبط الفيديو كـ "غير مدرج" (Unlisted).
                                      </small>
                                    </div>
                                  )}

                                  {sv.source === 'drive' && (
                                    <div className="lectures-form-group">
                                      <label>رابط ملف Google Drive أو معرّف الملف *</label>
                                      <input
                                        type="text"
                                        className="lectures-form-input"
                                        value={sv.driveUrl}
                                        onChange={(e) => handleUpdateStagedVideo(sv.id, 'driveUrl', e.target.value)}
                                        placeholder="ألصق رابط Drive المشترك أو معرّف الملف"
                                        required
                                      />
                                      <small className="studio-hint">
                                        تأكد من مشاركة الملف: "أي شخص لديه الرابط يمكنه العرض".
                                      </small>
                                    </div>
                                  )}

                                  {sv.source === 'bunny' && (
                                    <div className="lectures-form-group">
                                      <label>معرّف فيديو Bunny Stream (Video GUID) *</label>
                                      <input
                                        type="text"
                                        className="lectures-form-input"
                                        value={sv.bunnyVideoId}
                                        onChange={(e) => handleUpdateStagedVideo(sv.id, 'bunnyVideoId', e.target.value)}
                                        placeholder="مثال: e213f56d-4589-498c-8f90-1c89078b5412"
                                        required
                                      />
                                    </div>
                                  )}

                                  <div className="studio-grid-2" style={{ marginTop: '8px' }}>
                                    <div className="lectures-form-group">
                                      <label>مدة الجزء (بالدقائق) — اختياري</label>
                                      <input
                                        type="number"
                                        className="lectures-form-input"
                                        value={sv.durationMinutes}
                                        onChange={(e) => handleUpdateStagedVideo(sv.id, 'durationMinutes', e.target.value)}
                                        placeholder="مثال: 25"
                                        min="0"
                                      />
                                    </div>

                                    <div className="lectures-form-group">
                                      <label>الحد الأقصى للمشاهدات لكل طالب</label>
                                      <input
                                        type="number"
                                        className="lectures-form-input"
                                        value={sv.viewLimit}
                                        onChange={(e) => handleUpdateStagedVideo(sv.id, 'viewLimit', e.target.value)}
                                        placeholder="افتراضي: 3 مرات"
                                        min="1"
                                        max="99"
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ── SECTION 3: EXAMS STUDIO (OPTIONAL) ── */}
                    <div className="studio-section">
                      <div className="studio-section-header">
                        <div className="studio-section-title">
                          <span className="studio-section-num">3</span>
                          <div>
                            <h4>الامتحانات والواجبات الملحقة ({stagedExams.length}) (اختياري)</h4>
                            <p className="studio-section-sub">
                              أضف اختباراً أو واجباً، ويمكنك اشتراطه لفتح فيديو معين بدرجة محددة
                            </p>
                          </div>
                        </div>

                        <div className="studio-header-actions">
                          <button
                            type="button"
                            className="studio-btn studio-btn-add"
                            onClick={handleAddFreshExam}
                          >
                            <i className="fas fa-plus"></i> إنشاء امتحان سريع
                          </button>

                          {allExamsCatalog.length > 0 && (
                            <button
                              type="button"
                              className="studio-btn studio-btn-pick"
                              onClick={() => setQuickAttachPicker(quickAttachPicker === 'exam' ? null : 'exam')}
                            >
                              <i className="fas fa-list-ul"></i> بنك الامتحانات
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Exam Quick Picker Dropdown */}
                      {quickAttachPicker === 'exam' && (
                        <div className="studio-quick-picker">
                          <div className="studio-picker-title">
                            <span>اختر امتحاناً موجوداً لضمه إلى المحاضرة:</span>
                            <button
                              type="button"
                              className="studio-picker-close"
                              onClick={() => setQuickAttachPicker(null)}
                            >
                              <i className="fas fa-xmark"></i>
                            </button>
                          </div>
                          <select
                            className="lectures-form-select"
                            onChange={(e) => {
                              const found = allExamsCatalog.find((x) => x.id === e.target.value)
                              if (found) {
                                handleAddCatalogExam(found)
                                setQuickAttachPicker(null)
                              }
                            }}
                            defaultValue=""
                          >
                            <option value="" disabled>-- اضغط لاختيار الامتحان --</option>
                            {allExamsCatalog.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.title} ({x.grade || 'عام'})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Staged Exams List */}
                      {stagedExams.length === 0 ? (
                        <div className="studio-empty-notice">
                          <i className="fas fa-clipboard-question"></i>
                          <span>لا توجد امتحانات مضافة. يمكنك تخطي هذه الخطوة تماماً إن لم تكن هناك اختبارات في هذه المحاضرة.</span>
                        </div>
                      ) : (
                        <div className="studio-items-list">
                          {stagedExams.map((se) => (
                            <div key={se.id} className="studio-card exam-card">
                              <div className="studio-card-top">
                                <div className="studio-card-left">
                                  <span className="studio-card-badge exam">
                                    <i className="fas fa-pen-nib"></i> امتحان / تقييم
                                  </span>
                                  {se.isNew ? (
                                    <input
                                      type="text"
                                      className="studio-card-title-input"
                                      value={se.title}
                                      onChange={(e) => handleUpdateStagedExam(se.id, 'title', e.target.value)}
                                      placeholder="عنوان الامتحان"
                                      required
                                    />
                                  ) : (
                                    <span className="studio-card-title-static">
                                      {se.title} <small>(من بنك الامتحانات)</small>
                                    </span>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  className="studio-card-del-btn"
                                  onClick={() => handleRemoveStagedExam(se.id)}
                                  title="إزالة هذا الامتحان"
                                >
                                  <i className="fas fa-trash-can"></i>
                                </button>
                              </div>

                              <div className="studio-card-body">
                                {se.isNew && (
                                  <div className="studio-grid-3">
                                    <div className="lectures-form-group">
                                      <label>المدة (بالدقائق)</label>
                                      <input
                                        type="number"
                                        className="lectures-form-input"
                                        value={se.durationMinutes}
                                        onChange={(e) => handleUpdateStagedExam(se.id, 'durationMinutes', e.target.value)}
                                        min="1"
                                      />
                                    </div>
                                    <div className="lectures-form-group">
                                      <label>نوع التقييم</label>
                                      <select
                                        className="lectures-form-select"
                                        value={se.examType}
                                        onChange={(e) => handleUpdateStagedExam(se.id, 'examType', e.target.value)}
                                      >
                                        <option value="exam">امتحان شامل</option>
                                        <option value="quiz">كويز سريع</option>
                                        <option value="homework">واجب منزلي</option>
                                      </select>
                                    </div>
                                    <div className="lectures-form-group">
                                      <label>الدرجة الكلية</label>
                                      <input
                                        type="number"
                                        className="lectures-form-input"
                                        value={se.totalPoints}
                                        onChange={(e) => handleUpdateStagedExam(se.id, 'totalPoints', e.target.value)}
                                        min="1"
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Prerequisite Gating Rule Configuration */}
                                <div className="studio-prereq-box">
                                  <div className="studio-prereq-header">
                                    <input
                                      type="checkbox"
                                      id={`prereq_${se.id}`}
                                      checked={se.isPrerequisite}
                                      onChange={(e) => handleUpdateStagedExam(se.id, 'isPrerequisite', e.target.checked)}
                                    />
                                    <label htmlFor={`prereq_${se.id}`}>
                                      <i className="fas fa-lock" style={{ color: '#f59e0b' }}></i>
                                      <strong>اشتراط اجتياز هذا الامتحان لفتح فيديو معين في هذه المحاضرة</strong>
                                    </label>
                                  </div>

                                  {se.isPrerequisite && (
                                    <div className="studio-prereq-controls">
                                      <div className="lectures-form-group">
                                        <label>الفيديو المشروط فتحه *</label>
                                        <select
                                          className="lectures-form-select"
                                          value={se.targetVideoId}
                                          onChange={(e) => handleUpdateStagedExam(se.id, 'targetVideoId', e.target.value)}
                                          required
                                        >
                                          <option value="">-- اختر الفيديو المستهدف --</option>
                                          {stagedVideos.map((sv, vIdx) => (
                                            <option key={sv.id} value={sv.id}>
                                              الجزء {vIdx + 1}: {sv.title}
                                            </option>
                                          ))}
                                        </select>
                                      </div>

                                      <div className="lectures-form-group">
                                        <label>النسبة المئوية المطلوبة للاجتياز (%) *</label>
                                        <input
                                          type="number"
                                          className="lectures-form-input"
                                          value={se.requiredScore}
                                          onChange={(e) => handleUpdateStagedExam(se.id, 'requiredScore', e.target.value)}
                                          min="1"
                                          max="100"
                                          required
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>


                                {/* Full Questions Studio & Shared Text/Image Blocks */}
                                {se.isNew && (
                                  <>
                                    <div className="studio-exam-subtabs">
                                      <button
                                        type="button"
                                        className={`studio-exam-subtab ${(se.activeExamTab || 'questions') === 'questions' ? 'active' : ''}`}
                                        onClick={() => handleUpdateStagedExam(se.id, 'activeExamTab', 'questions')}
                                      >
                                        <i className="fas fa-list-check"></i>
                                        <span>الأسئلة والخيارات ({se.questions?.length || 0})</span>
                                      </button>
                                      <button
                                        type="button"
                                        className={`studio-exam-subtab ${se.activeExamTab === 'shared_blocks' ? 'active' : ''}`}
                                        onClick={() => handleUpdateStagedExam(se.id, 'activeExamTab', 'shared_blocks')}
                                      >
                                        <i className="fas fa-file-lines"></i>
                                        <span>النصوص والصور المشتركة ({se.sharedBlocks?.length || 0})</span>
                                      </button>
                                    </div>

                                    {se.activeExamTab === 'shared_blocks' ? (
                                      <div className="studio-exam-shared-blocks-section">
                                        <div className="studio-shared-blocks-guide">
                                          <i className="fas fa-circle-info"></i>
                                          <span>
                                            أضف نص قراءة أو قطعة فهم أو صورة / رسماً بيانياً مشتركاً وقم بربطه بالأسئلة التابعة له في هذا الامتحان.
                                          </span>
                                        </div>
                                        <SharedTextBlocksEditor
                                          blocks={se.sharedBlocks || []}
                                          onChange={(updatedBlocks) => handleUpdateExamSharedBlocks(se.id, updatedBlocks)}
                                          questions={se.questions || []}
                                        />
                                      </div>
                                    ) : (
                                      <div className="studio-exam-questions-section">
                                        <div className="studio-exam-q-header">
                                          <div className="studio-exam-q-info">
                                            <h5>
                                              <i className="fas fa-clipboard-question"></i> أسئلة الامتحان ({se.questions?.length || 0})
                                            </h5>
                                            <span className="studio-exam-q-points">
                                              إجمالي الدرجات: {se.totalPoints || 10}
                                            </span>
                                          </div>
                                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            <button
                                              type="button"
                                              className="studio-q-action-btn import"
                                              onClick={() => handleUpdateStagedExam(se.id, 'showBulkImport', !se.showBulkImport)}
                                            >
                                              <i className="fas fa-wand-magic-sparkles"></i> 📋 استيراد سريع
                                            </button>
                                            <button
                                              type="button"
                                              className="studio-q-action-btn add"
                                              onClick={() => handleAddExamQuestion(se.id)}
                                            >
                                              <i className="fas fa-plus"></i> إضافة سؤال
                                            </button>
                                            <button
                                              type="button"
                                              className="studio-q-action-btn toggle"
                                              onClick={() => handleToggleExamQuestions(se.id)}
                                            >
                                              <i className={`fas fa-chevron-${se.showQuestionsEditor !== false ? 'up' : 'down'}`}></i>
                                              {se.showQuestionsEditor !== false ? 'طي الأسئلة' : 'عرض الأسئلة'}
                                            </button>
                                          </div>
                                        </div>

                                        {/* Bulk Import Drawer */}
                                        {se.showBulkImport && (
                                          <div className="studio-bulk-import-box">
                                            <div className="studio-bulk-import-guide">
                                              <h6>طريقة الاستيراد السريع:</h6>
                                              <p>• اكتب كل سؤال في فقرة مستقلة (السطر الأول السؤال، والأسطر التالية الاختيارات).</p>
                                              <p>• ضع علامة <strong style={{ color: '#10b981' }}>*</strong> قبل الإجابة الصحيحة.</p>
                                              <p>• افصل بين كل سؤال وسؤال بسطر فارغ. يمكنك وضع <code>!2</code> لتحديد الدرجات.</p>
                                            </div>
                                            <textarea
                                              className="studio-bulk-textarea"
                                              rows={6}
                                              value={se.bulkImportText || ''}
                                              onChange={(e) => handleUpdateStagedExam(se.id, 'bulkImportText', e.target.value)}
                                              placeholder={`ما عاصمة مصر؟\n*القاهرة\nالإسكندرية\nالجيزة\n\nما ناتج 5 + 5؟\n8\n9\n*10\n!2`}
                                              dir="auto"
                                            />
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                              <button
                                                type="button"
                                                className="lectures-btn lectures-btn-primary"
                                                style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                                                onClick={() => handleExamBulkImport(se.id)}
                                              >
                                                <i className="fas fa-file-import"></i> استيراد الأسئلة الآن
                                              </button>
                                              <button
                                                type="button"
                                                className="lectures-btn lectures-btn-secondary"
                                                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                                                onClick={() => handleUpdateStagedExam(se.id, 'showBulkImport', false)}
                                              >
                                                إلغاء
                                              </button>
                                            </div>
                                          </div>
                                        )}

                                        {/* Questions List */}
                                        {se.showQuestionsEditor !== false && (
                                          <div className="studio-questions-list">
                                            {(!se.questions || se.questions.length === 0) ? (
                                              <div className="studio-empty-questions">
                                                <i className="fas fa-feather"></i>
                                                <p>لم تتم إضافة أي أسئلة بعد. اضغط «➕ إضافة سؤال» أو «📋 استيراد سريع» للصقها دفعة واحدة.</p>
                                              </div>
                                            ) : (
                                              se.questions.map((q, qIdx) => (
                                                <div key={q.id || qIdx} className="studio-question-card">
                                                  <div className="studio-question-topbar">
                                                    <span className="studio-question-num">السؤال {qIdx + 1}</span>
                                                    <div className="studio-question-actions">
                                                      <span className="studio-q-points-badge">
                                                        النقاط:
                                                        <input
                                                          type="number"
                                                          min="1"
                                                          value={q.points || 1}
                                                          onChange={(e) => handleUpdateExamQuestion(se.id, q.id, 'points', parseInt(e.target.value, 10) || 1)}
                                                        />
                                                      </span>
                                                      <button
                                                        type="button"
                                                        className="studio-q-del-btn"
                                                        onClick={() => handleRemoveExamQuestion(se.id, q.id)}
                                                        title="حذف هذا السؤال"
                                                      >
                                                        <i className="fas fa-trash-can"></i>
                                                      </button>
                                                    </div>
                                                  </div>

                                                  {/* Question Text */}
                                                  <textarea
                                                    className="studio-question-input"
                                                    rows={2}
                                                    value={q.question || ''}
                                                    onChange={(e) => handleUpdateExamQuestion(se.id, q.id, 'question', e.target.value)}
                                                    placeholder="اكتب نص السؤال هنا..."
                                                    dir="auto"
                                                  />

                                                  {/* Question Image Picker */}
                                                  <div className="studio-q-image-wrap">
                                                    <QuestionImagePicker
                                                      value={q.image || ''}
                                                      onChange={(url) => handleUpdateExamQuestion(se.id, q.id, 'image', url)}
                                                      label="صورة توضيحية للسؤال (اختياري)"
                                                    />
                                                  </div>

                                                  {/* Options */}
                                                  <div className="studio-q-options">
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                      <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-muted, #94a3b8)' }}>
                                                        الاختيارات (اختر الدائرة للإجابة الصحيحة):
                                                      </span>
                                                      <div style={{ display: 'flex', gap: '6px' }}>
                                                        <button
                                                          type="button"
                                                          className="studio-opt-btn"
                                                          onClick={() => handleAddExamQuestionOption(se.id, q.id)}
                                                        >
                                                          <i className="fas fa-plus"></i> إضافة اختيار
                                                        </button>
                                                        {q.options?.length > 2 && (
                                                          <button
                                                            type="button"
                                                            className="studio-opt-btn remove"
                                                            onClick={() => handleRemoveExamQuestionOption(se.id, q.id)}
                                                          >
                                                            <i className="fas fa-minus"></i> حذف اختيار
                                                          </button>
                                                        )}
                                                      </div>
                                                    </div>

                                                    {(q.options || []).map((opt, optIdx) => {
                                                      const isCorrect = (q.answers || [0]).includes(optIdx)
                                                      return (
                                                        <div key={optIdx} className={`studio-option-row ${isCorrect ? 'correct' : ''}`}>
                                                          <input
                                                            type={q.isMultiple ? 'checkbox' : 'radio'}
                                                            name={`correct_${se.id}_${q.id}`}
                                                            checked={isCorrect}
                                                            onChange={() => handleToggleExamQuestionCorrect(se.id, q.id, optIdx)}
                                                            title="تحديد كإجابة صحيحة"
                                                          />
                                                          <input
                                                            type="text"
                                                            className="studio-option-input"
                                                            value={opt}
                                                            onChange={(e) => handleUpdateExamQuestionOption(se.id, q.id, optIdx, e.target.value)}
                                                            placeholder={`الخيار ${optIdx + 1}`}
                                                            dir="auto"
                                                          />
                                                          {isCorrect && (
                                                            <span className="studio-correct-badge">
                                                              <i className="fas fa-check"></i> صحيحة
                                                            </span>
                                                          )}
                                                        </div>
                                                      )
                                                    })}
                                                  </div>
                                                </div>
                                              ))
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ── SECTION 4: PDF BOOKLETS STUDIO (OPTIONAL) ── */}
                    <div className="studio-section">
                      <div className="studio-section-header">
                        <div className="studio-section-title">
                          <span className="studio-section-num">4</span>
                          <div>
                            <h4>المذكرات وملفات الـ PDF ({stagedFiles.length}) (اختياري)</h4>
                            <p className="studio-section-sub">
                              ارفع مذكرات وملخصات المحاضرة لكي يحملها الطالب مباشرة
                            </p>
                          </div>
                        </div>

                        <div>
                          <label className="studio-btn studio-btn-add" style={{ cursor: 'pointer', margin: 0 }}>
                            <i className="fas fa-file-arrow-up"></i> رفع ملف PDF
                            <input
                              type="file"
                              accept="application/pdf"
                              multiple
                              style={{ display: 'none' }}
                              onChange={handleAddStagedFiles}
                            />
                          </label>
                        </div>
                      </div>

                      {stagedFiles.length === 0 ? (
                        <div className="studio-empty-notice">
                          <i className="fas fa-file-pdf"></i>
                          <span>لا توجد مذكرات مرفقة. يمكنك رفع ملف PDF بضغطة زر أعلاه أو تخطي هذه الخطوة.</span>
                        </div>
                      ) : (
                        <div className="studio-items-list">
                          {stagedFiles.map((sf) => (
                            <div key={sf.id} className="studio-card file-card">
                              <div className="studio-card-top">
                                <div className="studio-card-left" style={{ width: '100%' }}>
                                  <span className="studio-card-badge file">
                                    <i className="fas fa-file-pdf"></i> PDF
                                  </span>
                                  <input
                                    type="text"
                                    className="studio-card-title-input"
                                    value={sf.title}
                                    onChange={(e) => handleUpdateStagedFile(sf.id, e.target.value)}
                                    placeholder="عنوان المذكرة أو الملف"
                                    required
                                  />
                                  <span className="studio-file-size">
                                    {(sf.fileSize / (1024 * 1024)).toFixed(2)} MB
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  className="studio-card-del-btn"
                                  onClick={() => handleRemoveStagedFile(sf.id)}
                                  title="إزالة هذا الملف"
                                >
                                  <i className="fas fa-trash-can"></i>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* ── STUDIO FOOTER ── */}
              <div className="lectures-modal-footer studio-footer">
                <div className="studio-footer-summary">
                  {modalType === 'create_lecture' && (
                    creationMode === 'lesson' ? (
                      <span>
                        ملخص الدرس: <strong>{lessonLectures.length} محاضرات</strong> (المحاضرة المحددة: <strong>{stagedVideos.length} فيديو</strong> • <strong>{stagedExams.length} امتحان</strong> • <strong>{stagedFiles.length} مذكرة</strong>)
                      </span>
                    ) : (
                      <span>
                        الملخص: <strong>{stagedVideos.length} فيديو</strong> •{' '}
                        <strong>{stagedExams.length} امتحان</strong> •{' '}
                        <strong>{stagedFiles.length} مذكرة</strong>
                      </span>
                    )
                  )}
                </div>

                <div className="studio-footer-btns">
                  <button
                    type="button"
                    className="lectures-btn lectures-btn-secondary"
                    onClick={() => setModalType(null)}
                    disabled={isSubmitting}
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="lectures-btn lectures-btn-primary studio-submit-btn"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <i className="fas fa-circle-notch fa-spin"></i> جاري حفظ ونشر {creationMode === 'lesson' ? 'الدرس والمحاضرات' : 'المحاضرة'}...
                      </>
                    ) : modalType === 'create_lecture' ? (
                      <>
                        <i className="fas fa-wand-magic-sparkles"></i> {creationMode === 'lesson' ? 'حفظ ونشر الدرس بكافة محاضراته' : 'حفظ ونشر المحاضرة بالكامل'}
                      </>
                    ) : (
                      'حفظ التعديلات'
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ATTACH VIDEO MODAL ──────────────────────────────────────── */}
      {modalType === 'attach_video' && modalTarget && (
        <div className="lectures-modal-overlay" onClick={() => setModalType(null)}>
          <div className="lectures-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lectures-modal-header">
              <h3>
                <i className="fas fa-video" style={{ color: '#2563eb' }}></i>
                ربط فيديو بـ: {modalTarget.title}
              </h3>
              <button type="button" className="lectures-modal-close" onClick={() => setModalType(null)}>
                <i className="fas fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleAttachVideoSubmit}>
              <div className="lectures-modal-body">
                <div className="lectures-form-group">
                  <label>بحث في قائمة الفيديوهات</label>
                  <input
                    type="text"
                    className="lectures-form-input"
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="ابحث باسم الفيديو..."
                  />
                </div>

                <div className="lectures-form-group">
                  <label>اختر الفيديو *</label>
                  <select
                    className="lectures-form-select"
                    value={selectedItemId}
                    onChange={(e) => setSelectedItemId(e.target.value)}
                    required
                  >
                    <option value="">-- اختر الفيديو --</option>
                    {allVideosCatalog
                      .filter((v) => !catalogSearch || v.title?.toLowerCase().includes(catalogSearch.toLowerCase()))
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.title} ({v.grade || 'بدون صف'})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="lectures-modal-footer">
                <button
                  type="button"
                  className="lectures-btn lectures-btn-secondary"
                  onClick={() => setModalType(null)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="lectures-btn lectures-btn-primary"
                  disabled={isSubmitting || !selectedItemId}
                >
                  {isSubmitting ? 'جاري الربط...' : 'ربط الفيديو بالمحاضرة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ATTACH EXAM MODAL ───────────────────────────────────────── */}
      {modalType === 'attach_exam' && modalTarget && (
        <div className="lectures-modal-overlay" onClick={() => setModalType(null)}>
          <div className="lectures-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lectures-modal-header">
              <h3>
                <i className="fas fa-clipboard-check" style={{ color: '#7c3aed' }}></i>
                ربط امتحان بـ: {modalTarget.title}
              </h3>
              <button type="button" className="lectures-modal-close" onClick={() => setModalType(null)}>
                <i className="fas fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleAttachExamSubmit}>
              <div className="lectures-modal-body">
                <div className="lectures-form-group">
                  <label>بحث في قائمة الامتحانات</label>
                  <input
                    type="text"
                    className="lectures-form-input"
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="ابحث باسم الامتحان..."
                  />
                </div>

                <div className="lectures-form-group">
                  <label>اختر الامتحان *</label>
                  <select
                    className="lectures-form-select"
                    value={selectedItemId}
                    onChange={(e) => setSelectedItemId(e.target.value)}
                    required
                  >
                    <option value="">-- اختر الامتحان --</option>
                    {allExamsCatalog
                      .filter((ex) => !catalogSearch || ex.title?.toLowerCase().includes(catalogSearch.toLowerCase()))
                      .map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.title} ({ex.grade || 'بدون صف'})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="lectures-modal-footer">
                <button
                  type="button"
                  className="lectures-btn lectures-btn-secondary"
                  onClick={() => setModalType(null)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="lectures-btn lectures-btn-primary"
                  style={{ background: '#7c3aed' }}
                  disabled={isSubmitting || !selectedItemId}
                >
                  {isSubmitting ? 'جاري الربط...' : 'ربط الامتحان بالمحاضرة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── UPLOAD PDF FILE MODAL ───────────────────────────────────── */}
      {modalType === 'upload_file' && modalTarget && (
        <div className="lectures-modal-overlay" onClick={() => setModalType(null)}>
          <div className="lectures-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lectures-modal-header">
              <h3>
                <i className="fas fa-file-pdf" style={{ color: '#059669' }}></i>
                رفع ملف PDF لـ: {modalTarget.title}
              </h3>
              <button type="button" className="lectures-modal-close" onClick={() => setModalType(null)}>
                <i className="fas fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleUploadFileSubmit}>
              <div className="lectures-modal-body">
                <div className="lectures-form-group">
                  <label>اسم المذكرة أو الملف *</label>
                  <input
                    type="text"
                    className="lectures-form-input"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="مثال: مذكرة شرح المحاضرة الأولى"
                    required
                  />
                </div>

                <div className="lectures-form-group">
                  <label>ملف PDF *</label>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="lectures-form-input"
                    onChange={(e) => setUploadFileObj(e.target.files?.[0] || null)}
                    required
                  />
                </div>

                {uploadProgress > 0 && (
                  <div style={{ marginTop: '6px' }}>
                    <div style={{ fontSize: '0.82rem', marginBottom: '4px', color: 'var(--text-muted, #64748b)' }}>
                      جاري الرفع إلى التخزين السحابي: {uploadProgress}%
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'rgba(0,0,0,0.06)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ width: `${uploadProgress}%`, height: '100%', background: '#059669', transition: 'width 0.2s' }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="lectures-modal-footer">
                <button
                  type="button"
                  className="lectures-btn lectures-btn-secondary"
                  onClick={() => setModalType(null)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="lectures-btn lectures-btn-primary"
                  style={{ background: '#059669' }}
                  disabled={isSubmitting || !uploadFileObj}
                >
                  {isSubmitting ? 'جاري الرفع...' : 'رفع وحفظ الملف'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MANAGE AVAILABILITY & EXTENSIONS MODAL ───────────────────── */}
      {modalType === 'manage_availability' && availTargetLecture && (
        <div className="lectures-modal-overlay" onClick={() => setModalType(null)}>
          <div className="lectures-modal lectures-avail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lectures-modal-header">
              <div className="lectures-studio-header-title">
                <h3>
                  <i className="fas fa-clock-rotate-left" style={{ color: '#f59e0b' }}></i>
                  إدارة إتاحة وتمديد المحاضرة
                </h3>
                <span className="studio-badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#d97706' }}>
                  {availTargetLecture.title}
                </span>
              </div>
              <button type="button" className="lectures-modal-close" onClick={() => setModalType(null)}>
                <i className="fas fa-xmark"></i>
              </button>
            </div>

            <div className="lectures-modal-body">
              {/* Current Status Box */}
              {(() => {
                const currentAvail = getLectureAvailabilityInfo(availTargetLecture)
                return (
                  <div className="avail-status-card">
                    <div className="avail-status-icon">
                      <i className={`fas ${currentAvail.icon}`}></i>
                    </div>
                    <div className="avail-status-info">
                      <span className="avail-status-label">الحالة الحالية للمحاضرة:</span>
                      <strong className={`avail-status-val ${currentAvail.colorClass}`}>
                        {currentAvail.label}
                      </strong>
                      <p>{currentAvail.detail}</p>
                    </div>
                  </div>
                )
              })()}

              {/* 1. Target Scope Selection */}
              <div className="avail-config-section">
                <label className="avail-field-title">
                  <i className="fas fa-users-viewfinder"></i> لمن تريد تطبيق هذا التمديد أو التحكم بالإتاحة؟
                </label>
                <div className="avail-scope-chips">
                  <button
                    type="button"
                    className={`avail-scope-chip ${availScope === 'all' ? 'active' : ''}`}
                    onClick={() => setAvailScope('all')}
                  >
                    <i className="fas fa-earth-americas"></i>
                    <span>للجميع (إتاحة المحاضرة الأساسية)</span>
                  </button>

                  <button
                    type="button"
                    className={`avail-scope-chip ${availScope === 'student' ? 'active' : ''}`}
                    onClick={() => setAvailScope('student')}
                  >
                    <i className="fas fa-user-graduate"></i>
                    <span>طالب محدد (استثناء فردي)</span>
                  </button>

                  <button
                    type="button"
                    className={`avail-scope-chip ${availScope === 'group' ? 'active' : ''}`}
                    onClick={() => setAvailScope('group')}
                  >
                    <i className="fas fa-user-group"></i>
                    <span>مجموعة معينة (سنتر / أونلاين)</span>
                  </button>

                  <button
                    type="button"
                    className={`avail-scope-chip ${availScope === 'prep' ? 'active' : ''}`}
                    onClick={() => setAvailScope('prep')}
                  >
                    <i className="fas fa-school"></i>
                    <span>مرحلة دراسية بالكامل</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Scope Target Selectors */}
              {availScope === 'student' && (
                <div className="avail-target-selector-box">
                  <label className="avail-sub-label">ابحث عن الطالب (بالاسم أو الهاتف):</label>
                  <div className="avail-student-search-wrap">
                    <input
                      type="text"
                      className="lectures-form-input"
                      placeholder="اكتب اسم الطالب أو رقم هاتفه..."
                      value={availStudentSearch}
                      onChange={(e) => handleSearchStudentsForAvailability(e.target.value)}
                    />
                    {availSearchingStudents && <i className="fas fa-circle-notch fa-spin avail-search-spin"></i>}
                  </div>

                  {availTargetStudent ? (
                    <div className="avail-chosen-student-card">
                      <div className="chosen-info">
                        <i className="fas fa-circle-check" style={{ color: '#10b981' }}></i>
                        <div>
                          <strong>{availTargetStudent.name}</strong>
                          <span>{availTargetStudent.phone || ''} • {availTargetStudent.grade || ''}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="avail-clear-chosen-btn"
                        onClick={() => setAvailTargetStudent(null)}
                      >
                        تغيير الطالب
                      </button>
                    </div>
                  ) : (
                    availStudentResults.length > 0 && (
                      <div className="avail-students-dropdown">
                        {availStudentResults.map((st) => (
                          <div
                            key={st.id}
                            className="avail-student-result-item"
                            onClick={() => {
                              setAvailTargetStudent(st)
                              setAvailStudentResults([])
                              setAvailStudentSearch('')
                            }}
                          >
                            <div className="st-name">{st.name}</div>
                            <div className="st-meta">{st.phone || 'بدون هاتف'} • {st.grade || ''}</div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}

              {availScope === 'group' && (
                <div className="avail-target-selector-box">
                  <div className="studio-grid-2">
                    <div>
                      <label className="avail-sub-label">الصف الدراسي للمجموعة:</label>
                      <select
                        className="lectures-form-select"
                        value={availTargetGrade}
                        onChange={(e) => setAvailTargetGrade(e.target.value)}
                      >
                        {gradeOptions.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="avail-sub-label">اختر المجموعة:</label>
                      <select
                        className="lectures-form-select"
                        value={availTargetGroup}
                        onChange={(e) => setAvailTargetGroup(e.target.value)}
                      >
                        <option value="">-- اختر المجموعة --</option>
                        {availAllGroups
                          .filter((grp) => !availTargetGrade || grp.grade === availTargetGrade)
                          .map((grp) => (
                            <option key={grp.id} value={grp.name}>{grp.name}</option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {availScope === 'prep' && (
                <div className="avail-target-selector-box">
                  <label className="avail-sub-label">اختر المرحلة الدراسية:</label>
                  <select
                    className="lectures-form-select"
                    value={availTargetGrade}
                    onChange={(e) => setAvailTargetGrade(e.target.value)}
                  >
                    {gradeOptions.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 2. Action Type & Duration */}
              <div className="avail-config-section" style={{ marginTop: '16px' }}>
                <label className="avail-field-title">
                  <i className="fas fa-stopwatch"></i> الإجراء وخيارات التمديد:
                </label>

                <div className="avail-action-types-grid">
                  <label className={`avail-action-option ${availActionType === 'extend_preset' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="availActionType"
                      value="extend_preset"
                      checked={availActionType === 'extend_preset'}
                      onChange={() => setAvailActionType('extend_preset')}
                    />
                    <div>
                      <strong>تمديد سريع بعدد ساعات</strong>
                      <p>إضافة ساعات إضافية من الآن أو تمديد الوقت المتبقي</p>
                    </div>
                  </label>

                  <label className={`avail-action-option ${availActionType === 'set_until' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="availActionType"
                      value="set_until"
                      checked={availActionType === 'set_until'}
                      onChange={() => setAvailActionType('set_until')}
                    />
                    <div>
                      <strong>تحديد موعد انتهاء محدد</strong>
                      <p>متاحة حتى تاريخ ووقت معين في التقويم</p>
                    </div>
                  </label>

                  <label className={`avail-action-option ${availActionType === 'unlimited' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="availActionType"
                      value="unlimited"
                      checked={availActionType === 'unlimited'}
                      onChange={() => setAvailActionType('unlimited')}
                    />
                    <div>
                      <strong>إتاحة مستمرة دائماً</strong>
                      <p>رفع أي قيود زمنية وتفعيل الوصول المستمر</p>
                    </div>
                  </label>

                  <label className={`avail-action-option ${availActionType === 'lock' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="availActionType"
                      value="lock"
                      checked={availActionType === 'lock'}
                      onChange={() => setAvailActionType('lock')}
                    />
                    <div>
                      <strong>قفل الإتاحة / منع الوصول</strong>
                      <p>تعطيل هذه المحاضرة لهذا النطاق</p>
                    </div>
                  </label>
                </div>

                {/* Preset hours selector */}
                {availActionType === 'extend_preset' && (
                  <div className="avail-preset-quick-btns" style={{ marginTop: '12px' }}>
                    <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>اختر مدة التمديد:</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                      {[
                        { hours: 24, label: '+24 ساعة (يوم)' },
                        { hours: 48, label: '+48 ساعة (يومان)' },
                        { hours: 72, label: '+3 أيام' },
                        { hours: 168, label: '+أسبوع (7 أيام)' },
                        { hours: 720, label: '+شهر (30 يوم)' }
                      ].map((item) => (
                        <button
                          key={item.hours}
                          type="button"
                          className={`avail-quick-time-btn ${availPresetHours === item.hours ? 'active' : ''}`}
                          onClick={() => setAvailPresetHours(item.hours)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom date until */}
                {availActionType === 'set_until' && (
                  <div style={{ marginTop: '12px' }}>
                    <label style={{ fontSize: '0.86rem', fontWeight: 600 }}>تاريخ ووقت انتهاء الإتاحة:</label>
                    <input
                      type="datetime-local"
                      className="lectures-form-input"
                      style={{ marginTop: '6px' }}
                      value={availCustomUntilDate}
                      onChange={(e) => setAvailCustomUntilDate(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Active Overrides Table for this Lecture */}
              <div className="avail-active-overrides-section" style={{ marginTop: '20px' }}>
                <div className="avail-overrides-header">
                  <h4>
                    <i className="fas fa-list-check" style={{ color: '#6366f1' }}></i>
                    الاستثناءات والتمديدات النشطة لهذه المحاضرة ({availActiveOverridesList.length})
                  </h4>
                  {availLoadingOverrides && <i className="fas fa-circle-notch fa-spin"></i>}
                </div>

                {availActiveOverridesList.length === 0 ? (
                  <div className="avail-empty-overrides">
                    <p>لا توجد استثناءات فردية نشطة حالياً. تطبق الإتاحة العامة للمحاضرة على كافة الطلاب.</p>
                  </div>
                ) : (
                  <div className="avail-overrides-list">
                    {availActiveOverridesList.map((ov) => {
                      const scopeText = ov.scope === 'student' ? 'طالب محدد' : ov.scope === 'group' ? 'مجموعة' : 'مرحلة'
                      return (
                        <div key={ov.id || `${ov.scope}-${ov.target_id}`} className="avail-override-row">
                          <div className="override-badge-scope">{scopeText}</div>
                          <div className="override-detail">
                            <span className="override-target-id">
                              {ov.scope === 'student' ? `معرف الطالب: ${ov.target_id.slice(0, 8)}...` : ov.target_id}
                            </span>
                            <span className="override-state">
                              {ov.allowed === false ? 'مقفول' : ov.available_until ? `حتى ${new Date(ov.available_until).toLocaleDateString('ar-EG')}` : `${ov.available_hours || 'إتاحة'} ساعة`}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="override-del-btn"
                            title="إلغاء هذا الاستثناء"
                            onClick={() => handleDeleteLectureOverride(ov)}
                          >
                            <i className="fas fa-trash-can"></i>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="lectures-modal-footer">
              <button
                type="button"
                className="lectures-btn lectures-btn-secondary"
                onClick={() => setModalType(null)}
              >
                إغلاق
              </button>
              <button
                type="button"
                className="lectures-btn lectures-btn-primary"
                style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#fff' }}
                disabled={isSubmitting || (availScope === 'student' && !availTargetStudent)}
                onClick={handleApplyAvailabilityExtension}
              >
                {isSubmitting ? 'جاري الحفظ والتطبيق...' : 'تطبيق التمديد وحفظ الإتاحة ✨'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM DELETE DIALOG ───────────────────────────────────── */}
      {deleteConfirm && (
        <ConfirmDeleteDialog
          open={!!deleteConfirm}
          title={
            deleteConfirm.type === 'lecture'
              ? `حذف المحاضرة: ${deleteConfirm.title}`
              : deleteConfirm.type === 'detach_video'
              ? `فك ارتباط الفيديو: ${deleteConfirm.title}`
              : deleteConfirm.type === 'detach_exam'
              ? `فك ارتباط الامتحان: ${deleteConfirm.title}`
              : `حذف الملف: ${deleteConfirm.title}`
          }
          message={
            deleteConfirm.type === 'lecture'
              ? 'هل أنت متأكد من حذف هذه المحاضرة؟ سيبقى محتوى الفيديوهات والامتحانات محفوظاً في المنصة ولن يتم حذفه.'
              : deleteConfirm.type === 'detach_video'
              ? 'هل أنت متأكد من فك ارتباط هذا الفيديو بهذه المحاضرة؟ سيبقى الفيديو متاحاً في المنصة.'
              : deleteConfirm.type === 'detach_exam'
              ? 'هل أنت متأكد من فك ارتباط هذا الامتحان بهذه المحاضرة؟ سيبقى الامتحان متاحاً في المنصة.'
              : 'هل أنت متأكد من حذف هذا الملف من المحاضرة؟'
          }
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* ── PREREQUISITE LOCK MODAL ─────────────────────────────────── */}
      {activeLockModal && (
        <PrerequisiteLockModal
          isOpen={!!activeLockModal}
          onClose={() => setActiveLockModal(null)}
          requiredExamId={activeLockModal.required_exam_id}
          requiredExamTitle={activeLockModal.required_exam_title}
          requiredScore={activeLockModal.required_score}
          studentScore={activeLockModal.student_score}
        />
      )}
    </div>
  )
}
