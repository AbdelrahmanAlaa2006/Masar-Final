import React, { useEffect, useRef, useState } from 'react'
import HomeDashboard from '../components/HomeDashboard'
import './Home.css'
import examsIcon from '../assets/exams.png'
import lecturesIcon from '../assets/lectures.png'
import reportsIcon from '../assets/reports.png'
import videosIcon from '../assets/videos.png'

export default function Home() {
  const [username, setUsername] = useState('')
  const [role, setRole] = useState(null)
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
    } catch {}
    window.location.href = route
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let width = 0, height = 0, raf = 0
    const mouse = { x: -9999, y: -9999, active: false }

    const COLORS = ['#7c3aed', '#a855f7', '#06b6d4', '#ec4899', '#f59e0b', '#10b981']
    const COUNT = Math.max(38, Math.floor((window.innerWidth * window.innerHeight) / 28000))
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
        vx: (Math.random() - 0.5) * 0.06,
        vy: (Math.random() - 0.5) * 0.06,
        r: 1.8 + Math.random() * 2.2,
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
          if (d2 < 200 * 200) {
            const d = Math.sqrt(d2) || 1
            const f = (1 - d / 200) * 0.12
            p.vx += (dx / d) * f
            p.vy += (dy / d) * f
          }
        }

        p.vx *= 0.9
        p.vy *= 0.9
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
            ctx.strokeStyle = `rgba(168, 85, 247, ${alpha * 0.35})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      for (const p of particles) {
        ctx.fillStyle = p.c
        ctx.shadowColor = p.c
        ctx.shadowBlur = 12
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
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
  }, [])

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('masar-user'))
      if (user && user.name) {
        setUsername(user.name)
      }
      setRole(user?.role || null)
    } catch (err) {
      console.error('Error reading user from localStorage:', err)
    }

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

  // Background particles are now rendered globally in App.jsx
  // (BackgroundParticles component) so every page shares the effect.

  const marqueeItems = [
    '🚀 قريبًا: دورات مكثفة للمرحلة الإعدادية',
    '📅 امتحانات شهرية جديدة كل أسبوع',
    '🎁 خصومات خاصة لأوائل المشتركين',
    '🎥 فيديوهات حصرية قادمة هذا الشهر',
    '💬 انضم لمجتمع الطلاب على الواتساب',
    '🏆 مسابقة شهرية بجوائز قيمة',
  ]

  return (
    <main className="home">
      <canvas ref={canvasRef} className="home-constellation" aria-hidden="true" />

      {/* Greeting banner */}
      <section className="home-greeting">
        <h2 className="home-greeting-title">
          أهلاً بك، <span className="home-greeting-name">{username || (role === 'admin' ? 'المشرف' : 'الطالب')}</span>
        </h2>
        <p className="home-greeting-sub">
          {role === 'admin'
            ? 'مرحبًا بك في لوحة تحكم المنصة التعليمية 👋 نتمنى لك تجربة موفّقة!'
            : 'نتمنى لك يومًا مليئًا بالتعلم والنجاح ✨'}
        </p>
      </section>

      {/* Role-aware dashboard */}
      <HomeDashboard role={role} />

      {/* Upcoming news marquee */}
      <div className="home-marquee" aria-label="أحدث الإعلانات" dir="ltr">
        <div className="home-marquee-track">
          <div className="home-marquee-set">
            {marqueeItems.map((t, i) => (
              <span className="home-marquee-item" key={i}>{t}</span>
            ))}
          </div>
          <div className="home-marquee-set" aria-hidden="true">
            {marqueeItems.map((t, i) => (
              <span className="home-marquee-item" key={i}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <section className="hero">
        {role === 'admin' ? (
          <>
            <h1>لوحة إدارة منصة مسار</h1>
            <p>
              تابع أداء الطلاب، أدِر المحاضرات والامتحانات والفيديوهات، وتحكم في كل ما يخص المنصة من مكان واحد.
            </p>
            <a href="#cards" className="hero-btn" onClick={handleHeroClick}>
              انتقل إلى الإدارة
            </a>
          </>
        ) : (
          <>
            <h1>طور مهاراتك مع منصة مسار</h1>
            <p>
              أكتشف مجموعة واسعة من الدورات التعليمية المصممة خصيصًا للطلاب، من البرمجة إلى التصميم الجرافيكي. كل ما
              تحتاجه لتطوير مهاراتك وتحقيق أهدافك المهنية.
            </p>
            <a href="#cards" className="hero-btn" onClick={handleHeroClick}>
              ابدأ التعلم الآن
            </a>
          </>
        )}
      </section>

      {/* Cards Section */}
      <div className="container">
        <div id="cards" className="cards-grid">
          <div className="card" onClick={() => goAndTrack('exams', '/exams')}>
            <img src={examsIcon} alt="Exams Icon" />
            <h2>الامتحانات</h2>
            <p>{role === 'admin' ? 'إدارة الامتحانات ومتابعة نتائج الطلاب' : 'اختبارات التدريب والامتحانات السابقة'}</p>
          </div>

          <div className="card" onClick={() => goAndTrack('lectures', '/lectures')}>
            <img src={lecturesIcon} alt="Lectures Icon" />
            <h2>المحاضرات</h2>
            <p>{role === 'admin' ? 'إضافة المحاضرات وتنظيمها حسب المراحل' : 'جميع ملاحظاتك ومحاضراتك الدراسية'}</p>
          </div>

          <div className="card" onClick={() => goAndTrack('report', '/report')}>
            <img src={reportsIcon} alt="Reports Icon" />
            <h2>التقارير</h2>
            <p>{role === 'admin' ? 'تقارير أداء الطلاب وتحليلات المجموعات' : 'عرض تقارير الأداء والتقدم'}</p>
          </div>

          <div className="card" onClick={() => goAndTrack('videos', '/videos')}>
            <img src={videosIcon} alt="Videos Icon" />
            <h2>الفيديوهات</h2>
            <p>{role === 'admin' ? 'رفع الفيديوهات وضبط صلاحيات المشاهدة' : 'مشاهدة الفيديوهات التعليمية'}</p>
          </div>
        </div>
      </div>

      {/* Greeting Section */}
      <section className="greeting-section">
        <h2>
          <span className="name-highlight">
            {role === 'admin'
              ? `شكرًا لجهودك يا ${username || 'المشرف'}`
              : `يومك سعيد يا ${username || 'الطالب'}`}
          </span>
        </h2>
        <p>
          {role === 'admin'
            ? 'لأي ملاحظات تقنية أو اقتراحات لتطوير المنصة، تواصل معنا عبر القنوات التالية'
            : 'لو بتواجهك أي مشاكل أو عندك أي استفسارات أو اقتراحات أو أي حاجة عايزنا نعرفها متترددش إنك تتواصل معانا'}
        </p>

        {/* Social Icons Section */}
        <div className="social-icons-container">
          <a href="https://github.com/yourUsername" target="_blank" rel="noopener noreferrer" className="social-icon">
            <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/github/github-original.svg" alt="GitHub" />
          </a>

          <a href="https://wa.me/201234567890" target="_blank" rel="noopener noreferrer" className="social-icon">
            <img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" alt="WhatsApp" />
          </a>

          <a href="https://www.facebook.com/yourPage" target="_blank" rel="noopener noreferrer" className="social-icon">
            <img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" alt="Facebook" />
          </a>

          <a href="https://www.linkedin.com/in/yourProfile" target="_blank" rel="noopener noreferrer" className="social-icon">
            <img src="https://cdn-icons-png.flaticon.com/512/145/145807.png" alt="LinkedIn" />
          </a>

          <a href="mailto:yourEmail@gmail.com" target="_blank" rel="noopener noreferrer" className="social-icon">
            <img src="https://cdn-icons-png.flaticon.com/512/732/732200.png" alt="Gmail" />
          </a>
        </div>
      </section>
    </main>
  )
}
