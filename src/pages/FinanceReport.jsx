import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { getCenterStudentFinance } from '@backend/reportsApi'
import { getProfile } from '@backend/profilesApi'
import PrintReportHeader from '../components/PrintReportHeader'
import './ExamsReport.css'

const TYPE_LABELS = {
  charge: 'رسوم مطلوبة',
  payment: 'دفعة مالية',
  refund: 'استرداد',
  discount: 'خصم',
  scholarship: 'منحة',
  waiver: 'إعفاء'
}

const STATUS_LABELS = {
  approved: 'مقبول / مدفوع',
  pending: 'قيد الانتظار',
  rejected: 'مرفوض'
}

// Ledger row directions: debits raise what the student owes, credits lower it
// (same classification as getStudentBalance in backend/ledgerApi.js).
const DEBIT_TYPES = ['charge', 'refund']
const CREDIT_TYPES = ['payment', 'discount', 'scholarship', 'waiver']

// Derived settlement status of one billing item (a month), computed from its
// charge + payment rows together — this is what admins actually want to read,
// instead of raw ledger statuses (a charge row's "approved" only means the
// charge is active, NOT that it was paid).
const ITEM_STATUS = {
  paid: { label: 'مدفوعة بالكامل', badge: 'success', icon: 'fa-check-circle' },
  partial: { label: 'مدفوعة جزئياً', badge: 'warning', icon: 'fa-circle-half-stroke' },
  pending: { label: 'قيد الانتظار', badge: 'warning', icon: 'fa-clock' },
  unpaid: { label: 'غير مدفوعة', badge: 'danger', icon: 'fa-times-circle' }
}

const METHOD_LABELS = {
  cash: 'نقدي (كاش)',
  vodafone: 'فودافون كاش',
  instapay: 'إنستاباي',
  card: 'بطاقة ائتمان',
  bank: 'تحويل بنكي'
}

const fmtDate = (d) => {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date)) return '—'
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
}

