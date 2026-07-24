import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom'
import { listExams } from '@backend/examsApi'
import { listVideos } from '@backend/videosApi'
import { listStudents } from '@backend/profilesApi'
import { cached, LIST_TTL } from '../../utils/cache'
import { SectionCard, Breadcrumbs } from './shared'
import { supabase } from '@backend/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useTenant } from '../../contexts/TenantContext'
import '../ControlPanel.css'

// Lazy-loaded sub-panels for code splitting
const AttemptsPanel = lazy(() => import('./AttemptsPanel'))
const AvailabilityPanel = lazy(() => import('./AvailabilityPanel'))
const RevealPanel = lazy(() => import('./RevealPanel'))
const HomeworkRevealPanel = lazy(() => import('./HomeworkRevealPanel'))
const ResetRequestsPanel = lazy(() => import('./ResetRequestsPanel'))
const DevToolsViolationsPanel = lazy(() => import('./DevToolsViolationsPanel'))
const AccountsPanel = lazy(() => import('./AccountsPanel'))
const ChatsPanel = lazy(() => import('./ChatsPanel'))
const GroupsPanel = lazy(() => import('./GroupsPanel'))

// New sub-panels
const AttendancePanel = lazy(() => import('./AttendancePanel'))
const GradesPanel = lazy(() => import('./GradesPanel'))
const AssistantsPanel = lazy(() => import('./AssistantsPanel'))
const WhatsAppQueuePanel = lazy(() => import('./WhatsAppQueuePanel'))
const AnnouncementsPanel = lazy(() => import('./AnnouncementsPanel'))
const FinancePanel = lazy(() => import('./FinancePanel'))
const SuperAdminPanel = lazy(() => import('./SuperAdminPanel'))
const BranchesPanel = lazy(() => import('./BranchesPanel'))

const PlaylistsPanel = lazy(() => import('./PlaylistsPanel'))
const PackagesPanel = lazy(() => import('./PackagesPanel'))
const PurchasesPanel = lazy(() => import('./PurchasesPanel'))
const StudentAccessPanel = lazy(() => import('./StudentAccessPanel'))
const CalendarPanel = lazy(() => import('./CalendarPanel'))

