import React, { useState, useEffect, useRef } from 'react'
import './GitFekraLanding.css'
import { RELEASED_PRODUCTS, UPCOMING_PRODUCTS, TECHNOLOGIES } from './products'

/* GitFekra — company landing page (shown on the default tenant / gitfekra.com).
   Self-contained: its own header/footer, no dependency on the educational
   layout. Configuration-driven products so new SaaS products are just data. */

const COPY = {
  ar: {
    dir: 'rtl',
    nav: { about: 'من نحن', vision: 'الرؤية', products: 'المنتجات', tech: 'التقنيات', contact: 'تواصل' },
    hero_badge: 'شركة برمجيات مصرية',
    hero_title_a: 'من فِكرة',
    hero_title_b: 'إلى منتج يعمل.',
    hero_sub: 'GitFekra تبني منتجات SaaS حديثة وسريعة وقابلة للتوسّع. نبدأ من فكرة، ونحوّلها إلى برنامج يعتمد عليه الناس كل يوم.',
    cta_primary: 'استكشف منتجاتنا',
    cta_secondary: 'تواصل معنا',
    about_kicker: 'من نحن',
    about_title: 'شركة برمجيات، وليست منصة واحدة',
    about_body: 'GitFekra علامة برمجية مستقلة تُصمّم وتُطوّر منتجات SaaS متكاملة. المنصة التعليمية هي أول منتجاتنا — والبداية فقط لمجموعة من الحلول التي نبنيها بمعايير أداء وجودة عالية.',
    vision_kicker: 'الرؤية',
    vision_title: 'نبني برمجيات تدوم وتتوسّع',
    vision_body: 'هدفنا بناء منظومة من منتجات SaaS تخدم المطوّرين والشركات والأفراد — بنية تحتية واحدة قوية، وتجربة استخدام راقية، وقابلية توسّع لآلاف المستخدمين.',
    vision_points: [
      { t: 'متعدد المستأجرين', d: 'بنية واحدة تخدم عملاء مستقلين تماماً بعزل كامل.' },
      { t: 'أداء أولاً', d: 'سرعة تحميل، استعلامات محسّنة، وتخزين مؤقت ذكي.' },
      { t: 'جاهز للإنتاج', d: 'أمان، صلاحيات، ونسخ احتياطي منذ اليوم الأول.' },
    ],
    products_kicker: 'المنتجات',
    products_title: 'منتج واحد اليوم، والمزيد قادم',
    released: 'منتجات متاحة',
    building: 'قيد التطوير',
    live_badge: 'متاح الآن',
    building_badge: 'قيد البناء',
    tech_kicker: 'التقنيات',
    tech_title: 'أدوات حديثة نثق بها',
    tech_future: 'قادم',
    why_kicker: 'لماذا GitFekra',
    why_title: 'الفلسفة',
    why_body: 'نؤمن أن البرمجيات الجيدة تُبنى بعناية: كود نظيف، بنية قابلة للتوسّع، وتجربة تحترم المستخدم. نفضّل البساطة على التعقيد، والجودة على السرعة العمياء.',
    contact_kicker: 'تواصل',
    contact_title: 'لديك فكرة أو استفسار؟',
    contact_body: 'نسعد بالتواصل مع المدرّسين والشركات والمطوّرين.',
    contact_cta: 'راسلنا',
    footer_tag: 'من فِكرة إلى منتج.',
    footer_made: 'صُنع في مصر 🇪🇬',
    rights: 'جميع الحقوق محفوظة',
  },
  en: {
    dir: 'ltr',
    nav: { about: 'About', vision: 'Vision', products: 'Products', tech: 'Tech', contact: 'Contact' },
    hero_badge: 'An Egyptian software company',
    hero_title_a: 'From an idea',
    hero_title_b: 'to a product that ships.',
    hero_sub: 'GitFekra builds modern, fast, scalable SaaS products. We start with an idea and turn it into software people rely on every day.',
    cta_primary: 'Explore products',
    cta_secondary: 'Get in touch',
    about_kicker: 'About',
    about_title: 'A software company, not a single app',
    about_body: 'GitFekra is an independent software brand that designs and builds complete SaaS products. The education platform is our first product — and only the beginning of a growing suite built to a high performance and quality bar.',
    vision_kicker: 'Vision',
    vision_title: 'Software built to last and scale',
    vision_body: 'We are building a family of SaaS products for developers, businesses, and individuals — one strong infrastructure, a refined experience, and scale for thousands of users.',
    vision_points: [
      { t: 'Multi-tenant', d: 'One architecture serving fully-isolated, independent customers.' },
      { t: 'Performance first', d: 'Fast loads, optimized queries, and smart caching.' },
      { t: 'Production-ready', d: 'Security, roles, and backups from day one.' },
    ],
    products_kicker: 'Products',
    products_title: 'One product today, more on the way',
    released: 'Released',
    building: 'Currently building',
    live_badge: 'Live',
    building_badge: 'Building',
    tech_kicker: 'Technology',
    tech_title: 'Modern tools we trust',
    tech_future: 'soon',
    why_kicker: 'Why GitFekra',
    why_title: 'Philosophy',
    why_body: 'Good software is built with care: clean code, scalable architecture, and an experience that respects the user. We favor simplicity over complexity, and quality over blind speed.',
    contact_kicker: 'Contact',
    contact_title: 'Have an idea or a question?',
    contact_body: 'We love hearing from teachers, businesses, and developers.',
    contact_cta: 'Email us',
    footer_tag: 'From idea to product.',
    footer_made: 'Made in Egypt 🇪🇬',
    rights: 'All rights reserved',
  },
}

