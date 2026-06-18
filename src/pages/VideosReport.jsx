import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { listVideos } from '@backend/videosApi'
import { getProfile } from '@backend/profilesApi'
import { supabase } from '@backend/supabase'
import { getYoutubeDurations } from '../services/youtubeMeta'
import { cached, LIST_TTL } from '../utils/cache'
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
  const [studentName, setStudentName] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        const student = params.get('student')
        if (student) return student
        const stored = sessionStorage.getItem('masar-user')
        if (stored) {
          const u = JSON.parse(stored)
          return u?.name || ''
        }
      }
    } catch {}
    return ''
  })
  const [studentId, setStudentId] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        const idParam = params.get('id')
        if (idParam) return idParam
        const stored = sessionStorage.getItem('masar-user')
        if (stored) {
          const u = JSON.parse(stored)
          return u?.phone || ''
        }
      }
    } catch {}
    return ''
  })
  const [currentFilter, setCurrentFilter] = useState('all')
  // Students never see the detailed table view — force cards.
  const initialViewMode = (() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('masar-user'))
      return (u?.role === 'admin' || u?.role === 'assistant') ? 'table' : 'cards'
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
      setIsAdmin(u?.role === 'admin' || u?.role === 'assistant')
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
        const allVideos = await cached('videos', LIST_TTL, listVideos)
        const videos = targetGrade
          ? allVideos.filter((v) => v.grade === targetGrade)
          : allVideos

        // All progress rows for the target student across those videos.
        // We need seconds_watched here so the report reflects ACTUAL time
        // watched (not just "did they open this part once").
        // Per-student progress is cached so flipping between students
        // (admin) doesn't refetch the same student's data each click.
        const progressRows = await cached(
          `video_progress_student:${targetId}`, LIST_TTL,
          async () => {
            const { data, error } = await supabase
              .from('video_progress')
              .select('video_id, part_id, views_used, seconds_watched, last_watched_at')
              .eq('student_id', targetId)
            if (error) throw error
            return data || []
          }
        )

        // Group progress by video_id.
        const byVideo = new Map()
        for (const p of (progressRows || [])) {
          if (!byVideo.has(p.video_id)) byVideo.set(p.video_id, [])
          byVideo.get(p.video_id).push(p)
        }

        // Probe REAL durations from YouTube for every unique YT part. For
        // Drive-sourced parts we don't have an external API to query, so
        // we fall back to the admin-entered `duration_seconds` from the DB.
        const ytIds = videos.flatMap((v) =>
          (v.video_parts || [])
            .filter((p) => (p.source || 'youtube') === 'youtube' && p.youtube_id)
            .map((p) => p.youtube_id)
        )
        const durMap = await getYoutubeDurations(ytIds)
        if (cancelled) return

        const rows = videos.map((v) => {
          const parts = v.video_parts || []
          const progList = byVideo.get(v.id) || []
          // Map part_id → seconds_watched so we can credit each part by
          // ACTUAL time, not by a binary "opened" flag.
          const watchedByPart = new Map(
            progList.map((p) => [p.part_id, Math.max(0, p.seconds_watched || 0)])
          )

          const partSeconds = (p) => {
            // Drive parts → admin-entered duration; YouTube parts → oEmbed
            // result (cached). Fall back to 0 when neither is available.
            if ((p.source || 'youtube') === 'drive') {
              return parseInt(p.duration_seconds, 10) || 0
            }
            return durMap.get(p.youtube_id) || parseInt(p.duration_seconds, 10) || 0
          }
          const totalSecs = parts.reduce((s, p) => s + partSeconds(p), 0)
          // Per-part watched is capped at the part's own duration so a
          // small clock-drift can't push a part above 100%.
          const watchedSecs = parts.reduce((s, p) => {
            const dur  = partSeconds(p)
            const seen = watchedByPart.get(p.id) || 0
            return s + (dur ? Math.min(seen, dur) : seen)
          }, 0)

          // Progress is now driven by real seconds watched / total seconds.
          // Falls back to 0 when YouTube duration metadata isn't ready yet.
          const progress = totalSecs > 0
            ? Math.min(100, Math.round((watchedSecs / totalSecs) * 100))
            : 0

          let status = 'none'
          let statusText = 'لم تتم المشاهدة'
          if (progress >= 90) { status = 'completed'; statusText = 'تم المشاهدة بالكامل' }
          else if (progress > 0) { status = 'partial'; statusText = `تم مشاهدة ${progress}%` }

          const lastWatched = progList
            .map((p) => p.last_watched_at)
            .filter(Boolean)
            .sort()
            .pop()

          // Round minutes: ceil for total so a 30-sec outro shows 1 min,
          // but floor for watched so a student who watched 0:25 of a part
          // doesn't see "1 minute" credited.
          const totalMins = Math.ceil(totalSecs / 60)
          const watchedMins = Math.floor(watchedSecs / 60)

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
    <main className="cp-page">
      <div className="cp-container">

        {/* Back */}
        <button className="cp-crumbs-back" onClick={() => navigate(-1)} style={{ marginBottom: '1.5rem' }}>
          <i className="fas fa-arrow-right"></i>
          <span>رجوع</span>
        </button>

        {/* Header */}
        <div className="cp-page-header">
          <div className="cp-page-header-text">
            <h1>تقرير الفيديوهات</h1>
            <p>ملخص مشاهدات الفيديوهات التعليمية للطلاب</p>
          </div>
          <div className="cp-page-icon">
            <i className="fas fa-play-circle"></i>
          </div>
        </div>
        <div className="cp-header-divider"></div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--cp-text-muted)' }}>
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
          <div className="cp-target-banner">
            <div className="cp-avatar cp-avatar-purple">
              <i className="fas fa-user-graduate"></i>
            </div>
            <div className="cp-target-banner-body">
              <div className="cp-target-banner-label">
                <i className="fas fa-bullseye"></i> الطالب المستهدف
              </div>
              <div className="cp-target-banner-name">{studentName}</div>
              <div className="cp-target-banner-meta">
                {studentId && (
                  <span className="cp-id-pill"><i className="fas fa-id-badge"></i> {studentId}</span>
                )}
                <span><i className="fas fa-chart-line"></i> متوسط التقدم: {avgProgress}%</span>
                <span><i className="fas fa-video"></i> المُكتمل: {completed} من {total} فيديو</span>
              </div>
            </div>
          </div>
        )}

        {studentName && !isAdmin && (
          <VideosDashboard videosData={videosData} />
        )}

        {/* Stats */}
        <div className="cp-stats-row">
          <div className="cp-stat">
            <i className="fas fa-film"></i>
            <div>
              <div className="cp-stat-val">{total}</div>
              <div className="cp-stat-lbl">إجمالي الفيديوهات</div>
            </div>
          </div>
          <div className="cp-stat cp-stat-good">
            <i className="fas fa-check-circle"></i>
            <div>
              <div className="cp-stat-val">{completed}</div>
              <div className="cp-stat-lbl">مكتملة</div>
            </div>
          </div>
          <div className="cp-stat cp-stat-info">
            <i className="fas fa-adjust"></i>
            <div>
              <div className="cp-stat-val">{partial}</div>
              <div className="cp-stat-lbl">جزئية</div>
            </div>
          </div>
          <div className="cp-stat cp-stat-bad">
            <i className="fas fa-times-circle"></i>
            <div>
              <div className="cp-stat-val">{notWatched}</div>
              <div className="cp-stat-lbl">لم تُشاهَد</div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="cp-bulk-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="cp-filter-group" style={{ display: 'flex', gap: 8 }}>
            {[
              { key: 'all', label: 'الكل', icon: 'fa-th-list' },
              { key: 'completed', label: 'مكتمل', icon: 'fa-check' },
              { key: 'partial', label: 'جزئي', icon: 'fa-adjust' },
              { key: 'none', label: 'لم يُشاهَد', icon: 'fa-times' },
            ].map(({ key, label, icon }) => (
              <button key={key} className={`cp-btn ${currentFilter === key ? 'cp-btn-success' : 'cp-btn-ghost'}`} onClick={() => setCurrentFilter(key)} style={{ borderRadius: 8 }}>
                <i className={`fas ${icon}`}></i> {label}
              </button>
            ))}
          </div>
          {isAdmin && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={`cp-btn ${viewMode === 'table' ? 'cp-btn-info-active' : 'cp-btn-ghost'}`} onClick={() => setViewMode('table')} style={{ borderRadius: 8 }}>
                <i className="fas fa-table"></i> جدول
              </button>
              <button className={`cp-btn ${viewMode === 'cards' ? 'cp-btn-info-active' : 'cp-btn-ghost'}`} onClick={() => setViewMode('cards')} style={{ borderRadius: 8 }}>
                <i className="fas fa-th-large"></i> بطاقات
              </button>
            </div>
          )}
        </div>

        <div style={{ margin: '1rem 0', fontSize: '0.88rem', color: 'var(--cp-text-muted)', direction: 'rtl' }}>
          عرض <strong>{filteredVideos.length}</strong> فيديو من أصل {total}
        </div>

        {/* TABLE VIEW — admin only (the detailed report card) */}
        {isAdmin && viewMode === 'table' && (
          <div className="cp-table-card" id="vr-reportTable">
            <div className="cp-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}><i className="fas fa-clipboard-list" style={{ color: '#5bc2e7', marginLeft: 8 }}></i> تقرير المشاهدة التفصيلي</h2>
              </div>
              {isAdmin && (
                <button className="cp-crumbs-back" onClick={() => window.print()} style={{ padding: '6px 12px', background: 'transparent' }}>
                  <i className="fas fa-print"></i> طباعة
                </button>
              )}
            </div>
            <div className="cp-table-container">
              <table className="cp-table">
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
                    <tr><td colSpan={8} className="vr-empty-row" style={{ textAlign: 'center', padding: 24, color: 'var(--cp-text-muted)' }}>لا توجد فيديوهات تطابق هذا الفلتر</td></tr>
                  ) : (
                    filteredVideos.map((video, index) => (
                      <tr key={video.id}>
                        <td>{index + 1}</td>
                        <td style={{ fontWeight: 700 }}>
                          <i className="fas fa-play-circle" style={{ color: '#5bc2e7', marginLeft: 8 }}></i>
                          {video.title}
                        </td>
                        <td>{video.subject}</td>
                        <td>{video.date}</td>
                        <td>
                          <span className={`cp-badge ${video.progress >= 90 ? 'cp-badge-success' : video.progress > 0 ? 'cp-badge-warning' : 'cp-badge-danger'}`}>
                            <i className={`fas ${video.progress >= 90 ? 'fa-check-circle' : video.progress > 0 ? 'fa-adjust' : 'fa-times-circle'}`}></i> {video.progress >= 90 ? 'مكتمل' : video.progress > 0 ? 'جزئي' : 'لم يشاهد'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: 'var(--cp-divider)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ 
                                width: `${video.progress}%`, 
                                height: '100%', 
                                background: video.progress >= 75 ? '#10b981' : video.progress > 0 ? '#e2873d' : '#ef4444',
                                borderRadius: 3
                              }} />
                            </div>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{video.progress}%</span>
                          </div>
                        </td>
                        <td>{video.watchedTime} / {video.totalTime}</td>
                        <td>
                          <button className="cp-crumbs-back" onClick={() => openVideoDetail(video)} style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'transparent' }}>
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
          <div className="cp-home-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filteredVideos.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--cp-text-muted)' }}>لا توجد فيديوهات تطابق هذا الفلتر</div>
            ) : (
              filteredVideos.map((video) => (
                <div key={video.id} className="cp-section-card cp-accent-blue" onClick={() => openVideoDetail(video)} style={{ display: 'block', padding: '1.25rem', cursor: 'pointer', textAlign: 'right' }}>
                  <div className="vr-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div className="cp-section-icon" style={{ width: 40, height: 40, borderRadius: 10, margin: 0 }}>
                      <i className="fas fa-play-circle"></i>
                    </div>
                    <span className={`cp-badge ${video.progress >= 90 ? 'cp-badge-success' : video.progress > 0 ? 'cp-badge-warning' : 'cp-badge-danger'}`}>
                      <i className={`fas ${video.progress >= 90 ? 'fa-check-circle' : video.progress > 0 ? 'fa-adjust' : 'fa-times-circle'}`}></i> {video.progress >= 90 ? 'مكتمل' : video.progress > 0 ? 'جزئي' : 'لم يشاهد'}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 6px', color: 'var(--cp-text-main)' }}>{video.title}</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', margin: '0 0 12px' }}>{video.subject}</p>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ flex: 1, height: 6, background: 'var(--cp-divider)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ 
                        width: `${video.progress}%`, 
                        height: '100%', 
                        background: video.progress >= 75 ? '#10b981' : video.progress > 0 ? '#e2873d' : '#ef4444',
                        borderRadius: 3
                      }} />
                    </div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--cp-text-main)' }}>{video.progress}%</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--cp-text-muted)' }}>
                    <span><i className="fas fa-clock" style={{ marginLeft: 4 }}></i> {video.watchedTime} / {video.totalTime}</span>
                    <span><i className="fas fa-calendar-alt" style={{ marginLeft: 4 }}></i> {video.date}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* DETAIL MODAL */}
      {showModal && selectedVideo && (
        <div className="rp-modal-overlay" onClick={closeModal} role="dialog" aria-modal="true">
          <div className="rp-modal" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', color: 'var(--cp-text-main)', maxWidth: 420 }}>
            <div className="rp-modal-header" style={{ borderBottom: '1px solid var(--cp-divider)' }}>
              <div className="rp-modal-icon" style={{ background: 'linear-gradient(135deg, #5bc2e7, #8b5cf6)' }}>
                <i className="fas fa-play-circle"></i>
              </div>
              <div className="rp-modal-title">
                <h3 style={{ color: 'var(--cp-text-main)' }}>تفاصيل مشاهدة الفيديو</h3>
                <p style={{ color: 'var(--cp-text-muted)' }}>{selectedVideo.title}</p>
              </div>
              <button
                className="rp-modal-close"
                onClick={closeModal}
                aria-label="إغلاق"
                style={{ background: 'var(--cp-back-bg)', border: '1px solid var(--cp-back-border)', color: 'var(--cp-text-muted)' }}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="vr-modal-progress-ring" style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <svg viewBox="0 0 120 120" className="vr-ring-svg" style={{ width: '100%', height: '100%' }}>
                  <circle cx="60" cy="60" r="50" className="vr-ring-bg" style={{ fill: 'none', stroke: 'var(--cp-divider)', strokeWidth: 8 }} />
                  <circle cx="60" cy="60" r="50" className="vr-ring-fill"
                    style={{
                      fill: 'none',
                      strokeWidth: 8,
                      strokeLinecap: 'round',
                      strokeDasharray: `${(selectedVideo.progress / 100) * 314} 314`,
                      stroke: selectedVideo.progress >= 75 ? '#10b981' : selectedVideo.progress > 0 ? '#e2873d' : '#ef4444',
                      transform: 'rotate(-90deg)',
                      transformOrigin: '50% 50%',
                    }}
                  />
                </svg>
                <span className="vr-ring-pct" style={{ position: 'absolute', fontSize: '1.4rem', fontWeight: 800, color: 'var(--cp-text-main)' }}>{selectedVideo.progress}%</span>
              </div>

              <div className="vr-modal-details" style={{ width: '100%' }}>
                <div className="vr-modal-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                  <span className="vr-modal-label" style={{ color: 'var(--cp-text-muted)', fontWeight: 600 }}>الحالة</span>
                  <span className={`cp-badge ${selectedVideo.progress >= 90 ? 'cp-badge-success' : selectedVideo.progress > 0 ? 'cp-badge-warning' : 'cp-badge-danger'}`}>{selectedVideo.statusText}</span>
                </div>
                <div className="vr-modal-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                  <span className="vr-modal-label" style={{ color: 'var(--cp-text-muted)', fontWeight: 600 }}>وقت المشاهدة</span>
                  <span className="vr-modal-val" style={{ color: 'var(--cp-text-main)', fontWeight: 700 }}>{selectedVideo.watchedTime}</span>
                </div>
                <div className="vr-modal-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                  <span className="vr-modal-label" style={{ color: 'var(--cp-text-muted)', fontWeight: 600 }}>المدة الكاملة</span>
                  <span className="vr-modal-val" style={{ color: 'var(--cp-text-main)', fontWeight: 700 }}>{selectedVideo.totalTime}</span>
                </div>
                <div className="vr-modal-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: 'none' }}>
                  <span className="vr-modal-label" style={{ color: 'var(--cp-text-muted)', fontWeight: 600 }}>تاريخ آخر مشاهدة</span>
                  <span className="vr-modal-val" style={{ color: 'var(--cp-text-main)', fontWeight: 700 }}>{selectedVideo.date}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function VideosDashboard({ videosData }) {
  const total = videosData.length
  const completed = videosData.filter((v) => v.progress >= 75).length
  const partial = videosData.filter((v) => v.progress > 0 && v.progress < 75).length
  const notWatched = videosData.filter((v) => v.progress === 0).length
  const avgProgress = total > 0 ? Math.round(videosData.reduce((sum, v) => sum + v.progress, 0) / total) : 0

  // Donut values
  const strokeDash = (avgProgress / 100) * 251.2

  // Watch-state breakdown percentages
  const pctCompleted = total > 0 ? Math.round((completed / total) * 100) : 0
  const pctPartial = total > 0 ? Math.round((partial / total) * 100) : 0
  const pctNotWatched = total > 0 ? Math.max(0, 100 - pctCompleted - pctPartial) : 0

  // Filter first 5 videos for inline bar chart representation
  const recentVideos = videosData.slice(0, 5)

  const getInsightMessage = () => {
    if (total === 0) return 'لا توجد فيديوهات تعليمية مضافة بعد.'
    if (avgProgress === 0) return 'ابدأ بمشاهدة الفيديوهات التعليمية للتقدم في المنهج.'
    if (avgProgress >= 80) return 'ممتاز جداً! مشاهدتك للمحاضرات منتظمة ومستمرة. الاستمرار في متابعة الشرح أولاً بأول يضمن تفوقك الدراسي.'
    if (avgProgress >= 60) return 'مستوى تقدمك جيد جداً. تأكد من إكمال الفيديوهات التي شاهدت أجزاءً منها فقط للوصول للإلمام الكامل بالمنهج.'
    return 'معدل مشاهدتك للمحاضرات منخفض. يرجى تخصيص وقت كافٍ لمتابعة الفيديوهات المتأخرة لتجنب تراكم الدروس عليك.'
  }

  const getInsightIcon = () => {
    if (avgProgress >= 80) return 'fa-circle-play'
    if (avgProgress >= 60) return 'fa-clock'
    return 'fa-circle-exclamation'
  }

  const getInsightClass = () => {
    if (avgProgress >= 80) return 'vr-insight-excellent'
    if (avgProgress >= 60) return 'vr-insight-good'
    return 'vr-insight-warning'
  }

  return (
    <div className="cp-panel" style={{ padding: '1.6rem' }}>
      <h2 className="cp-panel-header" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.2rem', fontWeight: 700, margin: '0 0 20px' }}>
        <i className="fas fa-chart-line" style={{ color: '#5bc2e7' }}></i> لوحة تحليل مشاهدة المحاضرات والتقدم الدراسي
      </h2>

      <div className="vr-dashboard-layout">
        {/* Left: Overall watch donut progress */}
        <div className="vr-dashboard-donut-wrap">
          <div className="vr-dashboard-donut-inner">
            <svg viewBox="0 0 100 100" className="vr-donut-svg">
              <circle cx="50" cy="50" r="40" className="vr-donut-bg" style={{ fill: 'none', stroke: 'var(--cp-divider)', strokeWidth: 8 }} />
              <circle 
                cx="50" 
                cy="50" 
                r="40" 
                className="vr-donut-fill"
                style={{
                  fill: 'none',
                  strokeWidth: 8,
                  strokeLinecap: 'round',
                  strokeDasharray: `${strokeDash} 251.2`,
                  transform: 'rotate(-90deg)',
                  transformOrigin: '50% 50%',
                  stroke: '#5bc2e7'
                }}
              />
            </svg>
            <div className="vr-donut-text">
              <span className="vr-donut-num" style={{ color: 'var(--cp-text-main)', fontSize: '1.6rem', fontWeight: 800 }}>{avgProgress}%</span>
              <span className="vr-donut-lbl" style={{ color: 'var(--cp-text-muted)', fontSize: '0.72rem' }}>متوسط التقدم</span>
            </div>
          </div>

          <div className="vr-breakdown-container" style={{ width: '100%' }}>
            <h4 className="vr-breakdown-title-sub" style={{ color: 'var(--cp-text-main)', fontSize: '0.9rem', fontWeight: 700, marginBottom: 8 }}>نسب المشاهدة والتوزيع</h4>
            <div className="vr-breakdown-bar" style={{ height: 8, background: 'var(--cp-divider)', borderRadius: 4, overflow: 'hidden', display: 'flex', marginBottom: 12 }}>
              {pctCompleted > 0 && <div className="vr-bb-fill vr-bb-complete" style={{ width: `${pctCompleted}%`, background: '#10b981' }} title={`مكتمل: ${pctCompleted}%`} />}
              {pctPartial > 0 && <div className="vr-bb-fill vr-bb-partial" style={{ width: `${pctPartial}%`, background: '#e2873d' }} title={`جزئي: ${pctPartial}%`} />}
              {pctNotWatched > 0 && <div className="vr-bb-fill vr-bb-none" style={{ width: `${pctNotWatched}%`, background: 'var(--cp-divider)' }} title={`لم يشاهد: ${pctNotWatched}%`} />}
            </div>
            <div className="vr-donut-legend" style={{ display: 'flex', gap: 16, fontSize: '0.8rem', color: 'var(--cp-text-muted)' }}>
              <div><span className="legend-dot legend-complete" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10b981', marginInlineEnd: 6 }}></span> مكتمل ({completed})</div>
              <div><span className="legend-dot legend-partial" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#e2873d', marginInlineEnd: 6 }}></span> جزئي ({partial})</div>
              <div><span className="legend-dot legend-none" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--cp-divider)', marginInlineEnd: 6 }}></span> لم يشاهد ({notWatched})</div>
            </div>
          </div>
        </div>

        {/* Right: Progress bars for individual lectures */}
        <div className="vr-dashboard-chart-wrap" style={{ flex: 2 }}>
          <h3 className="vr-chart-header" style={{ color: 'var(--cp-text-main)', fontSize: '0.95rem', fontWeight: 700, margin: '0 0 16px' }}>تقدم مشاهدة آخر الفيديوهات</h3>
          {recentVideos.length === 0 ? (
            <div className="vr-chart-placeholder" style={{ border: '1px dashed var(--cp-divider)' }}>
              <i className="fas fa-video-slash" style={{ fontSize: '1.8rem', color: 'var(--cp-text-muted)' }}></i>
              <p style={{ color: 'var(--cp-text-muted)' }}>لا توجد محاضرات مدرجة لعرض إحصائيات تقدمها</p>
            </div>
          ) : (
            <div className="vr-chart-bars-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {recentVideos.map(v => (
                <div key={v.id} className="vr-chart-bar-row">
                  <div className="vr-bar-info" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.85rem' }}>
                    <span className="vr-bar-name" style={{ color: 'var(--cp-text-main)', fontWeight: 600 }} title={v.title}>{v.title}</span>
                    <span className="vr-bar-value" style={{ color: 'var(--cp-text-muted)' }}>{v.progress}%</span>
                  </div>
                  <div className="vr-bar-track" style={{ height: 6, background: 'var(--cp-divider)', borderRadius: 3, overflow: 'hidden' }}>
                    <div 
                      className={`vr-bar-fill ${v.progress >= 75 ? 'fill-complete' : v.progress > 0 ? 'fill-partial' : 'fill-none'}`} 
                      style={{ 
                        width: `${v.progress}%`,
                        height: '100%',
                        background: v.progress >= 75 ? '#10b981' : v.progress > 0 ? '#e2873d' : 'transparent',
                        borderRadius: 3
                      }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`vr-dashboard-insight ${getInsightClass()}`} style={{ 
        display: 'flex', 
        gap: 14, 
        padding: 16, 
        borderRadius: 12, 
        marginTop: 20, 
        background: avgProgress >= 80 ? 'rgba(16, 185, 129, 0.08)' : avgProgress >= 60 ? 'rgba(226, 135, 61, 0.08)' : 'rgba(239, 68, 68, 0.08)',
        border: `1px solid ${avgProgress >= 80 ? 'rgba(16, 185, 129, 0.15)' : avgProgress >= 60 ? 'rgba(226, 135, 61, 0.15)' : 'rgba(239, 68, 68, 0.15)'}`
      }}>
        <div className="vr-insight-icon-wrap" style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: avgProgress >= 80 ? 'rgba(16, 185, 129, 0.15)' : avgProgress >= 60 ? 'rgba(226, 135, 61, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          color: avgProgress >= 80 ? '#10b981' : avgProgress >= 60 ? '#e2873d' : '#ef4444',
          flexShrink: 0
        }}>
          <i className={`fas ${getInsightIcon()}`}></i>
        </div>
        <div className="vr-insight-content" style={{ flex: 1 }}>
          <h4 style={{ color: 'var(--cp-text-main)', fontSize: '0.95rem', fontWeight: 700, margin: '0 0 4px' }}>ملاحظات تقدم الفيديوهات</h4>
          <p style={{ color: 'var(--cp-text-muted)', fontSize: '0.88rem', margin: 0 }}>{getInsightMessage()}</p>
        </div>
      </div>
    </div>
  )
}
