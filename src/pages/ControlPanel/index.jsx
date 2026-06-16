import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { listExams } from '@backend/examsApi'
import { listVideos } from '@backend/videosApi'
import { listStudents } from '@backend/profilesApi'
import { cached, LIST_TTL } from '../../utils/cache'
import { SectionCard, Breadcrumbs } from './shared'
import { supabase } from '@backend/supabase'
import { useAuth } from '../../contexts/AuthContext'
import '../ControlPanel.css'

// Lazy-loaded sub-panels for code splitting
const AttemptsPanel = lazy(() => import('./AttemptsPanel'))
const AvailabilityPanel = lazy(() => import('./AvailabilityPanel'))
const RevealPanel = lazy(() => import('./RevealPanel'))
const HomeworkRevealPanel = lazy(() => import('./HomeworkRevealPanel'))
const ResetRequestsPanel = lazy(() => import('./ResetRequestsPanel'))
const DevToolsViolationsPanel = lazy(() => import('./DevToolsViolationsPanel'))
const SeasonalThemePanel = lazy(() => import('./SeasonalThemePanel'))
const AccountsPanel = lazy(() => import('./AccountsPanel'))
const ChatsPanel = lazy(() => import('./ChatsPanel'))

// New sub-panels
const AttendancePanel = lazy(() => import('./AttendancePanel'))
const GradesPanel = lazy(() => import('./GradesPanel'))
const AssistantsPanel = lazy(() => import('./AssistantsPanel'))
const WhatsAppQueuePanel = lazy(() => import('./WhatsAppQueuePanel'))

