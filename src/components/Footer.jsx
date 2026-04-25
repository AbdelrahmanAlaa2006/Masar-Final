import React from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import './Footer.css'

const TICKER_KEYS = [
  { icon: 'fa-graduation-cap', key: 'footer.tickerPlatform' },
  { icon: 'fa-book-open',      key: 'footer.tickerLectures' },
  { icon: 'fa-circle-play',    key: 'footer.tickerVideos' },
  { icon: 'fa-file-pen',       key: 'footer.tickerExams' },
  { icon: 'fa-chart-line',     key: 'footer.tickerReports' },
  { icon: 'fa-users',          key: 'footer.tickerStudents' },
  { icon: 'fa-medal',          key: 'footer.tickerExcellence' },
  { icon: 'fa-rocket',         key: 'footer.tickerLaunch' },
]

export default function Footer() {
  const { t, lang } = useI18n()
  const year = new Date().getFullYear()
  const isRtl = lang === 'ar'

  return (
    <footer className="site-footer" dir={isRtl ? 'rtl' : 'ltr'} role="contentinfo">
      <div className="sf-strip" aria-hidden="true" />

      <div className="sf-marquee" aria-hidden="true">
        <div className="sf-marquee-track">
          {[...TICKER_KEYS, ...TICKER_KEYS, ...TICKER_KEYS, ...TICKER_KEYS].map((it, i) => (
            <span className="sf-marquee-item" key={i}>
              <i className={`fas ${it.icon}`}></i>
              {t(it.key)}
              <span className="sf-marquee-dot">•</span>
            </span>
          ))}
        </div>
      </div>

      <div className="sf-main">
        <span className="sf-blob sf-blob-1" aria-hidden="true" />
        <span className="sf-blob sf-blob-2" aria-hidden="true" />
        <span className="sf-blob sf-blob-3" aria-hidden="true" />

        <div className="sf-container">
          <div className="sf-col sf-brand-col">
            <div className="sf-brand">
              <div className="sf-brand-logo">
                <i className="fas fa-graduation-cap"></i>
              </div>
              <div>
                <h3 className="sf-brand-name">{t('footer.brandFull')}</h3>
                <p className="sf-brand-tag">{t('footer.brandSlogan')}</p>
              </div>
            </div>
            <p className="sf-brand-desc">{t('footer.brandDesc')}</p>
            <div className="sf-social">
              <a href="#" aria-label="Facebook" className="sf-social-btn"><i className="fab fa-facebook-f"></i></a>
              <a href="#" aria-label="YouTube"  className="sf-social-btn"><i className="fab fa-youtube"></i></a>
              <a href="#" aria-label="Instagram" className="sf-social-btn"><i className="fab fa-instagram"></i></a>
              <a href="#" aria-label="Telegram" className="sf-social-btn"><i className="fab fa-telegram-plane"></i></a>
              <a href="#" aria-label="WhatsApp" className="sf-social-btn"><i className="fab fa-whatsapp"></i></a>
            </div>
          </div>

          <div className="sf-col">
            <h4 className="sf-col-title"><i className="fas fa-compass"></i> {t('footer.quickLinks')}</h4>
            <ul className="sf-links">
              <li><Link to="/"><i className="fas fa-house"></i> {t('header.home')}</Link></li>
              <li><Link to="/lectures"><i className="fas fa-book"></i> {t('header.lectures')}</Link></li>
              <li><Link to="/videos"><i className="fas fa-video"></i> {t('header.videos')}</Link></li>
              <li><Link to="/exams"><i className="fas fa-file-alt"></i> {t('header.exams')}</Link></li>
              <li><Link to="/report"><i className="fas fa-chart-bar"></i> {t('header.reports')}</Link></li>
            </ul>
          </div>

          <div className="sf-col">
            <h4 className="sf-col-title"><i className="fas fa-graduation-cap"></i> {t('footer.stages')}</h4>
            <ul className="sf-links sf-links--static">
              <li><span><i className="fas fa-seedling"></i> {t('grades.first-prep')}</span></li>
              <li><span><i className="fas fa-book-open-reader"></i> {t('grades.second-prep')}</span></li>
              <li><span><i className="fas fa-trophy"></i> {t('grades.third-prep')}</span></li>
            </ul>
            <div className="sf-badges">
              <span className="sf-badge"><i className="fas fa-shield-halved"></i> {t('footer.safe')}</span>
              <span className="sf-badge"><i className="fas fa-bolt"></i> {t('footer.fast')}</span>
              <span className="sf-badge"><i className="fas fa-mobile"></i> {t('footer.responsive')}</span>
            </div>
          </div>

          <div className="sf-col">
            <h4 className="sf-col-title"><i className="fas fa-headset"></i> {t('footer.contact')}</h4>
            <ul className="sf-contact">
              <li>
                <span className="sf-ci"><i className="fas fa-location-dot"></i></span>
                <div>
                  <span className="sf-ck">{t('footer.address')}</span>
                  <span className="sf-cv">{t('footer.addressValue')}</span>
                </div>
              </li>
              <li>
                <span className="sf-ci"><i className="fas fa-phone"></i></span>
                <div>
                  <span className="sf-ck">{t('footer.phone')}</span>
                  <span className="sf-cv" dir="ltr">+20 100 000 0000</span>
                </div>
              </li>
              <li>
                <span className="sf-ci"><i className="fas fa-envelope"></i></span>
                <div>
                  <span className="sf-ck">{t('footer.email')}</span>
                  <span className="sf-cv" dir="ltr">support@masar.edu</span>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <div className="sf-bottom">
          <div className="sf-container sf-bottom-row">
            <p className="sf-copy">{t('footer.rights', { year })}</p>
            <p className="sf-made">{t('footer.madeWith')}</p>
            <ul className="sf-mini">
              <li><Link to="/privacy">{t('footer.privacy')}</Link></li>
              <li><Link to="/terms">{t('footer.terms')}</Link></li>
              <li><Link to="/help">{t('footer.help')}</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  )
}
