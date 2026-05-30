import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { listExams } from '@backend/examsApi'
import { listVideos } from '@backend/videosApi'
import { listStudents } from '@backend/profilesApi'
import { cached, LIST_TTL } from '../../utils/cache'
import { SectionCard, Breadcrumbs } from './shared'
import '../ControlPanel.css'

// Lazy-loaded sub-panels for code splitting
const AttemptsPanel = lazy(() => import('./AttemptsPanel'))
const AvailabilityPanel = lazy(() => import('./AvailabilityPanel'))
const RevealPanel = lazy(() => import('./RevealPanel'))
const HomeworkRevealPanel = lazy(() => import('./HomeworkRevealPanel'))
const ResetRequestsPanel = lazy(() => import('./ResetRequestsPanel'))
const DevToolsViolationsPanel = lazy(() => import('./DevToolsViolationsPanel'))
const StudentsSyncPanel = lazy(() => import('./StudentsSyncPanel'))
const SeasonalThemePanel = lazy(() => import('./SeasonalThemePanel'))
const AccountsPanel = lazy(() => import('./AccountsPanel'))

export default function ControlPanelIndex() {
  const location = useLocation()

  /* navigation */
  const [section, setSection] = useState(() => {
    if (location.state && location.state.section) {
      return location.state.section
    }
    return 'home'
  })
  
  // Which sub-tab inside a section: 'attempts' | 'availability' | 'reveal'
  const [subtab, setSubtab] = useState('attempts')

  // Toast notifications
  const [toast, setToast] = useState(null)
  const flash = (msg, kind = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 2200)
  }

  // Handle in-app notification navigations
  useEffect(() => {
    if (location.state && location.state.section) {
      setSection(location.state.section)
    }
  }, [location.state])

  /* catalog data from Supabase - shared across sub-panels */
  const [students, setStudents] = useState([])
  const [videos, setVideos]     = useState([])
  const [exams, setExams]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [s, v, e] = await Promise.all([
          cached('students', LIST_TTL, listStudents),
          cached('videos',   LIST_TTL, listVideos),
          cached('exams',    LIST_TTL, listExams),
        ])
        if (cancelled) return
        setStudents(s)
        setVideos(v)
        setExams(e)
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'تعذر تحميل البيانات')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const goHome = () => {
    setSection('home')
    setSubtab('attempts')
  }

  const enterSection = (s) => {
    setSection(s)
    setSubtab('attempts')
  }

  // Mini Panel Loader inside the Suspense boundary
  const PanelLoader = () => (
    <div className="cp-empty">
      <i className="fas fa-spinner fa-spin"></i>
      <p>جاري تحميل القسم...</p>
    </div>
  )

  return (
    <main className="cp-page">
      <div className="cp-container">
        {/* Top header */}
        <div className="cp-page-header">
          <div className="cp-page-icon">
            <i className="fas fa-sliders"></i>
          </div>
          <div>
            <h1>لوحة التحكم</h1>
            <p>إدارة صلاحيات الفيديوهات والامتحانات للطلاب والمراحل الدراسية</p>
          </div>
        </div>

        {loadError && (
          <div className="cp-empty" style={{ color: '#c53030' }}>
            <i className="fas fa-circle-exclamation"></i>
            <p>{loadError}</p>
          </div>
        )}

        {/* Breadcrumbs navigation */}
        <Breadcrumbs
          section={section}
          onHome={goHome}
          onSection={() => enterSection(section)}
        />

        {/* Home overview of modular sections */}
        {section === 'home' && (
          <div className="cp-home-grid">
            <SectionCard
              icon="fa-play-circle"
              accent="blue"
              title="إدارة الفيديوهات"
              desc="صلاحيات المشاهدة، المحاولات الإضافية، ومدة الإتاحة"
              onClick={() => enterSection('videos')}
            />
            <SectionCard
              icon="fa-file-alt"
              accent="orange"
              title="إدارة الامتحانات"
              desc="المحاولات الإضافية، مدة الإتاحة، وإظهار نتائج الامتحانات"
              onClick={() => enterSection('exams')}
            />
            <SectionCard
              icon="fa-book-open"
              accent="purple"
              title="إدارة الواجبات"
              desc="التحكم في إظهار نتائج الواجبات للطلاب"
              onClick={() => enterSection('homeworks')}
            />

            <SectionCard
              icon="fa-users"
              accent="green"
              title="مزامنة الطلاب"
              desc="رفع ملف CSV لإضافة/تحديث الطلاب وحذف من تم استبعاده"
              onClick={() => enterSection('students')}
            />
            <SectionCard
              icon="fa-user-check"
              accent="green"
              title="حسابات الطلاب والتفعيل"
              desc="مراجعة وتفعيل الحسابات الجديدة المسجلة ذاتياً والموافقة عليها"
              onClick={() => enterSection('accounts')}
            />
            <SectionCard
              icon="fa-moon"
              accent="orange"
              title="السمات الموسمية"
              desc="رمضان، عيد الفطر، عيد الأضحى، شتاء — تلقائي حسب التاريخ"
              onClick={() => enterSection('seasons')}
            />
            <SectionCard
              icon="fa-key"
              accent="red"
              title="طلبات استعادة الحساب"
              desc="استعرض طلبات استعادة كلمة المرور المقدمة من الطلاب وقم بتلبيتها"
              onClick={() => enterSection('resets')}
            />
            <SectionCard
              icon="fa-shield-halved"
              accent="red"
              title="سجلات الحماية الأمنية"
              desc="عرض وإدارة سجلات محاولات اختراق أدوات المطور (DevTools)"
              onClick={() => enterSection('violations')}
            />
          </div>
        )}

        {/* Suspense wrapper for lazy loading individual components */}
        <Suspense fallback={<PanelLoader />}>
          {section === 'students' && <StudentsSyncPanel />}
          {section === 'seasons'  && <SeasonalThemePanel />}
          {section === 'homeworks' && <HomeworkRevealPanel onBack={goHome} flash={flash} />}
          {section === 'resets' && <ResetRequestsPanel onBack={goHome} flash={flash} students={students} />}
          {section === 'violations' && <DevToolsViolationsPanel onBack={goHome} flash={flash} />}
          {section === 'accounts' && <AccountsPanel onBack={goHome} flash={flash} />}


          {/* Sub-tab navigation bar for dynamic settings */}
          {(section === 'videos' || section === 'exams') && (
            <>
              <div className="cp-subtabs" style={{
                display: 'flex', gap: 8, flexWrap: 'wrap',
                margin: '12px 0 18px',
              }}>
                <button
                  className={`cp-btn ${subtab === 'attempts' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
                  onClick={() => setSubtab('attempts')}
                >
                  <i className="fas fa-user-shield"></i> الصلاحيات والمحاولات
                </button>
                <button
                  className={`cp-btn ${subtab === 'availability' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
                  onClick={() => setSubtab('availability')}
                >
                  <i className="fas fa-hourglass-half"></i> مدة الإتاحة
                </button>
                {section === 'exams' && (
                  <button
                    className={`cp-btn ${subtab === 'reveal' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
                    onClick={() => setSubtab('reveal')}
                  >
                    <i className="fas fa-eye"></i> إظهار النتائج
                  </button>
                )}
              </div>

              {/* Render dynamic sub-sections */}
              {subtab === 'attempts' && (
                <AttemptsPanel
                  section={section}
                  students={students}
                  videos={videos}
                  exams={exams}
                  loading={loading}
                  flash={flash}
                  onBack={goHome}
                />
              )}

              {subtab === 'availability' && (
                <AvailabilityPanel
                  restrictTo={section === 'exams' ? 'exams' : 'videos'}
                  onBack={goHome}
                  flash={flash}
                />
              )}

              {section === 'exams' && subtab === 'reveal' && (
                <RevealPanel onBack={goHome} flash={flash} />
              )}
            </>
          )}
        </Suspense>
      </div>

      {toast && (
        <div className={`cp-toast cp-toast-${toast.kind}`}>
          <i className={`fas ${
            toast.kind === 'success'
              ? 'fa-circle-check'
              : toast.kind === 'warning'
              ? 'fa-circle-exclamation'
              : 'fa-circle-info'
          }`}></i>
          <span>{toast.msg}</span>
        </div>
      )}
    </main>
  )
}
