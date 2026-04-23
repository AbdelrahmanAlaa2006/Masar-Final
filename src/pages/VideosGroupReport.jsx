import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import './VideosGroupReport.css'
import { listStudents } from '@backend/profilesApi'
import { listVideos } from '@backend/videosApi'
import { supabase } from '@backend/supabase'

// DB grade enum → Arabic label shown in the UI.
const GRADE_LABEL = {
  'first-prep':  'الأول الإعدادي',
  'second-prep': 'الثاني الإعدادي',
  'third-prep':  'الثالث الإعدادي',
}
const GRADE_ORDER = ['first-prep', 'second-prep', 'third-prep']

export default function VideosGroupReport() {
  const navigate = useNavigate()

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
    const totalParts = (video.video_parts || []).length || 0
    const totalMinutes = video.duration_minutes || 0
    const gradeStudents = studentsForGrade
    if (gradeStudents.length === 0) {
      setAllStudentsData([]); setDisplayedStudents([]); return
    }

    setReportLoading(true)
    try {
      const ids = gradeStudents.map(s => s.id)
      const { data: progressRows, error } = await supabase
        .from('video_progress')
        .select('student_id, part_id, views_used, last_watched_at')
        .eq('video_id', videoId)
        .in('student_id', ids)
      if (error) throw error

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
          group: GRADE_LABEL[stu.grade] || '',
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
      <main className="vgr-page">
        <div className="vgr-container">
          <div className="vgr-header" style={{textAlign:'center', padding:'40px'}}>
            <i className="fas fa-spinner fa-spin" style={{fontSize:'2rem'}}></i>
            <p>جاري التحميل...</p>
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
          <i className="fas fa-arrow-right"></i>
          رجوع
        </button>

        {/* Header */}
        <div className="vgr-header">
          <div className="vgr-header-icon">
            <i className="fas fa-chart-line"></i>
          </div>
          <h1>التقرير الجماعي للفيديوهات</h1>
          <p>متابعة مشاهدات الطلاب المسجلين وتحليل نشاط الصفوف</p>
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
        <div className="vgr-section">
          <h2 className="vgr-section-title">
            <i className="fas fa-school"></i>
            اختر الصف الدراسي
          </h2>
          {availableGrades.length === 0 ? (
            <p style={{textAlign:'center', color:'#6b7280'}}>لا يوجد طلاب مسجلون بعد.</p>
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
              اختر الفيديو
            </h2>
            {videosForGrade.length === 0 ? (
              <p style={{textAlign:'center', color:'#6b7280'}}>لا توجد فيديوهات منشورة لهذا الصف.</p>
            ) : (
              <div className="vgr-select-wrap">
                <i className="fas fa-film vgr-select-icon"></i>
                <select
                  className="vgr-select"
                  value={currentVideo}
                  onChange={(e) => handleVideoChange(e.target.value)}
                >
                  <option value="">-- اختر الفيديو --</option>
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
            <span style={{marginInlineStart:8}}>جاري حساب التقرير...</span>
          </div>
        )}

        {/* Summary */}
        {displayedStudents.length > 0 && (
          <div className="vgr-summary">
            <div className="vgr-sum-card">
              <i className="fas fa-users vgr-sum-icon" style={{color:'var(--primary)'}}></i>
              <span className="vgr-sum-val" style={{color:'var(--primary)'}}>{totalStudents}</span>
              <span className="vgr-sum-lbl">إجمالي الطلاب</span>
            </div>
            <div className="vgr-sum-card">
              <i className="fas fa-check-circle vgr-sum-icon" style={{color:'#48bb78'}}></i>
              <span className="vgr-sum-val" style={{color:'#48bb78'}}>{completeCount}</span>
              <span className="vgr-sum-lbl">شاهدوا كامل</span>
            </div>
            <div className="vgr-sum-card">
              <i className="fas fa-adjust vgr-sum-icon" style={{color:'#ed8936'}}></i>
              <span className="vgr-sum-val" style={{color:'#ed8936'}}>{partialCount}</span>
              <span className="vgr-sum-lbl">جزئياً</span>
            </div>
            <div className="vgr-sum-card">
              <i className="fas fa-times-circle vgr-sum-icon" style={{color:'#ef4444'}}></i>
              <span className="vgr-sum-val" style={{color:'#ef4444'}}>{noneCount}</span>
              <span className="vgr-sum-lbl">لم يشاهدوا</span>
            </div>
            <div className="vgr-sum-card">
              <i className="fas fa-percentage vgr-sum-icon" style={{color:'var(--secondary)'}}></i>
              <span className="vgr-sum-val" style={{color:'var(--secondary)'}}>{avgProgress}%</span>
              <span className="vgr-sum-lbl">متوسط التقدم</span>
            </div>
            <div className="vgr-sum-card">
              <i className="fas fa-trophy vgr-sum-icon" style={{color:'#f59e0b'}}></i>
              <span className="vgr-sum-val" style={{color:'#f59e0b'}}>{completeRate}%</span>
              <span className="vgr-sum-lbl">نسبة الإكمال</span>
            </div>
          </div>
        )}

        {/* Filters */}
        {currentVideo && allStudentsData.length > 0 && (
          <div className="vgr-section">
            <h2 className="vgr-section-title">
              <i className="fas fa-filter"></i>
              تصفية النتائج
            </h2>
            <div className="vgr-chips">
              {[
                { key: 'all', label: 'الجميع', icon: 'fa-th-list' },
                { key: 'complete', label: 'شاهدوا كامل (≥75%)', icon: 'fa-check' },
                { key: 'partial', label: 'نصف أو أقل (≤50%)', icon: 'fa-adjust' },
                { key: 'none', label: 'لم يشاهدوا', icon: 'fa-times' },
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
                تقرير المشاهدة التفصيلي
                <span className="vgr-count-badge">{displayedStudents.length}</span>
              </h2>
              <button onClick={() => window.print()} className="vgr-print-btn">
                <i className="fas fa-print"></i>
                طباعة التقرير
              </button>
            </div>

            <div className="vgr-table-container">
              <table className="vgr-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>اسم الطالب</th>
                    <th>رقم الطالب</th>
                    <th>الصف</th>
                    <th>آخر مشاهدة</th>
                    <th>الحالة</th>
                    <th>نسبة المشاهدة</th>
                    <th>الوقت</th>
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
