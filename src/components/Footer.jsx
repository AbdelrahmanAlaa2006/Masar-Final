import React from 'react'
import { Link } from 'react-router-dom'
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

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer" dir="rtl" role="contentinfo">
      {/* animated gradient strip */}
      <div className="sf-strip" aria-hidden="true" />

      {/* marquee ticker */}
      <div className="sf-marquee" aria-hidden="true">
        <div className="sf-marquee-track">
          {[...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS].map((it, i) => (
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
              <div className="sf-brand-logo">
                <i className="fas fa-graduation-cap"></i>
              </div>
              <div>
                <h3 className="sf-brand-name">منصة مسار</h3>
                <p className="sf-brand-tag">طريقك إلى التفوق الدراسي</p>
              </div>
            </div>
            <p className="sf-brand-desc">
              منصة تعليمية متكاملة تقدم محاضرات وامتحانات وفيديوهات تفاعلية
              للمرحلة الإعدادية، مع متابعة دقيقة لأداء كل طالب.
            </p>
            <div className="sf-social">
              <a href="#" aria-label="Facebook" className="sf-social-btn"><i className="fab fa-facebook-f"></i></a>
              <a href="#" aria-label="YouTube"  className="sf-social-btn"><i className="fab fa-youtube"></i></a>
              <a href="#" aria-label="Instagram" className="sf-social-btn"><i className="fab fa-instagram"></i></a>
              <a href="#" aria-label="Telegram" className="sf-social-btn"><i className="fab fa-telegram-plane"></i></a>
              <a href="#" aria-label="WhatsApp" className="sf-social-btn"><i className="fab fa-whatsapp"></i></a>
            </div>
          </div>

          {/* Quick links */}
          <div className="sf-col">
            <h4 className="sf-col-title"><i className="fas fa-compass"></i> روابط سريعة</h4>
            <ul className="sf-links">
              <li><Link to="/"><i className="fas fa-house"></i> الرئيسية</Link></li>
              <li><Link to="/lectures"><i className="fas fa-book"></i> المحاضرات</Link></li>
              <li><Link to="/videos"><i className="fas fa-video"></i> الفيديوهات</Link></li>
              <li><Link to="/exams"><i className="fas fa-file-alt"></i> الامتحانات</Link></li>
              <li><Link to="/report"><i className="fas fa-chart-bar"></i> التقارير</Link></li>
            </ul>
          </div>

          {/* Stages */}
          <div className="sf-col">
            <h4 className="sf-col-title"><i className="fas fa-graduation-cap"></i> المراحل الدراسية</h4>
            <ul className="sf-links sf-links--text">
              <li><span><i className="fas fa-seedling"></i> الصف الأول الإعدادي</span></li>
              <li><span><i className="fas fa-book-open-reader"></i> الصف الثاني الإعدادي</span></li>
              <li><span><i className="fas fa-trophy"></i> الصف الثالث الإعدادي</span></li>
            </ul>
            <div className="sf-badges sf-badges--text">
              <span className="sf-badge sf-badge--text"><i className="fas fa-shield-halved"></i> آمن</span>
              <span className="sf-badge sf-badge--text"><i className="fas fa-bolt"></i> سريع</span>
              <span className="sf-badge sf-badge--text"><i className="fas fa-mobile"></i> متجاوب</span>
            </div>
          </div>

          {/* Contact */}
          <div className="sf-col">
            <h4 className="sf-col-title"><i className="fas fa-headset"></i> تواصل معنا</h4>
            <ul className="sf-contact">
              <li>
                <span className="sf-ci"><i className="fas fa-location-dot"></i></span>
                <div>
                  <span className="sf-ck">العنوان</span>
                  <span className="sf-cv">القاهرة، مصر</span>
                </div>
              </li>
              <li>
                <span className="sf-ci"><i className="fas fa-phone"></i></span>
                <div>
                  <span className="sf-ck">الهاتف</span>
                  <span className="sf-cv" dir="ltr">+20 100 000 0000</span>
                </div>
              </li>
              <li>
                <span className="sf-ci"><i className="fas fa-envelope"></i></span>
                <div>
                  <span className="sf-ck">البريد الإلكتروني</span>
                  <span className="sf-cv" dir="ltr">support@masar.edu</span>
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="sf-bottom">
          <div className="sf-container sf-bottom-row">
            <p className="sf-copy">
              © {year} <strong>منصة مسار</strong> — جميع الحقوق محفوظة.
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

          <div className="sf-container sf-devs" dir="ltr">
            <div className="sf-devs-card">
              <span className="sf-devs-tag">
                <i className="fas fa-code"></i>
                Developed by
              </span>
              <div className="sf-devs-people">
                <a className="sf-dev-pill" href="#" aria-label="Abdelrahman Alaa">
                  <span className="sf-dev-name">Abdelrahman Alaa</span>
                </a>
                <span className="sf-devs-amp" aria-hidden="true">&amp;</span>
                <a className="sf-dev-pill" href="#" aria-label="Eyad Elalkamy">
                  <span className="sf-dev-name">Eyad Elalkamy</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