export default function ControlPanelIndex() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, hasPermission } = useAuth()

  /* navigation derived from URL search parameters */
  const section = searchParams.get('section') || 'home'
  const subtab = searchParams.get('subtab') || 'attempts'

  // Security Gate checks for route routing
  const isSectionAllowed = (s) => {
    if (!user) return false
    if (user.role === 'admin') return true
    if (s === 'home') return true

    // Assistant gates
    if (s === 'attendance') return hasPermission('attendance')
    if (s === 'grades') return hasPermission('grades')
    if (s === 'homeworks' || s === 'videos') return hasPermission('homework')
    if (s === 'exams') return hasPermission('exams')
    if (s === 'students' || s === 'accounts' || s === 'resets' || s === 'chats') {
      return hasPermission('students')
    }
    if (s === 'whatsapp') return hasPermission('whatsapp')

    return false
  }

  // Toast notifications
  const [toast, setToast] = useState(null)
  const flash = (msg, kind = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 2200)
  }

  /* catalog data from Supabase - shared across sub-panels */
  const [students, setStudents] = useState([])
  const [videos, setVideos]     = useState([])
  const [exams, setExams]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState('')
  const [resetRequestsCount, setResetRequestsCount] = useState(0)

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

        const { count, error: countError } = await supabase
          .from('password_reset_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending')
        if (!cancelled && !countError) {
          setResetRequestsCount(count || 0)
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'تعذر تحميل البيانات')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Refresh pending reset requests count when section changes back to home
  useEffect(() => {
    if (section === 'home') {
      let cancelled = false
      ;(async () => {
        try {
          const { count, error: countError } = await supabase
            .from('password_reset_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending')
          if (!cancelled && !countError) {
            setResetRequestsCount(count || 0)
          }
        } catch (err) {
          console.error('Failed to fetch pending reset requests count:', err)
        }
      })()
      return () => { cancelled = true }
    }
  }, [section])

  // Clear chats refresh flag when navigating away from the chats section
  useEffect(() => {
    if (section !== 'chats') {
      sessionStorage.removeItem('chats-refreshed')
    }
    return () => {
      const params = new URLSearchParams(window.location.search)
      if (window.location.pathname !== '/control-panel' || params.get('section') !== 'chats') {
        sessionStorage.removeItem('chats-refreshed')
      }
    }
  }, [section])

  const goHome = () => {
    setSearchParams({ section: 'home' }, { replace: true })
  }

  const enterSection = (s) => {
    if (!isSectionAllowed(s)) {
      flash('غير مصرح لك بالدخول إلى هذا القسم', 'warning')
      return
    }
    const nextParams = { section: s }
    if (s === 'videos' || s === 'exams') {
      nextParams.subtab = 'attempts'
    }
    setSearchParams(nextParams, { replace: true })
  }

  const setSubtab = (tab) => {
    setSearchParams({ section, subtab: tab }, { replace: true })
  }

  // Mini Panel Loader inside the Suspense boundary
  const PanelLoader = () => (
    <div className="cp-empty">
      <i className="fas fa-spinner fa-spin"></i>
      <p>جاري تحميل القسم...</p>
    </div>
  )

  const allowedToSee = isSectionAllowed(section)

  return (
    <main className="cp-page">
      <div className="cp-container">
        {/* Top header */}
        <div className="cp-page-header">
          <div className="cp-page-header-text">
            <h1>لوحة التحكم</h1>
            <p>إدارة صلاحيات الفيديوهات والامتحانات للطلاب والمراحل الدراسية</p>
          </div>
          <div className="cp-page-icon">
            <i className="fas fa-sliders"></i>
          </div>
        </div>
        <div className="cp-header-divider"></div>

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

        {/* Security check view */}
        {!allowedToSee ? (
          <div className="cp-empty" style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)', padding: '40px', borderRadius: '16px' }}>
            <i className="fas fa-shield-halved" style={{ fontSize: '2.5rem', marginBottom: '16px' }}></i>
            <h3>عذراً، غير مصرح لك بالدخول</h3>
            <p>حسابك لا يملك صلاحية كافية لاستعراض محتويات هذا القسم. يرجى مراجعة المشرف الرئيسي.</p>
            <button onClick={goHome} className="cp-btn cp-btn-secondary" style={{ marginTop: '16px' }}>الرجوع للرئيسية</button>
          </div>
        ) : (
          <>
            {/* Home overview of modular sections */}
            {section === 'home' && (
              <div className="cp-home-grid">
                
                {/* Attendance System (Gate by attendance) */}
                {hasPermission('attendance') && (
                  <SectionCard
                    icon="fa-calendar-check"
                    accent="teal"
                    title="تحضير الطلاب والغياب"
                    desc="تسجيل الحضور اليدوي، وبطاقات الهوية والـ QR الذكية"
                    onClick={() => enterSection('attendance')}
                  />
                )}

                {/* Grades System (Gate by grades) */}
                {hasPermission('grades') && (
                  <SectionCard
                    icon="fa-star"
                    accent="gold"
                    title="رصد الدرجات والتقييم"
                    desc="رصد الواجبات والامتحانات وسجل التقييم السلوكي والتفاعل"
                    onClick={() => enterSection('grades')}
                  />
                )}

                {/* Videos System (Gate by homework) */}
                {hasPermission('homework') && (
                  <SectionCard
                    icon="fa-play-circle"
                    accent="blue"
                    title="إدارة الفيديوهات"
                    desc="صلاحيات المشاهدة، المحاولات الإضافية، ومدة الإتاحة"
                    onClick={() => enterSection('videos')}
                  />
                )}

                {/* Exams System (Gate by exams) */}
                {hasPermission('exams') && (
                  <SectionCard
                    icon="fa-file-alt"
                    accent="orange"
                    title="إدارة الامتحانات"
                    desc="المحاولات الإضافية، مدة الإتاحة، وإظهار نتائج الامتحانات"
                    onClick={() => enterSection('exams')}
                  />
                )}

                {/* Homework System (Gate by homework) */}
                {hasPermission('homework') && (
                  <SectionCard
                    icon="fa-book-open"
                    accent="purple"
                    title="إدارة الواجبات"
                    desc="التحكم في إظهار نتائج الواجبات للطلاب"
                    onClick={() => enterSection('homeworks')}
                  />
                )}

                {/* Students accounts activation (Gate by students) */}
                {hasPermission('students') && (
                  <SectionCard
                    icon="fa-user-check"
                    accent="green"
                    title="تفعيل حسابات الطلاب"
                    desc="مراجعة وتفعيل الحسابات الجديدة والموافقة عليها"
                    onClick={() => enterSection('accounts')}
                  />
                )}

                {/* WhatsApp queue notifications (Gate by whatsapp) */}
                {hasPermission('whatsapp') && (
                  <SectionCard
                    icon="fa-comments-dollar"
                    accent="teal"
                    title="إشعارات أولياء الأمور"
                    desc="متابعة طابور الإرسال المجدول للآباء وضبط Evolution API"
                    onClick={() => enterSection('whatsapp')}
                  />
                )}

                {/* Reset requests (Gate by students) */}
                {hasPermission('students') && (
                  <SectionCard
                    icon="fa-key"
                    accent="gold"
                    title="طلبات استعادة الحساب"
                    desc="استعرض طلبات استعادة كلمة المرور المقدمة من الطلاب"
                    onClick={() => enterSection('resets')}
                    badge={resetRequestsCount}
                  />
                )}

                {/* Chat Panel (Gate by students) */}
                {hasPermission('students') && (
                  <SectionCard
                    icon="fa-comments"
                    accent="teal"
                    title="محادثات الطلاب"
                    desc="استعرض وأجب على رسائل واستفسارات الطلاب"
                    onClick={() => enterSection('chats')}
                  />
                )}

                {/* Assistants Management (Primary Admin Only) */}
                {user?.role === 'admin' && (
                  <SectionCard
                    icon="fa-user-shield"
                    accent="violet"
                    title="المساعدين والصلاحيات"
                    desc="إضافة مساعدين وتعيين صلاحيات RBAC لكل حساب فرعي"
                    onClick={() => enterSection('assistants')}
                  />
                )}

                {/* Seasons settings (Primary Admin Only) */}
                {user?.role === 'admin' && (
                  <SectionCard
                    icon="fa-moon"
                    accent="violet"
                    title="السمات الموسمية"
                    desc="رمضان، عيد الفطر، عيد الأضحى، شتاء — تلقائي"
                    onClick={() => enterSection('seasons')}
                  />
                )}

                {/* Security Violations (Primary Admin Only) */}
                {user?.role === 'admin' && (
                  <SectionCard
                    icon="fa-shield-halved"
                    accent="red"
                    title="سجلات الحماية الأمنية"
                    desc="عرض محاولات اختراق أدوات المطور (DevTools)"
                    onClick={() => enterSection('violations')}
                  />
                )}

              </div>
            )}

            {section === 'chats' && (
              <ChatsPanel 
                onBack={goHome} 
                flash={flash} 
                initialStudentId={searchParams.get('studentId')} 
              />
            )}

            {/* Suspense wrapper for lazy loading individual components */}
            <Suspense fallback={<PanelLoader />}>
              {section === 'seasons'  && <SeasonalThemePanel />}
              {section === 'homeworks' && <HomeworkRevealPanel onBack={goHome} flash={flash} />}
              {section === 'resets' && <ResetRequestsPanel onBack={goHome} flash={flash} students={students} />}
              {section === 'violations' && <DevToolsViolationsPanel onBack={goHome} flash={flash} />}
              {section === 'accounts' && <AccountsPanel onBack={goHome} flash={flash} />}
              
              {/* Load new panels */}
              {section === 'attendance' && <AttendancePanel onBack={goHome} flash={flash} />}
              {section === 'grades' && <GradesPanel onBack={goHome} flash={flash} />}
              {section === 'assistants' && <AssistantsPanel onBack={goHome} flash={flash} />}
              {section === 'whatsapp' && <WhatsAppQueuePanel onBack={goHome} flash={flash} />}

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
          </>
        )}
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
