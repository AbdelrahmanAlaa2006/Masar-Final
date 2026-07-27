import React from 'react'
import { Link } from 'react-router-dom'
import { useTenant } from '../contexts/TenantContext'
// getTenantThemeConfig is now dynamically resolved inside TenantContext
import './Footer.css'

/* ──────────────────────────────────────────────────────────────
   Site-wide footer for Masar.
   - Animated gradient top strip
   - Marquee ticker of subjects/highlights
   - Brand / quick links / contact columns
   - Animated floating blobs in the background
   ────────────────────────────────────────────────────────────── */

const TICKER_ITEMS = [
  { icon: 'fa-graduation-cap', text: 'منصة مسار التعليمية' },
  { icon: 'fa-book-open',      text: 'محاضرات شاملة' },
  { icon: 'fa-circle-play',    text: 'فيديوهات تفاعلية' },
  { icon: 'fa-file-pen',       text: 'امتحانات إلكترونية' },
  { icon: 'fa-chart-line',     text: 'تقارير أداء فورية' },
  { icon: 'fa-users',          text: 'متابعة الطلاب' },
  { icon: 'fa-medal',          text: 'تفوق وامتياز' },
  { icon: 'fa-rocket',         text: 'انطلق نحو النجاح' },
]

/* Developer (GitFekra) support contact — shown to admins/assistants only.
   Students get the tenant's own teacher/platform contact instead. */
const DEVELOPER_CONTACT = {
  name: 'GitFekra — الدعم الفني للمنصة',
  email: 'hello@gitfekra.com',
  site: 'https://gitfekra.com'
}

