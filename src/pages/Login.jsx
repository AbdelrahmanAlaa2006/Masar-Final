import React, { useState, useEffect } from 'react'
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
    <div className="login-container">
      <div className="top-controls">
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
        <div className="right-content">
          <img src="/images/logo.white.png" alt="Masar Logo" />
          <h2>{t['platform-title']}</h2>
          <p>{t['platform-description']}</p>
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

    <footer className="login-footer">
      <p>{lang === 'ar' ? '© 2026 منصة مسار التعليمية. جميع الحقوق محفوظة' : '© 2026 Masar Educational Platform. All rights reserved'}</p>
    </footer>
    </div>
  )
}
