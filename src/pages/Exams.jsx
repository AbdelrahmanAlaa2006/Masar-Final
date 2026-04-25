import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
import './Exams.css'
import PrepIllustration from '../components/PrepIllustration'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog'
import { listExams, deleteExam, dbToUiGrade, countSubmittedAttempts } from '@backend/examsApi'
import { listEffectiveOverrides, reduceEffective } from '@backend/overridesApi'

export default function Exams() {
  const navigate = useNavigate()
  const { t, lang } = useI18n()
  // Record this visit for the home "Continue" widget.
  useEffect(() => { import('../utils/trackVisit').then(m => m.trackVisit('exams')) }, [])

  const PREP_META = {
    first:  { ar: t('grades.first'), en: 'First Prep',  accent: 'green',  desc: lang === 'ar' ? 'بداية المرحلة الإعدادية والتأسيس' : 'Start of prep stage and foundation' },
    second: { ar: t('grades.second'), en: 'Second Prep', accent: 'blue',   desc: lang === 'ar' ? 'تعميق المفاهيم وبناء المهارات' : 'Deepening concepts and skill building' },
    third:  { ar: t('grades.third'), en: 'Third Prep',  accent: 'orange', desc: lang === 'ar' ? 'الاستعداد لاختبارات الشهادة' : 'Preparing for certificate exams' },
  }
  const [currentLevel, setCurrentLevel] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [userRole, setUserRole] = useState(null)
  const [userId, setUserId] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [attemptsMap, setAttemptsMap] = useState({}) // examId -> submitted count
  const [overridesMap, setOverridesMap] = useState(new Map()) // examId -> {allowed, attempts}

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
      setLoadError(err.message || t('exams.loading'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  // Pull effective overrides (admin scope 'prep' + student scope 'student')
  // for this student once we know their id+grade.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    ;(async () => {
      try {
        const u = JSON.parse(localStorage.getItem('masar-user')) || {}
        const grade = u.grade
        if (!grade) return
        const rows = await listEffectiveOverrides({
          studentId: userId, grade, itemType: 'exam',
        })
        if (!cancelled) setOverridesMap(reduceEffective(rows))
      } catch { /* ignore — defaults apply */ }
    })()
    return () => { cancelled = true }
  }, [userId])

  // Fetch submitted-attempt counts for the currently displayed exams.
  // If an admin override exists for this exam, we only count attempts
  // submitted *since* the override was last saved — so bumping/re-saving
  // the bonus acts as a fresh "N tries from now" grant.
  useEffect(() => {
    if (!userId || rows.length === 0) return
    let cancelled = false
    const run = async () => {
      const entries = await Promise.all(
        rows.map(async (e) => {
          try {
            const o = overridesMap.get(e.id)
            const since = o?.updatedAt || null
            const n = await countSubmittedAttempts(e.id, userId, since)
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
  }, [rows, userId, overridesMap])

  const examsByLevel = useMemo(() => {
    const out = { first: [], second: [], third: [] }
    for (const r of rows) {
      const ui = dbToUiGrade(r.grade)
      if (ui && out[ui]) out[ui].push(r)
    }
    return out
  }, [rows])

  // Effective max attempts = exam default + admin-granted extra attempts.
  // The override's `attempts` field is a bonus granted on top of the default,
  // so bumping it by +N always gives the student N more tries — even if they
  // already exhausted their previous allowance.
  const effectiveMaxAttempts = (exam) => {
    const o = overridesMap.get(exam.id)
    const base = exam.max_attempts || 1
    const extra = o && typeof o.attempts === 'number' ? o.attempts : 0
    return base + extra
  }
  const isAllowed = (exam) => {
    const o = overridesMap.get(exam.id)
    return o ? o.allowed !== false : true
  }
  const remainingFor = (exam) =>
    Math.max(0, effectiveMaxAttempts(exam) - (attemptsMap[exam.id] || 0))

  const startExam = (exam) => {
    if (userRole !== 'admin' && !isAllowed(exam)) {
      setAlertModal(t('exams.noExams'), t('exams.noExams'))
      return
    }
    if (userRole !== 'admin' && remainingFor(exam) <= 0) {
      setShowModal(true)
      return
    }
    navigate(`/exam-taking?id=${exam.id}`)
  }

  const [blockAlert, setBlockAlert] = useState(null)
  const setAlertModal = (title, message) => setBlockAlert({ title, message })

  const addExam = (level) => {
    localStorage.setItem('selectedGrade', level)
    navigate('/exam-add')
  }

  const [confirmDelete, setConfirmDelete] = useState(null) // { id, title } | null

  const requestDelete = (exam) => setConfirmDelete({ id: exam.id, title: exam.title })

  const performDelete = async () => {
    const target = confirmDelete
    if (!target) return
    try {
      await deleteExam(target.id)
      setRows(prev => prev.filter(e => e.id !== target.id))
      setConfirmDelete(null)
    } catch (err) {
      setConfirmDelete(null)
      setAlertModal(t('common.error'), err.message || t('common.error'))
    }
  }

  const levelTitles = {
    first: `${t('exams.pageTitle')} - ${t('grades.firstShort')}`,
    second: `${t('exams.pageTitle')} - ${t('grades.secondShort')}`,
    third: `${t('exams.pageTitle')} - ${t('grades.thirdShort')}`,
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
            <span className="prep-count"><i className="fas fa-file-alt"></i> {examsByLevel[level].length} {t('exams.pageTitle')}</span>
            <span className="prep-cta">{t('common.view')} <i className={`fas ${lang === 'ar' ? 'fa-arrow-left' : 'fa-arrow-right'}`}></i></span>
          </div>
        </div>
      </button>
    )
  }

  const renderExamItem = (exam, index) => {
    const remaining = remainingFor(exam)
    const createdAt = new Date(exam.created_at)
    // Per-audience availability override wins over the exam's own default.
    // `overridesMap` is keyed by exam.id and may carry `availableHours`.
    const o = overridesMap.get(exam.id)
    const effectiveHours = o?.availableHours ?? exam.available_hours
    const availableUntil = new Date(createdAt.getTime() + (effectiveHours * 60 * 60 * 1000))
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
          <span>{isAvailable ? t('videos.available') : t('videos.unavailable')}</span>
          {userRole === 'admin' && (
            <button className="ec-delete-btn" onClick={e => { e.stopPropagation(); requestDelete(exam) }}>
              🗑 {t('common.delete')}
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
            <span className="ec-stat-label">{t('exams.duration')}</span>
            <span className="ec-stat-value">{exam.duration_minutes} {t('common.minutes')}</span>
          </div>
          <div className="ec-stat">
            <span className="ec-stat-icon">🕒</span>
            <span className="ec-stat-label">{t('exams.availableHours').replace('{n}', '')}</span>
            <span className="ec-stat-value">{effectiveHours} {t('common.hours')}</span>
          </div>
          <div className="ec-stat">
            <span className="ec-stat-icon">❓</span>
            <span className="ec-stat-label">{t('exams.questions')}</span>
            <span className="ec-stat-value">{qCount} {t('common.question')}</span>
          </div>
          <div className="ec-stat">
            <span className="ec-stat-icon">🏆</span>
            <span className="ec-stat-label">{t('exams.totalPoints')}</span>
            <span className="ec-stat-value">{exam.total_points} {t('common.point')}</span>
          </div>
          <div className="ec-stat">
            <span className="ec-stat-icon">🔁</span>
            <span className="ec-stat-label">{t('exams.attempts')}</span>
            <span className="ec-stat-value">{remaining}/{effectiveMaxAttempts(exam)}</span>
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
          ← {t('common.back')}
        </button>
      )}
      <div className="section-header">
        <div className="section-title">
          <span>{levelEmojis[level]}</span>
          {levelTitles[level]}
        </div>
        {userRole === 'admin' && (
          <button className="add-exam" onClick={() => addExam(level)}>
            ➕ {t('exams.addExam')}
          </button>
        )}
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <i className="fas fa-spinner fa-spin"></i> {t('exams.loading')}
        </div>
      ) : loadError ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#e53e3e' }}>
          {loadError}
        </div>
      ) : examsByLevel[level].length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#a0aec0' }}>
          {t('exams.noExams')}
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
              <h1>{t('exams.pageTitle')}</h1>
              <p>{t('exams.pickGrade')}</p>
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
          <span className="breadcrumb-item active" onClick={() => setCurrentLevel(null)}>{t('exams.pageTitle')}</span>
          <span>›</span>
          <span className="breadcrumb-item active">{levelTitles[currentLevel]}</span>
        </div>
      )}

      {currentLevel && renderExamSection(currentLevel)}

      {showModal && (
        <div className="modal active">
          <div className="modal-content">
            <h3 className="modal-title">{t('exams.attempts')}</h3>
            <p className="modal-message">{t('exams.noExams')}</p>
            <button className="modal-button" onClick={() => setShowModal(false)}>{t('common.confirm')}</button>
          </div>
        </div>
      )}

      {blockAlert && (
        <div className="modal active">
          <div className="modal-content">
            <h3 className="modal-title">{blockAlert.title}</h3>
            <p className="modal-message">{blockAlert.message}</p>
            <button className="modal-button" onClick={() => setBlockAlert(null)}>{t('common.confirm')}</button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          title={t('exams.confirmDeleteTitle')}
          itemLabel={confirmDelete.title}
          message={t('exams.deleteWarning')}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={performDelete}
        />
      )}
    </div>
  )
}
