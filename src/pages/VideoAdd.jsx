import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTenant } from '../contexts/TenantContext'
import './VideoAdd.css'
import { notify } from '../utils/notify'
import { createVideo, deleteVideo } from '@backend/videosApi'
import { invalidate as invalidateCache } from '../utils/cache'
import { uploadLecturePdf, deleteR2Object } from '@backend/r2'
import PreAssessmentEditor, {
  gatesToPayload,
  validateGates,
} from '../components/PreAssessmentEditor'
import { syncVideoAssessments } from '@backend/videoAssessmentsApi'

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

// ── Pre-video assessments ─────────────────────────────────────
// These used to be inline quizzes stored on `videos.quizzes`, graded in the
// browser. They now REFERENCE an exam or تسميع from the assessments library
// and are graded server-side — see PreAssessmentEditor and
// backend/migrations/2026_07_26_pre_video_assessments.sql.

export default function VideoAdd() {
  const navigate = useNavigate()
  const { isGradeEnabled, gradesList } = useTenant()
  const [videoTitle, setVideoTitle] = useState('')
  const [videoDescription, setVideoDescription] = useState('')
  const [videoParts, setVideoParts] = useState([])
  const [numParts, setNumParts] = useState('')
  const [gates, setGates] = useState([])
  const [savedVideos, setSavedVideos] = useState([])
  const [showRestoreSection, setShowRestoreSection] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [selectedGrade] = useState(() => {
    const selected = localStorage.getItem('selectedVideoGrade')
    if (selected && isGradeEnabled(selected)) return selected
    if (gradesList && gradesList.length > 0) return gradesList[0].id
    return 'first-prep'
  })
  const [videoGrade, setVideoGrade] = useState(selectedGrade)
  const [activeHours, setActiveHours] = useState(24)
  const [pdfFile, setPdfFile] = useState(null)

  useEffect(() => {
    if (gradesList && gradesList.length > 0) {
      const exists = gradesList.some(g => g.id === videoGrade)
      if (!exists) {
        setVideoGrade(gradesList[0].id)
      }
    }
  }, [gradesList])
  const [uploadPct, setUploadPct] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const addPart = () => {
    const nextId = `new_part_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setVideoParts(prev => [
      ...prev,
      {
        id: nextId,
        title: '',
        source: 'youtube',
        videoId: '',
        driveId: '',
        bunnyVideoId: '',
        bunnyLibraryId: '',
        durationMinutes: '',
        viewLimit: 3,
      }
    ])
    setShowRestoreSection(true)
  }

  const removePart = (id) => {
    setVideoParts(prev => prev.filter(p => p.id !== id))
  }

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
      source: 'youtube',         // 'youtube' | 'drive' | 'bunny'
      videoId: '',                // YouTube id (when source='youtube')
      driveId: '',                // Drive file id (when source='drive')
      bunnyVideoId: '',           // Bunny Stream GUID (when source='bunny')
      bunnyLibraryId: '',         // optional per-part library id (else default)
      durationMinutes: '',        // admin-entered duration for non-YT parts
      viewLimit: 3,
    }))

    setVideoParts(newParts)
    setShowRestoreSection(true)
  }

  const updatePart = (id, field, value) => {
    setVideoParts(videoParts.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

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

    // Assessments are NOT restored from this localStorage draft: a gate points
    // at a library assessment by id, and a draft saved on another device (or
    // before that assessment was deleted) would restore a dangling reference.
    // The admin re-picks them, which takes one dropdown.
    setGates([])

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
      if (p.source === 'bunny') {
        if (!p.bunnyVideoId || !p.bunnyVideoId.trim()) {
          notify(`الجزء ${i + 1}: ارفع ملف الفيديو إلى Bunny قبل الحفظ`, { type: 'warning' })
          return
        }
        // Bunny GUIDs are uuid v4 — sanity check, the upload flow always
        // produces this format so admins won't normally hit this branch.
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.bunnyVideoId.trim())) {
          notify(`الجزء ${i + 1}: معرّف Bunny غير صالح`, { type: 'warning' })
          return
        }
      } else if (p.source === 'drive') {
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

    // Validate the pre-video assessments. The database re-checks all of this
    // (CHECK constraints + the RPCs); these messages just fail fast in Arabic.
    const gateError = validateGates(gates)
    if (gateError) {
      notify(gateError, { type: 'warning' })
      return
    }

    let createdBy = null
    try {
      const u = JSON.parse(sessionStorage.getItem('masar-user'))
      createdBy = u?.id || null
    } catch { /* ignore */ }

    setSubmitting(true)
    let uploadedKey = null
    let uploadedUrl = null

    try {
      if (pdfFile) {
        if (pdfFile.type && pdfFile.type !== 'application/pdf') {
          throw new Error('الملف يجب أن يكون بصيغة PDF')
        }
        setUploadPct(1)
        const { key, publicUrl } = await uploadLecturePdf(pdfFile, {
          onProgress: (p) => setUploadPct(Math.max(1, p)),
        })
        uploadedKey = key
        uploadedUrl = publicUrl
      }

      const created = await createVideo({
        title: videoTitle.trim(),
        description: videoDescription.trim() || null,
        grade: videoGrade,
        active_hours: activeHours,
        created_by: createdBy,
        pdf_url: uploadedUrl,
        pdf_key: uploadedKey,
        parts: videoParts.map(p => {
          const src = p.source === 'drive' ? 'drive'
                    : p.source === 'bunny' ? 'bunny'
                    : 'youtube'
          const mins = parseFloat(p.durationMinutes)
          const libId = parseInt(p.bunnyLibraryId, 10)
          return {
            title: p.title.trim(),
            source: src,
            youtube_id:       src === 'youtube' ? p.videoId.trim() : null,
            drive_id:         src === 'drive'   ? p.driveId.trim() : null,
            bunny_video_id:   src === 'bunny'   ? p.bunnyVideoId.trim() : null,
            bunny_library_id: src === 'bunny' && Number.isFinite(libId) && libId > 0 ? libId : null,
            duration_seconds: (src === 'drive' || src === 'bunny') && mins > 0
              ? Math.round(mins * 60)
              : null,
            view_limit: p.viewLimit,
          }
        }),
      })

      // Gates are written after the video, because a gate scoped to "الجزء 2"
      // needs that part's real id — which only exists post-insert. If this
      // fails we roll the video back rather than leave it saved but ungated,
      // which would silently publish content the teacher meant to lock.
      if (gates.length) {
        try {
          await syncVideoAssessments(
            created.id,
            gatesToPayload(gates, created.parts),
            { created_by: createdBy }
          )
        } catch (gateErr) {
          await deleteVideo(created.id).catch(() => {})
          throw new Error(`تم إلغاء حفظ الفيديو — تعذر ربط التقييم: ${gateErr.message || gateErr}`)
        }
      }

      invalidateCache('videos')
      setShowSuccess(true)
      setTimeout(() => {
        navigate('/videos')
      }, 1200)
    } catch (err) {
      if (uploadedKey || uploadedUrl) {
        deleteR2Object({ key: uploadedKey, url: uploadedUrl }).catch(() => {})
      }
      notify(err.message || 'تعذر حفظ الفيديو', { type: 'warning' })
    } finally {
      setSubmitting(false)
      setUploadPct(0)
    }
  }

  const resetForm = () => {
    setVideoTitle('')
    setVideoDescription('')
    setActiveHours(24)
    setVideoParts([])
    setNumParts('')
    setGates([])
    setShowPreview(false)
    setPdfFile(null)
  }

  const showVideoPreview = () => {
    if (!videoTitle.trim()) {
      notify('يرجى إدخال عنوان الفيديو', { type: 'warning' })
      return
    }

    const partIncomplete = (p) => {
      if (!p.title.trim()) return true
      if (p.source === 'bunny') return !p.bunnyVideoId?.trim()
      if (p.source === 'drive') return !p.driveId?.trim()
      return !p.videoId?.trim()
    }
    if (videoParts.length === 0 || videoParts.some(partIncomplete)) {
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
      gates: gates.filter(g => g.assessment_id),
    })

    setShowPreview(true)
  }

  const gradeNames = {
    'first-prep': 'الصف الأول الإعدادي',
    'second-prep': 'الصف الثاني الإعدادي',
    'third-prep': 'الصف الثالث الإعدادي',
    'first-sec': 'الصف الأول الثانوي',
    'second-sec': 'الصف الثاني الثانوي',
    'third-sec': 'الصف الثالث الثانوي'
  }

  return (
    <div className="video-add-page" dir="rtl">
      <div className="video-add-container">
        <div className="page-header">
          <button
            type="button"
            className="btn btn-outline page-header-back"
            onClick={() => navigate('/videos')}
          >
            <i className="fas fa-arrow-right"></i> العودة للفيديوهات
          </button>
          <div className="page-header-text">
            <h1 className="page-title" style={{ margin: '0 0 6px' }}>إضافة فيديو جديد</h1>
            <p className="page-subtitle" style={{ margin: 0 }}>قم بإنشاء فيديو تعليمي جديد مع تعريف الأجزاء والتفاصيل</p>
          </div>
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

            <div className="form-group">
              <label>مذكرة / ملخص المحاضرة (ملف PDF) - اختياري</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label htmlFor="pdf-file-input" style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                  border: '1.5px dashed rgba(167, 139, 250, 0.25)', borderRadius: 12, background: 'rgba(255,255,255,0.02)',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  flex: 1,
                  color: 'var(--text-primary)', fontWeight: 500,
                }}>
                  <i className="fas fa-file-pdf" style={{ color: '#ef4444', fontSize: '1.2rem' }}></i>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pdfFile ? pdfFile.name : 'اختر ملف PDF للمحاضرة'}
                  </span>
                  {pdfFile && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {(pdfFile.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  )}
                </label>
                <input
                  id="pdf-file-input"
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  style={{ display: 'none' }}
                  disabled={submitting}
                />
                {pdfFile && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setPdfFile(null)}
                    style={{ borderColor: '#ef4444', color: '#ef4444', background: 'transparent', padding: '10px 16px', margin: 0 }}
                    disabled={submitting}
                  >
                    إلغاء
                  </button>
                )}
              </div>
              {uploadPct > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ height: 6, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${uploadPct}%`, height: '100%', background: 'var(--gradient-primary)', transition: 'width .15s ease' }} />
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>جاري رفع المذكرة... {uploadPct}%</span>
                </div>
              )}
            </div>

            <div className="form-row">
              <div className="form-group flex-1">
                <label>الصف الدراسي</label>
                <select value={videoGrade} onChange={(e) => setVideoGrade(e.target.value)}>
                  {gradesList.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                  <option value="packages">باقات مدفوعة 📦</option>
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
            <div className="parts-section">
              <h3 className="section-title">أجزاء الفيديو</h3>
              {videoParts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 20px', border: '1.5px dashed var(--border-primary)', borderRadius: '16px', background: 'rgba(0,0,0,0.01)' }}>
                  <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontWeight: 700 }}>لم تقم بإضافة أي أجزاء للمحاضرة بعد.</p>
                  <button type="button" className="btn btn-secondary" onClick={addPart}>
                    ➕ إضافة جزء أول
                  </button>
                </div>
              ) : (
                <>
                  {videoParts.map((part, index) => (
                    <div key={part.id} className="part-block" style={{ animationDelay: `${index * 0.05}s` }}>
                      <div className="part-header">
                        <span className="part-number">الجزء {index + 1}</span>
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ padding: '4px 8px', fontSize: '0.75rem', borderColor: '#ef4444', color: '#ef4444', background: 'transparent', margin: 0 }}
                          onClick={() => removePart(part.id)}
                        >
                          <i className="fas fa-trash"></i> حذف الجزء
                        </button>
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
                          <label className={`quiz-scope-opt ${part.source === 'bunny' ? 'is-on' : ''}`}>
                            <input
                              type="radio"
                              name={`source-${part.id}`}
                              checked={part.source === 'bunny'}
                              onChange={() => updatePart(part.id, 'source', 'bunny')}
                            />
                            <i className="fas fa-cloud" style={{ color: '#f97316' }}></i>
                            <span>Bunny Stream</span>
                          </label>
                        </div>
                      </div>

                      {part.source === 'bunny' ? (
                        <BunnyUploader
                          part={part}
                          title={videoTitle ? `${videoTitle} — ${part.title || `الجزء ${part.id + 1}`}` : (part.title || 'video')}
                          onChange={(patch) => Object.entries(patch).forEach(([k, v]) => updatePart(part.id, k, v))}
                        />
                      ) : part.source === 'youtube' ? (
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
                          <small style={{ color: 'var(--text-muted)', fontSize: 12, display: 'block', marginTop: 4 }}>
                            الجزء من الرابط بعد <code>v=</code> أو بعد <code>youtu.be/</code>. سيتم استخراج المعرّف تلقائياً إذا لصقت الرابط الكامل.
                          </small>
                          <div style={{ marginTop: 6, padding: '6px 10px', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.25)', borderRadius: '6px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                            <strong style={{ color: '#eab308' }}>⚠️ ملاحظة هامة:</strong> يجب ضبط خصوصية الفيديو على يوتيوب كـ <strong>«غير مدرج» (Unlisted)</strong> وليس «خاص» (Private) حتى يعمل مشغل الفيديو في المنصة بدون أن يظهر الفيديو للعامة على يوتيوب.
                          </div>
                          {part.videoId && !/^[a-zA-Z0-9_-]{11}$/.test(part.videoId) && (
                            <small style={{ color: '#c53030', fontSize: 12, display: 'block', marginTop: 4 }}>
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
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                    <button type="button" className="btn btn-secondary" onClick={addPart}>
                      ➕ إضافة جزء جديد
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* ── Pre-Video Assessment ────────────────────────────
                 Replaces the old inline quiz builder. The teacher now picks
                 an existing امتحان or تسميع from the library, sets how many
                 attempts and what percentage counts as a pass; grading and
                 unlocking happen server-side. */}
            <PreAssessmentEditor
              gates={gates}
              onChange={setGates}
              parts={videoParts}
              grade={videoGrade}
            />

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
              <button className="btn btn-success" onClick={saveVideo} disabled={submitting}>
                <i className={submitting ? "fas fa-spinner fa-spin" : "fas fa-floppy-disk"}></i>
                <span>{submitting ? "جاري الحفظ..." : "حفظ الفيديو"}</span>
              </button>
              <button className="btn btn-warning" onClick={showVideoPreview} disabled={submitting}>
                <i className="fas fa-magnifying-glass"></i>
                <span>معاينة الفيديو</span>
              </button>
              <button className="btn btn-danger" onClick={resetForm} disabled={submitting}>
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

                  {previewData.gates && previewData.gates.length > 0 && (
                    <div className="parts-list">
                      <h4>التقييمات المطلوبة:</h4>
                      {previewData.gates.map((g, i) => (
                        <div key={g.localKey || i} className="part-item">
                          <span className="part-index">
                            📝 {g.assessment_type === 'tasmee3' ? 'تسميع' : 'امتحان'}
                            {!g.is_enabled && ' (موقوف)'}
                          </span>
                          <div className="part-details">
                            <div>
                              {g.trigger_type === 'timestamp'
                                ? `يُطلب أثناء المشاهدة عند الثانية ${g.timestamp_seconds ?? 0}`
                                : (g.part_index === '' || g.part_index == null)
                                  ? 'يُطلب قبل مشاهدة الفيديو كامل'
                                  : `يُطلب قبل الجزء ${Number(g.part_index) + 1}`}
                            </div>
                            <div className="part-duration">
                              النجاح: {g.passing_score}% ·{' '}
                              {g.allowed_attempts === 0
                                ? 'محاولات غير محدودة'
                                : `${g.allowed_attempts} محاولة`}
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
                            {part.source === 'bunny' ? 'Bunny'
                              : part.source === 'drive' ? 'Drive'
                              : 'YouTube'}:{' '}
                            <code>{
                              part.source === 'bunny' ? (part.bunnyVideoId || '—')
                              : part.source === 'drive' ? (part.driveId || '—')
                              : (part.videoId || '—')
                            }</code>
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
              <span className="success-icon">🎉</span>
              <p>تم حفظ الفيديو بنجاح! سيتم توجيهك إلى صفحة الفيديوهات...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* BunnyUploader — admin picks a video file → handshake with our edge
   function (which creates a Bunny video record server-side) → TUS upload
   directly to Bunny. The Bunny library API key never reaches the
   browser. We persist the resulting GUID on the part.

   States:
     idle       — no file picked
     ready      — file picked, waiting for the admin to click "ابدأ الرفع"
     uploading  — TUS upload in progress (% via onProgress)
     done       — upload finished; part.bunnyVideoId is set
     error      — display the message + allow retry
*/
function BunnyUploader({ part, title, onChange }) {
  const [file, setFile]      = useState(null)
  const [pct, setPct]        = useState(0)
  const [status, setStatus]  = useState(part.bunnyVideoId ? 'done' : 'idle')
  const [error, setError]    = useState('')

  const startUpload = async () => {
    if (!file) return
    setError('')
    setStatus('uploading')
    setPct(0)
    try {
      // Lazy-load to keep the Bunny code out of the main bundle until needed.
      const { createBunnyUpload, uploadBunnyVideo } = await import('@backend/bunnyApi')
      const params = await createBunnyUpload({ title })
      onChange({ bunnyVideoId: params.guid, bunnyLibraryId: params.libraryId })
      await uploadBunnyVideo(file, params, {
        onProgress: (p) => setPct(p),
      })
      setStatus('done')
    } catch (err) {
      setError(err?.message || 'فشل رفع الفيديو')
      setStatus('error')
    }
  }

  const reset = () => {
    setFile(null)
    setPct(0)
    setStatus('idle')
    setError('')
    onChange({ bunnyVideoId: '', bunnyLibraryId: '' })
  }

  return (
    <>
      <div className="form-group">
        <label>ملف الفيديو</label>
        {status === 'done' && part.bunnyVideoId ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
            border: '1px solid #16a34a', borderRadius: 10, background: '#f0fdf4',
            color: '#15803d',
          }}>
            <i className="fas fa-circle-check"></i>
            <span style={{ flex: 1 }}>تم رفع الفيديو بنجاح إلى Bunny.</span>
            <button type="button" className="btn-link" onClick={reset}
              style={{ background: 'none', border: 0, color: '#15803d', textDecoration: 'underline', cursor: 'pointer' }}>
              استبدال
            </button>
          </div>
        ) : (
          <>
            <label htmlFor={`bunny-file-${part.id}`} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              border: '1px dashed #cbd5e0', borderRadius: 10, background: '#f8fafc',
              cursor: status === 'uploading' ? 'not-allowed' : 'pointer',
              opacity: status === 'uploading' ? 0.6 : 1,
              color: '#2d3748', fontWeight: 500,
            }}>
              <i className="fas fa-cloud-arrow-up" style={{ color: '#f97316' }}></i>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file ? file.name : 'اختر ملف الفيديو من جهازك'}
              </span>
              {file && (
                <span style={{ fontSize: 12, color: '#718096' }}>
                  {(file.size / (1024 * 1024)).toFixed(1)} MB
                </span>
              )}
            </label>
            <input
              id={`bunny-file-${part.id}`}
              type="file"
              accept="video/*"
              style={{ display: 'none' }}
              disabled={status === 'uploading'}
              onChange={(e) => {
                const f = e.target.files?.[0] || null
                setFile(f)
                setStatus(f ? 'ready' : 'idle')
                setPct(0)
                setError('')
                // Clear any prior GUID until a fresh upload completes.
                onChange({ bunnyVideoId: '', bunnyLibraryId: '' })
              }}
            />
            {status === 'ready' && (
              <button type="button"
                onClick={startUpload}
                style={{
                  marginTop: 8, padding: '8px 14px',
                  background: '#f97316', color: '#fff',
                  border: 0, borderRadius: 8, fontWeight: 600, cursor: 'pointer',
                }}>
                <i className="fas fa-cloud-arrow-up"></i> ابدأ الرفع إلى Bunny
              </button>
            )}
            {status === 'uploading' && (
              <>
                <div style={{ marginTop: 8, height: 6, background: '#edf2f7', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    width: `${pct}%`, height: '100%',
                    background: 'linear-gradient(90deg, #f59e0b, #f97316)',
                    transition: 'width .15s ease',
                  }} />
                </div>
                <span style={{ fontSize: 12, color: '#4a5568' }}>
                  جاري الرفع... {pct}% — يمكنك متابعة تعبئة باقي الحقول.
                </span>
              </>
            )}
            {status === 'error' && (
              <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: 13 }}>
                <i className="fas fa-triangle-exclamation"></i> {error}
                <button type="button" onClick={startUpload}
                  style={{ marginInlineStart: 12, background: 'none', border: 0, color: '#991b1b', textDecoration: 'underline', cursor: 'pointer' }}>
                  إعادة المحاولة
                </button>
              </div>
            )}
            <small style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6, display: 'block' }}>
              الفيديو يُرفع مباشرة إلى Bunny Stream من جهازك — لا يمر بخادمنا.
            </small>
          </>
        )}
      </div>

      <div className="form-group">
        <label>مدة الفيديو (بالدقائق) — اختياري</label>
        <input
          type="number"
          min="0"
          step="0.5"
          value={part.durationMinutes}
          onChange={(e) => onChange({ durationMinutes: e.target.value })}
        />
        <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          سيتم اكتشاف المدة تلقائياً عند تشغيل الفيديو لأول مرة إن تركتها فارغة.
        </small>
      </div>
    </>
  )
}
