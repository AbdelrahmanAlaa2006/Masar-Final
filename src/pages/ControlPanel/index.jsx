import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom'
import { listExams } from '@backend/examsApi'
import { listVideos } from '@backend/videosApi'
import { listStudents } from '@backend/profilesApi'
import { listBranches } from '@backend/branchesApi'
import { listAcademicYears } from '@backend/academicYearsApi'
import { listGroups } from '@backend/groupsApi'
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

const SECTION_META = {
  home: { title: 'الرئيسية', icon: 'fa-house', closable: false },
  attendance: { title: 'التحضير والغياب', icon: 'fa-calendar-check', closable: true },
  accounts: { title: 'حسابات الطلاب', icon: 'fa-user-check', closable: true },
  groups: { title: 'إدارة المجموعات', icon: 'fa-user-group', closable: true },
  grades: { title: 'رصد الدرجات', icon: 'fa-star', closable: true },
  homeworks: { title: 'إدارة الواجبات', icon: 'fa-book-open', closable: true },
  resets: { title: 'طلبات الاستعادة', icon: 'fa-key', closable: true },
  violations: { title: 'سجلات الحماية', icon: 'fa-shield-halved', closable: true },
  chats: { title: 'محادثات الطلاب', icon: 'fa-comments', closable: true },
  assistants: { title: 'المساعدين والصلاحيات', icon: 'fa-user-shield', closable: true },
  whatsapp: { title: 'إشعارات أولياء الأمور', icon: 'fa-comments-dollar', closable: true },
  announcements: { title: 'الإعلانات والرسائل', icon: 'fa-bullhorn', closable: true },
  finance: { title: 'الدفتر المالي', icon: 'fa-cash-register', closable: true },
  branches: { title: 'إدارة الفروع', icon: 'fa-map-marker-alt', closable: true },
  playlists: { title: 'قوائم التشغيل', icon: 'fa-list-check', closable: true },
  packages: { title: 'الباقات والاشتراكات', icon: 'fa-box-open', closable: true },
  purchases: { title: 'طلبات الشراء', icon: 'fa-receipt', closable: true },
  student_access: { title: 'صلاحيات المحتوى', icon: 'fa-user-lock', closable: true },
  calendar: { title: 'التقويم والفعاليات', icon: 'fa-calendar-alt', closable: true },
  videos: { title: 'إدارة الفيديوهات', icon: 'fa-play-circle', closable: true },
  exams: { title: 'إدارة الامتحانات', icon: 'fa-file-alt', closable: true },
  super_admin: { title: 'لوحة المطور', icon: 'fa-user-ninja', closable: true },
}

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

  /* ──────── Internal Dashboard Tab Orchestration ──────── */
  const TAB_STORAGE_KEY = `cp_open_tabs_${user?.id || 'guest'}`
  const ACTIVE_TAB_KEY = `cp_active_tab_${user?.id || 'guest'}`

  const [openTabs, setOpenTabs] = useState(() => {
    const initSec = searchParams.get('section')
    try {
      const storedStr = sessionStorage.getItem(TAB_STORAGE_KEY)
      if (storedStr) {
        const storedSections = JSON.parse(storedStr)
        if (Array.isArray(storedSections) && storedSections.length > 0) {
          const list = storedSections
            .filter((sec) => SECTION_META[sec])
            .map((sec) => ({
              id: sec,
              section: sec,
              title: SECTION_META[sec].title,
              icon: SECTION_META[sec].icon,
              closable: SECTION_META[sec].closable !== false
            }))

          if (list.length > 0) {
            if (initSec && initSec !== 'home' && SECTION_META[initSec]) {
              const exists = list.some((t) => t.id === initSec)
              if (!exists) {
                const meta = SECTION_META[initSec]
                list.push({ id: initSec, section: initSec, title: meta.title, icon: meta.icon, closable: meta.closable !== false })
              }
            }
            return list
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse cp_open_tabs from sessionStorage:', e)
    }

    const list = [{ id: 'home', section: 'home', title: SECTION_META.home.title, icon: SECTION_META.home.icon, closable: false }]
    if (initSec && initSec !== 'home' && SECTION_META[initSec]) {
      const meta = SECTION_META[initSec]
      list.push({ id: initSec, section: initSec, title: meta.title, icon: meta.icon, closable: meta.closable !== false })
    }
    return list
  })

  const [activeTabId, setActiveTabId] = useState(() => {
    const initSec = searchParams.get('section')
    if (initSec && SECTION_META[initSec]) return initSec
    try {
      const storedActive = sessionStorage.getItem(ACTIVE_TAB_KEY)
      if (storedActive && SECTION_META[storedActive]) return storedActive
    } catch (e) {}
    return 'home'
  })

  // Synchronize openTabs list to sessionStorage
  useEffect(() => {
    try {
      const sections = openTabs.map((t) => t.section)
      sessionStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(sections))
    } catch (e) {}
  }, [openTabs, TAB_STORAGE_KEY])

  const activeTabRef = useRef(null)

  // Auto-scroll active tab into view when activeTabId changes
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }, [activeTabId])

  // Synchronize activeTabId to sessionStorage and reset scroll to top
  useEffect(() => {
    try {
      if (activeTabId) {
        sessionStorage.setItem(ACTIVE_TAB_KEY, activeTabId)
      }
    } catch (e) {}
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    })
  }, [activeTabId, ACTIVE_TAB_KEY])

  // Keep internal openTabs synchronized with searchParams (e.g. sidebar navigation, top navbar, or deep links)
  useEffect(() => {
    const sectionParam = searchParams.get('section') || 'home'

    if (!isSectionAllowed(sectionParam)) return

    setOpenTabs((prev) => {
      const exists = prev.some((t) => t.id === sectionParam)
      if (exists) return prev
      const meta = SECTION_META[sectionParam] || { title: sectionParam, icon: 'fa-folder', closable: true }
      return [...prev, { id: sectionParam, section: sectionParam, title: meta.title, icon: meta.icon, closable: meta.closable !== false }]
    })
    setActiveTabId(sectionParam)
  }, [searchParams])

  // Clear tabs ONLY when user or tenant ACTUALLY changes (e.g. login as different user or switch tenant)
  const lastUserRef = useRef({ id: user?.id, tenant_id: user?.tenant_id })
  useEffect(() => {
    const prev = lastUserRef.current
    if (prev.id && user?.id && (prev.id !== user.id || prev.tenant_id !== user?.tenant_id)) {
      try {
        sessionStorage.removeItem(TAB_STORAGE_KEY)
        sessionStorage.removeItem(ACTIVE_TAB_KEY)
      } catch (e) {}
      setOpenTabs([{ id: 'home', section: 'home', title: SECTION_META.home.title, icon: SECTION_META.home.icon, closable: false }])
      setActiveTabId('home')
    }
    lastUserRef.current = { id: user?.id, tenant_id: user?.tenant_id }
  }, [user?.id, user?.tenant_id])

  const handleSwitchTab = (tabId) => {
    const tab = openTabs.find((t) => t.id === tabId)
    if (!tab) return
    setActiveTabId(tabId)
    setSearchParams({ section: tab.section }, { replace: true })
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    })
  }

  const handleCloseTab = (tabId, e) => {
    if (e) e.stopPropagation()
    if (tabId === 'home') return

    setOpenTabs((prev) => {
      const closedIndex = prev.findIndex((t) => t.id === tabId)
      const nextTabs = prev.filter((t) => t.id !== tabId)
      if (activeTabId === tabId) {
        const newActive = nextTabs[Math.max(0, closedIndex - 1)] || nextTabs[0]
        if (newActive) {
          setActiveTabId(newActive.id)
          setSearchParams({ section: newActive.section }, { replace: true })
        }
      }
      return nextTabs
    })
  }

  // Toast notifications
  const [toast, setToast] = useState(null)
  const flash = (msg, kind = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 4000)
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
          const [v, e] = await Promise.all([
            cached('videos', LIST_TTL, listVideos),
            cached('exams-lean', LIST_TTL, () => listExams({ lean: true })),
            listBranches(),
            listAcademicYears(),
            listGroups()
          ])
          if (cancelled) return
          setVideos(v)
          setExams(e)

          const fetchCount = async () => {
            const { count, error } = await supabase
              .from('password_reset_requests')
              .select('id', { count: 'exact', head: true })
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
                .select('id', { count: 'exact', head: true })
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

  useEffect(() => {
    if (section === 'home') {
      let cancelled = false
        ; (async () => {
          try {
            const fetchCount = async () => {
              const { count, error } = await supabase
                .from('password_reset_requests')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'pending')
              if (error) throw error
              return count || 0
            }

            const fetchPendingCount = async () => {
              const { count, error } = await supabase
                .from('profiles')
                .select('id', { count: 'exact', head: true })
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

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    })
  }, [section])

  const goHome = () => {
    setSearchParams({ section: 'home' }, { replace: true })
    setActiveTabId('home')
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    })
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
    setActiveTabId(s)
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    })
  }

  const setSubtab = (tab) => {
    setSearchParams({ section, subtab: tab }, { replace: true })
  }

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
        <div className="cp-container" style={{ maxWidth: '1560px', width: '100%' }}>
          <Suspense fallback={<PanelLoader />}>
            <SuperAdminPanel onBack={() => navigate('/')} flash={flash} />
          </Suspense>
        </div>
        {toast && (
          <div className={`cp-toast cp-toast-${toast.kind}`}>
            <i className={`fas ${toast.kind === 'success'
                ? 'fa-circle-check'
                : toast.kind === 'warning'
                  ? 'fa-triangle-exclamation'
                  : toast.kind === 'error' || toast.kind === 'danger'
                    ? 'fa-circle-xmark'
                    : 'fa-circle-info'
              }`}></i>
            <span>{toast.msg}</span>
          </div>
        )}
      </main>
    )
  }

  const renderPanelContent = (s) => {
    if (s === 'home') {
      return (
        <div className="cp-home-grid">
          {hasPermission('attendance') && (
            <SectionCard
              icon="fa-calendar-check"
              accent="teal"
              title="تحضير الطلاب والغياب"
              desc="تسجيل الحضور اليدوي، وبطاقات الباركود الذكية"
              onClick={() => enterSection('attendance')}
            />
          )}
          {hasPermission('grades') && (
            <SectionCard
              icon="fa-star"
              accent="gold"
              title="رصد الدرجات والتقييم"
              desc="رصد الواجبات والامتحانات وسجل التقييم السلوكي والتفاعل"
              onClick={() => enterSection('grades')}
            />
          )}
          {hasPermission('videos') && (
            <SectionCard
              icon="fa-play-circle"
              accent="blue"
              title="إدارة الفيديوهات"
              desc="صلاحيات المشاهدة، المحاولات الإضافية، ومدة الإتاحة"
              onClick={() => enterSection('videos')}
            />
          )}
          {hasPermission('exams') && (
            <SectionCard
              icon="fa-file-alt"
              accent="orange"
              title="إدارة الامتحانات"
              desc="المحاولات الإضافية، مدة الإتاحة، وإظهار نتائج الامتحانات"
              onClick={() => enterSection('exams')}
            />
          )}
          {hasPermission('homework') && (
            <SectionCard
              icon="fa-book-open"
              accent="purple"
              title="إدارة الواجبات"
              desc="التحكم في إظهار نتائج الواجبات للطلاب"
              onClick={() => enterSection('homeworks')}
            />
          )}
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
          {hasPermission('students') && (
            <SectionCard
              icon="fa-user-group"
              accent="indigo"
              title="إدارة المجموعات"
              desc="إضافة وتعديل المجموعات الدراسية لكل مرحلة وفرع"
              onClick={() => enterSection('groups')}
            />
          )}
          {hasPermission('whatsapp') && (
            <SectionCard
              icon="fa-comments-dollar"
              accent="teal"
              title="إشعارات أولياء الأمور"
              desc="متابعة رسائل أولياء الأمور وإرسالها عبر الواتساب"
              onClick={() => enterSection('whatsapp')}
            />
          )}
          {hasPermission('whatsapp') && (
            <SectionCard
              icon="fa-bullhorn"
              accent="orange"
              title="الإعلانات والرسائل الجماعية"
              desc="إرسال إعلانات يدوية للطلاب وأولياء الأمور مع رسائل محفوظة وقوالب"
              onClick={() => enterSection('announcements')}
            />
          )}
          {(user?.role === 'admin' || hasPermission('payments')) && (
            <SectionCard
              icon="fa-cash-register"
              accent="green"
              title="الدفتر المالي والمصروفات"
              desc="دفتر يومي شامل: إيرادات ومصروفات وتقارير وأرصدة الطلاب المتأخرة"
              onClick={() => enterSection('finance')}
            />
          )}
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
          {hasPermission('students') && (
            <SectionCard
              icon="fa-comments"
              accent="teal"
              title="محادثات الطلاب"
              desc="استعرض وأجب على رسائل واستفسارات الطلاب"
              onClick={() => enterSection('chats')}
            />
          )}
          {user?.role === 'admin' && (
            <SectionCard
              icon="fa-user-shield"
              accent="violet"
              title="المساعدين والصلاحيات"
              desc="إضافة مساعدين وتعين صلاحيات RBAC لكل حساب فرعي"
              onClick={() => enterSection('assistants')}
            />
          )}
          {(user?.role === 'admin' || hasPermission('branches:view') || hasPermission('branches:edit')) && (
            <SectionCard
              icon="fa-map-marker-alt"
              accent="violet"
              title="إدارة الفروع"
              desc="إضافة وتعديل الفروع الدراسية التابعة للمنصة"
              onClick={() => enterSection('branches')}
            />
          )}
          {(user?.role === 'admin' || hasPermission('videos') || hasPermission('exams') || hasPermission('homework')) && (
            <SectionCard
              icon="fa-list-check"
              accent="indigo"
              title="قوائم التشغيل (Playlists)"
              desc="تنظيم المحاضرات والامتحانات والواجبات في وحدات ومجموعات متكاملة"
              onClick={() => enterSection('playlists')}
            />
          )}
          {(user?.role === 'admin' || hasPermission('payments')) && (
            <SectionCard
              icon="fa-box-open"
              accent="purple"
              title="الباقات والاشتراكات"
              desc="إنشاء باقات المحتوى المدفوعة وتجميع المحاضرات والامتحانات للبيع"
              onClick={() => enterSection('packages')}
            />
          )}
          {(user?.role === 'admin' || hasPermission('payments')) && (
            <SectionCard
              icon="fa-receipt"
              accent="gold"
              title="طلبات الشراء والتحويلات"
              desc="مراجعة وتفعيل إيصالات دفع الطلاب لشراء الباقات الأونلاين"
              onClick={() => enterSection('purchases')}
            />
          )}
          {(user?.role === 'admin' || hasPermission('students')) && (
            <SectionCard
              icon="fa-user-lock"
              accent="teal"
              title="صلاحيات محتوى الطلاب"
              desc="منح أو سحب صلاحيات مشاهدة الفيديوهات والامتحانات لطلاب معينين"
              onClick={() => enterSection('student_access')}
            />
          )}
          {(user?.role === 'admin' || hasPermission('videos') || hasPermission('exams') || hasPermission('homework')) && (
            <SectionCard
              icon="fa-calendar-alt"
              accent="blue"
              title="التقويم والفعاليات"
              desc="جدولة مواعيد المحاضرات والامتحانات والواجبات وتنبيهات الطلاب"
              onClick={() => enterSection('calendar')}
            />
          )}
          {(user?.role === 'admin' || user?.role === 'super_admin') && (
            <SectionCard
              icon="fa-shield-halved"
              accent="red"
              title="سجلات الحماية الأمنية"
              desc="عرض محاولات اختراق أدوات المطور (DevTools)"
              onClick={() => enterSection('violations')}
            />
          )}
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
      )
    }

    if (s === 'chats') {
      return (
        <ChatsPanel
          onBack={goHome}
          flash={flash}
          initialStudentId={searchParams.get('studentId')}
        />
      )
    }

    return (
      <Suspense fallback={<PanelLoader />}>
        {s === 'homeworks' && <HomeworkRevealPanel onBack={goHome} flash={flash} />}
        {s === 'resets' && <ResetRequestsPanel onBack={goHome} flash={flash} />}
        {s === 'violations' && <DevToolsViolationsPanel onBack={goHome} flash={flash} />}
        {s === 'accounts' && <AccountsPanel onBack={goHome} flash={flash} />}
        {s === 'groups' && <GroupsPanel onBack={goHome} flash={flash} />}

        {s === 'attendance' && <AttendancePanel onBack={goHome} flash={flash} />}
        {s === 'grades' && <GradesPanel onBack={goHome} flash={flash} />}
        {s === 'assistants' && <AssistantsPanel onBack={goHome} flash={flash} />}
        {s === 'whatsapp' && <WhatsAppQueuePanel onBack={goHome} flash={flash} />}
        {s === 'announcements' && <AnnouncementsPanel onBack={goHome} flash={flash} />}
        {s === 'finance' && <FinancePanel onBack={goHome} flash={flash} />}
        {s === 'super_admin' && <SuperAdminPanel onBack={goHome} flash={flash} />}
        {s === 'branches' && <BranchesPanel onBack={goHome} flash={flash} />}

        {s === 'playlists' && <PlaylistsPanel onBack={goHome} flash={flash} />}
        {s === 'packages' && <PackagesPanel onBack={goHome} flash={flash} />}
        {s === 'purchases' && <PurchasesPanel onBack={goHome} flash={flash} />}
        {s === 'student_access' && <StudentAccessPanel onBack={goHome} flash={flash} />}
        {s === 'calendar' && <CalendarPanel onBack={goHome} flash={flash} />}

        {(s === 'videos' || s === 'exams') && (
          <>
            <div className="cp-subtabs" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0 18px' }}>
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
              {s === 'exams' && (
                <button
                  className={`cp-btn ${subtab === 'reveal' ? 'cp-btn-info-active' : 'cp-btn-info'}`}
                  onClick={() => setSubtab('reveal')}
                >
                  <i className="fas fa-eye"></i> إظهار النتائج
                </button>
              )}
            </div>

            {subtab === 'attempts' && (
              <AttemptsPanel
                section={s}
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
                restrictTo={s === 'exams' ? 'exams' : 'videos'}
                onBack={goHome}
                flash={flash}
              />
            )}

            {s === 'exams' && subtab === 'reveal' && (
              <RevealPanel onBack={goHome} flash={flash} />
            )}
          </>
        )}
      </Suspense>
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

        {/* Internal Dashboard Tab System */}
        {openTabs.length > 0 && (
          <div className="cp-tab-bar">
            <div className="cp-tab-scroll">
              {openTabs.map((tab) => {
                const isActive = tab.id === activeTabId
                return (
                  <div
                    key={tab.id}
                    ref={isActive ? activeTabRef : null}
                    className={`cp-tab-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleSwitchTab(tab.id)}
                    title={tab.title}
                  >
                    <i className={`fas ${tab.icon} cp-tab-icon`}></i>
                    <span className="cp-tab-title">{tab.title}</span>
                    {tab.closable !== false && (
                      <button
                        type="button"
                        className="cp-tab-close"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                        }}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleCloseTab(tab.id, e)
                        }}
                        title="إغلاق التبويب"
                        aria-label={`إغلاق تبويب ${tab.title}`}
                      >
                        <i className="fas fa-xmark"></i>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
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
            {openTabs.map((tab) => {
              const isCurrentActive = tab.id === activeTabId
              return (
                <div
                  key={tab.id}
                  style={{ display: isCurrentActive ? 'block' : 'none' }}
                  className="cp-tab-pane"
                >
                  {renderPanelContent(tab.section)}
                </div>
              )
            })}
          </>
        )}
      </div>

      {toast && (
        <div className={`cp-toast cp-toast-${toast.kind}`}>
          <i className={`fas ${toast.kind === 'success'
              ? 'fa-circle-check'
              : toast.kind === 'warning'
                ? 'fa-triangle-exclamation'
                : toast.kind === 'error' || toast.kind === 'danger'
                  ? 'fa-circle-xmark'
                  : 'fa-circle-info'
            }`}></i>
          <span>{toast.msg}</span>
        </div>
      )}
    </main>
  )
}