export default function Footer() {
  const { tenant, tenantSlug, isFeatureEnabled, isGradeEnabled, gradesList, themeConfig } = useTenant()

  // Resolve the viewer's role so contact info targets the right audience:
  // students/visitors → the teacher/platform channels, staff → the developer.
  const [viewerRole, setViewerRole] = React.useState(() => {
    try { return JSON.parse(sessionStorage.getItem('masar-user'))?.role || null } catch { return null }
  })
  React.useEffect(() => {
    const sync = () => {
      try { setViewerRole(JSON.parse(sessionStorage.getItem('masar-user'))?.role || null) } catch { setViewerRole(null) }
    }
    window.addEventListener('masar-user-updated', sync)
    return () => window.removeEventListener('masar-user-updated', sync)
  }, [])
  const isStaff = viewerRole === 'admin' || viewerRole === 'assistant' || viewerRole === 'super_admin'
  const dbLogo = tenant?.logo_url && !tenant.logo_url.includes('3081840') ? tenant.logo_url : null
  const brandLogo = themeConfig.logoUrl || (!tenantSlug || tenantSlug === 'default' ? "/images/logo.white.png" : (dbLogo || "/images/logo.white.png"))
  const hasCustomLogo = !!(themeConfig.logoUrl || dbLogo)

  const year = new Date().getFullYear()

  const brandName = tenant?.name || 'GitFekra'
  const brandTag = tenant?.config?.branding?.tagline || 'طريقك إلى التفوق الدراسي'
  // Stage-neutral fallback — tenants set their real stages via
  // config.branding.description in the DB (e.g. the power tenant).
  const brandDesc = tenant?.config?.branding?.description || 'منصة تعليمية متكاملة تقدم محاضرات وامتحانات وفيديوهات تفاعلية، مع متابعة دقيقة لأداء كل طالب.'

  // Tenant (teacher/platform) channels — students see these. No '#' dead links
  // and no developer fallback: icons/rows render only when actually configured.
  const rawSocials = tenant?.config?.socials || {}
  const socials = Object.fromEntries(
    Object.entries(rawSocials).filter(([, v]) => v && v !== '#')
  )
  const contact = tenant?.config?.contact || {}

  const tickerItems = TICKER_ITEMS.map(item => {
    if (item.text === 'منصة مسار التعليمية') {
      return { ...item, text: brandName + ' التعليمية' }
    }
    return item
  })

  const stagesGrouped = React.useMemo(() => {
    const groups = {
      primary: { name: 'المرحلة الابتدائية', grades: [], icon: 'fa-child' },
      preparatory: { name: 'المرحلة الإعدادية', grades: [], icon: 'fa-seedling' },
      secondary: { name: 'المرحلة الثانوية', grades: [], icon: 'fa-graduation-cap' },
      baccalaureate: { name: 'مرحلة البكالوريا', grades: [], icon: 'fa-award' }
    }

    ;(gradesList || []).forEach((g) => {
      let sKey = g.stageId
      if (!sKey) {
        if (g.id.includes('primary')) sKey = 'primary'
        else if (g.id.includes('prep')) sKey = 'preparatory'
        else if (g.id.includes('sec')) sKey = 'secondary'
        else if (g.id.includes('bac')) sKey = 'baccalaureate'
      }

      if (groups[sKey]) {
        groups[sKey].grades.push(g)
      } else {
        if (!groups[sKey]) {
          groups[sKey] = { name: g.stageName || 'أخرى', grades: [], icon: 'fa-graduation-cap' }
        }
        groups[sKey].grades.push(g)
      }
    })

    return groups
  }, [gradesList])

  return (
    <footer className="site-footer" dir="rtl" role="contentinfo">
      {/* animated gradient strip */}
      <div className="sf-strip" aria-hidden="true" />

      {/* marquee ticker */}
      <div className="sf-marquee" aria-hidden="true">
        <div className="sf-marquee-track">
          {[...tickerItems, ...tickerItems, ...tickerItems, ...tickerItems].map((it, i) => (
            <span className="sf-marquee-item" key={i}>
              <i className={`fas ${it.icon}`}></i>
              {it.text}
              <span className="sf-marquee-dot">•</span>
            </span>
          ))}
        </div>
      </div>

      {/* main content */}
      <div className="sf-main">
        {/* floating blobs */}
        <span className="sf-blob sf-blob-1" aria-hidden="true" />
        <span className="sf-blob sf-blob-2" aria-hidden="true" />
        <span className="sf-blob sf-blob-3" aria-hidden="true" />

        <div className="sf-container">
          {/* Brand column */}
          <div className="sf-col sf-brand-col">
            <div className="sf-brand">
              <div className={`sf-brand-logo ${hasCustomLogo ? 'sf-brand-logo--bare' : ''}`}>
                {hasCustomLogo ? (
                  <img src={brandLogo} alt="Logo" className="sf-brand-logo-img" />
                ) : (
                  <i className="fas fa-graduation-cap"></i>
                )}
              </div>
              <div>
                <h3 className="sf-brand-name">{brandName}</h3>
                <p className="sf-brand-tag">{brandTag}</p>
              </div>
            </div>
            <p className="sf-brand-desc">{brandDesc}</p>
            {/* Teacher/platform socials are for students — staff get the
                developer support column instead. */}
            {!isStaff && (
              <div className="sf-social">
                {socials.facebook && <a href={socials.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="sf-social-btn"><i className="fab fa-facebook-f"></i></a>}
                {socials.youtube && <a href={socials.youtube} target="_blank" rel="noopener noreferrer" aria-label="YouTube"  className="sf-social-btn"><i className="fab fa-youtube"></i></a>}
                {socials.instagram && <a href={socials.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="sf-social-btn"><i className="fab fa-instagram"></i></a>}
                {socials.telegram && <a href={socials.telegram} target="_blank" rel="noopener noreferrer" aria-label="Telegram" className="sf-social-btn"><i className="fab fa-telegram-plane"></i></a>}
                {socials.whatsapp && <a href={socials.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="sf-social-btn"><i className="fab fa-whatsapp"></i></a>}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="sf-col">
            <h4 className="sf-col-title"><i className="fas fa-compass"></i> روابط سريعة</h4>
            <ul className="sf-links">
              <li><Link to="/"><i className="fas fa-house"></i> الرئيسية</Link></li>
              {isFeatureEnabled('homework') && <li><Link to="/homework"><i className="fas fa-clipboard-list"></i> الواجبات</Link></li>}
              {isFeatureEnabled('videos') && <li><Link to="/videos"><i className="fas fa-circle-play"></i> الفيديوهات</Link></li>}
              {isFeatureEnabled('exams') && <li><Link to="/exams"><i className="fas fa-file-pen"></i> الامتحانات</Link></li>}
              {isFeatureEnabled('payments') && <li><Link to="/payments"><i className="fas fa-wallet"></i> المدفوعات</Link></li>}
              {isFeatureEnabled('reports') && <li><Link to="/report"><i className="fas fa-chart-line"></i> التقارير</Link></li>}
            </ul>
          </div>

          {/* Stages */}
          <div className="sf-col sf-stages-col">
            <h4 className="sf-col-title"><i className="fas fa-graduation-cap"></i> المراحل الدراسية</h4>
            <div className="sf-stages-groups">
              {Object.entries(stagesGrouped).map(([key, group]) => {
                if (group.grades.length === 0) return null
                return (
                  <div key={key} className="sf-stage-group">
                    <h5 className="sf-stage-group-title">
                      <i className={`fas ${group.icon}`}></i> {group.name}
                    </h5>
                    <ul className="sf-links sf-links--text">
                      {group.grades.map((g) => {
                        let icon = 'fa-circle'
                        if (g.id.includes('prep')) {
                          icon = g.id.includes('first') ? 'fa-seedling' : g.id.includes('second') ? 'fa-book-open-reader' : 'fa-trophy'
                        } else if (g.id.includes('sec')) {
                          icon = g.id.includes('first') ? 'fa-graduation-cap' : g.id.includes('second') ? 'fa-book' : 'fa-award'
                        } else if (g.id.includes('primary')) {
                          icon = 'fa-child'
                        } else if (g.id.includes('bac')) {
                          icon = 'fa-award'
                        }
                        return (
                          <li key={g.id}>
                            <span>
                              <i className={`fas ${icon}`}></i> {g.name}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
            <div className="sf-badges sf-badges--text">
              <span className="sf-badge sf-badge--text"><i className="fas fa-shield-halved"></i> آمن</span>
              <span className="sf-badge sf-badge--text"><i className="fas fa-bolt"></i> سريع</span>
              <span className="sf-badge sf-badge--text"><i className="fas fa-mobile"></i> متجاوب</span>
            </div>
          </div>

          {/* Contact — staff see the developer's support channels, students see
              the teacher/platform channels responsible for helping them. */}
          {isStaff ? (
            <div className="sf-col">
              <h4 className="sf-col-title"><i className="fas fa-headset"></i> الدعم الفني (المطور)</h4>
              <ul className="sf-contact">
                <li>
                  <span className="sf-ci"><i className="fas fa-code"></i></span>
                  <div>
                    <span className="sf-ck">المطور</span>
                    <span className="sf-cv">{DEVELOPER_CONTACT.name}</span>
                  </div>
                </li>
                <li>
                  <span className="sf-ci"><i className="fas fa-envelope"></i></span>
                  <div>
                    <span className="sf-ck">البريد الإلكتروني</span>
                    <span className="sf-cv" dir="ltr">
                      <a href={`mailto:${DEVELOPER_CONTACT.email}`} style={{ color: 'inherit' }}>{DEVELOPER_CONTACT.email}</a>
                    </span>
                  </div>
                </li>
                <li>
                  <span className="sf-ci"><i className="fas fa-globe"></i></span>
                  <div>
                    <span className="sf-ck">الموقع</span>
                    <span className="sf-cv" dir="ltr">
                      <a href={DEVELOPER_CONTACT.site} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>gitfekra.com</a>
                    </span>
                  </div>
                </li>
              </ul>
            </div>
          ) : (
            <div className="sf-col">
              <h4 className="sf-col-title"><i className="fas fa-headset"></i> تواصل معنا</h4>
              <ul className="sf-contact">
                {contact.address && (
                  <li>
                    <span className="sf-ci"><i className="fas fa-location-dot"></i></span>
                    <div>
                      <span className="sf-ck">العنوان</span>
                      <span className="sf-cv">{contact.address}</span>
                    </div>
                  </li>
                )}
                {contact.phone && (
                  <li>
                    <span className="sf-ci"><i className="fas fa-phone"></i></span>
                    <div>
                      <span className="sf-ck">الهاتف</span>
                      <span className="sf-cv" dir="ltr">{contact.phone}</span>
                    </div>
                  </li>
                )}
                {contact.email && (
                  <li>
                    <span className="sf-ci"><i className="fas fa-envelope"></i></span>
                    <div>
                      <span className="sf-ck">البريد الإلكتروني</span>
                      <span className="sf-cv" dir="ltr">{contact.email}</span>
                    </div>
                  </li>
                )}
                {!contact.address && !contact.phone && !contact.email && (
                  <li>
                    <span className="sf-ci"><i className="fas fa-comments"></i></span>
                    <div>
                      <span className="sf-ck">الدعم</span>
                      <span className="sf-cv">تواصل مع معلمك أو الإدارة عبر «الدردشة» داخل المنصة</span>
                    </div>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="sf-bottom">
          <div className="sf-container sf-bottom-row">
            <p className="sf-copy">
              © {year} <strong>{brandName}</strong> — جميع الحقوق محفوظة.
            </p>
            <p className="sf-made">
              صُنع بكل <i className="fas fa-heart sf-heart"></i> لطلاب مصر
            </p>
            <ul className="sf-mini">
              <li><Link to="/privacy">سياسة الخصوصية</Link></li>
              <li><Link to="/terms">شروط الاستخدام</Link></li>
              <li><Link to="/help">المساعدة</Link></li>
            </ul>
          </div>

        </div>
      </div>
    </footer>
  )
}
