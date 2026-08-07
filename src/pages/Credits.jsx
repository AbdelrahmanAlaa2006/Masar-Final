import React from 'react'
import { useTenant } from '../contexts/TenantContext'
import './Credits.css'

const DEVELOPERS_DATA = [
  {
    name: 'Abdelrahman Alaa',
    nameAr: 'عبدالرحمن علاء',
    role: 'Software Engineer & Cybersecurity Specialist',
    roleAr: 'مهندس برمجيات ومتخصص أمن سيبراني',
    image: 'https://github.com/AbdelrahmanAlaa2006.png',
    education: 'Faculty of Computers and Data Science, Alexandria University',
    educationAr: 'طالب أمن سيبراني — كلية الحاسبات وعلوم البيانات، جامعة الإسكندرية',
    bio: 'Architected the core multi-tenant backend engine, high-performance database layer, web security protocols, and cloud infrastructure for the GitFekra platform.',
    bioAr: 'تطوير وتصميم المعمارية البرمجية لمنظومة جِت فِكرة، وإدارة أمن البيانات وقواعد البيانات والأنظمة السحابية عالية الأداء.',
    links: {
      github: 'https://github.com/AbdelrahmanAlaa2006',
      linkedin: 'https://www.linkedin.com/in/abdelrahman-alaa2006',
      facebook: 'https://www.facebook.com/abdelrahman.alaa.988711',
      instagram: 'https://www.instagram.com/abd_elrahman_alaa3/',
    },
  },
  {
    name: 'Eyad Elalkamy',
    nameAr: 'إياد العلقامي',
    role: 'Software Engineer & Cybersecurity Specialist',
    roleAr: 'مهندس برمجيات ومتخصص أمن سيبراني',
    image: 'https://github.com/eyadelalkamy-oss.png',
    education: 'Faculty of Computers and Data Science, Alexandria University',
    educationAr: 'طالب أمن سيبراني — كلية الحاسبات وعلوم البيانات، جامعة الإسكندرية',
    bio: 'Designed and built the user experiences, interactive student interfaces, responsive real-time dashboards, and client security & performance optimizations.',
    bioAr: 'تصميم وبناء واجهات المستخدم التفاعلية لمنظومة جِت فِكرة، وتطوير أمن وتجربة المستخدم للطلاب والمعلمين.',
    links: {
      github: 'https://github.com/eyadelalkamy-oss',
      linkedin: 'https://www.linkedin.com/in/eyad-atef-elalkamy-709615385',
      facebook: 'https://www.facebook.com/eyad.alkamy',
      instagram: 'https://www.instagram.com/eyad_elalkamy/',
    },
  },
]

export default function Credits() {
  const { tenantName } = useTenant()

  return (
    <div className="credits-page-wrapper" dir="rtl">
      <div className="credits-container">
        {/* Header Section */}
        <header className="credits-header">
          <div className="credits-badge">
            <i className="fas fa-shield-halved"></i> GitFekra Platform Engineering & Cybersecurity
          </div>
          <h1 className="credits-title">فريق تطوير منظومة جِت فِكرة (GitFekra)</h1>
          <p className="credits-subtitle">
            تم تطوير وتصميم البنية البرمجية لمنصة <strong>{tenantName || 'جِت فِكرة'}</strong> بواسطة مهندسي البرمجيات والأمن السيبراني:
          </p>
        </header>

        {/* Developer Cards Grid */}
        <div className="developers-grid">
          {DEVELOPERS_DATA.map((dev, idx) => (
            <div key={idx} className="developer-card">
              <div className="dev-avatar-container">
                <img src={dev.image} alt={dev.name} className="dev-avatar-img" />
              </div>
              <div className="dev-info">
                <h2 className="dev-name">
                  {dev.nameAr} <span className="dev-name-en">({dev.name})</span>
                </h2>
                <div className="dev-role">{dev.roleAr}</div>
                <div className="dev-education" style={{ fontSize: '0.85rem', color: '#60a5fa', marginBottom: '10px', fontWeight: '600' }}>
                  <i className="fas fa-graduation-cap" style={{ marginLeft: '6px' }}></i>
                  {dev.educationAr}
                </div>
                <p className="dev-bio">{dev.bioAr}</p>

                {/* Verified Social Profiles */}
                <div className="dev-links-section">
                  <span className="dev-links-label">الملفات الشخصية الموثقة:</span>
                  <div className="dev-links">
                    <a
                      href={dev.links.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="social-btn github"
                      title="GitHub Profile"
                    >
                      <i className="fab fa-github"></i> GitHub
                    </a>
                    <a
                      href={dev.links.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="social-btn linkedin"
                      title="LinkedIn Profile"
                    >
                      <i className="fab fa-linkedin"></i> LinkedIn
                    </a>
                    <a
                      href={dev.links.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="social-btn facebook"
                      title="Facebook Profile"
                    >
                      <i className="fab fa-facebook"></i> Facebook
                    </a>
                    <a
                      href={dev.links.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="social-btn instagram"
                      title="Instagram Profile"
                    >
                      <i className="fab fa-instagram"></i> Instagram
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Software Architecture Highlights */}
        <section className="architecture-section">
          <h2>معمارية GitFekra والتخصص الأكاديمي</h2>
          <div className="tech-tags">
            <span className="tech-tag"><i className="fas fa-user-graduate"></i> كلية الحاسبات وعلوم البيانات — جامعة الإسكندرية</span>
            <span className="tech-tag"><i className="fas fa-user-lock"></i> Cybersecurity & Information Security</span>
            <span className="tech-tag"><i className="fab fa-react"></i> GitFekra SaaS Platform Engine</span>
            <span className="tech-tag"><i className="fas fa-cubes"></i> Multi-Tenant Architecture</span>
            <span className="tech-tag"><i className="fas fa-shield-cat"></i> Web Security & RLS</span>
          </div>
        </section>

        {/* Back Link */}
        <div className="credits-footer">
          <a href="/login" className="back-link">
            <i className="fas fa-arrow-right"></i> العودة لصفحة تسجيل الدخول
          </a>
        </div>
      </div>
    </div>
  )
}
