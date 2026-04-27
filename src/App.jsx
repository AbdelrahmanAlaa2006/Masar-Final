import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
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

  // Smooth scroll-to-top on route change.
  //
  // Native window.scrollTo({ behavior: 'smooth' }) is unreliable here:
  // when the new route's initial render is shorter than the previous
  // scroll position (e.g. /exams or / before their async data loads),
  // the browser clamps scrollY to the new max BEFORE this effect runs,
  // so the smooth animation has zero distance to cover and the jump
  // feels instant. Pages with a tall hero (lectures, videos) accidentally
  // worked because their initial render was tall enough to keep the
  // old scrollY valid.
  //
  // Workaround: read the pre-clamp scrollY from the ref above, pad the
  // body to make that position reachable again, restore scroll to it,
  // then tween it down to 0 with rAF. The body padding is removed at
  // the end so it doesn't leave permanent empty space.
  useEffect(() => {
    const startY = Math.max(
      window.scrollY || window.pageYOffset || 0,
      lastScrollYRef.current || 0,
    )
    if (startY <= 4) return // already at the top — nothing to animate

    // Reserve enough document height that scrollTo(startY) sticks even
    // if the freshly-mounted page is short. Saved so we can restore.
    const prevMinHeight = document.body.style.minHeight
    document.body.style.minHeight = `${startY + window.innerHeight}px`
    window.scrollTo(0, startY)

    const duration = Math.min(650, 220 + startY * 0.35) // 220–650 ms
    const startTime = performance.now()
    let cancelled = false
    // Cancel the tween if the user scrolls / wheels / touches —
    // hijacking scroll past real input feels worse than a snap.
    const cancel = () => { cancelled = true }
    window.addEventListener('wheel', cancel, { passive: true, once: true })
    window.addEventListener('touchstart', cancel, { passive: true, once: true })
    window.addEventListener('keydown', cancel, { once: true })

    const ease = (t) => 1 - Math.pow(1 - t, 3) // easeOutCubic
    const cleanup = () => {
      document.body.style.minHeight = prevMinHeight
      window.removeEventListener('wheel', cancel)
      window.removeEventListener('touchstart', cancel)
      window.removeEventListener('keydown', cancel)
    }
    const step = (now) => {
      if (cancelled) { cleanup(); return }
      const t = Math.min(1, (now - startTime) / duration)
      window.scrollTo(0, startY * (1 - ease(t)))
      if (t < 1) requestAnimationFrame(step)
      else cleanup()
    }
    requestAnimationFrame(step)
    return () => { cancelled = true; cleanup() }
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
