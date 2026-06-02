import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import Header from './components/Header'
import Footer from './components/Footer'

// Lazy-loaded pages for code splitting
const Home = lazy(() => import('./pages/Home'))
const Login = lazy(() => import('./pages/Login'))
const Homework = lazy(() => import('./pages/Homework'))
const Exams = lazy(() => import('./pages/Exams'))
const Videos = lazy(() => import('./pages/Videos'))
const Report = lazy(() => import('./pages/Report'))
const VideosReport = lazy(() => import('./pages/VideosReport'))
const ExamsReport = lazy(() => import('./pages/ExamsReport'))
const VideosGroupReport = lazy(() => import('./pages/VideosGroupReport'))
const ExamsGroupReport = lazy(() => import('./pages/ExamsGroupReport'))
const HomeworkReport = lazy(() => import('./pages/HomeworkReport'))
const HomeworkGroupReport = lazy(() => import('./pages/HomeworkGroupReport'))
const ControlPanel = lazy(() => import('./pages/ControlPanel/index'))
const ExamTaking = lazy(() => import('./pages/ExamTaking'))
const ExamAdd = lazy(() => import('./pages/ExamAdd'))
const VideoAdd = lazy(() => import('./pages/VideoAdd'))
const Profile = lazy(() => import('./pages/Profile'))
const Help = lazy(() => import('./pages/Help'))
const Terms = lazy(() => import('./pages/Terms'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Payments = lazy(() => import('./pages/Payments'))
const StudentChat = lazy(() => import('./pages/StudentChat'))

import { TenantProvider, useTenant } from './contexts/TenantContext'
import { tokenAPI } from '@backend/authApi'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import SeasonalDecor from './seasonal/SeasonalDecor'
import './seasonal/seasonal.css'
import './App.css'
import DevToolsBlocker from './components/DevToolsBlocker'
import { detectDevTools } from './utils/devtools'

// SECURITY CONFIGURATION: Set to true to enable the devtools blocker and copy/paste restrictions (blocked).
// Set to false to disable them (not blocked).
const ENABLE_DEVTOOLS_BLOCKER = true;

// Page loader component for Suspense fallback
function PageLoader() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--section-bg-1, #0f172a)',
      color: '#fff'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid rgba(255,255,255,0.2)',
          borderTop: '3px solid #a78bfa',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 16px'
        }}></div>
        <p>Loading...</p>
      </div>
    </div>
  )
}

function App() {
  return (
    <Router>
      <TenantProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </TenantProvider>
    </Router>
  )
}

function PendingApprovalPage() {
  const { logout, refreshProfile } = useAuth()
  const { tenant } = useTenant()
  const brandName = tenant?.name || 'مسار'
  const [isChecking, setIsChecking] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [messageType, setMessageType] = useState('') // 'success' or 'info' or 'error'

  const handleLogout = async () => {
    await logout()
    window.location.href = '/login'
  }

  const handleCheckStatus = async () => {
    if (isChecking) return
    setIsChecking(true)
    setStatusMessage('')
    setMessageType('')
    try {
      const updatedUser = await refreshProfile()
      if (updatedUser && updatedUser.is_approved) {
        setMessageType('success')
        setStatusMessage('تمت الموافقة على حسابك! جارٍ توجيهك للمنصة...')
        setTimeout(() => {
          window.location.reload()
        }, 1500)
      } else {
        setMessageType('info')
        setStatusMessage('حسابك لا يزال قيد المراجعة والموافقة من قبل الإدارة.')
      }
    } catch (err) {
      console.error(err)
      setMessageType('error')
      setStatusMessage('حدث خطأ أثناء تحديث الحالة. يرجى المحاولة لاحقاً.')
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <div className="pending-app-container" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at bottom, #1b2735 0%, #090a0f 100%)',
      color: '#fff',
      padding: '24px',
      fontFamily: 'Cairo, sans-serif'
    }}>
      <div className="pending-app-card" style={{
        maxWidth: '520px',
        width: '100%',
        background: 'rgba(30, 41, 59, 0.45)',
        backdropFilter: 'blur(20px)',
        webkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '24px',
        padding: '40px 32px',
        textAlign: 'center',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
      }}>
        {/* Animated Clock / Pending Icon */}
        <div style={{
          width: '80px',
          height: '80px',
          background: 'rgba(245, 158, 11, 0.1)',
          color: '#f59e0b',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2.5rem',
          margin: '0 auto 24px',
          animation: 'pulse 2s infinite'
        }}>
          <i className="fas fa-clock-rotate-left"></i>
        </div>

        <h2 style={{
          fontSize: '1.8rem',
          fontWeight: 700,
          marginBottom: '16px',
          color: '#fff'
        }}>حسابك قيد المراجعة حاليًا</h2>

        <p style={{
          fontSize: '1.05rem',
          lineHeight: '1.8',
          color: '#cbd5e1',
          marginBottom: '32px'
        }}>
          أهلاً بك في منصة <strong>{brandName}</strong>. لقد تم إنشاء حسابك بنجاح، وهو الآن قيد المراجعة والموافقة من قبل الإدارة. سيتم تفعيل حسابك للدخول إلى المحاضرات والامتحانات خلال 24 إلى 48 ساعة كحد أقصى.
        </p>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <button
            onClick={handleCheckStatus}
            disabled={isChecking}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
              color: '#fff',
              fontSize: '1.05rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(124, 58, 237, 0.4)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.3)'
            }}
          >
            {isChecking ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              <i className="fas fa-arrows-rotate"></i>
            )}
            تحديث حالة الحساب
          </button>

          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              fontSize: '1.05rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'
            }}
          >
            <i className="fas fa-right-from-bracket"></i>
            تسجيل الخروج
          </button>
        </div>

        {statusMessage && (
          <div style={{
            marginTop: '16px',
            padding: '12px',
            borderRadius: '12px',
            background: messageType === 'success' ? 'rgba(16, 185, 129, 0.15)' : messageType === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.15)',
            border: `1px solid ${messageType === 'success' ? '#10b981' : messageType === 'error' ? '#ef4444' : '#6366f1'}`,
            color: messageType === 'success' ? '#34d399' : messageType === 'error' ? '#f87171' : '#818cf8',
            fontSize: '0.95rem',
            textAlign: 'center',
            fontWeight: '600'
          }}>
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  )
}

