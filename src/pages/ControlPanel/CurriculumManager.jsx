import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  listCourseChapters,
  createCourseChapter,
  updateCourseChapter,
  deleteCourseChapter,
  listCourseLectures,
  getLectureDetails,
  createCourseLecture,
  updateCourseLecture,
  deleteCourseLecture,
  addVideoToLecture,
  removeVideoFromLecture,
  addExamToLecture,
  removeExamFromLecture,
  addLectureFile,
  removeLectureFile,
  getUnassignedVideos,
  getUnassignedExams,
  getUnlockRulesForContent,
  createUnlockRule,
  updateUnlockRule,
  deleteUnlockRule
} from '@backend/courseLecturesApi'
import { listVideos } from '@backend/videosApi'
import { listExams } from '@backend/examsApi'
import { listPackages } from '@backend/packagesApi'
import { useNavigate } from 'react-router-dom'
import { uploadLectureFile } from '@backend/r2'
import { notify } from '../../utils/notify'
import ConfirmDeleteDialog from '../../components/ConfirmDeleteDialog'
import { useTenant } from '../../contexts/TenantContext'
import { GRADE_LABEL } from './shared'
import './CurriculumManager.css'

export default function CurriculumManager({ package: propPkg, onBack }) {
  const { tenantId } = useTenant()
  const navigate = useNavigate()
  const [packages, setPackages] = useState([])
  const [loadingPackages, setLoadingPackages] = useState(!propPkg)
  const [selectedPkg, setSelectedPkg] = useState(propPkg || null)

  useEffect(() => {
    if (propPkg) {
      setSelectedPkg(propPkg)
    }
  }, [propPkg])

  useEffect(() => {
    if (!propPkg && tenantId) {
      let cancelled = false
      ;(async () => {
        try {
          setLoadingPackages(true)
          const pkgs = await listPackages(tenantId)
          if (!cancelled) {
            setPackages(pkgs || [])
            if ((pkgs || []).length > 0) {
              setSelectedPkg(prev => prev || pkgs[0])
            }
          }
        } catch (err) {
          console.error('Failed to load packages in CurriculumManager:', err)
        } finally {
          if (!cancelled) setLoadingPackages(false)
        }
      })()
      return () => { cancelled = true }
    }
  }, [propPkg, tenantId])

  const pkg = selectedPkg
  // ── Hierarchy State ───────────────────────────────────────────────────
  const [chapters, setChapters] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [expandedChapters, setExpandedChapters] = useState({}) // { [chapId]: boolean }

  // ── Unassigned Reservoir State ────────────────────────────────────────
  const [showUnassignedDrawer, setShowUnassignedDrawer] = useState(false)
  const [unassignedTab, setUnassignedTab] = useState('videos') // 'videos' | 'exams'
  const [unassignedVideos, setUnassignedVideos] = useState([])
  const [unassignedExams, setUnassignedExams] = useState([])
  const [loadingUnassigned, setLoadingUnassigned] = useState(false)

  // ── Catalogs for Picker Modals ────────────────────────────────────────
  const [allVideos, setAllVideos] = useState([])
  const [allExams, setAllExams] = useState([])
  const [catalogLoaded, setCatalogLoaded] = useState(false)

  // ── Modals & Dialog State ─────────────────────────────────────────────
  const [modalType, setModalType] = useState(null)
  // modalType values:
  // 'create_chapter' | 'edit_chapter' |
  // 'create_lecture' | 'edit_lecture' |
  // 'attach_video' | 'attach_exam' | 'upload_file' |
  // 'unlock_rule' | 'assign_unassigned'
  const [modalTarget, setModalTarget] = useState(null) // chapter or lecture object

  // Generic Form States
  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [selectedItemId, setSelectedItemId] = useState('')
  const [requiredScore, setRequiredScore] = useState('70')
  const [searchFilter, setSearchFilter] = useState('')

  // Upload PDF State
  const [uploadFileObj, setUploadFileObj] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)

  // Confirm Delete Dialog
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { type, id, title, extra }

  // ── Data Loading ──────────────────────────────────────────────────────
  const loadCurriculum = useCallback(async () => {
    if (!pkg?.id) return
    try {
      setLoading(true)
      const chaps = await listCourseChapters(pkg.id)

      // Parallelize lecture fetching for all chapters
      const chapsWithLectures = await Promise.all(
        chaps.map(async (chap) => {
          const rawLectures = await listCourseLectures(chap.id)
          // For each lecture, fetch full details (videos, exams, files) and unlock rules
          const detailedLectures = await Promise.all(
            rawLectures.map(async (lec) => {
              try {
                const details = await getLectureDetails(lec.id)
                const unlockRules = await getUnlockRulesForContent('lecture', lec.id)
                return {
                  ...details,
                  unlockRules: unlockRules || []
                }
              } catch (e) {
                console.error(`Failed to fetch details for lecture ${lec.id}:`, e)
                return { ...lec, videos: [], exams: [], files: [], unlockRules: [] }
              }
            })
          )
          return {
            ...chap,
            lectures: detailedLectures
          }
        })
      )

      setChapters(chapsWithLectures)
      // By default, expand all chapters initially
      setExpandedChapters(prev => {
        const next = { ...prev }
        chapsWithLectures.forEach(c => {
          if (next[c.id] === undefined) next[c.id] = true
        })
        return next
      })
    } catch (err) {
      console.error(err)
      notify(err.message || 'تعذر تحميل بيانات المنهج والفصول', 'danger')
    } finally {
      setLoading(false)
    }
  }, [pkg?.id])

  const loadUnassignedContent = useCallback(async () => {
    try {
      setLoadingUnassigned(true)
      const [uVideos, uExams] = await Promise.all([
        getUnassignedVideos(),
        getUnassignedExams()
      ])
      setUnassignedVideos(uVideos || [])
      setUnassignedExams(uExams || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingUnassigned(false)
    }
  }, [])

  const loadCatalogs = useCallback(async () => {
    if (catalogLoaded) return
    try {
      const [v, e] = await Promise.all([
        listVideos(),
        listExams({ lean: true })
      ])
      setAllVideos(v || [])
      setAllExams(e || [])
      setCatalogLoaded(true)
    } catch (err) {
      console.error(err)
    }
  }, [catalogLoaded])

  useEffect(() => {
    loadCurriculum()
    loadUnassignedContent()
    loadCatalogs()
  }, [loadCurriculum, loadUnassignedContent, loadCatalogs])

  // ── Overall Stats Computation ─────────────────────────────────────────
  const stats = useMemo(() => {
    let lecturesCount = 0
    let videosCount = 0
    let examsCount = 0
    let filesCount = 0
    chapters.forEach(c => {
      lecturesCount += (c.lectures || []).length
      ;(c.lectures || []).forEach(l => {
        videosCount += (l.videos || []).length
        examsCount += (l.exams || []).length
        filesCount += (l.files || []).length
      })
    })
    return {
      chaptersCount: chapters.length,
      lecturesCount,
      videosCount,
      examsCount,
      filesCount,
      unassignedTotal: unassignedVideos.length + unassignedExams.length
    }
  }, [chapters, unassignedVideos, unassignedExams])

  // Flattened list of all lectures for quick target selection in modals
  const allLecturesList = useMemo(() => {
    const list = []
    chapters.forEach(c => {
      ;(c.lectures || []).forEach(l => {
        list.push({ ...l, chapterTitle: c.title })
      })
    })
    return list
  }, [chapters])

  // ── Chapter Actions ───────────────────────────────────────────────────
  const handleOpenCreateChapter = () => {
    setFormTitle('')
    setFormDesc('')
    setModalType('create_chapter')
  }

  const handleOpenEditChapter = (chap, e) => {
    e.stopPropagation()
    setModalTarget(chap)
    setFormTitle(chap.title)
    setFormDesc(chap.description || '')
    setModalType('edit_chapter')
  }

  const handleSaveChapter = async (e) => {
    e.preventDefault()
    if (!formTitle.trim()) return notify('عنوان الفصل مطلوب', 'danger')
    setBusy(true)
    try {
      if (modalType === 'edit_chapter') {
        await updateCourseChapter(modalTarget.id, {
          title: formTitle.trim(),
          description: formDesc.trim() || null
        })
        notify('تم تحديث بيانات الفصل بنجاح ✅', 'success')
      } else {
        const nextOrder = chapters.length > 0 ? Math.max(...chapters.map(c => c.sort_order || 0)) + 10 : 10
        await createCourseChapter({
          packageId: pkg.id,
          title: formTitle.trim(),
          description: formDesc.trim() || null,
          sortOrder: nextOrder
        })
        notify('تم إنشاء الفصل الدراسي بنجاح 🎉', 'success')
      }
      setModalType(null)
      setModalTarget(null)
      loadCurriculum()
    } catch (err) {
      notify(err.message || 'فشل حفظ الفصل', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteChapter = async () => {
    if (!deleteConfirm || deleteConfirm.type !== 'chapter') return
    try {
      await deleteCourseChapter(deleteConfirm.id)
      notify('تم حذف الفصل وكافة محاضراته بنجاح', 'success')
      setDeleteConfirm(null)
      loadCurriculum()
      loadUnassignedContent()
    } catch (err) {
      notify(err.message || 'فشل حذف الفصل', 'danger')
    }
  }

  const handleMoveChapter = async (chap, direction, e) => {
    e.stopPropagation()
    const index = chapters.findIndex(c => c.id === chap.id)
    if (index < 0) return
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= chapters.length) return

    const other = chapters[targetIndex]
    const tempOrder = other.sort_order || 0
    try {
      await Promise.all([
        updateCourseChapter(chap.id, { sort_order: tempOrder }),
        updateCourseChapter(other.id, { sort_order: chap.sort_order || 0 })
      ])
      loadCurriculum()
    } catch (err) {
      notify('تعذر تعديل ترتيب الفصول', 'danger')
    }
  }

  // ── Lecture Actions ───────────────────────────────────────────────────
  const handleMoveLecture = async (lec, chap, direction, e) => {
    e?.stopPropagation()
    const siblingLectures = chap.lectures || []
    const index = siblingLectures.findIndex(l => l.id === lec.id)
    if (index < 0) return
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= siblingLectures.length) return

    const other = siblingLectures[targetIndex]
    const tempOrder = other.sort_order || 0
    try {
      await Promise.all([
        updateCourseLecture(lec.id, { sort_order: tempOrder }),
        updateCourseLecture(other.id, { sort_order: lec.sort_order || 0 })
      ])
      loadCurriculum()
    } catch (err) {
      notify('تعذر تعديل ترتيب المحاضرات', 'danger')
    }
  }

  const handleOpenCreateLecture = (chap, e) => {
    e?.stopPropagation()
    setModalTarget(chap)
    setFormTitle('')
    setFormDesc('')
    setModalType('create_lecture')
  }

  const handleOpenEditLecture = (lec, chap, e) => {
    e?.stopPropagation()
    setModalTarget({ ...lec, parentChapter: chap })
    setFormTitle(lec.title)
    setFormDesc(lec.description || '')
    setModalType('edit_lecture')
  }

  const handleSaveLecture = async (e) => {
    e.preventDefault()
    if (!formTitle.trim()) return notify('عنوان المحاضرة مطلوب', 'danger')
    setBusy(true)
    try {
      if (modalType === 'edit_lecture') {
        await updateCourseLecture(modalTarget.id, {
          title: formTitle.trim(),
          description: formDesc.trim() || null
        })
        notify('تم تحديث المحاضرة بنجاح ✅', 'success')
      } else {
        const siblings = modalTarget.lectures || []
        const nextOrder = siblings.length > 0 ? Math.max(...siblings.map(l => l.sort_order || 0)) + 10 : 10
        await createCourseLecture({
          chapterId: modalTarget.id,
          title: formTitle.trim(),
          description: formDesc.trim() || null,
          sortOrder: nextOrder
        })
        notify('تمت إضافة المحاضرة بنجاح 🎉', 'success')
      }
      setModalType(null)
      setModalTarget(null)
      loadCurriculum()
    } catch (err) {
      notify(err.message || 'فشل حفظ المحاضرة', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteLecture = async () => {
    if (!deleteConfirm || deleteConfirm.type !== 'lecture') return
    try {
      await deleteCourseLecture(deleteConfirm.id)
      notify('تم حذف المحاضرة بنجاح', 'success')
      setDeleteConfirm(null)
      loadCurriculum()
      loadUnassignedContent()
    } catch (err) {
      notify(err.message || 'فشل حذف المحاضرة', 'danger')
    }
  }

  const handleToggleLectureActive = async (lec, e) => {
    e.stopPropagation()
    try {
      const nextArchived = lec.is_active !== false
      await updateCourseLecture(lec.id, { is_active: !nextArchived })
      notify(nextArchived ? 'تم أرشفة المحاضرة بنجاح 📦' : 'تم إلغاء أرشفة المحاضرة بنجاح', 'success')
      loadCurriculum()
    } catch (err) {
      notify('فشل تغيير حالة أرشفة المحاضرة', 'danger')
    }
  }

  // ── M:N Video Junction Actions ────────────────────────────────────────
  const handleOpenAttachVideo = (lec) => {
    setModalTarget(lec)
    setSelectedItemId('')
    setSearchFilter('')
    setModalType('attach_video')
  }

  const handleAttachVideo = async (e) => {
    e.preventDefault()
    if (!selectedItemId) return notify('يرجى اختيار فيديو', 'warning')
    setBusy(true)
    try {
      const nextOrder = (modalTarget.videos || []).length * 10 + 10
      await addVideoToLecture({
        lectureId: modalTarget.id,
        videoId: selectedItemId,
        sortOrder: nextOrder
      })
      notify('تم ربط الفيديو بالمحاضرة بنجاح 🎬', 'success')
      setModalType(null)
      setModalTarget(null)
      loadCurriculum()
      loadUnassignedContent()
    } catch (err) {
      notify(err.message || 'فشل ربط الفيديو', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const handleDetachVideo = async () => {
    if (!deleteConfirm || deleteConfirm.type !== 'detach_video') return
    try {
      await removeVideoFromLecture({
        lectureId: deleteConfirm.extra.lectureId,
        videoId: deleteConfirm.id
      })
      notify('تم فك ارتباط الفيديو بالمحاضرة بنجاح', 'success')
      setDeleteConfirm(null)
      loadCurriculum()
      loadUnassignedContent()
    } catch (err) {
      notify(err.message || 'فشل فك ارتباط الفيديو', 'danger')
    }
  }

  // ── M:N Exam Junction Actions ─────────────────────────────────────────
  const handleOpenAttachExam = (lec) => {
    setModalTarget(lec)
    setSelectedItemId('')
    setSearchFilter('')
    setModalType('attach_exam')
  }

  const handleAttachExam = async (e) => {
    e.preventDefault()
    if (!selectedItemId) return notify('يرجى اختيار امتحان', 'warning')
    setBusy(true)
    try {
      const nextOrder = (modalTarget.exams || []).length * 10 + 10
      await addExamToLecture({
        lectureId: modalTarget.id,
        examId: selectedItemId,
        sortOrder: nextOrder
      })
      notify('تم ربط الامتحان بالمحاضرة بنجاح 📝', 'success')
      setModalType(null)
      setModalTarget(null)
      loadCurriculum()
      loadUnassignedContent()
    } catch (err) {
      if (err.message && err.message.includes('containment_cycle_detected')) {
        notify('⚠️ تم رفض الإضافة: هذا الامتحان مرتبط مسبقاً كمتطلب أو يحتوي على تبعية دائرية مع هذه المحاضرة!', 'danger')
      } else {
        notify(err.message || 'فشل ربط الامتحان', 'danger')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleDetachExam = async () => {
    if (!deleteConfirm || deleteConfirm.type !== 'detach_exam') return
    try {
      await removeExamFromLecture({
        lectureId: deleteConfirm.extra.lectureId,
        examId: deleteConfirm.id
      })
      notify('تم فك ارتباط الامتحان بالمحاضرة بنجاح (مع تطهير القواعد المرتبطة)', 'success')
      setDeleteConfirm(null)
      loadCurriculum()
      loadUnassignedContent()
    } catch (err) {
      notify(err.message || 'فشل فك ارتباط الامتحان', 'danger')
    }
  }

  // ── 1:N PDF Files Actions (R2 Direct Upload) ──────────────────────────
  const handleOpenUploadFile = (lec) => {
    setModalTarget(lec)
    setFormTitle('')
    setUploadFileObj(null)
    setUploadProgress(0)
    setModalType('upload_file')
  }

  const handleUploadAndAttachFile = async (e) => {
    e.preventDefault()
    if (!uploadFileObj) return notify('يرجى اختيار ملف PDF', 'warning')
    if (!formTitle.trim()) return notify('يرجى إدخال اسم المذكرة أو الملف', 'warning')

    setIsUploading(true)
    setUploadProgress(1)
    try {
      // 1. Upload directly to Cloudflare R2 bucket
      const res = await uploadLectureFile(uploadFileObj, {
        onProgress: (pct) => setUploadProgress(pct)
      })

      // 2. Attach record to lecture_files
      const nextOrder = (modalTarget.files || []).length * 10 + 10
      await addLectureFile({
        lectureId: modalTarget.id,
        title: formTitle.trim(),
        fileKey: res.key,
        fileSize: uploadFileObj.size,
        sortOrder: nextOrder
      })

      notify('تم رفع الملف وحفظه بالمحاضرة بنجاح 📄', 'success')
      setModalType(null)
      setModalTarget(null)
      setUploadFileObj(null)
      loadCurriculum()
    } catch (err) {
      console.error(err)
      notify(err.message || 'فشل رفع وحفظ الملف', 'danger')
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const handleDeleteFile = async () => {
    if (!deleteConfirm || deleteConfirm.type !== 'delete_file') return
    try {
      await removeLectureFile(deleteConfirm.id)
      notify('تم حذف الملف من المحاضرة', 'success')
      setDeleteConfirm(null)
      loadCurriculum()
    } catch (err) {
      notify(err.message || 'فشل حذف الملف', 'danger')
    }
  }

  // ── Unlock Rule Actions (Prerequisites Engine) ─────────────────────────
  const handleOpenUnlockRuleModal = (lec) => {
    setModalTarget(lec)
    const existingRule = (lec.unlockRules || [])[0]
    if (existingRule) {
      setSelectedItemId(existingRule.required_exam_id)
      setRequiredScore(String(existingRule.required_score || 70))
    } else {
      setSelectedItemId('')
      setRequiredScore('70')
    }
    setModalType('unlock_rule')
  }

  const handleSaveUnlockRule = async (e) => {
    e.preventDefault()
    if (!selectedItemId) return notify('يرجى اختيار الامتحان المشروط', 'warning')
    const scoreNum = parseFloat(requiredScore)
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      return notify('نسبة النجاح يجب أن تكون بين 0 و 100%', 'warning')
    }

    setBusy(true)
    try {
      const existingRule = (modalTarget.unlockRules || [])[0]
      if (existingRule) {
        // If changing exam, delete old and create new to trigger DB graph validation
        if (existingRule.required_exam_id !== selectedItemId) {
          await deleteUnlockRule(existingRule.id)
          await createUnlockRule({
            targetType: 'lecture',
            targetId: modalTarget.id,
            requiredExamId: selectedItemId,
            requiredScore: scoreNum
          })
        } else {
          await updateUnlockRule(existingRule.id, { requiredScore: scoreNum, isActive: true })
        }
      } else {
        await createUnlockRule({
          targetType: 'lecture',
          targetId: modalTarget.id,
          requiredExamId: selectedItemId,
          requiredScore: scoreNum
        })
      }
      notify('تم حفظ شرط الفتح بنجاح 🔒', 'success')
      setModalType(null)
      setModalTarget(null)
      loadCurriculum()
    } catch (err) {
      if (err.message && err.message.includes('cycle_detected')) {
        notify('⚠️ خطأ دوراني: لا يمكن تعيين هذا الامتحان كشرط لأن المحاضرة تحتوي عليه أو تعتمد عليه مسبقاً!', 'danger')
      } else if (err.message && err.message.includes('self_cycle_detected')) {
        notify('⚠️ لا يمكن للعنصر أن يشترط اجتياز نفسه!', 'danger')
      } else {
        notify(err.message || 'فشل حفظ شرط الفتح', 'danger')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteUnlockRule = async (ruleId, e) => {
    e.stopPropagation()
    try {
      await deleteUnlockRule(ruleId)
      notify('تم إلغاء شرط الفتح وإتاحة المحاضرة بدون متطلبات ✅', 'success')
      loadCurriculum()
    } catch (err) {
      notify('فشل حذف شرط الفتح', 'danger')
    }
  }

  // ── Unassigned Reservoir Fast Assignment ──────────────────────────────
  const handleOpenAssignUnassigned = (item, type) => {
    setModalTarget({ ...item, itemType: type })
    setSelectedItemId('') // will hold selected lectureId
    setModalType('assign_unassigned')
  }

  const handlePerformAssignUnassigned = async (e) => {
    e.preventDefault()
    if (!selectedItemId) return notify('يرجى اختيار المحاضرة المستهدفة', 'warning')
    setBusy(true)
    try {
      const isVideo = modalTarget.itemType === 'video'
      if (isVideo) {
        await addVideoToLecture({
          lectureId: selectedItemId,
          videoId: modalTarget.id
        })
        notify(`تم تعيين الفيديو "${modalTarget.title}" بنجاح! 🎬`, 'success')
      } else {
        await addExamToLecture({
          lectureId: selectedItemId,
          examId: modalTarget.id
        })
        notify(`تم تعيين الامتحان "${modalTarget.title}" بنجاح! 📝`, 'success')
      }
      setModalType(null)
      setModalTarget(null)
      loadCurriculum()
      loadUnassignedContent()
    } catch (err) {
      notify(err.message || 'فشل التعيين', 'danger')
    } finally {
      setBusy(false)
    }
  }

  // Format bytes helper
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  if (!pkg) {
    if (loadingPackages) {
      return (
        <section className="cp-curriculum-wrap">
          <div className="cp-empty">
            <i className="fas fa-spinner fa-spin"></i>
            <p>جاري تحميل المنهج والباقات...</p>
          </div>
        </section>
      )
    }
    return (
      <section className="cp-curriculum-wrap">
        <div className="cp-empty">
          <i className="fas fa-box-open" style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: 12 }}></i>
          <h3>لا توجد باقات دراسية مفعلة</h3>
          <p>هذا القسم لمحتوى الباقات المدفوعة فقط. أنشئ باقة أولاً من قسم «الباقات»، أو أضف محاضرات الصفوف العادية من صفحة «المحاضرات».</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 }}>
            <button onClick={() => navigate('/lectures')} className="cp-btn cp-btn-primary">
              <i className="fas fa-chalkboard-teacher"></i> فتح صفحة المحاضرات
            </button>
            {onBack && (
              <button onClick={onBack} className="cp-btn cp-btn-secondary">
                <i className="fas fa-arrow-right"></i> رجوع للوحة التحكم
              </button>
            )}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="cp-curriculum-wrap">
      {/* ── Top Header & Stats ─────────────────────────────────────────── */}
      <div className="cp-curriculum-header">
        <div className="cp-curriculum-header-top">
          <div className="cp-curriculum-title-box">
            <h2>
              {onBack && (
                <button
                  onClick={onBack}
                  className="cp-btn cp-btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.85rem', marginInlineEnd: 10 }}
                  title="الرجوع للوحة التحكم"
                >
                  <i className="fas fa-arrow-right"></i> رجوع
                </button>
              )}
              {packages.length > 1 ? (
                <select
                  value={pkg.id}
                  onChange={(e) => {
                    const found = packages.find(p => p.id === e.target.value)
                    if (found) setSelectedPkg(found)
                  }}
                  className="cp-input"
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: 10,
                    border: '1.5px solid #6366f1',
                    background: 'var(--cp-card-bg, #ffffff)',
                    color: 'var(--text-color, #1e293b)',
                    cursor: 'pointer',
                    marginInlineEnd: 8
                  }}
                  aria-label="اختيار الباقة الدراسية"
                >
                  {packages.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              ) : (
                <span>{pkg.title}</span>
              )}
              <span className="cp-stat-chip stat-purple" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                {GRADE_LABEL[pkg.grade] || pkg.grade || 'عام'}
              </span>
              <span className="cp-stat-chip stat-green" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                {pkg.price} ج.م
              </span>
            </h2>
            <p>إدارة الفصول، والمحاضرات، والامتحانات، والفيديوهات، ومذكرات الـ PDF مع شروط الفتح التلقائي</p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowUnassignedDrawer(prev => !prev)}
              className="cp-btn"
              style={{
                background: showUnassignedDrawer ? '#7c3aed' : 'rgba(124, 58, 237, 0.1)',
                color: showUnassignedDrawer ? '#ffffff' : '#7c3aed',
                border: '1.5px solid #7c3aed',
                padding: '8px 16px',
                borderRadius: 12,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <i className="fas fa-layer-group"></i>
              <span>المستودع غير المعين</span>
              {stats.unassignedTotal > 0 && (
                <span style={{
                  background: showUnassignedDrawer ? '#ffffff' : '#7c3aed',
                  color: showUnassignedDrawer ? '#7c3aed' : '#ffffff',
                  fontSize: '0.75rem',
                  padding: '2px 6px',
                  borderRadius: 999
                }}>
                  {stats.unassignedTotal}
                </span>
              )}
            </button>

            <button
              onClick={handleOpenCreateChapter}
              className="cp-btn cp-btn-primary"
              style={{
                background: '#6366f1',
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: 12,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <i className="fas fa-plus"></i>
              <span>إضافة فصل دراسي جديد</span>
            </button>
          </div>
        </div>

        {/* Counters Chips Bar */}
        <div className="cp-curriculum-stats-bar">
          <div className="cp-stat-chip stat-blue">
            <i className="fas fa-folder"></i>
            <span>{stats.chaptersCount} فصول دراسية</span>
          </div>
          <div className="cp-stat-chip stat-purple">
            <i className="fas fa-chalkboard-teacher"></i>
            <span>{stats.lecturesCount} محاضرات</span>
          </div>
          <div className="cp-stat-chip stat-orange">
            <i className="fas fa-play-circle"></i>
            <span>{stats.videosCount} فيديوهات</span>
          </div>
          <div className="cp-stat-chip stat-green">
            <i className="fas fa-file-alt"></i>
            <span>{stats.examsCount} امتحانات</span>
          </div>
          <div className="cp-stat-chip">
            <i className="fas fa-file-pdf"></i>
            <span>{stats.filesCount} ملفات PDF</span>
          </div>
        </div>
      </div>

      {/* ── Unassigned Reservoir Drawer ────────────────────────────────── */}
      {showUnassignedDrawer && (
        <div className="cp-unassigned-drawer-card">
          <div className="cp-unassigned-header">
            <h3>
              <i className="fas fa-inbox"></i>
              <span>مستودع المحتوى غير المرتبط بمحاضرات</span>
            </h3>
            <button
              onClick={() => setShowUnassignedDrawer(false)}
              className="cp-btn cp-btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.8rem' }}
            >
              <i className="fas fa-times"></i> إغلاق
            </button>
          </div>

          <div className="cp-unassigned-tabs">
            <button
              className={`cp-btn ${unassignedTab === 'videos' ? 'cp-btn-primary' : 'cp-btn-secondary'}`}
              onClick={() => setUnassignedTab('videos')}
              style={{ padding: '6px 14px', fontSize: '0.85rem' }}
            >
              <i className="fas fa-video"></i> فيديوهات غير معينة ({unassignedVideos.length})
            </button>
            <button
              className={`cp-btn ${unassignedTab === 'exams' ? 'cp-btn-primary' : 'cp-btn-secondary'}`}
              onClick={() => setUnassignedTab('exams')}
              style={{ padding: '6px 14px', fontSize: '0.85rem' }}
            >
              <i className="fas fa-file-alt"></i> امتحانات غير معينة ({unassignedExams.length})
            </button>
          </div>

          {loadingUnassigned ? (
            <div style={{ textAlign: 'center', padding: '24px' }}>
              <i className="fas fa-spinner fa-spin"></i> جاري فحص المحتوى غير المعين...
            </div>
          ) : unassignedTab === 'videos' ? (
            unassignedVideos.length === 0 ? (
              <div className="cp-content-empty">🎉 جميع الفيديوهات الحالية مرتبطة بمحاضرات</div>
            ) : (
              <div className="cp-unassigned-grid">
                {unassignedVideos.map(v => (
                  <div key={v.id} className="cp-unassigned-card">
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-color)' }}>{v.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--cp-text-muted)', marginTop: 4 }}>
                        {v.video_parts?.length || 0} أجزاء • {GRADE_LABEL[v.grade] || v.grade || 'عام'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleOpenAssignUnassigned(v, 'video')}
                      className="cp-btn cp-btn-primary"
                      style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#7c3aed' }}
                    >
                      <i className="fas fa-plus"></i> تعيين لمحاضرة
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : unassignedExams.length === 0 ? (
            <div className="cp-content-empty">🎉 جميع الامتحانات الحالية مرتبطة بمحاضرات</div>
          ) : (
            <div className="cp-unassigned-grid">
              {unassignedExams.map(e => (
                <div key={e.id} className="cp-unassigned-card">
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-color)' }}>{e.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--cp-text-muted)', marginTop: 4 }}>
                      {e.questions_count || 0} سؤال • {e.duration_minutes || 0} دقيقة • {GRADE_LABEL[e.grade] || e.grade || 'عام'}
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenAssignUnassigned(e, 'exam')}
                    className="cp-btn cp-btn-primary"
                    style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#7c3aed' }}
                  >
                    <i className="fas fa-plus"></i> تعيين لمحاضرة
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Main Chapters Accordion List ────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#6366f1' }}></i>
          <p style={{ marginTop: 12, fontWeight: 700 }}>جاري تحميل شجرة الفصول والمحاضرات...</p>
        </div>
      ) : chapters.length === 0 ? (
        <div style={{
          background: 'var(--cp-card-bg, #ffffff)',
          border: '2px dashed var(--border-light, #cbd5e1)',
          borderRadius: 20,
          padding: '48px 20px',
          textAlign: 'center'
        }}>
          <i className="fas fa-folder-open" style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: 12 }}></i>
          <h3 style={{ margin: '0 0 6px', fontWeight: 800 }}>لا توجد فصول دراسية بعد في هذه الباقة</h3>
          <p style={{ color: 'var(--cp-text-muted)', marginBottom: 20 }}>ابدأ بتنظيم منهج الباقة عبر إنشاء أول فصل دراسي وتسكين المحاضرات بداخله.</p>
          <button
            onClick={handleOpenCreateChapter}
            className="cp-btn cp-btn-primary"
            style={{ background: '#6366f1', padding: '10px 20px', borderRadius: 12, fontWeight: 700 }}
          >
            <i className="fas fa-plus"></i> إنشاء أول فصل دراسي
          </button>
        </div>
      ) : (
        chapters.map((chap, chapIdx) => {
          const isExpanded = expandedChapters[chap.id] !== false
          return (
            <div key={chap.id} className="cp-chapter-card">
              {/* Chapter Header */}
              <div
                className="cp-chapter-header"
                onClick={() => setExpandedChapters(prev => ({ ...prev, [chap.id]: !isExpanded }))}
              >
                <div className="cp-chapter-title-wrap">
                  <span className="cp-chapter-badge">فصل {chapIdx + 1}</span>
                  <div>
                    <h3>{chap.title}</h3>
                    {chap.description && <div className="cp-chapter-desc">{chap.description}</div>}
                  </div>
                </div>

                <div className="cp-chapter-actions" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={(e) => handleOpenCreateLecture(chap, e)}
                    className="cp-btn cp-btn-primary"
                    style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#0284c7' }}
                    title="إضافة محاضرة لهذا الفصل"
                  >
                    <i className="fas fa-plus"></i> محاضرة جديدة
                  </button>

                  <button
                    onClick={(e) => handleMoveChapter(chap, 'up', e)}
                    disabled={chapIdx === 0}
                    className="cp-btn cp-btn-secondary"
                    style={{ padding: '6px 8px', fontSize: '0.8rem' }}
                    title="تحريك لأعلى"
                  >
                    <i className="fas fa-chevron-up"></i>
                  </button>
                  <button
                    onClick={(e) => handleMoveChapter(chap, 'down', e)}
                    disabled={chapIdx === chapters.length - 1}
                    className="cp-btn cp-btn-secondary"
                    style={{ padding: '6px 8px', fontSize: '0.8rem' }}
                    title="تحريك لأسفل"
                  >
                    <i className="fas fa-chevron-down"></i>
                  </button>

                  <button
                    onClick={(e) => handleOpenEditChapter(chap, e)}
                    className="cp-btn cp-btn-secondary"
                    style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                    title="تعديل الفصل"
                  >
                    <i className="fas fa-pencil-alt"></i>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteConfirm({
                        type: 'chapter',
                        id: chap.id,
                        title: chap.title
                      })
                    }}
                    className="cp-btn"
                    style={{ padding: '6px 10px', fontSize: '0.8rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.08)' }}
                    title="حذف الفصل"
                  >
                    <i className="fas fa-trash-alt"></i>
                  </button>

                  <div style={{ marginInlineStart: 8, color: '#94a3b8' }}>
                    <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i>
                  </div>
                </div>
              </div>

              {/* Chapter Body (Lectures) */}
              {isExpanded && (
                <div className="cp-chapter-body">
                  {(chap.lectures || []).length === 0 ? (
                    <div className="cp-content-empty">
                      لا توجد محاضرات في هذا الفصل بعد. اضغط "محاضرة جديدة" لإضافة أول محاضرة.
                    </div>
                  ) : (
                    (chap.lectures || []).map((lec, lecIdx) => {
                      const activeRule = (lec.unlockRules || [])[0]
                      return (
                        <div key={lec.id} className="cp-lecture-card">
                          {/* Lecture Header Bar */}
                          <div className="cp-lecture-header">
                            <div className="cp-lecture-title-box">
                              <span className="cp-lecture-num">محاضرة {lecIdx + 1}</span>
                              <div>
                                <h4>{lec.title}</h4>
                                {lec.description && (
                                  <div style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', marginTop: 2 }}>
                                    {lec.description}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="cp-lecture-actions">
                              <button
                                onClick={() => handleOpenAttachVideo(lec)}
                                className="cp-btn"
                                style={{ padding: '5px 10px', fontSize: '0.78rem', background: 'rgba(245, 158, 11, 0.1)', color: '#d97706' }}
                              >
                                <i className="fas fa-video"></i> إضافة فيديو
                              </button>
                              <button
                                onClick={() => handleOpenAttachExam(lec)}
                                className="cp-btn"
                                style={{ padding: '5px 10px', fontSize: '0.78rem', background: 'rgba(16, 185, 129, 0.1)', color: '#059669' }}
                              >
                                <i className="fas fa-file-alt"></i> إضافة امتحان
                              </button>
                              <button
                                onClick={() => handleOpenUploadFile(lec)}
                                className="cp-btn"
                                style={{ padding: '5px 10px', fontSize: '0.78rem', background: 'rgba(99, 102, 241, 0.1)', color: '#4f46e5' }}
                              >
                                <i className="fas fa-file-pdf"></i> رفع PDF
                              </button>
                              <button
                                onClick={() => handleOpenUnlockRuleModal(lec)}
                                className="cp-btn"
                                style={{
                                  padding: '5px 10px',
                                  fontSize: '0.78rem',
                                  background: activeRule ? 'rgba(245, 158, 11, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                                  color: activeRule ? '#b45309' : '#64748b',
                                  fontWeight: activeRule ? 800 : 600
                                }}
                              >
                                <i className={`fas ${activeRule ? 'fa-lock' : 'fa-lock-open'}`}></i>
                                <span>{activeRule ? 'شرط الفتح مفعّل' : 'تحديد شرط الفتح'}</span>
                              </button>

                              <button
                                onClick={(e) => handleToggleLectureActive(lec, e)}
                                className="cp-btn"
                                style={{
                                  padding: '5px 10px',
                                  fontSize: '0.78rem',
                                  background: lec.is_active !== false ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                  color: lec.is_active !== false ? '#059669' : '#d97706',
                                  border: lec.is_active !== false ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(245, 158, 11, 0.25)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5
                                }}
                                title={lec.is_active === false ? 'إلغاء الأرشفة وإعادة التفعيل' : 'أرشفة المحاضرة'}
                              >
                                <i className={`fas ${lec.is_active === false ? 'fa-box-open' : 'fa-box-archive'}`}></i>
                                <span>{lec.is_active === false ? 'مؤرشفة (إلغاء الأرشيف)' : 'أرشفة'}</span>
                              </button>

                              <button
                                onClick={(e) => handleMoveLecture(lec, chap, 'up', e)}
                                disabled={lecIdx === 0}
                                className="cp-btn cp-btn-secondary"
                                style={{ padding: '5px 8px', fontSize: '0.78rem' }}
                                title="تحريك المحاضرة لأعلى"
                              >
                                <i className="fas fa-chevron-up"></i>
                              </button>
                              <button
                                onClick={(e) => handleMoveLecture(lec, chap, 'down', e)}
                                disabled={lecIdx === (chap.lectures || []).length - 1}
                                className="cp-btn cp-btn-secondary"
                                style={{ padding: '5px 8px', fontSize: '0.78rem' }}
                                title="تحريك المحاضرة لأسفل"
                              >
                                <i className="fas fa-chevron-down"></i>
                              </button>

                              <button
                                onClick={(e) => handleOpenEditLecture(lec, chap, e)}
                                className="cp-btn cp-btn-secondary"
                                style={{ padding: '5px 8px', fontSize: '0.78rem' }}
                                title="تعديل المحاضرة"
                              >
                                <i className="fas fa-pencil-alt"></i>
                              </button>

                              <button
                                onClick={() => setDeleteConfirm({
                                  type: 'lecture',
                                  id: lec.id,
                                  title: lec.title
                                })}
                                className="cp-btn"
                                style={{ padding: '5px 8px', fontSize: '0.78rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.08)' }}
                                title="حذف المحاضرة"
                              >
                                <i className="fas fa-trash-alt"></i>
                              </button>
                            </div>
                          </div>

                          {/* Active Unlock Rule Callout */}
                          {activeRule && (
                            <div className="cp-unlock-rule-card">
                              <div className="cp-unlock-rule-info">
                                <i className="fas fa-lock" style={{ fontSize: '1.1rem' }}></i>
                                <span>
                                  مشروطة باجتياز الامتحان: <strong>{activeRule.required_exam?.title || activeRule.required_exam_id}</strong> بدرجة <strong>{activeRule.required_score}%</strong> فأكثر
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  onClick={() => handleOpenUnlockRuleModal(lec)}
                                  className="cp-btn cp-btn-secondary"
                                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                >
                                  تعديل
                                </button>
                                <button
                                  onClick={(e) => handleDeleteUnlockRule(activeRule.id, e)}
                                  className="cp-btn"
                                  style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.08)' }}
                                >
                                  إلغاء الشرط
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Attached Content Grid (Videos, Exams, Files) */}
                          <div className="cp-content-sections-grid">
                            {/* Videos Box */}
                            <div className="cp-content-box">
                              <div className="cp-content-box-header">
                                <h5><i className="fas fa-video" style={{ color: '#d97706' }}></i> الفيديوهات ({(lec.videos || []).length})</h5>
                                <button onClick={() => handleOpenAttachVideo(lec)} className="cp-btn cp-btn-secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }}>
                                  + ربط
                                </button>
                              </div>
                              {(lec.videos || []).length === 0 ? (
                                <div className="cp-content-empty">لا توجد فيديوهات مسكنة</div>
                              ) : (
                                <div className="cp-content-items-list">
                                  {lec.videos.map(v => (
                                    <div key={v.id} className="cp-content-item-row">
                                      <div className="cp-content-item-info">
                                        <i className="fas fa-play-circle" style={{ color: '#d97706' }}></i>
                                        <div style={{ minWidth: 0 }}>
                                          <div className="cp-content-item-title">{v.title}</div>
                                          <div className="cp-content-item-sub">
                                            {v.video_parts?.length || 0} أجزاء • {v.active_hours ? `${v.active_hours} س إتاحة` : 'مفتوح'}
                                          </div>
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => setDeleteConfirm({
                                          type: 'detach_video',
                                          id: v.id,
                                          title: v.title,
                                          extra: { lectureId: lec.id }
                                        })}
                                        className="cp-btn"
                                        style={{ padding: '2px 6px', fontSize: '0.72rem', color: '#ef4444' }}
                                        title="فك الارتباط"
                                      >
                                        <i className="fas fa-unlink"></i>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Exams Box */}
                            <div className="cp-content-box">
                              <div className="cp-content-box-header">
                                <h5><i className="fas fa-file-alt" style={{ color: '#059669' }}></i> الامتحانات ({(lec.exams || []).length})</h5>
                                <button onClick={() => handleOpenAttachExam(lec)} className="cp-btn cp-btn-secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }}>
                                  + ربط
                                </button>
                              </div>
                              {(lec.exams || []).length === 0 ? (
                                <div className="cp-content-empty">لا توجد امتحانات مسكنة</div>
                              ) : (
                                <div className="cp-content-items-list">
                                  {lec.exams.map(ex => (
                                    <div key={ex.id} className="cp-content-item-row">
                                      <div className="cp-content-item-info">
                                        <i className="fas fa-clipboard-check" style={{ color: '#059669' }}></i>
                                        <div style={{ minWidth: 0 }}>
                                          <div className="cp-content-item-title">{ex.title}</div>
                                          <div className="cp-content-item-sub">
                                            {ex.questions_count || 0} سؤال • {ex.duration_minutes || 0} د • {ex.total_points || 0} درجات
                                          </div>
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => setDeleteConfirm({
                                          type: 'detach_exam',
                                          id: ex.id,
                                          title: ex.title,
                                          extra: { lectureId: lec.id }
                                        })}
                                        className="cp-btn"
                                        style={{ padding: '2px 6px', fontSize: '0.72rem', color: '#ef4444' }}
                                        title="فك الارتباط"
                                      >
                                        <i className="fas fa-unlink"></i>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* PDF Files Box */}
                            <div className="cp-content-box">
                              <div className="cp-content-box-header">
                                <h5><i className="fas fa-file-pdf" style={{ color: '#4f46e5' }}></i> ملفات ومذكرات PDF ({(lec.files || []).length})</h5>
                                <button onClick={() => handleOpenUploadFile(lec)} className="cp-btn cp-btn-secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }}>
                                  + رفع
                                </button>
                              </div>
                              {(lec.files || []).length === 0 ? (
                                <div className="cp-content-empty">لا توجد ملفات مرفوعة</div>
                              ) : (
                                <div className="cp-content-items-list">
                                  {lec.files.map(f => (
                                    <div key={f.id} className="cp-content-item-row">
                                      <div className="cp-content-item-info">
                                        <i className="fas fa-file-pdf" style={{ color: '#ef4444' }}></i>
                                        <div style={{ minWidth: 0 }}>
                                          <div className="cp-content-item-title">{f.title}</div>
                                          <div className="cp-content-item-sub">{formatBytes(f.file_size)}</div>
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => setDeleteConfirm({
                                          type: 'delete_file',
                                          id: f.id,
                                          title: f.title
                                        })}
                                        className="cp-btn"
                                        style={{ padding: '2px 6px', fontSize: '0.72rem', color: '#ef4444' }}
                                        title="حذف الملف"
                                      >
                                        <i className="fas fa-trash"></i>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })
      )}

      {/* ── Modal: Create/Edit Chapter ──────────────────────────────────── */}
      {(modalType === 'create_chapter' || modalType === 'edit_chapter') && (
        <div className="cp-modal-overlay">
          <div className="cp-modal-window">
            <div className="cp-modal-head">
              <h3>{modalType === 'edit_chapter' ? 'تعديل بيانات الفصل' : 'إضافة فصل دراسي جديد'}</h3>
              <button onClick={() => setModalType(null)} className="cp-btn cp-btn-secondary" style={{ padding: '4px 8px' }}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleSaveChapter}>
              <div className="cp-form-group">
                <label>عنوان الفصل *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="مثال: الفصل الأول: الحركة الدائرية"
                  className="cp-form-input"
                />
              </div>
              <div className="cp-form-group">
                <label>الوصف أو ملاحظات (اختياري)</label>
                <textarea
                  rows={3}
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  placeholder="شرح موجز لمحتويات الفصل..."
                  className="cp-form-input"
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" onClick={() => setModalType(null)} className="cp-btn cp-btn-secondary">
                  إلغاء
                </button>
                <button type="submit" disabled={busy} className="cp-btn cp-btn-primary" style={{ background: '#6366f1' }}>
                  {busy ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} حفظ الفصل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Create/Edit Lecture ──────────────────────────────────── */}
      {(modalType === 'create_lecture' || modalType === 'edit_lecture') && (
        <div className="cp-modal-overlay">
          <div className="cp-modal-window">
            <div className="cp-modal-head">
              <h3>{modalType === 'edit_lecture' ? 'تعديل المحاضرة' : `إضافة محاضرة في "${modalTarget?.title}"`}</h3>
              <button onClick={() => setModalType(null)} className="cp-btn cp-btn-secondary" style={{ padding: '4px 8px' }}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleSaveLecture}>
              <div className="cp-form-group">
                <label>عنوان المحاضرة *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="مثال: المحاضرة الأولى: قوانين الحركة والسرعة المماسية"
                  className="cp-form-input"
                />
              </div>
              <div className="cp-form-group">
                <label>الوصف (اختياري)</label>
                <textarea
                  rows={3}
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  placeholder="وصف تفصيلي أو تنبيهات للطالب حول المحاضرة..."
                  className="cp-form-input"
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" onClick={() => setModalType(null)} className="cp-btn cp-btn-secondary">
                  إلغاء
                </button>
                <button type="submit" disabled={busy} className="cp-btn cp-btn-primary" style={{ background: '#0284c7' }}>
                  {busy ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} حفظ المحاضرة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Attach Video Picker ─────────────────────────────────── */}
      {modalType === 'attach_video' && (
        <div className="cp-modal-overlay">
          <div className="cp-modal-window">
            <div className="cp-modal-head">
              <h3>ربط فيديو بالمحاضرة: {modalTarget?.title}</h3>
              <button onClick={() => setModalType(null)} className="cp-btn cp-btn-secondary" style={{ padding: '4px 8px' }}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleAttachVideo}>
              <div className="cp-form-group">
                <label>بحث في قائمة الفيديوهات</label>
                <input
                  type="text"
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                  placeholder="اكتب للبحث بالعنوان..."
                  className="cp-form-input"
                />
              </div>

              <div className="cp-form-group">
                <label>اختر الفيديو المراد ربطه *</label>
                <select
                  required
                  value={selectedItemId}
                  onChange={e => setSelectedItemId(e.target.value)}
                  className="cp-form-input"
                  size={6}
                >
                  <optgroup label="✨ فيديوهات غير معينة حالياً (مستودع)">
                    {(() => {
                      const attachedIds = new Set((modalTarget?.videos || []).map(v => v.id))
                      return unassignedVideos
                        .filter(v => !attachedIds.has(v.id) && (!searchFilter || v.title.toLowerCase().includes(searchFilter.toLowerCase())))
                        .map(v => (
                          <option key={v.id} value={v.id}>
                            {v.title} ({v.video_parts?.length || 0} أجزاء)
                          </option>
                        ))
                    })()}
                  </optgroup>
                  <optgroup label="📚 سائر الفيديوهات المسجلة">
                    {(() => {
                      const attachedIds = new Set((modalTarget?.videos || []).map(v => v.id))
                      const unassignedIds = new Set(unassignedVideos.map(v => v.id))
                      return allVideos
                        .filter(v => !attachedIds.has(v.id) && !unassignedIds.has(v.id) && (!searchFilter || v.title.toLowerCase().includes(searchFilter.toLowerCase())))
                        .map(v => (
                          <option key={v.id} value={v.id}>
                            {v.title} [{GRADE_LABEL[v.grade] || v.grade || 'عام'}]
                          </option>
                        ))
                    })()}
                  </optgroup>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" onClick={() => setModalType(null)} className="cp-btn cp-btn-secondary">
                  إلغاء
                </button>
                <button type="submit" disabled={busy || !selectedItemId} className="cp-btn cp-btn-primary" style={{ background: '#d97706' }}>
                  {busy ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-link"></i>} ربط الفيديو
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Attach Exam Picker ──────────────────────────────────── */}
      {modalType === 'attach_exam' && (
        <div className="cp-modal-overlay">
          <div className="cp-modal-window">
            <div className="cp-modal-head">
              <h3>ربط امتحان بالمحاضرة: {modalTarget?.title}</h3>
              <button onClick={() => setModalType(null)} className="cp-btn cp-btn-secondary" style={{ padding: '4px 8px' }}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleAttachExam}>
              <div className="cp-form-group">
                <label>بحث في قائمة الامتحانات</label>
                <input
                  type="text"
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                  placeholder="اكتب للبحث بالعنوان..."
                  className="cp-form-input"
                />
              </div>

              <div className="cp-form-group">
                <label>اختر الامتحان المراد ربطه *</label>
                <select
                  required
                  value={selectedItemId}
                  onChange={e => setSelectedItemId(e.target.value)}
                  className="cp-form-input"
                  size={6}
                >
                  <optgroup label="✨ امتحانات غير معينة حالياً (مستودع)">
                    {(() => {
                      const attachedIds = new Set((modalTarget?.exams || []).map(e => e.id))
                      return unassignedExams
                        .filter(e => !attachedIds.has(e.id) && (!searchFilter || e.title.toLowerCase().includes(searchFilter.toLowerCase())))
                        .map(e => (
                          <option key={e.id} value={e.id}>
                            {e.title} ({e.questions_count || 0} سؤال)
                          </option>
                        ))
                    })()}
                  </optgroup>
                  <optgroup label="📝 سائر الامتحانات المسجلة">
                    {(() => {
                      const attachedIds = new Set((modalTarget?.exams || []).map(e => e.id))
                      const unassignedIds = new Set(unassignedExams.map(e => e.id))
                      return allExams
                        .filter(e => !attachedIds.has(e.id) && !unassignedIds.has(e.id) && (!searchFilter || e.title.toLowerCase().includes(searchFilter.toLowerCase())))
                        .map(e => (
                          <option key={e.id} value={e.id}>
                            {e.title} [{GRADE_LABEL[e.grade] || e.grade || 'عام'}]
                          </option>
                        ))
                    })()}
                  </optgroup>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" onClick={() => setModalType(null)} className="cp-btn cp-btn-secondary">
                  إلغاء
                </button>
                <button type="submit" disabled={busy || !selectedItemId} className="cp-btn cp-btn-primary" style={{ background: '#059669' }}>
                  {busy ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-link"></i>} ربط الامتحان
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Upload PDF File ─────────────────────────────────────── */}
      {modalType === 'upload_file' && (
        <div className="cp-modal-overlay">
          <div className="cp-modal-window">
            <div className="cp-modal-head">
              <h3>رفع مذكرة / ملف PDF للمحاضرة</h3>
              <button onClick={() => setModalType(null)} className="cp-btn cp-btn-secondary" style={{ padding: '4px 8px' }}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleUploadAndAttachFile}>
              <div className="cp-form-group">
                <label>اسم المذكرة أو الملف الظاهر للطالب *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="مثال: مذكرة شرح الفصل الأول كاملاً PDF"
                  className="cp-form-input"
                />
              </div>

              <div className="cp-form-group">
                <label>اختر ملف PDF من جهازك *</label>
                <input
                  type="file"
                  accept="application/pdf"
                  required
                  onChange={e => {
                    const f = e.target.files[0]
                    setUploadFileObj(f || null)
                    if (f && !formTitle) setFormTitle(f.name.replace(/\.pdf$/i, ''))
                  }}
                  className="cp-form-input"
                />
                {uploadFileObj && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', marginTop: 4 }}>
                    الحجم: {formatBytes(uploadFileObj.size)}
                  </div>
                )}
              </div>

              {isUploading && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700 }}>
                    <span>جاري الرفع السحابي إلى R2...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="cp-progress-bar-wrap">
                    <div className="cp-progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" disabled={isUploading} onClick={() => setModalType(null)} className="cp-btn cp-btn-secondary">
                  إلغاء
                </button>
                <button type="submit" disabled={isUploading || !uploadFileObj} className="cp-btn cp-btn-primary" style={{ background: '#4f46e5' }}>
                  {isUploading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-cloud-upload-alt"></i>} رفع وتسكين الملف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Configure Unlock Rule (Prerequisites) ────────────────── */}
      {modalType === 'unlock_rule' && (
        <div className="cp-modal-overlay">
          <div className="cp-modal-window">
            <div className="cp-modal-head">
              <h3>
                <i className="fas fa-lock" style={{ color: '#d97706', marginInlineEnd: 8 }}></i>
                <span>تحديد شرط الفتح التلقائي للمحاضرة</span>
              </h3>
              <button onClick={() => setModalType(null)} className="cp-btn cp-btn-secondary" style={{ padding: '4px 8px' }}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleSaveUnlockRule}>
              <p style={{ fontSize: '0.85rem', color: 'var(--cp-text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
                لن يتمكن الطالب من فتح هذه المحاضرة أو محتوياتها إلا بعد اجتياز الامتحان المحدد بنسبة النجاح المطلوبة.
              </p>

              <div className="cp-form-group">
                <label>الامتحان المشروط اجتيازه أولاً *</label>
                <select
                  required
                  value={selectedItemId}
                  onChange={e => setSelectedItemId(e.target.value)}
                  className="cp-form-input"
                >
                  <option value="">-- اختر الامتحان المطلوب --</option>
                  {allExams.map(ex => (
                    <option key={ex.id} value={ex.id}>
                      {ex.title} [{GRADE_LABEL[ex.grade] || ex.grade || 'عام'}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="cp-form-group">
                <label>النسبة المئوية المطلوبة للاجتياز (%) *</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    required
                    value={requiredScore}
                    onChange={e => setRequiredScore(e.target.value)}
                    className="cp-form-input"
                    style={{ width: 120 }}
                  />
                  <span style={{ fontWeight: 800, color: '#d97706' }}>% (الافتراضي 70%)</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" onClick={() => setModalType(null)} className="cp-btn cp-btn-secondary">
                  إلغاء
                </button>
                <button type="submit" disabled={busy || !selectedItemId} className="cp-btn cp-btn-primary" style={{ background: '#d97706' }}>
                  {busy ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} تثبيت شرط الفتح
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Assign Unassigned Content to Lecture ─────────────────── */}
      {modalType === 'assign_unassigned' && (
        <div className="cp-modal-overlay">
          <div className="cp-modal-window">
            <div className="cp-modal-head">
              <h3>تعيين "{modalTarget?.title}" إلى محاضرة</h3>
              <button onClick={() => setModalType(null)} className="cp-btn cp-btn-secondary" style={{ padding: '4px 8px' }}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handlePerformAssignUnassigned}>
              <div className="cp-form-group">
                <label>اختر المحاضرة المستهدفة *</label>
                <select
                  required
                  value={selectedItemId}
                  onChange={e => setSelectedItemId(e.target.value)}
                  className="cp-form-input"
                >
                  <option value="">-- اختر المحاضرة --</option>
                  {allLecturesList.map(lec => (
                    <option key={lec.id} value={lec.id}>
                      {lec.chapterTitle} ⟵ {lec.title}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" onClick={() => setModalType(null)} className="cp-btn cp-btn-secondary">
                  إلغاء
                </button>
                <button type="submit" disabled={busy || !selectedItemId} className="cp-btn cp-btn-primary" style={{ background: '#7c3aed' }}>
                  {busy ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check"></i>} تأكيد التعيين
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Dialog ───────────────────────────────────────── */}
      {deleteConfirm && (
        <ConfirmDeleteDialog
          title={
            deleteConfirm.type === 'chapter' ? 'حذف الفصل الدراسي'
            : deleteConfirm.type === 'lecture' ? 'حذف المحاضرة'
            : deleteConfirm.type === 'detach_video' ? 'فك ارتباط الفيديو'
            : deleteConfirm.type === 'detach_exam' ? 'فك ارتباط الامتحان'
            : 'حذف الملف'
          }
          itemLabel={deleteConfirm.title}
          message={
            deleteConfirm.type === 'chapter'
              ? `هل أنت متأكد من حذف الفصل "${deleteConfirm.title}"؟ سيتم حذف جميع المحاضرات التابعة له وفك ارتباط المحتويات.`
              : deleteConfirm.type === 'lecture'
              ? `هل أنت متأكد من حذف المحاضرة "${deleteConfirm.title}"؟ سيعود المحتوى المسكن بها إلى المستودع غير المعين.`
              : deleteConfirm.type === 'detach_video'
              ? `سيتم فك ارتباط هذا الفيديو عن المحاضرة فقط ولن يُحذف من المنصة.`
              : deleteConfirm.type === 'detach_exam'
              ? `سيتم فك ارتباط هذا الامتحان عن المحاضرة وإلغاء أي شروط فتح مرتبطة به فورياً.`
              : `هل أنت متأكد من حذف هذا الملف من المحاضرة؟`
          }
          confirmText={deleteConfirm.type.startsWith('detach') ? 'نعم، فك الارتباط' : 'نعم، احذف'}
          onConfirm={
            deleteConfirm.type === 'chapter' ? handleDeleteChapter
            : deleteConfirm.type === 'lecture' ? handleDeleteLecture
            : deleteConfirm.type === 'detach_video' ? handleDetachVideo
            : deleteConfirm.type === 'detach_exam' ? handleDetachExam
            : handleDeleteFile
          }
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </section>
  )
}
