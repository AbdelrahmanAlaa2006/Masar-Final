import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { getCenterStudentAttendance } from '@backend/reportsApi'
import { getProfile } from '@backend/profilesApi'
import PrintReportHeader from '../components/PrintReportHeader'
import './ExamsReport.css'

const STATUS_LABELS = {
  present: 'حاضر',
  absent: 'غائب',
  late: 'متأخر',
  excused: 'معذور'
}

export default function AttendanceReport() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [studentName, setStudentName] = useState('الطالب')
  const [studentId, setStudentId] = useState('')
  
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateRangeOption, setDateRangeOption] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const getPastDateString = (days) => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const getTodayDateString = () => {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const handleDateRangeOptionChange = (val) => {
    setDateRangeOption(val)
    if (val === 'all') {
      setDateFrom('')
      setDateTo('')
    } else if (val === '1w') {
      setDateFrom(getPastDateString(7))
      setDateTo(getTodayDateString())
    } else if (val === '2w') {
      setDateFrom(getPastDateString(14))
      setDateTo(getTodayDateString())
    } else if (val === '3w') {
      setDateFrom(getPastDateString(21))
      setDateTo(getTodayDateString())
    } else if (val === '1m') {
      setDateFrom(getPastDateString(30))
      setDateTo(getTodayDateString())
    } else if (val === '2m') {
      setDateFrom(getPastDateString(60))
      setDateTo(getTodayDateString())
    } else if (val === '3m') {
      setDateFrom(getPastDateString(90))
      setDateTo(getTodayDateString())
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const u = JSON.parse(sessionStorage.getItem('masar-user')) || null
        const paramId = searchParams.get('id')
        const targetId = paramId || u?.id
        
        const paramName = searchParams.get('student')
        if (paramName) setStudentName(paramName)
        if (paramId) setStudentId(paramId)

        if (!targetId) return

        setLoading(true)
        setLoadError('')

        if (paramId && paramId !== u?.id) {
          const p = await getProfile(paramId)
          if (p?.name) setStudentName(p.name)
          if (p?.phone) setStudentId(p.phone)
        } else if (u) {
          if (u.name) setStudentName(u.name)
          if (u.phone) setStudentId(u.phone)
        }

        const data = await getCenterStudentAttendance(targetId)
        if (!cancelled) {
          setRecords(data)
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'تعذر تحميل سجل الحضور')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [searchParams])

  // Apply filters
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const matchStatus = statusFilter === 'all' || r.status === statusFilter
      
      let matchDate = true
      if (dateFrom || dateTo) {
        if (dateFrom && r.date < dateFrom) matchDate = false
        if (dateTo && r.date > dateTo) matchDate = false
      }

      return matchStatus && matchDate
    })
  }, [records, statusFilter, dateFrom, dateTo])

  // Stats
  const stats = useMemo(() => {
    const total = filteredRecords.length
    if (total === 0) {
      return { total: 0, present: 0, absent: 0, late: 0, excused: 0, rate: 0 }
    }

    const present = filteredRecords.filter(r => r.status === 'present').length
    const absent = filteredRecords.filter(r => r.status === 'absent').length
    const late = filteredRecords.filter(r => r.status === 'late').length
    const excused = filteredRecords.filter(r => r.status === 'excused').length

    // Presence rate: count Present and Late as attended
    const attended = present + late
    // Exclude excused from total for attendance rate calculation if applicable, or treat them neutrally
    const divisor = total - excused > 0 ? total - excused : total
    const rate = Math.round((attended / divisor) * 100)

    return { total, present, absent, late, excused, rate }
  }, [filteredRecords])

  const exportCsv = () => {
    const csvCell = (val) => `"${String(val == null ? '' : val).replace(/"/g, '""')}"`
    const headers = ['#', 'الحصة / الدرس', 'التاريخ', 'الحالة', 'المعلم/المشرف', 'ملاحظات']
    const rows = filteredRecords.map((r, idx) => [
      idx + 1,
      r.title,
      r.date,
      STATUS_LABELS[r.status] || r.status,
      r.teacher || 'الإدارة',
      r.notes || ''
    ])

    const content = '\uFEFF' + [headers.map(csvCell).join(','), ...rows.map(row => row.map(csvCell).join(','))].join('\n')
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance-report-${studentId || 'student'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <main className="cp-page">
        <div className="cp-container" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: 'var(--cp-primary)' }}></i>
          <p style={{ marginTop: 12, color: 'var(--cp-text-muted)' }}>جارٍ تحميل تقرير حضور الطالب...</p>
        </div>
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="cp-page">
        <div className="cp-container" style={{ textAlign: 'center', padding: '3rem 1rem', color: '#ef4444' }}>
          <i className="fas fa-exclamation-triangle" style={{ fontSize: '2rem' }}></i>
          <p style={{ marginTop: 12 }}>{loadError}</p>
        </div>
      </main>
    )
  }

  const handleBack = () => {
    if (window.history.state && typeof window.history.state.idx === 'number' && window.history.state.idx > 0) {
      navigate(-1)
    } else {
      navigate('/report')
    }
  }

  return (
    <main className="cp-page er-print-container">
      <div className="cp-container">
        
        {/* Back button */}
        <button className="cp-crumbs-back" onClick={handleBack} style={{ marginBottom: '1.5rem' }}>
          <i className="fas fa-arrow-right"></i>
          <span>رجوع</span>
        </button>

        {/* Header */}
        <div className="er-header-wrap">
          <div className="er-title-area">
            <h1>تقرير الحضور والغياب (السنتر)</h1>
            <p>متابعة وتتبع سجل حضور وغياب وتأخيرات الطالب بالسنتر</p>
          </div>
          <div className="er-actions">
            <button onClick={handleBack} className="cp-btn cp-btn-ghost" style={{ padding: '8px 16px', borderRadius: 12 }}>
              <i className="fas fa-arrow-right" style={{ marginLeft: 6 }}></i> رجوع
            </button>
            <button onClick={exportCsv} className="cp-btn cp-btn-ghost" style={{ padding: '8px 16px', borderRadius: 12 }}>
              <i className="fas fa-file-csv" style={{ marginLeft: 6 }}></i> تصدير CSV
            </button>
            <button onClick={() => window.print()} className="cp-btn cp-btn-success" style={{ padding: '8px 16px', borderRadius: 12 }}>
              <i className="fas fa-print" style={{ marginLeft: 6 }}></i> طباعة
            </button>
          </div>
        </div>

        {/* Student Banner */}
        <div className="cp-target-banner" style={{ marginBottom: 24 }}>
          <div className="cp-avatar cp-avatar-purple">
            <i className="fas fa-user-check" style={{ fontSize: '1.2rem' }}></i>
          </div>
          <div className="cp-target-banner-body">
            <div className="cp-target-banner-label">الطالب الحالي</div>
            <div className="cp-target-banner-name">{studentName}</div>
            <div className="cp-target-banner-meta">
              {studentId && <span><i className="fas fa-phone"></i> رقم الهاتف: {studentId}</span>}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="er-stats-grid" style={{ marginBottom: 24 }}>
          <div className="er-stat-card er-stat-total">
            <div className="er-stat-icon"><i className="fas fa-percentage"></i></div>
            <div className="er-stat-info">
              <h3>نسبة الحضور</h3>
              <p style={{ color: stats.rate >= 85 ? '#10b981' : stats.rate >= 70 ? '#f59e0b' : '#ef4444' }}>{stats.rate}%</p>
            </div>
          </div>

          <div className="er-stat-card er-stat-passed" style={{ borderRightColor: '#10b981' }}>
            <div className="er-stat-icon" style={{ color: '#10b981' }}><i className="fas fa-check-circle"></i></div>
            <div className="er-stat-info">
              <h3>أيام الحضور</h3>
              <p>{stats.present} <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', fontWeight: 'normal' }}>أيام ({stats.late} متأخر)</span></p>
            </div>
          </div>

          <div className="er-stat-card er-stat-failed" style={{ borderRightColor: '#ef4444' }}>
            <div className="er-stat-icon" style={{ color: '#ef4444' }}><i className="fas fa-times-circle"></i></div>
            <div className="er-stat-info">
              <h3>أيام الغياب</h3>
              <p>{stats.absent} <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', fontWeight: 'normal' }}>أيام</span></p>
            </div>
          </div>

          <div className="er-stat-card er-stat-average" style={{ borderRightColor: '#3b82f6' }}>
            <div className="er-stat-icon" style={{ color: '#3b82f6' }}><i className="fas fa-question-circle"></i></div>
            <div className="er-stat-info">
              <h3>الغياب المعذور</h3>
              <p>{stats.excused} <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', fontWeight: 'normal' }}>حصص</span></p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="cp-panel" style={{ padding: '1.5rem', marginBottom: 24 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 16px', color: 'var(--cp-text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-filter" style={{ color: '#5bc2e7' }}></i> تصفية سجل الحضور
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--cp-text-muted)', display: 'block', marginBottom: 6 }}>حالة الحضور</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="cp-input" style={{ width: '100%' }}>
                <option value="all">كل الحالات</option>
                <option value="present">حاضر فقط</option>
                <option value="absent">غائب فقط</option>
                <option value="late">حاضر متأخر</option>
                <option value="excused">غائب بعذر</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--cp-text-muted)', display: 'block', marginBottom: 6 }}>الفترة الزمنية</label>
              <select value={dateRangeOption} onChange={(e) => handleDateRangeOptionChange(e.target.value)} className="cp-input" style={{ width: '100%' }}>
                <option value="all">كل التواريخ</option>
                <option value="1w">آخر أسبوع</option>
                <option value="2w">آخر أسبوعين</option>
                <option value="3w">آخر 3 أسابيع</option>
                <option value="1m">آخر شهر</option>
                <option value="2m">آخر شهرين</option>
                <option value="3m">آخر 3 أشهر</option>
                <option value="custom">تاريخ مخصص</option>
              </select>
            </div>

            {dateRangeOption === 'custom' && (
              <>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--cp-text-muted)', display: 'block', marginBottom: 6 }}>تاريخ من</label>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="cp-input" style={{ width: '100%' }} />
                </div>

                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--cp-text-muted)', display: 'block', marginBottom: 6 }}>تاريخ إلى</label>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="cp-input" style={{ width: '100%' }} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="cp-table-card" id="attendance-reportTable">
          <PrintReportHeader subtitle="تقرير حضور وغياب السنتر" />
          <div className="cp-panel-header" style={{ padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-calendar-check" style={{ color: '#10b981' }}></i> سجل حضور الحصص بالتفصيل
            </h2>
          </div>

          <div className="cp-table-container">
            {filteredRecords.length > 0 ? (
              <table className="cp-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>الحصة / الدرس</th>
                    <th>التاريخ</th>
                    <th>حالة الحضور</th>
                    <th>المشرف / المعلم</th>
                    <th>ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((r, idx) => (
                    <tr key={r.id}>
                      <td>{idx + 1}</td>
                      <td style={{ fontWeight: 700 }}>{r.title}</td>
                      <td>{r.date}</td>
                      <td>
                        <span className={`cp-badge cp-badge-${
                          r.status === 'present' ? 'success' :
                          r.status === 'absent' ? 'danger' :
                          r.status === 'late' ? 'warning' : 'info'
                        }`}>
                          <i className={`fas ${
                            r.status === 'present' ? 'fa-check' :
                            r.status === 'absent' ? 'fa-times' :
                            r.status === 'late' ? 'fa-clock' : 'fa-info-circle'
                          }`} style={{ marginInlineEnd: 6 }}></i>
                          {STATUS_LABELS[r.status] || r.status}
                        </span>
                      </td>
                      <td>{r.teacher || 'الإدارة'}</td>
                      <td style={{ color: 'var(--cp-text-muted)', fontSize: '0.85rem' }}>{r.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--cp-text-muted)' }}>
                <i className="fas fa-user-slash" style={{ fontSize: '2.5rem', marginBottom: 12, color: 'var(--cp-divider)' }}></i>
                <p style={{ margin: 0 }}>لا توجد سجلات حضور تطابق التصفية الحالية.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </main>
  )
}
