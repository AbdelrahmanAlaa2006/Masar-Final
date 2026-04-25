import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
import './PolicyPage.css'

export default function Privacy() {
  const navigate = useNavigate()
  const { t, lang } = useI18n()

  const sections = t('privacy.sections') || []

  return (
    <main className="pp-page" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="pp-container">
        <button className="pp-back-btn" onClick={() => navigate(-1)}>
          <i className={`fas ${lang === 'ar' ? 'fa-arrow-right' : 'fa-arrow-left'}`}></i> {t('common.back')}
        </button>

        <div className="pp-hero">
          <div className="pp-hero-icon"><i className="fas fa-shield-halved"></i></div>
          <h1>{t('privacy.pageTitle')}</h1>
          <p>{t('privacy.pageDesc')}</p>
          <div className="pp-meta">{t('privacy.lastUpdate')}</div>
        </div>

        {sections.map((s, i) => (
          <div key={i} className="pp-card">
            <h2>
              <span className="pp-num"><i className={`fas ${s.icon}`}></i></span>
              {s.title}
            </h2>
            <p>{s.body}</p>
            {s.bullets && (
              <ul>{s.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
            )}
          </div>
        ))}

        <div className="pp-contact-card">
          <h3>{t('privacy.questionTitle')}</h3>
          <p>{t('privacy.questionDesc')}</p>
          <div className="pp-contact-row">
            <a href="mailto:privacy@masar.edu"><i className="fas fa-envelope"></i> privacy@masar.edu</a>
          </div>
        </div>
      </div>
    </main>
  )
}
