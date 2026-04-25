import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
import './PolicyPage.css'

export default function Help() {
  const navigate = useNavigate()
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(0)

  const faqs = t('help.faqs') || []

  return (
    <main className="pp-page" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="pp-container">
        <button className="pp-back-btn" onClick={() => navigate(-1)}>
          <i className={`fas ${lang === 'ar' ? 'fa-arrow-right' : 'fa-arrow-left'}`}></i> {t('common.back')}
        </button>

        <div className="pp-hero">
          <div className="pp-hero-icon"><i className="fas fa-circle-question"></i></div>
          <h1>{t('help.pageTitle')}</h1>
          <p>{t('help.pageDesc')}</p>
        </div>

        <div className="pp-card">
          <h2><span className="pp-num"><i className="fas fa-book"></i></span> {t('help.startHere')}</h2>
          <p>{t('help.startHereDesc')}</p>
          <ul>
            <li>{t('help.startBullet1')}</li>
            <li>{t('help.startBullet2')}</li>
            <li>{t('help.startBullet3')}</li>
            <li>{t('help.startBullet4')}</li>
          </ul>
        </div>

        <div className="pp-card">
          <h2><span className="pp-num"><i className="fas fa-comments-question"></i></span> {t('help.faq')}</h2>
          {faqs.map((f, i) => (
            <div key={i} className={`pp-faq-item ${open === i ? 'is-open' : ''}`}>
              <button className="pp-faq-q" onClick={() => setOpen(open === i ? -1 : i)}>
                <span>{f.q}</span>
                <i className="fas fa-chevron-down"></i>
              </button>
              <div className="pp-faq-a">{f.a}</div>
            </div>
          ))}
        </div>

        <div className="pp-contact-card">
          <h3>{t('help.notFound')}</h3>
          <p>{t('help.notFoundDesc')}</p>
          <div className="pp-contact-row">
            <a href="mailto:support@masar.edu"><i className="fas fa-envelope"></i> support@masar.edu</a>
            <a href="tel:+201000000000" dir="ltr"><i className="fas fa-phone"></i> +20 100 000 0000</a>
            <a href="https://wa.me/201000000000" target="_blank" rel="noreferrer"><i className="fab fa-whatsapp"></i> {t('help.whatsapp')}</a>
          </div>
        </div>
      </div>
    </main>
  )
}
