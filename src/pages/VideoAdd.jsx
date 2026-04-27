import { useState, useEffect } from 'react'
import './VideoAdd.css'
import { notify } from '../utils/notify'
import { createVideo } from '@backend/videosApi'
import QuestionImagePicker from '../components/QuestionImagePicker'

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

// Pull a Google Drive file id out of a share URL. Patterns we accept:
//   https://drive.google.com/file/d/{ID}/view?usp=sharing
//   https://drive.google.com/open?id={ID}
//   https://drive.google.com/uc?id={ID}&export=download
//   bare {ID} (any non-empty string of allowed chars)
function extractDriveId(input) {
  if (!input) return ''
  const s = String(input).trim()
  // Bare id — Drive ids are typically 25-44 chars, A-Z a-z 0-9 _ -
  if (/^[A-Za-z0-9_-]{15,}$/.test(s)) return s
  try {
    const u = new URL(s)
    if (!u.hostname.includes('drive.google.com')) return ''
    const m = u.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/)
    if (m) return m[1]
    const idParam = u.searchParams.get('id')
    if (idParam) return idParam
  } catch { /* not a URL */ }
  return ''
}

// ── Inline quiz builder ───────────────────────────────────────
// Pre-video quizzes are STANDALONE — they are NOT pulled from the exams
// library and they do NOT show up in the exams report. Each quiz lives
// entirely on the video row itself (snapshotted into `videos.quizzes`).
const makeQuestion = () => ({
  qid: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  question: '',
  image: '',
  options: ['', ''],
  answers: [0],
  points: 1,
  isMultiple: false,
})

