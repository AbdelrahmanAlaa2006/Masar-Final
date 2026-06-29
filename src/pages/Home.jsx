import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HomeDashboard from '../components/HomeDashboard'
import { useSeasonalTheme } from '../seasonal/useSeasonalTheme'
import { useAuth } from '../contexts/AuthContext'
import { useTenant } from '../contexts/TenantContext'
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

    const COLORS = themeConfig.particleColors || ['#7c3aed', '#a855f7', '#06b6d4', '#ec4899', '#f59e0b', '#10b981']
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
        r: 1.0 + Math.random() * 2.0,
        opacity: 0.2 + Math.random() * 0.4,
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
            ctx.strokeStyle = themeConfig.getLineColor
              ? themeConfig.getLineColor(currentTheme, alpha)
              : `rgba(168, 85, 247, ${alpha * 0.35})`
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

  useEffect(() => {
    // Show cards on mount with animation
    const cards = document.querySelectorAll('.card')
    setTimeout(() => {
      cards.forEach((card, index) => {
        setTimeout(() => {
          card.style.transform = 'translateY(0)'
          card.style.opacity = '1'
        }, index * 150)
      })
    }, 500)

    // Scroll event listener for cards
    const handleScroll = () => {
      cards.forEach(card => {
        const cardTop = card.getBoundingClientRect().top
        const cardVisible = 150

        if (cardTop < window.innerHeight - cardVisible) {
          card.style.transform = 'translateY(0)'
          card.style.opacity = '1'
        }
      })
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])


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


  const marqueeItems = [
    { icon: '🚀', text: 'قريبًا: دورات مكثفة للمرحلة الإعدادية' },
    { icon: '📅', text: 'امتحانات شهرية جديدة كل أسبوع' },
    { icon: '🎁', text: 'خصومات خاصة لأوائل المشتركين' },
    { icon: '🎥', text: 'فيديوهات حصرية قادمة هذا الشهر' },
    { icon: '💬', text: 'انضم لمجتمع الطلاب على الواتساب' },
    { icon: '🏆', text: 'مسابقة شهرية بجوائز قيمة' },
  ]

  return (
    <main className="home">
      <canvas ref={canvasRef} className="home-constellation" aria-hidden="true" />

      {/* Seasonal greeting banner — only on home, only for Ramadan +
          the two Eids per the product spec. Christmas has decor but
          no banner since it isn't a religious occasion in this
          context. */}
      {seasonalGreeting && (
        <section
          className={`sb sb-${seasonalTheme.id}`}
          aria-label={seasonalGreeting.ariaLabel}
        >
          {/* Background pattern layer */}
          <span className="sb-pattern" aria-hidden="true" />
          {/* Radial glow */}
          <span className="sb-glow" aria-hidden="true" />

          {/* Decorative star */}
          <span className="sb-star" aria-hidden="true">
            <svg viewBox="0 0 80 80" width="52" height="52">
              <g transform="translate(40 40)" fill="currentColor" opacity="0.7">
                <polygon points="0,-28 6,-6 28,0 6,6 0,28 -6,6 -28,0 -6,-6" />
                <polygon points="0,-28 6,-6 28,0 6,6 0,28 -6,6 -28,0 -6,-6" transform="rotate(22.5)" opacity="0.45" />
                <circle r="5" opacity="0.9" />
              </g>
            </svg>
          </span>

          {/* Text column */}
          <div className="sb-text">
            <h3 className="sb-title">{seasonalGreeting.arTitle}</h3>
            <p className="sb-blessing">{seasonalGreeting.arBlessing}</p>
            <span className="sb-en">{seasonalGreeting.en}</span>
          </div>


        </section>
      )}

      {/* Greeting banner */}
      <section className="home-greeting animate-fade-up">
        <h2 className="home-greeting-title">
          <span className="home-greeting-hi">أهلاً بك،</span>{" "}
          <span className="home-greeting-name">
            {role === 'super_admin' ? 'مطورنا العزيز' : (username || (role === 'admin' || role === 'assistant' ? 'المشرف' : 'الطالب'))}
          </span>
          {role === 'super_admin' && (
            <i className="fas fa-laptop-code" style={{ marginInlineStart: '8px', color: '#06b6d4', verticalAlign: 'middle' }}></i>
          )}
        </h2>
        <p className="home-greeting-sub">
          {role === 'super_admin'
            ? 'مرحباً بك في لوحة تحكم المطور والـ Super Admin 👋 نتمنى لك تجربة موفّقة!'
            : (role === 'admin' || role === 'assistant'
              ? 'مرحبًا بك في لوحة تحكم المنصة التعليمية 👋 نتمنى لك تجربة موفّقة!'
              : 'نتمنى لك يومًا مليئًا بالتعلم والنجاح ✨')}
        </p>
        <div className="home-greeting-shimmer" />
      </section>

      <div className="home-divider" />

      {/* Role-aware dashboard */}
      <HomeDashboard role={role} />

      <div className="home-divider" />

      {/* Upcoming news marquee */}
      <div className="home-marquee" aria-label="أحدث الإعلانات" dir="ltr">
        <div className="home-marquee-track">
          <div className="home-marquee-set">
            {marqueeItems.map((item, i) => (
              <span className="home-marquee-item" key={i}>
                <span className="home-marquee-icon">{item.icon}</span>
                <span className="home-marquee-text">{item.text}</span>
              </span>
            ))}
          </div>
          <div className="home-marquee-set" aria-hidden="true">
            {marqueeItems.map((item, i) => (
              <span className="home-marquee-item" key={i}>
                <span className="home-marquee-icon">{item.icon}</span>
                <span className="home-marquee-text">{item.text}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="home-divider" />

      {/* Hero Section */}
      <section className="hero animate-fade-up" style={{ animationDelay: '0.1s' }}>
        <div className="hero-title-container">
          <h1>
            {role === 'super_admin'
              ? 'لوحة المطور والتحكم العام'
              : (role === 'admin' || role === 'assistant'
                ? `لوحة إدارة ${brandName}`
                : (tenant?.config?.branding?.hero_title || `طور مهاراتك مع منصة ${brandName}`))}
          </h1>
          <div className="hero-title-accent" />
        </div>
        <p>
          {role === 'super_admin'
            ? 'إدارة حسابات المدرسين، متابعة المنصات الفعالة، والتحكم الشامل وتصفير بيانات التجارب.'
            : (role === 'admin' || role === 'assistant'
              ? 'تابع أداء الطلاب، أدِر الواجبات والامتحانات والفيديوهات، وتحكم في كل ما يخص المنصة من مكان واحد.'
              : (tenant?.config?.branding?.hero_subtitle || 'أكتشف مجموعة واسعة من المحاضرات والامتحانات والفيديوهات التعليمية المصممة خصيصًا لمساعدتك على التفوق وتحقيق أهدافك الدراسية.'))}
        </p>
        <a
          href={role === 'super_admin' ? '/control-panel' : '#cards'}
          className="hero-btn"
          onClick={(e) => {
            if (role === 'super_admin') {
              e.preventDefault()
              navigate('/control-panel')
            } else {
              handleHeroClick(e)
            }
          }}
        >
          <span>
            {role === 'super_admin'
              ? 'انتقل للوحة التحكم'
              : (role === 'admin' || role === 'assistant' ? 'انتقل إلى الإدارة' : 'ابدأ التعلم الآن')}
          </span>
          <i className="fas fa-arrow-left hero-btn-arrow" />
        </a>
      </section>

      {role !== 'super_admin' && (
        <>
          <div className="home-divider" />

          {/* Cards Section */}
          <div className="container">
            <div id="cards" className="cards-grid">
              {(() => {
                const visibleCards = [
                  { key: 'exams', route: '/exams', icon: <ExamsIcon />, label: 'الامتحانات', descAdmin: 'إدارة الامتحانات ومتابعة نتائج الطلاب', descStudent: 'اختبارات التدريب والامتحانات السابقة' },
                  { key: 'homework', route: '/homework', icon: <LecturesIcon />, label: 'الواجبات', descAdmin: 'نشر الواجبات ومتابعة تسليم الطلاب وتصحيحها', descStudent: 'حلّ واجباتك وارفع إجاباتك للمعلم' },
                  { key: 'reports', route: '/report', icon: <ReportsIcon />, label: 'التقارير', descAdmin: 'تقارير أداء الطلاب وتحليلات المجموعات', descStudent: 'عرض تقارير الأداء والتقدم' },
                  { key: 'videos', route: '/videos', icon: <VideosIcon />, label: 'الفيديوهات', descAdmin: 'رفع الفيديوهات وضبط صلاحيات المشاهدة', descStudent: 'مشاهدة الفيديوهات التعليمية' },
                  { key: 'payments', route: '/packages', icon: <PackagesIcon />, label: 'باقاتي الدراسية', descAdmin: 'تفعيل باقات الطلاب ومتابعة اشتراكاتهم', descStudent: 'فيديوهات، واجبات، وامتحانات باقاتك المشتركة' }
                ].filter(c => {
                  if (!isFeatureEnabled(c.key)) return false
                  if (role === 'assistant') {
                    if (c.key === 'reports') return hasPermission('reports')
                    return hasPermission(c.key)
                  }
                  return true
                });

                return visibleCards.map((card) => {
                  const isCentered = card.key === 'payments' && visibleCards.length === 5;
                  return (
                    <div
                      key={card.key}
                      className={`card ${isCentered ? 'card-payments-centered' : ''}`}
                      onClick={() => goAndTrack(card.key, card.route)}
                    >
                      <span className="home-card-icon" aria-hidden="true">{card.icon}</span>
                      <h2>{card.label}</h2>
                      <div className="card-title-accent" />
                      <p>{role === 'admin' || role === 'assistant' ? card.descAdmin : card.descStudent}</p>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </>
      )}

      <div className="home-divider" />

      {/* Greeting Section */}
      <section className="greeting-section">
        <div className="greeting-confetti" aria-hidden="true">
          <span className="greeting-dot greeting-dot--1" />
          <span className="greeting-dot greeting-dot--2" />
          <span className="greeting-dot greeting-dot--3" />
          <span className="greeting-dot greeting-dot--4" />
          <span className="greeting-dot greeting-dot--5" />
          <span className="greeting-dot greeting-dot--6" />
          <span className="greeting-dot greeting-dot--7" />
          <span className="greeting-dot greeting-dot--8" />
        </div>
        <h2>
          <span className="name-highlight">
            {role === 'super_admin'
              ? 'شكرًا لجهودك يا مطورنا العزيز'
              : (role === 'admin' || role === 'assistant'
                ? `شكرًا لجهودك يا ${username || 'المشرف'}`
                : `يومك سعيد يا ${username || 'الطالب'}`)}
          </span>
          {role === 'super_admin' && (
            <i className="fas fa-laptop-code" style={{ marginInlineStart: '8px', color: '#06b6d4', verticalAlign: 'middle' }}></i>
          )}
        </h2>
        <div className="greeting-title-accent" />
        <p>
          {role === 'super_admin' || role === 'admin' || role === 'assistant'
            ? 'لأي ملاحظات تقنية أو اقتراحات لتطوير المنصة، تواصل معنا عبر القنوات التالية'
            : 'لو بتواجهك أي مشاكل أو عندك أي استفسارات أو اقتراحات أو أي حاجة عايزنا نعرفها متترددش إنك تتواصل معانا'}
        </p>
      </section>
    </main>
  )
}
