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
import { LanguageProvider } from './i18n'
import './App.css'

function App() {
  return (
    <LanguageProvider>
      <Router>
        <AppContent />
      </Router>
    </LanguageProvider>
  )
}

function AppContent() {
  const location = useLocation()
  const isLoginPage = location.pathname === '/login'
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = tokenAPI.getToken()
    const stored = localStorage.getItem('masar-user')
    if (token && stored) {
      setIsLoggedIn(true)
      setUser(JSON.parse(stored))
    } else {
      setIsLoggedIn(false)
      setUser(null)
    }
    setIsLoading(false)
  }, [location])

  /* Anti-cheating: prevent students from selecting/copying anything in
     the app. Admins keep normal browser behavior so they can manage
     content (copy IDs, edit text, etc.). The CSS class toggles
     user-select and we additionally block the contextmenu + copy
     events at the document level. */
  useEffect(() => {
    const isAdmin = user?.role === 'admin'
    document.body.classList.toggle('no-select', !isAdmin)
    if (isAdmin) return  // admins: no event blockers
    // Allow selection inside form fields so students can type answers
    // and edit their profile normally.
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
    document.addEventListener('contextmenu', block)
    document.addEventListener('copy', block)
    document.addEventListener('cut', block)
    document.addEventListener('selectstart', block)
    document.addEventListener('dragstart', block)
    return () => {
      document.removeEventListener('contextmenu', block)
      document.removeEventListener('copy', block)
      document.removeEventListener('cut', block)
      document.removeEventListener('selectstart', block)
      document.removeEventListener('dragstart', block)
    }
  }, [user])

  if (isLoading) {
    return <div className="app"><div className="page-container">Loading...</div></div>
  }

  // Requires login
  const ProtectedRoute = ({ children }) => {
    return isLoggedIn ? children : <Navigate to="/login" replace />
  }

  // Requires admin role
  const AdminRoute = ({ children }) => {
    if (!isLoggedIn) return <Navigate to="/login" replace />
    if (user?.role !== 'admin') return <Navigate to="/" replace />
    return children
  }

  return (
    <div className={`app ${isLoginPage ? 'login-page' : ''}`}>
      {!isLoginPage && <Header />}

      <div className="page-container">
        <Routes>
          <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/login" element={isLoggedIn ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/lectures" element={<ProtectedRoute><Lectures /></ProtectedRoute>} />
          <Route path="/exams" element={<ProtectedRoute><Exams /></ProtectedRoute>} />
          <Route path="/exam-taking" element={<ProtectedRoute><ExamTaking /></ProtectedRoute>} />
          <Route path="/videos" element={<ProtectedRoute><Videos /></ProtectedRoute>} />

          {/* Student + Admin: solo reports */}
          <Route path="/videos-report" element={<ProtectedRoute><VideosReport /></ProtectedRoute>} />
          <Route path="/exams-report" element={<ProtectedRoute><ExamsReport /></ProtectedRoute>} />

          {/* Admin only */}
          <Route path="/video-add" element={<AdminRoute><VideoAdd /></AdminRoute>} />
          <Route path="/exam-add" element={<AdminRoute><ExamAdd /></AdminRoute>} />
          <Route path="/report" element={<ProtectedRoute><Report /></ProtectedRoute>} />
          <Route path="/videos-group-report" element={<AdminRoute><VideosGroupReport /></AdminRoute>} />
          <Route path="/exams-group-report" element={<AdminRoute><ExamsGroupReport /></AdminRoute>} />
          <Route path="/control-panel" element={<AdminRoute><ControlPanel /></AdminRoute>} />

          {/* Public-ish info pages — still gated by auth so non-students can't browse */}
          <Route path="/help" element={<ProtectedRoute><Help /></ProtectedRoute>} />
          <Route path="/terms" element={<ProtectedRoute><Terms /></ProtectedRoute>} />
          <Route path="/privacy" element={<ProtectedRoute><Privacy /></ProtectedRoute>} />
        </Routes>
      </div>

      {!isLoginPage && <Footer />}
    </div>
  )
}

export default App