const makeQuiz = () => ({
  localId: `qz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  title: '',                // friendly name shown to the student
  scope: 'whole',           // 'whole' | 'part'
  partIndex: '',            // index into videoParts when scope === 'part'
  passingQuestions: '',     // questions that must be correct (default = all)
  maxAttempts: 1,           // tries before lockout
  questions: [makeQuestion()],
})

export default function VideoAdd() {
  const [videoTitle, setVideoTitle] = useState('')
  const [videoDescription, setVideoDescription] = useState('')
  const [videoGrade, setVideoGrade] = useState('first-prep')
  const [activeHours, setActiveHours] = useState(24)
  const [videoParts, setVideoParts] = useState([])
  const [numParts, setNumParts] = useState('')
  const [quizzes, setQuizzes] = useState([])
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

  const generateParts = () => {
    const count = parseInt(numParts)
    if (!count || count <= 0) {
      notify('يرجى إدخال عدد صحيح من الأجزاء', { type: 'warning' })
      return
    }

    const newParts = Array(count).fill(null).map((_, i) => ({
      id: i,
      title: '',
      source: 'youtube',         // 'youtube' | 'drive'
      videoId: '',                // YouTube id (when source='youtube')
      driveId: '',                // Drive file id (when source='drive')
      durationMinutes: '',        // admin-entered duration for Drive parts
      viewLimit: 3,
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

  // ── Per-question helpers (inline quiz builder) ────────────────
  // Each question lives on quizzes[i].questions[j]. We update by mapping the
  // owner quiz so React sees a fresh quizzes array on every change.
  const mapQuestions = (quizId, fn) =>
    setQuizzes(prev => prev.map(qz =>
      qz.localId === quizId ? { ...qz, questions: fn(qz.questions) } : qz
    ))

  const addQuestion = (quizId) =>
    mapQuestions(quizId, qs => [...qs, makeQuestion()])

  const removeQuestion = (quizId, qid) =>
    mapQuestions(quizId, qs => qs.length > 1 ? qs.filter(q => q.qid !== qid) : qs)

  const updateQuestionField = (quizId, qid, field, value) =>
    mapQuestions(quizId, qs => qs.map(q => q.qid === qid ? { ...q, [field]: value } : q))

  const addQuestionOption = (quizId, qid) =>
    mapQuestions(quizId, qs => qs.map(q =>
      q.qid === qid ? { ...q, options: [...q.options, ''] } : q
    ))

  const removeQuestionOption = (quizId, qid, optIdx) =>
    mapQuestions(quizId, qs => qs.map(q => {
      if (q.qid !== qid || q.options.length <= 2) return q
      const options = q.options.filter((_, i) => i !== optIdx)
      // Rebuild correct-answer indices around the removed option.
      const answers = q.answers
        .filter(a => a !== optIdx)
        .map(a => a > optIdx ? a - 1 : a)
      return { ...q, options, answers: answers.length ? answers : [0] }
    }))

  const updateQuestionOption = (quizId, qid, optIdx, value) =>
    mapQuestions(quizId, qs => qs.map(q => {
      if (q.qid !== qid) return q
      const options = q.options.map((o, i) => i === optIdx ? value : o)
      return { ...q, options }
    }))

  const toggleMultiple = (quizId, qid) =>
    mapQuestions(quizId, qs => qs.map(q => {
      if (q.qid !== qid) return q
      const isMultiple = !q.isMultiple
      // Switching back to single-answer collapses any extra picks down to
      // the first one selected (or default to option 0).
      const answers = isMultiple ? q.answers : [q.answers[0] ?? 0]
      return { ...q, isMultiple, answers }
    }))

  const setCorrectAnswer = (quizId, qid, optIdx, checked) =>
    mapQuestions(quizId, qs => qs.map(q => {
      if (q.qid !== qid) return q
      let answers
      if (q.isMultiple) {
        answers = checked
          ? Array.from(new Set([...q.answers, optIdx]))
          : q.answers.filter(a => a !== optIdx)
        if (answers.length === 0) answers = [optIdx] // can't have zero
      } else {
        answers = [optIdx]
      }
      return { ...q, answers }
    }))

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
      source: p.source || 'youtube',
      videoId: p.videoId || extractYouTubeId(p.videoUrl || ''),
      driveId: p.driveId || '',
      durationMinutes: p.durationMinutes || '',
      viewLimit: p.viewLimit ?? 3,
    }))

    setVideoParts(restoredParts)
    setNumParts(restoredParts.length.toString())

    // Restore quizzes — re-hydrate inline question rows so the admin can
    // tweak them. Older quizzes that referenced a now-removed exams library
    // entry are silently dropped.
    const restoredQuizzes = (video.quizzes || [])
      .filter(qz => Array.isArray(qz.questions) && qz.questions.length > 0)
      .map((qz) => ({
        localId: `qz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: qz.title || '',
        scope: qz.scope || 'whole',
        partIndex: qz.scope === 'part' ? (qz.partIndex ?? '') : '',
        passingQuestions: qz.passingQuestions ?? '',
        maxAttempts: qz.maxAttempts ?? 1,
        questions: qz.questions.map((q) => ({
          qid: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          question: q.question || '',
          image: q.image || '',
          options: Array.isArray(q.options) && q.options.length >= 2 ? [...q.options] : ['', ''],
          answers: Array.isArray(q.answers) && q.answers.length > 0 ? [...q.answers] : [0],
          points: Math.max(1, parseInt(q.points) || 1),
          isMultiple: !!q.isMultiple,
        })),
      }))
    setQuizzes(restoredQuizzes)

    setShowPreview(false)
  }

  const saveVideo = async () => {
    if (!videoTitle.trim()) {
      notify('يرجى إدخال عنوان الفيديو', { type: 'warning' })
      return
    }

    if (videoParts.length === 0 || videoParts.some(p => !p.title.trim())) {
      notify('يرجى ملء عنوان كل جزء', { type: 'warning' })
      return
    }
    // Validate per-source identifiers
    for (let i = 0; i < videoParts.length; i++) {
      const p = videoParts[i]
      if (p.source === 'drive') {
        if (!p.driveId || !p.driveId.trim()) {
          notify(`الجزء ${i + 1}: أدخل معرّف ملف Google Drive`, { type: 'warning' })
          return
        }
        if (!/^[A-Za-z0-9_-]{15,}$/.test(p.driveId.trim())) {
          notify(`الجزء ${i + 1}: معرّف Drive غير صالح`, { type: 'warning' })
          return
        }
      } else {
        if (!p.videoId || !p.videoId.trim()) {
          notify(`الجزء ${i + 1}: أدخل معرّف فيديو يوتيوب`, { type: 'warning' })
          return
        }
        if (!/^[a-zA-Z0-9_-]{11}$/.test(p.videoId.trim())) {
          notify(`الجزء ${i + 1}: معرّف يوتيوب غير صالح — تأكد أنه 11 حرفًا`, { type: 'warning' })
          return
        }
      }
    }

    // Validate quizzes (inline definitions — questions live on this video
    // only and are NOT shared with the exams library/report).
    const parsedQuizzes = []
    for (let i = 0; i < quizzes.length; i++) {
      const qz = quizzes[i]
      const label = `الامتحان ${i + 1}`
      const questions = Array.isArray(qz.questions) ? qz.questions : []
      if (questions.length === 0) {
        notify(`${label}: أضف سؤالاً واحداً على الأقل`, { type: 'warning' })
        return
      }
      // Per-question integrity
      for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi]
        if (!q.question.trim()) {
          notify(`${label} — السؤال ${qi + 1}: اكتب نص السؤال`, { type: 'warning' })
          return
        }
        if (q.options.length < 2 || q.options.some(o => !String(o).trim())) {
          notify(`${label} — السؤال ${qi + 1}: أدخل اختيارين على الأقل وكلها مكتوبة`, { type: 'warning' })
          return
        }
        if (!Array.isArray(q.answers) || q.answers.length === 0) {
          notify(`${label} — السؤال ${qi + 1}: حدد الإجابة الصحيحة`, { type: 'warning' })
          return
        }
      }
      if (qz.scope === 'part' && (qz.partIndex === '' || qz.partIndex == null)) {
        notify(`${label}: اختر الجزء المرتبط بالامتحان`, { type: 'warning' })
        return
      }
      const pqRaw = parseInt(qz.passingQuestions)
      const pq = Number.isNaN(pqRaw) ? questions.length : pqRaw
      if (pq < 1 || pq > questions.length) {
        notify(`${label}: عدد أسئلة النجاح يجب أن يكون بين 1 و ${questions.length}`, { type: 'warning' })
        return
      }
      const maxAttRaw = parseInt(qz.maxAttempts)
      const maxAtt = Number.isNaN(maxAttRaw) ? 1 : maxAttRaw
      if (maxAtt < 1) {
        notify(`${label}: عدد المحاولات يجب أن يكون 1 على الأقل`, { type: 'warning' })
        return
      }
      const cleanQuestions = questions.map(q => ({
        question: q.question.trim(),
        image: q.image || null,
        options: q.options.map(o => String(o).trim()),
        answers: [...q.answers].sort((a, b) => a - b),
        points: Math.max(1, parseInt(q.points) || 1),
        isMultiple: !!q.isMultiple,
      }))
      const totalPoints = cleanQuestions.reduce((s, q) => s + q.points, 0)
      parsedQuizzes.push({
        localId: qz.localId,
        title: qz.title.trim() || label,
        scope: qz.scope,
        partIndex: qz.scope === 'part' ? parseInt(qz.partIndex) : null,
        passingQuestions: pq,
        maxAttempts: maxAtt,
        questions: cleanQuestions,
        totalPoints,
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
        parts: videoParts.map(p => {
          const isDrive = p.source === 'drive'
          const mins = parseFloat(p.durationMinutes)
          return {
            title: p.title.trim(),
            source: isDrive ? 'drive' : 'youtube',
            youtube_id: isDrive ? null : p.videoId.trim(),
            drive_id:   isDrive ? p.driveId.trim() : null,
            duration_seconds: isDrive && mins > 0
              ? Math.round(mins * 60)
              : null,
            view_limit: p.viewLimit,
          }
        }),
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
        const questions = Array.isArray(qz.questions) ? qz.questions : []
        const pqRaw = parseInt(qz.passingQuestions)
        const pq = Number.isNaN(pqRaw) ? questions.length : pqRaw
        const maxAttRaw = parseInt(qz.maxAttempts)
        const maxAtt = Number.isNaN(maxAttRaw) ? 1 : maxAttRaw
        return {
          title: qz.title.trim() || `امتحان ${i + 1}`,
          scope: qz.scope,
          partIndex: qz.scope === 'part' ? qz.partIndex : null,
          passingQuestions: pq,
          maxAttempts: maxAtt,
          questionCount: questions.length,
          totalPoints: questions.reduce((s, q) => s + (parseInt(q.points) || 1), 0),
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

                    {/* Source picker — YouTube or Google Drive ──────── */}
                    <div className="form-group">
                      <label>مصدر الفيديو</label>
                      <div className="quiz-scope">
                        <label className={`quiz-scope-opt ${part.source === 'youtube' ? 'is-on' : ''}`}>
                          <input
                            type="radio"
                            name={`source-${part.id}`}
                            checked={part.source === 'youtube'}
                            onChange={() => updatePart(part.id, 'source', 'youtube')}
                          />
                          <i className="fab fa-youtube" style={{ color: '#ef4444' }}></i>
                          <span>YouTube</span>
                        </label>
                        <label className={`quiz-scope-opt ${part.source === 'drive' ? 'is-on' : ''}`}>
                          <input
                            type="radio"
                            name={`source-${part.id}`}
                            checked={part.source === 'drive'}
                            onChange={() => updatePart(part.id, 'source', 'drive')}
                          />
                          <i className="fab fa-google-drive" style={{ color: '#4285f4' }}></i>
                          <span>Google Drive</span>
                        </label>
                      </div>
                    </div>

                    {part.source === 'youtube' ? (
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
                    ) : (
                      <>
                        <div className="form-group">
                          <label>رابط أو معرّف ملف Google Drive</label>
                          <input
                            type="text"
                            placeholder="ألصق رابط Drive أو معرّف الملف"
                            value={part.driveId}
                            onChange={(e) => {
                              const v = e.target.value
                              const extracted = extractDriveId(v)
                              updatePart(part.id, 'driveId', extracted || v)
                            }}
                          />
                          <small style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6, display: 'block', marginTop: 4 }}>
                            <strong>مهم:</strong> يجب ضبط الملف في Drive على «أي شخص لديه الرابط يمكنه العرض».
                            سيتم استخراج المعرّف تلقائياً من الرابط. لا يوجد حد لحجم الفيديو — يبقى الملف في Drive ولا يستهلك مساحة Cloudflare.
                          </small>
                          {part.driveId && !/^[A-Za-z0-9_-]{15,}$/.test(part.driveId) && (
                            <small style={{ color: '#c53030', fontSize: 12 }}>
                              معرّف Drive غير صالح.
                            </small>
                          )}
                        </div>
                        <div className="form-group">
                          <label>مدة الفيديو (بالدقائق) — اختياري</label>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            placeholder="مثال: 12"
                            value={part.durationMinutes}
                            onChange={(e) => updatePart(part.id, 'durationMinutes', e.target.value)}
                          />
                          <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                            تُستخدم في تقرير المشاهدة. إن تركتها فارغة ستُحسب تلقائياً عند أول تشغيل للطالب.
                          </small>
                        </div>
                      </>
                    )}

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

            {/* ── Quizzes Section ─────────────────────────────────────
                 Inline pre-video quizzes. These are STANDALONE — they are
                 NOT pulled from the exams library and they do NOT appear in
                 the exams report. Each quiz is just questions stored on the
                 video itself, used purely to gate access to the part/video. */}
            <div className="quizzes-section">
              <div className="quizzes-head">
                <div>
                  <h3 className="section-title">📝 اختبار قبل المشاهدة (اختياري)</h3>
                  <p className="quizzes-hint">
                    أنشئ اختباراً سريعاً مرتبطاً بالفيديو فقط. هذه الاختبارات
                    مستقلة عن صفحة الامتحانات ولا تظهر في تقارير الامتحانات —
                    الغرض منها فتح المحتوى للطالب فقط.
                  </p>
                </div>
                <button className="btn btn-secondary" type="button" onClick={addQuiz}>
                  ➕ إضافة اختبار
                </button>
              </div>

              {quizzes.length === 0 && (
                <div className="quizzes-empty">
                  <i className="fas fa-circle-info"></i>
                  لا يوجد اختبارات. اضغط «إضافة اختبار» إذا رغبت في إلزام الطالب بحلّه قبل المشاهدة.
                </div>
              )}

              {quizzes.map((qz, qi) => {
                const questionCount = qz.questions.length
                const totalPts = qz.questions.reduce(
                  (s, q) => s + (parseInt(q.points) || 1), 0
                )
                return (
                  <div key={qz.localId} className="quiz-block">
                    <div className="quiz-block-head">
                      <span className="quiz-block-num">اختبار {qi + 1}</span>
                      <span className="quiz-block-meta">
                        {questionCount} سؤال · {totalPts} نقطة
                      </span>
                      <button
                        type="button"
                        className="quiz-remove"
                        onClick={() => removeQuiz(qz.localId)}
                        title="حذف الاختبار"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>

                    <div className="form-group">
                      <label>عنوان الاختبار</label>
                      <input
                        type="text"
                        placeholder="مثال: مراجعة سريعة قبل الجزء الأول"
                        value={qz.title}
                        onChange={(e) => updateQuiz(qz.localId, 'title', e.target.value)}
                      />
                    </div>

                    <div className="form-row">
                      <div className="form-group flex-1">
                        <label>نطاق الاختبار</label>
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
                        <label>الأسئلة المطلوبة للنجاح</label>
                        <input
                          type="number"
                          min="1"
                          max={Math.max(questionCount, 1)}
                          placeholder={String(questionCount)}
                          value={qz.passingQuestions}
                          onChange={(e) => updateQuiz(qz.localId, 'passingQuestions', e.target.value)}
                        />
                        <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          من إجمالي {questionCount} سؤال (الافتراضي: الكل)
                        </small>
                      </div>

                      <div className="form-group flex-1">
                        <label>عدد المحاولات</label>
                        <input
                          type="number"
                          min="1"
                          value={qz.maxAttempts}
                          onChange={(e) => updateQuiz(qz.localId, 'maxAttempts', e.target.value)}
                        />
                        <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          عدد المحاولات المسموح بها قبل القفل
                        </small>
                      </div>
                    </div>

                    {/* Inline questions builder */}
                    <div className="qb-questions">
                      <div className="qb-questions-head">
                        <h4 className="qb-questions-title">
                          <i className="fas fa-list-ul"></i> أسئلة الاختبار
                        </h4>
                        <button
                          type="button"
                          className="btn btn-secondary qb-add-q"
                          onClick={() => addQuestion(qz.localId)}
                        >
                          ➕ سؤال جديد
                        </button>
                      </div>

                      {qz.questions.map((q, qIdx) => (
                        <div key={q.qid} className="qb-question">
                          <div className="qb-q-head">
                            <span className="qb-q-num">{qIdx + 1}</span>
                            <input
                              type="text"
                              className="qb-q-text"
                              placeholder="اكتب نص السؤال هنا..."
                              value={q.question}
                              onChange={(e) => updateQuestionField(qz.localId, q.qid, 'question', e.target.value)}
                            />
                            <button
                              type="button"
                              className={`qb-mode-toggle ${q.isMultiple ? 'is-multi' : ''}`}
                              onClick={() => toggleMultiple(qz.localId, q.qid)}
                              title={q.isMultiple ? 'إجابة متعددة (اضغط لجعلها مفردة)' : 'إجابة مفردة (اضغط للسماح بإجابات متعددة)'}
                            >
                              <i className={`fas ${q.isMultiple ? 'fa-check-double' : 'fa-check'}`}></i>
                              {q.isMultiple ? ' متعدد' : ' مفرد'}
                            </button>
                            <div className="qb-points">
                              <label>النقاط</label>
                              <input
                                type="number"
                                min="1"
                                value={q.points}
                                onChange={(e) => updateQuestionField(qz.localId, q.qid, 'points',
                                  Math.max(1, parseInt(e.target.value) || 1)
                                )}
                              />
                            </div>
                            {qz.questions.length > 1 && (
                              <button
                                type="button"
                                className="qb-remove-q"
                                onClick={() => removeQuestion(qz.localId, q.qid)}
                                title="حذف السؤال"
                              >
                                <i className="fas fa-trash"></i>
                              </button>
                            )}
                          </div>

                          <QuestionImagePicker
                            value={q.image}
                            onChange={(url) => updateQuestionField(qz.localId, q.qid, 'image', url)}
                          />

                          <div className="qb-options">
                            {q.options.map((opt, oIdx) => {
                              const correct = q.answers.includes(oIdx)
                              return (
                                <div key={oIdx} className={`qb-option ${correct ? 'is-correct' : ''}`}>
                                  <button
                                    type="button"
                                    className={`qb-correct-btn ${correct ? 'is-on' : ''}`}
                                    onClick={() => setCorrectAnswer(qz.localId, q.qid, oIdx, !correct)}
                                    title={correct ? 'إجابة صحيحة (اضغط لإلغاء)' : 'اضغط لتحديدها كإجابة صحيحة'}
                                  >
                                    {q.isMultiple ? (
                                      <i className={`far ${correct ? 'fa-square-check' : 'fa-square'}`}></i>
                                    ) : (
                                      <i className={`far ${correct ? 'fa-circle-dot' : 'fa-circle'}`}></i>
                                    )}
                                  </button>
                                  <input
                                    type="text"
                                    className="qb-option-input"
                                    placeholder={`الاختيار ${oIdx + 1}`}
                                    value={opt}
                                    onChange={(e) => updateQuestionOption(qz.localId, q.qid, oIdx, e.target.value)}
                                  />
                                  {q.options.length > 2 && (
                                    <button
                                      type="button"
                                      className="qb-remove-opt"
                                      onClick={() => removeQuestionOption(qz.localId, q.qid, oIdx)}
                                      title="حذف الاختيار"
                                    >
                                      <i className="fas fa-xmark"></i>
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                            <button
                              type="button"
                              className="qb-add-opt"
                              onClick={() => addQuestionOption(qz.localId, q.qid)}
                            >
                              <i className="fas fa-plus"></i> إضافة اختيار
                            </button>
                            <p className="qb-hint">
                              <i className="fas fa-circle-info"></i>{' '}
                              {q.isMultiple
                                ? 'اضغط على المربعات بجانب كل إجابة صحيحة (يمكن اختيار أكثر من واحدة).'
                                : 'اضغط على الدائرة بجانب الإجابة الصحيحة.'}
                            </p>
                          </div>
                        </div>
                      ))}
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
                <i className="fas fa-floppy-disk"></i>
                <span>حفظ الفيديو</span>
              </button>
              <button className="btn btn-warning" onClick={showVideoPreview}>
                <i className="fas fa-magnifying-glass"></i>
                <span>معاينة الفيديو</span>
              </button>
              <button className="btn btn-danger" onClick={resetForm}>
                <i className="fas fa-arrows-rotate"></i>
                <span>إعادة تعيين</span>
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
                          <div className="part-duration">
                            {part.source === 'drive' ? 'Drive' : 'YouTube'}:{' '}
                            <code>{(part.source === 'drive' ? part.driveId : part.videoId) || '—'}</code>
                          </div>
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
