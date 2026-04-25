import React, { useEffect, useMemo, useRef, useState } from 'react'
import './Notifications.css'
import {
  listNotifications,
  listMyReadIds,
  markRead as apiMarkRead,
  markAllRead as apiMarkAllRead,
  createNotification,
  deleteNotification,
} from '@backend/notificationsApi'

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
  const [open, setOpen] = useState(false)
  const [list, setList] = useState([])
  const [readIds, setReadIds] = useState(new Set())
  const [userRole, setUserRole] = useState(null)
  const [userId, setUserId] = useState(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [draft, setDraft] = useState({ title: '', message: '', level: 'warning', grade: 'all' })
  const [loading, setLoading] = useState(false)
  const panelRef = useRef(null)

  // Load user once
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('masar-user'))
      setUserRole(u?.role || null)
      setUserId(u?.id || null)
    } catch {
      setUserRole(null)
    }
  }, [])

  // Fetch notifications + my read state
  const refresh = async (uid) => {
    setLoading(true)
    try {
      const [rows, reads] = await Promise.all([
        listNotifications(),
        uid ? listMyReadIds(uid) : Promise.resolve([]),
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

  const sorted = useMemo(
    () => [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [list]
  )
  const unreadCount = sorted.filter((n) => !readIds.has(n.id)).length

  const markAllRead = async () => {
    const ids = sorted.map((n) => n.id).filter((id) => !readIds.has(id))
    if (!ids.length || !userId) return
    const next = new Set(readIds); ids.forEach((id) => next.add(id))
    setReadIds(next)
    try { await apiMarkAllRead(ids, userId) } catch { /* ignore */ }
  }

  const markOneRead = async (id) => {
    if (readIds.has(id) || !userId) return
    const next = new Set(readIds); next.add(id)
    setReadIds(next)
    try { await apiMarkRead(id, userId) } catch { /* ignore */ }
  }

  const deleteOne = async (id) => {
    const prev = list
    setList(list.filter((n) => n.id !== id))
    try { await deleteNotification(id) }
    catch { setList(prev) }
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
      setList((p) => [row, ...p])
      setDraft({ title: '', message: '', level: 'warning', grade: 'all' })
      setComposeOpen(false)
    } catch (err) {
      alert(err.message || 'تعذّر إرسال الإشعار')
    }
  }

  // For admin display: produce a readable "target" label per row.
  const targetLabel = (n) => {
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
                  onClick={() => markOneRead(n.id)}
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
