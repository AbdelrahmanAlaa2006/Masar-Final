import { useState, useEffect, useMemo } from 'react'
import './VideoAdd.css'
import { notify } from '../utils/notify'
import { createVideo } from '@backend/videosApi'
import { listExams } from '@backend/examsApi'

// Pull a YouTube video id out of any common share URL. If the user already
// pasted a bare 11-char id, keep it as-is.
function extractYouTubeId(input) {
  if (!input) return ''
  const s = String(input).trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s
  try {
    const u = new URL(s)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') return u.pathname.slice(1, 12)
    if (host.endsWith('youtube.com')) {
      if (u.pathname === '/watch') return (u.searchParams.get('v') || '').slice(0, 11)
      const m = u.pathname.match(/\/(embed|shorts|v)\/([a-zA-Z0-9_-]{11})/)
      if (m) return m[2]
    }
  } catch { /* not a URL */ }
  return ''
}

const makeQuiz = () => ({
  localId: `qz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  examId: '',               // id of the exam selected from the exams library
  scope: 'whole',           // 'whole' | 'part'
  partIndex: '',            // index into videoParts when scope === 'part'
  passingQuestions: '',     // how many questions the student must answer correctly (default = all)
  maxAttempts: '',          // tries before lockout (default = exam's max_attempts)
})

export default function VideoAdd() {
  const [videoTitle, setVideoTitle] = useState('')
  const [videoDescription, setVideoDescription] = useState('')
  const [videoGrade, setVideoGrade] = useState('first-prep')
  const [activeHours, setActiveHours] = useState(24)
  const [videoParts, setVideoParts] = useState([])
  const [numParts, setNumParts] = useState('')
  const [quizzes, setQuizzes] = useState([])
  const [examsLibrary, setExamsLibrary] = useState([])
  const [examsLoading, setExamsLoading] = useState(false)
  const [savedVideos, setSavedVideos] = useState([])
  const [showRestoreSection, setShowRestoreSection] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [selectedGrade] = useState(localStorage.getItem('selectedVideoGrade') || 'first-prep')

  useEffect(() => {
    loadSavedVideos()
    setVideoGrade(selectedGrade)
  }, [selectedGrade])

  // Load the exam library so the admin can pick a prerequisite exam.
  useEffect(() => {
    let cancelled = false
    setExamsLoading(true)
    listExams()
      .then(rows => { if (!cancelled) setExamsLibrary(rows || []) })
      .catch(() => { if (!cancelled) setExamsLibrary([]) })
      .finally(() => { if (!cancelled) setExamsLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Only show exams matching the video's grade (with a fallback to all if
  // the grade filter would empty the list — admins can still cross-grade).
  const examsForGrade = useMemo(
    () => examsLibrary.filter(e => e.grade === videoGrade),
    [examsLibrary, videoGrade]
  )
  const findExam = (id) => examsLibrary.find(e => e.id === id) || null

  const generateParts = () => {
    const count = parseInt(numParts)
    if (!count || count <= 0) {
      notify('يرجى إدخال عدد صحيح من الأجزاء', { type: 'warning' })
      return
    }

    const newParts = Array(count).fill(null).map((_, i) => ({
      id: i,
      title: '',
      videoId: '',
      viewLimit: 3, // default: each student gets 3 views per part
    }))

    setVideoParts(newParts)
    setShowRestoreSection(true)
  }

  const updatePart = (id, field, value) => {
    setVideoParts(videoParts.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  // ── Quiz helpers ──────────────────────────────────────────────
  const addQuiz = () => setQuizzes(prev => [...prev, makeQuiz()])
  const removeQuiz = (localId) =>
    setQuizzes(prev => prev.filter(q => q.localId !== localId))
  const updateQuiz = (localId, field, value) =>
    setQuizzes(prev => prev.map(q => q.localId === localId ? { ...q, [field]: value } : q))

  const loadSavedVideos = () => {
    const videos = JSON.parse(localStorage.getItem('videos')) || []
    setSavedVideos(videos)
  }

  const restoreVideo = (index) => {
    if (index === '') return
    
    const video = savedVideos[parseInt(index)]
    if (!video) return

    setVideoTitle(video.title)
    setVideoDescription(video.description)
    setActiveHours(video.activeHours || 24)
    setVideoGrade(video.grade)

    const restoredParts = video.parts.map((p, i) => ({
      id: i,
      title: p.title,
      videoId: p.videoId || extractYouTubeId(p.videoUrl || ''),
      viewLimit: p.viewLimit ?? 3,
    }))

    setVideoParts(restoredParts)
    setNumParts(restoredParts.length.toString())

    // Restore quizzes — only those that reference an existing exam in the
    // library survive the new picker-based flow.
    const restoredQuizzes = (video.quizzes || [])
      .filter(qz => qz.examId || qz.exam_id)
      .map((qz) => ({
        localId: `qz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        examId: qz.examId || qz.exam_id || '',
        scope: qz.scope || 'whole',
        partIndex: qz.scope === 'part' ? (qz.partIndex ?? '') : '',
        passingQuestions: qz.passingQuestions ?? '',
        maxAttempts: qz.maxAttempts ?? '',
      }))
    setQuizzes(restoredQuizzes)

    setShowPreview(false)
  }

  const saveVideo = async () => {
    if (!videoTitle.trim()) {
      notify('يرجى إدخال عنوان الفيديو', { type: 'warning' })
      return
    }

    if (videoParts.length === 0 || videoParts.some(p => !p.title.trim() || !p.videoId.trim())) {
      notify('يرجى ملء كل أجزاء الفيديو (العنوان و معرّف الفيديو)', { type: 'warning' })
      return
    }
    if (videoParts.some(p => !/^[a-zA-Z0-9_-]{11}$/.test(p.videoId.trim()))) {
      notify('معرّف يوتيوب غير صالح — تأكد أنه 11 حرفًا', { type: 'warning' })
      return
    }

    // Validate quizzes (each is a reference to an existing exam from the
    // library — we snapshot the exam's questions so QuizRunner keeps working
    // without needing a separate fetch at watch time).
    const parsedQuizzes = []
    for (let i = 0; i < quizzes.length; i++) {
      const qz = quizzes[i]
      const exam = findExam(qz.examId)
      if (!exam) {
        notify(`الامتحان ${i + 1}: اختر امتحانًا من القائمة`, { type: 'warning' })
        return
      }
      const questions = Array.isArray(exam.questions) ? exam.questions : []
      if (questions.length === 0) {
        notify(`الامتحان ${i + 1}: لا يحتوي الامتحان المحدد على أسئلة`, { type: 'warning' })
        return
      }
      if (qz.scope === 'part' && (qz.partIndex === '' || qz.partIndex === null || qz.partIndex === undefined)) {
        notify(`الامتحان ${i + 1}: اختر الجزء المرتبط بالامتحان`, { type: 'warning' })
        return
      }
      const pqRaw = parseInt(qz.passingQuestions)
      const pq = Number.isNaN(pqRaw) ? questions.length : pqRaw
      if (pq < 1 || pq > questions.length) {
        notify(`الامتحان ${i + 1}: عدد أسئلة النجاح يجب أن يكون بين 1 و ${questions.length}`, { type: 'warning' })
        return
      }
      const maxAttRaw = parseInt(qz.maxAttempts)
      const maxAtt = Number.isNaN(maxAttRaw) ? (exam.max_attempts || 1) : maxAttRaw
      if (maxAtt < 1) {
        notify(`الامتحان ${i + 1}: عدد المحاولات يجب أن يكون 1 على الأقل`, { type: 'warning' })
        return
      }
      parsedQuizzes.push({
        localId: qz.localId,
        examId: exam.id,
        title: exam.title || `امتحان ${i + 1}`,
        scope: qz.scope,
        partIndex: qz.scope === 'part' ? parseInt(qz.partIndex) : null,
        passingQuestions: pq,
        maxAttempts: maxAtt,
        questions,
        totalPoints: exam.total_points || questions.reduce((s, q) => s + (q.points || 1), 0),
      })
    }

    let createdBy = null
    try {
      const u = JSON.parse(sessionStorage.getItem('masar-user'))
      createdBy = u?.id || null
    } catch { /* ignore */ }

    try {
      await createVideo({
        title: videoTitle.trim(),
        description: videoDescription.trim() || null,
        grade: videoGrade,
        active_hours: activeHours,
        quizzes: parsedQuizzes,
        created_by: createdBy,
        parts: videoParts.map(p => ({
          title: p.title.trim(),
          youtube_id: p.videoId.trim(),
          view_limit: p.viewLimit,
        })),
      })
      setShowSuccess(true)
      setTimeout(() => {
        setShowSuccess(false)
        resetForm()
      }, 3000)
    } catch (err) {
      notify(err.message || 'تعذر حفظ الفيديو', { type: 'warning' })
    }
  }

  const resetForm = () => {
    setVideoTitle('')
    setVideoDescription('')
    setActiveHours(24)
    setVideoParts([])
    setNumParts('')
    setQuizzes([])
    setShowPreview(false)
  }

  const showVideoPreview = () => {
    if (!videoTitle.trim()) {
      notify('يرجى إدخال عنوان الفيديو', { type: 'warning' })
      return
    }

    if (videoParts.length === 0 || videoParts.some(p => !p.title.trim() || !p.videoId.trim())) {
      notify('يرجى ملء كل أجزاء الفيديو', { type: 'warning' })
      return
    }

    setPreviewData({
      title: videoTitle,
      description: videoDescription,
      grade: videoGrade,
      totalParts: videoParts.length,
      parts: videoParts,
      activeHours: parseInt(activeHours),
      quizzes: quizzes.map((qz, i) => {
        const exam = findExam(qz.examId)
        const questions = Array.isArray(exam?.questions) ? exam.questions : []
        const pqRaw = parseInt(qz.passingQuestions)
        const pq = Number.isNaN(pqRaw) ? questions.length : pqRaw
        const maxAttRaw = parseInt(qz.maxAttempts)
        const maxAtt = Number.isNaN(maxAttRaw) ? (exam?.max_attempts || 1) : maxAttRaw
        return {
          title: exam?.title || `امتحان ${i + 1}`,
          scope: qz.scope,
          partIndex: qz.scope === 'part' ? qz.partIndex : null,
          passingQuestions: pq,
          maxAttempts: maxAtt,
          questionCount: questions.length,
          totalPoints: exam?.total_points || questions.reduce((s, q) => s + (q.points || 1), 0),
        }
      })
    })

    setShowPreview(true)
  }

  const gradeNames = {
    'first-prep': 'الصف الأول الإعدادي',
    'second-prep': 'الصف الثاني الإعدادي',
    'third-prep': 'الصف الثالث الإعدادي'
  }

  return (
    <div className="video-add-page" dir="rtl">
      <div className="video-add-container">
        <div className="page-header">
          <h1 className="page-title">إضافة فيديو جديد</h1>
          <p className="page-subtitle">قم بإنشاء فيديو تعليمي جديد مع تعريف الأجزاء والتفاصيل</p>
        </div>

        <div className="video-add-content">
          {/* Left Side - Form */}
          <div className="form-section">
            <div className="form-group">
              <label>عنوان الفيديو</label>
              <input
                type="text"
                placeholder="أدخل عنوان الفيديو"
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>الوصف</label>
              <textarea
                placeholder="أدخل وصف الفيديو"
                value={videoDescription}
                onChange={(e) => setVideoDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="form-row">
              <div className="form-group flex-1">
                <label>الصف الدراسي</label>
                <select value={videoGrade} onChange={(e) => setVideoGrade(e.target.value)}>
                  <option value="first-prep">الصف الأول الإعدادي</option>
                  <option value="second-prep">الصف الثاني الإعدادي</option>
                  <option value="third-prep">الصف الثالث الإعدادي</option>
                </select>
              </div>

              <div className="form-group flex-1">
                <label>مدة التفعيل (ساعة)</label>
                <input
                  type="number"
                  min="1"
                  value={activeHours}
                  onChange={(e) => setActiveHours(e.target.value)}
                />
                <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  يمكن تعديلها لاحقاً من «لوحة التحكم».
                </small>
              </div>
            </div>

            <div className="form-group">
              <label>عدد الأجزاء</label>
              <div className="input-with-btn">
                <input
                  type="number"
                  placeholder="أدخل عدد الأجزاء"
                  value={numParts}
                  onChange={(e) => setNumParts(e.target.value)}
                  min="1"
                />
                <button className="btn btn-secondary" onClick={generateParts}>
                  إنشاء أجزاء
                </button>
              </div>
            </div>

            {/* Video Parts Section */}
            {videoParts.length > 0 && (
              <div className="parts-section">
                <h3 className="section-title">أجزاء الفيديو</h3>
                {videoParts.map((part, index) => (
                  <div key={part.id} className="part-block">
                    <div className="part-header">
                      <span className="part-number">الجزء {index + 1}</span>
                    </div>

                    <div className="form-group">
                      <label>عنوان الجزء</label>
                      <input
                        type="text"
                        placeholder="مثال: مقدمة الموضوع"
                        value={part.title}
                        onChange={(e) => updatePart(part.id, 'title', e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label>معرّف فيديو يوتيوب (Video ID)</label>
                      <input
                        type="text"
                        placeholder="مثال: dQw4w9WgXcQ"
                        value={part.videoId}
                        onChange={(e) => {
                          // Auto-extract id if admin pastes a full URL.
                          const v = e.target.value
                          const extracted = extractYouTubeId(v)
                          updatePart(part.id, 'videoId', extracted || v)
                        }}
                        maxLength={64}
                      />
                      <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        الجزء من الرابط بعد <code>v=</code> أو بعد <code>youtu.be/</code>. سيتم استخراج المعرّف تلقائياً إذا لصقت الرابط الكامل.
                      </small>
                      {part.videoId && !/^[a-zA-Z0-9_-]{11}$/.test(part.videoId) && (
                        <small style={{ color: '#c53030', fontSize: 12 }}>
                          المعرّف يجب أن يكون 11 حرفاً.
                        </small>
                      )}
                    </div>

                    <div className="form-group">
                      <label>عدد المحاولات لكل طالب</label>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={part.viewLimit ?? 3}
                        onChange={(e) => {
                          const n = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1))
                          updatePart(part.id, 'viewLimit', n)
                        }}
                      />
                      <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        كل طالب يستطيع مشاهدة هذا الجزء بهذا العدد من المرات.
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Quizzes Section ───────────────────────────────────── */}
            <div className="quizzes-section">
              <div className="quizzes-head">
                <div>
                  <h3 className="section-title">📝 امتحانات قبل المشاهدة</h3>
                  <p className="quizzes-hint">
                    اختر امتحانًا موجودًا من مكتبة الامتحانات يلزم الطالب اجتيازه قبل مشاهدة الفيديو.
                    تستطيع تحديد إن كان للفيديو كاملًا أو لجزء معيّن.
                  </p>
                </div>
                <button className="btn btn-secondary" type="button" onClick={addQuiz}>
                  ➕ إضافة امتحان
                </button>
              </div>

              {quizzes.length === 0 && (
                <div className="quizzes-empty">
                  <i className="fas fa-circle-info"></i>
                  لا يوجد امتحانات. اضغط «إضافة امتحان» لإنشاء أول امتحان.
                </div>
              )}

              {quizzes.map((qz, qi) => {
                const exam = findExam(qz.examId)
                const questionCount = Array.isArray(exam?.questions) ? exam.questions.length : 0
                const pts = exam?.total_points || (Array.isArray(exam?.questions)
                  ? exam.questions.reduce((s, q) => s + (q.points || 1), 0)
                  : 0)
                const usedExamIds = new Set(
                  quizzes.filter(q => q.localId !== qz.localId && q.examId).map(q => q.examId)
                )
                const options = examsForGrade.filter(e => !usedExamIds.has(e.id) || e.id === qz.examId)
                return (
                  <div key={qz.localId} className="quiz-block">
                    <div className="quiz-block-head">
                      <span className="quiz-block-num">امتحان {qi + 1}</span>
                      <button
                        type="button"
                        className="quiz-remove"
                        onClick={() => removeQuiz(qz.localId)}
                        title="حذف الامتحان"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>

                    <div className="form-group">
                      <label>اختر امتحانًا من المكتبة</label>
                      <select
                        value={qz.examId}
                        onChange={(e) => updateQuiz(qz.localId, 'examId', e.target.value)}
                      >
                        <option value="">
                          {examsLoading ? '... جاري التحميل' : '-- اختر امتحانًا --'}
                        </option>
                        {options.map(e => (
                          <option key={e.id} value={e.id}>
                            {e.number ? `#${e.number} — ` : ''}{e.title} ({(e.questions || []).length} سؤال)
                          </option>
                        ))}
                      </select>
                      {!examsLoading && examsForGrade.length === 0 && (
                        <small className="quiz-warn">
                          لا يوجد امتحانات لهذا الصف. أنشئ امتحانًا من صفحة «إضافة امتحان» أولاً.
                        </small>
                      )}
                      {exam && (
                        <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {questionCount} سؤال · {pts} نقطة · مدة {exam.duration_minutes} دقيقة
                        </small>
                      )}
                    </div>

                    <div className="form-row">
                      <div className="form-group flex-1">
                        <label>نطاق الامتحان</label>
                        <div className="quiz-scope">
                          <label className={`quiz-scope-opt ${qz.scope === 'whole' ? 'is-on' : ''}`}>
                            <input
                              type="radio"
                              name={`scope-${qz.localId}`}
                              checked={qz.scope === 'whole'}
                              onChange={() => updateQuiz(qz.localId, 'scope', 'whole')}
                            />
                            <i className="fas fa-film"></i>
                            <span>للفيديو كامل</span>
                          </label>
                          <label className={`quiz-scope-opt ${qz.scope === 'part' ? 'is-on' : ''}`}>
                            <input
                              type="radio"
                              name={`scope-${qz.localId}`}
                              checked={qz.scope === 'part'}
                              onChange={() => updateQuiz(qz.localId, 'scope', 'part')}
                            />
                            <i className="fas fa-puzzle-piece"></i>
                            <span>لجزء محدد</span>
                          </label>
                        </div>
                      </div>

                      {qz.scope === 'part' && (
                        <div className="form-group flex-1">
                          <label>الجزء المرتبط</label>
                          <select
                            value={qz.partIndex}
                            onChange={(e) => updateQuiz(qz.localId, 'partIndex', e.target.value)}
                          >
                            <option value="">-- اختر الجزء --</option>
                            {videoParts.map((p, i) => (
                              <option key={p.id} value={i}>
                                الجزء {i + 1}{p.title ? ` — ${p.title}` : ''}
                              </option>
                            ))}
                          </select>
                          {videoParts.length === 0 && (
                            <small className="quiz-warn">أنشئ أجزاء الفيديو أولاً</small>
                          )}
                        </div>
                      )}

                      <div className="form-group flex-1">
                        <label>عدد الأسئلة المطلوبة للنجاح</label>
                        <input
                          type="number"
                          min="1"
                          max={Math.max(questionCount, 1)}
                          placeholder={questionCount ? String(questionCount) : ''}
                          value={qz.passingQuestions}
                          onChange={(e) => updateQuiz(qz.localId, 'passingQuestions', e.target.value)}
                        />
                        <small className="quiz-warn" style={{ color: 'var(--text-muted)' }}>
                          {questionCount ? `من إجمالي ${questionCount} سؤال` : 'سيُحدد بعد اختيار الامتحان'}
                        </small>
                      </div>

                      <div className="form-group flex-1">
                        <label>عدد المحاولات المسموح بها</label>
                        <input
                          type="number"
                          min="1"
                          placeholder={exam?.max_attempts ? String(exam.max_attempts) : ''}
                          value={qz.maxAttempts}
                          onChange={(e) => updateQuiz(qz.localId, 'maxAttempts', e.target.value)}
                        />
                        <small className="quiz-warn" style={{ color: 'var(--text-muted)' }}>
                          {exam?.max_attempts
                            ? `الافتراضي من الامتحان: ${exam.max_attempts}`
                            : 'عدد مرات محاولة الطالب قبل القفل'}
                        </small>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Restore Section */}
            {showRestoreSection && savedVideos.length > 0 && (
              <div className="restore-section">
                <h3 className="section-title">📁 استعادة فيديو محفوظ</h3>
                <select
                  defaultValue=""
                  onChange={(e) => restoreVideo(e.target.value)}
                  className="restore-select"
                >
                  <option value="">-- اختر فيديو محفوظ --</option>
                  {savedVideos.map((video, index) => (
                    <option key={index} value={index}>
                      {video.title} - {gradeNames[video.grade]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Action Buttons */}
            <div className="action-buttons">
              <button className="btn btn-success" onClick={saveVideo}>
                💾 حفظ الفيديو
              </button>
              <button className="btn btn-warning" onClick={showVideoPreview}>
                👁️ معاينة الفيديو
              </button>
              <button className="btn btn-danger" onClick={resetForm}>
                🔄 إعادة تعيين
              </button>
            </div>
          </div>

          {/* Right Side - Preview */}
          {showPreview && previewData && (
            <div className="preview-section">
              <div className="preview-card">
                <h2 className="preview-title">معاينة الفيديو</h2>
                <div className="preview-content">
                  <div className="info-row">
                    <span className="info-label">العنوان:</span>
                    <span className="info-value">{previewData.title}</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">الوصف:</span>
                    <span className="info-value">{previewData.description || 'لا يوجد وصف'}</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">الصف:</span>
                    <span className="info-value">{gradeNames[previewData.grade]}</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">عدد الأجزاء:</span>
                    <span className="info-value">{previewData.totalParts}</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">مدة التفعيل:</span>
                    <span className="info-value">{previewData.activeHours} ساعة</span>
                  </div>

                  {previewData.quizzes && previewData.quizzes.length > 0 && (
                    <div className="parts-list">
                      <h4>الامتحانات:</h4>
                      {previewData.quizzes.map((qz, i) => (
                        <div key={i} className="part-item">
                          <span className="part-index">📝 {qz.title}</span>
                          <div className="part-details">
                            <div>
                              {qz.scope === 'whole'
                                ? 'يُطلب قبل مشاهدة الفيديو كامل'
                                : `يُطلب قبل الجزء ${parseInt(qz.partIndex) + 1}`}
                            </div>
                            <div className="part-duration">
                              {qz.questionCount} سؤال · {qz.totalPoints} نقطة · النجاح: {qz.passingQuestions} من {qz.questionCount} · {qz.maxAttempts} محاولة
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="parts-list">
                    <h4>أجزاء الفيديو:</h4>
                    {previewData.parts.map((part, index) => (
                      <div key={index} className="part-item">
                        <span className="part-index">الجزء {index + 1}:</span>
                        <div className="part-details">
                          <div>{part.title}</div>
                          <div className="part-duration">معرّف: <code>{part.videoId || '—'}</code></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Success Message */}
        {showSuccess && (
          <div className="success-message">
            <div className="success-content">
              <span className="success-icon">✅</span>
              <p>تم حفظ الفيديو بنجاح!</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
