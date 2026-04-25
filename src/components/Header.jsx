import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { authAPI } from '@backend/authApi'
import Notifications from './Notifications'
import { useI18n } from '../i18n'
import masarLogo from '../assets/logo.white.png'
import './Header.css'

/* ──────────────────────────────────────────────────────────────
   Site header / navbar
   - Brand on the start (RTL: right) with mark + wordmark
   - Primary nav in the middle, label + icon, restrained active
     state (soft tinted pill, not a rainbow)
   - Theme + language toggles and a polished logout on the end
   - Mobile drawer for narrow viewports
   ────────────────────────────────────────────────────────────── */

const NAV_KEYS_BASE = [
  { to: '/',         key: 'header.home',     icon: 'fa-house' },
  { to: '/videos',   key: 'header.videos',   icon: 'fa-circle-play' },
  { to: '/exams',    key: 'header.exams',    icon: 'fa-file-pen' },
  { to: '/lectures', key: 'header.lectures', icon: 'fa-book-open' },
  { to: '/report',   key: 'header.reports',  icon: 'fa-chart-line' },
]
const ADMIN_KEYS = [
  { to: '/control-panel', key: 'header.controlPanel', icon: 'fa-sliders' },
]

export default function Header() {
  const { t, lang, setLang } = useI18n()
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [userRole, setUserRole] = useState(null)
  const [userName, setUserName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()
  const isRtl = lang === 'ar'

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('masar-user'))
      setUserRole(u?.role || null)
      setUserName(u?.name || '')
      setAvatarUrl(u?.avatar_url || null)
    } catch {
      setUserRole(null)
      setUserName('')
      setAvatarUrl(null)
    }
  }, [location.pathname])

  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  useEffect(() => {
    document.body.classList.toggle('dark', isDark)
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (drawerOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [drawerOpen])

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
    const overlay = document.createElement('div')
    overlay.className = 'auth-overlay'
    const successMsg = t('header.logoutSuccess')
    const byeMsg = t('header.logoutBye')
    overlay.innerHTML = `
      <div class="auth-toast" role="status" aria-live="polite">
        <div class="auth-toast-check">
          <svg viewBox="0 0 52 52" aria-hidden="true">
            <circle class="auth-toast-check-circle" cx="26" cy="26" r="23" fill="none" />
            <path class="auth-toast-check-path" fill="none" d="M14 27 l8 8 l16 -18" />
          </svg>
        </div>
        <div class="auth-toast-text">${successMsg}</div>
        <div class="auth-toast-sub">${byeMsg}</div>
        <div class="auth-toast-bar"><span></span></div>
      </div>
    `
    document.body.appendChild(overlay)
    requestAnimationFrame(() => overlay.classList.add('open'))
    setTimeout(() => {
      overlay.classList.remove('open')
      overlay.classList.add('closing')
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
        navigate('/login')
      }, 320)
    }, 1600)
  }

  const items = userRole === 'admin'
    ? [...NAV_KEYS_BASE, ...ADMIN_KEYS]
    : NAV_KEYS_BASE

  const initial = (userName || 'U').trim().charAt(0).toUpperCase()
  const backIcon = isRtl ? 'fa-arrow-right' : 'fa-arrow-left'
  const drawerArrow = isRtl ? 'fa-chevron-left' : 'fa-chevron-right'

  return (
    <>
      <header className={`mh ${scrolled ? 'mh--scrolled' : ''}`} dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="mh__inner">
          <Link to="/" className="mh__brand" aria-label={t('header.brandName')}>
            <span className="mh__mark">
              <img src={masarLogo} alt="" className="mh__mark-img" />
            </span>
            <span className="mh__wordmark">
              <span className="mh__brand-name">{t('header.brandName')}</span>
              <span className="mh__brand-tag">{t('header.brandTag')}</span>
            </span>
          </Link>

          <nav className="mh__nav" aria-label={t('header.menu')}>
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`mh__link ${isActive(item.to) ? 'is-active' : ''}`}
              >
                <i className={`fas ${item.icon}`} aria-hidden="true"></i>
                <span>{t(item.key)}</span>
              </Link>
            ))}
          </nav>

          <div className="mh__actions">
            {location.pathname !== '/' && location.pathname !== '/home' && (
              <button
                type="button"
                className="mh__icon-btn mh__back"
                onClick={() => navigate(-1)}
                aria-label={t('header.backNav')}
                title={t('header.backNav')}
              >
                <i className={`fas ${backIcon}`}></i>
              </button>
            )}
            <Notifications />
            {/* Bilingual toggle removed from dashboard by user request */}
            <button
              type="button"
              className="mh__icon-btn"
              onClick={() => setIsDark((v) => !v)}
              aria-label={isDark ? t('header.lightMode') : t('header.darkMode')}
              title={isDark ? t('header.lightMode') : t('header.darkMode')}
            >
              <span>{isDark ? '☀️' : '🌙'}</span>
            </button>

            {userName && (
              <div className="mh__user" title={userName} onClick={() => navigate('/profile')} style={{ cursor: 'pointer' }}>
                <span className="mh__avatar">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="mh__avatar-img" />
                  ) : initial}
                </span>
                <span className="mh__user-meta">
                  <span className="mh__user-hi">{t('header.welcome')}</span>
                  <span className="mh__user-name" dir="ltr">{userName}</span>
                </span>
              </div>
            )}

            <button
              type="button"
              className="mh__logout"
              onClick={handleLogout}
              aria-label={t('header.logoutFull')}
            >
              <i className="fas fa-arrow-right-from-bracket"></i>
              <span>{t('header.logout')}</span>
            </button>

            <button
              type="button"
              className={`mh__burger ${drawerOpen ? 'is-open' : ''}`}
              onClick={() => setDrawerOpen((v) => !v)}
              aria-label={t('header.menu')}
              aria-expanded={drawerOpen}
            >
              <span></span><span></span><span></span>
            </button>
          </div>
        </div>
      </header>

      <div
        className={`mh-drawer ${drawerOpen ? 'is-open' : ''}`}
        onClick={() => setDrawerOpen(false)}
      >
        <aside
          className="mh-drawer__panel"
          dir={isRtl ? 'rtl' : 'ltr'}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="mh-drawer__head">
            <div className="mh__brand">
              <span className="mh__mark"><span className="mh__mark-letter">{isRtl ? 'م' : 'M'}</span></span>
              <span className="mh__wordmark">
                <span className="mh__brand-name">{t('header.brandName')}</span>
                <span className="mh__brand-tag">{t('header.brandTag')}</span>
              </span>
            </div>
            <button
              type="button"
              className="mh__icon-btn"
              onClick={() => setDrawerOpen(false)}
              aria-label={t('common.close')}
            >
              <i className="fas fa-xmark"></i>
            </button>
          </header>

          {userName && (
            <div className="mh-drawer__user" onClick={() => { setDrawerOpen(false); navigate('/profile') }} style={{ cursor: 'pointer' }}>
              <span className="mh__avatar mh__avatar--lg">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="mh__avatar-img" />
                ) : initial}
              </span>
              <div>
                <div className="mh-drawer__user-name">{userName}</div>
                <div className="mh-drawer__user-role">
                  {userRole === 'admin' ? t('common.admin') : t('common.student')}
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
                <span>{t(item.key)}</span>
                <i className={`fas ${drawerArrow} mh-drawer__link-arrow`}></i>
              </Link>
            ))}
          </nav>

          <footer className="mh-drawer__foot">
            <button className="mh__logout mh__logout--full" onClick={handleLogout}>
              <i className="fas fa-arrow-right-from-bracket"></i>
              <span>{t('header.logoutFull')}</span>
            </button>
          </footer>
        </aside>
      </div>
    </>
  )
}
