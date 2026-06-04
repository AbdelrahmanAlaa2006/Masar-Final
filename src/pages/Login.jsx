// Login.jsx — MERGED VERSION
// Combines the new "أ. عبدالرحمن علاء" landing design (top hero) with
// your existing Masar auth logic (login, register, forgot password,
// rate limiting, AuthContext, TenantContext, marketing sections, footer).
//
// SETUP:
//   1. Replace your old src/.../Login.jsx with this file
//   2. Put NewLogin.css next to it (already imported below)
//   3. Drop teacher.png and teacher-hover.png in /public
//   4. Make sure your existing Login.css is still imported (it powers
//      the form fields, marketing sections, footer, modals).

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI, tokenAPI } from '@backend/authApi'
import { supabase } from '@backend/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTenant } from '../contexts/TenantContext'
import './Login.css'        // your existing styles (forms, marketing, footer, forgot modal)
import './Login.css'     // NEW styles (navbar, hero, auth-modal, teacher portrait)

/* ─────────── translations ─────────── */
const translations = {
  ar: {
    login: 'تسجيل الدخول',
    phone: 'رقم الهاتف',
    name: 'الاسم الكامل',
    password: 'كلمة المرور',
    remember: 'تذكرني',
    forgot: 'نسيت كلمة المرور؟',
    register: 'إنشاء حساب جديد',
    grade: 'المرحلة الدراسية',
    'grade-first': 'الصف الأول الإعدادي',
    'grade-second': 'الصف الثاني الإعدادي',
    'grade-third': 'الصف الثالث الإعدادي',
    'grade-sec-1': 'الصف الأول الثانوي',
    'grade-sec-2': 'الصف الثاني الثانوي',
    'grade-sec-3': 'الصف الثالث الثانوي',
    'confirm-password': 'تأكيد كلمة المرور',
    'have-account': 'لديك حساب بالفعل؟',
    'no-account': 'ليس لديك حساب؟',
    'register-btn': 'إنشاء الحساب',
    'login-btn-link': 'سجل دخولك',
    'register-btn-link': 'سجل الآن',
    'student-name': 'الاسم الكامل للطالب',
    'select-grade': 'اختر المرحلة الدراسية',
    // NEW design
    nav_about: 'عن المعلم',
    nav_signin: 'تسجيل الدخول',
    nav_signup: 'إنشاء حساب',
    hero_badge: 'منصة الأستاذ عبدالرحمن علاء',
    hero_title_a: 'اللغة العربية',
    hero_title_b: 'بطعم جديد',
    hero_sub: 'منصة تعليمية متخصّصة في اللغة العربية — سجّل حسابك، يتم اعتماده، وابدأ رحلتك مع شرح يخلّيك تفهم وتحب اللغة.',
    cta_primary: 'أنشئ حسابك الآن',
    cta_secondary: 'لديك حساب؟ ادخل',
    brand_short: 'أ. عبدالرحمن علاء',
    brand_long: 'منصة الأستاذ عبدالرحمن علاء',
  },
  en: {
    login: 'Login', phone: 'Phone Number', name: 'Full Name', password: 'Password',
    remember: 'Remember me', forgot: 'Forgot password?',
    register: 'Create New Account', grade: 'Academic Grade',
    'grade-first': 'First Preparatory', 'grade-second': 'Second Preparatory', 'grade-third': 'Third Preparatory',
    'grade-sec-1': 'First Secondary', 'grade-sec-2': 'Second Secondary', 'grade-sec-3': 'Third Secondary',
    'confirm-password': 'Confirm Password',
    'have-account': 'Already have an account?', 'no-account': "Don't have an account?",
    'register-btn': 'Create Account', 'login-btn-link': 'Log In', 'register-btn-link': 'Register Now',
    'student-name': 'Full Student Name', 'select-grade': 'Select Academic Grade',
    nav_about: 'About', nav_signin: 'Sign in', nav_signup: 'Sign up',
    hero_badge: "Mr. Abdelrahman Alaa's Platform",
    hero_title_a: 'Arabic language', hero_title_b: 'made enjoyable',
    hero_sub: "A learning platform dedicated to Arabic. Create your account, get approved, and start learning with a teacher who makes the language click.",
    cta_primary: 'Create account', cta_secondary: 'Have an account? Sign in',
    brand_short: 'Mr. Abdelrahman', brand_long: "Mr. Abdelrahman Alaa's Platform",
  },
}

