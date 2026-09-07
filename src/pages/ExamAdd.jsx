import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTenant } from '../contexts/TenantContext'
import './ExamAdd.css'
import { notify } from '../utils/notify'
import { createExam, uiToDbGrade, dbToUiGrade } from '@backend/examsApi'
import { listGroups } from '@backend/groupsApi'
import QuestionImagePicker from '../components/QuestionImagePicker'
import DateTimePicker from '../components/DateTimePicker'
import { invalidatePrefix } from '../utils/cache'
import SharedTextBlocksEditor, {
  editorBlocksToPayload,
  validateEditorBlocks,
} from '../components/SharedTextBlocksEditor'
import { saveExamSharedBlocks } from '@backend/examSharedBlocksApi'
import {
  detectTextDir,
  copyQuestionToClipboard,
  copyAllQuestionsToClipboard,
  parseNaturalFormat as parseQuestionsNatural,
} from '../utils/questionUtils'

function getStoredDraft(slug) {
  try {
    const raw = localStorage.getItem(`masar_exam_add_draft_${slug || 'default'}`) || localStorage.getItem('masar_exam_add_draft')
    if (raw) return JSON.parse(raw)
  } catch (e) {
    console.error('Failed to parse exam draft:', e)
  }
  return null
}

export default function ExamAdd() {
  const navigate = useNavigate()
  const { isGradeEnabled, gradesList, tenant } = useTenant()
  const draftKey = `masar_exam_add_draft_${tenant?.slug || 'default'}`
  const initialDraft = useMemo(() => getStoredDraft(tenant?.slug), [tenant?.slug])

  const [examTitle, setExamTitle] = useState(() => initialDraft?.examTitle || '')
  const [examGrade, setExamGrade] = useState(() => {
    if (initialDraft?.examGrade) return initialDraft.examGrade
    const selected = localStorage.getItem('selectedGrade')
    const dbSelected = uiToDbGrade(selected) || selected
    if (dbSelected && (gradesList || []).some(g => g.id === dbSelected)) {
      return selected
    }
    if (gradesList && gradesList.length > 0) {
      const dbFirst = gradesList[0].id
      return dbToUiGrade(dbFirst) || dbFirst
    }
    return 'first'
  })
  const [examType, setExamType] = useState(() => {
    if (initialDraft?.examType) return initialDraft.examType
    return localStorage.getItem('selectedExamType') || 'exam'
  })
  const [duration, setDuration] = useState(() => initialDraft?.duration || '')
  const [maxAttempts, setMaxAttempts] = useState(() => initialDraft?.maxAttempts ?? 1)
  const [opensAt, setOpensAt] = useState(() => {
    if (initialDraft?.opensAt) return initialDraft.opensAt
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  })
  const [availabilityValue, setAvailabilityValue] = useState(() => initialDraft?.availabilityValue ?? (initialDraft?.availabilityDays ?? 3))
  const [availabilityUnit, setAvailabilityUnit] = useState(() => initialDraft?.availabilityUnit || 'days') // 'days' | 'hours'
  const [targetAudience, setTargetAudience] = useState(() => initialDraft?.targetAudience || 'stage') // 'stage' | 'group'
  const [targetGroupId, setTargetGroupId] = useState(() => initialDraft?.targetGroupId || '')
  const [allGroups, setAllGroups] = useState([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [numQuestions, setNumQuestions] = useState(() => initialDraft?.numQuestions || (initialDraft?.questions?.length ? String(initialDraft.questions.length) : ''))
  const [questions, setQuestions] = useState(() => (Array.isArray(initialDraft?.questions) ? initialDraft.questions : []))
  // Shared reading passages. Held here and written straight after the exam
  // row is created, because a block references the exam by id.
  const [sharedBlocks, setSharedBlocks] = useState(() => (Array.isArray(initialDraft?.sharedBlocks) ? initialDraft.sharedBlocks : []))
  const [questionsCopy, setQuestionsCopy] = useState(() => initialDraft?.questionsCopy || '')
  const [showCopySection, setShowCopySection] = useState(() => Boolean(initialDraft?.showCopySection || (initialDraft?.questions && initialDraft.questions.length > 0)))
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draftRestored, setDraftRestored] = useState(() => Boolean(initialDraft && (initialDraft.examTitle || initialDraft.questions?.length > 0)))
  const [lastAutoSaved, setLastAutoSaved] = useState(null)

  useEffect(() => {
    if (gradesList && gradesList.length > 0) {
      const dbSelected = uiToDbGrade(examGrade) || examGrade
      const exists = gradesList.some(g => g.id === dbSelected)
      if (!exists) {
        const dbFirst = gradesList[0].id
        setExamGrade(dbToUiGrade(dbFirst) || dbFirst)
      }
    }
  }, [gradesList])

  useEffect(() => {
    let cancelled = false
    setLoadingGroups(true)
    ;(async () => {
      try {
        const list = await listGroups()
        if (!cancelled) setAllGroups(list || [])
      } catch (err) {
        console.error('Failed to load groups:', err)
      } finally {
        if (!cancelled) setLoadingGroups(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const availableGroups = useMemo(() => {
    const dbGrade = uiToDbGrade(examGrade) || examGrade
    return allGroups.filter(g => g.grade === dbGrade)
  }, [allGroups, examGrade])

  useEffect(() => {
    setTargetGroupId('')
  }, [examGrade])

  const generateQuestions = () => {
    const count = parseInt(numQuestions)
    if (!count || count <= 0) {
      notify('يرجى إدخال عدد صحيح من الأسئلة', { type: 'warning' })
      return
    }

    const newQuestions = Array(count).fill(null).map((_, i) => ({
      id: i,
      question: '',
      image: '',          // optional public URL (from `quiz-images` bucket)
      options: ['', ''],
      answers: [0],
      points: 1,
      isMultiple: false
    }))

    setQuestions(newQuestions)
    setShowCopySection(true)
  }

  // ── Friendly one-click "add another question" ──────────────────
  // For non-technical admins: no need to fiddle with the count input.
  // We append a blank question with a fresh id.
  const addSingleQuestion = () => {
    const nextId = questions.length === 0
      ? 0
      : Math.max(...questions.map(q => q.id)) + 1
    setQuestions(prev => [
      ...prev,
      { id: nextId, question: '', image: '', options: ['', ''], answers: [0], points: 1, isMultiple: false },
    ])
    setNumQuestions(String(questions.length + 1))
    setShowCopySection(true)
  }

  // Delete a single question (and renumber the displayed count).
  const removeQuestion = (id) => {
    setQuestions(prev => {
      const next = prev.filter(q => q.id !== id)
      setNumQuestions(String(next.length))
      return next
    })
  }

  const updateQuestion = (id, field, value) => {
    setQuestions(questions.map(q => q.id === id ? { ...q, [field]: value } : q))
  }

  const addOption = (id) => {
    setQuestions(questions.map(q => 
      q.id === id ? { ...q, options: [...q.options, ''] } : q
    ))
  }

  const removeOption = (id) => {
    setQuestions(questions.map(q => {
      if (q.id === id && q.options.length > 2) {
        const newOptions = q.options.slice(0, -1)
        return { ...q, options: newOptions }
      }
      return q
    }))
  }

  const updateOption = (id, optionIndex, value) => {
    setQuestions(questions.map(q => {
      if (q.id === id) {
        const newOptions = [...q.options]
        newOptions[optionIndex] = value
        return { ...q, options: newOptions }
      }
      return q
    }))
  }

  const toggleMultipleAnswers = (id) => {
    setQuestions(questions.map(q => 
      q.id === id ? { ...q, isMultiple: !q.isMultiple, answers: q.isMultiple ? [0] : q.answers } : q
    ))
  }

  const updateAnswer = (id, answerIndex, isChecked) => {
    setQuestions(questions.map(q => {
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

  // ── Bulk import (single, simple format) ──────────────────────
  //   • Blank line separates questions.
  //   • First line of each block = the question.
  //   • Following lines = options.
  //   • A line starting with `*` (or `★ ✓ ✔`) marks a correct option.
  //   • Optional line starting with `!N` at end of a block = points.
  const parseCopiedQuestions = () => {
    const text = questionsCopy.trim()
    if (!text) {
      notify('يرجى إدخال الأسئلة', { type: 'warning' })
      return
    }
    const parsedQuestions = parseQuestionsNatural(text)
    if (parsedQuestions.length === 0) {
      notify('لم يتم العثور على أسئلة — تأكد من التنسيق', { type: 'warning' })
      return
    }
    setNumQuestions(parsedQuestions.length.toString())
    setQuestions(parsedQuestions)
    notify(`تم استيراد ${parsedQuestions.length} سؤال بنجاح`, { type: 'success' })
  }

  const handleCopySingle = async (q) => {
    const ok = await copyQuestionToClipboard(q)
    if (ok) {
      notify('تم نسخ السؤال بنجاح 📋', { type: 'success' })
    } else {
      notify('تعذر نسخ السؤال', { type: 'error' })
    }
  }

  const handleCopyAllQuestions = async () => {
    if (!questions || questions.length === 0) {
      notify('لا توجد أسئلة لنسخها', { type: 'warning' })
      return
    }
    const ok = await copyAllQuestionsToClipboard(questions)
    if (ok) {
      notify(`تم نسخ ${questions.length} سؤال بنجاح 📋`, { type: 'success' })
    } else {
      notify('تعذر نسخ الأسئلة', { type: 'error' })
    }
  }


  // Shared validation + clean-question shaping. Returns the preview-ready
  // payload, or null when validation fails (with a notify already fired).
  const buildExamPayload = () => {
    if (!examTitle.trim() || !duration || questions.length === 0) {
      notify('يرجى ملء جميع البيانات المطلوبة', { type: 'warning' })
      return null
    }
    const dbGrade = uiToDbGrade(examGrade)
    if (!dbGrade) {
      notify('يرجى اختيار الصف الدراسي', { type: 'warning' })
      return null
    }
    if (targetAudience === 'group' && !targetGroupId) {
      notify('يرجى اختيار المجموعة المستهدفة للامتحان', { type: 'warning' })
      return null
    }
    const val = parseInt(availabilityValue, 10)
    if (!val || val <= 0) {
      notify(
        availabilityUnit === 'hours'
          ? 'يرجى إدخال عدد صحيح لساعات الإتاحة (ساعة واحدة على الأقل)'
          : 'يرجى إدخال عدد صحيح لأيام الإتاحة (يوم واحد على الأقل)',
        { type: 'warning' }
      )
      return null
    }
    const isValid = questions.every(q =>
      q.question.trim() &&
      q.options.every(opt => opt.trim()) &&
      q.answers.length > 0
    )
    if (!isValid) {
      notify('يرجى التأكد من ملء جميع الأسئلة والاختيارات وتحديد الإجابات الصحيحة', { type: 'warning' })
      return null
    }
    const cleanQuestions = questions.map(q => ({
      question: q.question,
      image: q.image || null,
      options: q.options,
      answers: q.answers,
      points: q.points,
      isMultiple: q.isMultiple,
    }))
    const blockError = validateEditorBlocks(sharedBlocks)
    if (blockError) {
      notify(blockError, { type: 'warning' })
      return null
    }
    const total_points = cleanQuestions.reduce((sum, q) => sum + (q.points || 1), 0)
    // Indices are computed from the FINAL question order, so a question the
    // teacher added or removed mid-session still resolves correctly.
    const blocks = editorBlocksToPayload(sharedBlocks, questions)

    const available_hours = availabilityUnit === 'hours' ? val : val * 24
    const availability_days = availabilityUnit === 'days' ? val : null
    const opensAtDate = opensAt ? new Date(opensAt) : new Date()
    const expires_at = new Date(opensAtDate.getTime() + available_hours * 3600 * 1000).toISOString()

    return {
      dbGrade,
      cleanQuestions,
      total_points,
      blocks,
      available_hours,
      availability_days,
      expires_at,
      availabilityValue: val,
      availabilityUnit,
    }
  }

  // Preview-only — shows the same preview card without writing to DB.
  // Lets the admin sanity-check questions + answers before committing.
  const previewExam = () => {
    const payload = buildExamPayload()
    if (!payload) return
    const stageObj = (gradesList || []).find(g => (dbToUiGrade(g.id) || g.id) === examGrade)
    const selectedGroupObj = allGroups.find(g => g.id === targetGroupId)
    setPreviewData({
      title: examTitle,
      stageName: stageObj ? stageObj.name : examGrade,
      targetAudience,
      targetGroupName: selectedGroupObj ? selectedGroupObj.name : '',
      opensAt: opensAt ? new Date(opensAt).toLocaleString('ar-EG') : '—',
      availabilityValue: payload.availabilityValue,
      availabilityUnit: payload.availabilityUnit,
      availabilityDays: payload.availability_days,
      availableHours: payload.available_hours,
      duration: parseInt(duration),
      maxAttempts: parseInt(maxAttempts),
      questions: payload.cleanQuestions,
      totalPoints: payload.total_points,
    })
    setShowPreview(true)
    // Smooth-scroll to the preview block so it's obvious where to look.
    setTimeout(() => {
      document.querySelector('.preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  // Auto-save draft effect: persists form changes continuously
  useEffect(() => {
    const hasContent = examTitle.trim() || questions.length > 0 || duration || questionsCopy.trim() || sharedBlocks.length > 0
    if (!hasContent) {
      try {
        localStorage.removeItem(draftKey)
      } catch { /* ignore */ }
      return
    }

    const payload = {
      examTitle,
      examGrade,
      examType,
      duration,
      maxAttempts,
      opensAt,
      availabilityValue,
      availabilityUnit,
      targetAudience,
      targetGroupId,
      numQuestions,
      questions,
      sharedBlocks,
      questionsCopy,
      showCopySection,
      updatedAt: Date.now()
    }

    try {
      localStorage.setItem(draftKey, JSON.stringify(payload))
      setLastAutoSaved(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }))
    } catch (err) {
      console.warn('Draft auto-save error:', err)
    }
  }, [examTitle, examGrade, examType, duration, maxAttempts, opensAt, availabilityValue, availabilityUnit, targetAudience, targetGroupId, numQuestions, questions, sharedBlocks, questionsCopy, showCopySection, draftKey])

  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(draftKey)
      localStorage.removeItem('masar_exam_add_draft')
    } catch { /* ignore */ }
    setExamTitle('')
    setDuration('')
    setMaxAttempts(1)
    setAvailabilityValue(3)
    setAvailabilityUnit('days')
    setTargetAudience('stage')
    setTargetGroupId('')
    setNumQuestions('')
    setQuestions([])
    setSharedBlocks([])
    setQuestionsCopy('')
    setShowCopySection(false)
    setShowPreview(false)
    setDraftRestored(false)
    notify('تم مسح المسودة وبدء امتحان جديد فارغ', { type: 'info' })
  }

  // Save-only — writes the exam and navigates to the exams list.
  const saveExam = async () => {
    if (saving) return
    const payload = buildExamPayload()
    if (!payload) return

    let createdBy = null
    try {
      const u = JSON.parse(sessionStorage.getItem('masar-user'))
      createdBy = u?.id || null
    } catch { /* ignore */ }

    setSaving(true)
    try {
      const created = await createExam({
        title: examTitle.trim(),
        grade: payload.dbGrade,
        duration_minutes: parseInt(duration),
        max_attempts: parseInt(maxAttempts),
        questions: payload.cleanQuestions,
        total_points: payload.total_points,
        created_by: createdBy,
        exam_type: examType,
        opens_at: opensAt ? new Date(opensAt).toISOString() : new Date().toISOString(),
        availability_days: payload.availability_days,
        available_hours: payload.available_hours,
        expires_at: payload.expires_at,
        target_audience: targetAudience,
        target_group_id: targetAudience === 'group' ? targetGroupId : null,
      })

      // Blocks reference the exam by id, so they can only be written once the
      // row exists. A failure here would otherwise leave a saved exam whose
      // passages silently went missing, so surface it instead of swallowing it.
      if (payload.blocks.length && created?.id) {
        await saveExamSharedBlocks(created.id, payload.blocks)
      }

      try {
        localStorage.removeItem(draftKey)
        localStorage.removeItem('masar_exam_add_draft')
      } catch { /* ignore */ }

      invalidatePrefix('exams')
      setShowSuccess(true)
      setTimeout(() => { navigate('/exams') }, 1200)
    } catch (err) {
      notify(err.message || 'تعذر حفظ الامتحان', { type: 'warning' })
      setSaving(false)
    }
  }

  return (
    <div className="exam-add-page" dir="rtl">
      <div className="exam-add-container">
        {draftRestored && (
          <div className="exam-draft-banner">
            <div className="exam-draft-banner-content">
              <i className="fas fa-floppy-disk exam-draft-banner-icon" />
              <div>
                <strong>تم استرجاع مسودة الامتحان تلقائياً</strong>
                <div style={{ fontSize: '0.82rem', opacity: 0.85, marginTop: 2 }}>
                  بيانات وأسئلة الامتحان التي كنت تكتبها محفوظة ومستعادة بالكامل حتى لا تفقد عملك.
                </div>
              </div>
            </div>
            <div className="exam-draft-actions">
              <button
                type="button"
                className="exam-draft-btn-discard"
                onClick={handleDiscardDraft}
              >
                <i className="fas fa-trash-can" /> مسح المسودة والبدء من جديد
              </button>
              <button
                type="button"
                className="exam-draft-btn-dismiss"
                onClick={() => setDraftRestored(false)}
                title="إخفاء التنبيه"
              >
                <i className="fas fa-xmark" />
              </button>
            </div>
          </div>
        )}

        <div className="page-header">
          <button
            type="button"
            className="btn btn-outline page-header-back"
            onClick={() => navigate('/exams')}
          >
            <i className="fas fa-arrow-right"></i> العودة للامتحانات
          </button>
          <div className="page-header-text">
            <h1 className="page-title" style={{ margin: '0 0 6px' }}>إنشاء امتحان</h1>
            {lastAutoSaved && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                <span className="exam-draft-badge">
                  <span className="exam-draft-badge-dot" />
                  تم الحفظ تلقائياً ({lastAutoSaved})
                </span>
              </div>
            )}
          </div>
          <div className="page-header-spacer"></div>
        </div>

        <div className="form-group">
          <label htmlFor="examTitle">📝 عنوان الامتحان:</label>
          <input
            type="text"
            id="examTitle"
            value={examTitle}
            onChange={(e) => setExamTitle(e.target.value)}
            placeholder="مثلاً: حساب تفاضلي متقدم"
          />
        </div>

        <div className="form-group">
          <label htmlFor="targetAudience">🎯 فئة الجمهور المستهدف:</label>
          <select
            id="targetAudience"
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
          >
            <option value="stage">الدفعة بالكامل (Entire Stage)</option>
            <option value="group">مجموعة محددة (Specific Group)</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="examGrade">🎓 الصف الدراسي:</label>
          <select
            id="examGrade"
            value={examGrade}
            onChange={(e) => setExamGrade(e.target.value)}
          >
            {(gradesList || []).map((g) => {
              const uiKey = dbToUiGrade(g.id) || g.id
              return <option key={g.id} value={uiKey}>{g.name}</option>
            })}
            <option value="packages">باقات مدفوعة 📦</option>
          </select>
        </div>

        {targetAudience === 'group' && (
          <div className="form-group">
            <label htmlFor="targetGroupId">👥 المجموعة:</label>
            <select
              id="targetGroupId"
              value={targetGroupId}
              onChange={(e) => setTargetGroupId(e.target.value)}
            >
              <option value="">-- اختر المجموعة --</option>
              {availableGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            {availableGroups.length === 0 && (
              <p style={{ fontSize: 12.5, color: '#f59e0b', margin: '6px 0 0', fontWeight: 600 }}>
                ⚠️ لا توجد مجموعات مسجلة لهذا الصف الدراسي حالياً.
              </p>
            )}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="opensAt">📅 وقت وتاريخ فتح الامتحان (جدولة النشر):</label>
          <DateTimePicker
            id="opensAt"
            value={opensAt}
            onChange={(val) => setOpensAt(val)}
            placeholder="اختر موعد بدء الامتحان"
          />
        </div>

        <div className="form-group">
          <label htmlFor="examType">🏷️ نوع التقييم:</label>
          <select
            id="examType"
            value={examType}
            onChange={(e) => setExamType(e.target.value)}
          >
            <option value="exam">امتحان 📝</option>
            <option value="quiz">تسميع 📖</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="duration">⏰ مدة الامتحان (بالدقائق):</label>
          <input 
            type="number" 
            id="duration"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="مثلاً 60"
          />
          
          <div className="exam-settings">
            <div>
              <label htmlFor="maxAttempts">🔁 عدد المحاولات المسموحة:</label>
              <input 
                type="number" 
                id="maxAttempts"
                min="1"
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(parseInt(e.target.value, 10) || 1)}
              />
            </div>
            <div>
              <label htmlFor="availabilityValue">⏳ مدة توفر الامتحان:</label>
              <div className="availability-input-group">
                <input 
                  type="number" 
                  id="availabilityValue"
                  min="1"
                  value={availabilityValue}
                  onChange={(e) => setAvailabilityValue(parseInt(e.target.value, 10) || '')}
                  placeholder={availabilityUnit === 'hours' ? 'مثلاً 12' : 'مثلاً 3'}
                />
                <select
                  value={availabilityUnit}
                  onChange={(e) => {
                    const newUnit = e.target.value
                    setAvailabilityUnit(newUnit)
                    if (newUnit === 'hours' && availabilityUnit === 'days') {
                      if (availabilityValue === 3) setAvailabilityValue(12)
                    } else if (newUnit === 'days' && availabilityUnit === 'hours') {
                      if (availabilityValue === 12) setAvailabilityValue(3)
                    }
                  }}
                  className="availability-unit-select"
                >
                  <option value="hours">ساعات ⏱️</option>
                  <option value="days">أيام 📅</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="numQuestions">❓ عدد الأسئلة:</label>
          <p style={{
            fontSize: 12.5,
            color: 'var(--text-muted, #718096)',
            margin: '4px 0 8px',
            fontWeight: 600,
          }}>
            اختر طريقة الإضافة: أدخل عدداً وأضغط «إنشاء» لتجهيز عدة أسئلة فارغة دفعة واحدة،
            أو أضف سؤالاً واحداً في كل مرة بزر «➕ سؤال جديد».
          </p>
          <input
            type="number"
            id="numQuestions"
            value={numQuestions}
            onChange={(e) => setNumQuestions(e.target.value)}
            placeholder="مثلاً 3"
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <button className="btn" onClick={generateQuestions}>✨ إنشاء عدة أسئلة</button>
            <button
              className="btn"
              onClick={addSingleQuestion}
              style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
            >
              ➕ سؤال جديد
            </button>
          </div>
        </div>

        {showCopySection && (
          <div className="form-group copy-questions">
            <label htmlFor="questionsCopy">📋 إستيراد سريع (لصق عدة أسئلة دفعة واحدة):</label>
            <details
              open
              style={{
                margin: '4px 0 8px',
                padding: '10px 12px',
                background: 'rgba(34, 197, 94, 0.06)',
                border: '1px dashed rgba(34, 197, 94, 0.4)',
                borderRadius: 8,
                fontSize: 13,
                color: 'var(--text-secondary, #4a5568)',
              }}
            >
              <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#16a34a' }}>
                <i className="fas fa-wand-magic-sparkles"></i> طريقة الكتابة
              </summary>
              <div style={{ marginTop: 8, lineHeight: 1.8 }}>
                <div>اكتب كل سؤال في فقرة منفصلة، السطر الأول هو السؤال، والأسطر التالية هي الاختيارات.</div>
                <div>ضع <strong style={{ color: '#16a34a' }}>*</strong> في بداية الإجابة الصحيحة (يمكن وضعها قبل أكثر من اختيار في حالة الإجابة المتعددة).</div>
                <div>افصل بين الأسئلة بسطر فارغ. اختياري: ضع <code>!2</code> في آخر سطر لتحديد النقاط.</div>
                <div
                  style={{
                    marginTop: 8,
                    background: '#0f172a',
                    color: '#86efac',
                    padding: 12,
                    borderRadius: 6,
                    fontFamily: 'monospace',
                    fontSize: 13,
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.7,
                  }}
                >
{`ما عاصمة مصر؟
*القاهرة
الإسكندرية
الجيزة

ما ناتج 3 + 2؟
2
3
*5
4
!2`}
                </div>
              </div>
            </details>

            <textarea
              id="questionsCopy"
              value={questionsCopy}
              onChange={(e) => setQuestionsCopy(e.target.value)}
              placeholder={`ما عاصمة مصر؟\n*القاهرة\nالإسكندرية\nالجيزة\n\nما ناتج 3 + 2؟\n2\n3\n*5\n4`}
              dir="auto"
            />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
              <button type="button" className="btn" onClick={parseCopiedQuestions} style={{ marginTop: 0 }}>📥 استيراد الأسئلة</button>
              {questions.length > 0 && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleCopyAllQuestions}
                  style={{ marginTop: 0, padding: '12px 20px', fontSize: 14 }}
                  title="نسخ جميع الأسئلة الحالية بالتنسيق المطلوب"
                >
                  <i className="fas fa-copy"></i> نسخ جميع الأسئلة ({questions.length})
                </button>
              )}
            </div>
          </div>
        )}

        <div className="questions-container">
          {questions.map((q, i) => {
            const qDir = detectTextDir(q.question)
            return (
              <div key={q.id} className="question-block" dir={qDir}>
                <div className="question-controls">
                  <button className="btn-icon" onClick={() => addOption(q.id)}>
                    <i className="fas fa-plus"></i> إضافة اختيار
                  </button>
                  <button className="btn-icon" onClick={() => removeOption(q.id)}>
                    <i className="fas fa-minus"></i> حذف اختيار
                  </button>
                  <button
                    className={`btn-icon ${q.isMultiple ? 'active' : ''}`}
                    onClick={() => toggleMultipleAnswers(q.id)}
                  >
                    <i className="fas fa-check-double"></i> {q.isMultiple ? 'إجابة واحدة' : 'متعدد الإجابات'}
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => handleCopySingle(q)}
                    title="نسخ هذا السؤال"
                  >
                    <i className="fas fa-copy"></i> نسخ السؤال
                  </button>
                  <span className="points-wrap">
                    <span className="points-lbl">النقاط:</span>
                    <input
                      type="number"
                      min="1"
                      value={q.points}
                      onChange={(e) => updateQuestion(q.id, 'points', parseInt(e.target.value))}
                      className="points-input"
                    />
                  </span>
                  <button
                    className="btn-icon"
                    onClick={() => removeQuestion(q.id)}
                    title="حذف هذا السؤال"
                    style={{
                      marginInlineStart: 'auto',
                      color: '#dc2626',
                      borderColor: 'rgba(239, 68, 68, 0.35)',
                    }}
                  >
                    <i className="fas fa-trash"></i> حذف السؤال
                  </button>
                </div>

                <label>❓ السؤال {i + 1}:</label>
                <textarea
                  dir={qDir}
                  value={q.question}
                  onChange={(e) => updateQuestion(q.id, 'question', e.target.value)}
                  placeholder="اكتب السؤال هنا..."
                />

                <QuestionImagePicker
                  value={q.image}
                  onChange={(url) => updateQuestion(q.id, 'image', url)}
                />

                <label>📋 الاختيارات:</label>
                <div className="options-wrapper" dir={qDir}>
                  {q.options.map((opt, optIdx) => {
                    const optDir = detectTextDir(opt) || qDir
                    return (
                      <div key={optIdx} className="option-container" dir={optDir}>
                        <input 
                          type="text"
                          dir={optDir}
                          value={opt}
                          onChange={(e) => updateOption(q.id, optIdx, e.target.value)}
                          placeholder={`الخيار ${optIdx + 1}`}
                          className="option-input"
                        />
                      </div>
                    )
                  })}
                </div>

                <label>✅ الإجابة الصحيحة:</label>
                <div className="answers-wrapper" dir={qDir}>
                  {q.options.map((opt, optIdx) => {
                    const optDir = detectTextDir(opt) || qDir
                    return (
                      <div key={optIdx} dir={optDir}>
                        {q.isMultiple ? (
                          <>
                            <input 
                              type="checkbox"
                              id={`answer-${q.id}-${optIdx}`}
                              checked={q.answers.includes(optIdx)}
                              onChange={(e) => updateAnswer(q.id, optIdx, e.target.checked)}
                            />
                            <label htmlFor={`answer-${q.id}-${optIdx}`} dir={optDir}>{opt || `الخيار ${optIdx + 1}`}</label>
                          </>
                        ) : (
                          <>
                            <input 
                              type="radio"
                              name={`correct-answer-${q.id}`}
                              id={`answer-${q.id}-${optIdx}`}
                              checked={q.answers.includes(optIdx)}
                              onChange={(e) => {
                                if (e.target.checked) updateAnswer(q.id, optIdx, true)
                              }}
                            />
                            <label htmlFor={`answer-${q.id}-${optIdx}`} dir={optDir}>{opt || `الخيار ${optIdx + 1}`}</label>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {questions.length > 0 && (
          <>
            <button
              type="button"
              onClick={addSingleQuestion}
              className="exam-add-q-btn"
            >
              <i className="fas fa-plus"></i>
              <span>إضافة سؤال آخر</span>
            </button>

            {/* Shared reading passages — written right after the exam row is
                created, keyed to the questions above. */}
            <SharedTextBlocksEditor
              blocks={sharedBlocks}
              onChange={setSharedBlocks}
              questions={questions}
            />

            {/* Two distinct actions: preview-only (no DB write) and save.
                Splitting them lets the admin sanity-check before committing
                without the previous "save then bounce away" flash. */}
            <div className="exam-action-row">
              <button
                type="button"
                className="btn btn-preview"
                onClick={previewExam}
                disabled={saving}
              >
                <i className="fas fa-magnifying-glass"></i>
                <span>معاينة الامتحان</span>
              </button>
              <button
                type="button"
                className="btn btn-save"
                onClick={saveExam}
                disabled={saving}
              >
                <i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
                <span>{saving ? 'جاري الحفظ...' : 'حفظ الامتحان'}</span>
              </button>
            </div>
          </>
        )}

        {showSuccess && (
          <div className="success-message">
            🎉 تم حفظ الامتحان بنجاح! سيتم توجيهك إلى صفحة الامتحانات...
          </div>
        )}

        {showPreview && previewData && (
          <div className="preview">
            <h2><i className="fas fa-magnifying-glass" style={{ color: '#f59e0b', marginInlineEnd: 8 }}></i> المعاينة</h2>
            <h3>📝 {previewData.title}</h3>
            <p><strong>المرحلة الدراسية:</strong> {previewData.stageName}</p>
            <p>
              <strong>الجمهور المستهدف:</strong>{' '}
              {previewData.targetAudience === 'group'
                ? `مجموعة محددة (${previewData.targetGroupName || 'غير محددة'})`
                : 'الدفعة بالكامل'}
            </p>
            <p><strong>وقت فتح الامتحان:</strong> {previewData.opensAt}</p>
            <p>
              <strong>فترة الإتاحة:</strong>{' '}
              {previewData.availabilityUnit === 'hours'
                ? `${previewData.availabilityValue} ساعة`
                : `${previewData.availabilityValue} يوم`}
            </p>
            <p><strong>مدة الإجابة:</strong> {previewData.duration} دقيقة</p>
            <p><strong>عدد المحاولات:</strong> {previewData.maxAttempts}</p>
            <p><strong>إجمالي النقاط:</strong> {previewData.totalPoints}</p>
            <hr />
            {previewData.questions.map((q, idx) => {
              const qDir = detectTextDir(q.question)
              return (
                <div key={idx} className="question-block preview-question" dir={qDir}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <span className="et-q-badge et-q-num" style={{ marginInlineEnd: 8 }}>س {idx + 1}</span>
                      <span className="et-q-badge et-q-pts">{q.points || 1} نقطة</span>
                    </div>
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => handleCopySingle(q)}
                      title="نسخ السؤال"
                      style={{ padding: '4px 10px', fontSize: 12 }}
                    >
                      <i className="fas fa-copy"></i> نسخ
                    </button>
                  </div>
                  <div className="preview-q-text" dir={qDir} style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 14 }}>
                    {q.question}
                  </div>
                  {q.image && (
                    <div style={{ margin: '10px 0' }}>
                      <img src={q.image} alt="" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {q.options.map((opt, i) => {
                      const isCorrect = q.answers.includes(i)
                      const optDir = detectTextDir(opt) || qDir
                      const hasLetterPrefix = /^[a-zA-Zء-ي0-9٠-٩][\.\)\-]\s*/.test(opt)
                      const prefix = hasLetterPrefix ? '' : `${String.fromCharCode(65 + i)}. `
                      return (
                        <div 
                          key={i}
                          className={`preview-option ${isCorrect ? 'correct' : ''}`}
                          dir={optDir}
                          style={{ textAlign: optDir === 'ltr' ? 'left' : 'right' }}
                        >
                          <span dir={optDir}>
                            {isCorrect ? '* ' : ''}{prefix}{opt}
                          </span>
                          {isCorrect && <span dir="rtl" style={{ color: '#10b981', fontWeight: 700 }}> ✅ (إجابة صحيحة)</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
