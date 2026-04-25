import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import './VideosGroupReport.css'
import { listStudents } from '@backend/profilesApi'
import { listVideos } from '@backend/videosApi'
import { supabase } from '@backend/supabase'
import { getYoutubeDurations } from '../services/youtubeMeta'
import { useI18n } from '../i18n'

const GRADE_ORDER = ['first-prep', 'second-prep', 'third-prep']

export default function VideosGroupReport() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()

  const GRADE_LABEL = {
    'first-prep':  t('grades.first'),
    'second-prep': t('grades.second'),
    'third-prep':  t('grades.third'),
  }

  const [students, setStudents] = useState([])   // real profiles
  const [videos, setVideos]     = useState([])   // real videos
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [currentGrade, setCurrentGrade] = useState('') // DB enum value
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
        const [s, v] = await Promise.all([listStudents(), listVideos()])
        if (cancelled) return
        setStudents(s)
        setVideos(v)
      } catch (e) {
        if (!cancelled) setLoadError(e.message || (lang === 'ar' ? 'تعذر تحميل البيانات' : 'Failed to load data'))
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
  const studentsForGrade = useMemo(
    () => students.filter(s => s.grade === currentGrade),
    [students, currentGrade]
  )

  const selectGrade = (grade) => {
    setCurrentGrade(grade)
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
      const { data: progressRows, error } = await supabase
        .from('video_progress')
        .select('student_id, part_id, views_used, seconds_watched, last_watched_at')
        .eq('video_id', videoId)
        .in('student_id', ids)
      if (error) throw error

      // group progress rows by student
      const byStudent = {}
      for (const r of (progressRows || [])) {
        if (!byStudent[r.student_id]) byStudent[r.student_id] = []
        byStudent[r.student_id].push(r)
      }

      // Map part_id -> youtube_id so we can clamp watched-seconds to the
      // real part length when computing percentage per student.
      const partDurById = new Map(
        parts.map(p => [p.id, durMap.get(p.youtube_id) || 0])
      )

      const rows = gradeStudents.map(stu => {
        const rs = byStudent[stu.id] || []
        const watchedSecs = rs.reduce((s, r) => {
          const dur = partDurById.get(r.part_id) || 0
          const raw = r.seconds_watched || 0
          return s + (dur ? Math.min(raw, dur) : raw)
        }, 0)
        const percentage = totalSeconds > 0
          ? Math.min(100, Math.round((watchedSecs / totalSeconds) * 100))
          : 0
        const watchedTime = Math.ceil(watchedSecs / 60)
        const lastWatched = rs.reduce((max, r) => {
          const t = r.last_watched_at ? new Date(r.last_watched_at).getTime() : 0
          return t > max ? t : max
        }, 0)
        const dateStr = lastWatched
          ? new Date(lastWatched).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')
          : '—'
        return {
          name: stu.name,
          id: stu.phone || stu.id.slice(0, 8),
          group: GRADE_LABEL[stu.grade] || '',
          video: video.title,
          date: dateStr,
          percentage,
          status: percentage >= 75 ? (t('reports.completedLabel') || (lang === 'ar' ? 'مكتمل' : 'Completed')) : (t('reports.resultNotTaken') || (lang === 'ar' ? 'غير مكتمل' : 'Incomplete')),
          watchedTime: `${watchedTime} ${lang === 'ar' ? 'دقيقة' : 'min'}`,
          totalTime: totalMinutes ? `${totalMinutes} ${lang === 'ar' ? 'دقيقة' : 'min'}` : '—',
        }
      })

      setAllStudentsData(rows)
      setDisplayedStudents(rows)
    } catch (e) {
      setLoadError(e.message || (lang === 'ar' ? 'تعذر تحميل تقرير الفيديو' : 'Failed to load report'))
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
      <main className="vgr-page">
        <div className="vgr-container">
          <div className="vgr-header" style={{textAlign:'center', padding:'40px'}}>
            <i className="fas fa-spinner fa-spin" style={{fontSize:'2rem'}}></i>
            <p>{t('common.loading')}...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="vgr-page">
      <div className="vgr-container">

        {/* Back */}
        <button className="vgr-back-btn" onClick={() => navigate(-1)}>
          <i className={`fas ${lang === 'ar' ? 'fa-arrow-right' : 'fa-arrow-left'}`}></i>
          {t('common.back')}
        </button>

        {/* Header */}
        <div className="vgr-header">
          <div className="vgr-header-icon">
            <i className="fas fa-chart-line"></i>
          </div>
          <h1>{t('reports.videosTitle') || (lang === 'ar' ? 'التقرير الجماعي للفيديوهات' : 'Videos Group Report')}</h1>
          <p>{lang === 'ar' ? 'متابعة مشاهدات الطلاب المسجلين وتحليل نشاط الصفوف' : 'Track enrolled students views and analyze grade activity'}</p>
        </div>

        {loadError && (
          <div className="vgr-header" style={{background:'#fee2e2', color:'#991b1b', padding:'12px', borderRadius:12}}>
            <p style={{margin:0}}>{loadError}</p>
          </div>
        )}

        {/* Stepper */}
        <div className="vgr-stepper">
          <div className={`vgr-step ${currentGrade ? 'done' : 'active'}`}>
            <div className="vgr-step-num">
              {currentGrade ? <i className="fas fa-check"></i> : 1}
            </div>
            <span>{t('profile.grade') || (lang === 'ar' ? 'الصف' : 'Grade')}</span>
          </div>
          <div className="vgr-step-line"></div>
          <div className={`vgr-step ${currentVideo ? 'done' : currentGrade ? 'active' : ''}`}>
            <div className="vgr-step-num">
              {currentVideo ? <i className="fas fa-check"></i> : 2}
            </div>
            <span>{t('reports.videoStep') || (lang === 'ar' ? 'الفيديو' : 'Video')}</span>
          </div>
        </div>

        {/* Grade */}
        <div className="vgr-section">
          <h2 className="vgr-section-title">
            <i className="fas fa-school"></i>
            {lang === 'ar' ? 'اختر الصف الدراسي' : 'Select Grade'}
          </h2>
          {availableGrades.length === 0 ? (
            <p style={{textAlign:'center', color:'#6b7280'}}>{lang === 'ar' ? 'لا يوجد طلاب مسجلون بعد.' : 'No enrolled students yet.'}</p>
          ) : (
            <div className="vgr-chips">
              {availableGrades.map((grade) => (
                <button
                  key={grade}
                  className={`vgr-chip ${currentGrade === grade ? 'active' : ''}`}
                  onClick={() => selectGrade(grade)}
                >
                  <i className="fas fa-graduation-cap"></i>
                  {GRADE_LABEL[grade]}
                  <span className="vgr-count-badge" style={{marginInlineStart:8}}>
                    {students.filter(s => s.grade === grade).length}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Video */}
        {currentGrade && (
          <div className="vgr-section">
            <h2 className="vgr-section-title">
              <i className="fas fa-play-circle"></i>
              {lang === 'ar' ? 'اختر الفيديو' : 'Select Video'}
            </h2>
            {videosForGrade.length === 0 ? (
              <p style={{textAlign:'center', color:'#6b7280'}}>{lang === 'ar' ? 'لا توجد فيديوهات منشورة لهذا الصف.' : 'No videos published for this grade.'}</p>
            ) : (
              <div className="vgr-select-wrap">
                <i className="fas fa-film vgr-select-icon"></i>
                <select
                  className="vgr-select"
                  value={currentVideo}
                  onChange={(e) => handleVideoChange(e.target.value)}
                >
                  <option value="">{lang === 'ar' ? '-- اختر الفيديو --' : '-- Select Video --'}</option>
                  {videosForGrade.map((video) => (
                    <option key={video.id} value={video.id}>{video.title}</option>
                  ))}
                </select>
                <i className="fas fa-chevron-down vgr-select-arrow"></i>
              </div>
            )}
          </div>
        )}

        {reportLoading && (
          <div style={{textAlign:'center', padding:'20px'}}>
            <i className="fas fa-spinner fa-spin"></i>
            <span style={{marginInlineStart:8}}>{t('common.computing') || (lang === 'ar' ? 'جاري حساب التقرير...' : 'Computing report...')}</span>
          </div>
        )}

        {/* Summary */}
        {displayedStudents.length > 0 && (
          <div className="vgr-summary">
            <div className="vgr-sum-card">
              <i className="fas fa-users vgr-sum-icon" style={{color:'var(--primary)'}}></i>
              <span className="vgr-sum-val" style={{color:'var(--primary)'}}>{totalStudents}</span>
              <span className="vgr-sum-lbl">{t('groupExams.totalStudents') || (lang === 'ar' ? 'إجمالي الطلاب' : 'Total Students')}</span>
            </div>
            <div className="vgr-sum-card">
              <i className="fas fa-check-circle vgr-sum-icon" style={{color:'#48bb78'}}></i>
              <span className="vgr-sum-val" style={{color:'#48bb78'}}>{completeCount}</span>
              <span className="vgr-sum-lbl">{lang === 'ar' ? 'شاهدوا كامل' : 'Completed'}</span>
            </div>
            <div className="vgr-sum-card">
              <i className="fas fa-adjust vgr-sum-icon" style={{color:'#ed8936'}}></i>
              <span className="vgr-sum-val" style={{color:'#ed8936'}}>{partialCount}</span>
              <span className="vgr-sum-lbl">{lang === 'ar' ? 'جزئياً' : 'Partially'}</span>
            </div>
            <div className="vgr-sum-card">
              <i className="fas fa-times-circle vgr-sum-icon" style={{color:'#ef4444'}}></i>
              <span className="vgr-sum-val" style={{color:'#ef4444'}}>{noneCount}</span>
              <span className="vgr-sum-lbl">{lang === 'ar' ? 'لم يشاهدوا' : 'Not Watched'}</span>
            </div>
            <div className="vgr-sum-card">
              <i className="fas fa-percentage vgr-sum-icon" style={{color:'var(--secondary)'}}></i>
              <span className="vgr-sum-val" style={{color:'var(--secondary)'}}>{avgProgress}%</span>
              <span className="vgr-sum-lbl">{t('reports.avgProgressLabel') || (lang === 'ar' ? 'متوسط التقدم' : 'Avg Progress')}</span>
            </div>
            <div className="vgr-sum-card">
              <i className="fas fa-trophy vgr-sum-icon" style={{color:'#f59e0b'}}></i>
              <span className="vgr-sum-val" style={{color:'#f59e0b'}}>{completeRate}%</span>
              <span className="vgr-sum-lbl">{lang === 'ar' ? 'نسبة الإكمال' : 'Completion Rate'}</span>
            </div>
          </div>
        )}

        {/* Filters */}
        {currentVideo && allStudentsData.length > 0 && (
          <div className="vgr-section">
            <h2 className="vgr-section-title">
              <i className="fas fa-filter"></i>
              {t('reports.filterResults') || (lang === 'ar' ? 'تصفية النتائج' : 'Filter Results')}
            </h2>
            <div className="vgr-chips">
              {[
                { key: 'all', label: t('groupExams.filterAll') || (lang === 'ar' ? 'الجميع' : 'All'), icon: 'fa-th-list' },
                { key: 'complete', label: lang === 'ar' ? 'شاهدوا كامل (≥75%)' : 'Completed (≥75%)', icon: 'fa-check' },
                { key: 'partial', label: lang === 'ar' ? 'نصف أو أقل (≤50%)' : 'Partial (≤50%)', icon: 'fa-adjust' },
                { key: 'none', label: t('reports.notWatchedLabel') || (lang === 'ar' ? 'لم يشاهدوا' : 'Not Watched'), icon: 'fa-times' },
              ].map(({ key, label, icon }) => (
                <button
                  key={key}
                  className={`vgr-chip vgr-filter-chip ${currentFilter === key ? 'active' : ''}`}
                  onClick={() => filterStudents(key)}
                >
                  <i className={`fas ${icon}`}></i>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Report Table */}
        {displayedStudents.length > 0 && (
          <div className="vgr-card" id="vgr-reportTable">
            <div className="vgr-card-header">
              <h2 className="vgr-card-title">
                <i className="fas fa-clipboard-list"></i>
                {t('reports.detailedVideoReport') || (lang === 'ar' ? 'تقرير المشاهدة التفصيلي' : 'Detailed Viewing Report')}
                <span className="vgr-count-badge">{displayedStudents.length}</span>
              </h2>
              <button onClick={() => window.print()} className="vgr-print-btn">
                <i className="fas fa-print"></i>
                {t('reports.printReport') || (lang === 'ar' ? 'طباعة التقرير' : 'Print Report')}
              </button>
            </div>

            <div className="vgr-table-container">
              <table className="vgr-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('reports.studentNameCol') || (lang === 'ar' ? 'اسم الطالب' : 'Student Name')}</th>
                    <th>{t('reports.studentIdCol') || (lang === 'ar' ? 'رقم الطالب' : 'Student ID')}</th>
                    <th>{t('profile.grade') || (lang === 'ar' ? 'الصف' : 'Grade')}</th>
                    <th>{lang === 'ar' ? 'آخر مشاهدة' : 'Last Viewed'}</th>
                    <th>{t('reports.statusCol') || (lang === 'ar' ? 'الحالة' : 'Status')}</th>
                    <th>{t('reports.progressCol') || (lang === 'ar' ? 'نسبة المشاهدة' : 'Progress')}</th>
                    <th>{t('reports.timeCol') || (lang === 'ar' ? 'الوقت' : 'Time')}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedStudents.map((student, index) => (
                    <tr key={student.id + index} className="vgr-tr">
                      <td className="vgr-td-num">{index + 1}</td>
                      <td className="vgr-td-name">
                        <div className="vgr-name-cell">
                          <div className="vgr-mini-avatar">
                            <i className="fas fa-user"></i>
                          </div>
                          <span>{student.name}</span>
                        </div>
                      </td>
                      <td><span className="vgr-id-pill">{student.id}</span></td>
                      <td>{student.group}</td>
                      <td>{student.date}</td>
                      <td>
                        <span className={`vgr-badge ${student.percentage >= 75 ? 'vgr-badge-complete' : 'vgr-badge-incomplete'}`}>
                          <i className={`fas ${student.percentage >= 75 ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                          {student.status}
                        </span>
                      </td>
                      <td>
                        <div className="vgr-score-cell">
                          <div className="vgr-progress-bar">
                            <div
                              className={`vgr-progress-fill ${
                                student.percentage >= 75 ? 'vgr-prog-high' :
                                student.percentage >= 50 ? 'vgr-prog-medium' : 'vgr-prog-low'
                              }`}
                              style={{ width: `${student.percentage}%` }}
                            ></div>
                          </div>
                          <span className="vgr-pct-text">{student.percentage}%</span>
                        </div>
                      </td>
                      <td className="vgr-time-cell">{student.watchedTime} / {student.totalTime}</td>
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