export default function Login() {
  const { login } = useAuth()
  const { tenantId } = useTenant() // tenantId still passed to authAPI; brand display uses new branding
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'ar')
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const canvasRef = useRef(null)

  // Forgot Password
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotPhone, setForgotPhone] = useState('')
  const [forgotName, setForgotName] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState('')
  const [forgotSuccess, setForgotSuccess] = useState(false)

  // Register
  const [isRegistering, setIsRegistering] = useState(false)
  const [name, setName] = useState('')
  const [grade, setGrade] = useState('first-prep')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // NEW: auth modal
  const [showAuthModal, setShowAuthModal] = useState(false)

  // NEW: teacher portrait hover
  const [portraitHover, setPortraitHover] = useState(false)

  const t = translations[lang]

  useEffect(() => {
    if (theme === 'dark') document.body.classList.add('dark')
    else document.body.classList.remove('dark')
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  // Remember Me: prefill phone
  useEffect(() => {
    const remembered = localStorage.getItem('masaar-remembered-phone')
    if (remembered) {
      setPhone(remembered)
      setRememberMe(true)
    }
  }, [])

  // Particle canvas background
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let width = 0, height = 0, raf = 0
    const mouse = { x: -9999, y: -9999, active: false }
    const COLORS = ['#5cb8f0', '#7dd3fc', '#22d3ee', '#a78bfa', '#f0abfc', '#fbbf24']
    const COUNT = Math.max(38, Math.floor((window.innerWidth * window.innerHeight) / 28000))
    const particles = []
    const resize = () => { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight }
    resize()
    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * width, y: Math.random() * height, vx: 0, vy: 0,
        r: 1.8 + Math.random() * 2.2, c: COLORS[Math.floor(Math.random() * COLORS.length)],
      })
    }
    const step = () => {
      ctx.clearRect(0, 0, width, height)
      for (const p of particles) {
        if (mouse.active) {
          const dx = mouse.x - p.x, dy = mouse.y - p.y, d2 = dx * dx + dy * dy
          if (d2 < 220 * 220) {
            const d = Math.sqrt(d2) || 1, f = (1 - d / 220) * 0.22
            p.vx += (dx / d) * f; p.vy += (dy / d) * f
          }
        }
        p.vx *= 0.89; p.vy *= 0.89; p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = width; if (p.x > width) p.x = 0
        if (p.y < 0) p.y = height; if (p.y > height) p.y = 0
      }
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j]
          const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy
          if (d2 < 130 * 130) {
            const alpha = 1 - Math.sqrt(d2) / 130
            ctx.strokeStyle = `rgba(120, 200, 255, ${alpha * 0.35})`
            ctx.lineWidth = 1
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
          }
        }
      }
      for (const p of particles) {
        ctx.fillStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = 12
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
      }
      ctx.shadowBlur = 0
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    const onMove = e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true }
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
    setLang(newLang); localStorage.setItem('lang', newLang)
  }

  /* ─────────── rate limiting ─────────── */
  const ATTEMPT_KEY = 'masar-login-attempts'
  const MAX_FAILS = 5, WINDOW_MS = 60_000, LOCK_MS = 60_000

  const getCooldownRemaining = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(ATTEMPT_KEY) || '{}')
      return Math.max(0, (raw.lockedUntil || 0) - Date.now())
    } catch { return 0 }
  }
  const recordFailure = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(ATTEMPT_KEY) || '{}')
      const now = Date.now()
      const fails = (raw.fails || []).filter(t => now - t < WINDOW_MS)
      fails.push(now)
      const next = { fails }
      if (fails.length >= MAX_FAILS) next.lockedUntil = now + LOCK_MS
      localStorage.setItem(ATTEMPT_KEY, JSON.stringify(next))
    } catch { }
  }
  const clearFailures = () => { try { localStorage.removeItem(ATTEMPT_KEY) } catch { } }

  /* ─────────── handlers (UNCHANGED from your old file) ─────────── */
  const handleLogin = async e => {
    e.preventDefault(); setError('')
    const cooldown = getCooldownRemaining()
    if (cooldown > 0) {
      setError(lang === 'ar' ? `محاولات كثيرة. حاول مجدداً بعد ${Math.ceil(cooldown / 1000)} ثانية` : `Too many attempts. Try again in ${Math.ceil(cooldown / 1000)}s`)
      return
    }
    if (phone.trim().length < 8) { setError(lang === 'ar' ? 'رقم الهاتف غير صحيح' : 'Invalid phone number'); return }
    if (password.length < 6) { setError(lang === 'ar' ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters'); return }
    setLoading(true)
    try {
      const response = await authAPI.login(phone.trim(), password, tenantId)
      if (!response.token || !response.user) throw new Error('Invalid response from server')
      if (rememberMe) localStorage.setItem('masaar-remembered-phone', phone.trim())
      else localStorage.removeItem('masaar-remembered-phone')
      clearFailures()
      showSuccessMessage()
      setTimeout(() => { login(response.token, response.user); navigate('/') }, 1500)
    } catch (err) {
      console.error('Login error:', err); recordFailure()
      const cd = getCooldownRemaining()
      if (cd > 0) setError(lang === 'ar' ? `محاولات كثيرة. حاول مجدداً بعد ${Math.ceil(cd / 1000)} ثانية` : `Too many attempts. Try again in ${Math.ceil(cd / 1000)}s`)
      else setError(err.message || (lang === 'ar' ? 'فشل تسجيل الدخول' : 'Login failed'))
      setLoading(false)
    }
  }

  const handleRegister = async e => {
    e.preventDefault(); setError('')
    if (name.trim().length < 3) { setError(lang === 'ar' ? 'الاسم يجب أن يكون 3 أحرف على الأقل' : 'Name must be at least 3 characters'); return }
    if (phone.trim().length < 8) { setError(lang === 'ar' ? 'رقم الهاتف غير صحيح' : 'Invalid phone number'); return }
    if (password.length < 6) { setError(lang === 'ar' ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters'); return }
    if (password !== confirmPassword) { setError(lang === 'ar' ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match'); return }
    setLoading(true)
    try {
      const response = await authAPI.register(name.trim(), phone.trim(), password, tenantId, grade)
      if (!response.user) throw new Error('Invalid response from server')
      showRegisterSuccessMessage()
      setTimeout(() => {
        if (response.token) { login(response.token, response.user); navigate('/') }
        else { setIsRegistering(false); setPhone(phone.trim()); setPassword(''); setLoading(false) }
      }, 1500)
    } catch (err) {
      console.error('Registration error:', err)
      setError(err.message || (lang === 'ar' ? 'فشل إنشاء الحساب' : 'Registration failed'))
      setLoading(false)
    }
  }

  const handleForgotSubmit = async e => {
    e.preventDefault(); setForgotError('')
    if (forgotPhone.trim().length < 8) { setForgotError(lang === 'ar' ? 'رقم الهاتف غير صحيح' : 'Invalid phone number'); return }
    if (forgotName.trim().length < 3) { setForgotError(lang === 'ar' ? 'الاسم يجب أن يكون 3 أحرف على الأقل' : 'Name must be at least 3 characters'); return }
    setForgotLoading(true)
    try {
      const { error: insertError } = await supabase
        .from('password_reset_requests')
        .insert({ phone: forgotPhone.trim(), full_name: forgotName.trim(), status: 'pending', tenant_id: tenantId })
      if (insertError) throw insertError
      setForgotSuccess(true)
    } catch (err) {
      console.error('Password reset request error:', err)
      setForgotError(lang === 'ar' ? 'حدث خطأ أثناء إرسال الطلب. يرجى المحاولة مرة أخرى.' : 'An error occurred while sending your request. Please try again.')
    } finally { setForgotLoading(false) }
  }

  const showSuccessMessage = () => spawnToast(
    lang === 'ar' ? 'تم تسجيل الدخول بنجاح' : 'Login Successful',
    lang === 'ar' ? 'جارٍ تحويلك إلى المنصة...' : 'Redirecting you to the platform...',
    lang
  )
  const showRegisterSuccessMessage = () => spawnToast(
    lang === 'ar' ? 'تم إنشاء الحساب بنجاح' : 'Registration Successful',
    lang === 'ar' ? 'جارٍ تحويلك إلى صفحة الدفع وتفعيل الحساب...' : 'Redirecting you to the payment page...',
    lang
  )

  const openAuth = (registering) => {
    setIsRegistering(registering); setError(''); setShowAuthModal(true)
  }

  const Arrow = lang === 'ar' ? '←' : '→'

  return (
    <div className="aa-page" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <canvas ref={canvasRef} className="aa-particles" aria-hidden="true" />

      {/* ─────────── NEW NAVBAR ─────────── */}
      <header className="aa-nav">
        <div className="aa-nav-inner">
          <div className="aa-brand">
            <div className="aa-brand-mark">🎓</div>
            <span className="aa-brand-name">{t.brand_short}</span>
          </div>

          <nav className="aa-nav-links">
            <a href="#about" className="aa-nav-link">{t.nav_about}</a>
          </nav>

          <div className="aa-nav-actions">
            <button onClick={toggleTheme} className="aa-icon-btn" aria-label="theme">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button onClick={() => switchLang(lang === 'ar' ? 'en' : 'ar')} className="aa-icon-btn aa-lang">
              🌐 <span>{lang === 'ar' ? 'EN' : 'ع'}</span>
            </button>
            <button onClick={() => openAuth(false)} className="aa-btn aa-btn-ghost">{t.nav_signin}</button>
            <button onClick={() => openAuth(true)} className="aa-btn aa-btn-primary">{t.nav_signup}</button>
          </div>
        </div>
      </header>

      {/* ─────────── NEW HERO ─────────── */}
      <section className="aa-hero">
        <div className="aa-constellation" />
        <div className="aa-hero-glow" />
        <div className="aa-hero-inner">
          <div className="aa-hero-text">
            <span className="aa-badge">✨ {t.hero_badge}</span>
            <h1 className="aa-h1">
              {t.hero_title_a}
              <br />
              <span className="aa-h1-grad">{t.hero_title_b}</span>
            </h1>
            <p className="aa-sub">{t.hero_sub}</p>
            <div className="aa-cta-row">
              <button className="aa-btn aa-btn-primary aa-btn-lg" onClick={() => openAuth(true)}>
                {t.cta_primary} <span>{Arrow}</span>
              </button>
              <button className="aa-btn aa-btn-outline aa-btn-lg" onClick={() => openAuth(false)}>
                {t.cta_secondary}
              </button>
            </div>
          </div>

          {/* Teacher portrait (hover/active swap) */}
          <div className="aa-portrait-wrap">
            <div
              className="aa-portrait"
              onMouseEnter={() => setPortraitHover(true)}
              onMouseLeave={() => setPortraitHover(false)}
              onTouchStart={() => setPortraitHover(true)}
              onTouchEnd={() => setPortraitHover(false)}
            >
              <div className="aa-portrait-img">
                <img src="/images/profile.png" alt="الأستاذ عبدالرحمن علاء" className={`aa-img-base ${portraitHover ? 'is-hidden' : ''}`} />
                <img src="/images/me.png" alt="" aria-hidden="true" className={`aa-img-hover ${portraitHover ? 'is-shown' : ''}`} />
                <div className="aa-portrait-vignette" />
                <div className="aa-portrait-chips">
                  <div className="aa-chip aa-chip-accent">اعتماد أكاديمي</div>
                  <div className="aa-chip">+10 سنوات خبرة</div>
                </div>
              </div>
              <div className="aa-nameplate">
                <div className="aa-nameplate-row">
                  <div>
                    <div className="aa-kicker">الأستاذ المحاضر</div>
                    <h3 className="aa-name">عبدالرحمن علاء</h3>
                    <p className="aa-dept">قسم اللغة العربية</p>
                  </div>
                  <div className="aa-grad-icon">🎓</div>
                </div>
                <div className="aa-metrics">
                  <div>
                    <div className="aa-metric-label">التقييم</div>
                    <div className="aa-metric-value">4.9 ★★★★☆</div>
                  </div>
                  <div>
                    <div className="aa-metric-label">الحالة</div>
                    <div className="aa-metric-value"><span className="aa-pulse" /> متاح الآن</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── KEEP YOUR EXISTING MARKETING SECTIONS BELOW ─────────── */}
      {/* If you want to keep features / steps / location, paste them here from your old file.
          They will use your existing Login.css and continue to work unchanged. */}

      {/* ─────────── FOOTER ─────────── */}
      <footer className="aa-footer">
        © 2026 {t.brand_long} — {lang === 'ar' ? 'جميع الحقوق محفوظة' : 'All rights reserved'}
      </footer>

      {/* ─────────── AUTH MODAL (login/register) ─────────── */}
      {showAuthModal && (
        <div className="auth-modal-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="auth-modal aa-auth-modal" onClick={e => e.stopPropagation()} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <button className="auth-modal-close" onClick={() => setShowAuthModal(false)} aria-label="Close">✕</button>

            <h2 style={{ textAlign: 'center', marginBottom: 16 }}>{isRegistering ? t.register : t.login}</h2>

            {error && <div className="error-message show">{error}</div>}

            {isRegistering ? (
              <form onSubmit={handleRegister}>
                <div className="input-wrapper">
                  <i className="fas fa-user"></i>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder={t['student-name']} />
                </div>
                <div className="input-wrapper">
                  <i className="fas fa-phone"></i>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder={t.phone} dir="ltr" />
                </div>
                <div className="input-wrapper">
                  <i className="fas fa-graduation-cap"></i>
                  <select value={grade} onChange={e => setGrade(e.target.value)} required
                    style={{ textAlign: lang === 'ar' ? 'right' : 'left' }}>
                    <optgroup label={lang === 'ar' ? 'المرحلة الإعدادية' : 'Preparatory'}>
                      <option value="first-prep">{t['grade-first']}</option>
                      <option value="second-prep">{t['grade-second']}</option>
                      <option value="third-prep">{t['grade-third']}</option>
                    </optgroup>
                    <optgroup label={lang === 'ar' ? 'المرحلة الثانوية' : 'Secondary'}>
                      <option value="first-sec">{t['grade-sec-1']}</option>
                      <option value="second-sec">{t['grade-sec-2']}</option>
                      <option value="third-sec">{t['grade-sec-3']}</option>
                    </optgroup>
                  </select>
                </div>
                <div className="input-wrapper">
                  <i className="fas fa-lock"></i>
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder={t.password} minLength="6" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="toggle-password-btn">
                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
                <div className="input-wrapper">
                  <i className="fas fa-lock"></i>
                  <input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required placeholder={t['confirm-password']} minLength="6" />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="toggle-password-btn">
                    <i className={`fas ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
                <button type="submit" className="modern-btn" disabled={loading}>
                  <span className="btn-text">{t['register-btn']}</span>
                  {loading && <span className="btn-loader"><span className="spinner"></span></span>}
                </button>
                <div className="form-toggle-link" style={{ textAlign: 'center', marginTop: 16 }}>
                  <span>{t['have-account']} </span>
                  <button type="button" onClick={() => { setIsRegistering(false); setError('') }} className="aa-link-btn">
                    {t['login-btn-link']}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleLogin}>
                <div className="input-wrapper">
                  <i className="fas fa-phone"></i>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder={t.phone} dir="ltr" />
                </div>
                <div className="input-wrapper">
                  <i className="fas fa-lock"></i>
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder={t.password} minLength="6" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="toggle-password-btn">
                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
                <div className="form-options">
                  <label className="switch">
                    <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                    <span className="slider"></span>
                  </label>
                  <span className="remember-text">{t.remember}</span>
                  <button type="button" className="forgot-btn"
                    onClick={() => {
                      setForgotPhone(phone); setForgotName(''); setForgotError(''); setForgotSuccess(false)
                      setShowAuthModal(false); setShowForgotModal(true)
                    }}>
                    {t.forgot}
                  </button>
                </div>
                <button type="submit" className="modern-btn" disabled={loading}>
                  <span className="btn-text">{t.login}</span>
                  {loading && <span className="btn-loader"><span className="spinner"></span></span>}
                </button>
                <div className="form-toggle-link" style={{ textAlign: 'center', marginTop: 16 }}>
                  <span>{t['no-account']} </span>
                  <button type="button" onClick={() => { setIsRegistering(true); setError('') }} className="aa-link-btn">
                    {t['register-btn-link']}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─────────── FORGOT PASSWORD MODAL (unchanged) ─────────── */}
      {showForgotModal && (
        <div className="auth-modal-overlay" onClick={() => setShowForgotModal(false)}>
          <div className="auth-modal" onClick={e => e.stopPropagation()} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <button className="auth-modal-close" onClick={() => setShowForgotModal(false)} aria-label="Close">✕</button>
            {!forgotSuccess ? (
              <>
                <div className="auth-modal-header">
                  <div className="auth-modal-icon"><i className="fas fa-key"></i></div>
                  <h3>{lang === 'ar' ? 'استعادة كلمة المرور' : 'Reset Password'}</h3>
                  <p>{lang === 'ar' ? 'أدخل رقم هاتفك واسمك بالكامل لتقديم طلب استعادة كلمة المرور.' : 'Enter your phone number and full name to request a password reset.'}</p>
                </div>
                {forgotError && <div className="error-message show">{forgotError}</div>}
                <form onSubmit={handleForgotSubmit} className="auth-modal-form">
                  <div className="input-wrapper">
                    <i className="fas fa-phone"></i>
                    <input type="tel" value={forgotPhone} onChange={e => setForgotPhone(e.target.value)} required placeholder={t.phone} dir="ltr" />
                  </div>
                  <div className="input-wrapper">
                    <i className="fas fa-user"></i>
                    <input type="text" value={forgotName} onChange={e => setForgotName(e.target.value)} required placeholder={t.name} />
                  </div>
                  <button type="submit" className="modern-btn" disabled={forgotLoading}>
                    <span className="btn-text">{lang === 'ar' ? 'إرسال الطلب' : 'Submit Request'}</span>
                    {forgotLoading && <span className="btn-loader"><span className="spinner"></span></span>}
                  </button>
                </form>
              </>
            ) : (
              <div className="auth-modal-success">
                <div className="auth-modal-check"><i className="fas fa-circle-check"></i></div>
                <h3>{lang === 'ar' ? 'تم إرسال طلبك بنجاح!' : 'Request Sent Successfully!'}</h3>
                <p>{lang === 'ar' ? 'تم تسجيل طلبك. يرجى مراجعة معلمك أو مسؤول المنصة لاستلام كلمة المرور الجديدة.' : 'Your request has been registered. Please contact your teacher or platform administrator.'}</p>
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

/* helper: toast (extracted from original showSuccessMessage) */
function spawnToast(title, sub, lang) {
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
    overlay.classList.remove('open'); overlay.classList.add('closing')
    setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay) }, 320)
  }, 1400)
}
