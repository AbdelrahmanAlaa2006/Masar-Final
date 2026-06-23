import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import './VideosGroupReport.css'
import { listStudents } from '@backend/profilesApi'
import { listVideos } from '@backend/videosApi'
import { supabase } from '@backend/supabase'
import { getYoutubeDurations } from '../services/youtubeMeta'
import { cached, LIST_TTL } from '../utils/cache'

import { GRADE_LABEL, GRADE_ORDER } from './ControlPanel/shared'

const initials = (name = '') => {
  return name.trim().split(' ').map(n => n[0]).slice(0, 2).join('')
}

export default function VideosGroupReport() {
  const navigate = useNavigate()

  const [students, setStudents] = useState([])   // real profiles
  const [videos, setVideos]     = useState([])   // real videos
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [currentGrade, setCurrentGrade] = useState('') // DB enum value
  const [currentGroup, setCurrentGroup] = useState('') // class group label, '' = all
  const [currentVideo, setCurrentVideo] = useState('') // video id
  const [currentFilter, setCurrentFilter] = useState('all')

  const [allStudentsData, setAllStudentsData] = useState([])
  const [displayedStudents, setDisplayedStudents] = useState([])
  const [reportLoading, setReportLoading] = useState(false)

  // ── Initial load: real students + real videos ───────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [s, v] = await Promise.all([
          cached('students', LIST_TTL, listStudents),
          cached('videos', LIST_TTL, listVideos),
        ])
        if (cancelled) return
        setStudents(s)
        setVideos(v)
      } catch (e) {
        if (!cancelled) setLoadError(e.message || 'تعذر تحميل البيانات')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Grades that actually have students enrolled, in fixed order.
  const availableGrades = useMemo(() => {
    const set = new Set(students.map(s => s.grade).filter(Boolean))
    return GRADE_ORDER.filter(g => set.has(g))
  }, [students])

  const videosForGrade = useMemo(
    () => videos.filter(v => v.grade === currentGrade),
    [videos, currentGrade]
  )
  // All students in the selected grade — used to derive group chips.
  const studentsInGrade = useMemo(
    () => students.filter(s => s.grade === currentGrade),
    [students, currentGrade]
  )

  // Distinct, non-empty groups within the selected grade. Sorted
  // alphabetically so the chip order is stable across renders.
  const groupsForGrade = useMemo(() => {
    const set = new Set(
      studentsInGrade.map(s => (s.group || '').trim()).filter(Boolean)
    )
    return [...set].sort((a, b) => a.localeCompare(b, 'ar'))
  }, [studentsInGrade])

  // Students after the (optional) group filter is applied. When
  // currentGroup is '' (الكل) we keep every student in the grade.
  const studentsForGrade = useMemo(() => {
    if (!currentGroup) return studentsInGrade
    return studentsInGrade.filter(s => (s.group || '').trim() === currentGroup)
  }, [studentsInGrade, currentGroup])

  const selectGrade = (grade) => {
    setCurrentGrade(grade)
    setCurrentGroup('')
    setCurrentVideo('')
    setAllStudentsData([])
    setDisplayedStudents([])
    setCurrentFilter('all')
  }

  const selectGroup = (group) => {
    setCurrentGroup(group)
    // Re-running the report with the new group scope means the cached
    // rows would be stale — clear and let the admin re-pick the video.
    setCurrentVideo('')
    setAllStudentsData([])
    setDisplayedStudents([])
    setCurrentFilter('all')
  }

  const handleVideoChange = (videoId) => {
    setCurrentVideo(videoId)
    if (videoId) loadReport(videoId)
    else { setAllStudentsData([]); setDisplayedStudents([]) }
  }

  // ── Compute per-student watch progress for the selected video ─
  const loadReport = async (videoId) => {
    const video = videos.find(v => v.id === videoId)
    if (!video) return
    const parts = video.video_parts || []
    const totalParts = parts.length || 0
    const gradeStudents = studentsForGrade
    if (gradeStudents.length === 0) {
      setAllStudentsData([]); setDisplayedStudents([]); return
    }

    setReportLoading(true)
    try {
      // Real duration sourced from YouTube itself (minutes, ceiled).
      // Cached per session, so flipping between videos is cheap after
      // the first probe.
      const partIds = parts.map(p => p.youtube_id).filter(Boolean)
      const durMap = await getYoutubeDurations(partIds)
      const totalSeconds = parts.reduce((s, p) => s + (durMap.get(p.youtube_id) || 0), 0)
      const totalMinutes = Math.ceil(totalSeconds / 60)

      const ids = gradeStudents.map(s => s.id)
      // Same cache trick as ExamsGroupReport — flipping back to a
      // previously-viewed video doesn't hit the DB again within 5min.
      const cacheKey = `video_progress:${videoId}:${currentGrade || 'all'}`
      const progressRows = await cached(cacheKey, LIST_TTL, async () => {
        const { data, error } = await supabase
          .from('video_progress')
          .select('student_id, part_id, views_used, last_watched_at')
          .eq('video_id', videoId)
          .in('student_id', ids)
        if (error) throw error
        return data || []
      })

      // group progress rows by student
      const byStudent = {}
      for (const r of (progressRows || [])) {
        if (!byStudent[r.student_id]) byStudent[r.student_id] = []
        byStudent[r.student_id].push(r)
      }

      const rows = gradeStudents.map(stu => {
        const rs = byStudent[stu.id] || []
        const watchedParts = rs.filter(r => (r.views_used || 0) > 0).length
        const percentage = totalParts > 0
          ? Math.round((watchedParts / totalParts) * 100)
          : 0
        const watchedTime = Math.floor((percentage / 100) * totalMinutes)
        const lastWatched = rs.reduce((max, r) => {
          const t = r.last_watched_at ? new Date(r.last_watched_at).getTime() : 0
          return t > max ? t : max
        }, 0)
        const dateStr = lastWatched
          ? new Date(lastWatched).toLocaleDateString('ar-EG')
          : '—'
        return {
          name: stu.name,
          id: stu.phone || stu.id.slice(0, 8),
          group: (stu.group || '').trim() || GRADE_LABEL[stu.grade] || '',
          video: video.title,
          date: dateStr,
          percentage,
          status: percentage >= 75 ? 'مكتمل' : 'غير مكتمل',
          watchedTime: `${watchedTime} دقيقة`,
          totalTime: totalMinutes ? `${totalMinutes} دقيقة` : '—',
        }
      })

      setAllStudentsData(rows)
      setDisplayedStudents(rows)
    } catch (e) {
      setLoadError(e.message || 'تعذر تحميل تقرير الفيديو')
    } finally {
      setReportLoading(false)
    }
  }

  const filterStudents = (filter) => {
    setCurrentFilter(filter)
    let filteredData = allStudentsData
    switch (filter) {
      case 'complete': filteredData = allStudentsData.filter((s) => s.percentage >= 75); break
      case 'partial':  filteredData = allStudentsData.filter((s) => s.percentage > 0 && s.percentage <= 50); break
      case 'none':     filteredData = allStudentsData.filter((s) => s.percentage === 0); break
      default:         filteredData = allStudentsData
    }
    setDisplayedStudents(filteredData)
  }

  // Summary stats
  const totalStudents = allStudentsData.length
  const completeCount = allStudentsData.filter((s) => s.percentage >= 75).length
  const partialCount  = allStudentsData.filter((s) => s.percentage > 0 && s.percentage < 75).length
  const noneCount     = allStudentsData.filter((s) => s.percentage === 0).length
  const avgProgress = totalStudents > 0
    ? Math.round(allStudentsData.reduce((s, x) => s + x.percentage, 0) / totalStudents)
    : 0
  const completeRate = totalStudents > 0 ? Math.round((completeCount / totalStudents) * 100) : 0

  if (loading) {
    return (
      <main className="cp-page">
        <div className="cp-container">
          <div style={{textAlign:'center', padding:'40px', color: 'var(--cp-text-muted)'}}>
            <i className="fas fa-spinner fa-spin" style={{fontSize:'2rem'}}></i>
            <p style={{ marginTop: 12 }}>جاري التحميل...</p>
          </div>
        </div>
      </main>
    )
  }

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
            <h1>التقرير الجماعي للفيديوهات</h1>
            <p>متابعة مشاهدات الطلاب المسجلين وتحليل نشاط الصفوف</p>
          </div>
          <div className="cp-page-icon">
            <i className="fas fa-chart-line"></i>
          </div>
        </div>
        <div className="cp-header-divider"></div>

        {loadError && (
          <div style={{background:'#fee2e2', color:'#991b1b', padding:'12px', borderRadius:12, marginBottom: 20}}>
            <p style={{margin:0}}>{loadError}</p>
          </div>
        )}

        {/* Stepper */}
        <div className="vgr-stepper">
          <div className={`vgr-step ${currentGrade ? 'done' : 'active'}`}>
            <div className="vgr-step-num">
              {currentGrade ? <i className="fas fa-check"></i> : 1}
            </div>
            <span>الصف</span>
          </div>
          <div className="vgr-step-line"></div>
          <div className={`vgr-step ${currentVideo ? 'done' : currentGrade ? 'active' : ''}`}>
            <div className="vgr-step-num">
              {currentVideo ? <i className="fas fa-check"></i> : 2}
            </div>
            <span>الفيديو</span>
          </div>
        </div>

        {/* Grade */}
        <div className="cp-panel" style={{ padding: '1.6rem' }}>
          <h2 className="cp-panel-header" style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-school" style={{ color: '#5bc2e7' }}></i>
            <span>اختر الصف الدراسي</span>
          </h2>
          {availableGrades.length === 0 ? (
            <p style={{textAlign:'center', color:'var(--cp-text-muted)'}}>لا يوجد طلاب مسجلون بعد.</p>
          ) : (
            <div className="cp-group-picker" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {availableGrades.map((grade) => {
                const active = currentGrade === grade
                const count = students.filter(s => s.grade === grade).length
                return (
                  <button
                    key={grade}
                    className={`cp-btn ${active ? 'cp-btn-success' : 'cp-btn-ghost'}`}
                    onClick={() => selectGrade(grade)}
                    style={{ borderRadius: 999 }}
                  >
                    <i className="fas fa-graduation-cap"></i>
                    <span>{GRADE_LABEL[grade]}</span>
                    <span className="cp-id-pill cp-id-pill-sm" style={{ marginInlineStart: 6, background: active ? 'rgba(255, 255, 255, 0.2)' : 'rgba(91, 194, 231, 0.1)', color: active ? '#fff' : '#5bc2e7' }}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Group */}
        {currentGrade && groupsForGrade.length > 0 && (
          <div className="cp-panel" style={{ padding: '1.6rem' }}>
            <h2 className="cp-panel-header" style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-user-group" style={{ color: '#5bc2e7' }}></i>
              <span>اختر المجموعة</span>
            </h2>
            <div className="cp-group-picker" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <button
                className={`cp-btn ${currentGroup === '' ? 'cp-btn-success' : 'cp-btn-ghost'}`}
                onClick={() => selectGroup('')}
                style={{ borderRadius: 999 }}
              >
                <i className="fas fa-layer-group"></i>
                <span>كل المجموعات</span>
                <span className="cp-id-pill cp-id-pill-sm" style={{ marginInlineStart: 6, background: currentGroup === '' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(91, 194, 231, 0.1)', color: currentGroup === '' ? '#fff' : '#5bc2e7' }}>
                  {studentsInGrade.length}
                </span>
              </button>
              {groupsForGrade.map((g) => {
                const active = currentGroup === g
                const count = studentsInGrade.filter(s => (s.group || '').trim() === g).length
                return (
                  <button
                    key={g}
                    className={`cp-btn ${active ? 'cp-btn-success' : 'cp-btn-ghost'}`}
                    onClick={() => selectGroup(g)}
                    style={{ borderRadius: 999 }}
                  >
                    <i className="fas fa-user-group"></i>
                    <span>{g}</span>
                    <span className="cp-id-pill cp-id-pill-sm" style={{ marginInlineStart: 6, background: active ? 'rgba(255, 255, 255, 0.2)' : 'rgba(91, 194, 231, 0.1)', color: active ? '#fff' : '#5bc2e7' }}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Video */}
        {currentGrade && (
          <div className="cp-panel" style={{ padding: '1.6rem' }}>
            <h2 className="cp-panel-header" style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-play-circle" style={{ color: '#5bc2e7' }}></i>
              <span>اختر الفيديو</span>
            </h2>
            {videosForGrade.length === 0 ? (
              <p style={{textAlign:'center', color:'var(--cp-text-muted)'}}>لا توجد فيديوهات منشورة لهذا الصف.</p>
            ) : (
              <div className="cp-search" style={{ margin: 0, maxWidth: 500 }}>
                <i className="fas fa-film" style={{ right: 14, color: 'var(--cp-text-muted)' }}></i>
                <select
                  value={currentVideo}
                  onChange={(e) => handleVideoChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.8rem 2.5rem 0.8rem 1.5rem',
                    borderRadius: 10,
                    border: '1px solid var(--cp-input-border)',
                    background: 'var(--cp-input-bg)',
                    color: 'var(--cp-text-main)',
                    fontFamily: 'Tajawal, sans-serif',
                    fontSize: '0.92rem',
                    cursor: 'pointer',
                    appearance: 'none',
                    WebkitAppearance: 'none'
                  }}
                >
                  <option value="" style={{ background: 'var(--cp-card-bg)', color: 'var(--cp-text-main)' }}>-- اختر الفيديو --</option>
                  {videosForGrade.map((video) => (
                    <option key={video.id} value={video.id} style={{ background: 'var(--cp-card-bg)', color: 'var(--cp-text-main)' }}>{video.title}</option>
                  ))}
                </select>
                <i className="fas fa-chevron-down" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--cp-text-muted)', pointerEvents: 'none' }}></i>
              </div>
            )}
          </div>
        )}

        {reportLoading && (
          <div style={{textAlign:'center', padding:'20px', color: 'var(--cp-text-muted)'}}>
            <i className="fas fa-spinner fa-spin"></i>
            <span style={{marginInlineStart:8}}>جاري حساب التقرير...</span>
          </div>
        )}

        {/* Summary */}
        {displayedStudents.length > 0 && (
          <div className="cp-stats-row" style={{ gridTemplateColumns: 'repeat(6, 1fr)', marginBottom: 20 }}>
            <div className="cp-stat">
              <i className="fas fa-users" style={{ color: '#5bc2e7', background: 'rgba(91, 194, 231, 0.1)' }}></i>
              <div>
                <div className="cp-stat-val">{totalStudents}</div>
                <div className="cp-stat-lbl">إجمالي الطلاب</div>
              </div>
            </div>
            <div className="cp-stat cp-stat-good">
              <i className="fas fa-check-circle"></i>
              <div>
                <div className="cp-stat-val">{completeCount}</div>
                <div className="cp-stat-lbl">شاهدوا كامل</div>
              </div>
            </div>
            <div className="cp-stat cp-stat-info">
              <i className="fas fa-adjust"></i>
              <div>
                <div className="cp-stat-val">{partialCount}</div>
                <div className="cp-stat-lbl">جزئياً</div>
              </div>
            </div>
            <div className="cp-stat cp-stat-bad">
              <i className="fas fa-times-circle"></i>
              <div>
                <div className="cp-stat-val">{noneCount}</div>
                <div className="cp-stat-lbl">لم يشاهدوا</div>
              </div>
            </div>
            <div className="cp-stat cp-stat-good">
              <i className="fas fa-percentage" style={{ color: 'var(--cp-text-main)', background: 'var(--cp-hover-bg)' }}></i>
              <div>
                <div className="cp-stat-val">{avgProgress}%</div>
                <div className="cp-stat-lbl">متوسط التقدم</div>
              </div>
            </div>
            <div className="cp-stat cp-stat-good">
              <i className="fas fa-trophy" style={{ color: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)' }}></i>
              <div>
                <div className="cp-stat-val">{completeRate}%</div>
                <div className="cp-stat-lbl">نسبة الإكمال</div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        {currentVideo && allStudentsData.length > 0 && (
          <div className="cp-panel" style={{ padding: '1.6rem' }}>
            <h2 className="cp-panel-header" style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-filter" style={{ color: '#5bc2e7' }}></i>
              <span>تصفية النتائج</span>
            </h2>
            <div className="cp-group-picker" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {[
                { key: 'all', label: 'الجميع', icon: 'fa-th-list' },
                { key: 'complete', label: 'شاهدوا كامل (≥75%)', icon: 'fa-check' },
                { key: 'partial', label: 'نصف أو أقل (≤50%)', icon: 'fa-adjust' },
                { key: 'none', label: 'لم يشاهدوا', icon: 'fa-times' },
              ].map(({ key, label, icon }) => {
                const active = currentFilter === key
                return (
                  <button
                    key={key}
                    className={`cp-btn ${active ? 'cp-btn-success' : 'cp-btn-ghost'}`}
                    onClick={() => filterStudents(key)}
                    style={{ borderRadius: 8 }}
                  >
                    <i className={`fas ${icon}`}></i>
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Report Table */}
        {displayedStudents.length > 0 && (
          <div className="cp-table-card" id="vgr-reportTable">
            <div className="cp-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
                  <i className="fas fa-clipboard-list" style={{ color: '#5bc2e7', marginLeft: 8 }}></i>
                  تقرير المشاهدة التفصيلي
                  <span className="cp-id-pill" style={{ marginInlineStart: 8 }}>{displayedStudents.length}</span>
                </h2>
              </div>
              <button onClick={() => window.print()} className="cp-crumbs-back" style={{ padding: '6px 12px', background: 'transparent' }}>
                <i className="fas fa-print"></i>
                <span>طباعة التقرير</span>
              </button>
            </div>

            <div className="cp-table-container">
              <table className="cp-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>اسم الطالب</th>
                    <th>رقم الطالب</th>
                    <th>الصف / المجموعة</th>
                    <th>آخر مشاهدة</th>
                    <th>الحالة</th>
                    <th>نسبة المشاهدة</th>
                    <th>الوقت</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedStudents.map((student, index) => (
                    <tr key={student.id + index}>
                      <td>{index + 1}</td>
                      <td style={{ fontWeight: 700 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="cp-avatar cp-avatar-purple" style={{ width: 28, height: 28, fontSize: '0.7rem' }}>
                            {initials(student.name)}
                          </div>
                          <span>{student.name}</span>
                        </div>
                      </td>
                      <td><span className="cp-id-pill">{student.id}</span></td>
                      <td>{student.group}</td>
                      <td>{student.date}</td>
                      <td>
                        <span className={`cp-badge ${student.percentage >= 75 ? 'cp-badge-success' : student.percentage > 0 ? 'cp-badge-warning' : 'cp-badge-danger'}`}>
                          <i className={`fas ${student.percentage >= 75 ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                          {student.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--cp-divider)', borderRadius: 3, overflow: 'hidden' }}>
                            <div
                              style={{ 
                                width: `${student.percentage}%`,
                                height: '100%',
                                background: student.percentage >= 75 ? '#10b981' : student.percentage >= 50 ? '#e2873d' : '#ef4444',
                                borderRadius: 3
                              }}
                            ></div>
                          </div>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{student.percentage}%</span>
                        </div>
                      </td>
                      <td>{student.watchedTime} / {student.totalTime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
