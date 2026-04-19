import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { authAPI } from '../services/api'
import masarLogo from '../assets/logo.white.png'
import './Header.css'

/* ──────────────────────────────────────────────────────────────
   Site header / navbar
   - Brand on the start (RTL: right) with mark + wordmark
   - Primary nav in the middle, label + icon, restrained active
     state (soft tinted pill, not a rainbow)
   - Theme toggle and a polished logout on the end
   - Mobile drawer for narrow viewports
   ────────────────────────────────────────────────────────────── */

const NAV_ITEMS_BASE = [
  { to: '/',         label: 'الرئيسية',   icon: 'fa-house' },
  { to: '/videos',   label: 'الفيديوهات', icon: 'fa-circle-play' },
  { to: '/exams',    label: 'الامتحانات', icon: 'fa-file-pen' },
  { to: '/lectures', label: 'المحاضرات',  icon: 'fa-book-open' },
]
const ADMIN_ITEMS = [
  { to: '/report',        label: 'التقارير',   icon: 'fa-chart-line' },
  { to: '/control-panel', label: 'لوحة التحكم', icon: 'fa-sliders' },
]

export default function Header() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [userRole, setUserRole] = useState(null)
  const [userName, setUserName] = useState('')
  const navigate = useNavigate()
  const location = useLocation()

  // Read user
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('masar-user'))
      setUserRole(u?.role || null)
      setUserName(u?.name || '')
    } catch {
      setUserRole(null)
      setUserName('')
    }
  }, [location.pathname])

  // Close drawer on nav
  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  // Theme toggle effect
  useEffect(() => {
    document.body.classList.toggle('dark', isDark)
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  // Subtle elevation when scrolled
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Lock body scroll while mobile drawer is open
  useEffect(() => {
    if (drawerOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [drawerOpen])

  // Esc closes drawer
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false) }
    if (drawerOpen) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/' || location.pathname === '/home'
    return location.pathname === path
  }

  const handleLogout = () => {
    authAPI.logout()
    navigate('/login')
  }

  const items = userRole === 'admin'
    ? [...NAV_ITEMS_BASE, ...ADMIN_ITEMS]
    : NAV_ITEMS_BASE

  const initial = (userName || 'U').trim().charAt(0).toUpperCase()

  return (
    <>
      <header className={`mh ${scrolled ? 'mh--scrolled' : ''}`} dir="rtl">
        <div className="mh__inner">
          {/* ─── Brand ─── */}
          <Link to="/" className="mh__brand" aria-label="مسار - الصفحة الرئيسية">
            <span className="mh__mark">
              <img src={masarLogo} alt="" className="mh__mark-img" />
            </span>
            <span className="mh__wordmark">
              <span className="mh__brand-name">مسار</span>
              <span className="mh__brand-tag">منصة تعليمية</span>
            </span>
          </Link>

          {/* ─── Primary nav (desktop) ─── */}
          <nav className="mh__nav" aria-label="القائمة الرئيسية">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`mh__link ${isActive(item.to) ? 'is-active' : ''}`}
              >
                <i className={`fas ${item.icon}`} aria-hidden="true"></i>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* ─── Actions ─── */}
          <div className="mh__actions">
            <button
              type="button"
              className="mh__icon-btn"
              onClick={() => setIsDark((v) => !v)}
              aria-label={isDark ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
              title={isDark ? 'الوضع الفاتح' : 'الوضع الداكن'}
            >
              <i className={`fas ${isDark ? 'fa-sun' : 'fa-moon'}`}></i>
            </button>

            {userName && (
              <div className="mh__user" title={userName}>
                <span className="mh__avatar">{initial}</span>
                <span className="mh__user-meta">
                  <span className="mh__user-hi">مرحبًا</span>
                  <span className="mh__user-name">{userName}</span>
                </span>
              </div>
            )}

            <button
              type="button"
              className="mh__logout"
              onClick={handleLogout}
              aria-label="تسجيل الخروج"
            >
              <i className="fas fa-arrow-right-from-bracket"></i>
              <span>خروج</span>
            </button>

            <button
              type="button"
              className={`mh__burger ${drawerOpen ? 'is-open' : ''}`}
              onClick={() => setDrawerOpen((v) => !v)}
              aria-label="القائمة"
              aria-expanded={drawerOpen}
            >
              <span></span><span></span><span></span>
            </button>
          </div>
        </div>
      </header>

      {/* ─── Mobile drawer ─── */}
      <div
        className={`mh-drawer ${drawerOpen ? 'is-open' : ''}`}
        onClick={() => setDrawerOpen(false)}
      >
        <aside
          className="mh-drawer__panel"
          dir="rtl"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="mh-drawer__head">
            <div className="mh__brand">
              <span className="mh__mark"><span className="mh__mark-letter">م</span></span>
              <span className="mh__wordmark">
                <span className="mh__brand-name">مسار</span>
                <span className="mh__brand-tag">منصة تعليمية</span>
              </span>
            </div>
            <button
              type="button"
              className="mh__icon-btn"
              onClick={() => setDrawerOpen(false)}
              aria-label="إغلاق"
            >
              <i className="fas fa-xmark"></i>
            </button>
          </header>

          {userName && (
            <div className="mh-drawer__user">
              <span className="mh__avatar mh__avatar--lg">{initial}</span>
              <div>
                <div className="mh-drawer__user-name">{userName}</div>
                <div className="mh-drawer__user-role">
                  {userRole === 'admin' ? 'مشرف' : 'طالب'}
                </div>
              </div>
            </div>
          )}

          <nav className="mh-drawer__nav">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`mh-drawer__link ${isActive(item.to) ? 'is-active' : ''}`}
              >
                <i className={`fas ${item.icon}`} aria-hidden="true"></i>
                <span>{item.label}</span>
                <i className="fas fa-chevron-left mh-drawer__link-arrow"></i>
              </Link>
            ))}
          </nav>

          <footer className="mh-drawer__foot">
            <button className="mh__logout mh__logout--full" onClick={handleLogout}>
              <i className="fas fa-arrow-right-from-bracket"></i>
              <span>تسجيل الخروج</span>
            </button>
          </footer>
        </aside>
      </div>
    </>
  )
}
