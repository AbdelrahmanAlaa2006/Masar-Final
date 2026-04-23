import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI, tokenAPI } from '../services/api'
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
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en')
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')
  const [tab, setTab] = useState('login') // 'login' or 'register'
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const canvasRef = useRef(null)

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

  const handleLogin = async e => {
    e.preventDefault()
    setError('')

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
      
      console.log('Login response:', response)

      // Validate response has required fields
      if (!response.token || !response.user) {
        throw new Error('Invalid response from server')
      }
      
      // Store token and user data
      tokenAPI.setToken(response.token)
      localStorage.setItem('masar-user', JSON.stringify(response.user))
      
      console.log('Token stored:', response.token)
      console.log('User stored:', response.user)
      
      showSuccessMessage()

      // Navigate after showing success message
      setTimeout(() => {
        navigate('/')
      }, 1500)
    } catch (err) {
      console.error('Login error:', err)
      setError(err.message || (lang === 'ar' ? 'فشل تسجيل الدخول' : 'Login failed'))
      setLoading(false)
    }
  }

  const handleRegister = async e => {
    e.preventDefault()
    setError('')

    if (name.trim().length < 3) {
      setError(lang === 'ar' ? 'الاسم يجب أن يكون 3 أحرف على الأقل' : 'Name must be at least 3 characters')
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
      const response = await authAPI.register(name.trim(), phone.trim(), password)
      
      // Store token and user data
      tokenAPI.setToken(response.token)
      localStorage.setItem('masar-user', JSON.stringify(response.user))
      
      showSuccessMessage()

      setTimeout(() => {
        // Clear any success messages
        const messages = document.querySelectorAll('div[style*="position: fixed"]')
        messages.forEach(msg => {
          if (msg.innerHTML.includes('✔️')) {
            msg.remove()
          }
        })
        navigate('/')
      }, 1500)
    } catch (err) {
      setError(err.message || (lang === 'ar' ? 'فشل التسجيل' : 'Registration failed'))
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

  const [imgHover, setImgHover] = useState(false)

  const features = lang === 'ar' ? [
    { icon: 'fa-book-open', title: 'دروس تفاعلية', desc: 'محتوى تعليمي غني بالشرح والأمثلة لتثبيت المعلومة.' },
    { icon: 'fa-video', title: 'فيديوهات عالية الجودة', desc: 'شاهد الدروس في أي وقت ومن أي مكان بسهولة.' },
    { icon: 'fa-file-alt', title: 'اختبارات إلكترونية', desc: 'قس مستواك من خلال امتحانات متنوعة ونتائج فورية.' },
    { icon: 'fa-chart-line', title: 'تقارير الأداء', desc: 'تابع تقدمك خطوة بخطوة عبر تقارير تفصيلية.' },
    { icon: 'fa-users', title: 'مجتمع الطلاب', desc: 'تواصل مع زملائك وشارك الخبرات والأسئلة.' },
    { icon: 'fa-mobile-alt', title: 'متاح على كل الأجهزة', desc: 'تجربة سلسة على الهاتف والتابلت والحاسوب.' },
  ] : [
    { icon: 'fa-book-open', title: 'Interactive Lessons', desc: 'Rich educational content with clear explanations and examples.' },
    { icon: 'fa-video', title: 'High-Quality Videos', desc: 'Watch lessons anytime, anywhere with ease.' },
    { icon: 'fa-file-alt', title: 'Online Exams', desc: 'Test yourself with varied exams and get instant results.' },
    { icon: 'fa-chart-line', title: 'Progress Reports', desc: 'Track your growth step by step with detailed reports.' },
    { icon: 'fa-users', title: 'Student Community', desc: 'Connect with peers and share questions and experiences.' },
    { icon: 'fa-mobile-alt', title: 'Works on Any Device', desc: 'Seamless experience on phone, tablet, and desktop.' },
  ]

  const steps = lang === 'ar' ? [
    { n: '1', title: 'أنشئ حسابك', desc: 'سجّل بسهولة برقم هاتفك وكلمة مرور آمنة.' },
    { n: '2', title: 'اختر مسارك', desc: 'تصفح المراحل والدروس المتاحة واختر ما يناسبك.' },
    { n: '3', title: 'ابدأ التعلم', desc: 'شاهد الدروس، حلّ الاختبارات، وتابع تقدمك.' },
  ] : [
    { n: '1', title: 'Create Account', desc: 'Sign up easily with your phone number and a secure password.' },
    { n: '2', title: 'Choose Your Path', desc: 'Browse available levels and lessons that fit you.' },
    { n: '3', title: 'Start Learning', desc: 'Watch lessons, take exams, and track your progress.' },
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
        <div className="login modern-login-box">
          <div className="tabs-container">
            <button
              className={`tab-btn ${tab === 'login' ? 'active' : ''}`}
              onClick={() => { setTab('login'); setError(''); setPassword(''); setName(''); }}
            >
              {lang === 'ar' ? 'دخول' : 'Login'}
            </button>
            <button
              className={`tab-btn ${tab === 'register' ? 'active' : ''}`}
              onClick={() => { setTab('register'); setError(''); setPassword(''); setName(''); }}
            >
              {lang === 'ar' ? 'تسجيل' : 'Register'}
            </button>
          </div>

          <h2>{tab === 'login' ? t.login : (lang === 'ar' ? 'إنشاء حساب' : 'Create Account')}</h2>

          {error && <div className="error-message show">{error}</div>}

          <form onSubmit={tab === 'login' ? handleLogin : handleRegister}>
            {tab === 'register' && (
              <div className="input-wrapper">
                <i className="fas fa-user"></i>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder={t.name}
                  minLength="3"
                />
              </div>
            )}

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

            {tab === 'login' && (
              <div className="form-options">
                <label className="switch">
                  <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                  <span className="slider"></span>
                </label>
                <span className="remember-text">{t.remember}</span>
                <a href="#" className="forgot">
                  {t.forgot}
                </a>
              </div>
            )}

            <button type="submit" className="modern-btn" disabled={loading}>
              <span className="btn-text">{tab === 'login' ? t.login : (lang === 'ar' ? 'تسجيل' : 'Register')}</span>
              {loading && (
                <span className="btn-loader">
                  <span className="spinner"></span>
                </span>
              )}
            </button>
          </form>

          {tab === 'register' && (
            <div className="demo-hint">
              {lang === 'ar' ? 'أنشئ حسابًا جديدًا للبدء' : 'Create a new account to get started'}
            </div>
          )}
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

          {/* Instructor image with hover effect */}
          <div
            className={`instructor-img-wrapper ${imgHover ? 'is-hovered' : ''}`}
            onMouseEnter={() => setImgHover(true)}
            onMouseLeave={() => setImgHover(false)}
          >
            <img
              src="/images/profile.jpg"
              alt="Masaar Instructor"
              className="instructor-img"
              draggable="false"
            />

          </div>

          {/* Instructor name badge */}
          <div className="instructor-badge">
            <span className="instructor-badge-dot"></span>
            {lang === 'ar' ? 'المدرّس' : 'Instructor'}
          </div>

          {/* Scroll down link */}
          <a
            href="#features"
            className="scroll-down-btn"
            onClick={(e) => {
              e.preventDefault()
              const target = document.getElementById('features')
              if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
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
    </div>
  )
}
