import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { listVideos } from '@backend/videosApi'
import { supabase } from '@backend/supabase'
import './VideosReport.css'

const fmtDate = (d) => {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date)) return '—'
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
}

export default function VideosReport() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [studentName, setStudentName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [currentFilter, setCurrentFilter] = useState('all')
  const [viewMode, setViewMode] = useState('table')
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [remoteVideos, setRemoteVideos] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('masar-user'))
      setIsAdmin(u?.role === 'admin')
    } catch { setIsAdmin(false) }
  }, [])

  /* Fetch real video progress for the current student when viewing own report. */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const u = JSON.parse(localStorage.getItem('masar-user')) || null
        const paramId = searchParams.get('id')
        const viewingSelf = !paramId || paramId === u?.id
        if (!u?.id || !viewingSelf) return

        setLoading(true)
        setLoadError('')

        // Videos + parts (grade-scoped by RLS).
        const videos = await listVideos()

        // All progress rows for this student across those videos.
        const { data: progressRows, error: progErr } = await supabase
          .from('video_progress')
          .select('video_id, part_id, views_used, last_watched_at')
          .eq('student_id', u.id)
        if (progErr) throw progErr

        // Group progress by video_id.
        const byVideo = new Map()
        for (const p of (progressRows || [])) {
          if (!byVideo.has(p.video_id)) byVideo.set(p.video_id, [])
          byVideo.get(p.video_id).push(p)
        }

        const rows = videos.map((v) => {
          const parts = v.video_parts || []
          const progList = byVideo.get(v.id) || []
          const viewedPartIds = new Set(
            progList.filter((p) => (p.views_used || 0) > 0).map((p) => p.part_id)
          )
          const totalParts = parts.length || 1
          const watchedParts = parts.filter((p) => viewedPartIds.has(p.id)).length
          const progress = Math.round((watchedParts / totalParts) * 100)

          let status = 'none'
          let statusText = 'لم تتم المشاهدة'
          if (progress >= 100) { status = 'completed'; statusText = 'تم المشاهدة بالكامل' }
          else if (progress > 0) { status = 'partial'; statusText = `تم مشاهدة ${progress}%` }

          const lastWatched = progList
            .map((p) => p.last_watched_at)
            .filter(Boolean)
            .sort()
            .pop()

          const totalMins = parts.reduce((s, p) => s + (p.duration_minutes || 0), 0)
            || v.duration_minutes || 0
          const watchedMins = parts
            .filter((p) => viewedPartIds.has(p.id))
            .reduce((s, p) => s + (p.duration_minutes || 0), 0)

          return {
            id: v.id,
            title: v.title,
            subject: 'فيديو',
            date: fmtDate(lastWatched),
            status,
            statusText,
            progress,
            watchedTime: `${watchedMins} دقيقة`,
            totalTime: `${totalMins} دقيقة`,
          }
        })
        if (!cancelled) setRemoteVideos(rows)
      } catch (e) {
        if (!cancelled) setLoadError(e.message || 'تعذّر تحميل التقرير')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [searchParams])

  const mockVideosData = [
    { id: 1, title: 'مقدمة في البرمجة', subject: 'علوم الحاسب', date: '10/4/2024', status: 'completed', statusText: 'تم المشاهدة بالكامل', progress: 100, watchedTime: '45 دقيقة', totalTime: '45 دقيقة' },
    { id: 2, title: 'الدرس الثاني: المتغيرات', subject: 'علوم الحاسب', date: '12/4/2024', status: 'partial', statusText: 'تم مشاهدة النصف', progress: 50, watchedTime: '22 دقيقة', totalTime: '44 دقيقة' },
    { id: 3, title: 'الدرس الثالث: الدوال والطرق', subject: 'علوم الحاسب', date: '14/4/2024', status: 'completed', statusText: 'تم المشاهدة بالكامل', progress: 100, watchedTime: '50 دقيقة', totalTime: '50 دقيقة' },
    { id: 4, title: 'الدرس الرابع: التطبيق العملي', subject: 'علوم الحاسب', date: '15/4/2024', status: 'partial', statusText: 'تم مشاهدة 75%', progress: 75, watchedTime: '34 دقيقة', totalTime: '45 دقيقة' },
    { id: 5, title: 'الدرس الخامس: المصفوفات', subject: 'علوم الحاسب', date: '—', status: 'none', statusText: 'لم تتم المشاهدة', progress: 0, watchedTime: '0 دقيقة', totalTime: '40 دقيقة' },
  ]

  /* Self view → Supabase-loaded rows (empty array while loading / when none);
     admin impersonation view → mock placeholder data. */
  let _selfView = true
  try {
    const _u = JSON.parse(localStorage.getItem('masar-user'))
    const _param = searchParams.get('id')
    _selfView = !_param || _param === _u?.id
  } catch { /* ignore */ }
  const videosData = _selfView ? (remoteVideos ?? []) : mockVideosData

  const filteredVideos =
    currentFilter === 'all'
      ? videosData
      : currentFilter === 'completed'
      ? videosData.filter((v) => v.progress >= 75)
      : currentFilter === 'partial'
      ? videosData.filter((v) => v.progress > 0 && v.progress < 75)
      : videosData.filter((v) => v.progress === 0)

  useEffect(() => {
    const student = searchParams.get('student')
    const idParam = searchParams.get('id')
    if (student) {
      setStudentName(student)
      setStudentId(idParam || '')
    } else {
      try {
        const stored = localStorage.getItem('masar-user')
        if (stored) {
          const u = JSON.parse(stored)
          if (u?.name)  setStudentName(u.name)
          if (u?.phone) setStudentId(u.phone)
        }
      } catch { /* ignore */ }
    }
  }, [searchParams])

  const getStatusIcon = (status) => {
    if (status === 'completed') return 'fa-check-circle'
    if (status === 'partial') return 'fa-adjust'
    return 'fa-times-circle'
  }

  const getStatusLabel = (status) => {
    if (status === 'completed') return 'مكتمل'
    if (status === 'partial') return 'جزئي'
    return 'لم يُشاهَد'
  }

  const getStatusClass = (status) => {
    if (status === 'completed') return 'vr-status-complete'
    if (status === 'partial') return 'vr-status-partial'
    return 'vr-status-none'
  }

  const getProgressClass = (progress) => {
    if (progress >= 75) return 'vr-prog-high'
    if (progress > 0) return 'vr-prog-medium'
    return 'vr-prog-low'
  }

  const openVideoDetail = (video) => { setSelectedVideo(video); setShowModal(true) }
  const closeModal = () => { setShowModal(false); setSelectedVideo(null) }

  const total = videosData.length
  const completed = videosData.filter((v) => v.progress >= 75).length
  const partial = videosData.filter((v) => v.progress > 0 && v.progress < 75).length
  const notWatched = videosData.filter((v) => v.progress === 0).length
  const avgProgress = total > 0 ? Math.round(videosData.reduce((sum, v) => sum + v.progress, 0) / total) : 0

  return (
    <main className="vr-page">
      <div className="vr-container">

        {/* Back */}
        <button className="vr-back-btn" onClick={() => navigate(-1)}>
          <i className="fas fa-arrow-right"></i>
          رجوع
        </button>

        {/* Header */}
        <div className="vr-header">
          <div className="vr-header-icon">
            <i className="fas fa-play-circle"></i>
          </div>
          <h1>تقرير الفيديوهات</h1>
          <p>ملخص مشاهدات الفيديوهات التعليمية</p>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--muted, #666)' }}>
            <i className="fas fa-spinner fa-spin"></i> جارٍ تحميل التقرير...
          </div>
        )}
        {loadError && (
          <div style={{ textAlign: 'center', padding: 16, color: '#c53030' }}>
            <i className="fas fa-exclamation-triangle"></i> {loadError}
          </div>
        )}

        {/* Student Info Card */}
        {studentName && (
          <div className="vr-student-card">
            <div className="vr-student-avatar">
              <i className="fas fa-user-graduate"></i>
            </div>
            <div className="vr-student-info">
              <table className="vr-student-table">
                <tbody>
                  <tr>
                    <td className="vr-info-label"><i className="fas fa-user"></i> الاسم</td>
                    <td className="vr-info-value">{studentName}</td>
                  </tr>
                  {studentId && (
                    <tr>
                      <td className="vr-info-label"><i className="fas fa-id-badge"></i> رقم الطالب</td>
                      <td className="vr-info-value">{studentId}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="vr-info-label"><i className="fas fa-chart-line"></i> متوسط التقدم</td>
                    <td className="vr-info-value">{avgProgress}%</td>
                  </tr>
                  <tr>
                    <td className="vr-info-label"><i className="fas fa-video"></i> المُكتمل</td>
                    <td className="vr-info-value">{completed} من {total} فيديو</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="vr-stats">
          <div className="vr-stat-card">
            <i className="fas fa-film vr-stat-icon" style={{color: 'var(--primary)'}}></i>
            <span className="vr-stat-value" style={{color: 'var(--primary)'}}>{total}</span>
            <span className="vr-stat-label">إجمالي</span>
          </div>
          <div className="vr-stat-card">
            <i className="fas fa-check-circle vr-stat-icon" style={{color: '#48bb78'}}></i>
            <span className="vr-stat-value" style={{color: '#48bb78'}}>{completed}</span>
            <span className="vr-stat-label">مكتملة</span>
          </div>
          <div className="vr-stat-card">
            <i className="fas fa-adjust vr-stat-icon" style={{color: '#ed8936'}}></i>
            <span className="vr-stat-value" style={{color: '#ed8936'}}>{partial}</span>
            <span className="vr-stat-label">جزئية</span>
          </div>
          <div className="vr-stat-card">
            <i className="fas fa-times-circle vr-stat-icon" style={{color: '#ef4444'}}></i>
            <span className="vr-stat-value" style={{color: '#ef4444'}}>{notWatched}</span>
            <span className="vr-stat-label">لم تُشاهَد</span>
          </div>
          <div className="vr-stat-card">
            <i className="fas fa-percentage vr-stat-icon" style={{color: 'var(--secondary)'}}></i>
            <span className="vr-stat-value" style={{color: 'var(--secondary)'}}>{avgProgress}%</span>
            <span className="vr-stat-label">المتوسط</span>
          </div>
        </div>

        {/* Controls */}
        <div className="vr-controls">
          <div className="vr-filter-group">
            {[
              { key: 'all', label: 'الكل', icon: 'fa-th-list' },
              { key: 'completed', label: 'مكتمل', icon: 'fa-check' },
              { key: 'partial', label: 'جزئي', icon: 'fa-adjust' },
              { key: 'none', label: 'لم يُشاهَد', icon: 'fa-times' },
            ].map(({ key, label, icon }) => (
              <button key={key} className={`vr-filter-btn ${currentFilter === key ? 'active' : ''}`} onClick={() => setCurrentFilter(key)}>
                <i className={`fas ${icon}`}></i> {label}
              </button>
            ))}
          </div>
          <div className="vr-view-toggle">
            <button className={`vr-view-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>
              <i className="fas fa-table"></i> جدول
            </button>
            <button className={`vr-view-btn ${viewMode === 'cards' ? 'active' : ''}`} onClick={() => setViewMode('cards')}>
              <i className="fas fa-th-large"></i> بطاقات
            </button>
          </div>
        </div>

        <div className="vr-results-count">
          عرض <strong>{filteredVideos.length}</strong> فيديو من أصل {total}
        </div>

        {/* TABLE VIEW */}
        {viewMode === 'table' && (
          <div className="vr-card" id="vr-reportTable">
            <div className="vr-table-header">
              <h2 className="vr-card-title"><i className="fas fa-clipboard-list"></i> تقرير المشاهدة التفصيلي</h2>
              {isAdmin && (
                <button className="vr-print-btn" onClick={() => window.print()}>
                  <i className="fas fa-print"></i> طباعة
                </button>
              )}
            </div>
            <div className="vr-table-container">
              <table className="vr-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>الفيديو</th>
                    <th>المادة</th>
                    <th>التاريخ</th>
                    <th>الحالة</th>
                    <th>نسبة المشاهدة</th>
                    <th>الوقت</th>
                    <th>التفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVideos.length === 0 ? (
                    <tr><td colSpan={8} className="vr-empty-row">لا توجد فيديوهات تطابق هذا الفلتر</td></tr>
                  ) : (
                    filteredVideos.map((video, index) => (
                      <tr key={video.id} className="vr-tr">
                        <td className="vr-td-num">{index + 1}</td>
                        <td className="vr-td-title">
                          <i className="fas fa-play-circle vr-row-icon"></i>
                          {video.title}
                        </td>
                        <td>{video.subject}</td>
                        <td>{video.date}</td>
                        <td>
                          <span className={`vr-badge ${getStatusClass(video.status)}`}>
                            <i className={`fas ${getStatusIcon(video.status)}`}></i> {getStatusLabel(video.status)}
                          </span>
                        </td>
                        <td className="vr-td-progress">
                          <div className="vr-progress-wrap">
                            <div className="vr-progress-bar">
                              <div className={`vr-progress-fill ${getProgressClass(video.progress)}`} style={{ width: `${video.progress}%` }} />
                            </div>
                            <span className="vr-pct">{video.progress}%</span>
                          </div>
                        </td>
                        <td>{video.watchedTime} / {video.totalTime}</td>
                        <td>
                          <button className="vr-detail-btn" onClick={() => openVideoDetail(video)}>
                            <i className="fas fa-info-circle"></i> عرض
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CARDS VIEW */}
        {viewMode === 'cards' && (
          <div className="vr-cards-grid">
            {filteredVideos.length === 0 ? (
              <div className="vr-no-results">لا توجد فيديوهات تطابق هذا الفلتر</div>
            ) : (
              filteredVideos.map((video) => (
                <div key={video.id} className="vr-video-card" onClick={() => openVideoDetail(video)}>
                  <div className="vr-card-top">
                    <div className="vr-card-icon-wrap">
                      <i className="fas fa-play-circle"></i>
                    </div>
                    <span className={`vr-badge ${getStatusClass(video.status)}`}>
                      <i className={`fas ${getStatusIcon(video.status)}`}></i> {getStatusLabel(video.status)}
                    </span>
                  </div>
                  <h3 className="vr-card-name">{video.title}</h3>
                  <p className="vr-card-subject">{video.subject}</p>
                  <div className="vr-card-progress">
                    <div className="vr-progress-bar">
                      <div className={`vr-progress-fill ${getProgressClass(video.progress)}`} style={{ width: `${video.progress}%` }} />
                    </div>
                    <span className="vr-pct">{video.progress}%</span>
                  </div>
                  <div className="vr-card-meta">
                    <span><i className="fas fa-clock"></i> {video.watchedTime} / {video.totalTime}</span>
                    <span><i className="fas fa-calendar-alt"></i> {video.date}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* DETAIL MODAL */}
      {showModal && selectedVideo && (
        <div className="vr-modal-overlay" onClick={closeModal}>
          <div className="vr-modal" onClick={(e) => e.stopPropagation()}>
            <button className="vr-modal-close" onClick={closeModal}><i className="fas fa-times"></i></button>

            <div className="vr-modal-icon-wrap">
              <i className="fas fa-play-circle"></i>
            </div>
            <h2 className="vr-modal-title">{selectedVideo.title}</h2>
            <p className="vr-modal-subject">{selectedVideo.subject}</p>

            <div className="vr-modal-progress-ring">
              <svg viewBox="0 0 120 120" className="vr-ring-svg">
                <circle cx="60" cy="60" r="50" className="vr-ring-bg" />
                <circle cx="60" cy="60" r="50" className="vr-ring-fill"
                  style={{
                    strokeDasharray: `${(selectedVideo.progress / 100) * 314} 314`,
                    stroke: selectedVideo.progress >= 75 ? '#48bb78' : selectedVideo.progress > 0 ? '#ed8936' : '#ef4444',
                  }}
                />
              </svg>
              <span className="vr-ring-pct">{selectedVideo.progress}%</span>
            </div>

            <div className="vr-modal-details">
              <div className="vr-modal-row">
                <span className="vr-modal-label">الحالة</span>
                <span className={`vr-badge ${getStatusClass(selectedVideo.status)}`}>{selectedVideo.statusText}</span>
              </div>
              <div className="vr-modal-row">
                <span className="vr-modal-label">وقت المشاهدة</span>
                <span className="vr-modal-val">{selectedVideo.watchedTime}</span>
              </div>
              <div className="vr-modal-row">
                <span className="vr-modal-label">المدة الكاملة</span>
                <span className="vr-modal-val">{selectedVideo.totalTime}</span>
              </div>
              <div className="vr-modal-row">
                <span className="vr-modal-label">التاريخ</span>
                <span className="vr-modal-val">{selectedVideo.date}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
