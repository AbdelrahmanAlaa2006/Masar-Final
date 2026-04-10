import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Header from './components/Header'
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
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check if user is logged in
    const loggedIn = tokenAPI.isLoggedIn()
    setIsLoggedIn(loggedIn)
    setIsLoading(false)
  }, [location])

  if (isLoading) {
    return <div className="app"><div className="page-container">Loading...</div></div>
  }

  return (
    <div className="app">
      {!isLoginPage && <Header />}

      <div className="page-container">
        <Routes>
          <Route path="/" element={isLoggedIn ? <Home /> : <Navigate to="/login" replace />} />
          <Route path="/login" element={isLoggedIn ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/home" element={isLoggedIn ? <Home /> : <Navigate to="/login" replace />} />
          <Route path="/lectures" element={isLoggedIn ? <Lectures /> : <Navigate to="/login" replace />} />
          <Route path="/exams" element={isLoggedIn ? <Exams /> : <Navigate to="/login" replace />} />
          <Route path="/exam-add" element={isLoggedIn ? <ExamAdd /> : <Navigate to="/login" replace />} />
          <Route path="/videos" element={isLoggedIn ? <Videos /> : <Navigate to="/login" replace />} />
          <Route path="/video-add" element={isLoggedIn ? <VideoAdd /> : <Navigate to="/login" replace />} />
          <Route path="/report" element={isLoggedIn ? <Report /> : <Navigate to="/login" replace />} />
          <Route path="/videos-report" element={isLoggedIn ? <VideosReport /> : <Navigate to="/login" replace />} />
          <Route path="/exams-report" element={isLoggedIn ? <ExamsReport /> : <Navigate to="/login" replace />} />
          <Route path="/videos-group-report" element={isLoggedIn ? <VideosGroupReport /> : <Navigate to="/login" replace />} />
          <Route path="/exams-group-report" element={isLoggedIn ? <ExamsGroupReport /> : <Navigate to="/login" replace />} />
          <Route path="/control-panel" element={isLoggedIn ? <ControlPanel /> : <Navigate to="/login" replace />} />
          <Route path="/exam-taking" element={isLoggedIn ? <ExamTaking /> : <Navigate to="/login" replace />} />
        </Routes>
      </div>
    </div>
  )
}

export default App
