// Login.jsx — MERGED VERSION
// Dynamic theme touches based on resolved tenant.
// Renders the new teacher landing page layout for all tenants,
// with chemistry assets for mona-chem and standard assets for default.

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI, tokenAPI } from '@backend/authApi'
import { supabase } from '@backend/supabase'
import { useAuth } from '../contexts/AuthContext'
import { listPackages } from '@backend/packagesApi'
import { useTenant } from '../contexts/TenantContext'
import { toMapEmbed, toLatLng } from '../utils/mapEmbed'
const LocationMap = React.lazy(() => import('../components/LocationMap'))
import './Login.css'        // existing styles (forms, marketing, footer)
import './login-styles.css'     // new styles (navbar, hero, auth-modal, teacher portrait)
// Custom theme overrides are now dynamically loaded at runtime inside TenantContext

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
    hero_badge: 'جِت فِكرة',
    hero_title_a: 'اللغة العربية',
    hero_title_b: 'لغة الضاد بطعم جديد',
    hero_sub: 'منصة تعليمية متخصّصة في اللغة العربية — سجّل حسابك، يتم اعتماده، وابدأ رحلتك مع شرح يخلّيك تفهم وتحب اللغة.',
    cta_primary: 'أنشئ حسابك الآن',
    cta_secondary: 'لديك حساب؟ ادخل',
    brand_short: 'جِت فِكرة',
    brand_long: 'جِت فِكرة',
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
    hero_badge: "GitFekra",
    hero_title_a: 'Arabic language', hero_title_b: 'made enjoyable',
    hero_sub: "A learning platform dedicated to Arabic. Create your account, get approved, and start learning with a teacher who makes the language click.",
    cta_primary: 'Create account', cta_secondary: 'Have an account? Sign in',
    brand_short: 'GitFekra', brand_long: "GitFekra",
  },
}