/* Hoisted out of AppContent so the component reference is stable across
   re-renders. */
function ProtectedRoute({ isLoggedIn, children }) {
  const { user } = useAuth()

  if (!isLoggedIn) return <Navigate to="/login" replace />

  // Guard for newly registered students: show Pending Approval page if not approved
  if (user && user.role === 'student' && user.is_approved === false) {
    return <PendingApprovalPage />
  }

  return children
}
function AdminRoute({ isLoggedIn, role, children }) {
  if (!isLoggedIn) return <Navigate to="/login" replace />
  if (role !== 'admin') return <Navigate to="/" replace />
  return children
}

function AppContent() {
  const location = useLocation()
  const isLoginPage = location.pathname === '/login'
  const isExamTaking = location.pathname === '/exam-taking'
  const { user, isLoggedIn, loading } = useAuth()
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(() => {
    return sessionStorage.getItem('masar-devtools-blocked') === 'true'
  })

  // Continuously tracked scrollY — read by the route-change tween
  // below. We need this because by the time the route-change effect
  // fires, react-router has already rendered the new page, and if the
  // new page is shorter than the previous scrollY the browser has
  // already clamped window.scrollY to 0. The ref captures the value
  // from the last real scroll event on the OLD page, so the tween has
  // the correct starting position to animate from.
  const lastScrollYRef = useRef(0)
  useEffect(() => {
    const onScroll = () => {
      lastScrollYRef.current = window.scrollY || window.pageYOffset || 0
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Scroll to top instantly on route change.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  // Apply the saved theme app-wide so it survives routes that don't
  //render the Header (e.g. /exam-taking, where the toggle is hidden).
  useEffect(() => {
    const isDark = localStorage.getItem('theme') === 'dark'
    document.body.classList.toggle('dark', isDark)
  }, [location])


  /* Anti-cheating + anti-tampering: students can't select/copy text,
     right-click, view source, or open DevTools via shortcuts. Admins
     keep normal browser behavior so they can manage content. */
  useEffect(() => {
    if (!ENABLE_DEVTOOLS_BLOCKER) {
      document.body.classList.remove('no-select')
      return // blocker is disabled
    }
    const isAdmin = user?.role === 'admin'
    document.body.classList.toggle('no-select', !isAdmin)
    if (isAdmin) return  // admins: no event blockers

    // Form fields stay normal so students can type answers, edit their
    // profile, and paste into "writing sections" as requested.
    const isEditable = (el) => {
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
    }
    const block = (e) => {
      if (isEditable(e.target)) return
      e.preventDefault()
      return false
    }
    // Devtools / view-source / save / print shortcuts. Note: this is a
    // deterrent, not real security — anyone who really wants to inspect
    // can disable JS or use the browser menu. The real protections are
    // RLS on the server.
    const blockKeys = (e) => {
      const k = (e.key || '').toLowerCase()
      // F12
      if (e.key === 'F12') return e.preventDefault()
      // Ctrl/Cmd + Shift + I/J/C  (devtools, console, inspect)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) {
        return e.preventDefault()
      }
      // Ctrl/Cmd + U (view source), Ctrl/Cmd + S (save), Ctrl/Cmd + P (print)
      if ((e.ctrlKey || e.metaKey) && (k === 'u' || k === 's' || k === 'p')) {
        return e.preventDefault()
      }
    }

    document.addEventListener('contextmenu', block)
    document.addEventListener('copy', block)
    document.addEventListener('cut', block)
    document.addEventListener('selectstart', block)
    document.addEventListener('dragstart', block)
    document.addEventListener('keydown', blockKeys, true)
    return () => {
      document.removeEventListener('contextmenu', block)
      document.removeEventListener('copy', block)
      document.removeEventListener('cut', block)
      document.removeEventListener('selectstart', block)
      document.removeEventListener('dragstart', block)
      document.removeEventListener('keydown', blockKeys, true)
    }
  }, [user])

  // DevTools detection loop for non-admins
  useEffect(() => {
    if (!ENABLE_DEVTOOLS_BLOCKER) {
      sessionStorage.removeItem('masar-devtools-blocked')
      setIsDevToolsOpen(false)
      return
    }
    // If the logged-in user is an admin, we bypass all detection!
    if (user?.role === 'admin') {
      sessionStorage.removeItem('masar-devtools-blocked')
      setIsDevToolsOpen(false)
      return
    }

    const cleanup = detectDevTools((isOpen) => {
      if (isOpen) {
        sessionStorage.setItem('masar-devtools-blocked', 'true')
        setIsDevToolsOpen(true)
      } else {
        sessionStorage.removeItem('masar-devtools-blocked')
        setIsDevToolsOpen(false)
      }
    })

    return () => {
      cleanup()
    }
  }, [user])

  if (loading) {
    return <PageLoader />
  }

  if (isDevToolsOpen && ENABLE_DEVTOOLS_BLOCKER) {
    return <DevToolsBlocker />
  }

  // Use the hoisted ProtectedRoute / AdminRoute below directly — passing
  // auth as props keeps the component reference stable so ExamTaking
  // and friends aren't unmounted whenever AppContent re-renders.
  const role = user?.role

  const isUnapprovedStudent = user && user.role === 'student' && user.is_approved === false
  const showHeaderFooter = !isLoginPage && !isExamTaking && !isUnapprovedStudent

  return (
    <div className={`app ${isLoginPage ? 'login-page' : ''}`}>
      {/* Seasonal ambient overlay (Ramadan lanterns / Eid kahk / Adha
          arabesque / winter snow). Suppressed on the exam-taking
          screen so animations never distract during a timed exam —
          the seasonal accent classes on <body> still apply, so the
          subtle top tint and selection color remain. */}
      <SeasonalDecor suppress={isExamTaking} />
      {showHeaderFooter && <Header />}

      <div className="page-container">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Home /></ProtectedRoute>} />
            <Route path="/login" element={isLoggedIn ? <Navigate to="/" replace /> : <Login />} />
            <Route path="/home" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Home /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Profile /></ProtectedRoute>} />
            {/* Old /lectures URLs redirect to the new /homework page so
                shared links / browser bookmarks keep working. */}
            <Route path="/homework" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Homework /></ProtectedRoute>} />
            <Route path="/lectures" element={<Navigate to="/homework" replace />} />
            <Route path="/exams" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Exams /></ProtectedRoute>} />
            <Route path="/exam-taking" element={<ProtectedRoute isLoggedIn={isLoggedIn}><ExamTaking /></ProtectedRoute>} />
            <Route path="/videos" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Videos /></ProtectedRoute>} />
            <Route path="/payments" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Payments /></ProtectedRoute>} />
            <Route path="/chat" element={<ProtectedRoute isLoggedIn={isLoggedIn}><StudentChat /></ProtectedRoute>} />

            {/* Student + Admin: solo reports */}
            <Route path="/videos-report" element={<ProtectedRoute isLoggedIn={isLoggedIn}><VideosReport /></ProtectedRoute>} />
            <Route path="/exams-report" element={<ProtectedRoute isLoggedIn={isLoggedIn}><ExamsReport /></ProtectedRoute>} />
            <Route path="/homework-report" element={<ProtectedRoute isLoggedIn={isLoggedIn}><HomeworkReport /></ProtectedRoute>} />

            {/* Admin only */}
            <Route path="/video-add" element={<AdminRoute isLoggedIn={isLoggedIn} role={role}><VideoAdd /></AdminRoute>} />
            <Route path="/exam-add" element={<AdminRoute isLoggedIn={isLoggedIn} role={role}><ExamAdd /></AdminRoute>} />
            <Route path="/report" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Report /></ProtectedRoute>} />
            <Route path="/videos-group-report" element={<AdminRoute isLoggedIn={isLoggedIn} role={role}><VideosGroupReport /></AdminRoute>} />
            <Route path="/exams-group-report" element={<AdminRoute isLoggedIn={isLoggedIn} role={role}><ExamsGroupReport /></AdminRoute>} />
            <Route path="/homework-group-report" element={<AdminRoute isLoggedIn={isLoggedIn} role={role}><HomeworkGroupReport /></AdminRoute>} />
            <Route path="/control-panel" element={<AdminRoute isLoggedIn={isLoggedIn} role={role}><ControlPanel /></AdminRoute>} />

            {/* Public-ish info pages — still gated by auth so non-students can't browse */}
            <Route path="/help" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Help /></ProtectedRoute>} />
            <Route path="/terms" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Terms /></ProtectedRoute>} />
            <Route path="/privacy" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Privacy /></ProtectedRoute>} />
          </Routes>
        </Suspense>
      </div>

      {showHeaderFooter && <Footer />}
    </div>
  )
}

export default App
