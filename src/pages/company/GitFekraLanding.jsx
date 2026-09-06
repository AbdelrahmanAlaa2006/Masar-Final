import React, { useState, useEffect, useMemo } from 'react'
import './GitFekraLanding.css'
import { PLATFORMS, SERVICES, PROCESS, TOUR } from './products'
import { supabase } from '@backend/supabase'
import { cached } from '../../utils/cache'

/* GitFekra — company site (shown on the default tenant / gitfekra.com).
   Editorial, print-inspired design: light paper background, ink typography,
   hairline rules, numbered sections. Self-contained (own header/footer). */

// Helper to convert English digits to Eastern Arabic numerals
function toArabicDigits(num) {
  const map = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
  return String(num).replace(/[0-9]/g, d => map[+d])
}

function resolveProductsFromTenants(dbTenants) {
  if (!dbTenants || dbTenants.length === 0) return []

  const presetMap = new Map()
  PLATFORMS.forEach(p => {
    presetMap.set(p.id, p)
    if (p.id === 'miracle-english') {
      presetMap.set('waled-english', p)
      presetMap.set('sherif-english', p)
    }
    if (p.id === 'power-platform') {
      presetMap.set('mohamed-abdella', p)
      presetMap.set('sherif-programming', p)
    }
    if (p.id === 'belqadar-math') {
      presetMap.set('math', p)
      presetMap.set('sherif-math', p)
      presetMap.set('belqadar', p)
      presetMap.set('belqadar-math', p)
    }
    if (p.id === 'eldad-arabic') {
      presetMap.set('eldad', p)
    }
    if (p.id === 'elsharawy-primary') {
      presetMap.set('elsharawy', p)
      presetMap.set('elshaarawy', p)
    }
    if (p.id === 'mohamed-yasser-english') {
      presetMap.set('mohamed-yasser', p)
    }
  })

  return dbTenants
    .filter(t => t.slug !== 'default')
    .map(t => {
      const preset = presetMap.get(t.slug) || presetMap.get(t.id) || null
      const isSuspended = t.status === 'suspended' || t.config?.status === 'suspended' || t.config?.is_suspended === true
      const status = isSuspended ? 'suspended' : 'live'
      const cfg = t.config || {}
      
      const teacherName = (cfg.teacher?.name && cfg.teacher.name !== 'Admin') 
        ? cfg.teacher.name 
        : (preset?.owner?.ar || t.name)
        
      const teacherRole = cfg.teacher?.role 
        || preset?.subject?.ar 
        || 'منصة تعليمية متكاملة'
        
      const teacherImg = cfg.teacher?.image_base 
        || cfg.teacher?.image 
        || preset?.image 
        || null
        
      const logoImg = t.logo_url || preset?.logo || null
      const primaryCol = t.primary_color || preset?.accent || '#7c3aed'
      const platformUrl = t.domain ? `https://${t.domain}/login` : `/login?tenant=${t.slug}`

      return {
        id: t.id,
        slug: t.slug,
        status: status,
        name: {
          ar: t.name || preset?.name?.ar || 'منصة تعليمية',
          en: preset?.name?.en || t.name || 'Education Platform'
        },
        owner: {
          ar: teacherName,
          en: preset?.owner?.en || teacherName
        },
        subject: {
          ar: teacherRole,
          en: preset?.subject?.en || teacherRole
        },
        blurb: {
          ar: cfg.branding?.hero_sub || cfg.branding?.description || preset?.blurb?.ar || 'منصة متكاملة للمحاضرات والامتحانات والواجبات والمتابعة الدقيقة.',
          en: preset?.blurb?.en || 'A comprehensive platform for lectures, exams, homework, and student tracking.'
        },
        accent: primaryCol,
        image: teacherImg,
        imagePosition: preset?.imagePosition || 'center top',
        imageStyle: preset?.imageStyle || {},
        logo: logoImg,
        url: platformUrl
      }
    })
}

