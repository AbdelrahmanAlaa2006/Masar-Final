import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@backend/supabase'
import { useAuth } from '../contexts/AuthContext'
import './PrerequisiteLockModal.css'

const TYPE_CONFIG = {
  lecture: {
    label: 'محاضرة دراسية',
    icon: 'fa-chalkboard-teacher',
    badgeClass: 'type-lecture'
  },
  video: {
    label: 'شرح فيديو',
    icon: 'fa-play-circle',
    badgeClass: 'type-video'
  },
  exam: {
    label: 'امتحان / واجب',
    icon: 'fa-file-alt',
    badgeClass: 'type-exam'
  },
  file: {
    label: 'ملف PDF / ملزمة',
    icon: 'fa-file-pdf',
    badgeClass: 'type-file'
  }
}

export default function PrerequisiteLockModal({
  isOpen = true,
  onClose,
  lockInfo,
  onStartExam,
  targetType: propTargetType,
  target: propTarget,
  contextLecture: propContextLecture,
  contextLectureId: propContextLectureId,
  lockStatus: propLockStatus
}) {
  const { user } = useAuth()

  // Consolidate props or lockInfo object
  const type = lockInfo?.type || propTargetType || 'lecture'
  const target = lockInfo?.target || propTarget || {}
  const contextLecture = lockInfo?.contextLecture || propContextLecture || null
  const contextLectureId =
    lockInfo?.contextLectureId ||
    propContextLectureId ||
    contextLecture?.id ||
    lockInfo?.lockStatus?.parent_lecture_id ||
    propLockStatus?.parent_lecture_id ||
    null

  const lockStatus = lockInfo?.lockStatus || propLockStatus || {}

  // Resolve Required Exam Attributes
  const requiredExamId = lockStatus.required_exam_id
  const requiredScore = parseFloat(lockStatus.required_score || 70)

  const [examDetails, setExamDetails] = useState(null)
  const [bestAttempt, setBestAttempt] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  // Fetch full exam metadata and student attempt details if needed
  useEffect(() => {
    if (!isOpen || !requiredExamId) return
    let isCancelled = false

    const fetchPrereqDetails = async () => {
      setLoadingDetails(true)
      try {
        // 1. Fetch Exam Meta (questions count, duration, points)
        const { data: examData, error: examErr } = await supabase
          .from('exams')
          .select('id, title, duration_minutes, total_points, questions_count, max_attempts')
          .eq('id', requiredExamId)
          .maybeSingle()

        if (!isCancelled && !examErr && examData) {
          setExamDetails(examData)
        }

        // 2. Fetch Student Attempts for this specific required exam
        if (user?.id) {
          const { data: attempts, error: attErr } = await supabase
            .from('exam_attempts')
            .select('id, score, max_score, submitted_at')
            .eq('student_id', user.id)
            .eq('exam_id', requiredExamId)
            .not('submitted_at', 'is', null)
            .is('video_assessment_id', null)
            .order('submitted_at', { ascending: false })

          if (!isCancelled && !attErr && attempts && attempts.length > 0) {
            // Find highest scored attempt
            const highest = attempts.reduce((prev, curr) => {
              const prevPct = ((prev.score || 0) / (prev.max_score || 1)) * 100
              const currPct = ((curr.score || 0) / (curr.max_score || 1)) * 100
              return currPct >= prevPct ? curr : prev
            }, attempts[0])

            setBestAttempt(highest)
          } else if (!isCancelled) {
            setBestAttempt(null)
          }
        }
      } catch (err) {
        console.warn('PrerequisiteLockModal: Failed to fetch exam details:', err)
      } finally {
        if (!isCancelled) setLoadingDetails(false)
      }
    }

    fetchPrereqDetails()
    return () => {
      isCancelled = true
    }
  }, [isOpen, requiredExamId, user?.id])

  // Compute student score
  const studentScore = useMemo(() => {
    if (lockStatus.student_score !== undefined && lockStatus.student_score !== null) {
      return parseFloat(lockStatus.student_score)
    }
    if (bestAttempt) {
      const pct = ((bestAttempt.score || 0) / (bestAttempt.max_score || 1)) * 100
      return Math.round(pct * 10) / 10
    }
    return null
  }, [lockStatus.student_score, bestAttempt])

  const hasAttempted = studentScore !== null
  const scoreGap = hasAttempted && studentScore < requiredScore ? Math.round((requiredScore - studentScore) * 10) / 10 : 0

  const resolvedExamTitle =
    lockStatus.required_exam_title || examDetails?.title || 'الامتحان المشروط'

  const typeConfig = TYPE_CONFIG[type] || TYPE_CONFIG.lecture
  const targetTitle = target?.title || 'المحتوى المحدد'

  // Reason description
  const reasonText = useMemo(() => {
    if (lockStatus.reason === 'lecture_locked') {
      return `هذا المحتوى مقفل لأن المحاضرة التابع لها تشترط اجتياز "${resolvedExamTitle}" بنسبة ${requiredScore}% أولاً.`
    }
    if (type === 'lecture') {
      return `هذه المحاضرة مقفلة بمتطلب تعليمي سابق، ويلزم اجتياز "${resolvedExamTitle}" بنسبة ${requiredScore}% فأكثر لإتاحتها.`
    }
    if (type === 'video') {
      return `شرح الفيديو هذا مقفل، ويتطلب اجتياز "${resolvedExamTitle}" بنسبة ${requiredScore}% فأكثر لإتاحته.`
    }
    if (type === 'exam') {
      return `هذا الامتحان مقفل حتى يتم اجتياز "${resolvedExamTitle}" بنسبة ${requiredScore}% فأكثر.`
    }
    if (type === 'file') {
      return `هذا الملف مقفل مع المحاضرة حتى يتم اجتياز "${resolvedExamTitle}".`
    }
    return `هذا المحتوى مقفل بمتطلب سابق: اجتياز "${resolvedExamTitle}" بنسبة ${requiredScore}%.`
  }, [lockStatus.reason, type, resolvedExamTitle, requiredScore])

  // Handle launching the required exam
  const handleLaunchRequiredExam = () => {
    if (!requiredExamId) return

    const resolvedTargetId =
      target?.id ||
      (type === 'lecture' ? (contextLectureId || contextLecture?.id) : null) ||
      lockInfo?.targetId ||
      lockInfo?.id ||
      null

    const resolvedTargetTitle =
      target?.title ||
      (type === 'lecture' && contextLecture ? contextLecture.title : null) ||
      targetTitle ||
      'المحتوى المحدد'

    const resolvedLecTitle =
      contextLecture?.title ||
      lockInfo?.contextLectureTitle ||
      null

    const prereqContext = {
      unlockTargetType: type,
      unlockTargetId: resolvedTargetId,
      unlockTargetTitle: resolvedTargetTitle,
      requiredScore: requiredScore,
      contextLectureId: contextLectureId || null,
      contextLectureTitle: resolvedLecTitle,
      requiredExamId: requiredExamId,
      requiredExamTitle: resolvedExamTitle
    }

    const baseExam = examDetails || { id: requiredExamId, title: resolvedExamTitle }
    const examWithContext = {
      ...baseExam,
      _prereqContext: prereqContext
    }

    const examPayload = {
      examId: requiredExamId,
      exam: examWithContext,
      requiredExamId,
      requiredExamTitle: resolvedExamTitle,
      contextLectureId: contextLectureId || null,
      contextLecture: contextLecture || null,
      contextLectureTitle: resolvedLecTitle,
      unlockTargetType: type,
      unlockTargetId: resolvedTargetId,
      unlockTargetTitle: resolvedTargetTitle,
      requiredScore: requiredScore,
      _prereqContext: prereqContext
    }

    if (onStartExam) {
      onStartExam(examPayload)
    }

    onClose?.()
  }

  if (!isOpen) return null

  // The lock check itself failed (network/server error): we don't know the
  // prerequisite, so ask for a reload instead of naming a made-up exam.
  if (lockStatus.reason === 'check_failed') {
    return createPortal(
      <div className="plm-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="plm-modal-title">
        <div className="plm-dialog" onClick={(e) => e.stopPropagation()}>
          <header className="plm-header">
            <div className="plm-shield-box">
              <i className="fas fa-triangle-exclamation"></i>
            </div>
            <div className="plm-header-text">
              <h3 id="plm-modal-title"><span>تعذر التحقق من إتاحة المحتوى</span></h3>
              <p>تأكد من اتصالك بالإنترنت ثم أعد تحميل الصفحة وحاول مرة أخرى.</p>
            </div>
            <button type="button" className="plm-close-btn" onClick={onClose} title="إغلاق النافذة" aria-label="إغلاق النافذة">
              <i className="fas fa-xmark"></i>
            </button>
          </header>
        </div>
      </div>,
      document.body
    )
  }

  const modalContent = (
    <div
      className="plm-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="plm-modal-title"
    >
      <div
        className="plm-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ─────────────────────────────────────────────── */}
        <header className="plm-header">
          <div className="plm-shield-box">
            <i className="fas fa-shield-halved"></i>
            <div className="plm-mini-lock">
              <i className="fas fa-lock"></i>
            </div>
          </div>

          <div className="plm-header-text">
            <h3 id="plm-modal-title">
              <span>محتوى مقفل بمتطلب سابق</span>
            </h3>
            <p>يتطلب فتح هذا المحتوى اجتياز تقييم مسبق</p>
          </div>

          <button
            type="button"
            className="plm-close-btn"
            onClick={onClose}
            title="إغلاق النافذة"
            aria-label="إغلاق النافذة"
          >
            <i className="fas fa-xmark"></i>
          </button>
        </header>

        {/* ── Modal Body ───────────────────────────────────────────────── */}
        <div className="plm-body">
          {/* 1. Target Item Callout */}
          <div className="plm-target-summary">
            <div className={`plm-target-icon ${typeConfig.badgeClass}`}>
              <i className={`fas ${typeConfig.icon}`}></i>
            </div>
            <div className="plm-target-meta">
              <div className="plm-target-label">المحتوى المطلوب فتحه:</div>
              <h4 className="plm-target-title" title={targetTitle}>
                {targetTitle}
              </h4>
            </div>
          </div>

          {/* 2. Prerequisite Requirement Card */}
          <div className="plm-prereq-card">
            <div className="plm-prereq-top">
              <div className="plm-exam-icon-badge">
                <i className="fas fa-file-signature"></i>
              </div>

              <div className="plm-prereq-info">
                <div className="plm-prereq-badge-tag">
                  <i className="fas fa-key"></i>
                  <span>الامتحان المشروط للفتح</span>
                </div>
                <h4 className="plm-prereq-title">{resolvedExamTitle}</h4>

                {examDetails && (
                  <div className="plm-exam-details-chips">
                    {examDetails.questions_count !== undefined && (
                      <span className="plm-chip">
                        <i className="fas fa-list-check"></i>
                        {examDetails.questions_count} أسئلة
                      </span>
                    )}
                    {examDetails.total_points !== undefined && (
                      <span className="plm-chip">
                        <i className="fas fa-award"></i>
                        {examDetails.total_points} درجة
                      </span>
                    )}
                    {examDetails.duration_minutes > 0 && (
                      <span className="plm-chip">
                        <i className="fas fa-stopwatch"></i>
                        {examDetails.duration_minutes} دقيقة
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 3. Score Benchmark Comparison */}
            <div className="plm-score-benchmarks">
              <div className="plm-benchmark-box">
                <span className="plm-benchmark-label">
                  <i className="fas fa-bullseye" style={{ color: '#d97706' }}></i>
                  نسبة النجاح المطلوبة
                </span>
                <span className="plm-benchmark-value req-val">{requiredScore}%</span>
              </div>

              <div className="plm-benchmark-box">
                <span className="plm-benchmark-label">
                  <i className="fas fa-user-graduate" style={{ color: '#2563eb' }}></i>
                  أعلى نسبة أحرزتها
                </span>
                {hasAttempted ? (
                  <span className="plm-benchmark-value stud-val">{studentScore}%</span>
                ) : (
                  <span className="plm-benchmark-value stud-val val-unattempted">
                    لم تقدم الامتحان بعد
                  </span>
                )}
              </div>
            </div>

            {/* Score Comparison Gauge */}
            <div className="plm-gauge-wrap">
              <div className="plm-gauge-track">
                {hasAttempted && (
                  <div
                    className="plm-gauge-fill"
                    style={{ width: `${Math.min(100, Math.max(0, studentScore))}%` }}
                  ></div>
                )}
                {/* Required Score Marker */}
                <div
                  className="plm-gauge-marker"
                  style={{ right: `${Math.min(100, Math.max(0, requiredScore))}%` }}
                  title={`المطلوب: ${requiredScore}%`}
                ></div>
              </div>

              <div className="plm-gauge-legend">
                <span>0%</span>
                <span>
                  {hasAttempted && scoreGap > 0
                    ? `متبقي ${scoreGap}% لتحقيق شرط الفتح`
                    : !hasAttempted
                    ? `تحتاج لإحراز ${requiredScore}% على الأقل`
                    : 'استوفيت النسبة المطلوبة'}
                </span>
                <span>100%</span>
              </div>
            </div>
          </div>

          {/* 4. Guidance Note */}
          <div className="plm-guidance-note">
            <i className="fas fa-circle-info"></i>
            <div>
              <strong>ملاحظة تعليمية:</strong> {reasonText}
            </div>
          </div>
        </div>

        {/* ── Modal Footer ─────────────────────────────────────────────── */}
        <footer className="plm-footer">
          <button type="button" onClick={onClose} className="plm-btn plm-btn-cancel">
            <span>إغلاق</span>
          </button>

          {requiredExamId && (
            <button
              type="button"
              onClick={handleLaunchRequiredExam}
              className="plm-btn plm-btn-primary"
            >
              <i className="fas fa-arrow-left"></i>
              <span>
                {hasAttempted ? 'إعادة الامتحان لرفع الدرجة' : 'بدء الامتحان المطلوب الآن'}
              </span>
            </button>
          )}
        </footer>
      </div>
    </div>
  )

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent
}
