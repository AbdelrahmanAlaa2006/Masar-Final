import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { listStudentsByGrade, getStudentCountsByGrade } from '@backend/profilesApi'
import { supabase } from '@backend/supabase'
import { selectInChunks } from '@backend/fetchAllRows'
import { getLectureDetails, listLecturesForReporting } from '@backend/courseLecturesApi'
import { getYoutubeDurations } from '../services/youtubeMeta'
import { cached, LIST_TTL } from '../utils/cache'
import PrintReportHeader from '../components/PrintReportHeader'
import GradePicker from '../components/GradePicker'
import { useTenant } from '../contexts/TenantContext'
import { GRADE_LABEL, GRADE_ORDER } from './ControlPanel/shared'
import './LecturesGroupReport.css'

const initials = (name = '') => {
  return name.trim().split(' ').map(n => n[0]).slice(0, 2).join('')
}

export default function LecturesGroupReport() {
  const navigate = useNavigate()
  const { tenantId, isGradeEnabled, gradesList } = useTenant()

  // 1. Selector states
  const [currentGrade, setCurrentGrade] = useState('')
  const [currentGroup, setCurrentGroup] = useState('')
  const [currentLectureId, setCurrentLectureId] = useState('')
  const [currentFilter, setCurrentFilter] = useState('all')

  // 2. Data states
  const [students, setStudents] = useState([])
  const [gradeStudentCounts, setGradeStudentCounts] = useState({})
  const [availableLectures, setAvailableLectures] = useState([])
  const [selectedLectureDetails, setSelectedLectureDetails] = useState(null)
  const [allStudentsData, setAllStudentsData] = useState([])
  const [displayedStudents, setDisplayedStudents] = useState([])

  // 3. Loading & Error states
  const [loadingLectures, setLoadingLectures] = useState(false)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)

  // Pre-fetch student counts per grade for the tenant
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const counts = await getStudentCountsByGrade()
        if (cancelled) return
        setGradeStudentCounts(counts || {})
      } catch (err) {
        console.error('Failed to count students per grade:', err)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Grade list filtered by tenant enabled grades
  const availableGrades = useMemo(() => {
    const tenantGradeIds = gradesList?.length > 0 ? gradesList.map(g => g.id) : null
    return GRADE_ORDER.filter(g => isGradeEnabled(g) || (tenantGradeIds && tenantGradeIds.includes(g)))
  }, [isGradeEnabled, gradesList])

  // Load lectures when grade changes
  useEffect(() => {
    if (!currentGrade) {
      setAvailableLectures([])
      setCurrentLectureId('')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        setLoadingLectures(true)
        setLoadError(null)
        const lecs = await cached(`lectures-for-report:${currentGrade}`, LIST_TTL, () =>
          listLecturesForReporting({ grade: currentGrade })
        )
        if (!cancelled) {
          setAvailableLectures(lecs || [])
          if ((lecs || []).length > 0) {
            setCurrentLectureId(lecs[0].id)
          } else {
            setCurrentLectureId('')
          }
        }
      } catch (err) {
        console.error('Failed to load lectures for grade:', err)
        if (!cancelled) setLoadError(err.message || 'تعذر تحميل محاضرات هذه المرحلة')
      } finally {
        if (!cancelled) setLoadingLectures(false)
      }
    })()
    return () => { cancelled = true }
  }, [currentGrade])

  // Load students when grade changes
  useEffect(() => {
    if (!currentGrade) {
      setStudents([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        setLoadingStudents(true)
        const rows = await cached(`students:grade:${currentGrade}`, LIST_TTL, () =>
          listStudentsByGrade(currentGrade)
        )
        if (!cancelled) setStudents(rows || [])
      } catch (err) {
        console.error('Failed to load students for grade:', err)
      } finally {
        if (!cancelled) setLoadingStudents(false)
      }
    })()
    return () => { cancelled = true }
  }, [currentGrade])

  // Derived groups for the selected grade
  const studentsInGrade = useMemo(() => {
    return students.filter(s => s.grade === currentGrade)
  }, [students, currentGrade])

  const groupsForGrade = useMemo(() => {
    const set = new Set(studentsInGrade.map(s => (s.group || '').trim()).filter(Boolean))
    return [...set].sort((a, b) => a.localeCompare(b, 'ar'))
  }, [studentsInGrade])

  // Scoped students by group filter
  const studentsForGrade = useMemo(() => {
    if (!currentGroup) return studentsInGrade
    return studentsInGrade.filter(s => (s.group || '').trim() === currentGroup)
  }, [studentsInGrade, currentGroup])

  // Selection handlers
  const selectGrade = (grade) => {
    setCurrentGrade(grade)
    setCurrentGroup('')
    setCurrentLectureId('')
    setAllStudentsData([])
    setDisplayedStudents([])
    setCurrentFilter('all')
  }

  const selectGroup = (group) => {
    setCurrentGroup(group)
    setCurrentFilter('all')
  }

  const selectLecture = (lecId) => {
    setCurrentLectureId(lecId)
    setCurrentFilter('all')
  }

  // Load and calculate group report
  useEffect(() => {
    if (!currentGrade || !currentLectureId || studentsForGrade.length === 0) {
      setAllStudentsData([])
      setDisplayedStudents([])
      setSelectedLectureDetails(null)
      return
    }

    let cancelled = false
    ;(async () => {
      setReportLoading(true)
      setLoadError(null)
      try {
        // 1. Fetch Lecture details with all videos (ordered by lecture_videos.sort_order)
        const lectureDetails = await getLectureDetails(currentLectureId)
        if (cancelled) return
        setSelectedLectureDetails(lectureDetails)

        const rawVideos = lectureDetails.videos || []
        const totalLectureVideos = rawVideos.length

        if (totalLectureVideos === 0) {
          setAllStudentsData([])
          setDisplayedStudents([])
          return
        }

        // 2. Collect video IDs and student IDs for single batch queries
        const videoIds = rawVideos.map(v => v.id)
        const studentIds = studentsForGrade.map(s => s.id)

        // 3. Progress for all students across all lecture videos. Chunked by
        //    student and paged: one request returned at most 1000 rows (so
        //    some students showed 0%) and a big grade overflowed the URL.
        const progressRows = await selectInChunks(studentIds, (part) => supabase
          .from('video_progress')
          .select('id, student_id, video_id, part_id, views_used, seconds_watched, last_watched_at')
          .in('video_id', videoIds)
          .in('student_id', part)
          .order('id'))

        if (cancelled) return

        // Group progress rows by student_id -> video_id
        const progressByStudent = new Map()
        for (const r of (progressRows || [])) {
          if (!progressByStudent.has(r.student_id)) {
            progressByStudent.set(r.student_id, new Map())
          }
          const studentVideos = progressByStudent.get(r.student_id)
          if (!studentVideos.has(r.video_id)) {
            studentVideos.set(r.video_id, [])
          }
          studentVideos.get(r.video_id).push(r)
        }

        // 4. Probe YouTube durations across all video parts
        const ytIds = rawVideos.flatMap(v =>
          (v.video_parts || [])
            .filter(p => (p.source || 'youtube') === 'youtube' && p.youtube_id)
            .map(p => p.youtube_id)
        )
        const durMap = await getYoutubeDurations(ytIds)
        if (cancelled) return

        // Compute total duration of each video once
        const videoDurationMap = new Map()
        let lectureTotalSeconds = 0
        rawVideos.forEach(v => {
          const parts = v.video_parts || []
          const partSeconds = (p) => {
            if ((p.source || 'youtube') === 'drive') {
              return parseInt(p.duration_seconds, 10) || 0
            }
            return durMap.get(p.youtube_id) || parseInt(p.duration_seconds, 10) || 0
          }
          const vTotalSecs = parts.reduce((s, p) => s + partSeconds(p), 0)
          videoDurationMap.set(v.id, { totalSecs: vTotalSecs, parts, partSeconds })
          lectureTotalSeconds += vTotalSecs
        })

        const lectureTotalMinutes = Math.ceil(lectureTotalSeconds / 60)

        // 5. Build report rows for each student
        const rows = studentsForGrade.map(stu => {
          const stuProgressMap = progressByStudent.get(stu.id) || new Map()
          let stuLectureWatchedSeconds = 0
          let completedVideosCount = 0
          let partialVideosCount = 0
          let unwatchedVideosCount = 0
          let latestTimestamp = 0

          rawVideos.forEach(v => {
            const vMeta = videoDurationMap.get(v.id)
            const vProgList = stuProgressMap.get(v.id) || []
            const watchedByPart = new Map(
              vProgList.map(p => [p.part_id, Math.max(0, p.seconds_watched || 0)])
            )

            const vWatchedSecs = vMeta.parts.reduce((s, p) => {
              const dur = vMeta.partSeconds(p)
              const seen = watchedByPart.get(p.id) || 0
              return s + (dur ? Math.min(seen, dur) : seen)
            }, 0)

            stuLectureWatchedSeconds += vWatchedSecs

            const vProgress = vMeta.totalSecs > 0
              ? Math.min(100, Math.round((vWatchedSecs / vMeta.totalSecs) * 100))
              : 0

            // Semantic thresholds from existing Video Reports
            if (vProgress >= 75) {
              completedVideosCount++
            } else if (vProgress > 0) {
              partialVideosCount++
            } else {
              unwatchedVideosCount++
            }

            vProgList.forEach(p => {
              if (p.last_watched_at) {
                const t = new Date(p.last_watched_at).getTime()
                if (t > latestTimestamp) latestTimestamp = t
              }
            })
          })

          // Student overall lecture progress %
          const overallProgress = lectureTotalSeconds > 0
            ? Math.min(100, Math.round((stuLectureWatchedSeconds / lectureTotalSeconds) * 100))
            : 0

          const watchedMins = Math.floor(stuLectureWatchedSeconds / 60)
          const dateStr = latestTimestamp
            ? new Date(latestTimestamp).toLocaleDateString('ar-EG')
            : '—'

          return {
            studentId: stu.id,
            name: stu.name,
            phone: stu.phone || stu.id.slice(0, 8),
            group: (stu.group || '').trim() || GRADE_LABEL[stu.grade] || '',
            overallProgress,
            status: overallProgress >= 75 ? 'مكتمل' : overallProgress > 0 ? 'جزئي' : 'لم يبدأ',
            completedVideosCount,
            partialVideosCount,
            unwatchedVideosCount,
            totalLectureVideos,
            watchedTimeStr: `${watchedMins} دقيقة`,
            totalLectureTimeStr: `${lectureTotalMinutes} دقيقة`,
            lastWatchedDate: dateStr
          }
        })

        if (!cancelled) {
          setAllStudentsData(rows)
          setDisplayedStudents(rows)
        }
      } catch (err) {
        console.error('Error generating group lecture report:', err)
        if (!cancelled) setLoadError(err.message || 'تعذر تحميل التقرير الجماعي للمحاضرة')
      } finally {
        if (!cancelled) setReportLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [currentGrade, currentGroup, currentLectureId, studentsForGrade])

  // Filter handler
  const handleFilterChange = (filterKey) => {
    setCurrentFilter(filterKey)
    if (filterKey === 'all') {
      setDisplayedStudents(allStudentsData)
    } else if (filterKey === 'complete') {
      setDisplayedStudents(allStudentsData.filter(s => s.overallProgress >= 75))
    } else if (filterKey === 'partial') {
      setDisplayedStudents(allStudentsData.filter(s => s.overallProgress > 0 && s.overallProgress < 75))
    } else if (filterKey === 'none') {
      setDisplayedStudents(allStudentsData.filter(s => s.overallProgress === 0))
    }
  }

  // Summary Metrics across cohort
  const cohortStats = useMemo(() => {
    const totalStudents = allStudentsData.length
    if (totalStudents === 0) {
      return { totalStudents: 0, completeCount: 0, partialCount: 0, noneCount: 0, avgProgress: 0, completionRate: 0 }
    }
    const completeCount = allStudentsData.filter(s => s.overallProgress >= 75).length
    const completedCount = completeCount
    const partialCount = allStudentsData.filter(s => s.overallProgress > 0 && s.overallProgress < 75).length
    const noneCount = allStudentsData.filter(s => s.overallProgress === 0).length
    const avgProgress = Math.round(allStudentsData.reduce((sum, s) => sum + s.overallProgress, 0) / totalStudents)
    const completionRate = Math.round((completeCount / totalStudents) * 100)

    return { totalStudents, completeCount, completedCount, partialCount, noneCount, avgProgress, completionRate }
  }, [allStudentsData])

  return (
    <main className="cp-page lgr-page">
      <div className="cp-container lgr-container">
        {/* Navigation Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 10 }}>
          <button className="cp-crumbs-back" onClick={() => navigate('/report')}>
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
          title={`التقرير الجماعي للمحاضرات — ${selectedLectureDetails?.title || ''}`}
          subtitle={`المرحلة: ${GRADE_LABEL[currentGrade] || currentGrade || ''} ${currentGroup ? `| المجموعة: ${currentGroup}` : ''}`}
        />

        <div className="cp-page-header">
          <div className="cp-page-header-text">
            <h1>التقرير الجماعي للمحاضرات</h1>
            <p>متابعة تفصيلية لإنجاز طلاب الصفوف في المحاضرات التعليمية</p>
          </div>
          <div className="cp-page-icon" style={{ background: 'linear-gradient(135deg, #7c3aed, #6366f1)' }}>
            <i className="fas fa-chalkboard-teacher"></i>
          </div>
        </div>
        <div className="cp-header-divider"></div>

        {loadError && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', padding: '14px 18px', borderRadius: 12, marginBottom: 20 }}>
            <i className="fas fa-exclamation-triangle" style={{ marginInlineEnd: 8 }}></i>
            <span>{loadError}</span>
          </div>
        )}

        {/* Stepper Indicator */}
        <div className="lgr-stepper">
          <div className={`lgr-step ${currentGrade ? 'done' : 'active'}`}>
            <div className="lgr-step-num">
              {currentGrade ? <i className="fas fa-check"></i> : 1}
            </div>
            <span>المرحلة الدراسية</span>
          </div>
          <div className="lgr-step-line"></div>
          <div className={`lgr-step ${currentLectureId ? 'done' : currentGrade ? 'active' : ''}`}>
            <div className="lgr-step-num">
              {currentLectureId ? <i className="fas fa-check"></i> : 2}
            </div>
            <span>المحاضرة</span>
          </div>
          <div className="lgr-step-line"></div>
          <div className={`lgr-step ${currentLectureId ? 'active' : ''}`}>
            <div className="lgr-step-num">3</div>
            <span>تقرير الطلاب</span>
          </div>
        </div>

        {/* Step 1: Grade Selection */}
        <div className="lgr-step-box">
          <div className="lgr-step-box-title">
            <i className="fas fa-graduation-cap" style={{ color: '#7c3aed' }}></i>
            <span>خطوة 1: اختر المرحلة الدراسية</span>
          </div>
          <GradePicker
            grades={availableGrades}
            counts={gradeStudentCounts}
            value={currentGrade}
            activeCount={currentGrade ? students.filter(s => s.grade === currentGrade).length : null}
            onChange={selectGrade}
          />
        </div>

        {/* Step 2: Group & Lecture Selection */}
        {currentGrade && (
          <div className="lgr-step-box">
            <div className="lgr-step-box-title">
              <i className="fas fa-book-open" style={{ color: '#7c3aed' }}></i>
              <span>خطوة 2: اختر المحاضرة والمجموعة</span>
            </div>

            {/* Group Filter Chips */}
            {groupsForGrade.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--cp-text-muted)', marginInlineEnd: 10 }}>
                  تصفية بالمجموعة:
                </span>
                <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    onClick={() => selectGroup('')}
                    className={`cp-btn ${currentGroup === '' ? 'cp-btn-primary' : 'cp-btn-secondary'}`}
                    style={{ padding: '4px 12px', fontSize: '0.8rem', borderRadius: 999 }}
                  >
                    الكل ({studentsInGrade.length})
                  </button>
                  {groupsForGrade.map(grp => (
                    <button
                      key={grp}
                      onClick={() => selectGroup(grp)}
                      className={`cp-btn ${currentGroup === grp ? 'cp-btn-primary' : 'cp-btn-secondary'}`}
                      style={{ padding: '4px 12px', fontSize: '0.8rem', borderRadius: 999 }}
                    >
                      {grp} ({studentsInGrade.filter(s => (s.group || '').trim() === grp).length})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Lectures Grid Selection */}
            {loadingLectures ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--cp-text-muted)' }}>
                <i className="fas fa-spinner fa-spin"></i> جاري استرجاع المحاضرات...
              </div>
            ) : availableLectures.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#eab308' }}>
                <i className="fas fa-info-circle"></i> لا توجد محاضرات تعليمية مسجلة لهذه المرحلة حتى الآن.
              </div>
            ) : (
              <div className="lgr-lectures-grid">
                {availableLectures.map(lec => {
                  const isSelected = lec.id === currentLectureId
                  return (
                    <button
                      key={lec.id}
                      type="button"
                      onClick={() => selectLecture(lec.id)}
                      className={`lgr-lecture-chip ${isSelected ? 'active' : ''}`}
                    >
                      <div>
                        <div style={{ fontWeight: 800 }}>{lec.title}</div>
                        {lec.chapter?.title && (
                          <div style={{ fontSize: '0.75rem', color: isSelected ? '#7c3aed' : 'var(--cp-text-muted)', marginTop: 2 }}>
                            {lec.chapter.title}
                          </div>
                        )}
                      </div>
                      <i className={`fas ${isSelected ? 'fa-circle-check' : 'fa-circle-play'}`}></i>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Report & Students Cohort Data */}
        {reportLoading && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--cp-text-muted)' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#7c3aed' }}></i>
            <p style={{ marginTop: 12, fontWeight: 700 }}>جارٍ تجميع بيانات طلاب الصف وحساب نسب إنجاز المحاضرة...</p>
          </div>
        )}

        {!reportLoading && currentLectureId && selectedLectureDetails && (selectedLectureDetails.videos || []).length === 0 && (
          <div className="lgr-empty-box" style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--cp-card-bg)', borderRadius: 12, border: '1px solid var(--cp-card-border)', margin: '20px 0' }}>
            <i className="fas fa-video-slash" style={{ fontSize: '2.5rem', color: '#94a3b8', marginBottom: 12 }}></i>
            <p style={{ fontWeight: 700, margin: 0, color: 'var(--cp-text-main)' }}>لا توجد فيديوهات مضافة لهذه المحاضرة</p>
          </div>
        )}

        {!reportLoading && currentLectureId && selectedLectureDetails && (selectedLectureDetails.videos || []).length > 0 && (
          <>
            {/* Cohort Summary Stats */}
            <div className="lgr-summary-stats-bar">
              <div className="lgr-summary-stat-box">
                <div className="lgr-stat-number">{cohortStats.totalStudents}</div>
                <div className="lgr-stat-label">إجمالي الطلاب</div>
              </div>
              <div className="lgr-summary-stat-box">
                <div className="lgr-stat-number" style={{ color: '#10b981' }}>{cohortStats.completeCount}</div>
                <div className="lgr-stat-label">أكملوا المحاضرة (≥75%)</div>
              </div>
              <div className="lgr-summary-stat-box">
                <div className="lgr-stat-number" style={{ color: '#d97706' }}>{cohortStats.partialCount}</div>
                <div className="lgr-stat-label">مشاهدة جزئية</div>
              </div>
              <div className="lgr-summary-stat-box">
                <div className="lgr-stat-number" style={{ color: '#ef4444' }}>{cohortStats.noneCount}</div>
                <div className="lgr-stat-label">لم يبدأوا بعد</div>
              </div>
              <div className="lgr-summary-stat-box">
                <div className="lgr-stat-number" style={{ color: '#7c3aed' }}>{cohortStats.avgProgress}%</div>
                <div className="lgr-stat-label">متوسط إنجاز الصف</div>
              </div>
              <div className="lgr-summary-stat-box">
                <div className="lgr-stat-number" style={{ color: '#0284c7' }}>{cohortStats.completionRate}%</div>
                <div className="lgr-stat-label">معدل الإكمال العام</div>
              </div>
            </div>

            {/* Table Card */}
            <div className="lgr-table-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--cp-text-main)' }}>
                  <i className="fas fa-users" style={{ color: '#7c3aed', marginInlineEnd: 8 }}></i>
                  سجل طلاب الصف ({displayedStudents.length})
                </h3>

                {/* Filter buttons */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleFilterChange('all')}
                    className={`cp-btn ${currentFilter === 'all' ? 'cp-btn-primary' : 'cp-btn-secondary'}`}
                    style={{ padding: '5px 12px', fontSize: '0.8rem' }}
                  >
                    الكل ({allStudentsData.length})
                  </button>
                  <button
                    onClick={() => handleFilterChange('complete')}
                    className={`cp-btn ${currentFilter === 'complete' ? 'cp-btn-primary' : 'cp-btn-secondary'}`}
                    style={{ padding: '5px 12px', fontSize: '0.8rem' }}
                  >
                    مكتمل ({cohortStats.completeCount})
                  </button>
                  <button
                    onClick={() => handleFilterChange('partial')}
                    className={`cp-btn ${currentFilter === 'partial' ? 'cp-btn-primary' : 'cp-btn-secondary'}`}
                    style={{ padding: '5px 12px', fontSize: '0.8rem' }}
                  >
                    جزئي ({cohortStats.partialCount})
                  </button>
                  <button
                    onClick={() => handleFilterChange('none')}
                    className={`cp-btn ${currentFilter === 'none' ? 'cp-btn-primary' : 'cp-btn-secondary'}`}
                    style={{ padding: '5px 12px', fontSize: '0.8rem' }}
                  >
                    لم يبدأ ({cohortStats.noneCount})
                  </button>
                </div>
              </div>

              {displayedStudents.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--cp-text-muted)' }}>
                  <i className="fas fa-user-slash" style={{ fontSize: '2.5rem', marginBottom: 12, color: '#94a3b8' }}></i>
                  <p>لا يوجد طلاب يطابقون هذا الفلتر حالياً</p>
                </div>
              ) : (
                <table className="lgr-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>الطالب</th>
                      <th>المجموعة</th>
                      <th>نسبة إنجاز المحاضرة</th>
                      <th>الفيديوهات المكتملة</th>
                      <th>وقت المشاهدة</th>
                      <th>آخر مشاهدة</th>
                      <th style={{ textAlign: 'center' }}>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedStudents.map((s, idx) => {
                      const isHigh = s.overallProgress >= 75
                      const isPartial = s.overallProgress > 0 && s.overallProgress < 75
                      const barColor = isHigh ? '#10b981' : isPartial ? '#d97706' : '#ef4444'

                      return (
                        <tr key={s.studentId}>
                          <td style={{ color: 'var(--cp-text-muted)', fontSize: '0.82rem', width: 40 }}>
                            {idx + 1}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div className="lgr-student-avatar">
                                {initials(s.name)}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700 }}>{s.name}</div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--cp-text-muted)', marginTop: 2 }}>
                                  {s.phone}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="cp-id-pill" style={{ fontSize: '0.8rem' }}>
                              {s.group || '—'}
                            </span>
                          </td>
                          <td style={{ minWidth: 160 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ flex: 1, height: 8, background: 'var(--cp-divider)', borderRadius: 999, overflow: 'hidden' }}>
                                <div style={{ width: `${s.overallProgress}%`, height: '100%', background: barColor, borderRadius: 999 }} />
                              </div>
                              <span style={{ fontWeight: 800, fontSize: '0.88rem', minWidth: 38 }}>
                                {s.overallProgress}%
                              </span>
                            </div>
                          </td>
                          <td>
                            <span style={{ fontWeight: 700, color: isHigh ? '#10b981' : 'var(--cp-text-main)' }}>
                              {s.completedVideosCount}
                            </span>
                            <span style={{ color: 'var(--cp-text-muted)', fontSize: '0.82rem' }}>
                              {' / '}{s.totalLectureVideos}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.88rem' }}>{s.watchedTimeStr}</span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--cp-text-muted)' }}>
                              {' / '}{s.totalLectureTimeStr}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.82rem', color: 'var(--cp-text-muted)' }}>
                              {s.lastWatchedDate}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              onClick={() => navigate(`/lectures-report?studentId=${s.studentId}&lectureId=${currentLectureId}&student=${encodeURIComponent(s.name)}`)}
                              className="cp-btn"
                              style={{
                                padding: '6px 12px',
                                fontSize: '0.8rem',
                                background: 'rgba(124, 58, 237, 0.08)',
                                color: '#7c3aed',
                                border: '1px solid rgba(124, 58, 237, 0.2)',
                                borderRadius: 10
                              }}
                              title="عرض تقرير المحاضرة الفردي لهذا الطالب"
                            >
                              <i className="fas fa-user-graduate"></i> تقرير الطالب
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
