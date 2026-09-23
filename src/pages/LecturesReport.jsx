import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTenant } from '../contexts/TenantContext'
import { getProfile } from '@backend/profilesApi'
import { supabase } from '@backend/supabase'
import { getLectureDetails, listLecturesForReporting } from '@backend/courseLecturesApi'
import { getYoutubeDurations } from '../services/youtubeMeta'
import { cached, LIST_TTL } from '../utils/cache'
import PrintReportHeader from '../components/PrintReportHeader'
import { GRADE_LABEL } from './ControlPanel/shared'
import './LecturesReport.css'

const fmtDate = (d) => {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date)) return '—'
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
}

export default function LecturesReport() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { tenantId } = useTenant()

  // 1. Current logged-in user auth check
  const isStaff = user?.role === 'admin' || user?.role === 'assistant' || user?.role === 'super_admin'
  const isAdmin = isStaff
  const currentUser = user

  // 2. Resolve target student ID (Server/Identity authoritative)
  // Non-staff students are locked to authenticated user?.id regardless of URL params.
  const urlStudentId = searchParams.get('studentId') || searchParams.get('id')
  const selectedStudentId = searchParams.get('studentId') || searchParams.get('id')
  const targetStudentId = isStaff ? (selectedStudentId || urlStudentId) : user?.id

  const [studentInfo, setStudentInfo] = useState({
    name: searchParams.get('student') || user?.name || '',
    phone: user?.phone || '',
    grade: user?.grade || '',
    group: user?.group || ''
  })

  // 3. Target Lecture ID state
  const paramLectureId = searchParams.get('lectureId')
  const [selectedLectureId, setSelectedLectureId] = useState(paramLectureId || '')
  const [availableLectures, setAvailableLectures] = useState([])
  const [loadingLecturesList, setLoadingLecturesList] = useState(false)

  // 4. Data states
  const [lectureData, setLectureData] = useState(null)
  const [videosList, setVideosList] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // 5. Drill-down modal state
  const [selectedVideoModal, setSelectedVideoModal] = useState(null)

  // Load student profile if target is different from current or missing info
  useEffect(() => {
    if (!targetStudentId) return
    let cancelled = false
    ;(async () => {
      try {
        if (targetStudentId === currentUser?.id && currentUser?.name) {
          setStudentInfo({
            name: currentUser.name,
            phone: currentUser.phone || '',
            grade: currentUser.grade || '',
            group: currentUser.group || ''
          })
        } else {
          const prof = await getProfile(targetStudentId)
          if (!cancelled && prof) {
            setStudentInfo({
              name: prof.name || 'طالب',
              phone: prof.phone || '',
              grade: prof.grade || '',
              group: prof.group || ''
            })
          }
        }
      } catch (err) {
        console.error('Failed to load student profile for lecture report:', err)
      }
    })()
    return () => { cancelled = true }
  }, [targetStudentId, currentUser])

  // Load available lectures for the student's grade
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoadingLecturesList(true)
        const gradeFilter = studentInfo.grade || null
        const lecs = await cached(`lectures-for-report:${gradeFilter || 'all'}`, LIST_TTL, () =>
          listLecturesForReporting({ grade: gradeFilter })
        )
        if (!cancelled) {
          setAvailableLectures(lecs || [])
          // If no lecture is currently selected, default to the first one available
          if (!selectedLectureId && (lecs || []).length > 0) {
            const firstId = lecs[0].id
            setSelectedLectureId(firstId)
            const nextParams = new URLSearchParams(searchParams)
            nextParams.set('lectureId', firstId)
            setSearchParams(nextParams, { replace: true })
          }
        }
      } catch (err) {
        console.error('Failed to load available lectures:', err)
      } finally {
        if (!cancelled) setLoadingLecturesList(false)
      }
    })()
    return () => { cancelled = true }
  }, [studentInfo.grade, selectedLectureId, searchParams, setSearchParams])

  // Sync selectedLectureId from URL
  useEffect(() => {
    if (paramLectureId && paramLectureId !== selectedLectureId) {
      setSelectedLectureId(paramLectureId)
    }
  }, [paramLectureId, selectedLectureId])

  // Main Report Data Fetching & Progress Calculations
  const loadLectureReport = useCallback(async () => {
    if (!selectedLectureId || !targetStudentId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError('')
    try {
      // 1. Fetch Lecture details + videos (ordered by lecture_videos.sort_order)
      const lectureDetails = await getLectureDetails(selectedLectureId)
      setLectureData(lectureDetails)

      const rawVideos = lectureDetails.videos || []
      if (rawVideos.length === 0) {
        setVideosList([])
        setLoading(false)
        return
      }

      // 2. Collect all video IDs in the lecture for a single batch query
      const videoIds = rawVideos.map(v => v.id)

      // 3. Batch query video_progress for the target student across all lecture videos
      const { data: progressRows, error: pErr } = await supabase
        .from('video_progress')
        .select('video_id, part_id, views_used, seconds_watched, last_watched_at')
        .eq('student_id', targetStudentId)
        .in('video_id', videoIds)

      if (pErr) throw pErr

      // Group progress rows by video_id
      const byVideo = new Map()
      for (const p of (progressRows || [])) {
        if (!byVideo.has(p.video_id)) byVideo.set(p.video_id, [])
        byVideo.get(p.video_id).push(p)
      }

      // 4. Probe YouTube durations for all unique YouTube parts across lecture videos
      const ytIds = rawVideos.flatMap(v =>
        (v.video_parts || [])
          .filter(p => (p.source || 'youtube') === 'youtube' && p.youtube_id)
          .map(p => p.youtube_id)
      )
      const durMap = await getYoutubeDurations(ytIds)

      // 5. Process each video preserving lecture_videos.sort_order
      const processedVideos = rawVideos.map(v => {
        const parts = v.video_parts || []
        const progList = byVideo.get(v.id) || []
        const watchedByPart = new Map(
          progList.map(p => [p.part_id, Math.max(0, p.seconds_watched || 0)])
        )

        const partSeconds = (p) => {
          if ((p.source || 'youtube') === 'drive') {
            return parseInt(p.duration_seconds, 10) || 0
          }
          return durMap.get(p.youtube_id) || parseInt(p.duration_seconds, 10) || 0
        }

        const totalSecs = parts.reduce((s, p) => s + partSeconds(p), 0)
        const watchedSecs = parts.reduce((s, p) => {
          const dur = partSeconds(p)
          const seen = watchedByPart.get(p.id) || 0
          return s + (dur ? Math.min(seen, dur) : seen)
        }, 0)

        // Progress percentage calculation (identical to VideosReport.jsx)
        const progress = totalSecs > 0
          ? Math.min(100, Math.round((watchedSecs / totalSecs) * 100))
          : 0

        // Status classification (identical to VideosReport.jsx)
        let status = 'none'
        let statusText = 'لم تتم المشاهدة'
        if (progress >= 90) {
          status = 'completed'
          statusText = 'تم المشاهدة بالكامل'
        } else if (progress > 0) {
          status = 'partial'
          statusText = `تم مشاهدة ${progress}%`
        }

        const lastWatched = progList
          .map(p => p.last_watched_at)
          .filter(Boolean)
          .sort()
          .pop()

        const totalMins = Math.ceil(totalSecs / 60)
        const watchedMins = Math.floor(watchedSecs / 60)

        return {
          id: v.id,
          sort_order: v.sort_order,
          title: v.title,
          totalSecs,
          watchedSecs,
          totalTime: `${totalMins} دقيقة`,
          watchedTime: `${watchedMins} دقيقة`,
          progress,
          status,
          statusText,
          date: fmtDate(lastWatched),
          partsCount: parts.length
        }
      })

      setVideosList(processedVideos)
    } catch (err) {
      console.error('Error generating lecture report:', err)
      setLoadError(err.message || 'تعذر تحميل تقرير المحاضرة')
    } finally {
      setLoading(false)
    }
  }, [selectedLectureId, targetStudentId])

  useEffect(() => {
    loadLectureReport()
  }, [loadLectureReport])

  // Handle lecture switch from dropdown
  const handleSelectLecture = (lecId) => {
    setSelectedLectureId(lecId)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('lectureId', lecId)
    setSearchParams(nextParams)
  }

  // ── Lecture Summary Metrics (Aggregation over video metrics) ──────────
  const lectureSummary = useMemo(() => {
    const totalVideos = videosList.length
    if (totalVideos === 0) {
      return {
        totalVideos: 0,
        completedVideos: 0,
        partialVideos: 0,
        unwatchedVideos: 0,
        completedVideosCount: 0,
        partialVideosCount: 0,
        unwatchedVideosCount: 0,
        totalDurationSec: 0,
        totalWatchedSec: 0,
        totalSecs: 0,
        watchedSecs: 0,
        totalTime: '0 دقيقة',
        watchedTime: '0 دقيقة',
        overallProgress: 0,
        statusText: 'لا توجد فيديوهات'
      }
    }

    const completedVideosCount = videosList.filter(v => v.progress >= 75).length
    const partialVideosCount = videosList.filter(v => v.progress > 0 && v.progress < 75).length
    const unwatchedVideosCount = videosList.filter(v => v.progress === 0).length

    const totalDurationSec = videosList.reduce((sum, v) => sum + v.totalSecs, 0)
    const totalWatchedSec = videosList.reduce((sum, v) => sum + v.watchedSecs, 0)

    const overallProgress = totalDurationSec > 0
      ? Math.min(100, Math.round((totalWatchedSec / totalDurationSec) * 100))
      : 0

    let statusText = 'لم تبدأ'
    if (overallProgress >= 90) statusText = 'مكتملة بالكامل'
    else if (overallProgress >= 75) statusText = 'مكتملة'
    else if (overallProgress > 0) statusText = `قيد المشاهدة (${overallProgress}%)`

    return {
      totalVideos,
      completedVideos: completedVideosCount,
      partialVideos: partialVideosCount,
      unwatchedVideos: unwatchedVideosCount,
      completedVideosCount,
      partialVideosCount,
      unwatchedVideosCount,
      totalDurationSec,
      totalWatchedSec,
      totalSecs: totalDurationSec,
      watchedSecs: totalWatchedSec,
      totalTime: `${Math.ceil(totalDurationSec / 60)} دقيقة`,
      watchedTime: `${Math.floor(totalWatchedSec / 60)} دقيقة`,
      overallProgress,
      statusText
    }
  }, [videosList])

  const handleBack = () => {
    if (window.history.state && typeof window.history.state.idx === 'number' && window.history.state.idx > 0) {
      navigate(-1)
    } else {
      navigate('/report')
    }
  }

  return (
    <main className="cp-page lr-page">
      <div className="cp-container lr-container">
        {/* Navigation & Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 10 }}>
          <button className="cp-crumbs-back" onClick={handleBack}>
            <i className="fas fa-arrow-right"></i>
            <span>رجوع للتقارير</span>
          </button>

          <button
            onClick={() => window.print()}
            className="cp-btn cp-btn-secondary"
            style={{ padding: '6px 14px', fontSize: '0.85rem' }}
          >
            <i className="fas fa-print"></i> طباعة التقرير
          </button>
        </div>

        <PrintReportHeader
          title={`تقرير المحاضرات التعليمية — ${lectureData?.title || ''}`}
          subtitle={`الطالب: ${studentInfo.name} | ${GRADE_LABEL[studentInfo.grade] || studentInfo.grade || ''}`}
        />

        <div className="cp-page-header">
          <div className="cp-page-header-text">
            <h1>تقرير المحاضرات التعليمية</h1>
            <p>متابعة تفصيلية لمشاهدات وإنجاز فيديوهات المحاضرة للطالب</p>
          </div>
          <div className="cp-page-icon" style={{ background: 'linear-gradient(135deg, #7c3aed, #6366f1)' }}>
            <i className="fas fa-graduation-cap"></i>
          </div>
        </div>
        <div className="cp-header-divider"></div>

        {/* Student Target Banner */}
        {studentInfo.name && (
          <div className="cp-target-banner" style={{ marginBottom: 20 }}>
            <div className="cp-avatar cp-avatar-purple">
              <i className="fas fa-user-graduate"></i>
            </div>
            <div className="cp-target-banner-body">
              <div className="cp-target-banner-label">
                <i className="fas fa-bullseye"></i> الطالب المستهدف
              </div>
              <div className="cp-target-banner-name">{studentInfo.name}</div>
              <div className="cp-target-banner-meta">
                {studentInfo.phone && (
                  <span className="cp-id-pill"><i className="fas fa-id-badge"></i> {studentInfo.phone}</span>
                )}
                {studentInfo.grade && (
                  <span><i className="fas fa-graduation-cap"></i> {GRADE_LABEL[studentInfo.grade] || studentInfo.grade}</span>
                )}
                {studentInfo.group && (
                  <span><i className="fas fa-users"></i> {studentInfo.group}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Lecture Selector Card */}
        <div className="lr-selector-card">
          <div className="lr-selector-title">
            <i className="fas fa-chalkboard-teacher"></i>
            <span>المحاضرة المستهدفة:</span>
          </div>
          {loadingLecturesList ? (
            <span style={{ fontSize: '0.85rem', color: 'var(--cp-text-muted)' }}>
              <i className="fas fa-spinner fa-spin"></i> جاري استرجاع المحاضرات...
            </span>
          ) : availableLectures.length === 0 ? (
            <span style={{ fontSize: '0.85rem', color: '#eab308' }}>
              لا توجد محاضرات مسجلة لهذه المرحلة
            </span>
          ) : (
            <select
              value={selectedLectureId}
              onChange={(e) => handleSelectLecture(e.target.value)}
              className="lr-select-input"
              aria-label="اختيار المحاضرة"
            >
              {availableLectures.map(lec => (
                <option key={lec.id} value={lec.id}>
                  {lec.title} {lec.chapter?.title ? `(${lec.chapter.title})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Loading and Error States */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--cp-text-muted)' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#7c3aed' }}></i>
            <p style={{ marginTop: 12, fontWeight: 700 }}>جارٍ تجميع بيانات المحاضرة وسجلات المشاهدة...</p>
          </div>
        )}

        {loadError && (
          <div style={{ textAlign: 'center', padding: 20, color: '#dc2626', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 12, marginBottom: 20 }}>
            <i className="fas fa-exclamation-triangle"></i> {loadError}
          </div>
        )}

        {/* Lecture Summary Hero Card */}
        {!loading && !loadError && lectureData && (
          <>
            <div className="lr-hero-card">
              <div className="lr-hero-ring-box">
                <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%' }}>
                  <circle cx="60" cy="60" r="50" style={{ fill: 'none', stroke: 'var(--cp-divider, #e2e8f0)', strokeWidth: 10 }} />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    style={{
                      fill: 'none',
                      strokeWidth: 10,
                      strokeLinecap: 'round',
                      strokeDasharray: `${(lectureSummary.overallProgress / 100) * 314} 314`,
                      stroke: lectureSummary.overallProgress >= 75 ? '#10b981' : lectureSummary.overallProgress > 0 ? '#7c3aed' : '#ef4444',
                      transform: 'rotate(-90deg)',
                      transformOrigin: '50% 50%',
                      transition: 'stroke-dasharray 0.5s ease'
                    }}
                  />
                </svg>
                <span style={{ position: 'absolute', fontSize: '1.4rem', fontWeight: 800, color: 'var(--cp-text-main, #0f172a)' }}>
                  {lectureSummary.overallProgress}%
                </span>
              </div>

              <div className="lr-hero-details">
                <div className="lr-hero-title-wrap">
                  <span className="lr-hero-badge">
                    <i className="fas fa-book-open"></i> {lectureData.chapter?.title || 'محاضرة تعليمية'}
                  </span>
                  <h2 className="lr-hero-title">{lectureData.title}</h2>
                  {lectureData.description && (
                    <p className="lr-hero-desc">{lectureData.description}</p>
                  )}
                </div>

                <div className="lr-hero-stats-row">
                  <div className="lr-stat-box">
                    <div className="lr-stat-val">{lectureSummary.totalVideos}</div>
                    <div className="lr-stat-lbl">إجمالي الفيديوهات</div>
                  </div>
                  <div className="lr-stat-box">
                    <div className="lr-stat-val" style={{ color: '#10b981' }}>{lectureSummary.completedVideos}</div>
                    <div className="lr-stat-lbl">مكتملة (≥75%)</div>
                  </div>
                  <div className="lr-stat-box">
                    <div className="lr-stat-val">{lectureSummary.watchedTime}</div>
                    <div className="lr-stat-lbl">وقت المشاهدة الفعلي</div>
                  </div>
                  <div className="lr-stat-box">
                    <div className="lr-stat-val">{lectureSummary.totalTime}</div>
                    <div className="lr-stat-lbl">المدة الكاملة للمحاضرة</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Video Breakdown List */}
            <div className="lr-breakdown-section">
              <div className="lr-section-header">
                <h3 className="lr-section-title">
                  <i className="fas fa-play-circle" style={{ color: '#d97706' }}></i>
                  <span>فيديوهات المحاضرة ({videosList.length})</span>
                </h3>
              </div>

              {videosList.length === 0 ? (
                <div className="lr-empty-card">
                  <i className="fas fa-video-slash"></i>
                  <h3>لا توجد فيديوهات مرتبطة بهذه المحاضرة حتى الآن</h3>
                  <p>يمكن لإدارة المنصة إضافة فيديوهات لهذه المحاضرة من لوحة التحكم</p>
                </div>
              ) : (
                <div className="lr-videos-grid">
                  {videosList.map((video, idx) => {
                    const isHigh = video.progress >= 75
                    const isPartial = video.progress > 0 && video.progress < 75
                    const barColor = isHigh ? '#10b981' : isPartial ? '#d97706' : '#ef4444'

                    return (
                      <div key={video.id} className="lr-video-item-card">
                        <div className="lr-video-main">
                          <div className="lr-video-icon">
                            <i className="fas fa-play"></i>
                          </div>
                          <div>
                            <div className="lr-video-title">
                              <span style={{ marginInlineEnd: 6, color: 'var(--cp-text-muted)', fontSize: '0.82rem' }}>
                                #{idx + 1}
                              </span>
                              {video.title}
                            </div>
                            <div className="lr-video-meta">
                              <span><i className="fas fa-clock"></i> {video.watchedTime} / {video.totalTime}</span>
                              {video.partsCount > 1 && <span><i className="fas fa-layer-group"></i> {video.partsCount} أجزاء</span>}
                              <span><i className="fas fa-calendar-alt"></i> {video.date}</span>
                            </div>
                          </div>
                        </div>

                        <div className="lr-video-progress-box">
                          <div className="lr-progress-track">
                            <div
                              className="lr-progress-fill"
                              style={{ width: `${video.progress}%`, background: barColor }}
                            />
                          </div>
                          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--cp-text-main)' }}>
                            {video.progress}%
                          </span>
                          <span className={`cp-badge ${isHigh ? 'cp-badge-success' : isPartial ? 'cp-badge-warning' : 'cp-badge-danger'}`} style={{ fontSize: '0.75rem' }}>
                            {video.statusText}
                          </span>
                        </div>

                        <div className="lr-video-actions">
                          <button
                            onClick={() => setSelectedVideoModal(video)}
                            className="cp-btn cp-btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                            title="تفاصيل المشاهدة"
                          >
                            <i className="fas fa-chart-pie"></i> تفاصيل
                          </button>

                          <button
                            onClick={() => navigate(`/videos-report?id=${targetStudentId}&student=${encodeURIComponent(studentInfo.name)}`)}
                            className="cp-btn"
                            style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(124, 58, 237, 0.08)', color: '#7c3aed' }}
                            title="الانتقال لتقرير الفيديوهات العام"
                          >
                            <i className="fas fa-arrow-up-right-from-square"></i> تقرير الفيديو
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Drill-down Detail Modal */}
        {selectedVideoModal && (
          <div className="rp-modal-overlay" onClick={() => setSelectedVideoModal(null)} role="dialog" aria-modal="true">
            <div className="rp-modal" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', color: 'var(--cp-text-main)', maxWidth: 420 }}>
              <div className="rp-modal-header" style={{ borderBottom: '1px solid var(--cp-divider)' }}>
                <div className="rp-modal-icon" style={{ background: 'linear-gradient(135deg, #7c3aed, #6366f1)' }}>
                  <i className="fas fa-play-circle"></i>
                </div>
                <div className="rp-modal-title">
                  <h3 style={{ color: 'var(--cp-text-main)' }}>تفاصيل مشاهدة الفيديو</h3>
                  <p style={{ color: 'var(--cp-text-muted)' }}>{selectedVideoModal.title}</p>
                </div>
                <button
                  className="rp-modal-close"
                  onClick={() => setSelectedVideoModal(null)}
                  aria-label="إغلاق"
                  style={{ background: 'var(--cp-back-bg)', border: '1px solid var(--cp-back-border)', color: 'var(--cp-text-muted)' }}
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                  <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%' }}>
                    <circle cx="60" cy="60" r="50" style={{ fill: 'none', stroke: 'var(--cp-divider)', strokeWidth: 8 }} />
                    <circle
                      cx="60"
                      cy="60"
                      r="50"
                      style={{
                        fill: 'none',
                        strokeWidth: 8,
                        strokeLinecap: 'round',
                        strokeDasharray: `${(selectedVideoModal.progress / 100) * 314} 314`,
                        stroke: selectedVideoModal.progress >= 75 ? '#10b981' : selectedVideoModal.progress > 0 ? '#d97706' : '#ef4444',
                        transform: 'rotate(-90deg)',
                        transformOrigin: '50% 50%'
                      }}
                    />
                  </svg>
                  <span style={{ position: 'absolute', fontSize: '1.4rem', fontWeight: 800, color: 'var(--cp-text-main)' }}>
                    {selectedVideoModal.progress}%
                  </span>
                </div>

                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                    <span style={{ color: 'var(--cp-text-muted)', fontWeight: 600 }}>الحالة</span>
                    <span className={`cp-badge ${selectedVideoModal.progress >= 90 ? 'cp-badge-success' : selectedVideoModal.progress > 0 ? 'cp-badge-warning' : 'cp-badge-danger'}`}>
                      {selectedVideoModal.statusText}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                    <span style={{ color: 'var(--cp-text-muted)', fontWeight: 600 }}>وقت المشاهدة الفعلي</span>
                    <span style={{ color: 'var(--cp-text-main)', fontWeight: 700 }}>{selectedVideoModal.watchedTime}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                    <span style={{ color: 'var(--cp-text-muted)', fontWeight: 600 }}>المدة الكاملة</span>
                    <span style={{ color: 'var(--cp-text-main)', fontWeight: 700 }}>{selectedVideoModal.totalTime}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
                    <span style={{ color: 'var(--cp-text-muted)', fontWeight: 600 }}>تاريخ آخر مشاهدة</span>
                    <span style={{ color: 'var(--cp-text-main)', fontWeight: 700 }}>{selectedVideoModal.date}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
