// Login.jsx — MERGED VERSION
// Dynamic theme touches based on resolved tenant.
// Renders the new teacher landing page layout for all tenants,
// with chemistry assets for mona-chem and standard assets for default.

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI, tokenAPI } from '@backend/authApi'
import { supabase } from '@backend/supabase'
import { useAuth } from '../contexts/AuthContext'
import { listPackages } from '@backend/packagesApi'
import { useTenant } from '../contexts/TenantContext'
import masarLogo from '../assets/logo.white.png'
import './Login.css'        // existing styles (forms, marketing, footer)
import './login-styles.css'     // new styles (navbar, hero, auth-modal, teacher portrait)
import './tenant-themes.css'    // custom theme overrides (chemistry, physics, etc.)
import { getTenantThemeConfig } from '../utils/tenantThemes'

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
    'parent-phone': 'رقم هاتف ولي الأمر (واتساب)',
    // NEW design
    nav_about: 'عن المعلم',
    nav_signin: 'تسجيل الدخول',
    nav_signup: 'إنشاء حساب',
    hero_badge: 'منصة مسار التعليمية',
    hero_title_a: 'اللغة العربية',
    hero_title_b: 'لغة الضاد بطعم جديد',
    hero_sub: 'منصة تعليمية متخصّصة في اللغة العربية — سجّل حسابك، يتم اعتماده، وابدأ رحلتك مع شرح يخلّيك تفهم وتحب اللغة.',
    cta_primary: 'أنشئ حسابك الآن',
    cta_secondary: 'لديك حساب؟ ادخل',
    brand_short: 'منصة مسار التعليمية',
    brand_long: 'منصة مسار التعليمية',
  },
  en: {
    login: 'Login', phone: 'Phone Number', name: 'Full Name', password: 'Password',
    remember: 'Remember me', forgot: 'Forgot password?',
    register: 'Create New Account', grade: 'Academic Grade',
    'grade-first': 'First Preparatory Stage', 'grade-second': 'Second Preparatory Stage', 'grade-third': 'Third Preparatory Stage',
    'grade-sec-1': 'First Secondary Stage', 'grade-sec-2': 'Second Secondary Stage', 'grade-sec-3': 'Third Secondary Stage',
    'confirm-password': 'Confirm Password',
    'have-account': 'Already have an account?', 'no-account': "Don't have an account?",
    'register-btn': 'Create Account', 'login-btn-link': 'Log In', 'register-btn-link': 'Register Now',
    'student-name': 'Full Student Name', 'select-grade': 'Select Academic Grade',
    'parent-phone': "Parent's Phone Number (WhatsApp)",
    nav_about: 'About', nav_signin: 'Sign in', nav_signup: 'Sign up',
    hero_badge: "Masar Educational Platform",
    hero_title_a: 'Arabic language', hero_title_b: 'made enjoyable',
    hero_sub: "A learning platform dedicated to Arabic. Create your account, get approved, and start learning with a teacher who makes the language click.",
    cta_primary: 'Create account', cta_secondary: 'Have an account? Sign in',
    brand_short: 'Masar Educational Platform', brand_long: "Masar Educational Platform",
  },
}

