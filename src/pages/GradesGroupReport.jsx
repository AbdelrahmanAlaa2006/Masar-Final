import { useState, useEffect, useMemo } from 'react'
import { listStudentsByGrade } from '@backend/profilesApi'
import { listCenterGradesGroupCombined } from '@backend/reportsApi'
import { listBranches } from '@backend/branchesApi'
import { cached, LIST_TTL } from '../utils/cache'
import PrintReportHeader from '../components/PrintReportHeader'
import './ExamsGroupReport.css'

import { GRADE_LABEL, GRADE_ORDER } from './ControlPanel/shared'

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

export default function GradesGroupReport() {
  const [currentGrade, setCurrentGrade] = useState('')
  const [currentGroup, setCurrentGroup] = useState('')
  const [students, setStudents] = useState([])
  const [gradesData, setGradesData] = useState([])

  const [loading, setLoading] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)

  // Filters
  const [typeFilter, setTypeFilter] = useState('all')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRangeOption, setDateRangeOption] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [branches, setBranches] = useState([])
  const [branchFilter, setBranchFilter] = useState('all')

  // Load branches
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await cached('branches-list', LIST_TTL, listBranches)
        if (!cancelled) setBranches(list)
      } catch (err) {
        console.error('Failed to load branches:', err)
      }
    })()
    return () => { cancelled = true }
  }, [])

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

  // Load this grade's students (lazy, scoped) when a grade is selected.
  useEffect(() => {
    if (!currentGrade) { setStudents([]); return }
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const rows = await cached(`students:grade:${currentGrade}`, LIST_TTL, () => listStudentsByGrade(currentGrade))
        if (!cancelled) setStudents(rows)
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'تعذر تحميل الطلاب')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [currentGrade])

  // All students in the chosen grade — used to derive group chips.
  const studentsInGrade = useMemo(
    () => students.filter(s => s.grade === currentGrade),
    [students, currentGrade]
  )

  // Distinct groups within selected grade.
  const groupsForGrade = useMemo(() => {
    const set = new Set(
      studentsInGrade.map(s => (s.group || '').trim()).filter(Boolean)
    )
    return [...set].sort((a, b) => a.localeCompare(b, 'ar'))
  }, [studentsInGrade])

  // Load combined manual grades when grade or group is changed
  useEffect(() => {
    if (!currentGrade) { setGradesData([]); return }
    let cancelled = false
    ;(async () => {
      try {
        setReportLoading(true)
        const data = await listCenterGradesGroupCombined(currentGrade, currentGroup || 'all')
        if (!cancelled) {
          setGradesData(data)
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'تعذر تحميل درجات السنتر')
      } finally {
        if (!cancelled) setReportLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [currentGrade, currentGroup])

  // Get unique subjects for selected grade's grades
  const subjects = useMemo(() => {
    const set = new Set(gradesData.map(g => g.subject).filter(Boolean))
    return Array.from(set)
  }, [gradesData])

  // Apply filters
  const filteredGrades = useMemo(() => {
    return gradesData.filter(g => {
      const matchType = typeFilter === 'all' || g.type === typeFilter
      const matchSubject = subjectFilter === 'all' || g.subject === subjectFilter
      
      let matchSearch = true
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase()
        const stuName = (g.profiles?.name || '').toLowerCase()
        const stuPhone = (g.profiles?.phone || '').toLowerCase()
        matchSearch = stuName.includes(query) || stuPhone.includes(query)
      }

      let matchDate = true
      if (dateFrom || dateTo) {
        const gDate = new Date(g.created_at).toISOString().split('T')[0]
        if (dateFrom && gDate < dateFrom) matchDate = false
        if (dateTo && gDate > dateTo) matchDate = false
      }

      let matchBranch = true
      if (branchFilter !== 'all') {
        matchBranch = g.profiles?.branch_id === branchFilter
      }

      return matchType && matchSubject && matchSearch && matchDate && matchBranch
    })
  }, [gradesData, typeFilter, subjectFilter, searchQuery, dateFrom, dateTo, branchFilter])

  // Stats
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

  const selectGrade = (grade) => {
    setCurrentGrade(grade)
    setCurrentGroup('')
    setGradesData([])
    setTypeFilter('all')
    setSubjectFilter('all')
    setSearchQuery('')
    setDateRangeOption('all')
    setDateFrom('')
    setDateTo('')
    setBranchFilter('all')
  }

  const selectGroup = (group) => {
    setCurrentGroup(group)
    setGradesData([])
    setTypeFilter('all')
    setSubjectFilter('all')
    setSearchQuery('')
    setDateRangeOption('all')
    setDateFrom('')
    setDateTo('')
    setBranchFilter('all')
  }

  const exportCsv = () => {
    const csvCell = (val) => `"${String(val == null ? '' : val).replace(/"/g, '""')}"`
    const headers = ['#', 'اسم الطالب', 'رقم الهاتف', 'الصف', 'المجموعة', 'النشاط', 'المادة', 'النوع', 'الدرجة', 'الدرجة الكلية', 'النسبة مئوية', 'التاريخ', 'المعلم']
    const rows = filteredGrades.map((g, idx) => {
      const pct = g.max_score > 0 ? Math.round((g.score / g.max_score) * 100) : 0
      return [
        idx + 1,
        g.profiles?.name || '—',
        g.profiles?.phone || '—',
        GRADE_LABEL[g.profiles?.grade] || g.profiles?.grade || '—',
        g.profiles?.group || '—',
        g.title,
        g.subject || '—',
        TYPE_LABELS[g.type] || g.type,
        g.score,
        g.max_score,
        `${pct}%`,
        fmtDate(g.created_at),
        g.creator?.name || 'الإدارة'
      ]
    })

    const content = '\uFEFF' + [headers.map(csvCell).join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\n')
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `center-grades-group-${currentGrade || 'all'}-${currentGroup || 'all'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="cp-page">
      <div className="cp-container">
        
        <div className="cp-page-header">
          <div className="cp-page-header-text">
            <h1>التقرير الجماعي لدرجات السنتر</h1>
            <p>تحليل نتائج درجات التقييمات والواجبات اليدوية والأنشطة لجميع الطلاب بالسنتر</p>
          </div>
          <div className="cp-page-icon">
            <i className="fas fa-graduation-cap"></i>
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
            {GRADE_ORDER.map((grade) => (
              <button
                key={grade}
                className={`cp-btn ${currentGrade === grade ? 'cp-btn-success' : 'cp-btn-ghost'}`}
                onClick={() => selectGrade(grade)}
                style={{ borderRadius: 12, padding: '10px 18px' }}
              >
                <i className="fas fa-graduation-cap" style={{ marginLeft: 6 }}></i>
                {GRADE_LABEL[grade]}
                <span className="cp-badge cp-badge-neutral" style={{ marginInlineStart: 8, background: 'rgba(255,255,255,0.15)', color: 'inherit' }}>
                  {students.filter(s => s.grade === grade).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Group Picker */}
        {currentGrade && (
          <div className="cp-panel" style={{ padding: '1.5rem', marginBottom: 20 }}>
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
                <span className="cp-badge cp-badge-neutral" style={{ marginInlineStart: 8, background: 'rgba(255,255,255,0.15)', color: 'inherit' }}>
                  {studentsInGrade.length}
                </span>
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
                  <span className="cp-badge cp-badge-neutral" style={{ marginInlineStart: 8, background: 'rgba(255,255,255,0.15)', color: 'inherit' }}>
                    {studentsInGrade.filter(s => s.group === group).length}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {reportLoading && (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.8rem', color: 'var(--cp-primary)' }}></i>
            <p style={{ marginTop: 8, color: 'var(--cp-text-muted)' }}>جارٍ تحميل تقرير درجات السنتر...</p>
          </div>
        )}

        {/* Statistics and Data Grid */}
        {currentGrade && !reportLoading && gradesData.length > 0 && (
          <>
            {/* Stats Cards */}
            <div className="cp-stats-row" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
              <div className="cp-stat" style={{ borderRight: '3px solid #818cf8' }}>
                <i className="fas fa-clipboard-list" style={{ color: '#818cf8' }}></i>
                <div>
                  <div className="cp-stat-val">{stats.total}</div>
                  <div className="cp-stat-lbl">إجمالي الدرجات</div>
                </div>
              </div>
              <div className="cp-stat" style={{ borderRight: '3px solid #ed8936' }}>
                <i className="fas fa-percentage" style={{ color: '#ed8936' }}></i>
                <div>
                  <div className="cp-stat-val">{stats.avg}%</div>
                  <div className="cp-stat-lbl">متوسط الدرجات</div>
                </div>
              </div>
              <div className="cp-stat cp-stat-good">
                <i className="fas fa-star" style={{ color: '#10b981' }}></i>
                <div>
                  <div className="cp-stat-val">{stats.highest}%</div>
                  <div className="cp-stat-lbl">أعلى تقييم</div>
                </div>
              </div>
              <div className="cp-stat cp-stat-bad">
                <i className="fas fa-chevron-circle-down" style={{ color: '#ef4444' }}></i>
                <div>
                  <div className="cp-stat-val">{stats.lowest}%</div>
                  <div className="cp-stat-lbl">أقل تقييم</div>
                </div>
              </div>
            </div>

            {/* Filters panel */}
            <div className="cp-panel" style={{ padding: '1.5rem', marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 16px', color: 'var(--cp-text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fas fa-filter" style={{ color: '#5bc2e7' }}></i> تصفية النتائج
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--cp-text-muted)', display: 'block', marginBottom: 6 }}>البحث عن طالب</label>
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="بحث بالاسم أو رقم الهاتف..." className="cp-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--cp-text-muted)', display: 'block', marginBottom: 6 }}>الفرع</label>
                  <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="cp-input" style={{ width: '100%' }}>
                    <option value="all">جميع الفروع</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
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
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--cp-text-muted)', display: 'block', marginBottom: 6 }}>المادة</label>
                  <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="cp-input" style={{ width: '100%' }}>
                    <option value="all">كل المواد</option>
                    {subjects.map(s => (
                      <option key={s} value={s}>{s}</option>
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

            {/* Table */}
            <div className="cp-table-card" id="grades-groupTable">
              <PrintReportHeader subtitle={`التقرير الجماعي لدرجات السنتر - ${GRADE_LABEL[currentGrade]}`} />
              <div className="cp-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--cp-text-main)' }}>
                    <i className="fas fa-clipboard-list" style={{ color: '#5bc2e7', marginLeft: 8 }}></i>
                    سجل درجات الطلاب التفصيلي
                  </h2>
                  <span className="cp-badge cp-badge-neutral">{filteredGrades.length}</span>
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
                {filteredGrades.length > 0 ? (
                  <table className="cp-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>الطالب</th>
                        <th>المجموعة</th>
                        <th>النشاط</th>
                        <th>المادة</th>
                        <th>النوع</th>
                        <th>الدرجة</th>
                        <th>النسبة</th>
                        <th>التاريخ</th>
                        <th>المعلم</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGrades.map((g, idx) => {
                        const pct = g.max_score > 0 ? Math.round((g.score / g.max_score) * 100) : 0
                        return (
                          <tr key={g.id}>
                            <td>{idx + 1}</td>
                            <td style={{ fontWeight: 700 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div className="cp-avatar cp-avatar-purple" style={{ width: 30, height: 30, fontSize: '0.8rem' }}>
                                  <i className="fas fa-user"></i>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span>{g.profiles?.name || '—'}</span>
                                  <span style={{ fontSize: '0.72rem', color: 'var(--cp-text-muted)', fontWeight: 'normal' }}>{g.profiles?.phone || '—'}</span>
                                </div>
                              </div>
                            </td>
                            <td>{g.profiles?.group || '—'}</td>
                            <td style={{ fontWeight: 600 }}>{g.title}</td>
                            <td>{g.subject || '—'}</td>
                            <td>
                              <span className={`cp-badge cp-badge-${
                                g.type === 'exam' ? 'purple' : g.type === 'quiz' ? 'blue' : g.type === 'homework' ? 'teal' : 'neutral'
                              }`}>
                                {TYPE_LABELS[g.type] || g.type}
                              </span>
                            </td>
                            <td>{g.score} / {g.max_score}</td>
                            <td style={{ fontWeight: 700, color: pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444' }}>
                              {pct}%
                            </td>
                            <td>{fmtDate(g.created_at)}</td>
                            <td>{g.creator?.name || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--cp-text-muted)' }}>
                    <i className="fas fa-user-slash" style={{ fontSize: '2rem', marginBottom: 8, display: 'block' }}></i>
                    <p style={{ margin: 0 }}>لا توجد سجلات تطابق التصفية الحالية.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {currentGrade && !reportLoading && gradesData.length === 0 && (
          <div className="cp-table-card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--cp-text-muted)' }}>
            <i className="fas fa-clipboard-question" style={{ fontSize: '2.5rem', marginBottom: 12, color: 'var(--cp-divider)' }}></i>
            <p style={{ margin: 0 }}>لم يتم تسجيل أي درجات أو تقييمات بالسنتر لطلاب هذا الصف بعد.</p>
          </div>
        )}

      </div>
    </main>
  )
}
