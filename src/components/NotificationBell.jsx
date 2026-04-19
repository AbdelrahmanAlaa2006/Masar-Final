import React, { useEffect, useRef, useState } from 'react'
import {
  getCurrentUser,
  getInbox,
  getUnreadCount,
  markRead,
  markAllRead,
  deleteNotification,
  subscribe,
} from '../services/notifications'
import NotificationComposer from './NotificationComposer'
import './NotificationBell.css'

const KIND_META = {
  message: { icon: 'fa-envelope',     color: '#667eea', label: 'رسالة' },
  video:   { icon: 'fa-circle-play',  color: '#4facfe', label: 'فيديو' },
  lecture: { icon: 'fa-book',         color: '#43e97b', label: 'محاضرة' },
  exam:    { icon: 'fa-file-alt',     color: '#ed8936', label: 'امتحان' },
  grade:   { icon: 'fa-award',        color: '#f5576c', label: 'نتيجة' },
  system:  { icon: 'fa-circle-info',  color: '#94a3b8', label: 'النظام' },
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60)        return 'الآن'
  if (s < 3600)      return `منذ ${Math.floor(s / 60)} د`
  if (s < 86400)     return `منذ ${Math.floor(s / 3600)} س`
  if (s < 86400 * 7) return `منذ ${Math.floor(s / 86400)} يوم`
  return new Date(ts).toLocaleDateString('ar-EG')
}

function targetLabel(t) {
  if (!t) return ''
  if (t.type === 'all')   return 'الجميع'
  if (t.type === 'prep')  return 'مرحلة: ' + t.value
  if (t.type === 'group') return 'مجموعة: ' + t.value
  if (t.type === 'students') {
    const arr = Array.isArray(t.value) ? t.value : [t.value]
    return `${arr.length} طالب`
  }
  return ''
}

export default function NotificationBell() {
  const [user, setUser] = useState(getCurrentUser())
  const [open, setOpen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [pulse, setPulse] = useState(false)
  const wrapRef = useRef(null)
  const prevCountRef = useRef(0)

  // refresh handler
  const refresh = () => {
    const u = getCurrentUser()
    setUser(u)
    setItems(getInbox(u))
    const n = getUnreadCount(u)
    if (n > prevCountRef.current) {
      setPulse(true)
      setTimeout(() => setPulse(false), 1400)
    }
    prevCountRef.current = n
    setUnread(n)
  }

  // initial + subscribe
  useEffect(() => {
    refresh()
    const off = subscribe(refresh)
    return off
  }, [])

  // outside-click close
  useEffect(() => {
    const onDoc = (e) => {
      if (open && wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!user) return null

  const isAdmin = user.role === 'admin'
  const uidStr = String(user.id)

  const handleItemClick = (n) => {
    if (!n.readBy?.includes(uidStr)) markRead(n.id, user)
  }

  return (
    <>
      <div className="nb-wrap" ref={wrapRef}>
        <button
          className={`nb-btn ${pulse ? 'nb-pulse' : ''} ${open ? 'nb-active' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-label="الإشعارات"
          title="الإشعارات"
        >
          <i className="fas fa-bell"></i>
          {unread > 0 && (
            <span className="nb-badge">{unread > 99 ? '99+' : unread}</span>
          )}
        </button>

        {open && (
          <div className="nb-panel" role="dialog" aria-label="الإشعارات">
            <header className="nb-head">
              <div className="nb-head-title">
                <i className="fas fa-bell"></i>
                <span>الإشعارات</span>
                {unread > 0 && <span className="nb-head-count">{unread}</span>}
              </div>
              <div className="nb-head-actions">
                {unread > 0 && (
                  <button
                    className="nb-link"
                    onClick={() => markAllRead(user)}
                    title="تحديد الكل كمقروء"
                  >
                    <i className="fas fa-check-double"></i> الكل مقروء
                  </button>
                )}
              </div>
            </header>

            {isAdmin && (
              <button
                className="nb-compose-btn"
                onClick={() => { setComposerOpen(true); setOpen(false) }}
              >
                <i className="fas fa-paper-plane"></i>
                <span>إرسال إشعار جديد للطلاب</span>
                <i className="fas fa-chevron-left nb-compose-arrow"></i>
              </button>
            )}

            <ul className="nb-list">
              {items.length === 0 && (
                <li className="nb-empty">
                  <i className="fas fa-bell-slash"></i>
                  <span>لا توجد إشعارات بعد</span>
                </li>
              )}
              {items.map((n) => {
                const meta = KIND_META[n.kind] || KIND_META.system
                const isRead = n.readBy?.includes(uidStr)
                return (
                  <li
                    key={n.id}
                    className={`nb-item ${!isRead ? 'nb-unread' : ''}`}
                    onClick={() => handleItemClick(n)}
                  >
                    <div
                      className="nb-icon"
                      style={{ background: meta.color + '22', color: meta.color }}
                    >
                      <i className={`fas ${meta.icon}`}></i>
                    </div>
                    <div className="nb-body">
                      <div className="nb-row">
                        <strong className="nb-title">{n.title}</strong>
                        <span className="nb-time">{timeAgo(n.createdAt)}</span>
                      </div>
                      {n.body && <p className="nb-text">{n.body}</p>}
                      <div className="nb-meta">
                        <span className="nb-tag" style={{ color: meta.color }}>
                          <i className={`fas ${meta.icon}`}></i> {meta.label}
                        </span>
                        {isAdmin && (
                          <span className="nb-tag nb-tag-target">
                            <i className="fas fa-bullseye"></i> {targetLabel(n.target)}
                          </span>
                        )}
                        {n.fromName && (
                          <span className="nb-tag nb-tag-from">
                            <i className="fas fa-user"></i> {n.fromName}
                          </span>
                        )}
                      </div>
                    </div>
                    {isAdmin && (
                      <button
                        className="nb-del"
                        onClick={(e) => { e.stopPropagation(); deleteNotification(n.id) }}
                        title="حذف"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    )}
                    {!isRead && <span className="nb-dot" aria-hidden="true" />}
                  </li>
                )
              })}
            </ul>

            {items.length > 0 && (
              <footer className="nb-foot">
                <span>{items.length} إشعار</span>
              </footer>
            )}
          </div>
        )}
      </div>

      {composerOpen && (
        <NotificationComposer
          onClose={() => setComposerOpen(false)}
          onSent={() => { setComposerOpen(false); refresh() }}
        />
      )}
    </>
  )
}
