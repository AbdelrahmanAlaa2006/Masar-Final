import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { getCenterStudentGradesCombined } from '@backend/reportsApi'
import { getProfile } from '@backend/profilesApi'
import PrintReportHeader from '../components/PrintReportHeader'
import './ExamsReport.css' // Reuse the premium styling from ExamsReport

const TYPE_LABELS = {
  exam: 'امتحان سنتر',
  quiz: 'تسميع شفوي',
  homework: 'واجب سنتر',
  participation: 'مشاركة وتفاعل',
  behavior: 'سلوك وانضباط'
}

const fmtDate = (d) => {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date)) return '—'
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
}

export default function GradesReport() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [studentName, setStudentName] = useState('الطالب')
  const [studentId, setStudentId] = useState('')
  
  const [grades, setGrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [selectedGrade, setSelectedGrade] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)

  // Filters
  const [typeFilter, setTypeFilter] = useState('all')
  const [subjectFilter, setSubjectFilter] = useState('all')
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

        const data = await getCenterStudentGradesCombined(targetId)
        if (!cancelled) {
          setGrades(data)
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'تعذر تحميل درجات الطالب')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [searchParams])

  // Get unique subjects for filter
  const subjects = useMemo(() => {
    const set = new Set(grades.map(g => g.subject).filter(Boolean))
    return Array.from(set)
  }, [grades])

  // Apply filters
  const filteredGrades = useMemo(() => {
    return grades.filter(g => {
      const matchType = typeFilter === 'all' || g.type === typeFilter
      const matchSubject = subjectFilter === 'all' || g.subject === subjectFilter
      
      let matchDate = true
      if (dateFrom || dateTo) {
        const gDate = new Date(g.created_at).toISOString().split('T')[0]
        if (dateFrom && gDate < dateFrom) matchDate = false
        if (dateTo && gDate > dateTo) matchDate = false
      }

      return matchType && matchSubject && matchDate
    })
  }, [grades, typeFilter, subjectFilter, dateFrom, dateTo])

  // Stats calculations
  const stats = useMemo(() => {
    const valid = filteredGrades.filter(g => (g.max_score || 0) > 0)
    if (valid.length === 0) {
      return { total: 0, avg: 0, highest: 0, lowest: 0 }
    }

    const percentages = valid.map(g => Math.round((parseFloat(g.score) / parseFloat(g.max_score)) * 100))
    const total = valid.length
    const avg = Math.round(percentages.reduce((s, p) => s + p, 0) / total)
    const highest = Math.max(...percentages)
    const lowest = Math.min(...percentages)

    return { total, avg, highest, lowest }
  }, [filteredGrades])

  const openDetails = (g) => {
    setSelectedGrade(g)
    setShowDetailModal(true)
  }

  const exportCsv = () => {
    const csvCell = (val) => `"${String(val == null ? '' : val).replace(/"/g, '""')}"`
    const headers = ['#', 'النشاط', 'النوع', 'المادة', 'التاريخ', 'الدرجة', 'الدرجة الكلية', 'النسبة مئوية', 'المعلم/المشرف', 'ملاحظات']
    const rows = filteredGrades.map((g, idx) => {
      const pct = g.max_score > 0 ? Math.round((g.score / g.max_score) * 100) : 0
      return [
        idx + 1,
        g.title,
        TYPE_LABELS[g.type] || g.type,
        g.subject || '—',
        fmtDate(g.created_at),
        g.score,
        g.max_score,
        `${pct}%`,
        g.creator?.name || 'الإدارة',
        g.notes || ''
      ]
    })

    const content = '\uFEFF' + [headers.map(csvCell).join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\n')
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `grades-report-${studentId || 'student'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <main className="cp-page">
        <div className="cp-container" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: 'var(--cp-primary)' }}></i>
          <p style={{ marginTop: 12, color: 'var(--cp-text-muted)' }}>جارٍ تحميل تقرير درجات الطالب...</p>
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

        {/* Breadcrumbs / Header */}
        <div className="er-header-wrap">
          <div className="er-title-area">
            <h1>تقرير درجات السنتر الشامل</h1>
            <p>متابعة درجات التقييمات والواجبات والأنشطة اليدوية بالسنتر</p>
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
            <i className="fas fa-user-graduate" style={{ fontSize: '1.2rem' }}></i>
          </div>
          <div className="cp-target-banner-body">
            <div className="cp-target-banner-label">الطالب الحالي</div>
            <div className="cp-target-banner-name">{studentName}</div>
            <div className="cp-target-banner-meta">
              {studentId && <span><i className="fas fa-phone"></i> رقم الهاتف: {studentId}</span>}
            </div>
          </div>
        </div>

        {/* Statistics Grid */}
        <div className="er-stats-grid" style={{ marginBottom: 24 }}>
          <div className="er-stat-card er-stat-total">
            <div className="er-stat-icon"><i className="fas fa-clipboard-list"></i></div>
            <div className="er-stat-info">
              <h3>إجمالي الأنشطة</h3>
              <p>{stats.total}</p>
            </div>
          </div>

          <div className="er-stat-card er-stat-average">
            <div className="er-stat-icon"><i className="fas fa-chart-line"></i></div>
            <div className="er-stat-info">
              <h3>متوسط التقييم</h3>
              <p style={{ color: stats.avg >= 80 ? '#10b981' : stats.avg >= 60 ? '#f59e0b' : '#ef4444' }}>{stats.avg}%</p>
            </div>
          </div>

          <div className="er-stat-card er-stat-passed">
            <div className="er-stat-icon"><i className="fas fa-award"></i></div>
            <div className="er-stat-info">
              <h3>أعلى تقييم</h3>
              <p style={{ color: '#10b981' }}>{stats.highest}%</p>
            </div>
          </div>

          <div className="er-stat-card er-stat-failed">
            <div className="er-stat-icon"><i className="fas fa-chevron-circle-down"></i></div>
            <div className="er-stat-info">
              <h3>أقل تقييم</h3>
              <p style={{ color: stats.lowest >= 60 ? '#f59e0b' : '#ef4444' }}>{stats.lowest}%</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="cp-panel" style={{ padding: '1.5rem', marginBottom: 24 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 16px', color: 'var(--cp-text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-filter" style={{ color: '#5bc2e7' }}></i> تصفية سجل الدرجات
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--cp-text-muted)', display: 'block', marginBottom: 6 }}>نوع النشاط</label>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="cp-input" style={{ width: '100%' }}>
                <option value="all">كل الأنشطة</option>
                <option value="exam">امتحانات السنتر الورقية</option>
                <option value="quiz">التسميع الشفوي</option>
                <option value="homework">الواجبات اليومية</option>
                <option value="participation">التفاعل والمشاركة</option>
                <option value="behavior">السلوك والانضباط</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--cp-text-muted)', display: 'block', marginBottom: 6 }}>المادة الدراسية</label>
              <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="cp-input" style={{ width: '100%' }}>
                <option value="all">كل المواد</option>
                {subjects.map(sub => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
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

        {/* Data Table */}
        <div className="cp-table-card" id="grades-reportTable">
          <PrintReportHeader subtitle="تقرير درجات السنتر" />
          <div className="cp-panel-header" style={{ padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-list-check" style={{ color: '#818cf8' }}></i> سجل الدرجات والتقييمات التفصيلي
            </h2>
          </div>

          <div className="cp-table-container">
            {filteredGrades.length > 0 ? (
              <table className="cp-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>النشاط / التقييم</th>
                    <th>النوع</th>
                    <th>المادة</th>
                    <th>التاريخ</th>
                    <th>الدرجة</th>
                    <th>النسبة</th>
                    <th>المعلم</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGrades.map((g, idx) => {
                    const pct = g.max_score > 0 ? Math.round((g.score / g.max_score) * 100) : 0
                    return (
                      <tr key={g.id}>
                        <td>{idx + 1}</td>
                        <td style={{ fontWeight: 700 }}>{g.title}</td>
                        <td>
                          <span className={`cp-badge cp-badge-${
                            g.type === 'exam' ? 'purple' : g.type === 'quiz' ? 'blue' : g.type === 'homework' ? 'teal' : 'neutral'
                          }`}>
                            {TYPE_LABELS[g.type] || g.type}
                          </span>
                        </td>
                        <td>{g.subject || '—'}</td>
                        <td>{fmtDate(g.created_at)}</td>
                        <td>
                          <span style={{ fontWeight: 600 }}>{g.score}</span> / <span style={{ color: 'var(--cp-text-muted)' }}>{g.max_score}</span>
                        </td>
                        <td style={{ fontWeight: 700, color: pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444' }}>
                          {pct}%
                        </td>
                        <td>{g.creator?.name || 'الإدارة'}</td>
                        <td>
                          <button onClick={() => openDetails(g)} className="cp-btn cp-btn-ghost" style={{ padding: '4px 10px', fontSize: '0.8rem', borderRadius: 8 }}>
                            <i className="fas fa-info-circle"></i> تفاصيل
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--cp-text-muted)' }}>
                <i className="fas fa-clipboard-question" style={{ fontSize: '2.5rem', marginBottom: 12, color: 'var(--cp-divider)' }}></i>
                <p style={{ margin: 0 }}>لا توجد درجات مسجلة تطابق التصفية الحالية.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Details Modal */}
      {showDetailModal && selectedGrade && (
        <div className="rp-modal-overlay" onClick={() => setShowDetailModal(false)} role="dialog" aria-modal="true">
          <div className="rp-modal" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', color: 'var(--cp-text-main)', maxWidth: 460 }}>
            <div className="rp-modal-header" style={{ borderBottom: '1px solid var(--cp-divider)' }}>
              <div className="rp-modal-icon">
                <i className="fas fa-file-invoice"></i>
              </div>
              <div className="rp-modal-title">
                <h3 style={{ color: 'var(--cp-text-main)', margin: 0 }}>تفاصيل التقييم</h3>
                <p style={{ color: 'var(--cp-text-muted)', margin: '4px 0 0', fontSize: '0.8rem' }}>{selectedGrade.title}</p>
              </div>
              <button className="rp-modal-close" onClick={() => setShowDetailModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div style={{ padding: 20 }}>
              <div className="cp-table-container" style={{ border: 'none', background: 'transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                  <span style={{ color: 'var(--cp-text-muted)' }}>نوع التقييم</span>
                  <span style={{ color: 'var(--cp-text-main)', fontWeight: 600 }}>{TYPE_LABELS[selectedGrade.type] || selectedGrade.type}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                  <span style={{ color: 'var(--cp-text-muted)' }}>المادة</span>
                  <span style={{ color: 'var(--cp-text-main)', fontWeight: 600 }}>{selectedGrade.subject || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                  <span style={{ color: 'var(--cp-text-muted)' }}>الدرجة المسجلة</span>
                  <span style={{ color: 'var(--cp-text-main)', fontWeight: 700 }}>
                    {selectedGrade.score} من {selectedGrade.max_score}
                    {' '}({selectedGrade.max_score > 0 ? Math.round((selectedGrade.score / selectedGrade.max_score) * 100) : 0}%)
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                  <span style={{ color: 'var(--cp-text-muted)' }}>تاريخ التسجيل</span>
                  <span style={{ color: 'var(--cp-text-main)', fontWeight: 600 }}>{fmtDate(selectedGrade.created_at)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--cp-divider)' }}>
                  <span style={{ color: 'var(--cp-text-muted)' }}>المعلم / المسجل</span>
                  <span style={{ color: 'var(--cp-text-main)', fontWeight: 600 }}>{selectedGrade.creator?.name || 'الإدارة'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 0' }}>
                  <span style={{ color: 'var(--cp-text-muted)', marginBottom: 6 }}>ملاحظات المعلم</span>
                  <div style={{
                    color: 'var(--cp-text-main)',
                    background: 'var(--cp-hover-bg)',
                    padding: 10,
                    borderRadius: 8,
                    fontSize: '0.88rem',
                    lineHeight: 1.5,
                    border: '1px solid var(--cp-divider)',
                    minHeight: 60
                  }}>
                    {selectedGrade.notes || 'لا توجد ملاحظات تفصيلية مسجلة.'}
                  </div>
                </div>
              </div>

              <button className="cp-btn cp-btn-ghost" onClick={() => setShowDetailModal(false)} style={{ width: '100%', marginTop: 18, padding: 12, borderRadius: 12 }}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
