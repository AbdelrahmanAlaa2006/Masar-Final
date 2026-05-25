import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI, tokenAPI } from '@backend/authApi'
import { supabase } from '@backend/supabase'
import { useAuth } from '../contexts/AuthContext'
import './Login.css'

const translations = {
  ar: {
    login: 'تسجيل الدخول',
    phone: 'رقم الهاتف',
    name: 'الاسم الكامل',
    password: 'كلمة المرور',
    remember: 'تذكرني',
    forgot: 'نسيت كلمة المرور؟',
    'platform-title': 'منصة مسار التعليمية',
    'platform-description': 'منصة مسار تقدم لك تجربة تعليمية متكاملة تشمل الدروس التفاعلية، التمارين، والاختبارات الإلكترونية. تعلم أينما كنت، وبالطريقة التي تناسبك. انطلق الآن وابدأ مسارك نحو التميز والنجاح.',
  },
  en: {
    login: 'Login',
    phone: 'Phone Number',
    name: 'Full Name',
    password: 'Password',
    remember: 'Remember me',
    forgot: 'Forgot password?',
    'platform-title': 'Masar Educational Platform',
    'platform-description': 'The Masar platform offers you a comprehensive educational experience, including interactive lessons, exercises, and online tests. Learn wherever you are, in the way that suits you. Get started now and begin your path to excellence and success.',
  },
}

