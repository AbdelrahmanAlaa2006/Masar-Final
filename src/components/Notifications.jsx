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

const GRADE_LABELS = {
  all: 'كل المراحل',
  'first-prep': 'الصف الأول الإعدادي',
  'second-prep': 'الصف الثاني الإعدادي',
  'third-prep': 'الصف الثالث الإعدادي',
}

export default function Notifications() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [list, setList] = useState([])
  const [readIds, setReadIds] = useState(new Set())
  const { user, role: userRole } = useAuth()
  const userId = user?.id || null
  const [composeOpen, setComposeOpen] = useState(false)
  const [draft, setDraft] = useState({ title: '', message: '', level: 'warning', grade: 'all' })
  const [loading, setLoading] = useState(false)
  const panelRef = useRef(null)

  // Fetch notifications + my read state
  const refresh = async (uid) => {
    setLoading(true)
    const cacheKey = userRole === 'admin' ? 'notifications:admin' : `notifications:student:${uid}`
    try {
      const [rows, reads] = await Promise.all([
        cached(cacheKey, NOTIF_TTL, () => listNotifications()),
        uid
          ? cached(`reads:${uid}`, NOTIF_TTL, () => listMyReadIds(uid))
          : Promise.resolve([]),
      ])
      setList(rows)
      setReadIds(new Set(reads))
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  // Pull whenever we know the user id, and again each time the panel opens
  // (so a freshly-revealed exam shows up without reload).
  useEffect(() => { if (userId !== null) refresh(userId) }, [userId])
  useEffect(() => { if (open && userId) refresh(userId) }, [open, userId])

  // Poll for new notifications every 30 seconds for live badge updates
  useEffect(() => {
    if (!userId) return
    const interval = setInterval(() => {
      refresh(userId)
    }, 30000)
    return () => clearInterval(interval)
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
    if (userRole === 'admin') {
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
        if (n.meta?.kind === 'password_reset_request' || n.meta?.kind === 'devtools_violation' || n.meta?.kind === 'student_chat_message') {
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

  const markAllRead = async () => {
    const ids = sorted.map((n) => n.id).filter((id) => !readIds.has(id))
    if (!ids.length || !userId) return
    const next = new Set(readIds); ids.forEach((id) => next.add(id))
    setReadIds(next)
    try {
      await apiMarkAllRead(ids, userId)
      invalidateCache(`reads:${userId}`)
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
    markOneRead(n.id)

    const meta = n.meta || {}
    let target = null
    let state = null

    if (meta.kind === 'reveal' && meta.examId) {
      // Exam grades revealed
      if (userRole === 'admin') {
        target = '/exams-group-report'
        state = { examId: meta.examId }
      } else {
        target = '/exams-report'
      }
    } else if (meta.kind === 'reveal_hw' && meta.homeworkId) {
      // Homework grades revealed
      if (userRole === 'admin') {
        target = '/homework-group-report'
        state = { homeworkId: meta.homeworkId }
      } else {
        target = '/homework-report'
      }
    } else if (meta.kind === 'password_reset_request') {
      if (userRole === 'admin') {
        target = '/control-panel'
        state = { section: 'resets' }
      }
    } else if (meta.kind === 'devtools_violation') {
      if (userRole === 'admin') {
        target = '/control-panel'
        state = { section: 'violations' }
      }
    } else if (meta.kind === 'student_chat_message') {
      if (userRole === 'admin') {
        target = '/control-panel'
        state = { section: 'chats', studentId: meta.studentId }
      }
    }

    if (target) {
      setOpen(false)
      navigate(target, { state })
    }
  }

  const deleteOne = async (id) => {
    const prev = list
    setList(list.filter((n) => n.id !== id))
    try {
      await deleteNotification(id)
      invalidateCache('notifications')
    } catch { setList(prev) }
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
    if (n.scope === 'all') return GRADE_LABELS.all
    if (n.scope === 'grade') return GRADE_LABELS[n.target_grade] || n.target_grade
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
              {userRole === 'admin' && (
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

          {userRole === 'admin' && composeOpen && (
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
                  <option value="first-prep">الصف الأول الإعدادي</option>
                  <option value="second-prep">الصف الثاني الإعدادي</option>
                  <option value="third-prep">الصف الثالث الإعدادي</option>
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
                    {userRole === 'admin' && (
                      <span className="notif-grade-tag">
                        <i className="fas fa-users"></i>
                        {targetLabel(n)}
                      </span>
                    )}
                    {userRole !== 'admin' && n.meta && (n.meta.kind === 'reveal' || n.meta.kind === 'reveal_hw') && (
                      <div className="notif-nav-hint">
                        <i className="fas fa-external-link-alt"></i>
                        اضغط للعرض في التقارير
                      </div>
                    )}
                  </div>
                  {userRole === 'admin' && (
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