export default function Login() {
  const { login, isLoggedIn, user } = useAuth()
  const { tenant, tenantId, tenantSlug, tenantName, isGradeEnabled } = useTenant()
  const isDefaultTenant = !tenantSlug || tenantSlug === 'default'
  const themeConfig = getTenantThemeConfig(tenant, tenantSlug)
  const dbLogo = tenant?.logo_url && !tenant.logo_url.includes('3081840') ? tenant.logo_url : null
  const brandLogo = themeConfig.logoUrl || (isDefaultTenant ? "/images/logo.white.png" : (dbLogo || "/images/logo.white.png"))
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'ar')
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [phone, setPhone] = useState('')
  const [parentPhone, setParentPhone] = useState('')
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

  // Registration is now on /register page

  // NEW: auth modal
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [activePackages, setActivePackages] = useState([])

  // Parent Reports Lookup States
  const [showParentModal, setShowParentModal] = useState(false)
  const [parentPhoneInput, setParentPhoneInput] = useState('')
  const [parentModalLoading, setParentModalLoading] = useState(false)
  const [parentModalError, setParentModalError] = useState('')
  const [childrenList, setChildrenList] = useState([])

  // NEW: teacher portrait hover
  const [portraitHover, setPortraitHover] = useState(false)

  const t = translations[lang]

  const getLocalized = (val, arFallback, enFallback) => {
    if (!val) return lang === 'ar' ? arFallback : enFallback
    if (typeof val === 'object') {
      return val[lang] || val['ar'] || arFallback
    }
    return val
  }

  const brandShort = isDefaultTenant ? t.brand_short : getLocalized(themeConfig.branding?.brand_short || tenant?.config?.branding?.brand_short, tenantName, tenantName)
  const heroTitleA = isDefaultTenant ? t.hero_title_a : getLocalized(themeConfig.branding?.hero_title_a || tenant?.config?.branding?.hero_title_a, tenantName, tenantName)
  const heroTitleB = isDefaultTenant ? t.hero_title_b : getLocalized(themeConfig.branding?.hero_title_b || tenant?.config?.branding?.hero_title_b, '', '')
  const heroSub = isDefaultTenant ? t.hero_sub : getLocalized(themeConfig.branding?.hero_sub || tenant?.config?.branding?.hero_sub, '', '')

  const teacherName = getLocalized(themeConfig.teacher?.name || tenant?.config?.teacher?.name, 'عبدالرحمن علاء', 'Abdelrahman Alaa')
  const teacherRole = getLocalized(themeConfig.teacher?.role || tenant?.config?.teacher?.role, 'مدرّس اللغة العربية', 'Arabic Language Teacher')
  const teacherBio = getLocalized(
    themeConfig.teacher?.bio || tenant?.config?.teacher?.bio,
    'بشرح اللغة العربية بأسلوب بسيط وحديث يقرّب القواعد والنحو والأدب لذهن الطالب. هدفي إن كل طالب يطلع من الدرس فاهم ومستمتع — مش بس حافظ.',
    'I teach Arabic with a modern, approachable style that brings grammar, syntax, and literature to life. My goal: every student walks out understanding — not just memorising.'
  )
  const teacherQuote = getLocalized(
    themeConfig.teacher?.quote || tenant?.config?.teacher?.quote,
    '«اللغة العربية مش صعبة — محتاجة بس حد يقدّمها بطريقة صح.»',
    '“Arabic isn\'t hard — it just needs to be taught the right way.”'
  )
  const teacherImageBase = themeConfig.teacher?.image_base || tenant?.config?.teacher?.image_base || "/images/profile.png"
  const teacherImageHover = themeConfig.teacher?.image_hover || tenant?.config?.teacher?.image_hover || "/images/me.png"
  const teacherExp = getLocalized(themeConfig.teacher?.experience || tenant?.config?.teacher?.experience, '+10', '+10')
  const teacherStudents = getLocalized(themeConfig.teacher?.students_count || tenant?.config?.teacher?.students_count, '+2,000', '+2,000')
  const teacherSatisfaction = getLocalized(themeConfig.teacher?.satisfaction || tenant?.config?.teacher?.satisfaction, '98%', '98%')
  const teacherTargetStage = getLocalized(
    themeConfig.teacher?.target_stage || tenant?.config?.teacher?.target_stage,
    'الإعدادية والثانوية',
    'Prep & Secondary'
  )
  const teacherTargetStageLabel = getLocalized(
    themeConfig.teacher?.target_stage_label || tenant?.config?.teacher?.target_stage_label,
    'المراحل التي يدرّسها',
    'Stages he teaches'
  )
  const teacherLearningSystem = getLocalized(
    themeConfig.teacher?.learning_system || tenant?.config?.teacher?.learning_system,
    'أونلاين تفاعلي',
    'Online Interactive'
  )

  const socials = {
    facebook: themeConfig.socials?.facebook || tenant?.config?.socials?.facebook || 'https://www.facebook.com',
    whatsapp: themeConfig.socials?.whatsapp || tenant?.config?.socials?.whatsapp || 'https://wa.me/',
    instagram: themeConfig.socials?.instagram || tenant?.config?.socials?.instagram || 'https://www.instagram.com',
    youtube: themeConfig.socials?.youtube || tenant?.config?.socials?.youtube || 'https://www.youtube.com',
    tiktok: themeConfig.socials?.tiktok || tenant?.config?.socials?.tiktok || 'https://www.tiktok.com'
  }

  const locationKicker = getLocalized(themeConfig.location?.kicker || tenant?.config?.location?.kicker, 'زورنا', 'Visit us')
  const locationTitle = getLocalized(themeConfig.location?.title || tenant?.config?.location?.title, 'موقعنا على الخريطة', 'Find Us on the Map')
  const locationDesc = getLocalized(
    themeConfig.location?.description || tenant?.config?.location?.description,
    'تقدر تزورنا في مقرّنا بدمنهور — قريب وسهل توصله.',
    'Drop by our center in Damanhour — easy to find and easy to reach.'
  )
  const locationAddress = getLocalized(themeConfig.location?.address || tenant?.config?.location?.address, 'دمنهور، البحيرة', 'Damanhour, Beheira')
  const locationCountry = getLocalized(themeConfig.location?.country || tenant?.config?.location?.country, 'جمهورية مصر العربية', 'Arab Republic of Egypt')
  const locationMapUrl = themeConfig.location?.map_iframe_url || tenant?.config?.location?.map_iframe_url || "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3412.5!2d30.4272213!3d31.0379878!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzHCsDAyJzE2LjgiTiAzMMKwMjUnMzguMCJF!5e0!3m2!1sen!2seg!4v1700000000000"
  const locationPhone = themeConfig.location?.phone || tenant?.config?.location?.phone || '+20 XXX XXX XXXX'
  const locationHoursDays = getLocalized(themeConfig.location?.hours_days || tenant?.config?.location?.hours_days, 'السبت – الخميس', 'Sat – Thu')
  const locationHoursTime = getLocalized(themeConfig.location?.hours_time || tenant?.config?.location?.hours_time, '٩ صباحًا – ٩ مساءً', '9 AM – 9 PM')
  const locationDirectionsLink = themeConfig.location?.directions_link || tenant?.config?.location?.directions_link || "https://maps.app.goo.gl/W93aUn2jgM7cb2tT7"
  const locationWhatsappLink = themeConfig.location?.whatsapp_link || tenant?.config?.location?.whatsapp_link || "https://wa.me/20XXXXXXXXXX"

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

  useEffect(() => {
    if (theme === 'dark') document.body.classList.add('dark')
    else document.body.classList.remove('dark')
  }, [theme])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const pkgs = await listPackages()
        if (!cancelled) {
          const isStaff = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'assistant'
          const studentGrade = user?.grade || null
          const active = pkgs.filter(p => {
            if (!p.is_active) return false
            if (isLoggedIn && !isStaff && studentGrade) {
              return p.grade === studentGrade
            }
            return true
          })
          setActivePackages(active)
        }
      } catch (err) {
        console.error('Failed to load packages for landing page:', err)
      }
    })()
    return () => { cancelled = true }
  }, [isLoggedIn, user])

  const handleBuyClick = (pkg) => {
    if (isLoggedIn) {
      navigate(`/shop?packageId=${pkg.id}`)
    } else {
      localStorage.setItem('pendingCheckoutPkgId', pkg.id)
      setShowAuthModal(true)
    }
  }

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
    const COLORS = themeConfig.particleColors
    const COUNT = Math.max(12, Math.floor((window.innerWidth * window.innerHeight) / 80000))
    const particles = []
    const resize = () => { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight }
    resize()

    const FORMULAS = themeConfig.formulas

    for (let i = 0; i < COUNT; i++) {
      let type = 'circle'
      let text = ''
      
      const customShape = themeConfig.generateCustomShape()
      if (customShape !== 'circle') {
        type = customShape
        if (customShape === 'formula') {
          text = FORMULAS[Math.floor(Math.random() * FORMULAS.length)]
        }
      }

      particles.push({
        x: Math.random() * width, y: Math.random() * height, vx: 0, vy: 0,
        r: 1.8 + Math.random() * 2.2, c: COLORS[Math.floor(Math.random() * COLORS.length)],
        type, text
      })
    }
    const step = () => {
      ctx.clearRect(0, 0, width, height)
      for (const p of particles) {
        if (mouse.active) {
          const dx = mouse.x - p.x, dy = mouse.y - p.y, d2 = dx * dx + dy * dy
          if (d2 < 220 * 220) {
            const d = Math.sqrt(d2) || 1, f = (1 - d / 220) * 0.08
            p.vx += (dx / d) * f; p.vy += (dy / d) * f
          }
        }
        p.vx += (Math.random() - 0.5) * 0.02
        p.vy += (Math.random() - 0.5) * 0.02

        p.vx *= 0.95; p.vy *= 0.95
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        const maxSpeed = 0.35
        if (speed > maxSpeed) {
          p.vx = (p.vx / speed) * maxSpeed
          p.vy = (p.vy / speed) * maxSpeed
        }

        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = width; if (p.x > width) p.x = 0
        if (p.y < 0) p.y = height; if (p.y > height) p.y = 0
      }
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j]
          const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy
          if (d2 < 130 * 130) {
            const alpha = 1 - Math.sqrt(d2) / 130
            ctx.strokeStyle = themeConfig.getLineColor(theme, alpha)
            ctx.lineWidth = 1
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
          }
        }
      }
      for (const p of particles) {
        ctx.fillStyle = p.c; ctx.strokeStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = theme === 'dark' ? 10 : 0
        
        const didDraw = themeConfig.drawCustomShape(ctx, p, p.r)
        if (!didDraw) {
          if (p.type === 'formula') {
            const fontSpec = themeConfig.canvasFont || 'Tajawal, sans-serif'
            let fullFont = `${Math.round(p.r * 6.5)}px ${fontSpec}`
            if (fontSpec.startsWith('italic ')) {
              fullFont = `italic ${Math.round(p.r * 6.5)}px ${fontSpec.substring(7)}`
            }
            ctx.font = fullFont
            ctx.fillText(p.text, p.x, p.y)
          } else {
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
          }
        }
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
  }, [theme, tenantSlug, tenant, themeConfig])

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

  /* ─────────── handlers ─────────── */
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
      const pendingPkg = localStorage.getItem('pendingCheckoutPkgId')
      if (pendingPkg) {
        localStorage.removeItem('pendingCheckoutPkgId')
        setTimeout(() => { login(response.token, response.user); window.location.href = '/shop?packageId=' + pendingPkg }, 1500)
      } else {
        setTimeout(() => { login(response.token, response.user); window.location.href = '/' }, 1500)
      }
    } catch (err) {
      console.error('Login error:', err); recordFailure()
      const cd = getCooldownRemaining()
      if (cd > 0) setError(lang === 'ar' ? `محاولات كثيرة. حاول مجدداً بعد ${Math.ceil(cd / 1000)} ثانية` : `Too many attempts. Try again in ${Math.ceil(cd / 1000)}s`)
      else setError(err.message || (lang === 'ar' ? 'فشل تسجيل الدخول' : 'Login failed'))
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

  const handleParentLookup = async (e) => {
    e.preventDefault()
    if (!parentPhoneInput.trim()) {
      setParentModalError(lang === 'ar' ? 'يرجى إدخال رقم الهاتف' : 'Please enter phone number')
      return
    }
    setParentModalLoading(true)
    setParentModalError('')
    try {
      const { data, error } = await supabase.rpc('get_parent_portal_summary', {
        p_parent_phone: parentPhoneInput.trim(),
        p_tenant_id: tenantId
      })
      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error(lang === 'ar' ? 'رقم الهاتف المدخل غير مسجل كولي أمر في النظام' : 'Phone not registered as parent')
      }
      
      if (data.length === 1) {
        const student = data[0]
        setShowParentModal(false)
        navigate(`/public-report?id=${student.id}&token=${student.qr_token || ''}&phone=${encodeURIComponent(parentPhoneInput.trim())}`)
      } else {
        setChildrenList(data)
      }
    } catch (err) {
      console.error(err)
      const isMissingRpc = err.message && (err.message.includes('get_parent_portal_summary') || err.message.includes('schema cache') || err.message.includes('does not exist'))
      const friendlyError = isMissingRpc 
        ? (lang === 'ar' ? 'خدمة الاستعلام عن التقارير قيد التفعيل حالياً. يرجى المحاولة بعد قليل.' : 'Report lookup service is currently being activated. Please try again in a moment.')
        : (err.message || (lang === 'ar' ? 'حدث خطأ أثناء الاستعلام. يرجى المحاولة مرة أخرى.' : 'Error during lookup. Please try again.'))
      setParentModalError(friendlyError)
    } finally {
      setParentModalLoading(false)
    }
  }

  const showSuccessMessage = () => spawnToast(
    lang === 'ar' ? 'تم تسجيل الدخول بنجاح' : 'Login Successful',
    lang === 'ar' ? 'جارٍ تحويلك إلى المنصة...' : 'Redirecting you to the platform...',
    lang
  )
  const openAuth = (registering) => {
    if (registering) {
      navigate('/register')
    } else {
      setError('')
      setShowAuthModal(true)
    }
  }

  const Arrow = lang === 'ar' ? '←' : '→'

  return (
    <div className={`aa-page ${themeConfig.themeClass || ''}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <canvas ref={canvasRef} className="aa-particles" aria-hidden="true" />

      {/* ─────────── NEW NAVBAR ─────────── */}
      <header className="aa-nav">
        <div className="aa-nav-inner">
          <div className="aa-brand">
            <img src={brandLogo} alt="Logo" style={{ height: '36px', width: 'auto', objectFit: 'contain' }} />
            <span className="aa-brand-name">{brandShort}</span>
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
            <button onClick={() => {
              setParentPhoneInput(''); setParentModalError(''); setChildrenList([]); setShowParentModal(true);
            }} className="aa-btn aa-btn-ghost" style={{ color: 'var(--primary, #a78bfa)' }}>
              {lang === 'ar' ? 'تقارير ولي الأمر' : 'Parent Reports'}
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
            <span className="aa-badge">✨ {isDefaultTenant ? t.hero_badge : tenantName}</span>
            <h1 className="aa-h1">
              {heroTitleA}
              <br />
              <span className="aa-h1-grad">{heroTitleB}</span>
            </h1>
            <p className="aa-sub">{heroSub}</p>
            <div className="aa-cta-row">
              <button className="aa-btn aa-btn-primary aa-btn-lg" onClick={() => openAuth(true)}>
                {t.cta_primary} <span>{Arrow}</span>
              </button>
              <button className="aa-btn aa-btn-outline aa-btn-lg" onClick={() => openAuth(false)}>
                {t.cta_secondary}
              </button>
              <button className="aa-btn aa-btn-outline aa-btn-lg" onClick={() => {
                setParentPhoneInput(''); setParentModalError(''); setChildrenList([]); setShowParentModal(true);
              }} style={{ background: 'var(--primary-soft, rgba(99, 102, 241, 0.1))', borderColor: 'var(--primary, rgba(99, 102, 241, 0.25))', color: 'var(--primary, #a78bfa)' }}>
                <i className="fas fa-chart-line" style={{ marginInlineEnd: 8 }}></i>
                {lang === 'ar' ? 'تقارير ولي الأمر' : 'Parent Reports'}
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
                <img src={teacherImageBase} alt={lang === 'ar' ? `الأستاذ ${teacherName}` : `Mr. ${teacherName}`} className={`aa-img-base ${portraitHover ? 'is-hidden' : ''}`} />
                <img src={teacherImageHover} alt="" aria-hidden="true" className={`aa-img-hover ${portraitHover ? 'is-shown' : ''}`} />
                <div className="aa-portrait-vignette" />
                <div className="aa-portrait-chips">
                  <div className="aa-chip aa-chip-accent">{lang === 'ar' ? 'اعتماد أكاديمي' : 'Certified Lecturer'}</div>
                  <div className="aa-chip">{teacherExp} {lang === 'ar' ? 'سنوات خبرة' : 'years experience'}</div>
                </div>
              </div>
              <div className="aa-nameplate">
                <div className="aa-nameplate-row">
                  <div>
                    <div className="aa-kicker">{lang === 'ar' ? 'الأستاذ المحاضر' : 'Lecturer'}</div>
                    <h3 className="aa-name">{teacherName}</h3>
                    <p className="aa-dept">{teacherRole}</p>
                  </div>
                  <div className="aa-grad-icon"><i className="fas fa-graduation-cap"></i></div>
                </div>
                <div className="aa-metrics">
                  <div>
                    <div className="aa-metric-label">{teacherTargetStageLabel}</div>
                    <div className="aa-metric-value">{teacherTargetStage}</div>
                  </div>
                  <div>
                    <div className="aa-metric-label">{lang === 'ar' ? 'نظام التعلم' : 'Learning System'}</div>
                    <div className="aa-metric-value"><span className="aa-pulse" /> {teacherLearningSystem}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── ABOUT TEACHER ─────────── */}
      <section id="about" className="login-about">
        <div className="section-inner about-grid">
          <div className="about-text">
            <span className="about-kicker">
              {lang === 'ar' ? 'عن المعلم' : 'About the teacher'}
            </span>
            <h2 className="section-heading about-title">
              {lang === 'ar' ? `أ. ${teacherName}` : `Mr. ${teacherName}`}
            </h2>
            <p className="about-role">
              {teacherRole}
            </p>
            <p className="about-bio">
              {teacherBio}
            </p>

            <div className="about-stats">
              <div className="about-stat">
                <i className="fas fa-award"></i>
                <div className="about-stat-value">{teacherExp}</div>
                <div className="about-stat-label">
                  {lang === 'ar' ? 'سنوات خبرة' : 'Years of experience'}
                </div>
              </div>
              <div className="about-stat">
                <i className="fas fa-users"></i>
                <div className="about-stat-value">{teacherStudents}</div>
                <div className="about-stat-label">
                  {lang === 'ar' ? 'طالب وطالبة' : 'Students taught'}
                </div>
              </div>
              <div className="about-stat">
                <i className="fas fa-book-open"></i>
                <div className="about-stat-value">{teacherSatisfaction}</div>
                <div className="about-stat-label">
                  {lang === 'ar' ? 'رضا الطلاب' : 'Student satisfaction'}
                </div>
              </div>
            </div>
          </div>

          <aside className="about-quote">
            <i className="fas fa-sparkles about-quote-icon"></i>
            <p className="about-quote-text">
              {teacherQuote}
            </p>
            <p className="about-quote-author">
              — {lang === 'ar' ? `أ. ${teacherName}` : `Mr. ${teacherName}`}
            </p>
          </aside>
        </div>
      </section>

      {/* ─────────── PACKAGES SHOWCASE SECTION ─────────── */}
      {activePackages.length > 0 && (
        <section id="packages" className="login-packages-showcase">
          <div className="section-inner">
            <h2 className="section-heading">
              {lang === 'ar' ? 'الباقات المتاحة حالياً 📦' : 'Currently Available Packages 📦'}
            </h2>
            <p className="section-sub">
              {lang === 'ar' 
                ? 'اختر باقتك المفضلة وابدأ التعلم الآن مع أفضل المميزات والدعم المستمر.' 
                : 'Choose your favorite package and start learning now with premium features.'}
            </p>
            
            <div className="landing-packages-grid">
              {activePackages.map((pkg, idx) => {
                const itemsCount = pkg.package_items?.length || 0;
                const itemsCountLabel = lang === 'ar' ? `${itemsCount} عناصر` : `${itemsCount} items`;
                return (
                  <div 
                    key={pkg.id} 
                    className="landing-package-card"
                    style={{ animationDelay: `${idx * 0.1}s` }}
                  >
                    <div className="landing-package-image" style={{ background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                      {pkg.thumbnail ? (
                        <img 
                          src={pkg.thumbnail} 
                          alt={pkg.title} 
                          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.5s' }}
                          className="landing-pkg-img"
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #7c3aed, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i className="fas fa-box-open" style={{ fontSize: '2.5rem', color: '#fff', opacity: 0.8 }}></i>
                        </div>
                      )}
                      <span className="landing-package-badge">
                        {itemsCountLabel}
                      </span>
                    </div>
                    <div className="landing-package-body">
                      <h3>{pkg.title}</h3>
                      <p>{pkg.description || (lang === 'ar' ? 'لا يوجد وصف مضاف لهذه الباقة.' : 'No description available for this package.')}</p>
                      
                      <div className="landing-package-footer">
                        <div className="landing-package-price">
                          <span className="price-num">{pkg.price}</span>
                          <span className="price-curr">{lang === 'ar' ? ' ج.م' : ' EGP'}</span>
                        </div>
                        <button 
                          onClick={() => handleBuyClick(pkg)}
                          className="landing-package-btn"
                        >
                          {lang === 'ar' ? 'اشترك الآن 🚀' : 'Subscribe Now 🚀'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ─────────── MARKETING SECTIONS ─────────── */}
      <section id="features" className="login-features">
        <div className="section-inner">
          <h2 className="section-heading">{lang === 'ar' ? `لماذا ${brandShort}؟` : `Why ${brandShort}?`}</h2>
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

      <section className="login-location" id="location">
        <div className="loc-bg-grid" aria-hidden="true"></div>
        <div className="loc-bg-blob loc-bg-blob--a" aria-hidden="true"></div>
        <div className="loc-bg-blob loc-bg-blob--b" aria-hidden="true"></div>

        <div className="section-inner">
          <div className="loc-head">
            <span className="loc-kicker">
              <i className="fas fa-location-crosshairs"></i>
              {locationKicker}
            </span>
            <h2 className="section-heading loc-title">
              {locationTitle}
            </h2>
            <p className="section-sub">
              {locationDesc}
            </p>
          </div>

          <div className="location-grid">
            <div className="location-map-wrapper">
              <div className="map-shell">
                <iframe
                  title="Location Map"
                  src={locationMapUrl}
                  className="location-map"
                  allowFullScreen=""
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                ></iframe>

                <div className="map-pin" aria-hidden="true">
                  <span className="map-pin__pulse"></span>
                  <span className="map-pin__pulse map-pin__pulse--2"></span>
                  <span className="map-pin__dot">
                    <i className="fas fa-graduation-cap"></i>
                  </span>
                </div>

                <div className="map-badge">
                  <span className="map-badge__dot"></span>
                  {lang === 'ar' ? 'مفتوح الآن' : 'Open now'}
                </div>

                <div className="map-frame" aria-hidden="true"></div>
              </div>
            </div>

            <div className="location-info">
              <div className="location-info-card">
                <div className="location-info-icon">
                  <i className="fas fa-map-marker-alt"></i>
                </div>
                <div className="loc-card-body">
                  <span className="loc-card-label">{lang === 'ar' ? 'العنوان' : 'Address'}</span>
                  <h4>{locationAddress}</h4>
                  <p>{locationCountry}</p>
                </div>
              </div>

              <div className="location-info-card">
                <div className="location-info-icon">
                  <i className="fas fa-phone-alt"></i>
                </div>
                <div className="loc-card-body">
                  <span className="loc-card-label">{lang === 'ar' ? 'للتواصل' : 'Contact'}</span>
                  <h4 dir="ltr">{locationPhone}</h4>
                  <p>{lang === 'ar' ? 'متاحين للرد طوال اليوم' : 'Available all day'}</p>
                </div>
              </div>

              <div className="location-info-card">
                <div className="location-info-icon">
                  <i className="fas fa-clock"></i>
                </div>
                <div className="loc-card-body">
                  <span className="loc-card-label">{lang === 'ar' ? 'مواعيد العمل' : 'Working Hours'}</span>
                  <h4>{locationHoursDays}</h4>
                  <p>{locationHoursTime}</p>
                </div>
              </div>

              <div className="loc-actions">
                <a
                  href={locationDirectionsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="location-directions-btn"
                >
                  <i className="fas fa-directions"></i>
                  {lang === 'ar' ? 'احصل على الاتجاهات' : 'Get Directions'}
                  <span className="loc-btn-shine" aria-hidden="true"></span>
                </a>

                <a
                  href={locationWhatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="location-directions-btn location-directions-btn--ghost"
                >
                  <i className="fab fa-whatsapp"></i>
                  {lang === 'ar' ? 'راسلنا واتساب' : 'WhatsApp Us'}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── FOOTER ─────────── */}
      <footer className="login-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <img src={brandLogo} alt="Logo" className="footer-logo" />
            <span className="footer-brand-name">
              {isDefaultTenant
                ? (lang === 'ar' ? 'منصة مسار التعليمية' : 'Masar Educational Platform')
                : tenantName}
            </span>
          </div>

          <div className="footer-socials">
            {socials.facebook && (
              <a href={socials.facebook} target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Facebook">
                <i className="fab fa-facebook-f"></i>
              </a>
            )}
            {socials.whatsapp && (
              <a href={socials.whatsapp} target="_blank" rel="noopener noreferrer" className="social-link" aria-label="WhatsApp">
                <i className="fab fa-whatsapp"></i>
              </a>
            )}
            {socials.instagram && (
              <a href={socials.instagram} target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Instagram">
                <i className="fab fa-instagram"></i>
              </a>
            )}
            {socials.youtube && (
              <a href={socials.youtube} target="_blank" rel="noopener noreferrer" className="social-link" aria-label="YouTube">
                <i className="fab fa-youtube"></i>
              </a>
            )}
            {socials.tiktok && (
              <a href={socials.tiktok} target="_blank" rel="noopener noreferrer" className="social-link" aria-label="TikTok">
                <i className="fab fa-tiktok"></i>
              </a>
            )}
          </div>

          <div className="footer-divider"></div>

          <p className="footer-copy">
            {lang === 'ar'
              ? `© 2026 ${isDefaultTenant ? 'منصة مسار التعليمية' : tenantName}. جميع الحقوق محفوظة`
              : `© 2026 ${isDefaultTenant ? 'Masar Educational Platform' : tenantName}. All rights reserved`}
          </p>
        </div>
      </footer>

      {/* ─────────── AUTH MODAL (login only) ─────────── */}
      {showAuthModal && (
        <div className="auth-modal-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="auth-modal aa-auth-modal" onClick={e => e.stopPropagation()} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <button className="auth-modal-close" onClick={() => setShowAuthModal(false)} aria-label="Close">✕</button>

            <h2 style={{ textAlign: 'center', marginBottom: 16 }}>{t.login}</h2>

            {error && <div className="error-message show">{error}</div>}

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
                <button type="button" onClick={() => { navigate('/register') }} className="aa-link-btn">
                  {t['register-btn-link']}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────── FORGOT PASSWORD MODAL ─────────── */}
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

      {/* ─────────── PARENT REPORTS LOOKUP MODAL ─────────── */}
      {showParentModal && (
        <div className="auth-modal-overlay" onClick={() => setShowParentModal(false)}>
          <div className="auth-modal aa-auth-modal" onClick={e => e.stopPropagation()} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <button className="auth-modal-close" onClick={() => setShowParentModal(false)} aria-label="Close">✕</button>
            
            <div className="auth-modal-header" style={{ textAlign: 'center', marginBottom: 20 }}>
              <div className="auth-modal-icon" style={{ background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed', width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justify: 'center', margin: '0 auto 16px', fontSize: '1.6rem' }}>
                <i className="fas fa-user-shield"></i>
              </div>
              <h3>{lang === 'ar' ? 'استعلام تقارير أولياء الأمور' : 'Parent Report Lookup'}</h3>
              <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.9rem', marginTop: 8 }}>
                {lang === 'ar' 
                  ? 'أدخل رقم هاتف ولي الأمر المسجل للوصول المباشر إلى التقرير الدراسي للطالب.' 
                  : 'Enter your registered parent phone number to access the student report.'}
              </p>
            </div>

            {parentModalError && <div className="error-message show" style={{ marginBottom: 16 }}>{parentModalError}</div>}

            {childrenList.length > 0 ? (
              <div className="children-selector">
                <h4 style={{ marginBottom: 12, fontSize: '0.95rem', fontWeight: 'bold' }}>
                  {lang === 'ar' ? 'اختر الطالب المراد استعراض تقريره:' : 'Select student to view report:'}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {childrenList.map((student) => (
                    <button
                      key={student.id}
                      onClick={() => {
                        setShowParentModal(false)
                        navigate(`/public-report?id=${student.id}&token=${student.qr_token || ''}&phone=${encodeURIComponent(parentPhoneInput.trim())}`)
                      }}
                      className="modern-btn"
                      style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        color: '#fff',
                        textAlign: lang === 'ar' ? 'right' : 'left',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderRadius: 12,
                        cursor: 'pointer'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{student.name}</div>
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 2 }}>{t[`grade-${student.grade}`] || student.grade}</div>
                      </div>
                      <i className={`fas ${lang === 'ar' ? 'fa-chevron-left' : 'fa-chevron-right'}`} style={{ color: '#7c3aed' }}></i>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <form onSubmit={handleParentLookup} className="auth-modal-form">
                <div className="input-wrapper">
                  <i className="fas fa-phone"></i>
                  <input 
                    type="tel" 
                    value={parentPhoneInput} 
                    onChange={e => setParentPhoneInput(e.target.value)} 
                    required 
                    placeholder={lang === 'ar' ? 'رقم هاتف ولي الأمر (مثال: 01xxxxxxxxx)' : 'Parent Phone (e.g. 01xxxxxxxxx)'} 
                    dir="ltr" 
                  />
                </div>
                <button type="submit" className="modern-btn" disabled={parentModalLoading}>
                  <span className="btn-text">{lang === 'ar' ? 'عرض التقرير' : 'View Report'}</span>
                  {parentModalLoading && <span className="btn-loader"><span className="spinner"></span></span>}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* helper: toast */
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