export default function Login() {
  const { login } = useAuth()
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en')
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const canvasRef = useRef(null)

  // Forgot Password modal state
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotPhone, setForgotPhone] = useState('')
  const [forgotName, setForgotName] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState('')
  const [forgotSuccess, setForgotSuccess] = useState(false)

  const t = translations[lang]

  useEffect(() => {
    if (theme === 'dark') document.body.classList.add('dark')
    else document.body.classList.remove('dark')
  }, [theme])

  useEffect(() => {
    const prevDir = document.documentElement.dir
    document.documentElement.dir = 'ltr'
    return () => {
      document.documentElement.dir = prevDir
    }
  }, [])

  // Remember Me: check local storage on mount
  useEffect(() => {
    const remembered = localStorage.getItem('masaar-remembered-phone')
    if (remembered) {
      setPhone(remembered)
      setRememberMe(true)
    }
  }, [])

  // Canvas animation with particles
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
        vx: 0,
        vy: 0,
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

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('theme', next)
  }

  const switchLang = newLang => {
    setLang(newLang)
    localStorage.setItem('lang', newLang)
    document.documentElement.lang = newLang
    document.documentElement.dir = 'ltr'
  }

  const ATTEMPT_KEY = 'masar-login-attempts'
  const MAX_FAILS = 5
  const WINDOW_MS = 60_000
  const LOCK_MS   = 60_000

  const getCooldownRemaining = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(ATTEMPT_KEY) || '{}')
      const lockedUntil = raw.lockedUntil || 0
      return Math.max(0, lockedUntil - Date.now())
    } catch { return 0 }
  }

  const recordFailure = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(ATTEMPT_KEY) || '{}')
      const now = Date.now()
      const fails = (raw.fails || []).filter((t) => now - t < WINDOW_MS)
      fails.push(now)
      const next = { fails }
      if (fails.length >= MAX_FAILS) next.lockedUntil = now + LOCK_MS
      localStorage.setItem(ATTEMPT_KEY, JSON.stringify(next))
    } catch {}
  }

  const clearFailures = () => {
    try { localStorage.removeItem(ATTEMPT_KEY) } catch {}
  }

  const handleLogin = async e => {
    e.preventDefault()
    setError('')

    const cooldown = getCooldownRemaining()
    if (cooldown > 0) {
      setError(lang === 'ar'
        ? `محاولات كثيرة. حاول مجدداً بعد ${Math.ceil(cooldown / 1000)} ثانية`
        : `Too many attempts. Try again in ${Math.ceil(cooldown / 1000)}s`)
      return
    }

    if (phone.trim().length < 8) {
      setError(lang === 'ar' ? 'رقم الهاتف غير صحيح' : 'Invalid phone number')
      return
    }

    if (password.length < 6) {
      setError(lang === 'ar' ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters')
      return
    }

    setLoading(true)

    try {
      const response = await authAPI.login(phone.trim(), password)

      if (!response.token || !response.user) {
        throw new Error('Invalid response from server')
      }

      // Remember Me: handle setting/removing local storage value
      if (rememberMe) {
        localStorage.setItem('masaar-remembered-phone', phone.trim())
      } else {
        localStorage.removeItem('masaar-remembered-phone')
      }

      clearFailures() 
      showSuccessMessage()

      setTimeout(() => {
        login(response.token, response.user)
        navigate('/')
      }, 1500)
    } catch (err) {
      console.error('Login error:', err)
      recordFailure() 
      const cd = getCooldownRemaining()
      if (cd > 0) {
        setError(lang === 'ar'
          ? `محاولات كثيرة. حاول مجدداً بعد ${Math.ceil(cd / 1000)} ثانية`
          : `Too many attempts. Try again in ${Math.ceil(cd / 1000)}s`)
      } else {
        setError(err.message || (lang === 'ar' ? 'فشل تسجيل الدخول' : 'Login failed'))
      }
      setLoading(false)
    }
  }

  const showSuccessMessage = () => {
    const title = lang === 'ar' ? 'تم تسجيل الدخول بنجاح' : 'Login Successful'
    const sub = lang === 'ar' ? 'جارٍ تحويلك إلى المنصة...' : 'Redirecting you to the platform...'
    const overlay = document.createElement('div')
    overlay.className = 'auth-overlay'
    overlay.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
    overlay.innerHTML = `
      <div class="auth-toast" role="status" aria-live="polite">
        <div class="auth-toast-check success">
          <svg viewBox="0 0 52 52" aria-hidden="true">
            <circle class="auth-toast-check-circle" cx="26" cy="26" r="23" fill="none" />
            <path class="auth-toast-check-path" fill="none" d="M14 27 l8 8 l16 -18" />
          </svg>
        </div>
        <div class="auth-toast-text">${title}</div>
        <div class="auth-toast-sub">${sub}</div>
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
      }, 320)
    }, 1400)
  }

  // Forgot password ticketing submit
  const handleForgotSubmit = async e => {
    e.preventDefault()
    setForgotError('')
    
    if (forgotPhone.trim().length < 8) {
      setForgotError(lang === 'ar' ? 'رقم الهاتف غير صحيح' : 'Invalid phone number')
      return
    }

    if (forgotName.trim().length < 3) {
      setForgotError(lang === 'ar' ? 'الاسم يجب أن يكون 3 أحرف على الأقل' : 'Name must be at least 3 characters')
      return
    }

    setForgotLoading(true)
    try {
      const { error: insertError } = await supabase
        .from('password_reset_requests')
        .insert({
          phone: forgotPhone.trim(),
          full_name: forgotName.trim(),
          status: 'pending'
        })

      if (insertError) throw insertError

      setForgotSuccess(true)
    } catch (err) {
      console.error('Password reset request error:', err)
      setForgotError(lang === 'ar' 
        ? 'حدث خطأ أثناء إرسال الطلب. يرجى المحاولة مرة أخرى.' 
        : 'An error occurred while sending your request. Please try again.')
    } finally {
      setForgotLoading(false)
    }
  }

  const [imgHover, setImgHover] = useState(false)
  const [activeImg, setActiveImg] = useState(0)

  const features = lang === 'ar' ? [
    { icon: 'fa-book-open', title: 'محاضرات تفاعلية', desc: 'شرح تفصيلي ومبسط لكافة أجزاء المنهج الدراسي باستخدام أحدث الوسائل البصرية.' },
    { icon: 'fa-video', title: 'فيديوهات بجودة عالية', desc: 'شرح مسجل للمحاضرات بجودة HD مع إمكانية التشغيل والاستئناف في أي وقت ومن أي جهاز.' },
    { icon: 'fa-file-signature', title: 'واجبات ومتابعة دورية', desc: 'حل الواجبات ورفع الإجابات إلكترونيًا للمعلم مع تصحيح وملاحظات تفصيلية لضمان الاستفادة.' },
    { icon: 'fa-file-alt', title: 'امتحانات إلكترونية', desc: 'اختبارات دورية لقياس المستوى بمختلف درجات الصعوبة وتوفير نتائج ونماذج إجابة فورية.' },
    { icon: 'fa-chart-line', title: 'تقارير أداء شاملة', desc: 'رصد دقيق لمستوى الطالب بالامتحانات والواجبات والمشاهدات، ومشاركتها مع ولي الأمر.' },
    { icon: 'fa-comments', title: 'دعم وتواصل مستمر', desc: 'تواصل وتفاعل مباشر مع المعلم لحل المشكلات والإجابة عن جميع الاستفسارات التعليمية.' },
  ] : [
    { icon: 'fa-book-open', title: 'Interactive Lectures', desc: 'Detailed and simplified explanations of the curriculum using modern visual aids.' },
    { icon: 'fa-video', title: 'High-Definition Videos', desc: 'Recorded lectures available in HD to play, pause, and resume anytime on any device.' },
    { icon: 'fa-file-signature', title: 'Periodic Homework', desc: 'Submit assignments online to receive detailed corrections and teacher feedback.' },
    { icon: 'fa-file-alt', title: 'Electronic Exams', desc: 'Periodic tests of varying difficulty levels with instant grading and detailed model answers.' },
    { icon: 'fa-chart-line', title: 'Performance Reports', desc: 'Comprehensive tracking of student progress in exams and lectures, visible to parents.' },
    { icon: 'fa-comments', title: 'Direct Student Support', desc: 'Engage with your teacher to ask questions, clarify concepts, and receive academic support.' },
  ]

  const steps = lang === 'ar' ? [
    { n: '1', title: 'احصل على حسابك', desc: 'تواصل مع المعلم أو إدارة المنصة لتسجيل حسابك واستلام بيانات الدخول الخاصة بك.' },
    { n: '2', title: 'سجّل دخولك', desc: 'أدخل رقم هاتفك وكلمة المرور الخاصة بك في النموذج بالأعلى للدخول الآمن إلى حسابك.' },
    { n: '3', title: 'انطلق في مسارك', desc: 'شاهد المحاضرات والملخصات، حلّ واجباتك واختباراتك، وتابع أداءك خطوة بخطوة للتميز.' },
  ] : [
    { n: '1', title: 'Get Your Account', desc: 'Contact your teacher or the platform administration to register and receive your credentials.' },
    { n: '2', title: 'Log In Securely', desc: 'Enter your assigned phone number and password in the login form above to access your portal.' },
    { n: '3', title: 'Start Your Path', desc: 'Watch video lectures, submit homework assignments, complete exams, and track your achievements.' },
  ]

  return (
    <div className="login-page-wrapper">
      <canvas ref={canvasRef} className="login-constellation" aria-hidden="true" />
      <nav className="login-navbar">
        <div className="navbar-brand">
          <img src="/images/logo.white.png" alt="Masar Logo" className="navbar-logo" />
          <span className="navbar-title">{lang === 'ar' ? 'منصة مسار' : 'Masar'}</span>
        </div>
        <div className="navbar-controls">
          <div className="lang-toggle">
            <button onClick={() => switchLang('en')} className={`lang-btn ${lang === 'en' ? 'active' : ''}`}>
              English
            </button>
            <button onClick={() => switchLang('ar')} className={`lang-btn ${lang === 'ar' ? 'active' : ''}`}>
              العربية
            </button>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="theme-toggle"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
          </button>
        </div>
      </nav>
      <div className="login-container">

        <div className="left-section fade-all">
          <div className="overlay"></div>
          <div className="left-section-content">
            <div className="login-intro">
              <h2 className="login-intro-title">{lang === 'ar' ? 'مرحباً بك في مسار' : 'Welcome Back!'}</h2>
              <p className="login-intro-sub">{lang === 'ar' ? 'سجل دخولك الآن لمتابعة رحلتك التعليمية' : 'Log in to continue your learning journey.'}</p>
            </div>
            
            <div className="login modern-login-box">

              <h2>{t.login}</h2>

              {error && <div className="error-message show">{error}</div>}

              <form onSubmit={handleLogin}>

                <div className="input-wrapper">
                  <i className="fas fa-phone"></i>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    required
                    placeholder={t.phone}
                    dir="ltr"
                  />
                </div>

                <div className="input-wrapper">
                  <i className="fas fa-lock"></i>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder={t.password}
                    minLength="6"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="toggle-password-btn"
                  >
                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>

                <div className="form-options">
                  <label className="switch">
                    <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                    <span className="slider"></span>
                  </label>
                  <span className="remember-text">{t.remember}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotPhone(phone)
                      setForgotName('')
                      setForgotError('')
                      setForgotSuccess(false)
                      setShowForgotModal(true)
                    }}
                    className="forgot-btn"
                  >
                    {t.forgot}
                  </button>
                </div>

                <button type="submit" className="modern-btn" disabled={loading}>
                  <span className="btn-text">{t.login}</span>
                  {loading && (
                    <span className="btn-loader">
                      <span className="spinner"></span>
                    </span>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="right-section fade-all">
          <div className="instructor-showcase">
            {/* Hero tagline */}
            <div className="hero-tagline">
              <h1 className="hero-tagline-title">
                {lang === 'ar' ? 'منصة مسار' : 'Masar'}
              </h1>
              <p className="hero-tagline-sub">
                {lang === 'ar'
                  ? 'ابدأ رحلتك التعليمية نحو التميز والنجاح'
                  : 'Start your learning journey towards excellence'}
              </p>
            </div>

            {/* Decorative background shapes */}
            <div className="instructor-decor">
              <div className="instructor-decor-block instructor-decor-block--1"></div>
              <div className="instructor-decor-block instructor-decor-block--2"></div>
              <div className="instructor-decor-block instructor-decor-block--3"></div>
            </div>

            {/* ── صورة المدرس وبادج الـ Instructor الأصلي ── */}
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', marginTop: '25px' }}>
              
              {/* صورة المدرس */}
              <div 
                className="instructor-image-hover" 
                style={{ position: 'relative', zIndex: 15, width: '460px', marginTop: '-65px' }}
                onMouseEnter={() => setImgHover(true)}
                onMouseLeave={() => setImgHover(false)}
              >
                <img 
                  src={imgHover ? '/images/me.png' : '/images/profile.png'}
                  alt="Instructor" 
                  style={{ width: '100%', height: 'auto', borderRadius: '20px', filter: 'drop-shadow(0 15px 25px rgba(0,0,0,0.3))', transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                  onError={(e) => e.target.style.display = 'none'}
                />
              </div>

             {/* بادج الـ Instructor مع النقطة الخضراء (Online Status) */}
              <div className="instructor-badge" style={{ 
                position: 'relative', 
                bottom: '30px', 
                zIndex: 20, 
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                background: 'var(--card-bg, #ffffff)',
                padding: '8px 24px',
                borderRadius: '30px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                border: '1px solid var(--card-border, rgba(255,255,255,0.1))'
              }}>
                
                {/* النقطة الخضراء (Online Indicator) */}
                <span style={{
                  width: '10px',
                  height: '10px',
                  backgroundColor: '#10b981', /* لون أخضر فاقع ومريح */
                  borderRadius: '50%',
                  boxShadow: '0 0 12px rgba(16, 185, 129, 0.8)' /* تأثير التوهج/النور */
                }}></span>
                
                <span style={{ 
                  fontWeight: '800', 
                  color: 'var(--card-text, #333)',
                  fontSize: '0.95rem',
                  letterSpacing: '0.3px'
                }}>
                  {lang === 'ar' ? 'مُعلّم المادة' : 'Instructor'}
                </span>

              </div>

            </div>
            {/* ──────────────────────────────────────────────── */}

            {/* Scroll down link */}
            <a
              href="#features"
              className="scroll-down-btn"
              onClick={(e) => {
                e.preventDefault()
                const target = document.getElementById('features')
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              style={{ marginTop: '10px' }} 
            >
              {lang === 'ar' ? 'اكتشف المزيد' : 'Discover More'}
              <i className="fas fa-arrow-down"></i>
            </a>
          </div>
        </div>
      </div>

      <section id="features" className="login-features">
        <div className="section-inner">
          <h2 className="section-heading">{lang === 'ar' ? 'لماذا منصة مسار؟' : 'Why Masar Platform?'}</h2>
          <p className="section-sub">{lang === 'ar' ? 'كل ما تحتاجه لرحلة تعليمية ناجحة في مكان واحد' : 'Everything you need for a successful learning journey in one place'}</p>
          <div className="features-grid">
            {features.map((f, i) => (
              <div key={i} className="feature-card">
                <div className="feature-icon"><i className={`fas ${f.icon}`}></i></div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="login-steps">
        <div className="section-inner">
          <h2 className="section-heading">{lang === 'ar' ? 'كيف تبدأ؟' : 'How to Get Started?'}</h2>
          <p className="section-sub">{lang === 'ar' ? 'ثلاث خطوات بسيطة تفصلك عن رحلتك التعليمية' : 'Three simple steps to begin your learning journey'}</p>
          <div className="steps-grid">
            {steps.map((s, i) => (
              <div key={i} className="step-card">
                <div className="step-number">{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="login-location">
        <div className="section-inner">
          <h2 className="section-heading">{lang === 'ar' ? 'موقعنا' : 'Find Us'}</h2>
          <p className="section-sub">{lang === 'ar' ? 'تعرف على مكاننا وتواصل معنا بسهولة' : 'Locate our center and reach us easily'}</p>

          <div className="location-grid">
            {/* Map embed */}
            <div className="location-map-wrapper">
              <iframe
                title="Masar Location"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3412.5!2d30.4272213!3d31.0379878!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzHCsDAyJzE2LjgiTiAzMMKwMjUnMzguMCJF!5e0!3m2!1sen!2seg!4v1700000000000"
                className="location-map"
                allowFullScreen=""
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              ></iframe>
            </div>

            {/* Contact info */}
            <div className="location-info">
              <div className="location-info-card">
                <div className="location-info-icon">
                  <i className="fas fa-map-marker-alt"></i>
                </div>
                <div>
                  <h4>{lang === 'ar' ? 'العنوان' : 'Address'}</h4>
                  <p>{lang === 'ar' ? 'دمنهور، البحيرة، مصر' : 'Damanhour, Beheira, Egypt'}</p>
                </div>
              </div>

              <div className="location-info-card">
                <div className="location-info-icon">
                  <i className="fas fa-phone-alt"></i>
                </div>
                <div>
                  <h4>{lang === 'ar' ? 'تواصل معنا' : 'Contact Us'}</h4>
                  <p dir="ltr">+20 XXX XXX XXXX</p>
                </div>
              </div>

              <div className="location-info-card">
                <div className="location-info-icon">
                  <i className="fas fa-clock"></i>
                </div>
                <div>
                  <h4>{lang === 'ar' ? 'ساعات العمل' : 'Working Hours'}</h4>
                  <p>{lang === 'ar' ? 'السبت – الخميس: ٩ ص – ٩ م' : 'Sat – Thu: 9 AM – 9 PM'}</p>
                </div>
              </div>

              <a
                href="https://maps.app.goo.gl/W93aUn2jgM7cb2tT7"
                target="_blank"
                rel="noopener noreferrer"
                className="location-directions-btn"
              >
                <i className="fas fa-directions"></i>
                {lang === 'ar' ? 'احصل على الاتجاهات' : 'Get Directions'}
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="login-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <img src="/images/logo.white.png" alt="Masar Logo" className="footer-logo" />
            <span className="footer-brand-name">{lang === 'ar' ? 'منصة مسار التعليمية' : 'Masar Educational Platform'}</span>
          </div>

          <div className="footer-socials">
            <a href="https://www.facebook.com" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Facebook">
              <i className="fab fa-facebook-f"></i>
            </a>
            <a href="https://wa.me/" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="WhatsApp">
              <i className="fab fa-whatsapp"></i>
            </a>
            <a href="https://www.instagram.com" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Instagram">
              <i className="fab fa-instagram"></i>
            </a>
            <a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="YouTube">
              <i className="fab fa-youtube"></i>
            </a>
            <a href="https://www.tiktok.com" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="TikTok">
              <i className="fab fa-tiktok"></i>
            </a>
          </div>

          <div className="footer-divider"></div>

          <p className="footer-copy">{lang === 'ar' ? '© 2026 منصة مسار التعليمية. جميع الحقوق محفوظة' : '© 2026 Masar Educational Platform. All rights reserved'}</p>
        </div>
      </footer>

      {showForgotModal && (
        <div className="auth-modal-overlay" onClick={() => setShowForgotModal(false)}>
          <div className="auth-modal" onClick={e => e.stopPropagation()} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <button className="auth-modal-close" onClick={() => setShowForgotModal(false)} aria-label="Close">
              <i className="fas fa-times"></i>
            </button>
            
            {!forgotSuccess ? (
              <>
                <div className="auth-modal-header">
                  <div className="auth-modal-icon">
                    <i className="fas fa-key"></i>
                  </div>
                  <h3>{lang === 'ar' ? 'استعادة كلمة المرور' : 'Reset Password'}</h3>
                  <p>
                    {lang === 'ar'
                      ? 'أدخل رقم هاتفك واسمك بالكامل لتقديم طلب استعادة كلمة المرور.'
                      : 'Enter your phone number and full name to request a password reset.'}
                  </p>
                </div>

                {forgotError && <div className="error-message show">{forgotError}</div>}

                <form onSubmit={handleForgotSubmit} className="auth-modal-form">
                  <div className="input-wrapper">
                    <i className="fas fa-phone"></i>
                    <input
                      type="tel"
                      value={forgotPhone}
                      onChange={e => setForgotPhone(e.target.value)}
                      required
                      placeholder={t.phone}
                      dir="ltr"
                    />
                  </div>

                  <div className="input-wrapper">
                    <i className="fas fa-user"></i>
                    <input
                      type="text"
                      value={forgotName}
                      onChange={e => setForgotName(e.target.value)}
                      required
                      placeholder={t.name}
                    />
                  </div>

                  <button type="submit" className="modern-btn" disabled={forgotLoading}>
                    <span className="btn-text">
                      {lang === 'ar' ? 'إرسال الطلب' : 'Submit Request'}
                    </span>
                    {forgotLoading && (
                      <span className="btn-loader">
                        <span className="spinner"></span>
                      </span>
                    )}
                  </button>
                </form>
              </>
            ) : (
              <div className="auth-modal-success">
                <div className="auth-modal-check">
                  <i className="fas fa-circle-check"></i>
                </div>
                <h3>{lang === 'ar' ? 'تم إرسال طلبك بنجاح!' : 'Request Sent Successfully!'}</h3>
                <p>
                  {lang === 'ar'
                    ? 'لقد تم تسجيل طلب استعادة كلمة المرور الخاص بك. يرجى مراجعة معلمك أو مسؤول المنصة لتأكيد هويتك واستلام كلمة المرور الجديدة الخاصة بك.'
                    : 'Your password reset request has been registered. Please check with your teacher or platform administrator to verify your identity and receive your new password.'}
                </p>
                <button className="modern-btn" onClick={() => setShowForgotModal(false)}>
                  {lang === 'ar' ? 'إغلاق' : 'Close'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
