import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Notifications.css'
import {
  listNotifications,
  listMyReadIds,
  markRead as apiMarkRead,
  markAllRead as apiMarkAllRead,
  createNotification,
  deleteNotification,
} from '@backend/notificationsApi'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../utils/cache'
import { useAuth } from '../contexts/AuthContext'
import { useTenant } from '../contexts/TenantContext'
import { GRADE_LABEL } from '../pages/ControlPanel/shared'

// Notifications need to be responsive. A 30-minute cache makes them feel sluggish.
// Set to 10 seconds so they update almost instantly on mount or dropdown click.
const NOTIF_TTL = 10 * 1000

const formatWhen = (iso) => {
  try {
    const d = new Date(iso)
    const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 60) return 'الآن'
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`
    return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}



export default function Notifications() {
  const navigate = useNavigate()
  const { gradesList } = useTenant()
  const [open, setOpen] = useState(false)
  const [list, setList] = useState([])
  const [readIds, setReadIds] = useState(new Set())
  const { user, role: userRole, isAdmin, isAssistant } = useAuth()
  const userId = user?.id || null
  const isStaff = isAdmin || isAssistant
  const [composeOpen, setComposeOpen] = useState(false)
  const [draft, setDraft] = useState({ title: '', message: '', level: 'warning', grade: 'all' })
  const [loading, setLoading] = useState(false)
  const panelRef = useRef(null)

  // Fetch notifications + my read state
  const refresh = async (uid) => {
    setLoading(true)
    const cacheKey = isStaff ? 'notifications:admin' : `notifications:student:${uid}`
    try {
      // Fetch the list first, then read-state BOUNDED to those ids (the badge
      // only checks reads for loaded rows) — avoids downloading the student's
      // entire read history every poll.
      const rows = await cached(cacheKey, NOTIF_TTL, () => listNotifications())
      const ids = rows.map((n) => n.id)
      const reads = uid
        ? await cached(`reads:${uid}`, NOTIF_TTL, () => listMyReadIds(uid, ids))
        : []

      const readSet = new Set(reads)

      // Auto-delete read DevTools violations in the background to prevent clutter & requests
      const devtoolsToDelete = rows.filter(
        (n) => n.meta?.kind === 'devtools_violation' && readSet.has(n.id)
      )
      if (devtoolsToDelete.length > 0) {
        Promise.all(devtoolsToDelete.map((n) => deleteNotification(n.id)))
          .then(() => invalidateCache('notifications'))
          .catch((err) => console.error('Failed to clean up read devtools notifications:', err))
      }

      // Filter them out from local state immediately
      const filteredRows = rows.filter(
        (n) => !(n.meta?.kind === 'devtools_violation' && readSet.has(n.id))
      )

      setList(filteredRows)
      setReadIds(readSet)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  // Pull whenever we know the user id, and again each time the panel opens
  // (so a freshly-revealed exam shows up without reload).
  useEffect(() => { if (userId !== null) refresh(userId) }, [userId])
  useEffect(() => { if (open && userId) refresh(userId) }, [open, userId])

  // Poll for the live badge — every 60s, and ONLY while the tab is visible.
  // A backgrounded tab has no reason to poll; we refresh once the moment it
  // becomes visible again so a returning user sees fresh state immediately.
  // (Was every 30s regardless of visibility — the bulk of the notification
  // request floor at scale.)
  useEffect(() => {
    if (!userId) return
    const POLL_MS = 60000
    const tick = () => { if (document.visibilityState === 'visible') refresh(userId) }
    const interval = setInterval(tick, POLL_MS)
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(userId) }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [userId])

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (!panelRef.current) return
      if (!panelRef.current.contains(e.target)) setOpen(false)
    }
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const sorted = useMemo(() => {
    let filtered = [...list]
    if (isStaff) {
      filtered = filtered.filter((n) => {
        // Discard student-specific notifications, unless they are targeted to this admin (userId)
        // or they are system-wide admin-only alerts (target_student is null)
        if (n.scope === 'student' && n.target_student && n.target_student !== userId) {
          return false
        }
        
        // Exclude student-only result reveal notifications (exams/homeworks) from admin alerts
        const isReveal =
          n.meta?.kind === 'reveal' ||
          n.meta?.kind === 'reveal_hw' ||
          n.meta?.examId ||
          n.meta?.homeworkId ||
          (n.title && n.title.startsWith('تم إعلان نتيجة:'))

        if (isReveal) {
          return false
        }
        return true
      })
    } else {
      // Student filtering: discard admin-only notifications and unrelated students' alerts
      filtered = filtered.filter((n) => {
        // 1. Discard system-wide admin alerts (password reset requests, devtools violations, and student chat messages)
        if (n.meta?.kind === 'password_reset_request' || n.meta?.kind === 'devtools_violation' || n.meta?.kind === 'student_chat_message' || n.meta?.kind === 'pending_student') {
          return false
        }

        // 2. Discard notifications targeted to other students, and admin alerts (where target_student is null)
        if (n.scope === 'student') {
          if (n.target_student !== userId) {
            return false
          }
        }

        // 3. Discard notifications targeted to other grades
        const studentGrade = user?.grade || ''
        if (n.scope === 'grade' && n.target_grade && n.target_grade !== studentGrade) {
          return false
        }

        return true
      })
    }
    return filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [list, userRole, userId, user?.grade])
  const unreadCount = sorted.filter((n) => !readIds.has(n.id)).length

  const deleteOne = async (id) => {
    const prev = list
    setList(list.filter((n) => n.id !== id))
    try {
      await deleteNotification(id)
      invalidateCache('notifications')
    } catch { setList(prev) }
  }

  const markAllRead = async () => {
    const ids = sorted.map((n) => n.id).filter((id) => !readIds.has(id))
    if (!ids.length || !userId) return
    const next = new Set(readIds); ids.forEach((id) => next.add(id))
    setReadIds(next)
    try {
      // Find all devtools violations that are about to be marked as read
      const devtoolsIds = sorted
        .filter((n) => n.meta?.kind === 'devtools_violation' && !readIds.has(n.id))
        .map((n) => n.id)

      await apiMarkAllRead(ids, userId)
      invalidateCache(`reads:${userId}`)

      // Delete devtools violations from DB to prevent clutter/bloat
      if (devtoolsIds.length > 0) {
        await Promise.all(devtoolsIds.map((id) => deleteNotification(id)))
        setList((prev) => prev.filter((n) => !devtoolsIds.includes(n.id)))
        invalidateCache('notifications')
      }
    } catch { /* ignore */ }
  }

  const markOneRead = async (id) => {
    if (readIds.has(id) || !userId) return
    const next = new Set(readIds); next.add(id)
    setReadIds(next)
    try {
      await apiMarkRead(id, userId)
      invalidateCache(`reads:${userId}`)
    } catch { /* ignore */ }
  }

  // Click a notification: mark read, close panel, navigate to the right page
  const handleNotifClick = (n) => {
    const meta = n.meta || {}
    
    // Do not mark password reset requests as read when clicked; they should remain unread
    // until resolved/rejected by the admin (which deletes them from the DB trigger).
    if (meta.kind !== 'password_reset_request') {
      markOneRead(n.id)
    }

    let target = null
    let state = null

    if (meta.kind === 'reveal' && meta.examId) {
      // Exam grades revealed
      if (isStaff) {
        target = '/exams-group-report'
        state = { examId: meta.examId }
      } else {
        target = '/exams-report'
      }
    } else if (meta.kind === 'reveal_hw' && meta.homeworkId) {
      // Homework grades revealed
      if (isStaff) {
        target = '/homework-group-report'
        state = { homeworkId: meta.homeworkId }
      } else {
        target = '/homework-report'
      }
    } else if (meta.kind === 'password_reset_request') {
      if (isStaff) {
        target = '/control-panel?section=resets'
      }
    } else if (meta.kind === 'pending_student') {
      // New signup awaiting approval → open the accounts activation panel
      if (isStaff) {
        target = '/control-panel?section=accounts'
      }
    } else if (meta.kind === 'devtools_violation') {
      if (isStaff) {
        target = '/control-panel?section=violations'
        deleteOne(n.id) // DevTools violations are deleted once read to avoid UI clutter & DB requests
      }
    } else if (meta.kind === 'student_chat_message') {
      if (isStaff) {
        target = `/control-panel?section=chats&studentId=${meta.studentId}`
      }
    } else if (meta.kind === 'admin_chat_message') {
      if (!isStaff) {
        target = '/chat'
      }
    }

    if (target) {
      setOpen(false)
      navigate(target, { state })
    }
  }

  const sendNotification = async (e) => {
    e.preventDefault()
    if (!draft.title.trim() && !draft.message.trim()) return
    const scope = draft.grade === 'all' ? 'all' : 'grade'
    try {
      const row = await createNotification({
        title: draft.title.trim() || 'تنبيه',
        message: draft.message.trim(),
        level: draft.level,
        scope,
        targetGrade: scope === 'grade' ? draft.grade : null,
        createdBy: userId,
      })
      invalidateCache('notifications')
      setList((p) => [row, ...p])
      setDraft({ title: '', message: '', level: 'warning', grade: 'all' })
      setComposeOpen(false)
    } catch (err) {
      alert(err.message || 'تعذّر إرسال الإشعار')
    }
  }

  // For admin display: produce a readable "target" label per row.
  const targetLabel = (n) => {
    if (n.meta?.kind === 'student_chat_message') return 'المشرفين'
    if (n.scope === 'all') return 'كل المراحل'
    if (n.scope === 'grade') return GRADE_LABEL[n.target_grade] || n.target_grade
    if (n.scope === 'student') return 'طالب محدد'
    return ''
  }

  return (
    <div className="notif-root" ref={panelRef}>
      <button
        className="notif-bell"
        onClick={() => setOpen((v) => !v)}
        aria-label="الإشعارات"
        aria-expanded={open}
      >
        <i className="fas fa-bell"></i>
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="قائمة الإشعارات">
          <div className="notif-panel-head">
            <strong>الإشعارات</strong>
            <div className="notif-panel-actions">
              {isAdmin && (
                <button
                  type="button"
                  className="notif-compose-toggle"
                  onClick={() => setComposeOpen((v) => !v)}
                >
                  <i className={`fas ${composeOpen ? 'fa-times' : 'fa-plus'}`}></i>
                  {composeOpen ? 'إلغاء' : 'إضافة'}
                </button>
              )}
              {unreadCount > 0 && (
                <button type="button" className="notif-mark-read" onClick={markAllRead}>
                  تمت قراءة الكل
                </button>
              )}
            </div>
          </div>

          {isAdmin && composeOpen && (
            <form className="notif-compose" onSubmit={sendNotification}>
              <input
                type="text"
                placeholder="العنوان"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
              <textarea
                rows={2}
                placeholder="نص التنبيه للطلاب..."
                value={draft.message}
                onChange={(e) => setDraft({ ...draft, message: e.target.value })}
              />
              <div className="notif-compose-row">
                <select
                  value={draft.level}
                  onChange={(e) => setDraft({ ...draft, level: e.target.value })}
                  aria-label="مستوى الأهمية"
                >
                  <option value="info">معلومة</option>
                  <option value="warning">تحذير</option>
                  <option value="danger">هام</option>
                  <option value="success">إيجابي</option>
                </select>
                <select
                  value={draft.grade}
                  onChange={(e) => setDraft({ ...draft, grade: e.target.value })}
                  aria-label="المرحلة المستهدفة"
                >
                  <option value="all">كل المراحل</option>
                  {(gradesList || []).map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <button type="submit" className="notif-send">
                  <i className="fas fa-paper-plane"></i> إرسال
                </button>
              </div>
            </form>
          )}

          <div className="notif-list">
            {loading && (
              <div className="notif-empty">
                <i className="fas fa-spinner fa-spin"></i>
                <p>جارٍ التحميل...</p>
              </div>
            )}
            {!loading && sorted.length === 0 && (
              <div className="notif-empty">
                <i className="far fa-bell-slash"></i>
                <p>لا توجد إشعارات حتى الآن</p>
              </div>
            )}
            {sorted.map((n) => {
              const isRead = readIds.has(n.id)
              return (
                <div
                  key={n.id}
                  className={`notif-item notif-${n.level || 'info'} ${isRead ? '' : 'notif-unread'}`}
                  onClick={() => handleNotifClick(n)}
                >
                  <div className="notif-icon">
                    <i className={`fas ${
                      n.level === 'danger' ? 'fa-exclamation-circle' :
                      n.level === 'warning' ? 'fa-exclamation-triangle' :
                      n.level === 'success' ? 'fa-check-circle' :
                      'fa-info-circle'
                    }`}></i>
                  </div>
                  <div className="notif-body">
                    <div className="notif-title-row">
                      <span className="notif-title">{n.title}</span>
                      <span className="notif-time">{formatWhen(n.created_at)}</span>
                    </div>
                    {n.message && <div className="notif-message">{n.message}</div>}
                    {isStaff && (
                      <span className="notif-grade-tag">
                        <i className="fas fa-users"></i>
                        {targetLabel(n)}
                      </span>
                    )}
                    {!isStaff && n.meta && (n.meta.kind === 'reveal' || n.meta.kind === 'reveal_hw') && (
                      <div className="notif-nav-hint">
                        <i className="fas fa-external-link-alt"></i>
                        اضغط للعرض في التقارير
                      </div>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      className="notif-delete"
                      onClick={(e) => { e.stopPropagation(); deleteOne(n.id) }}
                      aria-label="حذف"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
