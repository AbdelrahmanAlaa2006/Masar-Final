import React, { useState, useMemo, useEffect } from 'react'
import './VideoPlayerWorkspace.css'

/**
 * VideoPlayerWorkspace
 *
 * Professional, focused learning workspace for video lessons.
 * Replaces the fragmented dashboard-card UI with a unified educational experience.
 *
 * Features:
 * - Integrated top context bar (back button, course/level eyebrow, lecture title, metadata chips)
 * - Dominant 16:9 theater stage for the video player with refined cinematic empty state
 * - Direct under-player info strip with active part details, trials status, and Next/Prev quick controls
 * - Curriculum playlist (sidebar on desktop, compact switcher on mobile) with numbered parts and clear active/locked states
 * - Contextual sub-player learning hub with segmented tabs (Notes, Discussion, PDF, Overview)
 * - Pure multi-tenant CSS using tenant design tokens (--primary, --dynamic-card, --border-color, etc.)
 */
export default function VideoPlayerWorkspace({
  video,
  selectedPart,
  onSelectPart,
  onBack,
  backLabel = 'العودة للفيديوهات',
  levelEyebrow,
  userRole = 'student',
  currentUser,
  // Gates & Trials
  partTrialsLeft,
  partViewCap,
  findBlockingGate,
  gatesForPart,
  // Notes
  notes = [],
  loadingNotes = false,
  noteContent = '',
  onNoteContentChange,
  onSaveNote,
  onDeleteNote,
  onSeekToNote,
  currentTime = 0,
  formatTime,
  // Slots
  children, // The active player component (Bunny, Drive, or YouTube inside PlayerFacade)
  discussionSlot, // <VideoComments />
  pdfSlot, // <PdfInline />
}) {
  const [activeTab, setActiveTab] = useState('notes')
  const [mobilePartsOpen, setMobilePartsOpen] = useState(false)

  const parts = video?.parts || []
  const isSinglePart = parts.length <= 1

  // Auto-select first part if none selected on load
  useEffect(() => {
    if (!selectedPart && parts.length > 0 && typeof onSelectPart === 'function') {
      onSelectPart(parts[0])
    }
  }, [video?.id])

  // Reset tab to notes and anchor scroll position to top when opening a video
  useEffect(() => {
    setActiveTab('notes')
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    const t1 = setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }), 50)
    const t2 = setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }), 200)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [video?.id])

  const currentPartIndex = useMemo(() => {
    if (!selectedPart) return -1
    return parts.findIndex((p) => p.id === selectedPart.id)
  }, [parts, selectedPart])

  const displayTitle = useMemo(() => {
    if (!selectedPart) return video?.title || 'المحاضرة'
    if (isSinglePart) {
      const t = selectedPart.title?.trim() || ''
      if (!t || t === 'الجزء 1' || t === 'الجزء الأول' || t === 'Part 1' || t === video?.title) {
        return video?.title || 'المحاضرة'
      }
      return t
    }
    return selectedPart.title || video?.title || 'المحاضرة'
  }, [selectedPart, isSinglePart, video?.title])

  const hasPrev = currentPartIndex > 0
  const hasNext = currentPartIndex >= 0 && currentPartIndex < parts.length - 1

  const goToPrev = () => {
    if (hasPrev) {
      onSelectPart(parts[currentPartIndex - 1])
    }
  }

  const goToNext = () => {
    if (hasNext) {
      onSelectPart(parts[currentPartIndex + 1])
    }
  }

  // If active part changes and we have a blocking gate on the new part, reset
  const activeBlocking = useMemo(() => {
    if (!selectedPart || !findBlockingGate) return null
    return findBlockingGate(video, selectedPart)
  }, [video, selectedPart, findBlockingGate])

  const activeTrialsLeft = useMemo(() => {
    if (!selectedPart || !partTrialsLeft) return null
    return partTrialsLeft(video, selectedPart)
  }, [video, selectedPart, partTrialsLeft])

  const activeViewCap = useMemo(() => {
    if (!selectedPart || !partViewCap) return null
    return partViewCap(video, selectedPart)
  }, [video, selectedPart, partViewCap])

  const showActiveTrials =
    userRole !== 'admin' &&
    userRole !== 'assistant' &&
    activeViewCap !== null &&
    activeViewCap !== Infinity

  const activeTrialColor =
    activeTrialsLeft <= 0 ? '#ef4444' : activeTrialsLeft === 1 ? '#f59e0b' : '#10b981'

  const isNotesAllowed = userRole === 'admin' || userRole === 'assistant'

  return (
    <div className="vpw-root" dir="rtl">
      {/* ── 1. Integrated Workspace Top Context Bar ── */}
      <header className="vpw-topbar">
        <div className="vpw-topbar-inner">
          <div className="vpw-topbar-start">
            <button
              type="button"
              className="vpw-back-button"
              onClick={onBack}
              title={backLabel}
            >
              <i className="fas fa-arrow-right"></i>
              <span className="vpw-back-text">{backLabel}</span>
            </button>

            <div className="vpw-topbar-divider" aria-hidden="true"></div>

            <div className="vpw-context-titles">
              {levelEyebrow && (
                <span className="vpw-eyebrow-badge">
                  <i className="fas fa-graduation-cap"></i>
                  {levelEyebrow}
                </span>
              )}
              <h1 className="vpw-lecture-title">{video?.title || 'المحاضرة'}</h1>
            </div>
          </div>

          <div className="vpw-topbar-end">
            <div className="vpw-meta-chips">
              {!isSinglePart && parts.length > 1 && (
                <span className="vpw-chip">
                  <i className="fas fa-layer-group"></i>
                  <span>{parts.length} أجزاء</span>
                </span>
              )}

              {video?.pdf_url && (
                <button
                  type="button"
                  className={`vpw-chip vpw-chip-action ${activeTab === 'pdf' ? 'active' : ''}`}
                  onClick={() => setActiveTab('pdf')}
                  title="عرض مذكرة المحاضرة"
                >
                  <i className="fas fa-file-pdf"></i>
                  <span>مذكرة المحاضرة</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── 2. Main Workspace Layout (Theater Stage + Curriculum Playlist) ── */}
      <main className={`vpw-workspace ${isSinglePart ? 'is-single-part' : ''}`}>
        {/* Main Column: Video Player, Info Strip, and Contextual Hub */}
        <section className="vpw-main-column">
          {/* Theater Video Player Canvas */}
          <div className="vpw-stage-wrapper">
            <div className="vpw-theater-frame">
              {selectedPart && (selectedPart.youtubeId || selectedPart.driveId || selectedPart.bunnyVideoId) ? (
                <div className="vpw-player-embed">
                  {children}
                </div>
              ) : (
                <div className="vpw-empty-stage">
                  <div className="vpw-empty-backdrop"></div>
                  <div className="vpw-empty-content">
                    <div className="vpw-empty-icon-ring">
                      <i className="fas fa-play"></i>
                    </div>
                    <h2 className="vpw-empty-title">
                      {isSinglePart ? 'المحاضرة جاهزة للمشاهدة' : 'اختر جزءاً لبدء المحاضرة'}
                    </h2>
                    <p className="vpw-empty-desc">
                      {isSinglePart
                        ? 'اضغط على زر البدء لتشغيل الفيديو ومتابعة الشرح'
                        : 'اضغط على أحد الأجزاء من قائمة المحاضرة الجانبية لمتابعة الشرح'}
                    </p>
                    {parts.length > 0 && (
                      <button
                        type="button"
                        className="vpw-empty-action-btn"
                        onClick={() => onSelectPart(parts[0])}
                      >
                        <i className="fas fa-play"></i>
                        <span>{isSinglePart ? 'تشغيل الفيديو' : 'البدء من الجزء الأول'}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Direct Under-Player Action & Info Strip */}
            <div className="vpw-under-stage-strip">
              <div className="vpw-stage-info">
                {selectedPart ? (
                  <div className="vpw-active-part-badge">
                    {!isSinglePart && parts.length > 1 && (
                      <span className="vpw-part-num-pill">الجزء {currentPartIndex + 1}</span>
                    )}
                    <span className="vpw-part-name">{displayTitle}</span>
                  </div>
                ) : (
                  <span className="vpw-stage-status-muted">جاري تجهيز المشغل...</span>
                )}

                {showActiveTrials && (
                  <span
                    className="vpw-trials-pill"
                    style={{
                      backgroundColor: `${activeTrialColor}18`,
                      color: activeTrialColor,
                      borderColor: `${activeTrialColor}40`,
                    }}
                    title="المشاهدات والمحاولات المتبقية لهذا الجزء"
                  >
                    <i className="fas fa-eye"></i>
                    <span>متبقي {activeTrialsLeft} من {activeViewCap} مشاهدات</span>
                  </span>
                )}

                {activeBlocking && userRole !== 'admin' && userRole !== 'assistant' && (
                  <span className="vpw-gate-pill" title="اختبار إلزامي مطلوب">
                    <i className="fas fa-lock"></i>
                    <span>مطلوب اجتياز: {activeBlocking.title} ({activeBlocking.passing_score}%)</span>
                  </span>
                )}
              </div>

              {/* Quick Navigation Between Parts */}
              {!isSinglePart && parts.length > 1 && (
                <div className="vpw-stage-nav-controls">
                  <button
                    type="button"
                    className="vpw-nav-step-btn"
                    disabled={!hasPrev}
                    onClick={goToPrev}
                    title={hasPrev ? `الانتقال إلى الجزء السابق: ${parts[currentPartIndex - 1]?.title}` : 'لا يوجد جزء سابق'}
                  >
                    <i className="fas fa-chevron-right"></i>
                    <span className="vpw-nav-step-label">السابق</span>
                  </button>

                  <span className="vpw-nav-fraction">
                    {currentPartIndex >= 0 ? currentPartIndex + 1 : 0} / {parts.length}
                  </span>

                  <button
                    type="button"
                    className="vpw-nav-step-btn"
                    disabled={!hasNext}
                    onClick={goToNext}
                    title={hasNext ? `الانتقال إلى الجزء التالي: ${parts[currentPartIndex + 1]?.title}` : 'لا يوجد جزء تالي'}
                  >
                    <span className="vpw-nav-step-label">التالي</span>
                    <i className="fas fa-chevron-left"></i>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Curriculum Accordion / Quick Switcher (Only for multi-part videos) */}
          {!isSinglePart && parts.length > 1 && (
            <div className="vpw-mobile-curriculum">
              <button
                type="button"
                className={`vpw-mobile-curriculum-toggle ${mobilePartsOpen ? 'open' : ''}`}
                onClick={() => setMobilePartsOpen(!mobilePartsOpen)}
                aria-expanded={mobilePartsOpen}
              >
                <div className="vpw-mobile-curriculum-title">
                  <i className="fas fa-list-check"></i>
                  <span>أجزاء المحاضرة ({parts.length})</span>
                  {selectedPart && (
                    <span className="vpw-mobile-active-hint">
                      • الجزء {currentPartIndex + 1}
                    </span>
                  )}
                </div>
                <i className={`fas fa-chevron-${mobilePartsOpen ? 'up' : 'down'}`}></i>
              </button>

              {mobilePartsOpen && (
                <div className="vpw-mobile-curriculum-list">
                  {parts.map((part, index) => {
                    const blocking = findBlockingGate ? findBlockingGate(video, part) : null
                    const left = partTrialsLeft ? partTrialsLeft(video, part) : Infinity
                    const cap = partViewCap ? partViewCap(video, part) : Infinity
                    const outOfTrials = userRole !== 'admin' && userRole !== 'assistant' && left <= 0
                    const locked = (!!blocking && userRole !== 'admin' && userRole !== 'assistant') || outOfTrials
                    const isActive = selectedPart?.id === part.id

                    return (
                      <button
                        key={part.id}
                        type="button"
                        className={`vpw-part-item ${isActive ? 'is-active' : ''} ${locked ? 'is-locked' : ''}`}
                        onClick={() => {
                          onSelectPart(part)
                          setMobilePartsOpen(false)
                        }}
                      >
                        <span className="vpw-part-index">{String(index + 1).padStart(2, '0')}</span>
                        <div className="vpw-part-meta">
                          <div className="vpw-part-title-row">
                            {locked && <i className="fas fa-lock vpw-lock-icon"></i>}
                            <span className="vpw-part-text">{part.title}</span>
                          </div>
                        </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── 3. Contextual Sub-Player Learning Hub (Segmented Tabs) ── */}
          <div className="vpw-learning-hub">
            <div className="vpw-tabs-nav" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'notes'}
                className={`vpw-tab-btn ${activeTab === 'notes' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('notes')}
              >
                <i className="fas fa-book-bookmark"></i>
                <span>ملاحظاتي</span>
                {notes.length > 0 && <span className="vpw-tab-counter">{notes.length}</span>}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'discussion'}
                className={`vpw-tab-btn ${activeTab === 'discussion' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('discussion')}
              >
                <i className="fas fa-comments"></i>
                <span>الأسئلة والمناقشات</span>
              </button>

              {video?.pdf_url && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'pdf'}
                  className={`vpw-tab-btn ${activeTab === 'pdf' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('pdf')}
                >
                  <i className="fas fa-file-pdf"></i>
                  <span>مذكرة المحاضرة</span>
                </button>
              )}

              {video?.description && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'overview'}
                  className={`vpw-tab-btn ${activeTab === 'overview' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('overview')}
                >
                  <i className="fas fa-circle-info"></i>
                  <span>عن المحاضرة</span>
                </button>
              )}
            </div>

            {/* Tab 1: Notes Experience */}
            {activeTab === 'notes' && (
              <div className="vpw-tab-panel" role="tabpanel">
                <div className="vpw-notes-workspace">
                  <div className="vpw-notes-header">
                    <div>
                      <h3 className="vpw-section-heading">
                        <i className="fas fa-pen-fancy"></i>
                        <span>ملاحظات الفيديو والتوقيت</span>
                      </h3>
                      <p className="vpw-section-sub">
                        اكتب ملاحظاتك أثناء المشاهدة مع تحديد توقيت الفيديو لمراجعتها في أي وقت
                      </p>
                    </div>
                  </div>

                  {selectedPart?.source !== 'youtube' ? (
                    <div className="vpw-notes-warning">
                      <i className="fas fa-info-circle"></i>
                      <span>الملاحظات الذكية وتحديد التوقيت مدعومة حالياً لفيديوهات اليوتيوب.</span>
                    </div>
                  ) : (
                    <>
                      {/* Note add form */}
                      {isNotesAllowed && (
                        <form onSubmit={onSaveNote} className="vpw-note-composer">
                          <div className="vpw-composer-surface">
                            <textarea
                              className="vpw-note-textarea"
                              placeholder="اكتب فكرة أو ملاحظة هنا أثناء المشاهدة..."
                              value={noteContent}
                              onChange={(e) => onNoteContentChange(e.target.value)}
                              rows={2}
                            />
                            <div className="vpw-composer-actions">
                              <span className="vpw-timestamp-tag" title="التوقيت الحالي للفيديو">
                                <i className="fas fa-clock"></i>
                                <span>{formatTime ? formatTime(currentTime) : '00:00'}</span>
                              </span>
                              <button
                                type="submit"
                                className="vpw-save-note-btn"
                                disabled={!noteContent.trim()}
                              >
                                <i className="fas fa-plus"></i>
                                <span>حفظ الملاحظة</span>
                              </button>
                            </div>
                          </div>
                        </form>
                      )}

                      {/* Notes list */}
                      <div className="vpw-notes-list-wrapper">
                        {loadingNotes ? (
                          <div className="vpw-state-loading">
                            <i className="fas fa-spinner fa-spin"></i>
                            <span>جاري تحميل الملاحظات...</span>
                          </div>
                        ) : notes.length === 0 ? (
                          <div className="vpw-notes-empty">
                            <div className="vpw-notes-empty-icon">
                              <i className="far fa-note-sticky"></i>
                            </div>
                            <h4 className="vpw-notes-empty-title">لا توجد ملاحظات محفوظة في هذا الجزء بعد</h4>
                            <p className="vpw-notes-empty-text">
                              اكتب ملخصاً أو نقطة تود العودة إليها لاحقاً باستخدام نموذج الملاحظات أعلاه
                            </p>
                          </div>
                        ) : (
                          <div className="vpw-notes-grid">
                            {notes.map((note) => (
                              <div key={note.id} className="vpw-note-card">
                                <div className="vpw-note-header">
                                  <button
                                    type="button"
                                    onClick={() => onSeekToNote(note.timestamp_seconds)}
                                    className="vpw-seek-timestamp-btn"
                                    title="الانتقال إلى هذه اللحظة في الفيديو"
                                  >
                                    <i className="fas fa-play"></i>
                                    <span>{formatTime ? formatTime(note.timestamp_seconds) : note.timestamp_seconds}</span>
                                  </button>

                                  {isNotesAllowed && (
                                    <button
                                      type="button"
                                      onClick={() => onDeleteNote(note.id)}
                                      className="vpw-note-remove-btn"
                                      title="حذف الملاحظة"
                                    >
                                      <i className="fas fa-trash-can"></i>
                                    </button>
                                  )}
                                </div>
                                <p className="vpw-note-body">{note.content}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Discussion Experience */}
            {activeTab === 'discussion' && (
              <div className="vpw-tab-panel" role="tabpanel">
                <div className="vpw-discussion-container">
                  {discussionSlot}
                </div>
              </div>
            )}

            {/* Tab 3: PDF Document */}
            {activeTab === 'pdf' && video?.pdf_url && (
              <div className="vpw-tab-panel" role="tabpanel">
                <div className="vpw-pdf-viewer-wrap">
                  <div className="vpw-pdf-viewer-header">
                    <div className="vpw-pdf-title">
                      <i className="fas fa-file-pdf" style={{ color: '#ef4444' }}></i>
                      <span>مذكرة المحاضرة المرفقة: {video.title}</span>
                    </div>
                    <a
                      href={video.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="vpw-pdf-download-btn"
                    >
                      <i className="fas fa-arrow-up-right-from-square"></i>
                      <span>فتح في نافذة جديدة</span>
                    </a>
                  </div>
                  <div className="vpw-pdf-frame-holder">
                    {pdfSlot}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 4: Overview Description */}
            {activeTab === 'overview' && video?.description && (
              <div className="vpw-tab-panel" role="tabpanel">
                <div className="vpw-overview-box">
                  <h3 className="vpw-section-heading">
                    <i className="fas fa-align-right"></i>
                    <span>وصف ومحتوى المحاضرة</span>
                  </h3>
                  <div className="vpw-overview-text">
                    {video.description}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Sidebar Column: Curriculum Playlist (Desktop - Only for multi-part videos) */}
        {!isSinglePart && parts.length > 1 && (
          <aside className="vpw-curriculum-sidebar">
            <div className="vpw-curriculum-header">
              <div className="vpw-curriculum-header-text">
                <h2 className="vpw-curriculum-title">
                  <i className="fas fa-layer-group"></i>
                  <span>محتوى المحاضرة</span>
                </h2>
                <span className="vpw-curriculum-count">{parts.length} أجزاء</span>
              </div>
            </div>

            <div className="vpw-curriculum-list" id="partsList">
              {parts.map((part, index) => {
                const blocking = findBlockingGate ? findBlockingGate(video, part) : null
                const left = partTrialsLeft ? partTrialsLeft(video, part) : Infinity
                const cap = partViewCap ? partViewCap(video, part) : Infinity
                const outOfTrials = userRole !== 'admin' && userRole !== 'assistant' && left <= 0
                const locked = (!!blocking && userRole !== 'admin' && userRole !== 'assistant') || outOfTrials
                const isActive = selectedPart?.id === part.id
                const showTrials = userRole !== 'admin' && userRole !== 'assistant' && cap !== Infinity
                const trialColor = left <= 0 ? '#ef4444' : left === 1 ? '#f59e0b' : '#10b981'

                return (
                  <div
                    key={part.id}
                    className={`vpw-curriculum-item ${isActive ? 'is-active' : ''} ${locked ? 'is-locked' : ''}`}
                    onClick={() => onSelectPart(part)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelectPart(part)
                      }
                    }}
                  >
                    <div className="vpw-item-leading">
                      <span className="vpw-item-index">{String(index + 1).padStart(2, '0')}</span>
                      {isActive ? (
                        <span className="vpw-item-play-icon is-playing">
                          <i className="fas fa-volume-high"></i>
                        </span>
                      ) : locked ? (
                        <span className="vpw-item-play-icon is-locked">
                          <i className="fas fa-lock"></i>
                        </span>
                      ) : (
                        <span className="vpw-item-play-icon">
                          <i className="fas fa-play"></i>
                        </span>
                      )}
                    </div>

                    <div className="vpw-item-content">
                      <div className="vpw-item-title-row">
                        <h3 className="vpw-item-title">{part.title}</h3>
                        {showTrials && (
                          <span
                            className="vpw-item-trials-tag"
                            style={{
                              color: trialColor,
                              backgroundColor: `${trialColor}14`,
                              borderColor: `${trialColor}40`,
                            }}
                            title="المشاهدات المتبقية"
                          >
                            <i className="fas fa-eye"></i>
                            {left}/{cap}
                          </span>
                        )}
                      </div>

                      {/* Blocking Assessment Info */}
                      {blocking && userRole !== 'admin' && userRole !== 'assistant' && (
                        <div className="vpw-item-gate-warning">
                          <i className="fas fa-triangle-exclamation"></i>
                          <span>{blocking.type_label || 'اختبار'} مطلوب: {blocking.title} (نجاح {blocking.passing_score}%)</span>
                        </div>
                      )}

                      {outOfTrials && (
                        <div className="vpw-item-gate-error">
                          <i className="fas fa-circle-xmark"></i>
                          <span>انتهت محاولات المشاهدة المتاحة لهذا الجزء</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {video?.pdf_url && (
              <div className="vpw-sidebar-pdf-card">
                <div className="vpw-sidebar-pdf-info">
                  <i className="fas fa-file-pdf"></i>
                  <span>مذكرة المحاضرة المرفقة</span>
                </div>
                <button
                  type="button"
                  className="vpw-sidebar-pdf-btn"
                  onClick={() => setActiveTab('pdf')}
                >
                  <span>استعراض المذكرة</span>
                  <i className="fas fa-arrow-left"></i>
                </button>
              </div>
            )}
          </aside>
        )}
      </main>
    </div>
  )
}
