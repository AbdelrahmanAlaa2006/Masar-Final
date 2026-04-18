import React, { useEffect, useRef, useState } from 'react'
import './Notifications.css'

const STORAGE_KEY = 'masar-notifications'
const readKey = (uid) => `masar-notifications-read-${uid || 'anon'}`

const loadList = () => {
  try {
    const arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
const saveList = (arr) => localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))

const loadRead = (uid) => {
  try {
    const arr = JSON.parse(localStorage.getItem(readKey(uid)) || '[]')
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}
const saveRead = (uid, set) => localStorage.setItem(readKey(uid), JSON.stringify([...set]))

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
  const [open, setOpen] = useState(false)
  const [list, setList] = useState(loadList)
  const [readIds, setReadIds] = useState(() => loadRead(getUid()))
  const [userRole, setUserRole] = useState(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [draft, setDraft] = useState({ title: '', message: '', level: 'warning' })
  const panelRef = useRef(null)

  function getUid() {
    try {
      const u = JSON.parse(localStorage.getItem('masar-user'))
      return u?.id || u?.name || 'anon'
    } catch {
      return 'anon'
    }
  }

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('masar-user'))
      setUserRole(u?.role || null)
    } catch {
      setUserRole(null)
    }
  }, [])

  // Sync across tabs / other components
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setList(loadList())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

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

  const sorted = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const unreadCount = sorted.filter((n) => !readIds.has(n.id)).length

  const markAllRead = () => {
    const next = new Set(readIds)
    sorted.forEach((n) => next.add(n.id))
    setReadIds(next)
    saveRead(getUid(), next)
  }

  const markOneRead = (id) => {
    if (readIds.has(id)) return
    const next = new Set(readIds)
    next.add(id)
    setReadIds(next)
    saveRead(getUid(), next)
  }

  const deleteOne = (id) => {
    const next = list.filter((n) => n.id !== id)
    setList(next)
    saveList(next)
  }

  const sendNotification = (e) => {
    e.preventDefault()
    if (!draft.title.trim() && !draft.message.trim()) return
    const entry = {
      id: 'n_' + Math.random().toString(36).slice(2, 10),
      title: draft.title.trim() || 'تنبيه',
      message: draft.message.trim(),
      level: draft.level,
      createdAt: new Date().toISOString(),
    }
    const next = [entry, ...list]
    setList(next)
    saveList(next)
    setDraft({ title: '', message: '', level: 'warning' })
    setComposeOpen(false)
  }

  return (
    <div className="notif-root" ref={panelRef}>
      <button
        className="notif-bell"
        onClick={() => { setOpen((v) => !v) }}
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
                >
                  <option value="info">معلومة</option>
                  <option value="warning">تحذير</option>
                  <option value="danger">هام</option>
                </select>
                <button type="submit" className="notif-send">
                  <i className="fas fa-paper-plane"></i> إرسال
                </button>
              </div>
            </form>
          )}

          <div className="notif-list">
            {sorted.length === 0 && (
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
                      'fa-info-circle'
                    }`}></i>
                  </div>
                  <div className="notif-body">
                    <div className="notif-title-row">
                      <span className="notif-title">{n.title}</span>
                      <span className="notif-time">{formatWhen(n.createdAt)}</span>
                    </div>
                    {n.message && <div className="notif-message">{n.message}</div>}
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
