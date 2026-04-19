import { useState, useEffect } from 'react'
import './VideoAdd.css'
import { notify } from '../utils/notify'

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
      createdAt: new Date().toISOString()
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
      activeHours: parseInt(activeHours)
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
