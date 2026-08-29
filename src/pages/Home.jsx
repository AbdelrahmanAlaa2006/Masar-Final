import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HomeDashboard from '../components/HomeDashboard'
import { useSeasonalTheme } from '../seasonal/useSeasonalTheme'
import { useAuth } from '../contexts/AuthContext'
import { useTenant } from '../contexts/TenantContext'
import { DEFAULT_ANNOUNCEMENTS } from '../utils/announcements'
// getTenantThemeConfig is now dynamically resolved inside TenantContext
import './Home.css'
// PNG home cards replaced with theme-aware inline SVG icons. The
// old assets are kept on disk in case anywhere else still loads
// them, but the home page no longer imports them.
import {
  VideosIcon, LecturesIcon, ReportsIcon, ExamsIcon, PackagesIcon,
} from '../components/HomeCardIcons'

export default function Home() {
  const navigate = useNavigate()
  const { user, role, hasPermission } = useAuth()
  const { tenant, tenantSlug, isFeatureEnabled, themeConfig } = useTenant()
  const username = user?.name || ''
  const brandName = tenant?.name || 'مسار'
  const canvasRef = useRef(null)

  const handleHeroClick = (e) => {
    e.preventDefault()
    const target = document.getElementById('cards')
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const goAndTrack = (type, route) => {
    try {
      const existing = JSON.parse(localStorage.getItem('masar-recent') || '[]')
      const filtered = (Array.isArray(existing) ? existing : []).filter((r) => r.type !== type)
      const next = [{ type, route, at: new Date().toISOString() }, ...filtered].slice(0, 5)
      localStorage.setItem('masar-recent', JSON.stringify(next))
    } catch { }
    // Use React Router so we don't blow away the in-memory cache with a
    // full page reload. Previous code did `window.location.href = route`
    // which forced every navigation to re-fetch everything.
    navigate(route)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let width = 0, height = 0, raf = 0
    const mouse = { x: -9999, y: -9999, active: false }

    const COLORS = themeConfig?.particleColors || ['#7c3aed', '#a855f7', '#06b6d4', '#ec4899', '#f59e0b', '#10b981']
    const COUNT = Math.max(25, Math.floor((window.innerWidth * window.innerHeight) / 38000))
    const particles = []

    const resize = () => {
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }
    resize()

    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: 0,
        vy: 0,
        r: 1.0 + Math.random() * 1.5,
        opacity: 0.08 + Math.random() * 0.15,
        c: COLORS[Math.floor(Math.random() * COLORS.length)],
      })
    }

    const step = () => {
      ctx.clearRect(0, 0, width, height)

      for (const p of particles) {
        if (mouse.active) {
          const dx = mouse.x - p.x
          const dy = mouse.y - p.y
          const d2 = dx * dx + dy * dy
          if (d2 < 220 * 220) {
            const d = Math.sqrt(d2) || 1
            const f = (1 - d / 220) * 0.22
            p.vx += (dx / d) * f
            p.vy += (dy / d) * f
          }
        }

        p.vx *= 0.89
        p.vy *= 0.89
        p.x += p.vx
        p.y += p.vy

        if (p.x < 0) p.x = width
        if (p.x > width) p.x = 0
        if (p.y < 0) p.y = height
        if (p.y > height) p.y = 0
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < 130 * 130) {
            const alpha = 1 - Math.sqrt(d2) / 130
            const currentTheme = localStorage.getItem('theme') || 'light'
            ctx.strokeStyle = themeConfig?.getLineColor
              ? themeConfig.getLineColor(currentTheme, alpha * 0.12)
              : `rgba(168, 85, 247, ${alpha * 0.1})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      for (const p of particles) {
        ctx.globalAlpha = p.opacity || 0.5
        ctx.fillStyle = p.c
        ctx.shadowColor = p.c
        ctx.shadowBlur = 12
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1.0
      ctx.shadowBlur = 0

      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)

    const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true }
    const onLeave = () => { mouse.active = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseleave', onLeave)
    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('resize', resize)
    }
  }, [themeConfig])


  // Per-season greeting copy. Christmas deliberately stays null —
  // the user wants only the three islamic occasions to render a
  // banner on the home page.
  const seasonalTheme = useSeasonalTheme()
  const seasonalGreeting = seasonalTheme && {
    'ramadan': {
      arTitle: 'رمضان مبارك',
      arBlessing: 'مبارك عليكم الشهر الفضيل وسدد الله خطاكم',
      en: 'Ramadan Mubarak • A Month of Grace & Blessings',
      ariaLabel: 'تهنئة شهر رمضان',
    },
    'eid-fitr': {
      arTitle: 'عيد فطر مبارك',
      arBlessing: 'تقبل الله منا ومنكم صالح الأعمال وكل عام وأنتم بخير',
      en: 'Eid al-Fitr Mubarak • Joy & Renewal',
      ariaLabel: 'تهنئة عيد الفطر',
    },
    'eid-adha': {
      arTitle: 'عيد أضحى مبارك',
      arBlessing: 'أعاده الله عليكم وعلى أحبابكم باليُمن والبركات',
      en: 'Blessed Eid al-Adha • Sacrifice & Gratitude',
      ariaLabel: 'تهنئة عيد الأضحى',
    },
  }[seasonalTheme.id] || null


  // Per-tenant announcements strip: config.announcements overrides the
  // defaults; an explicit empty array or notifications=false hides the strip entirely.
  const marqueeItems = !isFeatureEnabled('notifications')
    ? []
    : (Array.isArray(tenant?.config?.announcements)
      ? tenant.config.announcements.filter(a => a && a.text)
      : DEFAULT_ANNOUNCEMENTS)

  // Format current live date in Arabic locale for the header badge
  const formattedDate = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  // Allowed actions for primary CTA strip
  const allowedExams = isFeatureEnabled('exams') && (role === 'admin' || hasPermission('exams'))
  const allowedVideos = isFeatureEnabled('videos') && (role === 'admin' || hasPermission('videos'))

  return (
    <main className="home">
      <canvas ref={canvasRef} className="home-constellation" aria-hidden="true" />

      {/* Seasonal greeting banner — Ramadan & Eids */}
      {seasonalGreeting && (
        <section
          className={`sb sb-${seasonalTheme.id}`}
          aria-label={seasonalGreeting.ariaLabel}
        >
          <span className="sb-pattern" aria-hidden="true" />
          <span className="sb-glow" aria-hidden="true" />
          <span className="sb-star" aria-hidden="true">
            <svg viewBox="0 0 80 80" width="52" height="52">
              <g transform="translate(40 40)" fill="currentColor" opacity="0.7">
                <polygon points="0,-28 6,-6 28,0 6,6 0,28 -6,6 -28,0 -6,-6" />
                <polygon points="0,-28 6,-6 28,0 6,6 0,28 -6,6 -28,0 -6,-6" transform="rotate(22.5)" opacity="0.45" />
                <circle r="5" opacity="0.9" />
              </g>
            </svg>
          </span>
          <div className="sb-text">
            <h3 className="sb-title">{seasonalGreeting.arTitle}</h3>
            <p className="sb-blessing">{seasonalGreeting.arBlessing}</p>
            <span className="sb-en">{seasonalGreeting.en}</span>
          </div>
        </section>
      )}

      {/* ──────────────────────────────────────────────────────────────
         1. INTEGRATED SAAS WORKSPACE HEADER
         ────────────────────────────────────────────────────────────── */}
      <header className="home-hero-bar">
        <div className="home-hero-bar-main">
          <div className="home-hero-bar-identity">
            <div className="home-hero-bar-meta">
              <span className="home-hero-role-chip">
                {role === 'super_admin' ? 'Super Admin' : (role === 'admin' || role === 'assistant' ? 'إدارة المنصة' : 'لوحة الطالب')}
              </span>
              <span className="home-hero-date-chip">
                <i className="far fa-calendar-alt" style={{ marginInlineEnd: 6 }} />
                {formattedDate}
              </span>
            </div>
            <h1 className="home-hero-bar-title">
              {(() => {
                const hour = new Date().getHours()
                const timeGreeting = (hour >= 5 && hour < 12) ? 'صباح الخير،' : 'مساء الخير،'
                return (
                  <>
                    <span className="home-hero-greeting-hi">{timeGreeting}</span>{' '}
                    <span className="home-hero-greeting-name">
                      {role === 'super_admin' ? 'مطورنا العزيز' : (username || (role === 'admin' || role === 'assistant' ? 'المشرف' : 'الطالب'))}
                    </span>
                  </>
                )
              })()}
              {role === 'super_admin' && (
                <i className="fas fa-laptop-code" style={{ marginInlineStart: '8px', color: 'var(--primary)', verticalAlign: 'middle' }} />
              )}
            </h1>
            <p className="home-hero-bar-sub">
              {role === 'super_admin'
                ? 'مرحباً بك في لوحة تحكم المطور والـ Super Admin 👋 نتمنى لك تجربة موفّقة!'
                : (role === 'admin' || role === 'assistant'
                  ? `تابع أداء الطلاب وأدِر امتحانات وفيديوهات منصة ${brandName} من مكان واحد.`
                  : 'أهلاً بك في منصتك التعليمية! استكمل واجباتك وفيديوهاتك بنجاح.')}
            </p>
          </div>

          <div className="home-hero-bar-actions">
            {role === 'student' && (
              <button className="home-hero-cta-btn home-cta-primary" onClick={(e) => handleHeroClick(e)}>
                <span>ابدأ التعلم الآن</span>
                <i className="fas fa-arrow-left" />
              </button>
            )}
            {role === 'super_admin' && (
              <button className="home-hero-cta-btn home-cta-primary" onClick={() => navigate('/control-panel')}>
                <span>لوحة التحكم والمطور</span>
                <i className="fas fa-sliders-h" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ──────────────────────────────────────────────────────────────
         2. INTEGRATED 2-COLUMN SAAS WORKSPACE GRID
         ────────────────────────────────────────────────────────────── */}
      <div className="home-workspace-container">
        <div className="home-workspace-grid">

          {/* MAIN PRIMARY COLUMN */}
          <div className="home-main-col">

            {/* Dashboard Overview Deck (Live Content Stats & Student Metrics) */}
            <div className="home-workspace-block">
              <div className="home-block-header">
                <h2 className="home-block-title">
                  <i className="fas fa-chart-pie" />
                  <span>نظرة عامة على البيانات</span>
                </h2>
              </div>
              <HomeDashboard role={role} />
            </div>

            {/* Core Operations Modules Grid */}
            {role !== 'super_admin' && (
              <div className="home-workspace-block" id="cards">
                <div className="home-block-header">
                  <h2 className="home-block-title">
                    <i className="fas fa-cubes" />
                    <span>الأقسام الرئيسية</span>
                    <span className="home-block-subtitle">— وصول سريع لكافة الوظائف والخدمات</span>
                  </h2>
                </div>

                <div className="home-modules-grid">
                  {(() => {
                    const visibleCards = [
                      { key: 'exams', route: '/exams', icon: <ExamsIcon />, label: 'الامتحانات', descAdmin: 'إدارة الامتحانات ومتابعة نتائج الطلاب', descStudent: 'اختبارات التدريب والامتحانات السابقة' },
                      { key: 'homework', route: '/homework', icon: <LecturesIcon />, label: 'الواجبات', descAdmin: 'نشر الواجبات ومتابعة تسليم الطلاب وتصحيحها', descStudent: 'حلّ واجباتك وارفع إجاباتك للمعلم' },
                      { key: 'reports', route: '/report', icon: <ReportsIcon />, label: 'التقارير', descAdmin: 'تقارير أداء الطلاب وتحليلات المجموعات', descStudent: 'عرض تقارير الأداء والتقدم' },
                      { key: 'videos', route: '/videos', icon: <VideosIcon />, label: 'الفيديوهات', descAdmin: 'رفع الفيديوهات وضبط صلاحيات المشاهدة', descStudent: 'مشاهدة الفيديوهات التعليمية' },
                      { key: 'payments', route: '/packages', icon: <PackagesIcon />, label: 'باقاتي الدراسية', descAdmin: 'تفعيل باقات الطلاب ومتابعة اشتراكاتهم', descStudent: 'فيديوهات، واجبات، وامتحانات باقاتك المشتركة' },
                    ].filter((c) => {
                      if (!isFeatureEnabled(c.key)) return false
                      if (role === 'assistant') {
                        if (c.key === 'reports') return hasPermission('reports')
                        return hasPermission(c.key)
                      }
                      return true
                    })

                    return visibleCards.map((card) => (
                      <div
                        key={card.key}
                        className="home-module-card"
                        onClick={() => goAndTrack(card.key, card.route)}
                      >
                        <div className="home-module-head">
                          <span className="home-module-icon">{card.icon}</span>
                          <span className="home-module-arrow">
                            <i className="fas fa-arrow-left" />
                          </span>
                        </div>
                        <h3 className="home-module-title">{card.label}</h3>
                        <p className="home-module-desc">
                          {role === 'admin' || role === 'assistant' ? card.descAdmin : card.descStudent}
                        </p>
                      </div>
                    ))
                  })()}
                </div>
              </div>
            )}

          </div>

          {/* SIDEBAR COLUMN */}
          <aside className="home-sidebar-col">

            {/* News & Announcements Widget */}
            {marqueeItems.length > 0 && (
              <div className="home-sidebar-widget home-announcements-widget">
                <div className="home-widget-header">
                  <h3 className="home-widget-title">
                    <i className="fas fa-bullhorn" />
                    <span>أحدث التنبيهات والإعلانات</span>
                  </h3>
                </div>
                <div className="home-announcements-list">
                  {marqueeItems.map((item, i) => (
                    <div className="home-announcement-card" key={i}>
                      <span className="home-announcement-icon">{item.icon}</span>
                      <div className="home-announcement-content">
                        <p className="home-announcement-text">{item.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Technical Support & Communication Card */}
            <div className="home-sidebar-widget home-support-widget">
              <div className="home-widget-header">
                <h3 className="home-widget-title">
                  <i className="fas fa-headset" />
                  <span>الدعم والتواصل</span>
                </h3>
              </div>
              <p className="home-support-desc">
                {role === 'super_admin' || role === 'admin' || role === 'assistant'
                  ? 'لأي ملاحظات تقنية أو استفسارات حول المنصة، يسعدنا تواصلك الدائم معنا.'
                  : 'لو بتواجهك أي مشكلة أو استفسار، متترددش تواصل مع فريق الدعم.'}
              </p>
              <div className="home-support-actions">
                <a href="mailto:hello@gitfekra.com" className="home-support-btn">
                  <i className="far fa-envelope" />
                  <span>تواصل عبر البريد</span>
                </a>
              </div>
            </div>

          </aside>

        </div>
      </div>
    </main>
  )
}
