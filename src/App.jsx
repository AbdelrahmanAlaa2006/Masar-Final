import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Header from './components/Header'
import Footer from './components/Footer'
import Home from './pages/Home'
import Login from './pages/Login'
import Lectures from './pages/Lectures'
import Exams from './pages/Exams'
import Videos from './pages/Videos'
import Report from './pages/Report'
import VideosReport from './pages/VideosReport'
import ExamsReport from './pages/ExamsReport'
import VideosGroupReport from './pages/VideosGroupReport'
import ExamsGroupReport from './pages/ExamsGroupReport'
import ControlPanel from './pages/ControlPanel'
import ExamTaking from './pages/ExamTaking'
import ExamAdd from './pages/ExamAdd'
import VideoAdd from './pages/VideoAdd'
import Profile from './pages/Profile'
import Help from './pages/Help'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import { tokenAPI } from '@backend/authApi'
import './App.css'

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  )
}

/* Hoisted out of AppContent so the component reference is stable across
   re-renders. Defining them inside the parent meant every state change
   in AppContent (e.g. examLocked toggling) gave React a brand-new
   component type, which forced every routed child (ExamTaking,
   Lectures, ...) to unmount and remount — that looked like the page
   was "refreshing" mid-exam. */
function ProtectedRoute({ isLoggedIn, children }) {
  return isLoggedIn ? children : <Navigate to="/login" replace />
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
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // Scroll to top whenever the route changes. Without this, react-router
  // preserves the previous page's scroll position, which felt jarring
  // when jumping from a long page (lectures / videos) to a short one.
  // We also clear the hash so back/forward stays predictable.
  useEffect(() => {
    // `instant` keeps the jump unobtrusive; smooth scrolling here looks
    // janky because the new page is still painting in.
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
  }, [location.pathname])

  // Apply the saved theme app-wide so it survives routes that don't
   //render the Header (e.g. /exam-taking, where the toggle is hidden).
  useEffect(() => {
    const isDark = localStorage.getItem('theme') === 'dark'
    document.body.classList.toggle('dark', isDark)
  }, [location])

  useEffect(() => {
    const token = tokenAPI.getToken()
    const stored = sessionStorage.getItem('masar-user')
    if (token && stored) {
      setIsLoggedIn(true)
      setUser(JSON.parse(stored))
    } else {
      setIsLoggedIn(false)
      setUser(null)
    }
    setIsLoading(false)
  }, [location])

  /* Anti-cheating + anti-tampering: students can't select/copy text,
     right-click, view source, or open DevTools via shortcuts. Admins
     keep normal browser behavior so they can manage content. */
  useEffect(() => {
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

  if (isLoading) {
    return <div className="app"><div className="page-container">Loading...</div></div>
  }

  // Use the hoisted ProtectedRoute / AdminRoute below directly — passing
  // auth as props keeps the component reference stable so ExamTaking
  // and friends aren't unmounted whenever AppContent re-renders.
  const role = user?.role

  return (
    <div className={`app ${isLoginPage ? 'login-page' : ''}`}>
      {!isLoginPage && !isExamTaking && <Header />}

      <div className="page-container">
        <Routes>
          <Route path="/" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Home /></ProtectedRoute>} />
          <Route path="/login" element={isLoggedIn ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/home" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Home /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Profile /></ProtectedRoute>} />
          <Route path="/lectures" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Lectures /></ProtectedRoute>} />
          <Route path="/exams" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Exams /></ProtectedRoute>} />
          <Route path="/exam-taking" element={<ProtectedRoute isLoggedIn={isLoggedIn}><ExamTaking /></ProtectedRoute>} />
          <Route path="/videos" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Videos /></ProtectedRoute>} />

          {/* Student + Admin: solo reports */}
          <Route path="/videos-report" element={<ProtectedRoute isLoggedIn={isLoggedIn}><VideosReport /></ProtectedRoute>} />
          <Route path="/exams-report" element={<ProtectedRoute isLoggedIn={isLoggedIn}><ExamsReport /></ProtectedRoute>} />

          {/* Admin only */}
          <Route path="/video-add" element={<AdminRoute isLoggedIn={isLoggedIn} role={role}><VideoAdd /></AdminRoute>} />
          <Route path="/exam-add" element={<AdminRoute isLoggedIn={isLoggedIn} role={role}><ExamAdd /></AdminRoute>} />
          <Route path="/report" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Report /></ProtectedRoute>} />
          <Route path="/videos-group-report" element={<AdminRoute isLoggedIn={isLoggedIn} role={role}><VideosGroupReport /></AdminRoute>} />
          <Route path="/exams-group-report" element={<AdminRoute isLoggedIn={isLoggedIn} role={role}><ExamsGroupReport /></AdminRoute>} />
          <Route path="/control-panel" element={<AdminRoute isLoggedIn={isLoggedIn} role={role}><ControlPanel /></AdminRoute>} />

          {/* Public-ish info pages — still gated by auth so non-students can't browse */}
          <Route path="/help" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Help /></ProtectedRoute>} />
          <Route path="/terms" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Terms /></ProtectedRoute>} />
          <Route path="/privacy" element={<ProtectedRoute isLoggedIn={isLoggedIn}><Privacy /></ProtectedRoute>} />
        </Routes>
      </div>

      {!isLoginPage && !isExamTaking && <Footer />}
    </div>
  )
}

export default App