export default function ControlPanelIndex() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, hasPermission } = useAuth()
  const { isFeatureEnabled } = useTenant()

  /* navigation derived from URL search parameters */
  const section = searchParams.get('section') || 'home'
  const subtab = searchParams.get('subtab') || 'attempts'

  // Security Gate checks for route routing
  const isSectionAllowed = (s) => {
    if (!user) return false
    if (user.role === 'super_admin') return true

    // Feature toggles check (blocks access if feature is disabled in tenant settings)
    if (s === 'attendance' && !isFeatureEnabled('attendance')) return false
    if (s === 'grades' && !isFeatureEnabled('grades')) return false
    if (s === 'exams' && !isFeatureEnabled('exams')) return false
    if (s === 'homeworks' && !isFeatureEnabled('homework')) return false
    if (s === 'videos' && !isFeatureEnabled('videos')) return false
    if (s === 'whatsapp' && !isFeatureEnabled('notifications')) return false
    if (s === 'announcements' && !isFeatureEnabled('notifications')) return false

    if (user.role === 'admin' || user.role === 'super_admin') return true
    if (s === 'home') return true

    // Assistant gates
    if (s === 'playlists') return hasPermission('videos') || hasPermission('exams') || hasPermission('homework')
    if (s === 'calendar') return hasPermission('videos') || hasPermission('exams') || hasPermission('homework')
    if (s === 'packages' || s === 'purchases') return hasPermission('payments')
    if (s === 'student_access') return hasPermission('students')
    if (s === 'attendance') return hasPermission('attendance')
    if (s === 'grades') return hasPermission('grades')
    if (s === 'homeworks') return hasPermission('homework')
    if (s === 'videos') return hasPermission('videos')
    if (s === 'exams') return hasPermission('exams')
    if (s === 'students' || s === 'accounts' || s === 'resets' || s === 'chats' || s === 'groups') {
      return hasPermission('students')
    }
    if (s === 'whatsapp') return hasPermission('whatsapp')
    if (s === 'announcements') return hasPermission('whatsapp')
    if (s === 'finance') return hasPermission('payments')
    if (s === 'branches') {
      return hasPermission('branches:view') || hasPermission('branches:edit')
    }

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
  const [videos, setVideos] = useState([])
  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [resetRequestsCount, setResetRequestsCount] = useState(0)
  const [pendingStudentsCount, setPendingStudentsCount] = useState(0)

  useEffect(() => {
    if (user?.role === 'super_admin') {
      setLoading(false)
      return
    }
    let cancelled = false
      ; (async () => {
        try {
          // The full student roster is NOT loaded here — only AttemptsPanel
          // needs it, and it's loaded lazily when that sub-tab opens (below).
          const [v, e] = await Promise.all([
            cached('videos', LIST_TTL, listVideos),
            cached('exams-lean', LIST_TTL, () => listExams({ lean: true })),
          ])
          if (cancelled) return
          setVideos(v)
          setExams(e)

          const fetchCount = async () => {
            const { count, error } = await supabase
              .from('password_reset_requests')
              .select('*', { count: 'exact', head: true })
              .eq('status', 'pending')
            if (error) throw error
            return count || 0
          }
          const count = await cached('password_reset_requests_count', 10000, fetchCount)
          
          let pendingCount = 0
          if (hasPermission('students') || user?.role === 'admin') {
            const fetchPendingCount = async () => {
              const { count, error } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'student')
                .eq('is_approved', false)
              if (error) throw error
              return count || 0
            }
            pendingCount = await cached('pending_students_count', 10000, fetchPendingCount)
          }

          if (!cancelled) {
            setResetRequestsCount(count)
            setPendingStudentsCount(pendingCount)
          }
        } catch (err) {
          if (!cancelled) setLoadError(err.message || 'تعذر تحميل البيانات')
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    return () => { cancelled = true }
  }, [])

  // Lazily load the student roster only when the attempts sub-tab (the one
  // screen here that needs it) is open — not on every control-panel open.
  useEffect(() => {
    const needsRoster = (section === 'videos' || section === 'exams') && subtab === 'attempts'
    if (!needsRoster || students.length > 0) return
    let cancelled = false
    ;(async () => {
      try {
        const s = await cached('students', LIST_TTL, listStudents)
        if (!cancelled) setStudents(s)
      } catch (err) {
        if (!cancelled) console.error('Failed to load students for attempts panel:', err)
      }
    })()
    return () => { cancelled = true }
  }, [section, subtab])

  // Refresh pending reset requests count when section changes back to home
  useEffect(() => {
    if (section === 'home') {
      let cancelled = false
        ; (async () => {
          try {
            const fetchCount = async () => {
              const { count, error } = await supabase
                .from('password_reset_requests')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending')
              if (error) throw error
              return count || 0
            }

            const fetchPendingCount = async () => {
              const { count, error } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'student')
                .eq('is_approved', false)
              if (error) throw error
              return count || 0
            }

            const promises = [
              cached('password_reset_requests_count', 10000, fetchCount)
            ]

            if (hasPermission('students') || user?.role === 'admin') {
              promises.push(cached('pending_students_count', 10000, fetchPendingCount))
            }

            const results = await Promise.all(promises)
            const count = results[0]
            let pendingCount = 0
            if (promises.length > 1) {
              pendingCount = results[1]
            }

            if (!cancelled) {
              setResetRequestsCount(count)
              setPendingStudentsCount(pendingCount)
            }
          } catch (err) {
            console.error('Failed to fetch pending requests count:', err)
          }
        })()
      return () => { cancelled = true }
    }
  }, [section])

  // NOTE: previously this cleared the 'chats-refreshed' flag on every navigation
  // away from Chats, which made ChatsPanel's one-time layout-fix reload fire a
  // FULL PAGE RELOAD on *every* visit to Chats (re-running the entire app boot).
  // We now leave the flag set for the session, so the reload happens at most
  // once per session (first Chats open) instead of on every visit. The panel
  // still refreshes its data on each mount via loadOverview() — no reload needed.

  // Scroll to top on section transitions
  useEffect(() => {
    window.scrollTo(0, 0)
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

  if (user?.role === 'super_admin') {
    return (
      <main className="cp-page">
        <div className="cp-container">
          <Suspense fallback={<PanelLoader />}>
            <SuperAdminPanel onBack={() => navigate('/')} flash={flash} />
          </Suspense>
        </div>
        {toast && (
          <div className={`cp-toast cp-toast-${toast.kind}`}>
            <i className={`fas ${toast.kind === 'success'
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

  return (
    <main className="cp-page">
      <div className="cp-container">
        {/* Top header */}
        {section === 'home' && (
          <>
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
          </>
        )}

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
                    desc="تسجيل الحضور اليدوي، وبطاقات الباركود الذكية"
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

                {/* Videos System (Gate by videos) */}
                {hasPermission('videos') && (
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
                    badge={pendingStudentsCount}
                  />
                )}

                {/* Groups Management (Gate by students) */}
                {hasPermission('students') && (
                  <SectionCard
                    icon="fa-user-group"
                    accent="indigo"
                    title="إدارة المجموعات"
                    desc="إضافة وتعديل المجموعات الدراسية لكل مرحلة وفرع"
                    onClick={() => enterSection('groups')}
                  />
                )}

                {/* WhatsApp queue notifications (Gate by whatsapp) */}
                {hasPermission('whatsapp') && (
                  <SectionCard
                    icon="fa-comments-dollar"
                    accent="teal"
                    title="إشعارات أولياء الأمور"
                    desc="متابعة رسائل أولياء الأمور وإرسالها عبر الواتساب"
                    onClick={() => enterSection('whatsapp')}
                  />
                )}

                {/* Manual announcements (Gate by whatsapp) */}
                {hasPermission('whatsapp') && (
                  <SectionCard
                    icon="fa-bullhorn"
                    accent="orange"
                    title="الإعلانات والرسائل الجماعية"
                    desc="إرسال إعلانات يدوية للطلاب وأولياء الأمور مع رسائل محفوظة وقوالب"
                    onClick={() => enterSection('announcements')}
                  />
                )}

                {/* Financial ledger (Gate by payments) */}
                {(user?.role === 'admin' || hasPermission('payments')) && (
                  <SectionCard
                    icon="fa-cash-register"
                    accent="green"
                    title="الدفتر المالي والمصروفات"
                    desc="دفتر يومي شامل: إيرادات ومصروفات وتقارير وأرصدة الطلاب المتأخرة"
                    onClick={() => enterSection('finance')}
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

                {/* Branches Management (Admin or authorized assistants) */}
                {(user?.role === 'admin' || hasPermission('branches:view') || hasPermission('branches:edit')) && (
                  <SectionCard
                    icon="fa-map-marker-alt"
                    accent="violet"
                    title="إدارة الفروع"
                    desc="إضافة وتعديل الفروع الدراسية التابعة للمنصة"
                    onClick={() => enterSection('branches')}
                  />
                )}



                {/* Playlists Management */}
                {(user?.role === 'admin' || hasPermission('videos') || hasPermission('exams') || hasPermission('homework')) && (
                  <SectionCard
                    icon="fa-list-check"
                    accent="indigo"
                    title="قوائم التشغيل (Playlists)"
                    desc="تنظيم المحاضرات والامتحانات والواجبات في وحدات ومجموعات متكاملة"
                    onClick={() => enterSection('playlists')}
                  />
                )}

                {/* Packages Management */}
                {(user?.role === 'admin' || hasPermission('payments')) && (
                  <SectionCard
                    icon="fa-box-open"
                    accent="purple"
                    title="الباقات والاشتراكات"
                    desc="إنشاء باقات المحتوى المدفوعة وتجميع المحاضرات والامتحانات للبيع"
                    onClick={() => enterSection('packages')}
                  />
                )}

                {/* Package Purchases */}
                {(user?.role === 'admin' || hasPermission('payments')) && (
                  <SectionCard
                    icon="fa-receipt"
                    accent="gold"
                    title="طلبات الشراء والتحويلات"
                    desc="مراجعة وتفعيل إيصالات دفع الطلاب لشراء الباقات الأونلاين"
                    onClick={() => enterSection('purchases')}
                  />
                )}

                {/* Student Content Access Overrides */}
                {(user?.role === 'admin' || hasPermission('students')) && (
                  <SectionCard
                    icon="fa-user-lock"
                    accent="teal"
                    title="صلاحيات محتوى الطلاب"
                    desc="منح أو سحب صلاحيات مشاهدة الفيديوهات والامتحانات لطلاب معينين"
                    onClick={() => enterSection('student_access')}
                  />
                )}

                {/* Calendar & Events scheduling */}
                {(user?.role === 'admin' || hasPermission('videos') || hasPermission('exams') || hasPermission('homework')) && (
                  <SectionCard
                    icon="fa-calendar-alt"
                    accent="blue"
                    title="التقويم والفعاليات"
                    desc="جدولة مواعيد المحاضرات والامتحانات والواجبات وتنبيهات الطلاب"
                    onClick={() => enterSection('calendar')}
                  />
                )}

                {/* Security Violations (Admin & Super Admin) */}
                {(user?.role === 'admin' || user?.role === 'super_admin') && (
                  <SectionCard
                    icon="fa-shield-halved"
                    accent="red"
                    title="سجلات الحماية الأمنية"
                    desc="عرض محاولات اختراق أدوات المطور (DevTools)"
                    onClick={() => enterSection('violations')}
                  />
                )}

                {/* Super Admin Tools (SaaS Owner/Developer Only) */}
                {user?.role === 'super_admin' && (
                  <SectionCard
                    icon="fa-user-ninja"
                    accent="red"
                    title="لوحة تحكم المطور (Super Admin)"
                    desc="إدارة المدرسين المشتركين، وعمليات صيانة قاعدة البيانات"
                    onClick={() => enterSection('super_admin')}
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
              {section === 'homeworks' && <HomeworkRevealPanel onBack={goHome} flash={flash} />}
              {section === 'resets' && <ResetRequestsPanel onBack={goHome} flash={flash} />}
              {section === 'violations' && <DevToolsViolationsPanel onBack={goHome} flash={flash} />}
              {section === 'accounts' && <AccountsPanel onBack={goHome} flash={flash} />}
              {section === 'groups' && <GroupsPanel onBack={goHome} flash={flash} />}

              {/* Load new panels */}
              {section === 'attendance' && <AttendancePanel onBack={goHome} flash={flash} />}
              {section === 'grades' && <GradesPanel onBack={goHome} flash={flash} />}
              {section === 'assistants' && <AssistantsPanel onBack={goHome} flash={flash} />}
              {section === 'whatsapp' && <WhatsAppQueuePanel onBack={goHome} flash={flash} />}
              {section === 'announcements' && <AnnouncementsPanel onBack={goHome} flash={flash} />}
              {section === 'finance' && <FinancePanel onBack={goHome} flash={flash} />}
              {section === 'super_admin' && <SuperAdminPanel onBack={goHome} flash={flash} />}
              {section === 'branches' && <BranchesPanel onBack={goHome} flash={flash} />}

              {section === 'playlists' && <PlaylistsPanel onBack={goHome} flash={flash} />}
              {section === 'packages' && <PackagesPanel onBack={goHome} flash={flash} />}
              {section === 'purchases' && <PurchasesPanel onBack={goHome} flash={flash} />}
              {section === 'student_access' && <StudentAccessPanel onBack={goHome} flash={flash} />}
              {section === 'calendar' && <CalendarPanel onBack={goHome} flash={flash} />}

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
          <i className={`fas ${toast.kind === 'success'
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