const CONTACT_EMAIL = 'hello@gitfekra.com'

// Reveal-on-scroll: adds .in when an element enters the viewport.
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.gf-reveal')
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } })
    }, { threshold: 0.14 })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
}

function Logo() {
  return (
    <span className="gf-logo">
      <span className="gf-logo-mark">&lt;/&gt;</span>
      <span className="gf-logo-text">Git<span className="gf-logo-accent">Fekra</span></span>
    </span>
  )
}

export default function GitFekraLanding() {
  const [lang, setLang] = useState('ar')
  const t = COPY[lang]
  useReveal()

  useEffect(() => {
    document.title = lang === 'ar' ? 'GitFekra — جِت فِكرة' : 'GitFekra — Software Company'
    document.documentElement.setAttribute('dir', t.dir)
    document.body.classList.add('gf-body')
    return () => { document.body.classList.remove('gf-body'); document.documentElement.setAttribute('dir', 'rtl') }
  }, [lang, t.dir])

  const ProductCard = ({ p, building }) => (
    <div className={`gf-product gf-reveal ${building ? 'building' : ''}`} style={{ '--accent': p.accent }}>
      <div className="gf-product-top">
        <span className="gf-product-icon"><i className={`fas ${p.icon}`} /></span>
        <span className={`gf-status ${building ? 'is-building' : 'is-live'}`}>
          <span className="gf-dot" />{building ? t.building_badge : t.live_badge}
        </span>
      </div>
      <h3>{p.name[lang]}</h3>
      <p>{p.tagline[lang]}</p>
      <div className="gf-tags">{p.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
    </div>
  )

  return (
    <div className="gf-root" dir={t.dir}>
      {/* Ambient background */}
      <div className="gf-bg" aria-hidden="true"><div className="gf-grid" /><div className="gf-glow gf-glow-1" /><div className="gf-glow gf-glow-2" /></div>

      {/* Nav */}
      <header className="gf-nav">
        <a href="#top" className="gf-nav-brand"><Logo /></a>
        <nav className="gf-nav-links">
          <a href="#about">{t.nav.about}</a>
          <a href="#vision">{t.nav.vision}</a>
          <a href="#products">{t.nav.products}</a>
          <a href="#tech">{t.nav.tech}</a>
          <a href="#contact">{t.nav.contact}</a>
        </nav>
        <div className="gf-nav-actions">
          <button className="gf-lang" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{lang === 'ar' ? 'EN' : 'ع'}</button>
          <a href="#contact" className="gf-btn gf-btn-sm">{t.cta_secondary}</a>
        </div>
      </header>

      {/* Hero */}
      <section className="gf-hero" id="top">
        <span className="gf-badge gf-reveal"><span className="gf-dot" /> {t.hero_badge}</span>
        <h1 className="gf-hero-title gf-reveal">
          {t.hero_title_a}<br /><span className="gf-gradient">{t.hero_title_b}</span>
        </h1>
        <p className="gf-hero-sub gf-reveal">{t.hero_sub}</p>
        <div className="gf-hero-cta gf-reveal">
          <a href="#products" className="gf-btn gf-btn-primary">{t.cta_primary}</a>
          <a href="#contact" className="gf-btn gf-btn-ghost">{t.cta_secondary}</a>
        </div>
        <div className="gf-hero-brand gf-reveal" aria-hidden="true">
          <span className="gf-hero-ar">جِت فِكرة</span>
        </div>
      </section>

      {/* About */}
      <section className="gf-section" id="about">
        <div className="gf-reveal">
          <span className="gf-kicker">{t.about_kicker}</span>
          <h2>{t.about_title}</h2>
          <p className="gf-lead">{t.about_body}</p>
        </div>
      </section>

      {/* Vision */}
      <section className="gf-section" id="vision">
        <div className="gf-reveal">
          <span className="gf-kicker">{t.vision_kicker}</span>
          <h2>{t.vision_title}</h2>
          <p className="gf-lead">{t.vision_body}</p>
        </div>
        <div className="gf-cards-3">
          {t.vision_points.map((v, i) => (
            <div className="gf-card gf-reveal" key={i} style={{ transitionDelay: `${i * 80}ms` }}>
              <h4>{v.t}</h4><p>{v.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Products */}
      <section className="gf-section" id="products">
        <div className="gf-reveal">
          <span className="gf-kicker">{t.products_kicker}</span>
          <h2>{t.products_title}</h2>
        </div>
        <h3 className="gf-group-label gf-reveal">{t.released}</h3>
        <div className="gf-products">{RELEASED_PRODUCTS.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        <h3 className="gf-group-label gf-reveal">{t.building}</h3>
        <div className="gf-products">{UPCOMING_PRODUCTS.map((p) => <ProductCard key={p.id} p={p} building />)}</div>
      </section>

      {/* Technologies */}
      <section className="gf-section" id="tech">
        <div className="gf-reveal">
          <span className="gf-kicker">{t.tech_kicker}</span>
          <h2>{t.tech_title}</h2>
        </div>
        <div className="gf-tech">
          {TECHNOLOGIES.map((tech, i) => (
            <div className={`gf-tech-chip gf-reveal ${tech.future ? 'future' : ''}`} key={tech.name} style={{ transitionDelay: `${i * 40}ms` }}>
              <i className={`${tech.brand ? 'fab' : 'fas'} ${tech.icon}`} />
              <span>{tech.name}</span>
              {tech.future && <em>{t.tech_future}</em>}
            </div>
          ))}
        </div>
      </section>

      {/* Why */}
      <section className="gf-section gf-why" id="why">
        <div className="gf-reveal">
          <span className="gf-kicker">{t.why_kicker}</span>
          <h2>{t.why_title}</h2>
          <p className="gf-lead gf-lead-lg">{t.why_body}</p>
        </div>
      </section>

      {/* Contact */}
      <section className="gf-section gf-contact" id="contact">
        <div className="gf-contact-card gf-reveal">
          <span className="gf-kicker">{t.contact_kicker}</span>
          <h2>{t.contact_title}</h2>
          <p className="gf-lead">{t.contact_body}</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="gf-btn gf-btn-primary">
            <i className="fas fa-paper-plane" /> {t.contact_cta}
          </a>
          <div className="gf-contact-email">{CONTACT_EMAIL}</div>
        </div>
      </section>

      {/* Footer */}
      <footer className="gf-footer">
        <div className="gf-footer-main">
          <div>
            <Logo />
            <p className="gf-footer-tag">{t.footer_tag}</p>
          </div>
          <div className="gf-footer-links">
            <a href="#about">{t.nav.about}</a>
            <a href="#products">{t.nav.products}</a>
            <a href="#tech">{t.nav.tech}</a>
            <a href="#contact">{t.nav.contact}</a>
          </div>
        </div>
        <div className="gf-footer-bottom">
          <span>© {new Date().getFullYear()} GitFekra. {t.rights}.</span>
          <span className="gf-footer-made">{t.footer_made}</span>
        </div>
      </footer>
    </div>
  )
}
