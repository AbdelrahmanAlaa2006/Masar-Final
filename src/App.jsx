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
import { tokenAPI } from './services/api'
import './App.css'

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
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
        </Routes>
      </div>

      {!isLoginPage && <Footer />}
    </div>
  )
}

export default App