export default function FinanceReport() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [studentName, setStudentName] = useState('الطالب')
  const [studentId, setStudentId] = useState('')
  
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // 'summary' shows one row per billing item (month) with charged/paid/
  // remaining; 'detail' shows the raw ledger rows for auditing.
  const [viewMode, setViewMode] = useState('summary')

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

        const data = await getCenterStudentFinance(targetId)
        if (!cancelled) {
          setTransactions(data)
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'تعذر تحميل سجل الحسابات')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [searchParams])

  // Date filter applies to both views; type/status filters only make sense on
  // raw ledger rows, so they apply to the detail view alone.
  const dateFilteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (!dateFrom && !dateTo) return true
      const tDate = new Date(t.transaction_date || t.created_at).toISOString().split('T')[0]
      if (dateFrom && tDate < dateFrom) return false
      if (dateTo && tDate > dateTo) return false
      return true
    })
  }, [transactions, dateFrom, dateTo])

  // The payments log lists real money movements only. Bookkeeping `charge`
  // rows (auto-created so the remainder is tracked) never show here — the
  // monthly summary is where fees and remainders are read. This is what keeps
  // one recorded payment from appearing as two confusing rows.
  const filteredTransactions = useMemo(() => {
    return dateFilteredTransactions.filter(t => {
      if (t.type === 'charge') return false
      const matchStatus = statusFilter === 'all' || t.status === statusFilter
      return matchStatus
    })
  }, [dateFilteredTransactions, statusFilter])

  // Group ledger rows into billing items: one entry per billing period (month),
  // merging its charge with the payments/discounts that settle it. Rejected
  // rows never count toward the money math.
  const billingItems = useMemo(() => {
    const groups = new Map()
    for (const t of dateFilteredTransactions) {
      const key = t.billing_period || t.description || `row-${t.id}`
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: t.billing_period || t.description || 'رسوم اشتراك سنتر',
          charged: 0,
          paid: 0,
          pendingAmount: 0,
          methods: new Set(),
          branches: new Set(),
          notes: new Set(),
          lastDate: null,
          hasCharge: false
        })
      }
      const g = groups.get(key)
      const amt = parseFloat(t.amount) || 0
      if (DEBIT_TYPES.includes(t.type) && t.status === 'approved') {
        g.charged += amt
        g.hasCharge = g.hasCharge || t.type === 'charge'
      } else if (CREDIT_TYPES.includes(t.type)) {
        if (t.status === 'approved') {
          g.paid += amt
          if (t.payment_method) g.methods.add(t.payment_method)
        } else if (t.status === 'pending') {
          g.pendingAmount += amt
        }
      }
      if (t.branches?.name) g.branches.add(t.branches.name)
      if (t.notes) g.notes.add(t.notes)
      const d = new Date(t.transaction_date || t.created_at)
      if (!isNaN(d) && (!g.lastDate || d > g.lastDate)) g.lastDate = d
    }

    const items = [...groups.values()].map(g => {
      const remaining = Math.max(0, g.charged - g.paid)
      let status
      if (g.paid > 0 && remaining <= 0) status = 'paid'
      else if (g.paid > 0) status = 'partial'
      else if (g.pendingAmount > 0) status = 'pending'
      else status = 'unpaid'
      return { ...g, remaining, status }
    })

    items.sort((a, b) => (b.lastDate?.getTime() || 0) - (a.lastDate?.getTime() || 0))
    return items
  }, [dateFilteredTransactions])

  // Stats
  const stats = useMemo(() => {
    let charged = 0
    let paid = 0

    // We calculate from total transaction list to keep it accurate
    for (const t of transactions) {
      const amt = parseFloat(t.amount) || 0
      if (t.type === 'charge') {
        charged += amt
      } else if (t.type === 'payment' && t.status === 'approved') {
        paid += amt
      }
    }

    const remaining = Math.max(0, charged - paid)

    return { charged, paid, remaining }
  }, [transactions])

  const exportCsv = () => {
    const csvCell = (val) => `"${String(val == null ? '' : val).replace(/"/g, '""')}"`
    let headers, rows
    if (viewMode === 'summary') {
      headers = ['#', 'البيان / الشهر', 'المطلوب', 'المدفوع', 'المتبقي', 'طريقة الدفع', 'الحالة', 'آخر معاملة', 'الفرع', 'ملاحظات']
      rows = billingItems.map((item, idx) => [
        idx + 1,
        item.label,
        `${item.charged} ج.م`,
        `${item.paid} ج.م`,
        `${item.remaining} ج.م`,
        [...item.methods].map(m => METHOD_LABELS[m] || m).join(' / ') || '—',
        ITEM_STATUS[item.status].label,
        fmtDate(item.lastDate),
        [...item.branches].join(' / ') || '—',
        [...item.notes].join(' | ')
      ])
    } else {
      headers = ['#', 'البيان / الحزمة', 'النوع', 'القيمة / الرسوم', 'طريقة الدفع', 'الحالة', 'التاريخ', 'الفرع', 'ملاحظات']
      rows = filteredTransactions.map((t, idx) => [
        idx + 1,
        t.description || t.billing_period || '—',
        TYPE_LABELS[t.type] || t.type,
        `${t.amount} ج.م`,
        METHOD_LABELS[t.payment_method] || t.payment_method || '—',
        STATUS_LABELS[t.status] || t.status || '—',
        fmtDate(t.transaction_date || t.created_at),
        t.branches?.name || '—',
        t.notes || ''
      ])
    }

    const content = '\uFEFF' + [headers.map(csvCell).join(','), ...rows.map(row => row.map(csvCell).join(','))].join('\n')
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finance-report-${studentId || 'student'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <main className="cp-page">
        <div className="cp-container" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: 'var(--cp-primary)' }}></i>
          <p style={{ marginTop: 12, color: 'var(--cp-text-muted)' }}>جارٍ تحميل تقرير الحسابات المالي...</p>
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
            <h1>التقرير المالي وحسابات الطالب (السنتر)</h1>
            <p>متابعة وتتبع الدفعات المالية والرسوم والاشتراكات الشهرية والمستحقات المتبقية</p>
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
            <i className="fas fa-wallet" style={{ fontSize: '1.2rem' }}></i>
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
          <div className="er-stat-card er-stat-total" style={{ borderRightColor: '#3b82f6' }}>
            <div className="er-stat-icon" style={{ color: '#3b82f6' }}><i className="fas fa-file-invoice-dollar"></i></div>
            <div className="er-stat-info">
              <h3>إجمالي الرسوم</h3>
              <p>{stats.charged} <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', fontWeight: 'normal' }}>ج.م</span></p>
            </div>
          </div>

          <div className="er-stat-card er-stat-passed" style={{ borderRightColor: '#10b981' }}>
            <div className="er-stat-icon" style={{ color: '#10b981' }}><i className="fas fa-circle-check"></i></div>
            <div className="er-stat-info">
              <h3>المدفوعات المقبولة</h3>
              <p>{stats.paid} <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', fontWeight: 'normal' }}>ج.م</span></p>
            </div>
          </div>

          <div className="er-stat-card er-stat-failed" style={{ borderRightColor: stats.remaining > 0 ? '#ef4444' : '#10b981' }}>
            <div className="er-stat-icon" style={{ color: stats.remaining > 0 ? '#ef4444' : '#10b981' }}><i className="fas fa-hand-holding-dollar"></i></div>
            <div className="er-stat-info">
              <h3>المتبقي المستحق</h3>
              <p>{stats.remaining} <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', fontWeight: 'normal' }}>ج.م</span></p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="cp-panel" style={{ padding: '1.5rem', marginBottom: 24 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 16px', color: 'var(--cp-text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-filter" style={{ color: '#5bc2e7' }}></i> تصفية سجل المعاملات المالية
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            {viewMode === 'detail' && (
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--cp-text-muted)', display: 'block', marginBottom: 6 }}>حالة الدفعة</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="cp-input" style={{ width: '100%' }}>
                  <option value="all">كل الحالات</option>
                  <option value="approved">مقبول / مدفوع</option>
                  <option value="pending">قيد الانتظار</option>
                  <option value="rejected">مرفوض</option>
                </select>
              </div>
            )}

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
        <div className="cp-table-card" id="finance-reportTable">
          <PrintReportHeader subtitle="كشف حساب الطالب المالي" />
          <div className="cp-panel-header" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-receipt" style={{ color: '#818cf8' }}></i>
              {viewMode === 'summary' ? 'ملخص الاشتراكات والرسوم الشهرية' : 'سجل المدفوعات والمعاملات المالية'}
            </h2>
            <div className="er-view-toggle" style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setViewMode('summary')}
                className={`cp-btn ${viewMode === 'summary' ? 'cp-btn-success' : 'cp-btn-ghost'}`}
                style={{ padding: '6px 14px', borderRadius: 10, fontSize: '0.85rem' }}
              >
                <i className="fas fa-layer-group" style={{ marginLeft: 6 }}></i> ملخص شهري
              </button>
              <button
                onClick={() => setViewMode('detail')}
                className={`cp-btn ${viewMode === 'detail' ? 'cp-btn-success' : 'cp-btn-ghost'}`}
                style={{ padding: '6px 14px', borderRadius: 10, fontSize: '0.85rem' }}
              >
                <i className="fas fa-list-ul" style={{ marginLeft: 6 }}></i> سجل المدفوعات
              </button>
            </div>
          </div>

          <div className="cp-table-container">
            {viewMode === 'summary' ? (
              billingItems.length > 0 ? (
                <table className="cp-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>البيان / الشهر</th>
                      <th>المطلوب</th>
                      <th>المدفوع</th>
                      <th>المتبقي</th>
                      <th>طريقة الدفع</th>
                      <th>الحالة</th>
                      <th>آخر معاملة</th>
                      <th>الفرع</th>
                      <th>ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingItems.map((item, idx) => (
                      <tr key={item.key}>
                        <td>{idx + 1}</td>
                        <td style={{ fontWeight: 700 }}>{item.label}</td>
                        <td style={{ fontWeight: 700 }}>{item.hasCharge ? `${item.charged} ج.م` : '—'}</td>
                        <td style={{ fontWeight: 700, color: '#10b981' }}>{item.paid} ج.م</td>
                        <td style={{ fontWeight: 700, color: item.remaining > 0 ? '#ef4444' : 'var(--cp-text-muted)' }}>
                          {item.remaining} ج.م
                        </td>
                        <td>{[...item.methods].map(m => METHOD_LABELS[m] || m).join(' / ') || '—'}</td>
                        <td>
                          <span className={`cp-badge cp-badge-${ITEM_STATUS[item.status].badge}`}>
                            <i className={`fas ${ITEM_STATUS[item.status].icon}`} style={{ marginInlineEnd: 6 }}></i>
                            {ITEM_STATUS[item.status].label}
                            {item.status === 'partial' ? ` — متبقي ${item.remaining} ج.م` : ''}
                          </span>
                        </td>
                        <td>{fmtDate(item.lastDate)}</td>
                        <td>{[...item.branches].join(' / ') || '—'}</td>
                        <td style={{ color: 'var(--cp-text-muted)', fontSize: '0.85rem' }}>{[...item.notes].join(' | ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--cp-text-muted)' }}>
                  <i className="fas fa-file-invoice-dollar" style={{ fontSize: '2.5rem', marginBottom: 12, color: 'var(--cp-divider)' }}></i>
                  <p style={{ margin: 0 }}>لا توجد اشتراكات أو رسوم في الفترة المحددة.</p>
                </div>
              )
            ) : filteredTransactions.length > 0 ? (
              <table className="cp-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>البيان / الحزمة المالية</th>
                    <th>النوع</th>
                    <th>القيمة</th>
                    <th>طريقة الدفع</th>
                    <th>الحالة</th>
                    <th>تاريخ المعاملة</th>
                    <th>الفرع</th>
                    <th>ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((t, idx) => (
                    <tr key={t.id}>
                      <td>{idx + 1}</td>
                      <td style={{ fontWeight: 700 }}>{t.description || t.billing_period || 'رسوم اشتراك سنتر'}</td>
                      <td>
                        <span className={`cp-badge cp-badge-${t.type === 'refund' ? 'danger' : 'success'}`}>
                          {TYPE_LABELS[t.type] || t.type}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700 }}>{t.amount} ج.م</td>
                      <td>{METHOD_LABELS[t.payment_method] || t.payment_method || '—'}</td>
                      <td>
                        <span className={`cp-badge cp-badge-${
                          t.status === 'approved' ? 'success' :
                          t.status === 'pending' ? 'warning' : 'danger'
                        }`}>
                          <i className={`fas ${
                            t.status === 'approved' ? 'fa-check-circle' :
                            t.status === 'pending' ? 'fa-clock' : 'fa-times-circle'
                          }`} style={{ marginInlineEnd: 6 }}></i>
                          {STATUS_LABELS[t.status] || t.status || '—'}
                        </span>
                      </td>
                      <td>{fmtDate(t.transaction_date || t.created_at)}</td>
                      <td>{t.branches?.name || '—'}</td>
                      <td style={{ color: 'var(--cp-text-muted)', fontSize: '0.85rem' }}>{t.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--cp-text-muted)' }}>
                <i className="fas fa-file-invoice-dollar" style={{ fontSize: '2.5rem', marginBottom: 12, color: 'var(--cp-divider)' }}></i>
                <p style={{ margin: 0 }}>لا توجد مدفوعات تطابق التصفية الحالية.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </main>
  )
}