const COPY = {
  ar: {
    dir: 'rtl',
    nav: { services: 'ماذا نبني', tour: 'جولة', work: 'أعمالنا', process: 'كيف نعمل', about: 'من نحن', contact: 'تواصل' },
    hero_kicker: 'GitFekra — شركة برمجيات متخصصة في المنصات التعليمية',
    hero_title: 'نبني لكل مدرّس منصته التعليمية الخاصة.',
    hero_sub: 'من الفكرة إلى الإطلاق: منصة كاملة باسمك وهويتك — فيديوهات محمية، امتحانات إلكترونية، حضور، مدفوعات، ومتابعة أولياء الأمور. أنت تدرّس، ونحن نتولى الباقي.',
    cta_primary: 'اطلب منصتك',
    cta_secondary: 'شاهد أعمالنا',
    services_kicker: 'ماذا نبني لك',
    services_title: 'كل ما يحتاجه مدرّس ليعمل أونلاين وفي السنتر',
    badge_live: 'يعمل الآن',
    badge_suspended: 'متوقفة مؤقتاً',
    badge_soon: 'قيد الإطلاق',
    visit_platform: 'زيارة المنصة',
    tour_kicker: 'جولة داخل المنصة',
    tour_title: 'شاهد ما يحصل عليه طلابك',
    tour_note: 'لقطات حقيقية من المنصة — اضغط على أي شاشة لتكبيرها.',
    role_student: 'واجهة الطالب',
    role_admin: 'لوحة المشرف',
    work_kicker: 'أعمالنا',
    work_title: 'منصات بنيناها لمدرّسين حقيقيين',
    work_note: 'كل منصة مستقلة بهوية صاحبها — الاسم، الألوان، والمحتوى ملك المعلم بالكامل.',
    process_kicker: 'كيف نعمل',
    process_title: 'أربع خطوات من أول مكالمة إلى أول حصة',
    about_kicker: 'من نحن',
    about_title: 'شركة متخصصة، بمعايير عالية',
    about_body_1: 'GitFekra شركة برمجيات مصرية متخصصة في بناء المنصات التعليمية. بدأنا من قلب المجال: مدرّسون وسناتر يحتاجون أدوات حقيقية تُدار بسهولة وتصمد وقت الضغط — ليالي الامتحانات، ومواسم الحجز، ومئات الطلاب في نفس اللحظة.',
    about_body_2: 'لا نبيع قوالب جاهزة. كل منصة نسلّمها تمر بنفس المعايير: أداء سريع، حماية لبيانات الطلاب، وتجربة استخدام يفهمها الطالب وولي الأمر من أول مرة.',
    principles: [
      { t: 'هويتك أولاً', d: 'المنصة تحمل اسمك وعلامتك — نحن في الخلفية.' },
      { t: 'بيانات طلابك في أمان', d: 'صلاحيات دقيقة، نسخ احتياطي، وحماية للمحتوى من التسريب.' },
      { t: 'دعم من بشر', d: 'فريق يرد عليك، لا نظام تذاكر بلا روح.' },
    ],
    contact_kicker: 'تواصل',
    contact_title: 'جاهز تبدأ منصتك؟',
    contact_body: 'احكِ لنا عن مادتك وطريقة شغلك، ونعود إليك بتصوّر كامل خلال أيام.',
    contact_cta: 'راسلنا على البريد',
    footer_tag: 'برمجيات تعليمية تُبنى بعناية.',
    footer_made: 'صُنع في مصر',
    rights: 'جميع الحقوق محفوظة',
  },
  en: {
    dir: 'ltr',
    nav: { services: 'What we build', tour: 'Tour', work: 'Work', process: 'Process', about: 'About', contact: 'Contact' },
    hero_kicker: 'GitFekra — an education software company',
    hero_title: 'We build every teacher their own education platform.',
    hero_sub: 'From idea to launch: a complete platform under your name and brand — protected videos, online exams, attendance, payments, and parent follow-up. You teach; we handle the rest.',
    cta_primary: 'Start your platform',
    cta_secondary: 'See our work',
    services_kicker: 'What we build',
    services_title: 'Everything a teacher needs, online and in-center',
    badge_live: 'Live',
    badge_suspended: 'Suspended',
    badge_soon: 'Launching soon',
    visit_platform: 'Visit platform',
    tour_kicker: 'Product tour',
    tour_title: 'See what your students get',
    tour_note: 'Real screens from the platform — click any shot to enlarge.',
    role_student: 'Student view',
    role_admin: 'Admin panel',
    work_kicker: 'Our work',
    work_title: 'Platforms we built for real teachers',
    work_note: 'Every platform stands on its own, under its owner’s identity — the name, colors, and content belong entirely to the teacher.',
    process_kicker: 'Process',
    process_title: 'Four steps from first call to first lesson',
    about_kicker: 'About',
    about_title: 'A specialized company with a high bar',
    about_body_1: 'GitFekra is an Egyptian software company specialized in education platforms. We started inside the field itself: teachers and centers who need real tools that are easy to run and hold up under pressure — exam nights, booking seasons, hundreds of students at once.',
    about_body_2: 'We don’t sell templates. Every platform we deliver passes the same bar: fast performance, protected student data, and an experience that students and parents understand on first use.',
    principles: [
      { t: 'Your identity first', d: 'The platform carries your name and brand — we stay in the background.' },
      { t: 'Student data kept safe', d: 'Fine-grained permissions, backups, and leak-protected content.' },
      { t: 'Support from humans', d: 'A team that answers you, not a soulless ticket queue.' },
    ],
    contact_kicker: 'Contact',
    contact_title: 'Ready to start your platform?',
    contact_body: 'Tell us about your subject and how you work, and we’ll come back with a full plan within days.',
    contact_cta: 'Email us',
    footer_tag: 'Education software, built with care.',
    footer_made: 'Made in Egypt',
    rights: 'All rights reserved',
  },
}

