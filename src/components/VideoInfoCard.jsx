import React from 'react'
import './VideoInfoCard.css'

/**
 * VideoInfoCard
 * Reusable sidebar card for the Lecture Workspace matching Reference Image 2.
 *
 * Requirements:
 * - Display active video's title.
 * - Display view count / remaining views using existing available data.
 * - Display relevant course/package information.
 * - Display purchase/access status only from existing data (no invented state).
 * - Multi-tenant tokenized CSS and responsive RTL layout.
 */
export default function VideoInfoCard({
  video,
  selectedPart = null,
  viewsUsed = 0,
  viewCap = null,
  partTrialsLeft = null,
  packageTitle = null,
  isPurchased = null,
  hasAccess = null,
  userRole = 'student',
  className = ''
}) {
  // Format views display:
  // If viewCap is given (e.g. 100), show "viewsUsed/viewCap" (e.g. "0/100").
  // If partTrialsLeft is given, we can deduce views used or trials remaining.
  let viewsDisplay = '0/100'
  const isAdmin = userRole === 'admin' || userRole === 'assistant' || userRole === 'super_admin'

  if (isAdmin) {
    viewsDisplay = 'غير محدود (إدارة)'
  } else if (viewCap !== null && viewCap !== undefined && viewCap !== Infinity) {
    let used = 0
    if (viewsUsed !== null && viewsUsed !== undefined && viewsUsed > 0) {
      used = viewsUsed
    } else if (partTrialsLeft !== null && partTrialsLeft !== undefined) {
      used = Math.max(0, viewCap - partTrialsLeft)
    } else if (viewsUsed !== null && viewsUsed !== undefined) {
      used = viewsUsed
    }
    viewsDisplay = `${used}/${viewCap}`
  } else if (partTrialsLeft !== null && partTrialsLeft !== undefined && partTrialsLeft !== Infinity) {
    viewsDisplay = `${partTrialsLeft} متبقي`
  } else if (viewsUsed !== undefined && viewsUsed !== null && viewsUsed > 0) {
    viewsDisplay = `${viewsUsed} مشاهدات`
  } else {
    // Default baseline counter when cap is standard or unmetered
    viewsDisplay = '0/100'
  }

  // Determine purchase / access status text strictly from existing data
  const isAccessible = hasAccess === true || isPurchased === true || isAdmin
  let purchaseStatusText = 'لم يتم الشراء'
  let purchaseStatusClass = 'not-purchased'

  if (isAdmin) {
    purchaseStatusText = 'متاح (حساب إداري)'
    purchaseStatusClass = 'is-admin'
  } else if (isAccessible) {
    purchaseStatusText = 'تم الشراء'
    purchaseStatusClass = 'is-purchased'
  } else if (hasAccess === false || isPurchased === false) {
    purchaseStatusText = 'لم يتم الشراء'
    purchaseStatusClass = 'not-purchased'
  } else {
    // If not explicitly defined, reflect default enrollment state
    purchaseStatusText = 'لم يتم الشراء'
    purchaseStatusClass = 'not-purchased'
  }

  const courseNotice = packageTitle
    ? `هذا الفيديو جزء من كورس: ${packageTitle}`
    : 'هذا الفيديو جزء من كورس'

  const displayVideoTitle = selectedPart?.title || video?.title || 'المحاضرة'

  return (
    <aside className={`vic-root ${className}`} dir="rtl" aria-label="معلومات الفيديو">
      {/* ── Card Header ────────────────────────────────────────────── */}
      <div className="vic-header">
        <div className="vic-header-icon" aria-hidden="true">
          <i className="fas fa-eye"></i>
        </div>
        <h3 className="vic-header-title">معلومات الفيديو</h3>
      </div>

      {/* ── Active Video Title Strip (if title present) ─────────────── */}
      {displayVideoTitle && (
        <div className="vic-title-strip" title={displayVideoTitle}>
          <span className="vic-title-label">العنوان:</span>
          <span className="vic-title-text">{displayVideoTitle}</span>
        </div>
      )}

      {/* ── Two Sub-Cards Grid ──────────────────────────────────────── */}
      <div className="vic-grid">
        {/* Sub-Card 1: Views Counter */}
        <div className="vic-tile vic-views-tile">
          <div className="vic-tile-label">المشاهدات</div>
          <div className="vic-views-value" title={`المشاهدات: ${viewsDisplay}`}>
            {viewsDisplay}
          </div>
        </div>

        {/* Sub-Card 2: Course & Purchase Info */}
        <div className="vic-tile vic-course-tile">
          <div className="vic-tile-label">معلومات الكورس</div>
          <div className="vic-course-desc" title={courseNotice}>
            {courseNotice}
          </div>
          <div className="vic-status-row">
            <span className="vic-status-prefix">حالة الشراء:</span>
            <span className={`vic-status-badge ${purchaseStatusClass}`}>
              {purchaseStatusText}
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
}
