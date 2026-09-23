import React, { useState, useMemo } from 'react'
import './LectureCurriculumAccordion.css'

const ARABIC_ORDINALS = [
  'الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة',
  'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة',
  'الحادية عشرة', 'الثانية عشرة', 'الثالثة عشرة', 'الرابعة عشرة', 'الخامسة عشرة'
]

function formatFileSize(bytes) {
  if (!bytes || Number.isNaN(bytes)) return ''
  const b = Number(bytes)
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * LectureCurriculumAccordion
 * Numbered Lectures Navigation Accordion matching Reference Image 2.
 *
 * Requirements:
 * - Display numbered lectures in RTL (1 المحاضرة الأولى, 2 المحاضرة الثانية...).
 * - Support multiple lectures with individual or multi expand/collapse.
 * - Inside each lecture, render 3 category rows:
 *   1. الفيديوهات (count badge, play icon, subtitle, video items)
 *   2. الامتحانات (count badge, quiz icon, subtitle, exam items)
 *   3. ملفات PDF (count badge, document icon, subtitle, file items)
 * - Preserve M:N relationships (each click carries the explicit lecture context).
 * - Never assume one Video or Exam belongs to one Lecture.
 * - Always pass `contextLectureId: lecture.id` when selecting content.
 * - Display locked states and delegate lock clicks to `onLockedClick` (PrerequisiteLockModal flow).
 * - Multi-tenant tokenized CSS and fully responsive RTL design.
 */
export default function LectureCurriculumAccordion({
  lectures = [],
  currentLectureId = null,
  currentVideoId = null,
  initialOpenLectures = null,
  initialOpenCategories = null,
  alwaysShowItems = false,
  onSelectVideo,
  onSelectExam,
  onDownloadFile,
  onLockedClick,
  downloadingFileId = null,
  title = 'المحاضرات',
  subtitle = 'اختر المحاضرة التي تريد مشاهدتها وابدأ التعلم',
  className = ''
}) {
  // Map of open lectures: default to opening currentLectureId or the first lecture
  const [openLectures, setOpenLectures] = useState(() => {
    if (initialOpenLectures) return { ...initialOpenLectures }
    const initial = {}
    if (currentLectureId) {
      initial[currentLectureId] = true
    } else if (lectures.length > 0) {
      initial[lectures[0].id] = true
    }
    return initial
  })

  // Map of open sub-categories: key = `${lectureId}_${category}` ('videos' | 'exams' | 'files')
  const [openCategories, setOpenCategories] = useState(() => {
    if (initialOpenCategories) return { ...initialOpenCategories }
    return {}
  })

  const toggleLecture = (lectureId) => {
    setOpenLectures((prev) => ({
      ...prev,
      [lectureId]: !prev[lectureId]
    }))
  }

  const toggleCategory = (lectureId, category) => {
    const key = `${lectureId}_${category}`
    setOpenCategories((prev) => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  return (
    <section className={`lca-root ${className}`} dir="rtl" aria-label="أكورديون تصفح المنهج">
      {/* ── Section Header ─────────────────────────────────────────── */}
      <header className="lca-header">
        <div className="lca-header-title-row">
          <div className="lca-header-icon" aria-hidden="true">
            <i className="fas fa-book-open"></i>
          </div>
          <h2 className="lca-header-title">{title}</h2>
        </div>
        {subtitle && <p className="lca-header-subtitle">{subtitle}</p>}
      </header>

      {/* ── Empty State for Zero Lectures ───────────────────────────── */}
      {(!lectures || lectures.length === 0) ? (
        <div className="lca-empty-box">
          <div className="lca-empty-icon" aria-hidden="true">
            <i className="fas fa-chalkboard"></i>
          </div>
          <p className="lca-empty-text">لا توجد محاضرات متاحة في هذا القسم حالياً.</p>
        </div>
      ) : (
        /* ── Numbered Lectures Accordion List ────────────────────────── */
        <div className="lca-list">
          {lectures.map((lec, index) => {
            const isExpanded = !!openLectures[lec.id]
            const isCurrent = currentLectureId && currentLectureId === lec.id
            const isLecLocked = lec.lockStatus && lec.lockStatus.unlocked === false

            const videos = lec.videos || []
            const exams = lec.exams || []
            const files = lec.files || []
            const hasContent = videos.length > 0 || exams.length > 0 || files.length > 0

            // Format ordinal title if not already written in title
            const ordinalNum = index + 1
            const defaultOrdinalTitle = ARABIC_ORDINALS[index] ? `المحاضرة ${ARABIC_ORDINALS[index]}` : `المحاضرة ${ordinalNum}`
            const displayTitle = lec.title || defaultOrdinalTitle

            return (
              <div
                key={lec.id}
                className={`lca-card ${isCurrent ? 'is-current' : ''} ${isLecLocked ? 'is-locked' : ''} ${isExpanded ? 'is-expanded' : ''}`}
              >
                {/* ── Lecture Accordion Header ───────────────────────── */}
                <button
                  type="button"
                  className="lca-lecture-header"
                  onClick={() => toggleLecture(lec.id)}
                  aria-expanded={isExpanded}
                >
                  <div className="lca-lecture-info">
                    {/* Number Badge (1, 2, 3...) */}
                    <span className="lca-num-badge" aria-hidden="true">
                      {ordinalNum}
                    </span>

                    <div className="lca-title-wrap">
                      <span className="lca-lecture-title">{displayTitle}</span>

                      {isCurrent && (
                        <span className="lca-current-tag">
                          <i className="fas fa-play"></i>
                          <span>قيد المشاهدة</span>
                        </span>
                      )}

                      {isLecLocked && (
                        <span className="lca-lock-tag" title="هذه المحاضرة مشروطة باجتياز امتحان سابق">
                          <i className="fas fa-lock"></i>
                          <span>مغلقة بقفل متطلب</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="lca-lecture-toggle-indicator" aria-hidden="true">
                    <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i>
                  </div>
                </button>

                {/* ── Lecture Accordion Body ─────────────────────────── */}
                {isExpanded && (
                  <div className="lca-lecture-body">
                    {/* Prerequisite Alert Callout if Lecture Locked */}
                    {isLecLocked && lec.lockStatus && (
                      <div className="lca-prereq-banner">
                        <div className="lca-prereq-banner-start">
                          <i className="fas fa-shield-halved"></i>
                          <div>
                            <span>يتطلب فتح هذه المحاضرة اجتياز: </span>
                            <strong>{lec.lockStatus.required_exam_title || 'الامتحان المشروط'}</strong>
                            <span> بنسبة نجاح </span>
                            <span className="lca-score-pill">{`${lec.lockStatus.required_score || 70}%`}</span>
                            <span> فأكثر.</span>
                          </div>
                        </div>

                        {onLockedClick && (
                          <button
                            type="button"
                            className="lca-prereq-btn"
                            onClick={() => onLockedClick({
                              type: 'lecture',
                              target: lec,
                              contextLecture: lec,
                              contextLectureId: lec.id,
                              lockStatus: lec.lockStatus
                            })}
                          >
                            <i className="fas fa-key"></i>
                            <span>عرض المتطلب</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Empty State if No Content Attached */}
                    {!hasContent ? (
                      <div className="lca-lec-empty">
                        <i className="fas fa-folder-open"></i>
                        <span>لا توجد محتويات مضافة لهذه المحاضرة بعد.</span>
                      </div>
                    ) : (
                      /* ── 3 Main Category Rows Matching Reference Image 2 ── */
                      <div className="lca-categories-stack">
                        {/* 1. الفيديوهات (Videos Row) */}
                        {videos.length > 0 && (
                          <div className="lca-category-group">
                            <div
                              className={`lca-category-row is-video ${openCategories[`${lec.id}_videos`] ? 'open' : ''}`}
                              onClick={() => {
                                if (isLecLocked) {
                                  onLockedClick?.({
                                    type: 'video',
                                    target: videos[0],
                                    contextLecture: lec,
                                    contextLectureId: lec.id,
                                    lockStatus: lec.lockStatus
                                  })
                                } else if (videos.length === 1 && onSelectVideo) {
                                  // Direct play single video
                                  const vid = videos[0]
                                  if (vid.lockStatus?.unlocked === false) {
                                    onLockedClick?.({
                                      type: 'video',
                                      target: vid,
                                      contextLecture: lec,
                                      contextLectureId: lec.id,
                                      lockStatus: vid.lockStatus
                                    })
                                  } else {
                                    onSelectVideo(vid, lec)
                                  }
                                } else {
                                  toggleCategory(lec.id, 'videos')
                                }
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="lca-cat-left">
                                <div className="lca-cat-icon video-icon" aria-hidden="true">
                                  <i className="fas fa-video"></i>
                                </div>
                                <div className="lca-cat-texts">
                                  <h4 className="lca-cat-title">الفيديوهات</h4>
                                  <p className="lca-cat-desc">شاهد المحاضرة من خلال الفيديوهات</p>
                                </div>
                              </div>

                              <div className="lca-cat-right">
                                <span className="lca-badge video-badge">
                                  <i className="fas fa-play"></i>
                                  <span>{`${videos.length} ${videos.length === 1 ? 'فيديو' : 'فيديوهات'}`}</span>
                                </span>
                                <div className="lca-cat-arrow" aria-hidden="true">
                                  <i className="fas fa-chevron-left"></i>
                                </div>
                              </div>
                            </div>

                            {/* Sub-items list for videos when category is open */}
                            {(alwaysShowItems || openCategories[`${lec.id}_videos`]) && (
                              <div className="lca-subitems-list">
                                {videos.map((vid) => {
                                  const isVidLocked = isLecLocked || (vid.lockStatus && vid.lockStatus.unlocked === false)
                                  const isPlaying = currentVideoId && currentVideoId === vid.id
                                  const partsCount = vid.video_parts?.length || 1

                                  return (
                                    <div
                                      key={vid.id}
                                      className={`lca-item-row ${isPlaying ? 'is-playing' : ''} ${isVidLocked ? 'is-locked' : ''}`}
                                      onClick={() => {
                                        if (isVidLocked) {
                                          onLockedClick?.({
                                            type: 'video',
                                            target: vid,
                                            contextLecture: lec,
                                            contextLectureId: lec.id,
                                            lockStatus: vid.lockStatus || lec.lockStatus
                                          })
                                        } else {
                                          onSelectVideo?.(vid, lec)
                                        }
                                      }}
                                      role="button"
                                      tabIndex={0}
                                    >
                                      <div className="lca-item-main">
                                        <div className="lca-item-icon">
                                          {isVidLocked ? (
                                            <i className="fas fa-lock"></i>
                                          ) : isPlaying ? (
                                            <i className="fas fa-volume-high"></i>
                                          ) : (
                                            <i className="fas fa-play"></i>
                                          )}
                                        </div>
                                        <span className="lca-item-name">{vid.title}</span>
                                      </div>

                                      <div className="lca-item-meta">
                                        {partsCount > 1 && (
                                          <span className="lca-sub-chip">
                                            <i className="fas fa-layer-group"></i>
                                            {partsCount} أجزاء
                                          </span>
                                        )}
                                        {isPlaying ? (
                                          <span className="lca-playing-pill">مشغل الآن</span>
                                        ) : isVidLocked ? (
                                          <span className="lca-locked-pill">مغلق</span>
                                        ) : (
                                          <span className="lca-action-pill">تشغيل</span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* 2. الامتحانات (Exams Row) */}
                        {exams.length > 0 && (
                          <div className="lca-category-group">
                            <div
                              className={`lca-category-row is-exam ${openCategories[`${lec.id}_exams`] ? 'open' : ''}`}
                              onClick={() => {
                                if (isLecLocked) {
                                  onLockedClick?.({
                                    type: 'exam',
                                    target: exams[0],
                                    contextLecture: lec,
                                    contextLectureId: lec.id,
                                    lockStatus: lec.lockStatus
                                  })
                                } else if (exams.length === 1 && onSelectExam) {
                                  const ex = exams[0]
                                  if (ex.lockStatus?.unlocked === false) {
                                    onLockedClick?.({
                                      type: 'exam',
                                      target: ex,
                                      contextLecture: lec,
                                      contextLectureId: lec.id,
                                      lockStatus: ex.lockStatus
                                    })
                                  } else {
                                    onSelectExam(ex, lec)
                                  }
                                } else {
                                  toggleCategory(lec.id, 'exams')
                                }
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="lca-cat-left">
                                <div className="lca-cat-icon exam-icon" aria-hidden="true">
                                  <i className="fas fa-clipboard-question"></i>
                                </div>
                                <div className="lca-cat-texts">
                                  <h4 className="lca-cat-title">الامتحانات</h4>
                                  <p className="lca-cat-desc">اختبر فهمك لما تم شرحه في المحاضرة</p>
                                </div>
                              </div>

                              <div className="lca-cat-right">
                                <span className="lca-badge exam-badge">
                                  <i className="fas fa-pen-to-square"></i>
                                  <span>{`${exams.length} ${exams.length === 1 ? 'امتحان' : 'امتحانات'}`}</span>
                                </span>
                                <div className="lca-cat-arrow" aria-hidden="true">
                                  <i className="fas fa-chevron-left"></i>
                                </div>
                              </div>
                            </div>

                            {/* Sub-items list for exams when category is open */}
                            {(alwaysShowItems || openCategories[`${lec.id}_exams`]) && (
                              <div className="lca-subitems-list">
                                {exams.map((ex) => {
                                  const isExLocked = isLecLocked || (ex.lockStatus && ex.lockStatus.unlocked === false)

                                  return (
                                    <div
                                      key={ex.id}
                                      className={`lca-item-row ${isExLocked ? 'is-locked' : ''}`}
                                      onClick={() => {
                                        if (isExLocked) {
                                          onLockedClick?.({
                                            type: 'exam',
                                            target: ex,
                                            contextLecture: lec,
                                            contextLectureId: lec.id,
                                            lockStatus: ex.lockStatus || lec.lockStatus
                                          })
                                        } else {
                                          onSelectExam?.(ex, lec)
                                        }
                                      }}
                                      role="button"
                                      tabIndex={0}
                                    >
                                      <div className="lca-item-main">
                                        <div className="lca-item-icon">
                                          {isExLocked ? <i className="fas fa-lock"></i> : <i className="fas fa-file-pen"></i>}
                                        </div>
                                        <span className="lca-item-name">{ex.title}</span>
                                      </div>

                                      <div className="lca-item-meta">
                                        {ex.duration_minutes > 0 && (
                                          <span className="lca-sub-chip">
                                            <i className="fas fa-stopwatch"></i>
                                            {`${ex.duration_minutes} دقيقة`}
                                          </span>
                                        )}
                                        {isExLocked ? (
                                          <span className="lca-locked-pill">مغلق</span>
                                        ) : (
                                          <span className="lca-action-pill exam-action">بدء الامتحان</span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* 3. ملفات PDF (PDF Files Row) */}
                        {files.length > 0 && (
                          <div className="lca-category-group">
                            <div
                              className={`lca-category-row is-file ${openCategories[`${lec.id}_files`] ? 'open' : ''}`}
                              onClick={() => {
                                if (isLecLocked) {
                                  onLockedClick?.({
                                    type: 'file',
                                    target: files[0],
                                    contextLecture: lec,
                                    contextLectureId: lec.id,
                                    lockStatus: lec.lockStatus
                                  })
                                } else if (files.length === 1 && onDownloadFile) {
                                  onDownloadFile(files[0], lec)
                                } else {
                                  toggleCategory(lec.id, 'files')
                                }
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="lca-cat-left">
                                <div className="lca-cat-icon file-icon" aria-hidden="true">
                                  <i className="fas fa-file-pdf"></i>
                                </div>
                                <div className="lca-cat-texts">
                                  <h4 className="lca-cat-title">ملفات PDF</h4>
                                  <p className="lca-cat-desc">حمل ملفات المحاضرة للمراجعة</p>
                                </div>
                              </div>

                              <div className="lca-cat-right">
                                <span className="lca-badge file-badge">
                                  <i className="fas fa-file-pdf"></i>
                                  <span>{`${files.length} ${files.length === 1 ? 'ملف PDF' : 'ملفات PDF'}`}</span>
                                </span>
                                <div className="lca-cat-arrow" aria-hidden="true">
                                  <i className="fas fa-chevron-left"></i>
                                </div>
                              </div>
                            </div>

                            {/* Sub-items list for files when category is open */}
                            {(alwaysShowItems || openCategories[`${lec.id}_files`]) && (
                              <div className="lca-subitems-list">
                                {files.map((file) => {
                                  const isDownloading = downloadingFileId === file.id

                                  return (
                                    <div
                                      key={file.id}
                                      className={`lca-item-row ${isLecLocked ? 'is-locked' : ''}`}
                                      onClick={() => {
                                        if (isLecLocked) {
                                          onLockedClick?.({
                                            type: 'file',
                                            target: file,
                                            contextLecture: lec,
                                            contextLectureId: lec.id,
                                            lockStatus: lec.lockStatus
                                          })
                                        } else {
                                          onDownloadFile?.(file, lec)
                                        }
                                      }}
                                      role="button"
                                      tabIndex={0}
                                    >
                                      <div className="lca-item-main">
                                        <div className="lca-item-icon file-item-icon">
                                          <i className="fas fa-file-arrow-down"></i>
                                        </div>
                                        <span className="lca-item-name">{file.title}</span>
                                      </div>

                                      <div className="lca-item-meta">
                                        {file.file_size > 0 && (
                                          <span className="lca-sub-chip">
                                            {formatFileSize(file.file_size)}
                                          </span>
                                        )}
                                        {isLecLocked ? (
                                          <span className="lca-locked-pill">مغلق</span>
                                        ) : (
                                          <span className="lca-action-pill file-action">
                                            {isDownloading ? (
                                              <>
                                                <i className="fas fa-spinner fa-spin"></i>
                                                <span>جاري التحميل...</span>
                                              </>
                                            ) : (
                                              <>
                                                <i className="fas fa-download"></i>
                                                <span>تحميل</span>
                                              </>
                                            )}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
