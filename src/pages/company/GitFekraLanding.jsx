import React, { useState, useEffect } from 'react'
import './GitFekraLanding.css'
import { PLATFORMS, SERVICES, PROCESS } from './products'

/* GitFekra — company site (shown on the default tenant / gitfekra.com).
   Editorial, print-inspired design: light paper background, ink typography,
   hairline rules, numbered sections. Self-contained (own header/footer). */

const COPY = {
  ar: {
    dir: 'rtl',
    nav: { services: 'ماذا نبني', work: 'أعمالنا', process: 'كيف نعمل', about: 'من نحن', contact: 'تواصل' },
    hero_kicker: 'GitFekra — شركة برمجيات متخصصة في المنصات التعليمية',
    hero_title: 'نبني لكل مدرّس منصته التعليمية الخاصة.',
    hero_sub: 'من الفكرة إلى الإطلاق: منصة كاملة باسمك وهويتك — فيديوهات محمية، امتحانات إلكترونية، حضور، مدفوعات، ومتابعة أولياء الأمور. أنت تدرّس، ونحن نتولى الباقي.',
    cta_primary: 'اطلب منصتك',
    cta_secondary: 'شاهد أعمالنا',
    stats: [
      { v: '٢', l: 'منصتان تعملان الآن' },
      { v: 'آلاف', l: 'الطلاب يستخدمونها يومياً' },
      { v: '٢', l: 'منصتان قيد الإطلاق' },
    ],
    services_kicker: 'ماذا نبني لك',
    services_title: 'كل ما يحتاجه مدرّس ليعمل أونلاين وفي السنتر',
    badge_live: 'يعمل الآن',
    badge_soon: 'قيد الإطلاق',
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
    nav: { services: 'What we build', work: 'Work', process: 'Process', about: 'About', contact: 'Contact' },
    hero_kicker: 'GitFekra — an education software company',
    hero_title: 'We build every teacher their own education platform.',
    hero_sub: 'From idea to launch: a complete platform under your name and brand — protected videos, online exams, attendance, payments, and parent follow-up. You teach; we handle the rest.',
    cta_primary: 'Start your platform',
    cta_secondary: 'See our work',
    stats: [
      { v: '2', l: 'platforms live today' },
      { v: 'Thousands', l: 'of students using them daily' },
      { v: '2', l: 'platforms launching soon' },
    ],
    services_kicker: 'What we build',
    services_title: 'Everything a teacher needs, online and in-center',
    badge_live: 'Live',
    badge_soon: 'Launching soon',
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

export default function GitFekraLanding() {
  const [lang, setLang] = useState('ar')
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem('gf-theme')
      if (saved) return saved === 'dark'
      return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches || false
    } catch { return false }
  })
  const t = COPY[lang]
  useReveal(lang)

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
        <p className="gf-kicker gf-reveal">{t.hero_kicker}</p>
        <h1 className="gf-hero-title gf-reveal">{t.hero_title}</h1>
        <p className="gf-hero-sub gf-reveal">{t.hero_sub}</p>
        <div className="gf-hero-cta gf-reveal">
          <a href="#contact" className="gf-btn gf-btn-ink">{t.cta_primary}</a>
          <a href="#work" className="gf-btn gf-btn-line">{t.cta_secondary}</a>
        </div>
        <dl className="gf-stats gf-reveal">
          {t.stats.map((s, i) => (
            <div className="gf-stat" key={i}>
              <dt>{s.v}</dt>
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

      {/* Work — client platforms */}
      <section className="gf-section gf-section-tinted" id="work">
        <header className="gf-section-head gf-reveal">
          <span className="gf-kicker">{t.work_kicker}</span>
          <h2>{t.work_title}</h2>
          <p className="gf-section-note">{t.work_note}</p>
        </header>
        <div className="gf-work-grid">
          {PLATFORMS.map((p, i) => {
            const inner = (
              <>
                <span className="gf-work-swatch" style={{ background: p.accent }} aria-hidden="true" />
                <div className="gf-work-body">
                  <div className="gf-work-toprow">
                    <h3>{p.name[lang]}</h3>
                    <span className={`gf-work-status ${p.status === 'live' ? 'is-live' : 'is-soon'}`}>
                      {p.status === 'live' ? t.badge_live : t.badge_soon}
                    </span>
                  </div>
                  <p className="gf-work-owner">{p.owner[lang]}</p>
                  <p className="gf-work-subject">{p.subject[lang]}</p>
                  <p className="gf-work-blurb">{p.blurb[lang]}</p>
                </div>
              </>
            )
            return p.url ? (
              <a className="gf-work-card gf-reveal" key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" style={{ transitionDelay: `${(i % 2) * 70}ms` }}>
                {inner}
              </a>
            ) : (
              <article className="gf-work-card gf-reveal" key={p.id} style={{ transitionDelay: `${(i % 2) * 70}ms` }}>
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
          {PROCESS.map((step, i) => (
            <li className="gf-step gf-reveal" key={step.n} style={{ transitionDelay: `${i * 70}ms` }}>
              <span className="gf-step-n">{step.n}</span>
              <h3>{step.title[lang]}</h3>
              <p>{step.body[lang]}</p>
            </li>
          ))}
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
        </div>
      </section>

      {/* Contact */}
      <section className="gf-section gf-contact" id="contact">
        <div className="gf-contact-inner gf-reveal">
          <span className="gf-kicker">{t.contact_kicker}</span>
          <h2>{t.contact_title}</h2>
          <p>{t.contact_body}</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="gf-btn gf-btn-paper">{t.contact_cta}</a>
          <div className="gf-contact-email" dir="ltr">{CONTACT_EMAIL}</div>
        </div>
      </section>

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