export default function Login() {
  const { login, isLoggedIn, user } = useAuth()
  const { tenant, tenantId, tenantSlug, tenantName, isGradeEnabled, themeConfig } = useTenant()
  // Every tenant lets students sign in with a short alphanumeric login code
  // instead of a phone. Purely additive — a normal phone still works.
  const codeLoginEnabled = true
  const isDefaultTenant = !tenantSlug || tenantSlug === 'default'
  const dbLogo = tenant?.logo_url && !tenant.logo_url.includes('3081840') ? tenant.logo_url : null
  const brandLogo = themeConfig.logoUrl || (isDefaultTenant ? null : dbLogo)
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'ar')
  const [selectedBranch, setSelectedBranch] = useState(0) // active branch in the location section
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

  // Teacher portrait hover
  const [portraitHover, setPortraitHover] = useState(false)

  const t = translations[lang]

  const getLocalized = (val, arFallback, enFallback) => {
    if (!val) return lang === 'ar' ? arFallback : enFallback
    if (typeof val === 'object') {
      return val[lang] || val['ar'] || arFallback
    }
    return val
  }

  const brandShort = isDefaultTenant ? t.brand_short : getLocalized(tenant?.config?.branding?.brand_short || themeConfig.branding?.brand_short, tenantName, tenantName)
  const heroTitleA = isDefaultTenant ? t.hero_title_a : getLocalized(tenant?.config?.branding?.hero_title_a || themeConfig.branding?.hero_title_a, tenantName, tenantName)
  const heroTitleB = isDefaultTenant ? t.hero_title_b : getLocalized(tenant?.config?.branding?.hero_title_b || themeConfig.branding?.hero_title_b, '', '')
  const heroSub = isDefaultTenant ? t.hero_sub : getLocalized(tenant?.config?.branding?.hero_sub || themeConfig.branding?.hero_sub, '', '')

  const teacherName = getLocalized(tenant?.config?.teacher?.name || themeConfig.teacher?.name, 'عبدالرحمن علاء', 'Abdelrahman Alaa')
  const teacherRole = getLocalized(tenant?.config?.teacher?.role || themeConfig.teacher?.role, 'مدرّس اللغة العربية', 'Arabic Language Teacher')
  const teacherBio = getLocalized(
    tenant?.config?.teacher?.bio || themeConfig.teacher?.bio,
    'بشرح اللغة العربية بأسلوب بسيط وحديث يقرّب القواعد والنحو والأدب لذهن الطالب. هدفي إن كل طالب يطلع من الدرس فاهم ومستمتع — مش بس حافظ.',
    'I teach Arabic with a modern, approachable style that brings grammar, syntax, and literature to life. My goal: every student walks out understanding — not just memorising.'
  )
  const teacherQuote = getLocalized(
    tenant?.config?.teacher?.quote || themeConfig.teacher?.quote,
    '«اللغة العربية مش صعبة — محتاجة بس حد يقدّمها بطريقة صح.»',
    '“Arabic isn\'t hard — it just needs to be taught the right way.”'
  )
  const teacherImageBase = tenant?.config?.teacher?.image_base || themeConfig.teacher?.image_base || "/images/profile.png"
  const teacherImageHover = tenant?.config?.teacher?.image_hover || themeConfig.teacher?.image_hover || "/images/me.png"
  // Optional stat/identity fields: when the tenant leaves them empty they must
  // DISAPPEAR from the UI (no hardcoded default). Each resolves to null unless
  // set, and every render site is guarded so nothing hollow shows.
  const optField = (val) => (val ? getLocalized(val, null, null) : null)
  const teacherExp = optField(tenant?.config?.teacher?.experience || themeConfig.teacher?.experience)
  const teacherStudents = optField(tenant?.config?.teacher?.students_count || themeConfig.teacher?.students_count)
  const teacherSatisfaction = optField(tenant?.config?.teacher?.satisfaction || themeConfig.teacher?.satisfaction)
  const teacherTargetStage = optField(tenant?.config?.teacher?.target_stage || themeConfig.teacher?.target_stage)
  const teacherTargetStageLabel = getLocalized(
    tenant?.config?.teacher?.target_stage_label || themeConfig.teacher?.target_stage_label,
    'التخصص',
    'Specialty'
  )
  const teacherLearningSystem = optField(tenant?.config?.teacher?.learning_system || themeConfig.teacher?.learning_system)

  const socials = {
    facebook: tenant?.config?.socials?.facebook || themeConfig.socials?.facebook || 'https://www.facebook.com',
    whatsapp: tenant?.config?.socials?.whatsapp || themeConfig.socials?.whatsapp || 'https://wa.me/',
    instagram: tenant?.config?.socials?.instagram || themeConfig.socials?.instagram || 'https://www.instagram.com',
    youtube: tenant?.config?.socials?.youtube || themeConfig.socials?.youtube || 'https://www.youtube.com',
    tiktok: tenant?.config?.socials?.tiktok || themeConfig.socials?.tiktok || 'https://www.tiktok.com'
  }

  const locationKicker = getLocalized(tenant?.config?.location?.kicker || themeConfig.location?.kicker, 'زورنا', 'Visit us')
  const locationTitle = getLocalized(tenant?.config?.location?.title || themeConfig.location?.title, 'موقعنا على الخريطة', 'Find Us on the Map')
  const locationDesc = getLocalized(
    tenant?.config?.location?.description || themeConfig.location?.description,
    'تقدر تزورنا في مقرّنا بدمنهور — قريب وسهل توصله.',
    'Drop by our center in Damanhour — easy to find and easy to reach.'
  )
  // No fabricated fallbacks — an unconfigured field simply doesn't render.
  const locationAddress = getLocalized(tenant?.config?.location?.address || themeConfig.location?.address, '', '') || null
  const locationCountry = getLocalized(tenant?.config?.location?.country || themeConfig.location?.country, '', '') || null
  const locationMapUrl = toMapEmbed(tenant?.config?.location?.map_iframe_url || themeConfig.location?.map_iframe_url)
  const locationPhone = tenant?.config?.location?.phone || tenant?.config?.contact?.phone || themeConfig.location?.phone || null

  // Per-tenant landing sections (tenants.config.login_sections). Missing key =
  // visible, so existing tenants render exactly as before.
  const loginSections = tenant?.config?.login_sections || {}
  const showSection = (key) => loginSections[key] !== false

  const locationHoursDays = getLocalized(tenant?.config?.location?.hours_days || themeConfig.location?.hours_days, '', '') || null
  const locationHoursTime = getLocalized(tenant?.config?.location?.hours_time || themeConfig.location?.hours_time, '', '') || null
  const locationDirectionsLink = tenant?.config?.location?.directions_link || themeConfig.location?.directions_link || null
  const locationWhatsappLink = tenant?.config?.location?.whatsapp_link || themeConfig.location?.whatsapp_link || null
  const branchesList = tenant?.config?.location?.branches || themeConfig.location?.branches || null
  // The section renders only when it has something real to show
  const hasLocationData = (branchesList && branchesList.length > 0) || !!(locationAddress || locationMapUrl || locationPhone)

  // Normalize branches into one array the interactive location UI iterates —
  // whether the tenant defined branches[] or only the top-level location.
  const locBranches = useMemo(() => {
    const raw = (branchesList && branchesList.length > 0)
      ? branchesList
      : [{
          name: locationTitle,
          address: locationAddress,
          phone: locationPhone,
          map_iframe_url: (tenant?.config?.location?.map_iframe_url || themeConfig.location?.map_iframe_url),
          directions_link: locationDirectionsLink,
          hours_days: (tenant?.config?.location?.hours_days || themeConfig.location?.hours_days),
          hours_time: (tenant?.config?.location?.hours_time || themeConfig.location?.hours_time),
        }]
    return raw
      .map((b, i) => ({
        name: getLocalized(b.name, lang === 'ar' ? `الفرع ${i + 1}` : `Branch ${i + 1}`, lang === 'ar' ? `الفرع ${i + 1}` : `Branch ${i + 1}`),
        address: b.address ? getLocalized(b.address, '', '') : '',
        phone: b.phone ? getLocalized(b.phone, '', '') : (locationPhone || ''),
        mapUrl: toMapEmbed(b.map_iframe_url) || locationMapUrl,
        ...(toLatLng(b.map_iframe_url) || toLatLng(tenant?.config?.location?.map_iframe_url || themeConfig.location?.map_iframe_url) || {}),
        directions: b.directions_link || locationDirectionsLink,
        hoursDays: b.hours_days ? getLocalized(b.hours_days, '', '') : locationHoursDays,
        hoursTime: b.hours_time ? getLocalized(b.hours_time, '', '') : locationHoursTime,
      }))
      // drop entirely empty branches
      .filter(b => b.address || b.mapUrl || b.phone)
  }, [branchesList, locationTitle, locationAddress, locationPhone, locationMapUrl, locationDirectionsLink, locationHoursDays, locationHoursTime, lang])

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
    { n: '1', title: tenantSlug === 'power-platform' ? 'انشئ حسابك' : 'احصل على حسابك', desc: 'تواصل مع المعلم أو إدارة المنصة لتسجيل حسابك واستلام بيانات الدخول الخاصة بك.' },
    { n: '2', title: 'سجّل دخولك', desc: 'أدخل رقم هاتفك وكلمة المرور الخاصة بك في النموذج بالأعلى للدخول الآمن إلى حسابك.' },
    { n: '3', title: 'انطلق في مسارك', desc: 'شاهد المحاضرات والملخصات، حلّ واجباتك واختباراتك، وتابع أداءك خطوة بخطوة للتميز.' },
  ] : [
    { n: '1', title: tenantSlug === 'power-platform' ? 'Create Your Account' : 'Get Your Account', desc: 'Contact your teacher or the platform administration to register and receive your credentials.' },
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
        const pkgs = await listPackages(tenantId)
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
  }, [isLoggedIn, user, tenantId])

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
    
    // Update tab title dynamically based on active language. Tenants may
    // define a keyword-rich branding.seo_title (used on their public landing
    // for search engines); others keep the short brand title as before.
    const localizedTitle = themeConfig?.branding?.seo_title?.[lang]
      || (themeConfig?.branding?.brand_short
        ? (themeConfig.branding.brand_short[lang] || themeConfig.branding.brand_short['ar'] || tenantName)
        : tenantName)
    document.title = localizedTitle
  }, [lang, themeConfig, tenantName])

  // Remember Me: prefill phone
  useEffect(() => {
    const remembered = localStorage.getItem('masaar-remembered-phone')
    if (remembered) {
      setPhone(remembered)
      setRememberMe(true)
    }
  }, [])

  // Staggered Scroll-Reveal Observer for dynamic landing content
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
          }
        })
      },
      { threshold: 0.05, rootMargin: '0px 0px -20px 0px' }
    )

    // Observe immediately and after a short tick for dynamic async components
    const observeAll = () => {
      const elements = document.querySelectorAll('.reveal-on-scroll')
      elements.forEach((el) => observer.observe(el))
    }

    observeAll()
    const timer = setTimeout(observeAll, 100)

    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [activePackages])

  // Button Ripple Handler
  const handleBtnRipple = (e) => {
    const btn = e.currentTarget
    const rect = btn.getBoundingClientRect()
    const circle = document.createElement('span')
    const diameter = Math.max(rect.width, rect.height)
    const radius = diameter / 2

    circle.style.width = circle.style.height = `${diameter}px`
    circle.style.left = `${e.clientX - rect.left - radius}px`
    circle.style.top = `${e.clientY - rect.top - radius}px`
    circle.classList.add('btn-ripple-wave')

    const existing = btn.getElementsByClassName('btn-ripple-wave')[0]
    if (existing) existing.remove()

    btn.appendChild(circle)
    setTimeout(() => circle.remove(), 600)
  }

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
    const handleOk = phone.trim().length >= 8 || (codeLoginEnabled && /^[a-zA-Z0-9]{4,20}$/.test(phone.trim()))
    if (!handleOk) { setError(lang === 'ar' ? (codeLoginEnabled ? 'رقم الهاتف أو الكود غير صحيح' : 'رقم الهاتف غير صحيح') : (codeLoginEnabled ? 'Invalid phone or code' : 'Invalid phone number')); return }
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
    const handleTrim = forgotPhone.trim()
    const isValidHandle = handleTrim.length >= 8 || /^[a-zA-Z0-9_\-]{3,20}$/.test(handleTrim)
    if (!isValidHandle) {
      setForgotError(lang === 'ar'
        ? (codeLoginEnabled ? 'رقم الهاتف أو الكود غير صحيح' : 'رقم الهاتف غير صحيح')
        : (codeLoginEnabled ? 'Invalid phone or code' : 'Invalid phone number'))
      return
    }
    if (forgotName.trim().length < 3) { setForgotError(lang === 'ar' ? 'الاسم يجب أن يكون 3 أحرف على الأقل' : 'Name must be at least 3 characters'); return }
    setForgotLoading(true)
    try {
      const { error: insertError } = await supabase
        .from('password_reset_requests')
        .insert({ phone: handleTrim, full_name: forgotName.trim(), status: 'pending', tenant_id: tenantId })
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
            <img src={brandLogo} alt={brandShort} className="aa-brand-logo" />
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
              <button className="aa-btn aa-btn-primary aa-btn-lg" onClick={(e) => { handleBtnRipple(e); openAuth(true) }}>
                {t.cta_primary} <span>{Arrow}</span>
              </button>
              <button className="aa-btn aa-btn-outline aa-btn-lg" onClick={(e) => { handleBtnRipple(e); openAuth(false) }}>
                {t.cta_secondary}
              </button>
              <button className="aa-btn aa-btn-outline aa-btn-lg" onClick={(e) => {
                handleBtnRipple(e);
                setParentPhoneInput(''); setParentModalError(''); setChildrenList([]); setShowParentModal(true);
              }} style={{ background: 'var(--primary-soft, rgba(99, 102, 241, 0.1))', borderColor: 'var(--primary, rgba(99, 102, 241, 0.25))', color: 'var(--primary, #a78bfa)' }}>
                <i className="fas fa-chart-line" style={{ marginInlineEnd: 8 }}></i>
                {lang === 'ar' ? 'تقارير ولي الأمر' : 'Parent Reports'}
              </button>
            </div>
          </div>

          {/* Teacher portrait */}
          {showSection('teacher') && (
          <div className="aa-portrait-wrap">
            <div
              className="aa-portrait"
              onMouseEnter={() => setPortraitHover(true)}
              onMouseLeave={() => setPortraitHover(false)}
              onTouchStart={() => setPortraitHover(true)}
              onTouchEnd={() => setPortraitHover(false)}
            >
              <div className="aa-portrait-img">
                <img src={teacherImageBase} alt={lang === 'ar' ? `الأستاذ ${teacherName}` : `Mr. ${teacherName}`} className="aa-img-base" />
                <div className="aa-portrait-vignette" />
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

                <div className="aa-portrait-chips">
                  <span className="aa-chip aa-chip-accent">{lang === 'ar' ? 'اعتماد أكاديمي' : 'Certified Lecturer'}</span>
                  {teacherExp && (
                    <span className="aa-chip">
                      {teacherExp.includes('خبرة') || teacherExp.includes('exp')
                        ? teacherExp
                        : (teacherExp.includes('عام') || teacherExp.includes('Year')
                            ? `${teacherExp} ${lang === 'ar' ? 'خبرة' : 'exp'}`
                            : `${teacherExp} ${lang === 'ar' ? 'سنوات خبرة' : 'years experience'}`)}
                    </span>
                  )}
                </div>
                {(teacherTargetStage || teacherLearningSystem) && (
                <div className="aa-metrics">
                  {teacherTargetStage && (
                  <div>
                    <div className="aa-metric-label">{teacherTargetStageLabel}</div>
                    <div className="aa-metric-value">{teacherTargetStage}</div>
                  </div>
                  )}
                  {teacherLearningSystem && (
                  <div>
                    <div className="aa-metric-label">{lang === 'ar' ? 'نظام التعلم' : 'Learning System'}</div>
                    <div className="aa-metric-value"><span className="aa-pulse" /> {teacherLearningSystem}</div>
                  </div>
                  )}
                </div>
                )}
              </div>
            </div>
          </div>
          )}
        </div>
      </section>

      {/* ─────────── ABOUT TEACHER ─────────── */}
      {showSection('about') && (
      <section id="about" className="login-about reveal-on-scroll">
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

            {(teacherExp || teacherStudents || teacherSatisfaction) && (
            <div className="about-stats">
              {teacherExp && (
              <div className="about-stat">
                <i className="fas fa-award"></i>
                <div className="about-stat-value">{teacherExp}</div>
                <div className="about-stat-label">
                  {lang === 'ar' ? 'سنوات خبرة' : 'Years of experience'}
                </div>
              </div>
              )}

              {teacherStudents && (
                <div className="about-stat">
                  <i className="fas fa-users"></i>
                  <div className="about-stat-value">{teacherStudents}</div>
                  <div className="about-stat-label">
                    {lang === 'ar' ? 'طالب تم تدريسهم' : 'Students taught'}
                  </div>
                </div>
              )}

              {teacherSatisfaction && (
              <div className="about-stat">
                <i className="fas fa-book-open"></i>
                <div className="about-stat-value">{teacherSatisfaction}</div>
                <div className="about-stat-label">
                  {lang === 'ar' ? 'رضا الطلاب' : 'Student satisfaction'}
                </div>
              </div>
              )}
            </div>
            )}
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
      )}

      {/* ─────────── PACKAGES SHOWCASE SECTION ─────────── */}
      {showSection('packages') && activePackages.length > 0 && (
        <section id="packages" className="login-packages-showcase reveal-on-scroll">
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
                    className={`landing-package-card reveal-on-scroll reveal-delay-${(idx % 3) + 1}`}
                  >
                    <div className="landing-package-image" style={{ background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                      {pkg.thumbnail ? (
                        <img 
                          src={pkg.thumbnail}
                          alt={pkg.title}
                          loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.5s' }}
                          className="landing-pkg-img"
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, var(--primary, #7c3aed), var(--secondary, #6366f1))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                          onClick={(e) => { handleBtnRipple(e); handleBuyClick(pkg); }}
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
      {showSection('features') && (
      <section id="features" className="login-features reveal-on-scroll">
        <div className="section-inner">
          <h2 className="section-heading">{lang === 'ar' ? `لماذا ${brandShort}؟` : `Why ${brandShort}?`}</h2>
          <p className="section-sub">{lang === 'ar' ? 'كل ما تحتاجه لرحلة تعليمية ناجحة في مكان واحد' : 'Everything you need for a successful learning journey in one place'}</p>
          <div className="features-grid">
            {features.map((f, i) => (
              <div key={i} className={`feature-card reveal-on-scroll reveal-delay-${(i % 4) + 1}`}>
                <div className="feature-icon"><i className={`fas ${f.icon}`}></i></div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {showSection('steps') && (
      <section className="login-steps reveal-on-scroll">
        <div className="section-inner">
          <h2 className="section-heading">{lang === 'ar' ? 'كيف تبدأ؟' : 'How to Get Started?'}</h2>
          <p className="section-sub">{lang === 'ar' ? 'ثلاث خطوات بسيطة تفصلك عن رحلتك التعليمية' : 'Three simple steps to begin your learning journey'}</p>
          <div className="steps-grid">
            {steps.map((s, i) => (
              <div key={i} className={`step-card reveal-on-scroll reveal-delay-${i + 1}`}>
                <div className="step-number">{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {showSection('location') && hasLocationData && (
      <section className="login-location reveal-on-scroll" id="location">
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

          {(() => {
            const sel = locBranches[Math.min(selectedBranch, locBranches.length - 1)] || locBranches[0]
            if (!sel) return null
            const anyGeo = locBranches.some(b => b.lat != null && b.lng != null)
            const anyMap = anyGeo || locBranches.some(b => b.mapUrl)
            return (
              <div className={`loc-v2 ${anyMap ? '' : 'loc-v2--nomap'} ${locBranches.length === 1 ? 'loc-v2--single' : ''}`}>
                {/* Branch selector list — click to reveal that branch on the map */}
                <div className="loc-v2-list">
                  {locBranches.map((b, i) => {
                    const active = b === sel
                    return (
                      <button
                        type="button"
                        key={i}
                        className={`loc-v2-branch ${active ? 'is-active' : ''}`}
                        onClick={() => setSelectedBranch(i)}
                        aria-pressed={active}
                      >
                        <span className="loc-v2-chip"><i className="fas fa-location-dot"></i></span>
                        <span className="loc-v2-branch-body">
                          <span className="loc-v2-branch-head">
                            <span className="loc-v2-branch-name">{b.name}</span>
                            {active && locBranches.length > 1 && (
                              <span className="loc-v2-branch-badge">{lang === 'ar' ? 'مُحدد' : 'Selected'}</span>
                            )}
                          </span>
                          {b.address && <span className="loc-v2-branch-addr">{b.address}</span>}
                          {b.phone && (
                            <span className="loc-v2-branch-contact">
                              <i className="fas fa-phone"></i>
                              <span className="loc-v2-branch-phone" dir="ltr">{b.phone}</span>
                            </span>
                          )}
                          {(b.hoursDays || b.hoursTime) && (
                            <span className="loc-v2-branch-meta">
                              <span className="loc-v2-meta">
                                <i className="fas fa-clock"></i>{[b.hoursDays, b.hoursTime].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                          )}
                        </span>
                        <i className="fas fa-chevron-left loc-v2-branch-arrow"></i>
                      </button>
                    )
                  })}
                </div>

                {/* Stage: the selected branch's map + directions */}
                {anyMap && (
                  <div className="loc-v2-stage">
                    {anyGeo ? (
                      /* Interactive Leaflet map — all branches as markers,
                         flies to the selected one; renders everywhere (no
                         Google-embed blank-off-domain issue). */
                      <div className="map-shell loc-v2-map loc-v2-map--leaflet">
                        <React.Suspense fallback={<div className="loc-v2-map-empty"><i className="fas fa-spinner fa-spin"></i></div>}>
                          <LocationMap branches={locBranches} selected={selectedBranch} onSelect={setSelectedBranch} />
                        </React.Suspense>
                      </div>
                    ) : (
                      <div className="map-shell loc-v2-map">
                        {sel.mapUrl ? (
                          <iframe
                            title={`Location Map - ${sel.name}`}
                            key={sel.mapUrl}
                            src={sel.mapUrl}
                            className="location-map"
                            allowFullScreen=""
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                          ></iframe>
                        ) : (
                          <div className="loc-v2-map-empty">
                            <i className="fas fa-map-location-dot"></i>
                            <span>{sel.name}</span>
                          </div>
                        )}
                        <div className="map-pin" aria-hidden="true">
                          <span className="map-pin__pulse"></span>
                          <span className="map-pin__pulse map-pin__pulse--2"></span>
                          <span className="map-pin__dot"><i className="fas fa-graduation-cap"></i></span>
                        </div>
                        <div className="map-badge">
                          <span className="map-badge__dot"></span>
                          {lang === 'ar' ? 'مفتوح الآن' : 'Open now'}
                        </div>
                        <div className="map-frame" aria-hidden="true"></div>
                      </div>
                    )}

                    <div className="loc-v2-stage-foot">
                      <div className="loc-v2-stage-info">
                        <span className="loc-v2-stage-name">{sel.name}</span>
                        {sel.address && <span className="loc-v2-stage-addr">{sel.address}</span>}
                      </div>
                      {(sel.directions || locationWhatsappLink) && (
                        <div className="loc-actions">
                          {sel.directions && (
                            <a href={sel.directions} target="_blank" rel="noopener noreferrer" className="location-directions-btn">
                              <i className="fas fa-directions"></i>
                              {lang === 'ar' ? 'احصل على الاتجاهات' : 'Get Directions'}
                              <span className="loc-btn-shine" aria-hidden="true"></span>
                            </a>
                          )}
                          {locationWhatsappLink && (
                            <a href={locationWhatsappLink} target="_blank" rel="noopener noreferrer" className="location-directions-btn location-directions-btn--ghost">
                              <i className="fab fa-whatsapp"></i>
                              {lang === 'ar' ? 'راسلنا واتساب' : 'WhatsApp Us'}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </section>
      )}

      {/* ─────────── FOOTER ─────────── */}
      <footer className="login-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <img src={brandLogo} alt={brandShort} className="footer-logo" loading="lazy" />
            <span className="footer-brand-name">
              {isDefaultTenant
                ? (lang === 'ar' ? 'جِت فِكرة' : 'GitFekra')
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
              ? `© 2026 ${isDefaultTenant ? 'جِت فِكرة' : tenantName}. جميع الحقوق محفوظة`
              : `© 2026 ${isDefaultTenant ? 'GitFekra' : tenantName}. All rights reserved`}
          </p>

          {/* Developer credit — moved here from the in-app Footer so it shows on
              the public login page only, not inside the app. */}
          <p className="login-dev-credit" dir="ltr">
            <a href="/credits" style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }} title="View Developer Credits & Architecture">
              <i className="fas fa-code"></i>
              <span>Developed by</span>
              <strong>Abdelrahman Alaa</strong>
              <span className="amp">&amp;</span>
              <strong>Eyad Elalkamy</strong>
            </a>
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
                  <p>{lang === 'ar' ? (codeLoginEnabled ? 'أدخل رقم هاتفك أو كود الطالب واسمك بالكامل لتقديم طلب استعادة كلمة المرور.' : 'أدخل رقم هاتفك واسمك بالكامل لتقديم طلب استعادة كلمة المرور.') : (codeLoginEnabled ? 'Enter your phone number or student code and full name to request a password reset.' : 'Enter your phone number and full name to request a password reset.')}</p>
                </div>
                {forgotError && <div className="error-message show">{forgotError}</div>}
                <form onSubmit={handleForgotSubmit} className="auth-modal-form">
                  <div className="input-wrapper">
                    <i className={codeLoginEnabled ? "fas fa-id-card" : "fas fa-phone"}></i>
                    <input type="text" value={forgotPhone} onChange={e => setForgotPhone(e.target.value)} required placeholder={codeLoginEnabled ? (lang === 'ar' ? 'رقم الهاتف أو كود الطالب' : 'Phone number or student code') : t.phone} dir="auto" />
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
              <div className="auth-modal-icon" style={{ width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justify: 'center', margin: '0 auto 16px', fontSize: '1.6rem' }}>
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
                      <i className={`fas ${lang === 'ar' ? 'fa-chevron-left' : 'fa-chevron-right'}`} style={{ color: 'var(--primary, #7c3aed)' }}></i>
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
