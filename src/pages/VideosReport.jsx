import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { listVideos } from '@backend/videosApi'
import { getProfile } from '@backend/profilesApi'
import { supabase } from '@backend/supabase'
import { getYoutubeDurations } from '../services/youtubeMeta'
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
  // Students never see the detailed table view — force cards.
  const initialViewMode = (() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('masar-user'))
      return u?.role === 'admin' ? 'table' : 'cards'
    } catch { return 'cards' }
  })()
  const [viewMode, setViewMode] = useState(initialViewMode)
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [remoteVideos, setRemoteVideos] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('masar-user'))
      setIsAdmin(u?.role === 'admin')
    } catch { setIsAdmin(false) }
  }, [])

  /* Fetch real video progress for the target student (self by default, or the
     student id carried in the ?id= query param when an admin is impersonating). */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const u = JSON.parse(sessionStorage.getItem('masar-user')) || null
        const paramId = searchParams.get('id')
        const targetId = paramId || u?.id
        if (!targetId) return

        setLoading(true)
        setLoadError('')

        // Resolve the target student's grade so we only show videos of their
        // own grade. When an admin views the page, RLS lets listVideos() return
        // every grade — so we must filter client-side by targetProfile.grade.
        let targetGrade = u?.grade || null
        if (paramId && paramId !== u?.id) {
          const p = await getProfile(paramId)
          targetGrade = p?.grade || null
          if (p?.name) setStudentName(p.name)
          if (p?.phone) setStudentId(p.phone)
        }

        // Videos + parts. Admin sees all grades through RLS, so we narrow.
        const allVideos = await listVideos()
        const videos = targetGrade
          ? allVideos.filter((v) => v.grade === targetGrade)
          : allVideos

        // All progress rows for the target student across those videos.
        const { data: progressRows, error: progErr } = await supabase
          .from('video_progress')
          .select('video_id, part_id, views_used, last_watched_at')
          .eq('student_id', targetId)
        if (progErr) throw progErr

        // Group progress by video_id.
        const byVideo = new Map()
        for (const p of (progressRows || [])) {
          if (!byVideo.has(p.video_id)) byVideo.set(p.video_id, [])
          byVideo.get(p.video_id).push(p)
        }

        // Probe REAL durations from YouTube for every unique part across
        // the videos this student has access to. We no longer store
        // admin-entered minutes on the row — duration comes from the
        // player itself. Results are cached per-tab so subsequent report
        // loads on the same videos are instant.
        const allPartIds = videos.flatMap((v) =>
          (v.video_parts || []).map((p) => p.youtube_id).filter(Boolean)
        )
        const durMap = await getYoutubeDurations(allPartIds)
        if (cancelled) return

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

          // Real durations (in seconds) → minutes, rounded up so a 30-sec
          // outro still contributes 1 minute to the total.
          const partSeconds = (p) => durMap.get(p.youtube_id) || 0
          const totalSecs = parts.reduce((s, p) => s + partSeconds(p), 0)
          const watchedSecs = parts
            .filter((p) => viewedPartIds.has(p.id))
            .reduce((s, p) => s + partSeconds(p), 0)
          const totalMins = Math.ceil(totalSecs / 60)
          const watchedMins = Math.ceil(watchedSecs / 60)

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

  /* All rows come from Supabase — self view for the student, or the target
     student when an admin passes ?id=. No more mock placeholder rows. */
  const videosData = remoteVideos ?? []

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
        const stored = sessionStorage.getItem('masar-user')
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
          {isAdmin && (
            <div className="vr-view-toggle">
              <button className={`vr-view-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>
                <i className="fas fa-table"></i> جدول
              </button>
              <button className={`vr-view-btn ${viewMode === 'cards' ? 'active' : ''}`} onClick={() => setViewMode('cards')}>
                <i className="fas fa-th-large"></i> بطاقات
              </button>
            </div>
          )}
        </div>

        <div className="vr-results-count">
          عرض <strong>{filteredVideos.length}</strong> فيديو من أصل {total}
        </div>

        {/* TABLE VIEW — admin only (the detailed report card) */}
        {isAdmin && viewMode === 'table' && (
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