const CONTACT_EMAIL = 'hello@gitfekra.com'

// Reveal-on-scroll: adds .in when an element enters the viewport.
function useReveal(lang) {
  useEffect(() => {
    const els = document.querySelectorAll('.gf-reveal')
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } })
    }, { threshold: 0.12 })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [lang])
}

function Wordmark() {
  return (
    <span className="gf-wordmark" dir="ltr">
      Git<em>Fekra</em>
    </span>
  )
}

const ROTATING_WORDS = {
  ar: [
    'منصته التعليمية',
    'هويته المستقلة',
    'سنتره الأونلاين',
    'علامته التجارية',
  ],
  en: [
    'their own platform',
    'their independent brand',
    'their online center',
    'their custom web app',
  ],
}

export default function GitFekraLanding() {
  const [lang, setLang] = useState('ar')
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem('gf-theme')
      if (saved) return saved === 'dark'
      return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches || false
    } catch { return false }
  })
  const [tourShot, setTourShot] = useState(null)
  const [tourTab, setTourTab] = useState('student')
  const [tourIndex, setTourIndex] = useState(0)
  const [rotIndex, setRotIndex] = useState(0)
  const [isRotating, setIsRotating] = useState(false)
  const [dbTenants, setDbTenants] = useState([])
  const [tenantsLoading, setTenantsLoading] = useState(true)

  // Fetch real tenants from database to keep showcase and metrics 100% synchronized
  useEffect(() => {
    let isMounted = true
    async function loadTenants() {
      try {
        const data = await cached('gitfekra-public-tenants', 60 * 1000, async () => {
          const { data: list, error } = await supabase
            .from('tenants')
            .select('id, slug, name, domain, logo_url, primary_color, secondary_color, config, status, created_at')
            .neq('slug', 'default')
            .order('created_at', { ascending: true })
          if (error) throw error
          return list || []
        })
        if (isMounted && data) {
          setDbTenants(data)
        }
      } catch (err) {
        console.error('Failed to load public tenants for GitFekra landing:', err)
      } finally {
        if (isMounted) setTenantsLoading(false)
      }
    }
    loadTenants()
    return () => { isMounted = false }
  }, [])

  const platforms = useMemo(() => {
    if (dbTenants && dbTenants.length > 0) {
      return resolveProductsFromTenants(dbTenants)
    }
    return PLATFORMS
  }, [dbTenants])

  const livePlatforms = useMemo(() => platforms.filter(p => p.status === 'live'), [platforms])
  const suspendedPlatforms = useMemo(() => platforms.filter(p => p.status === 'suspended'), [platforms])
  const liveCount = livePlatforms.length
  const suspendedCount = suspendedPlatforms.length

  const liveCountDisplay = lang === 'ar' ? toArabicDigits(liveCount) : String(liveCount)
  const suspendedCountDisplay = lang === 'ar' ? toArabicDigits(suspendedCount) : String(suspendedCount)

  const dynamicStats = useMemo(() => [
    { 
      v: liveCountDisplay, 
      l: lang === 'ar' ? 'منصات تعمل الآن' : 'platforms live today' 
    },
    { 
      v: lang === 'ar' ? 'آلاف' : 'Thousands', 
      l: lang === 'ar' ? 'الطلاب يستخدمونها يومياً' : 'of students using them daily' 
    },
    { 
      v: suspendedCountDisplay, 
      l: lang === 'ar' 
        ? (suspendedCount > 0 ? 'منصات متوقفة مؤقتاً' : 'منصة قيد الإطلاق') 
        : (suspendedCount > 0 ? 'platforms suspended' : 'platform launching soon') 
    },
  ], [liveCountDisplay, suspendedCountDisplay, suspendedCount, lang])

  const tourShots = TOUR.filter((s) => s.role === tourTab)
  const currentShot = tourShots[Math.min(tourIndex, tourShots.length - 1)]
  const t = COPY[lang]
  useReveal(lang)

  // Rotate hero keyword every 3.2s with a smooth slide transition
  useEffect(() => {
    const id = setInterval(() => {
      setIsRotating(true)
      setTimeout(() => {
        setRotIndex((i) => (i + 1) % ROTATING_WORDS[lang].length)
        setIsRotating(false)
      }, 300)
    }, 3200)
    return () => clearInterval(id)
  }, [lang])

  // Auto-advance the showcase every 6s (paused while the lightbox is open)
  useEffect(() => {
    if (tourShot) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return
    const id = setInterval(() => setTourIndex((i) => (i + 1) % tourShots.length), 6000)
    return () => clearInterval(id)
  }, [tourIndex, tourShot, tourTab, tourShots.length])

  // Close the tour lightbox with Escape
  useEffect(() => {
    if (!tourShot) return
    const onKey = (e) => { if (e.key === 'Escape') setTourShot(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tourShot])

  useEffect(() => {
    document.title = lang === 'ar' ? 'GitFekra — جِت فِكرة | منصات تعليمية للمدرّسين' : 'GitFekra — Education platforms for teachers'
    document.documentElement.setAttribute('dir', t.dir)
    document.body.classList.add('gf-body')
    return () => { document.body.classList.remove('gf-body', 'gf-body-dark'); document.documentElement.setAttribute('dir', 'rtl') }
  }, [lang, t.dir])

  useEffect(() => {
    document.body.classList.toggle('gf-body-dark', dark)
    try { localStorage.setItem('gf-theme', dark ? 'dark' : 'light') } catch { }
  }, [dark])

  return (
    <div className={`gf-root ${dark ? 'gf-dark' : ''}`} dir={t.dir}>
      {/* Top bar */}
      <header className="gf-nav">
        <a href="#top" className="gf-nav-brand"><Wordmark /><span className="gf-nav-ar">جِت فِكرة</span></a>
        <nav className="gf-nav-links">
          <a href="#services">{t.nav.services}</a>
          <a href="#tour">{t.nav.tour}</a>
          <a href="#work">{t.nav.work}</a>
          <a href="#process">{t.nav.process}</a>
          <a href="#about">{t.nav.about}</a>
        </nav>
        <div className="gf-nav-actions">
          <button className="gf-lang" onClick={() => setDark(!dark)} aria-label={dark ? 'Light mode' : 'Dark mode'}>
            <i className={`fas ${dark ? 'fa-sun' : 'fa-moon'}`} />
          </button>
          <button className="gf-lang" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{lang === 'ar' ? 'EN' : 'ع'}</button>
          <a href="#contact" className="gf-btn gf-btn-ink gf-btn-sm">{t.nav.contact}</a>
        </div>
      </header>

      {/* Hero */}
      <section className="gf-hero" id="top">
        <p className="gf-kicker gf-reveal">
          <span className="gf-radar-dot">
            <span className="gf-radar-ping" />
          </span>
          {t.hero_kicker}
        </p>
        <h1 className="gf-hero-title gf-reveal">
          {lang === 'ar' ? (
            <>
              نبني لكل مدرّس{' '}
              <span className="gf-rotator-slot">
                <span className={`gf-rotator-text ${isRotating ? 'is-exiting' : 'is-entering'}`}>
                  {ROTATING_WORDS.ar[rotIndex % ROTATING_WORDS.ar.length]}
                </span>
              </span>{' '}
              الخاصة.
            </>
          ) : (
            <>
              We build for every teacher{' '}
              <span className="gf-rotator-slot">
                <span className={`gf-rotator-text ${isRotating ? 'is-exiting' : 'is-entering'}`}>
                  {ROTATING_WORDS.en[rotIndex % ROTATING_WORDS.en.length]}
                </span>
              </span>
              .
            </>
          )}
        </h1>
        <p className="gf-hero-sub gf-reveal">{t.hero_sub}</p>
        <div className="gf-hero-cta gf-reveal">
          <a href="#contact" className="gf-btn gf-btn-ink">{t.cta_primary}</a>
          <a href="#work" className="gf-btn gf-btn-line">{t.cta_secondary}</a>
        </div>
        <dl className="gf-stats gf-reveal">
          {dynamicStats.map((s, i) => (
            <div className="gf-stat" key={i}>
              <dt className="gf-stat-v">{s.v}</dt>
              <dd>{s.l}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Services — numbered editorial rows */}
      <section className="gf-section" id="services">
        <header className="gf-section-head gf-reveal">
          <span className="gf-kicker">{t.services_kicker}</span>
          <h2>{t.services_title}</h2>
        </header>
        <ol className="gf-services">
          {SERVICES.map((s, i) => (
            <li className="gf-service gf-reveal" key={s.id} style={{ transitionDelay: `${(i % 3) * 60}ms` }}>
              <span className="gf-service-n">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>{s.title[lang]}</h3>
                <p>{s.body[lang]}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Product tour — real screenshots */}
      <section className="gf-section" id="tour">
        <header className="gf-section-head gf-reveal">
          <span className="gf-kicker">{t.tour_kicker}</span>
          <h2>{t.tour_title}</h2>
          <p className="gf-section-note">{t.tour_note}</p>
        </header>
        <div className="gf-showcase gf-reveal">
          <div className="gf-tour-feature-pills">
            <span className="gf-tour-pill">
              <i className="fas fa-shield-halved" />
              {lang === 'ar' ? 'حماية مشفرة ضد التسريب وتصوير الشاشة' : 'Encrypted DRM Anti-Piracy Protection'}
            </span>
            <span className="gf-tour-pill">
              <i className="fas fa-bolt" />
              {lang === 'ar' ? 'تصحيح تلقائي فوري للامتحانات وتحليل الدرجات' : 'Instant Auto-Grading & Exam Analytics'}
            </span>
            <span className="gf-tour-pill">
              <i className="fas fa-user-shield" />
              {lang === 'ar' ? 'بوابة مستقلة لمتابعة أولياء الأمور' : 'Dedicated Parent Portal'}
            </span>
          </div>

          <div className="gf-tour-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tourTab === 'student'}
              className={`gf-tour-tab ${tourTab === 'student' ? 'is-active' : ''}`}
              onClick={() => { setTourTab('student'); setTourIndex(0) }}>
              <i className="fas fa-graduation-cap" /> {t.role_student}
            </button>
            <button type="button" role="tab" aria-selected={tourTab === 'admin'}
              className={`gf-tour-tab ${tourTab === 'admin' ? 'is-active' : ''}`}
              onClick={() => { setTourTab('admin'); setTourIndex(0) }}>
              <i className="fas fa-sliders" /> {t.role_admin}
            </button>
          </div>
          <div className="gf-stage">
            {currentShot && (
              <button type="button" className="gf-stage-frame" onClick={() => setTourShot(currentShot)} aria-label={currentShot?.title?.[lang] || ''}>
                <span className="gf-tour-chrome">
                  <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
                  <em className={`gf-tour-role ${currentShot?.role === 'admin' ? 'is-admin' : ''}`}>
                    {currentShot?.role === 'admin' ? t.role_admin : t.role_student}
                  </em>
                </span>
                {currentShot?.img && (
                  <img key={currentShot.id} src={currentShot.img} alt={currentShot?.title?.[lang] || ''} className="gf-stage-img" />
                )}
              </button>
            )}
            {currentShot && (
              <div className="gf-stage-meta">
                <div className="gf-stage-text" key={`meta-${currentShot?.id}`}>
                  <strong>{currentShot?.title?.[lang] || ''}</strong>
                  <p>{currentShot?.caption?.[lang] || ''}</p>
                </div>
                <div className="gf-stage-nav">
                  <button type="button" onClick={() => setTourIndex((tourIndex - 1 + (tourShots.length || 1)) % (tourShots.length || 1))} aria-label="Previous">
                    <i className={`fas ${t.dir === 'rtl' ? 'fa-arrow-right' : 'fa-arrow-left'}`} />
                  </button>
                  <span dir="ltr">{Math.min(tourIndex, (tourShots.length || 1) - 1) + 1} / {tourShots.length}</span>
                  <button type="button" onClick={() => setTourIndex((tourIndex + 1) % (tourShots.length || 1))} aria-label="Next">
                    <i className={`fas ${t.dir === 'rtl' ? 'fa-arrow-left' : 'fa-arrow-right'}`} />
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="gf-thumbs" role="tablist">
            {tourShots.map((shot, i) => (
              <button
                type="button"
                key={shot.id}
                role="tab"
                aria-selected={i === tourIndex}
                className={`gf-thumb ${i === tourIndex ? 'is-active' : ''}`}
                onClick={() => setTourIndex(i)}
              >
                <img src={shot.img} alt={shot.title[lang]} loading="lazy" />
                <span>{shot.title[lang]}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Work — client platforms */}
      <section className="gf-section gf-section-tinted" id="work">
        <header className="gf-section-head gf-reveal">
          <span className="gf-kicker">{t.work_kicker}</span>
          <h2>{t.work_title}</h2>
          <p className="gf-section-note">{t.work_note}</p>
        </header>
        <div className="gf-work-grid">
          {platforms.map((p, i) => {
            const isLive = p.status === 'live'
            const isSuspended = p.status === 'suspended'
            const badgeText = isLive ? t.badge_live : (isSuspended ? t.badge_suspended : t.badge_soon)
            const statusClass = isLive ? 'is-live' : (isSuspended ? 'is-suspended' : 'is-soon')

            const pName = typeof p.name === 'object' ? (p.name[lang] || p.name.ar || p.name.en || '') : (p.name || '')
            const pOwner = typeof p.owner === 'object' ? (p.owner[lang] || p.owner.ar || p.owner.en || '') : (p.owner || '')
            const pSubject = typeof p.subject === 'object' ? (p.subject[lang] || p.subject.ar || p.subject.en || '') : (p.subject || '')
            const pBlurb = typeof p.blurb === 'object' ? (p.blurb[lang] || p.blurb.ar || p.blurb.en || '') : (p.blurb || '')

            const inner = (
              <>
                <div className="gf-work-header">
                  <div className="gf-work-identity">
                    <div className="gf-work-avatar-box">
                      <div className="gf-work-avatar-inner">
                        {p.image ? (
                          <img
                            src={p.image}
                            alt={pOwner}
                            className="gf-work-avatar-img"
                            loading="lazy"
                            style={{ objectPosition: p.imagePosition || 'center top', ...(p.imageStyle || {}) }}
                          />
                        ) : (
                          <span className="gf-work-avatar-monogram">{(pName || '?').trim().charAt(0)}</span>
                        )}
                      </div>
                      {p.logo && (
                        <img className="gf-work-badge-logo" src={p.logo} alt={pName} loading="lazy" />
                      )}
                    </div>
                    <div className="gf-work-titles">
                      <h3>{pName}</h3>
                      <p className="gf-work-owner">{pOwner}</p>
                      <p className="gf-work-subject">{pSubject}</p>
                    </div>
                  </div>
                  <span className={`gf-work-status ${statusClass}`}>
                    <span className="gf-work-status-dot" />
                    {badgeText}
                  </span>
                </div>
                <p className="gf-work-blurb">{pBlurb}</p>
                <div className="gf-work-footer">
                  {p.url && (
                    <span className="gf-work-visit">
                      {t.visit_platform}
                      <i className={`fas ${t.dir === 'rtl' ? 'fa-arrow-left' : 'fa-arrow-right'}`} />
                    </span>
                  )}
                </div>
              </>
            )
            return p.url ? (
              <a
                className="gf-work-card gf-reveal"
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ '--card-accent': p.accent, transitionDelay: `${(i % 2) * 70}ms` }}
              >
                {inner}
              </a>
            ) : (
              <article
                className="gf-work-card gf-reveal"
                key={p.id}
                style={{ '--card-accent': p.accent, transitionDelay: `${(i % 2) * 70}ms` }}
              >
                {inner}
              </article>
            )
          })}
        </div>
      </section>

      {/* Process */}
      <section className="gf-section" id="process">
        <header className="gf-section-head gf-reveal">
          <span className="gf-kicker">{t.process_kicker}</span>
          <h2>{t.process_title}</h2>
        </header>
        <ol className="gf-process">
          {PROCESS.map((step, i) => {
            const stepIcons = ['fa-comments', 'fa-palette', 'fa-cloud-arrow-up', 'fa-headset']
            return (
              <li className="gf-step gf-reveal" key={step.n} style={{ transitionDelay: `${i * 70}ms` }}>
                <div className="gf-step-badge">
                  <span className="gf-step-n">{step.n}</span>
                  <i className={`fas ${stepIcons[i % stepIcons.length]} gf-step-icon`} />
                </div>
                <h3>{step.title[lang]}</h3>
                <p>{step.body[lang]}</p>
              </li>
            )
          })}
        </ol>
      </section>

      {/* About */}
      <section className="gf-section gf-section-tinted" id="about">
        <div className="gf-about">
          <header className="gf-section-head gf-reveal">
            <span className="gf-kicker">{t.about_kicker}</span>
            <h2>{t.about_title}</h2>
          </header>
          <div className="gf-about-cols gf-reveal">
            <p>{t.about_body_1}</p>
            <p>{t.about_body_2}</p>
          </div>
          <ul className="gf-principles">
            {t.principles.map((p, i) => (
              <li className="gf-reveal" key={i} style={{ transitionDelay: `${i * 70}ms` }}>
                <h4>{p.t}</h4>
                <p>{p.d}</p>
              </li>
            ))}
          </ul>

          {/* Founders & Leadership */}
          <div className="gf-founders-grid gf-reveal">
            <div className="gf-founder-card">
              <div className="gf-founder-avatar-wrap">
                <img src="/images/Abdelrahman%20Photo%20Facebook.jpg" alt="Abdelrahman Alaa" className="gf-founder-img" />
              </div>
              <div className="gf-founder-info">
                <div className="gf-founder-verified">
                  <i className="fas fa-shield-halved" />
                  <span>{lang === 'ar' ? 'مهندس معتمد' : 'Verified Cybersecurity Engineer'}</span>
                </div>
                <h3>{lang === 'ar' ? 'عبدالرحمن علاء' : 'Abdelrahman Alaa'}</h3>
                <span className="gf-founder-role">{lang === 'ar' ? 'مهندس أمن سيبراني وتطوير الويب المتكامل (Full-Stack) — المؤسس' : 'Cybersecurity Engineer & Full-Stack Web Developer — Co-Founder'}</span>
                <p className="gf-founder-edu">
                  <i className="fas fa-graduation-cap" /> {lang === 'ar' ? 'كلية الحاسبات وعلوم البيانات، جامعة الإسكندرية' : 'Faculty of Computers and Data Science, Alexandria University'}
                </p>
                <p className="gf-founder-bio">
                  {lang === 'ar'
                    ? 'المسؤول عن تطوير البنية البرمجية المتكاملة لمنظومة جِت فِكرة (Full-Stack)، وهندسة قواعد البيانات السحابية عالية الأداء، وتطوير الواجهات والأنظمة، وأنظمة الحماية المتقدمة والأمن السيبراني.'
                    : 'Architect of the end-to-end full-stack web infrastructure, high-performance cloud databases, frontend/backend engineering, and enterprise cybersecurity protocols.'}
                </p>
                <div className="gf-founder-socials">
                  <a href="https://github.com/AbdelrahmanAlaa2006" target="_blank" rel="noopener noreferrer" className="gf-soc-btn github"><i className="fab fa-github" /> GitHub</a>
                  <a href="https://www.linkedin.com/in/abdelrahman-alaa2006" target="_blank" rel="noopener noreferrer" className="gf-soc-btn linkedin"><i className="fab fa-linkedin" /> LinkedIn</a>
                  <a href="https://www.facebook.com/abdelrahman.alaa.988711" target="_blank" rel="noopener noreferrer" className="gf-soc-btn facebook"><i className="fab fa-facebook" /> Facebook</a>
                  <a href="https://www.instagram.com/abd_elrahman_alaa3/" target="_blank" rel="noopener noreferrer" className="gf-soc-btn instagram"><i className="fab fa-instagram" /> Instagram</a>
                </div>
              </div>
            </div>

            <div className="gf-founder-card">
              <div className="gf-founder-avatar-wrap">
                <img src="/images/Eyad%20Photo%20Instagram.jpg" alt="Eyad Elalkamy" className="gf-founder-img" />
              </div>
              <div className="gf-founder-info">
                <div className="gf-founder-verified">
                  <i className="fas fa-shield-halved" />
                  <span>{lang === 'ar' ? 'مهندس معتمد' : 'Verified Cybersecurity Engineer'}</span>
                </div>
                <h3>{lang === 'ar' ? 'إياد العلقامي' : 'Eyad Elalkamy'}</h3>
                <span className="gf-founder-role">{lang === 'ar' ? 'مهندس أمن سيبراني وتصميم واجهات وتجربة المستخدم (UI/UX) — المؤسس' : 'Cybersecurity Engineer & UI/UX Designer — Co-Founder'}</span>
                <p className="gf-founder-edu">
                  <i className="fas fa-graduation-cap" /> {lang === 'ar' ? 'كلية الحاسبات وعلوم البيانات، جامعة الإسكندرية' : 'Faculty of Computers and Data Science, Alexandria University'}
                </p>
                <p className="gf-founder-bio">
                  {lang === 'ar'
                    ? 'المسؤول عن تصميم واجهات وتجربة المستخدم (UI/UX)، وابتكار الهوية البصرية والتصاميم التفاعلية للطلاب والمعلمين، وتطوير الواجهات الأمامية الحديثة، وحماية وأمان تجربة المستخدم.'
                    : 'Leads UI/UX design, interactive interface systems for teachers and students, visual brand aesthetics, frontend web engineering, and client-side security.'}
                </p>
                <div className="gf-founder-socials">
                  <a href="https://github.com/eyadelalkamy-oss" target="_blank" rel="noopener noreferrer" className="gf-soc-btn github"><i className="fab fa-github" /> GitHub</a>
                  <a href="https://www.linkedin.com/in/eyad-atef-elalkamy-709615385" target="_blank" rel="noopener noreferrer" className="gf-soc-btn linkedin"><i className="fab fa-linkedin" /> LinkedIn</a>
                  <a href="https://www.facebook.com/eyad.alkamy" target="_blank" rel="noopener noreferrer" className="gf-soc-btn facebook"><i className="fab fa-facebook" /> Facebook</a>
                  <a href="https://www.instagram.com/eyad_elalkamy/" target="_blank" rel="noopener noreferrer" className="gf-soc-btn instagram"><i className="fab fa-instagram" /> Instagram</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="gf-section gf-contact" id="contact">
        <div className="gf-contact-inner gf-reveal">
          <span className="gf-kicker">{t.contact_kicker}</span>
          <h2>{t.contact_title}</h2>
          <p>{t.contact_body}</p>
          <div className="gf-contact-actions">
            <a href={`mailto:${CONTACT_EMAIL}`} className="gf-btn gf-btn-ink">
              <i className="fas fa-envelope" /> {t.contact_cta}
            </a>
            <div className="gf-contact-email" dir="ltr">{CONTACT_EMAIL}</div>
          </div>
        </div>
      </section>

      {/* Tour lightbox */}
      {tourShot && (
        <div className="gf-lightbox" onClick={() => setTourShot(null)} role="dialog" aria-modal="true">
          <figure onClick={(e) => e.stopPropagation()}>
            <button type="button" className="gf-lightbox-close" onClick={() => setTourShot(null)} aria-label="Close">
              <i className="fas fa-times" />
            </button>
            <img src={tourShot.img} alt={tourShot.title[lang]} />
            <figcaption>{tourShot.title[lang]} — {tourShot.caption[lang]}</figcaption>
          </figure>
        </div>
      )}

      {/* Footer */}
      <footer className="gf-footer">
        <div className="gf-footer-main">
          <div className="gf-footer-brand">
            <Wordmark />
            <p>{t.footer_tag}</p>
          </div>
          <nav className="gf-footer-links">
            <a href="#services">{t.nav.services}</a>
            <a href="#work">{t.nav.work}</a>
            <a href="#process">{t.nav.process}</a>
            <a href="#contact">{t.nav.contact}</a>
          </nav>
        </div>
        <div className="gf-footer-bottom">
          <span>© {new Date().getFullYear()} GitFekra. {t.rights}.</span>
          <span>{t.footer_made}</span>
        </div>
      </footer>
    </div>
  )
}
