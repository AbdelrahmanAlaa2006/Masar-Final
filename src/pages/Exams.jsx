import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import './Exams.css'
import PrepIllustration from '../components/PrepIllustration'
import { listExams, deleteExam, dbToUiGrade, countSubmittedAttempts } from '../services/examsApi'

const PREP_META = {
  first:  { ar: 'الصف الأول الإعدادي',  en: 'First Prep',  accent: 'green',  desc: 'بداية المرحلة الإعدادية والتأسيس' },
  second: { ar: 'الصف الثاني الإعدادي', en: 'Second Prep', accent: 'blue',   desc: 'تعميق المفاهيم وبناء المهارات' },
  third:  { ar: 'الصف الثالث الإعدادي', en: 'Third Prep',  accent: 'orange', desc: 'الاستعداد لاختبارات الشهادة' },
}

export default function Exams() {
  const navigate = useNavigate()
  const [currentLevel, setCurrentLevel] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [userRole, setUserRole] = useState(null)
  const [userId, setUserId] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [attemptsMap, setAttemptsMap] = useState({}) // examId -> submitted count

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('masar-user'))
      setUserRole(u?.role || null)
      setUserId(u?.id || null)
      // students auto-land on their own grade
      if (u?.role !== 'admin' && u?.grade) {
        setCurrentLevel(dbToUiGrade(u.grade))
      }
    } catch {
      setUserRole(null)
    }
  }, [])

  const refresh = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await listExams()
      setRows(data)
    } catch (err) {
      setLoadError(err.message || 'تعذر تحميل الامتحانات')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  // Fetch submitted-attempt counts for the currently displayed exams
  useEffect(() => {
    if (!userId || rows.length === 0) return
    let cancelled = false
    const run = async () => {
      const entries = await Promise.all(
        rows.map(async (e) => {
          try {
            const n = await countSubmittedAttempts(e.id, userId)
            return [e.id, n]
          } catch {
            return [e.id, 0]
          }
        })
      )
      if (!cancelled) setAttemptsMap(Object.fromEntries(entries))
    }
    run()
    return () => { cancelled = true }
  }, [rows, userId])

  const examsByLevel = useMemo(() => {
    const out = { first: [], second: [], third: [] }
    for (const r of rows) {
      const ui = dbToUiGrade(r.grade)
      if (ui && out[ui]) out[ui].push(r)
    }
    return out
  }, [rows])

  const remainingFor = (exam) =>
    Math.max(0, (exam.max_attempts || 1) - (attemptsMap[exam.id] || 0))

  const startExam = (exam) => {
    if (userRole !== 'admin' && remainingFor(exam) <= 0) {
      setShowModal(true)
      return
    }
    navigate(`/exam-taking?id=${exam.id}`)
  }

  const addExam = (level) => {
    localStorage.setItem('selectedGrade', level)
    navigate('/exam-add')
  }

  const handleDelete = async (exam) => {
    if (!window.confirm(`حذف «${exam.title}»؟`)) return
    try {
      await deleteExam(exam.id)
      setRows(prev => prev.filter(e => e.id !== exam.id))
    } catch (err) {
      alert(err.message || 'تعذر الحذف')
    }
  }

  const levelTitles = {
    first: 'امتحانات الصف الأول الإعدادي',
    second: 'امتحانات الصف الثاني الإعدادي',
    third: 'امتحانات الصف الثالث الإعدادي',
  }

  const levelEmojis = { first: '1️⃣', second: '2️⃣', third: '3️⃣' }

  const renderLevelCard = (level) => {
    const m = PREP_META[level]
    return (
      <button key={level} className={`prep-card prep-${m.accent}`} onClick={() => setCurrentLevel(level)}>
        <div className="prep-cover">
          <div className="prep-cover-deco" />
          <PrepIllustration kind={level} stage={m.en} />
        </div>
        <div className="prep-body">
          <h3>{m.ar}</h3>
          <p>{m.desc}</p>
          <div className="prep-foot">
            <span className="prep-count"><i className="fas fa-file-alt"></i> {examsByLevel[level].length} امتحان</span>
            <span className="prep-cta">عرض <i className="fas fa-arrow-left"></i></span>
          </div>
        </div>
      </button>
    )
  }

  const renderExamItem = (exam, index) => {
    const remaining = remainingFor(exam)
    const createdAt = new Date(exam.created_at)
    const availableUntil = new Date(createdAt.getTime() + (exam.available_hours * 60 * 60 * 1000))
    const isAvailable = new Date() < availableUntil
    const formattedDate = availableUntil.toLocaleDateString('ar-EG', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
    const qCount = Array.isArray(exam.questions) ? exam.questions.length : 0

    return (
      <div key={exam.id} className="ec-card" style={{ animationDelay: `${(index + 1) * 0.1}s` }} onClick={() => startExam(exam)}>
        <div className={`ec-status-bar ${isAvailable ? 'ec-available' : 'ec-unavailable'}`}>
          <span className="ec-status-dot" />
          <span>{isAvailable ? 'متاح' : 'غير متاح'}</span>
          {userRole === 'admin' && (
            <button className="ec-delete-btn" onClick={e => { e.stopPropagation(); handleDelete(exam) }}>
              🗑 حذف
            </button>
          )}
        </div>

        <div className="ec-header">
          <div className="ec-badge">{index + 1}</div>
          <div className="ec-titles">
            <div className="ec-title">{exam.title}</div>
            <div className="ec-lecture">📝 {exam.number ? `رقم ${exam.number}` : ''}</div>
          </div>
        </div>

        <div className="ec-stats">
          <div className="ec-stat">
            <span className="ec-stat-icon">⏱️</span>
            <span className="ec-stat-label">مدة الامتحان</span>
            <span className="ec-stat-value">{exam.duration_minutes} دقيقة</span>
          </div>
          <div className="ec-stat">
            <span className="ec-stat-icon">🕒</span>
            <span className="ec-stat-label">المدة المتاحة</span>
            <span className="ec-stat-value">{exam.available_hours} ساعة</span>
          </div>
          <div className="ec-stat">
            <span className="ec-stat-icon">❓</span>
            <span className="ec-stat-label">عدد الأسئلة</span>
            <span className="ec-stat-value">{qCount} سؤال</span>
          </div>
          <div className="ec-stat">
            <span className="ec-stat-icon">🏆</span>
            <span className="ec-stat-label">درجة الامتحان</span>
            <span className="ec-stat-value">{exam.total_points} درجة</span>
          </div>
          <div className="ec-stat">
            <span className="ec-stat-icon">🔁</span>
            <span className="ec-stat-label">المحاولات المتبقية</span>
            <span className="ec-stat-value">{remaining}/{exam.max_attempts}</span>
          </div>
        </div>

        <div className="ec-footer">
          <span>⏳</span>
          <span>متاح حتى {formattedDate}</span>
        </div>
      </div>
    )
  }

  const renderExamSection = (level) => (
    <div key={level} className={`exam-section ${currentLevel === level ? 'active' : ''}`}>
      {userRole === 'admin' && (
        <button className="back-button" onClick={() => setCurrentLevel(null)}>
          ← العودة للمستويات
        </button>
      )}
      <div className="section-header">
        <div className="section-title">
          <span>{levelEmojis[level]}</span>
          {levelTitles[level]}
        </div>
        {userRole === 'admin' && (
          <button className="add-exam" onClick={() => addExam(level)}>
            ➕ إضافة امتحان جديد
          </button>
        )}
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <i className="fas fa-spinner fa-spin"></i> جاري التحميل...
        </div>
      ) : loadError ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#e53e3e' }}>
          {loadError}
        </div>
      ) : examsByLevel[level].length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#a0aec0' }}>
          لا توجد امتحانات في هذه المرحلة بعد
        </div>
      ) : (
        <div className="exam-list">
          {examsByLevel[level].map((exam, idx) => renderExamItem(exam, idx))}
        </div>
      )}
    </div>
  )

  return (
    <div className="exams-container">
      {/* Grade picker (admins only — students auto-land) */}
      {!currentLevel && userRole === 'admin' && (
        <div className="exm-prep-wrap">
          <div className="exm-prep-head">
            <div className="exm-prep-icon"><i className="fas fa-file-alt"></i></div>
            <div>
              <h1>الامتحانات</h1>
              <p>اختر المرحلة الدراسية لاستعراض الامتحانات المتاحة</p>
            </div>
          </div>
          <div className="prep-grid">
            {renderLevelCard('first')}
            {renderLevelCard('second')}
            {renderLevelCard('third')}
          </div>
        </div>
      )}

      {currentLevel && userRole === 'admin' && (
        <div className="breadcrumb" id="breadcrumb">
          <span className="breadcrumb-item active" onClick={() => setCurrentLevel(null)}>الامتحانات</span>
          <span>›</span>
          <span className="breadcrumb-item active">{levelTitles[currentLevel]}</span>
        </div>
      )}

      {currentLevel && renderExamSection(currentLevel)}

      {showModal && (
        <div className="modal active">
          <div className="modal-content">
            <h3 className="modal-title">انتهت المحاولات</h3>
            <p className="modal-message">لقد استنفذت جميع المحاولات المسموح بها لهذا الامتحان.</p>
            <button className="modal-button" onClick={() => setShowModal(false)}>حسناً</button>
          </div>
        </div>
      )}
    </div>
  )
}
