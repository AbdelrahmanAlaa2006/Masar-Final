import { useState, useEffect } from 'react'
import { parseQuestionsText, validateQuestions, totalPoints } from '../utils/parseQuestions'
import './VideoAdd.css'
import { notify } from '../utils/notify'
import { createVideo } from '@backend/videosApi'
import { useI18n } from '../i18n'

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
  title: '',
  scope: 'whole',           // 'whole' | 'part'
  partIndex: '',            // index into videoParts when scope === 'part'
  passingQuestions: 1,      // how many questions the student must answer correctly
  maxAttempts: 3,           // how many tries the student gets before they're locked out
  raw: ''
})

export default function VideoAdd() {
  const { t, lang } = useI18n()
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

  const saveVideo = async () => {
    if (!videoTitle.trim()) {
      notify(t('videoAdd.errTitle'), { type: 'warning' })
      return
    }

    if (videoParts.length === 0 || videoParts.some(p => !p.title.trim() || !p.videoId.trim())) {
      notify(t('videoAdd.errParts'), { type: 'warning' })
      return
    }
    if (videoParts.some(p => !/^[a-zA-Z0-9_-]{11}$/.test(p.videoId.trim()))) {
      notify(t('videoAdd.errYoutube'), { type: 'warning' })
      return
    }

    // Validate & parse quizzes
    const parsedQuizzes = []
    for (let i = 0; i < quizzes.length; i++) {
      const qz = quizzes[i]
      if (!qz.raw.trim()) {
        alert(t('videoAdd.errQuizEmpty').replace('{i}', i + 1))
        return
      }
      const parsed = parseQuestionsText(qz.raw)
      const v = validateQuestions(parsed)
      if (!v.valid) {
        alert(t('videoAdd.errQuizSyntax').replace('{i}', i + 1).replace('{error}', v.error))
        return
      }
      const pq = parseInt(qz.passingQuestions)
      if (Number.isNaN(pq) || pq < 1) {
        alert(t('videoAdd.errQuizMinPass').replace('{i}', i + 1))
        return
      }
      if (pq > parsed.length) {
        alert(t('videoAdd.errQuizMaxPass').replace('{i}', i + 1).replace('{pq}', pq).replace('{len}', parsed.length))
        return
      }
      if (qz.scope === 'part' && (qz.partIndex === '' || qz.partIndex === null || qz.partIndex === undefined)) {
        alert(t('videoAdd.errQuizNoPart').replace('{i}', i + 1))
        return
      }
      const maxAtt = parseInt(qz.maxAttempts)
      if (Number.isNaN(maxAtt) || maxAtt < 1) {
        alert(t('videoAdd.errQuizMinAttempts').replace('{i}', i + 1))
        return
      }
      parsedQuizzes.push({
        localId: qz.localId,
        title: qz.title.trim() || t('videoAdd.quizIndex').replace('{index}', i + 1),
        scope: qz.scope,
        partIndex: qz.scope === 'part' ? parseInt(qz.partIndex) : null,
        passingQuestions: pq,
        maxAttempts: maxAtt,
        questions: parsed,
        totalPoints: totalPoints(parsed),
        raw: qz.raw
      })
    }

    let createdBy = null
    try {
      const u = JSON.parse(localStorage.getItem('masar-user'))
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
      notify(err.message || t('videoAdd.errSave'), { type: 'warning' })
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
      notify(t('videoAdd.errTitle'), { type: 'warning' })
      return
    }

    if (videoParts.length === 0 || videoParts.some(p => !p.title.trim() || !p.videoId.trim())) {
      notify(t('videoAdd.errParts'), { type: 'warning' })
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
        const parsed = parseQuestionsText(qz.raw)
        return {
          title: qz.title.trim() || t('videoAdd.quizIndex').replace('{index}', i + 1),
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
    'first-prep': t('grades.first'),
    'second-prep': t('grades.second'),
    'third-prep': t('grades.third')
  }

  return (
    <div className="video-add-page" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="video-add-container">
        <div className="page-header">
          <h1 className="page-title">{t('videoAdd.title')}</h1>
          <p className="page-subtitle">{t('videoAdd.subtitle')}</p>
        </div>

        <div className="video-add-content">
          {/* Left Side - Form */}
          <div className="form-section">
            <div className="form-group">
              <label>{t('videoAdd.videoTitleLabel')}</label>
              <input
                type="text"
                placeholder={t('videoAdd.videoTitlePlaceholder')}
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>{t('common.noDescription')}</label>
              <textarea
                placeholder={t('videoAdd.descPlaceholder')}
                value={videoDescription}
                onChange={(e) => setVideoDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="form-row">
              <div className="form-group flex-1">
                <label>{t('profile.grade')}</label>
                <select value={videoGrade} onChange={(e) => setVideoGrade(e.target.value)}>
                  <option value="first-prep">{t('grades.first')}</option>
                  <option value="second-prep">{t('grades.second')}</option>
                  <option value="third-prep">{t('grades.third')}</option>
                </select>
              </div>

              <div className="form-group flex-1">
                <label>{t('videoAdd.activeHoursLabel')}</label>
                <input
                  type="number"
                  min="1"
                  value={activeHours}
                  onChange={(e) => setActiveHours(e.target.value)}
                />
                <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {t('videoAdd.activeHoursHint')}
                </small>
              </div>
            </div>

            <div className="form-group">
              <label>{t('videoAdd.numPartsLabel')}</label>
              <div className="input-with-btn">
                <input
                  type="number"
                  placeholder={t('videoAdd.numPartsPlaceholder')}
                  value={numParts}
                  onChange={(e) => setNumParts(e.target.value)}
                  min="1"
                />
                <button className="btn btn-secondary" onClick={generateParts}>
                  {t('videoAdd.generateParts')}
                </button>
              </div>
            </div>

            {/* Video Parts Section */}
            {videoParts.length > 0 && (
              <div className="parts-section">
                <h3 className="section-title">{t('videoAdd.videoPartsLabel')}</h3>
                {videoParts.map((part, index) => (
                  <div key={part.id} className="part-block">
                    <div className="part-header">
                      <span className="part-number">{t('videoAdd.partIndex').replace('{index}', index + 1)}</span>
                    </div>

                    <div className="form-group">
                      <label>{t('videoAdd.partTitleLabel')}</label>
                      <input
                        type="text"
                        placeholder={t('videoAdd.partTitlePlaceholder')}
                        value={part.title}
                        onChange={(e) => updatePart(part.id, 'title', e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label>{t('videoAdd.youtubeIdLabel')}</label>
                      <input
                        type="text"
                        placeholder={t('videoAdd.youtubeIdPlaceholder')}
                        value={part.videoId}
                        onChange={(e) => {
                          const v = e.target.value
                          const extracted = extractYouTubeId(v)
                          updatePart(part.id, 'videoId', extracted || v)
                        }}
                        maxLength={64}
                      />
                      <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {t('videoAdd.youtubeIdHint')}
                      </small>
                      {part.videoId && !/^[a-zA-Z0-9_-]{11}$/.test(part.videoId) && (
                        <small style={{ color: '#c53030', fontSize: 12 }}>
                          {t('videoAdd.youtubeIdError')}
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
                  <h3 className="section-title">{t('videoAdd.quizzesTitle')}</h3>
                  <p className="quizzes-hint">
                    {t('videoAdd.quizzesHint')}
                  </p>
                </div>
                <button className="btn btn-secondary" type="button" onClick={addQuiz}>
                  {t('videoAdd.addQuiz')}
                </button>
              </div>

              {quizzes.length === 0 && (
                <div className="quizzes-empty">
                  <i className="fas fa-circle-info"></i>
                  {t('videoAdd.noQuizzes')}
                </div>
              )}

              {quizzes.map((qz, qi) => {
                const parsed = parseQuestionsText(qz.raw)
                const pts = totalPoints(parsed)
                const valid = validateQuestions(parsed)
                return (
                  <div key={qz.localId} className="quiz-block">
                    <div className="quiz-block-head">
                      <span className="quiz-block-num">{t('videoAdd.quizIndex').replace('{index}', qi + 1)}</span>
                      <button
                        type="button"
                        className="quiz-remove"
                        onClick={() => removeQuiz(qz.localId)}
                        title={t('videoAdd.removeQuiz')}
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>

                    <div className="form-group">
                      <label>{t('videoAdd.quizTitleLabel')}</label>
                      <input
                        type="text"
                        placeholder={t('videoAdd.quizTitlePlaceholder')}
                        value={qz.title}
                        onChange={(e) => updateQuiz(qz.localId, 'title', e.target.value)}
                      />
                    </div>

                    <div className="form-row">
                      <div className="form-group flex-1">
                        <label>{t('videoAdd.quizScopeLabel')}</label>
                        <div className="quiz-scope">
                          <label className={`quiz-scope-opt ${qz.scope === 'whole' ? 'is-on' : ''}`}>
                            <input
                              type="radio"
                              name={`scope-${qz.localId}`}
                              checked={qz.scope === 'whole'}
                              onChange={() => updateQuiz(qz.localId, 'scope', 'whole')}
                            />
                            <i className="fas fa-film"></i>
                            <span>{t('videoAdd.scopeWhole')}</span>
                          </label>
                          <label className={`quiz-scope-opt ${qz.scope === 'part' ? 'is-on' : ''}`}>
                            <input
                              type="radio"
                              name={`scope-${qz.localId}`}
                              checked={qz.scope === 'part'}
                              onChange={() => updateQuiz(qz.localId, 'scope', 'part')}
                            />
                            <i className="fas fa-puzzle-piece"></i>
                            <span>{t('videoAdd.scopePart')}</span>
                          </label>
                        </div>
                      </div>

                      {qz.scope === 'part' && (
                        <div className="form-group flex-1">
                          <label>{t('videoAdd.relatedPartLabel')}</label>
                          <select
                            value={qz.partIndex}
                            onChange={(e) => updateQuiz(qz.localId, 'partIndex', e.target.value)}
                          >
                            <option value="">{t('videoAdd.selectPartOption')}</option>
                            {videoParts.map((p, i) => (
                              <option key={p.id} value={i}>
                                {t('videoAdd.partIndex').replace('{index}', i + 1)}{p.title ? ` — ${p.title}` : ''}
                              </option>
                            ))}
                          </select>
                          {videoParts.length === 0 && (
                            <small className="quiz-warn">{t('videoAdd.warnCreatePartsFirst')}</small>
                          )}
                        </div>
                      )}

                      <div className="form-group flex-1">
                        <label>{t('videoAdd.passingScoreLabel')}</label>
                        <input
                          type="number"
                          min="1"
                          max={Math.max(parsed.length, 1)}
                          value={qz.passingQuestions}
                          onChange={(e) => updateQuiz(qz.localId, 'passingQuestions', e.target.value)}
                        />
                        <small className="quiz-warn" style={{ color: 'var(--text-muted)' }}>
                          {t('videoAdd.ofTotalQuestions').replace('{len}', parsed.length)}
                        </small>
                      </div>

                      <div className="form-group flex-1">
                        <label>{t('videoAdd.maxAttemptsLabel')}</label>
                        <input
                          type="number"
                          min="1"
                          value={qz.maxAttempts}
                          onChange={(e) => updateQuiz(qz.localId, 'maxAttempts', e.target.value)}
                        />
                        <small className="quiz-warn" style={{ color: 'var(--text-muted)' }}>
                          {t('videoAdd.maxAttemptsHint')}
                        </small>
                      </div>
                    </div>

                    <div className="form-group">
                      <label>{t('videoAdd.questionsLabel')}</label>
                      <textarea
                        className="quiz-textarea"
                        rows={10}
                        dir={lang === 'ar' ? 'rtl' : 'ltr'}
                        placeholder={`@ ${t('videoAdd.syntaxQuestion')}\n# A\n## B\n# C\n!2\n\n@ ${t('videoAdd.syntaxQuestion')}\n## A\n# B\n## C`}
                        value={qz.raw}
                        onChange={(e) => updateQuiz(qz.localId, 'raw', e.target.value)}
                      />
                      <div className="quiz-syntax">
                        <span><code>@</code> {t('videoAdd.syntaxQuestion')}</span>
                        <span><code>#</code> {t('videoAdd.syntaxOption')}</span>
                        <span><code>##</code> {t('videoAdd.syntaxCorrect')}</span>
                        <span><code>!2</code> {t('videoAdd.syntaxPoints')}</span>
                      </div>
                      <div className="quiz-stats">
                        <span className="quiz-stat">
                          <i className="fas fa-list-ol"></i> {parsed.length} {t('common.question')}
                        </span>
                        <span className="quiz-stat">
                          <i className="fas fa-star"></i> {pts} {t('common.point')}
                        </span>
                        {qz.raw.trim() && !valid.valid && (
                          <span className="quiz-stat quiz-stat-bad">
                            <i className="fas fa-triangle-exclamation"></i> {valid.error}
                          </span>
                        )}
                        {qz.raw.trim() && valid.valid && (
                          <span className="quiz-stat quiz-stat-ok">
                            <i className="fas fa-check"></i> {t('videoAdd.syntaxValid')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {showRestoreSection && savedVideos.length > 0 && (
              <div className="restore-section">
                <h3 className="section-title">{t('videoAdd.restoreTitle')}</h3>
                <select
                  defaultValue=""
                  onChange={(e) => restoreVideo(e.target.value)}
                  className="restore-select"
                >
                  <option value="">{t('videoAdd.restoreOption')}</option>
                  {savedVideos.map((video, index) => (
                    <option key={index} value={index}>
                      {video.title} - {gradeNames[video.grade]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="action-buttons">
              <button className="btn btn-success" onClick={saveVideo}>
                {t('videoAdd.saveVideo')}
              </button>
              <button className="btn btn-warning" onClick={showVideoPreview}>
                {t('videoAdd.previewVideo')}
              </button>
              <button className="btn btn-danger" onClick={resetForm}>
                {t('videoAdd.reset')}
              </button>
            </div>
          </div>

          {showPreview && previewData && (
            <div className="preview-section">
              <div className="preview-card">
                <h2 className="preview-title">{t('videoAdd.previewTitleModal')}</h2>
                <div className="preview-content">
                  <div className="info-row">
                    <span className="info-label">{t('videoAdd.previewTitleLbl')}</span>
                    <span className="info-value">{previewData.title}</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">{t('common.noDescription')}</span>
                    <span className="info-value">{previewData.description || t('videoAdd.noDesc')}</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">{t('videoAdd.previewGradeLbl')}</span>
                    <span className="info-value">{gradeNames[previewData.grade]}</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">{t('videoAdd.previewPartsLbl')}</span>
                    <span className="info-value">{previewData.totalParts}</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">{t('videoAdd.previewActiveLbl')}</span>
                    <span className="info-value">{previewData.activeHours} {t('common.hours')}</span>
                  </div>

                  {previewData.quizzes && previewData.quizzes.length > 0 && (
                    <div className="parts-list">
                      <h4>{t('videoAdd.previewQuizzesLbl')}</h4>
                      {previewData.quizzes.map((qz, i) => (
                        <div key={i} className="part-item">
                          <span className="part-index">📝 {qz.title}</span>
                          <div className="part-details">
                            <div>
                              {qz.scope === 'whole'
                                ? t('videoAdd.reqWhole')
                                : t('videoAdd.reqPart').replace('{index}', parseInt(qz.partIndex) + 1)}
                            </div>
                            <div className="part-duration">
                              {t('videoAdd.quizPreviewMeta')
                                .replace('{qCount}', qz.questionCount)
                                .replace('{pts}', qz.totalPoints)
                                .replace('{pass}', qz.passingQuestions)
                                .replace('{att}', qz.maxAttempts)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="parts-list">
                    <h4>{t('videoAdd.previewPartsList')}</h4>
                    {previewData.parts.map((part, index) => (
                      <div key={index} className="part-item">
                        <span className="part-index">{t('videoAdd.partIndex').replace('{index}', index + 1)}:</span>
                        <div className="part-details">
                          <div>{part.title}</div>
                          <div className="part-duration">{t('videoAdd.previewId')} <code>{part.videoId || '—'}</code></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {showSuccess && (
          <div className="success-message">
            <div className="success-content">
              <span className="success-icon">✅</span>
              <p>{t('videoAdd.saveSuccess')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
