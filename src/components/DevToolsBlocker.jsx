import React, { useState, useEffect } from 'react'
import { supabase } from '@backend/supabase'
import './DevToolsBlocker.css'

export default function DevToolsBlocker() {
  const [ip, setIp] = useState('جلب IP...')
  const [username, setUsername] = useState('غير مسجل الدخول')
  const [currentTime, setCurrentTime] = useState('')
  const [currentPage, setCurrentPage] = useState('index.php')
  const [logged, setLogged] = useState(false)

  useEffect(() => {
    // 1. Get current time in the user's preferred format: HH:MM:SS YYYY-MM-DD
    const now = new Date()
    const timeStr = now.toTimeString().split(' ')[0]
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    setCurrentTime(`${timeStr} ${year}-${month}-${day}`)

    // 2. Get current page route (react path)
    const path = window.location.pathname
    const pageName = path === '/' ? 'index.php' : path.substring(1)
    setCurrentPage(pageName)

    // 3. Resolve student session username
    let currentUsername = 'غير مسجل الدخول'
    try {
      const user = JSON.parse(sessionStorage.getItem('masar-user'))
      if (user && user.name) {
        currentUsername = user.name
        setUsername(user.name)
      }
    } catch (e) {
      console.error('Error reading user from session:', e)
    }

    // 4. Resolve IP address and log breach violation
    fetch('https://api.ipify.org?format=json')
      .then(res => res.json())
      .then(data => {
        const resolvedIp = data.ip || '127.0.0.1'
        setIp(resolvedIp)
        logViolation(resolvedIp, currentUsername, pageName)
      })
      .catch(err => {
        console.error('Error fetching IP:', err)
        setIp('127.0.0.1')
        logViolation('127.0.0.1', currentUsername, pageName)
      })
  }, [])

  const logViolation = async (resolvedIp, resolvedUsername, resolvedPage) => {
    if (logged) return
    setLogged(true)

    try {
      await supabase.from('devtools_violations').insert({
        username: resolvedUsername,
        ip_address: resolvedIp,
        page: resolvedPage,
        user_agent: navigator.userAgent
      })
    } catch (err) {
      console.error('Failed to log devtools violation to database:', err)
    }
  }

  const handleGoHome = () => {
    window.location.href = '/'
  }

  const handleGoBack = () => {
    if (document.referrer) {
      window.location.href = document.referrer
    } else {
      window.history.back()
    }
  }

  const handleSupport = () => {
    window.open('https://wa.me/201000000000', '_blank')
  }

  return (
    <div className="devtools-blocked-wrapper" dir="rtl">
      <div className="devtools-blocked-card">
        {/* Top Warning Shield */}
        <div className="devtools-warning-badge">
          <div className="warning-badge-circle">
            <svg viewBox="0 0 24 24" className="warning-svg" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>

        {/* Blocker Titles */}
        <h1 className="blocked-title">تم حظر الصفحة!</h1>
        <h2 className="blocked-subtitle">{username}</h2>

        <p className="blocked-description">
          عذرًا، تم تعطيل أدوات المطور لحماية المحتوى. يرجى العودة إلى الصفحة السابقة ومتابعة التصفح بشكل طبيعي.
        </p>

        {/* Interactive Info Log Box */}
        <div className="blocked-info-box">
          <div className="info-row">
            <div className="info-label">
              <i className="fas fa-user-circle info-icon"></i>
              <span>اسم المستخدم</span>
            </div>
            <div className="info-value">{username}</div>
          </div>

          <div className="info-row">
            <div className="info-label">
              <i className="fas fa-globe info-icon"></i>
              <span>عنوان IP</span>
            </div>
            <div className="info-value ltr-text">{ip}</div>
          </div>

          <div className="info-row">
            <div className="info-label">
              <i className="fas fa-clock info-icon"></i>
              <span>الوقت</span>
            </div>
            <div className="info-value ltr-text">{currentTime}</div>
          </div>

          <div className="info-row">
            <div className="info-label">
              <i className="fas fa-link info-icon"></i>
              <span>الصفحة</span>
            </div>
            <div className="info-value ltr-text">{currentPage}</div>
          </div>
        </div>

        {/* Buttons Action Grid */}
        <div className="blocked-actions-grid">
          <button className="blocked-btn btn-home" onClick={handleGoHome}>
            <i className="fas fa-home"></i>
            <span>الصفحة الرئيسية</span>
          </button>
          
          <button className="blocked-btn btn-back" onClick={handleGoBack}>
            <span>العودة للصفحة السابقة</span>
            <i className="fas fa-arrow-left"></i>
          </button>
        </div>

        <button className="blocked-btn btn-support" onClick={handleSupport}>
          <i className="fas fa-headset"></i>
          <span>تواصل مع الدعم الفني</span>
        </button>

        {/* Security System Notice */}
        <div className="blocked-notice-badge">
          <i className="fas fa-shield-alt notice-icon"></i>
          <span>تم تسجيل هذه المحاولة في سجل النظام لأغراض أمنية</span>
        </div>
      </div>
    </div>
  )
}
