import { useState, useEffect } from 'react'
import { parseQuestionsText, validateQuestions, totalPoints } from '../utils/parseQuestions'
import './VideoAdd.css'
import { notify } from '../utils/notify'

const makeQuiz = () => ({
  localId: `qz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  title: '',
  scope: 'whole',           // 'whole' | 'part'
  partIndex: '',            // index into videoParts when scope === 'part'
  passingQuestions: 1,      // how many questions the student must answer correctly
  maxAttempts: 3,           // how many tries the student gets before they're locked out
  raw: ''
})

export default function VideoAdd() {
  const [videoTitle, setVideoTitle] = useState('')
  const [videoDescription, setVideoDescription] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoDuration, setVideoDuration] = useState('')
  const [videoGrade, setVideoGrade] = useState('first-prep')
  const [viewLimit, setViewLimit] = useState(3)
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
      videoUrl: '',
      duration: ''
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
    setVideoDuration(video.duration || '')
    setViewLimit(video.viewLimit || 3)
    setActiveHours(video.activeHours || 24)
    setVideoGrade(video.grade)

    const restoredParts = video.parts.map((p, i) => ({
      id: i,
      title: p.title,
      videoUrl: p.videoUrl,
      duration: p.duration
    }))

    setVideoParts(restoredParts)
    setNumParts(restoredParts.length.toString())

    // Restore quizzes (back-compat: older saved videos may have no quizzes)
    const restoredQuizzes = (video.quizzes || []).map((qz) => ({
      localId: `qz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: qz.title || '',
      scope: qz.scope || 'whole',
      partIndex: qz.scope === 'part' ? (qz.partIndex ?? '') : '',
      passingQuestions: qz.passingQuestions ?? Math.max(1, Math.ceil((qz.questions?.length || 1) * (qz.passingPercentage || 60) / 100)),
      maxAttempts: qz.maxAttempts ?? 3,
      raw: qz.raw || ''
    }))
    setQuizzes(restoredQuizzes)

    setShowPreview(false)
  }

  const saveVideo = () => {
    if (!videoTitle.trim()) {
      notify('يرجى إدخال عنوان الفيديو', { type: 'warning' })
      return
    }

    if (videoParts.length === 0 || videoParts.some(p => !p.title.trim() || !p.videoUrl.trim())) {
      notify('يرجى ملء كل أجزاء الفيديو (العنوان والرابط)', { type: 'warning' })
      return
    }

    // Validate & parse quizzes
    const parsedQuizzes = []
    for (let i = 0; i < quizzes.length; i++) {
      const qz = quizzes[i]
      if (!qz.raw.trim()) {
        alert(`الامتحان ${i + 1} فارغ — أضف الأسئلة أو احذف الامتحان`)
        return
      }
      const parsed = parseQuestionsText(qz.raw)
      const v = validateQuestions(parsed)
      if (!v.valid) {
        alert(`الامتحان ${i + 1}: ${v.error}`)
        return
      }
      const pq = parseInt(qz.passingQuestions)
      if (Number.isNaN(pq) || pq < 1) {
        alert(`الامتحان ${i + 1}: عدد أسئلة النجاح يجب أن يكون 1 على الأقل`)
        return
      }
      if (pq > parsed.length) {
        alert(`الامتحان ${i + 1}: عدد أسئلة النجاح (${pq}) أكبر من عدد الأسئلة (${parsed.length})`)
        return
      }
      if (qz.scope === 'part' && (qz.partIndex === '' || qz.partIndex === null || qz.partIndex === undefined)) {
        alert(`الامتحان ${i + 1}: اختر الجزء المرتبط بالامتحان`)
        return
      }
      const maxAtt = parseInt(qz.maxAttempts)
      if (Number.isNaN(maxAtt) || maxAtt < 1) {
        alert(`الامتحان ${i + 1}: عدد المحاولات يجب أن يكون 1 على الأقل`)
        return
      }
      parsedQuizzes.push({
        localId: qz.localId,
        title: qz.title.trim() || `امتحان ${i + 1}`,
        scope: qz.scope,
        partIndex: qz.scope === 'part' ? parseInt(qz.partIndex) : null,
        passingQuestions: pq,
        maxAttempts: maxAtt,
        questions: parsed,
        totalPoints: totalPoints(parsed),
        raw: qz.raw
      })
    }

    const newVideo = {
      id: Date.now().toString(),
      title: videoTitle,
      description: videoDescription,
      grade: videoGrade,
      duration: videoDuration,
      totalParts: videoParts.length,
      parts: videoParts,
      viewLimit: parseInt(viewLimit),
      activeHours: parseInt(activeHours),
      expiryTime: new Date(Date.now() + parseInt(activeHours) * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      quizzes: parsedQuizzes
    }

    const videos = JSON.parse(localStorage.getItem('videos')) || []
    videos.push(newVideo)
    localStorage.setItem('videos', JSON.stringify(videos))

    setShowSuccess(true)
    setTimeout(() => {
      setShowSuccess(false)
      resetForm()
    }, 3000)
  }

  const resetForm = () => {
    setVideoTitle('')
    setVideoDescription('')
    setVideoUrl('')
    setVideoDuration('')
    setViewLimit(3)
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

    if (videoParts.length === 0 || videoParts.some(p => !p.title.trim() || !p.videoUrl.trim())) {
      notify('يرجى ملء كل أجزاء الفيديو', { type: 'warning' })
      return
    }

    setPreviewData({
      title: videoTitle,
      description: videoDescription,
      grade: videoGrade,
      duration: videoDuration,
      totalParts: videoParts.length,
      parts: videoParts,
      viewLimit: parseInt(viewLimit),
      activeHours: parseInt(activeHours),
      quizzes: quizzes.map((qz, i) => {
        const parsed = parseQuestionsText(qz.raw)
        return {
          title: qz.title.trim() || `امتحان ${i + 1}`,
          scope: qz.scope,
          partIndex: qz.scope === 'part' ? qz.partIndex : null,
          passingQuestions: qz.passingQuestions,
          maxAttempts: qz.maxAttempts,
          questionCount: parsed.length,
          totalPoints: totalPoints(parsed)
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
                <label>المدة الكلية (دقيقة)</label>
                <input
                  type="number"
                  placeholder="مثال: 45"
                  value={videoDuration}
                  onChange={(e) => setVideoDuration(e.target.value)}
                />
              </div>

              <div className="form-group flex-1">
                <label>الصف الدراسي</label>
                <select value={videoGrade} onChange={(e) => setVideoGrade(e.target.value)}>
                  <option value="first-prep">الصف الأول الإعدادي</option>
                  <option value="second-prep">الصف الثاني الإعدادي</option>
                  <option value="third-prep">الصف الثالث الإعدادي</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group flex-1">
                <label>حد المشاهدات (عدد المحاولات)</label>
                <input
                  type="number"
                  min="1"
                  value={viewLimit}
                  onChange={(e) => setViewLimit(e.target.value)}
                />
              </div>

              <div className="form-group flex-1">
                <label>مدة التفعيل (ساعة)</label>
                <input
                  type="number"
                  min="1"
                  value={activeHours}
                  onChange={(e) => setActiveHours(e.target.value)}
                />
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
                      <label>رابط الفيديو (YouTube)</label>
                      <input
                        type="text"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={part.videoUrl}
                        onChange={(e) => updatePart(part.id, 'videoUrl', e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label>مدة الجزء (دقيقة)</label>
                      <input
                        type="number"
                        placeholder="مثال: 15"
                        value={part.duration}
                        onChange={(e) => updatePart(part.id, 'duration', e.target.value)}
                      />
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
                    أضف امتحان أو أكثر يلزم الطالب اجتيازه قبل مشاهدة الفيديو.
                    اختر إن كان للفيديو كاملًا أو لجزء معيّن، وحدد نسبة النجاح.
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
                const parsed = parseQuestionsText(qz.raw)
                const pts = totalPoints(parsed)
                const valid = validateQuestions(parsed)
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
                      <label>عنوان الامتحان</label>
                      <input
                        type="text"
                        placeholder="مثال: امتحان قبلي على المقدمة"
                        value={qz.title}
                        onChange={(e) => updateQuiz(qz.localId, 'title', e.target.value)}
                      />
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
                          max={Math.max(parsed.length, 1)}
                          value={qz.passingQuestions}
                          onChange={(e) => updateQuiz(qz.localId, 'passingQuestions', e.target.value)}
                        />
                        <small className="quiz-warn" style={{ color: 'var(--text-muted)' }}>
                          من إجمالي {parsed.length} سؤال
                        </small>
                      </div>

                      <div className="form-group flex-1">
                        <label>عدد المحاولات المسموح بها</label>
                        <input
                          type="number"
                          min="1"
                          value={qz.maxAttempts}
                          onChange={(e) => updateQuiz(qz.localId, 'maxAttempts', e.target.value)}
                        />
                        <small className="quiz-warn" style={{ color: 'var(--text-muted)' }}>
                          عدد مرات محاولة الطالب قبل القفل
                        </small>
                      </div>
                    </div>

                    <div className="form-group">
                      <label>الأسئلة</label>
                      <textarea
                        className="quiz-textarea"
                        rows={10}
                        dir="rtl"
                        placeholder={`@ ما ناتج 3 + 2؟\n# 4\n## 5\n# 6\n!2\n\n@ اختر الإجابات الصحيحة\n## أ\n# ب\n## ج`}
                        value={qz.raw}
                        onChange={(e) => updateQuiz(qz.localId, 'raw', e.target.value)}
                      />
                      <div className="quiz-syntax">
                        <span><code>@</code> سؤال جديد</span>
                        <span><code>#</code> اختيار</span>
                        <span><code>##</code> إجابة صحيحة</span>
                        <span><code>!2</code> نقاط السؤال</span>
                      </div>
                      <div className="quiz-stats">
                        <span className="quiz-stat">
                          <i className="fas fa-list-ol"></i> {parsed.length} سؤال
                        </span>
                        <span className="quiz-stat">
                          <i className="fas fa-star"></i> {pts} نقطة
                        </span>
                        {qz.raw.trim() && !valid.valid && (
                          <span className="quiz-stat quiz-stat-bad">
                            <i className="fas fa-triangle-exclamation"></i> {valid.error}
                          </span>
                        )}
                        {qz.raw.trim() && valid.valid && (
                          <span className="quiz-stat quiz-stat-ok">
                            <i className="fas fa-check"></i> الصيغة صحيحة
                          </span>
                        )}
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
                    <span className="info-label">المدة الكلية:</span>
                    <span className="info-value">{previewData.duration || 'غير محددة'} دقيقة</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">عدد الأجزاء:</span>
                    <span className="info-value">{previewData.totalParts}</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">حد المشاهدات:</span>
                    <span className="info-value">{previewData.viewLimit} مرات</span>
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
                          <div className="part-duration">المدة: {part.duration || 'غير محددة'} دقيقة</div>
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
