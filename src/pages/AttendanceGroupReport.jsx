import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { listCenterAttendanceGroup } from '@backend/reportsApi'
import { listBranches } from '@backend/branchesApi'
import { cached, LIST_TTL } from '../utils/cache'
import PrintReportHeader from '../components/PrintReportHeader'
import './ExamsGroupReport.css'

import { useTenant } from '../contexts/TenantContext'
import { supabase } from '@backend/supabase'

import { GRADE_LABEL, GRADE_ORDER } from './ControlPanel/shared'

export default function AttendanceGroupReport() {
  const navigate = useNavigate()
  const { isGradeEnabled, gradesList } = useTenant()
  const [currentGrade, setCurrentGrade] = useState('')
  const [currentGroup, setCurrentGroup] = useState('')
  const [currentBranch, setCurrentBranch] = useState('all')

  const [branches, setBranches] = useState([])
  const [attendanceData, setAttendanceData] = useState([])
  const [gradeStudentCounts, setGradeStudentCounts] = useState({})

  const [loading, setLoading] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')

  // Pre-fetch student counts per grade for the tenant
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('grade')
          .eq('role', 'student')
        if (error || cancelled) return
        const counts = {}
        (data || []).forEach(r => {
          if (r.grade) counts[r.grade] = (counts[r.grade] || 0) + 1
        })
        setGradeStudentCounts(counts)
      } catch (err) {
        console.error('Failed to count students per grade:', err)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Grade chips filtered by tenant enabled grades
  const availableGrades = useMemo(() => {
    const tenantGradeIds = gradesList?.length > 0 ? gradesList.map(g => g.id) : null
    return GRADE_ORDER.filter(g => isGradeEnabled(g) || (tenantGradeIds && tenantGradeIds.includes(g)))
  }, [isGradeEnabled, gradesList])

  // Load branches
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const list = await cached('branches-list', LIST_TTL, listBranches)
        if (!cancelled) setBranches(list)
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'تعذر تحميل الفروع')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Load attendance aggregates
  useEffect(() => {
    if (!currentGrade) { setAttendanceData([]); return }
    let cancelled = false
    ;(async () => {
      try {
        setReportLoading(true)
        const data = await listCenterAttendanceGroup(currentGrade, currentGroup || 'all', currentBranch)
        if (!cancelled) {
          setAttendanceData(data)
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'تعذر تحميل سجل الحضور الجماعي')
      } finally {
        if (!cancelled) setReportLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [currentGrade, currentGroup, currentBranch])

  // Get distinct groups from loaded student records
  const groupsForGrade = useMemo(() => {
    if (attendanceData.length === 0) return []
    const set = new Set(
      attendanceData.map(r => (r.student?.group || '').trim()).filter(Boolean)
    )
    return [...set].sort((a, b) => a.localeCompare(b, 'ar'))
  }, [attendanceData])

  // Apply filters (searchQuery)
  const filteredAttendance = useMemo(() => {
    return attendanceData.map(r => {
      const totalSessions = r.present + r.absent + r.late + r.excused
      const attended = r.present + r.late
      const divisor = totalSessions - r.excused > 0 ? totalSessions - r.excused : totalSessions
      const rate = divisor > 0 ? Math.round((attended / divisor) * 100) : 100
      return { ...r, rate, totalSessions }
    }).filter(r => {
      let matchSearch = true
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase()
        const name = (r.student?.name || '').toLowerCase()
        const phone = (r.student?.phone || '').toLowerCase()
        matchSearch = name.includes(query) || phone.includes(query)
      }
      return matchSearch
    })
  }, [attendanceData, searchQuery])

  // Aggregate stats
  const stats = useMemo(() => {
    if (filteredAttendance.length === 0) {
      return { avgRate: 0, totalPresent: 0, totalAbsent: 0, mostAbsent: [] }
    }

    let sumRate = 0
    let totalPresent = 0
    let totalAbsent = 0
    
    for (const r of filteredAttendance) {
      sumRate += r.rate
      totalPresent += (r.present + r.late)
      totalAbsent += r.absent
    }

    const avgRate = Math.round(sumRate / filteredAttendance.length)

    // Most absent students: sort by absolute absent count descending, filter top 3
    const mostAbsent = [...filteredAttendance]
      .filter(r => r.absent > 0)
      .sort((a, b) => b.absent - a.absent)
      .slice(0, 3)

    return { avgRate, totalPresent, totalAbsent, mostAbsent }
  }, [filteredAttendance])

  const selectGrade = (grade) => {
    setCurrentGrade(grade)
    setCurrentGroup('')
    setCurrentBranch('all')
    setAttendanceData([])
    setSearchQuery('')
  }

  const selectGroup = (group) => {
    setCurrentGroup(group)
    setAttendanceData([])
    setSearchQuery('')
  }

  const exportCsv = () => {
    const csvCell = (val) => `"${String(val == null ? '' : val).replace(/"/g, '""')}"`
    const headers = ['#', 'اسم الطالب', 'رقم الهاتف', 'الصف', 'المجموعة', 'نسبة الحضور', 'حاضر', 'غائب', 'متأخر', 'معذور', 'الفرع']
    const rows = filteredAttendance.map((r, idx) => [
      idx + 1,
      r.student?.name || '—',
      r.student?.phone || '—',
      GRADE_LABEL[r.student?.grade] || r.student?.grade || '—',
      r.student?.group || '—',
      `${r.rate}%`,
      r.present,
      r.absent,
      r.late,
      r.excused,
      r.student?.branches?.name || '—'
    ])

    const content = '\uFEFF' + [headers.map(csvCell).join(','), ...rows.map(row => row.map(csvCell).join(','))].join('\n')
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance-group-report-${currentGrade || 'all'}-${currentGroup || 'all'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="cp-page">
      <div className="cp-container">
        
        {/* Back button */}
        <button className="cp-crumbs-back" onClick={() => navigate(-1)} style={{ marginBottom: '1.5rem' }}>
          <i className="fas fa-arrow-right"></i>
          <span>رجوع</span>
        </button>

        <div className="cp-page-header">
          <div className="cp-page-header-text">
            <h1>التقرير الجماعي للحضور والغياب</h1>
            <p>متابعة وتحليل نسب حضور الطلاب وسجل الانضباط والتأخيرات على مستوى الصف والمجموعات</p>
          </div>
          <div className="cp-page-icon">
            <i className="fas fa-calendar-check"></i>
          </div>
        </div>
        <div className="cp-header-divider"></div>

        {loadError && (
          <div style={{ textAlign: 'center', padding: 12, color: '#c53030', marginBottom: 20 }}>
            <i className="fas fa-exclamation-triangle"></i> {loadError}
          </div>
        )}

        {/* Grade Picker */}
        <div className="cp-panel" style={{ padding: '1.5rem', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 16px', color: 'var(--cp-text-main)' }}>
            <i className="fas fa-graduation-cap" style={{ color: '#5bc2e7', marginLeft: 8 }}></i> الصف الدراسي
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {availableGrades.map((grade) => (
              <button
                key={grade}
                className={`cp-btn ${currentGrade === grade ? 'cp-btn-success' : 'cp-btn-ghost'}`}
                onClick={() => selectGrade(grade)}
                style={{ borderRadius: 12, padding: '10px 18px' }}
              >
                <i className="fas fa-graduation-cap" style={{ marginLeft: 6 }}></i>
                {GRADE_LABEL[grade]}
                <span className="cp-badge cp-badge-neutral" style={{ marginInlineStart: 8, background: 'rgba(255,255,255,0.15)', color: 'inherit' }}>
                  {gradeStudentCounts[grade] || 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Group / Branch Picker */}
        {currentGrade && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div className="cp-panel" style={{ padding: '1.5rem', margin: 0 }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 16px', color: 'var(--cp-text-main)' }}>
                <i className="fas fa-users" style={{ color: '#5bc2e7', marginLeft: 8 }}></i> المجموعة
              </h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button
                  className={`cp-btn ${currentGroup === '' ? 'cp-btn-success' : 'cp-btn-ghost'}`}
                  onClick={() => selectGroup('')}
                  style={{ borderRadius: 12, padding: '10px 18px' }}
                >
                  <i className="fas fa-layer-group" style={{ marginLeft: 6 }}></i>
                  جميع المجموعات
                </button>
                {groupsForGrade.map((group) => (
                  <button
                    key={group}
                    className={`cp-btn ${currentGroup === group ? 'cp-btn-success' : 'cp-btn-ghost'}`}
                    onClick={() => selectGroup(group)}
                    style={{ borderRadius: 12, padding: '10px 18px' }}
                  >
                    <i className="fas fa-users" style={{ marginLeft: 6 }}></i>
                    {group}
                  </button>
                ))}
              </div>
            </div>

            <div className="cp-panel" style={{ padding: '1.5rem', margin: 0 }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 16px', color: 'var(--cp-text-main)' }}>
                <i className="fas fa-building" style={{ color: '#5bc2e7', marginLeft: 8 }}></i> الفرع
              </h2>
              <select value={currentBranch} onChange={(e) => setCurrentBranch(e.target.value)} className="cp-select" style={{ width: '100%' }}>
                <option value="all">جميع الفروع</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {reportLoading && (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.8rem', color: 'var(--cp-primary)' }}></i>
            <p style={{ marginTop: 8, color: 'var(--cp-text-muted)' }}>جارٍ تحميل تقرير الحضور والغياب...</p>
          </div>
        )}

        {/* Report Content */}
        {currentGrade && !reportLoading && attendanceData.length > 0 && (
          <>
            {/* Stats row */}
            <div className="cp-stats-row" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
              <div className="cp-stat" style={{ borderRight: '3px solid #10b981' }}>
                <i className="fas fa-percentage" style={{ color: '#10b981' }}></i>
                <div>
                  <div className="cp-stat-val" style={{ color: '#10b981' }}>{stats.avgRate}%</div>
                  <div className="cp-stat-lbl">متوسط الحضور العام</div>
                </div>
              </div>
              <div className="cp-stat" style={{ borderRight: '3px solid #818cf8' }}>
                <i className="fas fa-calendar-check" style={{ color: '#818cf8' }}></i>
                <div>
                  <div className="cp-stat-val">{stats.totalPresent}</div>
                  <div className="cp-stat-lbl">إجمالي الحضور (يوم)</div>
                </div>
              </div>
              <div className="cp-stat cp-stat-bad" style={{ borderRight: '3px solid #ef4444' }}>
                <i className="fas fa-calendar-times" style={{ color: '#ef4444' }}></i>
                <div>
                  <div className="cp-stat-val">{stats.totalAbsent}</div>
                  <div className="cp-stat-lbl">إجمالي الغياب (يوم)</div>
                </div>
              </div>

              {/* Warning panel: Most absent students */}
              {stats.mostAbsent.length > 0 && (
                <div className="cp-stat" style={{ borderRight: '3px solid #f59e0b', flex: '1 1 300px' }}>
                  <i className="fas fa-triangle-exclamation" style={{ color: '#f59e0b' }}></i>
                  <div style={{ flex: 1 }}>
                    <div className="cp-stat-lbl" style={{ fontWeight: 700, color: 'var(--cp-text-main)', fontSize: '0.8rem', marginBottom: 4 }}>الطلاب الأكثر غياباً</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--cp-text-muted)' }}>
                      {stats.mostAbsent.map((s, index) => (
                        <div key={s.student.id}>
                          {index + 1}. {s.student.name} ({s.absent} غياب)
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Filter chips */}
            <div className="cp-panel" style={{ padding: '1.5rem', marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 16px', color: 'var(--cp-text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fas fa-filter" style={{ color: '#5bc2e7' }}></i> تصفية
              </h2>
              <div style={{ maxWidth: 360 }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--cp-text-muted)', display: 'block', marginBottom: 6 }}>البحث عن طالب</label>
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="بحث بالاسم أو رقم الهاتف..." className="cp-input" style={{ width: '100%' }} />
              </div>
            </div>

            {/* Data Table */}
            <div className="cp-table-card" id="attendance-groupTable">
              <PrintReportHeader subtitle={`تقرير حضور الطلاب - ${GRADE_LABEL[currentGrade]}`} />
              <div className="cp-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--cp-text-main)' }}>
                    <i className="fas fa-clipboard-list" style={{ color: '#5bc2e7', marginLeft: 8 }}></i>
                    سجل حضور الطلاب التفصيلي
                  </h2>
                  <span className="cp-badge cp-badge-neutral">{filteredAttendance.length}</span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={exportCsv} className="cp-crumbs-back" style={{ padding: '6px 12px', background: 'transparent' }}>
                    <i className="fas fa-file-csv" style={{ marginLeft: 6 }}></i> تصدير CSV
                  </button>
                  <button onClick={() => window.print()} className="cp-crumbs-back" style={{ padding: '6px 12px', background: 'transparent' }}>
                    <i className="fas fa-print" style={{ marginLeft: 6 }}></i> طباعة التقرير
                  </button>
                </div>
              </div>

              <div className="cp-table-container">
                {filteredAttendance.length > 0 ? (
                  <table className="cp-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>اسم الطالب</th>
                        <th>المجموعة</th>
                        <th>نسبة الحضور</th>
                        <th>حاضر</th>
                        <th>غائب</th>
                        <th>متأخر</th>
                        <th>معذور</th>
                        <th>إجمالي الحصص</th>
                        <th>الفرع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAttendance.map((r, idx) => (
                        <tr key={r.student.id}>
                          <td>{idx + 1}</td>
                          <td style={{ fontWeight: 700 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div className="cp-avatar cp-avatar-purple" style={{ width: 30, height: 30, fontSize: '0.8rem' }}>
                                <i className="fas fa-user"></i>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span>{r.student.name}</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--cp-text-muted)', fontWeight: 'normal' }}>{r.student.phone || '—'}</span>
                              </div>
                            </div>
                          </td>
                          <td>{r.student.group || '—'}</td>
                          <td style={{ fontWeight: 700, color: r.rate >= 85 ? '#10b981' : r.rate >= 70 ? '#f59e0b' : '#ef4444' }}>
                            {r.rate}%
                          </td>
                          <td><span style={{ color: '#10b981', fontWeight: 600 }}>{r.present}</span></td>
                          <td><span style={{ color: '#ef4444', fontWeight: 600 }}>{r.absent}</span></td>
                          <td><span style={{ color: '#f59e0b', fontWeight: 600 }}>{r.late}</span></td>
                          <td><span style={{ color: '#3b82f6', fontWeight: 600 }}>{r.excused}</span></td>
                          <td style={{ fontWeight: 600, color: 'var(--cp-text-muted)' }}>{r.totalSessions}</td>
                          <td>{r.student.branches?.name || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--cp-text-muted)' }}>
                    <i className="fas fa-user-slash" style={{ fontSize: '2rem', marginBottom: 8, display: 'block' }}></i>
                    <p style={{ margin: 0 }}>لا توجد سجلات حضور تطابق التصفية الحالية.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {currentGrade && !reportLoading && attendanceData.length === 0 && (
          <div className="cp-table-card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--cp-text-muted)' }}>
            <i className="fas fa-calendar-xmark" style={{ fontSize: '2.5rem', marginBottom: 12, color: 'var(--cp-divider)' }}></i>
            <p style={{ margin: 0 }}>لم يتم تسجيل حضور وغياب لطلاب هذا الصف بعد.</p>
          </div>
        )}

      </div>
    </main>
  )
}
