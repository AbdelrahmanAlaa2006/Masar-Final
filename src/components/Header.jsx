import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { authAPI } from '../services/api'
import './Header.css'

export default function Header() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  // Close menu when location changes
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (isDark) {
      document.body.classList.add('dark')
      document.getElementById('themeIcon').textContent = '☀️'
    } else {
      document.body.classList.remove('dark')
      document.getElementById('themeIcon').textContent = '🌙'
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuOpen && !e.target.closest('.hamburger-menu') && !e.target.closest('.nav-links')) {
        setMenuOpen(false)
      }
    }

    // Close menu on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape' && menuOpen) {
        setMenuOpen(false)
      }
    }

    if (menuOpen) {
      document.addEventListener('click', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuOpen])

  const toggleTheme = () => {
    setIsDark(!isDark)
  }

  const isActive = (path) => {
    return location.pathname === path ? 'active' : ''
  }

  const logoutUser = () => {
    // Call API logout
    authAPI.logout()
    
    // Create logout animation message
    let msg = document.createElement('div')
    msg.id = 'logout-message'
    msg.innerHTML = `
      <div class="logout-anim-icon">✔️</div>
      <div class="logout-anim-text">تم تسجيل الخروج بنجاح</div>
    `
    msg.style.position = 'fixed'
    msg.style.top = '50%'
    msg.style.left = '50%'
    msg.style.transform = 'translate(-50%, -50%) scale(0.8)'
    msg.style.background = 'linear-gradient(135deg, #667eea, #764ba2)'
    msg.style.color = '#fff'
    msg.style.padding = '40px 60px'
    msg.style.borderRadius = '24px'
    msg.style.fontSize = '1.7rem'
    msg.style.fontWeight = 'bold'
    msg.style.boxShadow = '0 12px 40px 0 rgba(102,126,234,0.25), 0 2px 8px 0 rgba(0,0,0,0.10)'
    msg.style.zIndex = '9999'
    msg.style.textAlign = 'center'
    msg.style.letterSpacing = '1px'
    msg.style.overflow = 'hidden'
    msg.style.opacity = '0'
    msg.style.transition = 'opacity 0.4s cubic-bezier(.4,2,.6,1), transform 0.5s cubic-bezier(.4,2,.6,1)'
    msg.classList.add('logout-anim-in')
    document.body.appendChild(msg)

    // Animate in
    setTimeout(() => {
      msg.style.opacity = '1'
      msg.style.transform = 'translate(-50%, -50%) scale(1)'
      msg.classList.add('logout-anim-in-active')
    }, 10)

    // Animate out and redirect to login
    setTimeout(() => {
      msg.classList.remove('logout-anim-in-active')
      msg.classList.add('logout-anim-out')
      msg.style.opacity = '0'
      msg.style.transform = 'translate(-50%, -50%) scale(0.8)'
      setTimeout(() => {
        document.body.removeChild(msg)
        navigate('/login')
      }, 400)
    }, 2000)
  }

  const closeMenu = () => setMenuOpen(false)

  return (
    <header className="header">
      <div className="left">
        <Link to="/" className="logo-text">مسار</Link>
        <img src="/images/logo.white.png" alt="شعار مسار" />
        
        {/* Hamburger Menu Button */}
        <button 
          className={`hamburger-menu ${menuOpen ? 'open' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
      
      <nav className={`nav-links ${menuOpen ? 'open' : ''}`}>
        <Link to="/" className={`nav-item ${isActive('/')}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10l9-7 9 7v10a2 2 0 01-2 2h-4a2 2 0 01-2-2v-4H9v4a2 2 0 01-2 2H5a2 2 0 01-2-2V10z" />
          </svg>
          الصفحة الرئيسية
        </Link>
        <Link to="/videos" className={`nav-item ${isActive('/videos')}`} onClick={closeMenu}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M4 6h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
          </svg>
          الفيديوهات المسجلة
        </Link>
        <Link to="/exams" className={`nav-item ${isActive('/exams')}`} onClick={closeMenu}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2a2 2 0 012-2h2a2 2 0 012 2v2m4 0h.01M6 17h.01M4 4h16v16H4V4z" />
          </svg>
          الامتحانات
        </Link>
        <Link to="/lectures" className={`nav-item ${isActive('/lectures')}`} onClick={closeMenu}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20h9M12 4h9M4 4h.01M4 20h.01M4 12h16" />
          </svg>
          المحاضرات
        </Link>
        <Link to="/report" className={`nav-item ${isActive('/report')}`} onClick={closeMenu}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6a2 2 0 012-2h2a2 2 0 012 2v6m4 0h.01M6 17h.01M4 4h16v16H4V4z" />
          </svg>
          تقرير الطالب
        </Link>
        <Link to="/control-panel" className={`nav-item ${isActive('/control-panel')}`} onClick={closeMenu}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          لوحة التحكم
        </Link>
      </nav>
      
      <div className="header-actions">
        <button className="logout-btn" onClick={logoutUser}>
          <i className="fas fa-sign-out-alt"></i>
          <span>تسجيل الخروج</span>
        </button>
        <button onClick={toggleTheme} className="theme-toggle">
          <span id="themeIcon">🌙</span>
        </button>
      </div>
    </header>
  )
}
