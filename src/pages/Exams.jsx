import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import './Exams.css'
import PrepIllustration from '../components/PrepIllustration'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog'
import { listExams, deleteExam, updateExam, dbToUiGrade, uiToDbGrade, countSubmittedAttemptsBatch } from '@backend/examsApi'
import { listEffectiveOverrides, reduceEffective } from '@backend/overridesApi'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../utils/cache'
import { useAuth } from '../contexts/AuthContext'
import QuestionImagePicker from '../components/QuestionImagePicker'
import { notify } from '../utils/notify'

const PREP_META = {
  first:  { ar: 'الصف الأول الإعدادي',  en: 'First Prep',  accent: 'green',  desc: 'بداية المرحلة الإعدادية والتأسيس' },
  second: { ar: 'الصف الثاني الإعدادي', en: 'Second Prep', accent: 'blue',   desc: 'تعميق المفاهيم وبناء المهارات' },
  third:  { ar: 'الصف الثالث الإعدادي', en: 'Third Prep',  accent: 'orange', desc: 'الاستعداد لاختبارات الشهادة' },
}

export default function Exams() {
  const navigate = useNavigate()
  // Record this visit for the home "Continue" widget.
  useEffect(() => { import('../utils/trackVisit').then(m => m.trackVisit('exams')) }, [])
  const { user, role: userRole } = useAuth()
  const userId = user?.id || null

  const [currentLevel, setCurrentLevel] = useState(() => {
    if (user && user.role !== 'admin' && user.grade) {
      return dbToUiGrade(user.grade)
    }
    return null
  })

  const [showModal, setShowModal] = useState(false)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [attemptsMap, setAttemptsMap] = useState({}) // examId -> submitted count
  const [overridesMap, setOverridesMap] = useState(new Map()) // examId -> {allowed, attempts}

  const refresh = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await cached('exams', LIST_TTL, listExams)
      setRows(data)
    } catch (err) {
      setLoadError(err.message || 'تعذر تحميل الامتحانات')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    if (!userId || userRole === 'admin') { setOverridesMap(new Map()); return }
    let cancelled = false
    ;(async () => {
      try {
        const grade = user?.grade
        if (!grade) return
        const rows = await listEffectiveOverrides({
          studentId: userId, grade, group: user?.group || null, itemType: 'exam',
        })
        if (!cancelled) setOverridesMap(reduceEffective(rows))
      } catch { /* ignore — defaults apply */ }
    })()
    return () => { cancelled = true }
  }, [userId, userRole, user?.grade, user?.group])

  // Fetch submitted-attempt counts for the currently displayed exams.
  // If an admin override exists for this exam, we only count attempts
  // submitted *since* the override was last saved — so bumping/re-saving
  // the bonus acts as a fresh "N tries from now" grant.
  useEffect(() => {
    // Admins don't take exams — skip the attempt-count batch. Saves one
    // round trip per visit to /exams for the admin.
    if (!userId || userRole === 'admin' || rows.length === 0) {
      setAttemptsMap({}); return
    }
    let cancelled = false
    ;(async () => {
      try {
        // One request for all exam IDs instead of one per exam.
        const sinceMap = {}
        for (const e of rows) {
          const o = overridesMap.get(e.id)
          if (o?.updatedAt) sinceMap[e.id] = o.updatedAt
        }
        const counts = await countSubmittedAttemptsBatch(
          rows.map((e) => e.id), userId, sinceMap
        )
        if (!cancelled) setAttemptsMap(Object.fromEntries(counts))
      } catch {
        if (!cancelled) setAttemptsMap({})
      }
    })()
    return () => { cancelled = true }
  }, [rows, userId, userRole, overridesMap])

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
      setAlertModal('الوصول محظور', 'تم تقييد هذا الامتحان من قِبَل الإدارة.')
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
  const [editExam, setEditExam] = useState(null)           // exam row | null

  const requestDelete = (exam) => setConfirmDelete({ id: exam.id, title: exam.title })

  const requestEdit = (exam) => setEditExam(exam)
  const saveExamEdit = async (patch) => {
    if (!editExam) return
    try {
      const updated = await updateExam(editExam.id, patch)
      invalidateCache('exams')
      setRows(prev => prev.map(e => e.id === editExam.id ? { ...e, ...updated } : e))
      setEditExam(null)
    } catch (err) {
      setAlertModal('تعذر الحفظ', err.message || 'حدث خطأ أثناء حفظ التعديلات.')
    }
  }

  const performDelete = async () => {
    const target = confirmDelete
    if (!target) return
    try {
      await deleteExam(target.id)
      invalidateCache('exams')
      setRows(prev => prev.filter(e => e.id !== target.id))
      setConfirmDelete(null)
    } catch (err) {
      setConfirmDelete(null)
      setAlertModal('تعذر الحذف', err.message || 'حدث خطأ أثناء حذف الامتحان.')
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
          <span>{isAvailable ? 'متاح' : 'غير متاح'}</span>
          {userRole === 'admin' && (
            <>
              <button className="ec-delete-btn" onClick={e => { e.stopPropagation(); requestEdit(exam) }} style={{ marginInlineEnd: 6 }}>
                ✏️ تعديل
              </button>
              <button className="ec-delete-btn" onClick={e => { e.stopPropagation(); requestDelete(exam) }}>
                🗑 حذف
              </button>
            </>
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
            <span className="ec-stat-value">{effectiveHours} ساعة</span>
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

      {blockAlert && (
        <div className="modal active">
          <div className="modal-content">
            <h3 className="modal-title">{blockAlert.title}</h3>
            <p className="modal-message">{blockAlert.message}</p>
            <button className="modal-button" onClick={() => setBlockAlert(null)}>حسناً</button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          title="تأكيد حذف الامتحان"
          itemLabel={confirmDelete.title}
          message="سيتم حذف الامتحان وجميع محاولات الطلاب المرتبطة به نهائياً. لا يمكن التراجع عن هذا الإجراء."
          onCancel={() => setConfirmDelete(null)}
          onConfirm={performDelete}
        />
      )}

      {editExam && (
        <EditExamModal
          exam={editExam}
          onCancel={() => setEditExam(null)}
          onSave={saveExamEdit}
        />
      )}
    </div>
  )
}

/* ── Inline edit modal for an existing exam (basic metadata only).
   Editing the questions array is intentionally NOT supported here —
   delete + recreate the exam if you need to change question content. */
function EditExamModal({ exam, onCancel, onSave }) {
  const [title, setTitle]    = useState(exam.title || '')
  const [number, setNumber]  = useState(exam.number || '')
  const [grade, setGrade]    = useState(exam.grade || 'first-prep')
  const [duration, setDur]   = useState(exam.duration_minutes || 30)
  const [maxAtt, setMaxAtt]  = useState(exam.max_attempts || 1)
  const [hours, setHours]    = useState(exam.available_hours || 72)
  const [reveal, setReveal]  = useState(!!exam.reveal_grades)
  const [busy, setBusy]      = useState(false)

  // Initialize questions with a local id field for list rendering keys.
  const [questions, setQuestions] = useState(() => {
    if (Array.isArray(exam.questions)) {
      return exam.questions.map((q, idx) => ({
        id: idx,
        question: q.question || '',
        image: q.image || '',
        options: Array.isArray(q.options) ? [...q.options] : ['', ''],
        answers: Array.isArray(q.answers) ? [...q.answers] : [0],
        points: typeof q.points === 'number' ? q.points : 1,
        isMultiple: !!q.isMultiple || (Array.isArray(q.answers) && q.answers.length > 1)
      }))
    }
    return []
  })

  const [questionsCopy, setQuestionsCopy] = useState('')
  const [showCopySection, setShowCopySection] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState(null)

  // Recalculate total points dynamically when questions or their points change.
  const totalPoints = useMemo(() => {
    return questions.reduce((sum, q) => sum + (parseInt(q.points, 10) || 1), 0)
  }, [questions])

  const addSingleQuestion = () => {
    const nextId = questions.length === 0
      ? 0
      : Math.max(...questions.map(q => q.id)) + 1
    setQuestions(prev => [
      ...prev,
      { id: nextId, question: '', image: '', options: ['', ''], answers: [0], points: 1, isMultiple: false },
    ])
  }

  const removeQuestion = (id) => {
    setQuestions(prev => prev.filter(q => q.id !== id))
  }

  const updateQuestion = (id, field, value) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q))
  }

  const addOption = (id) => {
    setQuestions(prev => prev.map(q => 
      q.id === id ? { ...q, options: [...q.options, ''] } : q
    ))
  }

  const removeOption = (id) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === id && q.options.length > 2) {
        const newOptions = q.options.slice(0, -1)
        // Adjust answers if they refer to the deleted option index
        const maxIndex = newOptions.length - 1
        const newAnswers = q.answers.filter(a => a <= maxIndex)
        return {
          ...q,
          options: newOptions,
          answers: newAnswers.length > 0 ? newAnswers : [0]
        }
      }
      return q
    }))
  }

  const updateOption = (id, optionIndex, value) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === id) {
        const newOptions = [...q.options]
        newOptions[optionIndex] = value
        return { ...q, options: newOptions }
      }
      return q
    }))
  }

  const toggleMultipleAnswers = (id) => {
    setQuestions(prev => prev.map(q => 
      q.id === id ? { ...q, isMultiple: !q.isMultiple, answers: q.isMultiple ? [0] : q.answers } : q
    ))
  }

  const updateAnswer = (id, answerIndex, isChecked) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === id) {
        let newAnswers
        if (q.isMultiple) {
          newAnswers = isChecked 
            ? [...q.answers, answerIndex] 
            : q.answers.filter(a => a !== answerIndex)
        } else {
          newAnswers = [answerIndex]
        }
        return { ...q, answers: newAnswers }
      }
      return q
    }))
  }

  const parseCopiedQuestions = () => {
    const text = questionsCopy.trim()
    if (!text) {
      notify('يرجى إدخال الأسئلة أولاً لتجزيئها', { type: 'warning' })
      return
    }
    const parsedQuestions = parseNaturalFormat(text)
    if (parsedQuestions.length === 0) {
      notify('لم يتم العثور على أسئلة — تأكد من التنسيق والسطور الفارغة بين الأسئلة', { type: 'warning' })
      return
    }
    
    // Merge or replace? We'll append them to the existing questions list
    const startId = questions.length === 0 ? 0 : Math.max(...questions.map(q => q.id)) + 1
    const withIds = parsedQuestions.map((q, idx) => ({ ...q, id: startId + idx }))
    
    setQuestions(prev => [...prev, ...withIds])
    setQuestionsCopy('')
    setShowCopySection(false)
    notify(`تم استيراد ${parsedQuestions.length} سؤال بنجاح!`, { type: 'success' })
  }

  const parseNaturalFormat = (text) => {
    const blocks = text
      .split(/\n\s*\n+/) // blank-line separator
      .map((b) => b.trim())
      .filter((b) => b.length > 0)
    return blocks.map((block, i) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
      let points = 1
      // Trailing "!2" line sets points
      if (lines.length > 1 && /^!\s*\d+/.test(lines[lines.length - 1])) {
        const m = lines.pop().match(/\d+/)
        if (m) points = Math.max(1, parseInt(m[0], 10))
      }
      // Inline "[2]" right after the question text
      let questionLine = lines[0] || ''
      const inlinePts = questionLine.match(/[\[\(](\d+)[\]\)]\s*$/)
      if (inlinePts) {
        points = Math.max(1, parseInt(inlinePts[1], 10))
        questionLine = questionLine.replace(/[\[\(](\d+)[\]\)]\s*$/, '').trim()
      }
      const options = []
      const correctAnswers = []
      for (let j = 1; j < lines.length; j++) {
        let opt = lines[j]
        // Strip optional bullet markers like "- ", "1. ", "أ) "
        opt = opt.replace(/^[-•·]\s+/, '')
                 .replace(/^[٠-٩\d]+[\.\)\-]\s*/, '')
                 .replace(/^[a-zA-Zء-ي][\.\)\-]\s*/, '')
        const isCorrect = /^[\*★✓✔]\s*/.test(opt)
        if (isCorrect) opt = opt.replace(/^[\*★✓✔]\s*/, '').trim()
        if (!opt) continue
        options.push(opt)
        if (isCorrect) correctAnswers.push(options.length - 1)
      }
      return {
        question: questionLine,
        options: options.length >= 2 ? options : (options.length ? [...options, ''] : ['', '']),
        answers: correctAnswers.length > 0 ? correctAnswers : [0],
        points,
        isMultiple: correctAnswers.length > 1,
      }
    })
  }

  const buildPayload = () => {
    if (!title.trim()) {
      notify('يرجى كتابة عنوان الامتحان', { type: 'warning' })
      return null
    }
    if (!duration || parseInt(duration, 10) <= 0) {
      notify('يرجى تحديد مدة صالحة للامتحان', { type: 'warning' })
      return null
    }
    if (questions.length === 0) {
      notify('يرجى إضافة سؤال واحد على الأقل للامتحان', { type: 'warning' })
      return null
    }
    const isValid = questions.every(q =>
      q.question.trim() &&
      q.options.every(opt => opt.trim()) &&
      q.answers.length > 0
    )
    if (!isValid) {
      notify('يرجى التأكد من ملء نصوص كافة الأسئلة والخيارات وتحديد إجابة صحيحة واحدة على الأقل لكل سؤال', { type: 'warning' })
      return null
    }

    const cleanQuestions = questions.map(q => ({
      question: q.question.trim(),
      image: q.image || null,
      options: q.options.map(o => o.trim()),
      answers: q.answers,
      points: parseInt(q.points, 10) || 1,
      isMultiple: !!q.isMultiple,
    }))

    return {
      title: title.trim(),
      number: number || null,
      grade,
      duration_minutes: parseInt(duration, 10),
      max_attempts: parseInt(maxAtt, 10),
      available_hours: parseInt(hours, 10),
      total_points: totalPoints,
      reveal_grades: reveal,
      questions: cleanQuestions
    }
  }

  const previewExam = () => {
    const payload = buildPayload()
    if (!payload) return
    setPreviewData(payload)
    setShowPreview(true)
    setTimeout(() => {
      document.querySelector('.edit-preview-block')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    const payload = buildPayload()
    if (!payload) return
    
    setBusy(true)
    try {
      await onSave(payload)
      notify('تم تعديل الامتحان بنجاح!', { type: 'success' })
    } catch (err) {
      notify(err.message || 'حدث خطأ أثناء تعديل الامتحان', { type: 'warning' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal show active" onClick={onCancel} style={{ display: 'flex', overflowY: 'auto', padding: '20px 10px', alignItems: 'flex-start', justifyContent: 'center' }}>
      <style>{`
        .edit-exam-modal-content {
          background-color: var(--card-bg, #1a1f2e);
          padding: 30px;
          border-radius: 20px;
          max-width: 960px;
          width: 95%;
          box-shadow: var(--shadow-hover);
          margin: auto;
          position: relative;
          direction: rtl;
          border: 1px solid rgba(167, 139, 250, 0.18);
          animation: fadeInUp 0.4s ease;
          color: var(--text-color, #f7fafc);
        }
        body.dark .edit-exam-modal-content {
          background-color: #1a1f2e;
          border-color: rgba(167, 139, 250, 0.18);
        }
        .edit-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(167, 139, 250, 0.15);
          padding-bottom: 15px;
          margin-bottom: 20px;
        }
        .edit-modal-header h3 {
          margin: 0;
          font-size: 1.6rem;
          font-weight: 700;
          background: linear-gradient(45deg, #6366f1, #8b5cf6, #06b6d4);
          background-clip: text;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .edit-close-btn {
          background: transparent;
          border: none;
          color: var(--text-secondary, #a0aec0);
          font-size: 2rem;
          cursor: pointer;
          line-height: 1;
          transition: color 0.2s;
        }
        .edit-close-btn:hover {
          color: #f56565;
        }
        .edit-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 768px) {
          .edit-grid {
            grid-template-columns: 1fr;
          }
        }
        .edit-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .edit-field label {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-color, #e2e8f0);
        }
        .edit-input, .edit-select, .edit-textarea {
          width: 100%;
          padding: 12px 14px;
          font-size: 0.95rem;
          border-radius: 10px;
          border: 1.5px solid rgba(99, 102, 241, 0.18);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-color, #f7fafc);
          font-family: 'Cairo', sans-serif;
          transition: all 0.2s;
        }
        body.dark .edit-input, body.dark .edit-select, body.dark .edit-textarea {
          background: #0f172a;
          border-color: rgba(167, 139, 250, 0.22);
          color: #e2e8f0;
        }
        .edit-input:focus, .edit-select:focus, .edit-textarea:focus {
          outline: none;
          border-color: #8b5cf6;
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
        }
        .edit-textarea {
          height: 70px;
          resize: vertical;
        }
        .edit-questions-title {
          font-size: 1.25rem;
          font-weight: 700;
          margin: 30px 0 15px;
          color: #8b5cf6;
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid rgba(139, 92, 246, 0.2);
          padding-bottom: 8px;
        }
        .edit-q-block {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
          position: relative;
        }
        body.dark .edit-q-block {
          background: #1e2538;
          border-color: rgba(167, 139, 250, 0.1);
        }
        .edit-q-block:hover {
          border-color: rgba(139, 92, 246, 0.4);
        }
        .edit-q-controls {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin-bottom: 15px;
          border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
          padding-bottom: 10px;
        }
        .edit-btn-sm {
          padding: 6px 12px;
          font-size: 0.8rem;
          font-weight: 600;
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.05);
          color: var(--text-color, #e2e8f0);
          cursor: pointer;
          font-family: 'Cairo', sans-serif;
          transition: all 0.2s;
        }
        .edit-btn-sm:hover {
          background: #6366f1;
          color: white;
        }
        .edit-btn-sm.active {
          background: #10b981;
          color: white;
          border-color: #10b981;
        }
        .edit-btn-delete {
          margin-right: auto;
          color: #f87171;
          border-color: rgba(248, 113, 113, 0.2);
        }
        .edit-btn-delete:hover {
          background: #f87171;
          color: white;
          border-color: #f87171;
        }
        .edit-opts-wrapper {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin: 12px 0;
        }
        .edit-opt-item {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .edit-ans-wrapper {
          display: flex;
          flex-wrap: wrap;
          gap: 15px;
          margin-top: 10px;
          background: rgba(255, 255, 255, 0.02);
          padding: 10px;
          border-radius: 8px;
        }
        .edit-ans-item {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }
        .edit-action-row {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 30px;
          border-top: 1px solid rgba(255,255,255,0.1);
          padding-top: 20px;
        }
        @media (max-width: 480px) {
          .edit-exam-modal-content {
            padding: 16px 12px;
            width: 98%;
          }
          .edit-modal-header h3 {
            font-size: 1.25rem;
          }
          .edit-q-block {
            padding: 12px;
          }
          .edit-grid {
            gap: 10px;
          }
        }
      `}</style>
      <div className="edit-exam-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="edit-modal-header">
          <h3>تعديل الامتحان: {exam.title}</h3>
          <button className="edit-close-btn" onClick={onCancel}>&times;</button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Metadata Section */}
          <div className="edit-grid">
            <div className="edit-field">
              <label>العنوان</label>
              <input type="text" className="edit-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="edit-field">
              <label>رقم الامتحان (مثال: 5)</label>
              <input type="text" className="edit-input" value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
          </div>

          <div className="edit-grid">
            <div className="edit-field">
              <label>الصف الدراسي</label>
              <select className="edit-select" value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="first-prep">الصف الأول الإعدادي</option>
                <option value="second-prep">الصف الثاني الإعدادي</option>
                <option value="third-prep">الصف الثالث الإعدادي</option>
              </select>
            </div>
            <div className="edit-field">
              <label>الدرجة الكلية (تُحسب تلقائياً)</label>
              <input type="number" className="edit-input" value={totalPoints} disabled style={{ opacity: 0.7, background: 'rgba(255,255,255,0.05)' }} />
            </div>
          </div>

          <div className="edit-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="edit-field">
              <label>المدة (بالدقائق)</label>
              <input type="number" min="1" className="edit-input" value={duration} onChange={(e) => setDur(parseInt(e.target.value, 10) || 1)} required />
            </div>
            <div className="edit-field">
              <label>المحاولات المتاحة</label>
              <input type="number" min="1" className="edit-input" value={maxAtt} onChange={(e) => setMaxAtt(parseInt(e.target.value, 10) || 1)} required />
            </div>
            <div className="edit-field">
              <label>مدة توفر الامتحان (ساعة)</label>
              <input type="number" min="1" className="edit-input" value={hours} onChange={(e) => setHours(parseInt(e.target.value, 10) || 1)} required />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0' }}>
            <input type="checkbox" id="edit-reveal" checked={reveal} onChange={(e) => setReveal(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#8b5cf6' }} />
            <label htmlFor="edit-reveal" style={{ userSelect: 'none', cursor: 'pointer', fontWeight: 600 }}>إظهار الدرجات للطلاب فور التسليم</label>
          </div>

          {/* Bulk Import */}
          <div className="edit-questions-title">
            <i className="fas fa-file-invoice"></i>
            <span>أسئلة الامتحان ({questions.length})</span>
          </div>

          <div style={{ background: 'rgba(139, 92, 246, 0.05)', border: '1px dashed rgba(139, 92, 246, 0.25)', borderRadius: 12, padding: 15 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#a78bfa' }}>📋 إستيراد سريع (لصق أسئلة متعددة دفعة واحدة)</span>
              <button type="button" className="edit-btn-sm" onClick={() => setShowCopySection(!showCopySection)}>
                {showCopySection ? 'إخفاء لوحة اللصق' : 'عرض لوحة اللصق'}
              </button>
            </div>
            
            {showCopySection && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <textarea
                  className="edit-textarea"
                  style={{ height: 120, fontSize: '0.85rem' }}
                  value={questionsCopy}
                  onChange={(e) => setQuestionsCopy(e.target.value)}
                  placeholder="ما عاصمة مصر؟&#10;*القاهرة&#10;الإسكندرية&#10;الجيزة&#10;&#10;ما ناتج 3 + 2؟&#10;2&#10;3&#10;*5&#10;4&#10;!2"
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-outline" style={{ padding: '8px 16px', fontSize: 13, minWidth: 0, marginTop: 0 }} onClick={parseCopiedQuestions}>📥 استيراد الأسئلة ولصقها بالأسفل</button>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', alignSelf: 'center' }}>سيتم استخراج الأسئلة وإضافتها في نهاية قائمتك الحالية.</span>
                </div>
              </div>
            )}
          </div>

          {/* Questions List */}
          <div className="edit-questions-list">
            {questions.map((q, idx) => (
              <div className="edit-q-block" key={q.id}>
                <div className="edit-q-controls">
                  <span style={{ fontWeight: 800, fontSize: '1rem', color: '#8b5cf6', marginInlineEnd: 10 }}>السؤال {idx + 1}</span>
                  <button type="button" className="edit-btn-sm" onClick={() => addOption(q.id)}>
                    <i className="fas fa-plus"></i> إضافة خيار
                  </button>
                  <button type="button" className="edit-btn-sm" onClick={() => removeOption(q.id)} disabled={q.options.length <= 2}>
                    <i className="fas fa-minus"></i> حذف خيار
                  </button>
                  <button
                    type="button"
                    className={`edit-btn-sm ${q.isMultiple ? 'active' : ''}`}
                    onClick={() => toggleMultipleAnswers(q.id)}
                  >
                    <i className="fas fa-check-double"></i> {q.isMultiple ? 'متعدد الإجابات' : 'إجابة واحدة'}
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginInlineStart: 10 }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>النقاط:</span>
                    <input
                      type="number"
                      min="1"
                      className="edit-input"
                      style={{ width: 60, padding: '4px 8px', fontSize: '0.85rem' }}
                      value={q.points}
                      onChange={(e) => updateQuestion(q.id, 'points', parseInt(e.target.value, 10) || 1)}
                    />
                  </div>
                  <button type="button" className="edit-btn-sm edit-btn-delete" onClick={() => removeQuestion(q.id)}>
                    <i className="fas fa-trash"></i> حذف
                  </button>
                </div>

                <div className="edit-field" style={{ marginBottom: 12 }}>
                  <textarea
                    className="edit-textarea"
                    value={q.question}
                    onChange={(e) => updateQuestion(q.id, 'question', e.target.value)}
                    placeholder="اكتب صيغة السؤال هنا..."
                    required
                  />
                </div>

                {/* Optional Image Picker */}
                <div style={{ marginBottom: 15 }}>
                  <QuestionImagePicker
                    value={q.image}
                    onChange={(url) => updateQuestion(q.id, 'image', url)}
                  />
                </div>

                {/* Options Input */}
                <div className="edit-opts-wrapper">
                  {q.options.map((opt, oIdx) => (
                    <div className="edit-opt-item" key={oIdx}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>{String.fromCharCode(65 + oIdx)}</span>
                      <input
                        type="text"
                        className="edit-input"
                        style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)' }}
                        value={opt}
                        onChange={(e) => updateOption(q.id, oIdx, e.target.value)}
                        placeholder={`الخيار الفرعي ${oIdx + 1}`}
                        required
                      />
                    </div>
                  ))}
                </div>

                {/* Correct Answer Selection */}
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981', marginTop: 10 }}>✓ حدد الإجابة (أو الإجابات) الصحيحة:</div>
                <div className="edit-ans-wrapper">
                  {q.options.map((opt, oIdx) => (
                    <label className="edit-ans-item" key={oIdx}>
                      <input
                        type={q.isMultiple ? 'checkbox' : 'radio'}
                        name={`edit-correct-${q.id}`}
                        checked={q.answers.includes(oIdx)}
                        onChange={(e) => {
                          if (q.isMultiple) {
                            updateAnswer(q.id, oIdx, e.target.checked)
                          } else {
                            if (e.target.checked) updateAnswer(q.id, oIdx, true)
                          }
                        }}
                        style={{ width: 16, height: 16, accentColor: '#10b981' }}
                      />
                      <span>{opt.trim() || `الخيار ${String.fromCharCode(65 + oIdx)}`}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Add single question button */}
          <button type="button" className="exam-add-q-btn" onClick={addSingleQuestion} style={{ marginTop: 0 }}>
            <i className="fas fa-plus"></i>
            <span>إضافة سؤال جديد يدوياً</span>
          </button>

          {/* Action Row */}
          <div className="edit-action-row">
            <button type="button" className="btn btn-outline" style={{ marginTop: 0, padding: '10px 20px', fontSize: 14 }} onClick={onCancel} disabled={busy}>إلغاء</button>
            <button type="button" className="btn btn-preview" style={{ marginTop: 0, padding: '10px 20px', fontSize: 14 }} onClick={previewExam} disabled={busy}>🔍 معاينة التعديلات</button>
            <button type="submit" className="btn btn-primary" style={{ marginTop: 0, padding: '10px 20px', fontSize: 14 }} disabled={busy}>
              {busy ? '⏳ جاري الحفظ...' : '✓ حفظ التغييرات'}
            </button>
          </div>
        </form>

        {/* Preview Block */}
        {showPreview && previewData && (
          <div className="preview edit-preview-block" style={{ marginTop: 30 }}>
            <h2><i className="fas fa-magnifying-glass" style={{ color: '#f59e0b', marginInlineEnd: 8 }}></i> معاينة ورقة التعديل</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.9rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 15, marginBottom: 20 }}>
              <div><strong>العنوان:</strong> {previewData.title}</div>
              <div><strong>المدة:</strong> {previewData.duration_minutes} دقيقة</div>
              <div><strong>عدد المحاولات:</strong> {previewData.max_attempts}</div>
              <div><strong>مدة توفر الامتحان:</strong> {previewData.available_hours} ساعة</div>
              <div><strong>الدرجة الإجمالية المحتسبة:</strong> {previewData.total_points} درجة</div>
            </div>
            {previewData.questions.map((q, idx) => (
              <div key={idx} className="question-block" style={{ borderLeft: '4px solid #8b5cf6', background: 'rgba(255,255,255,0.01)', padding: 15, marginBottom: 15 }}>
                <strong>س{idx + 1} ({q.points} نقطة): {q.question}</strong>
                {q.image && <div style={{ marginTop: 10 }}><img src={q.image} alt="" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} /></div>}
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {q.options.map((opt, oIdx) => (
                    <div 
                      key={oIdx}
                      className={`preview-option ${q.answers.includes(oIdx) ? 'correct' : ''}`}
                      style={{ margin: 0 }}
                    >
                      {String.fromCharCode(65 + oIdx)}. {opt} {q.answers.includes(oIdx) ? '✅ (إجابة صحيحة)' : ''}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
