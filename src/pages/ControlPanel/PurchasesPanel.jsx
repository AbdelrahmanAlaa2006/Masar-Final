import React, { useState, useEffect, useMemo } from 'react'
import { listPurchases, resolvePurchase } from '@backend/packagesApi'
import { useAuth } from '../../contexts/AuthContext'
import { notify } from '../../utils/notify'
import { GRADE_LABEL } from './shared'



const fmtDate = (d) => {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date)) return '—'
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
}

export default function PurchasesPanel({ onBack, flash }) {
  const { user } = useAuth()
  const adminId = user?.id || null

  const [purchases, setPurchases] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  
  // Filtering states
  const [activeTab, setActiveTab] = useState('pending') // 'pending' | 'resolved'
  const [searchQuery, setSearchQuery] = useState('')

  // Lightbox screenshot preview modal
  const [previewUrl, setPreviewUrl] = useState(null)
  const [rotateDeg, setRotateDeg] = useState(0)

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await listPurchases()
      setPurchases(data)
    } catch (err) {
      console.error('Failed to load purchases:', err)
      notify('فشل تحميل طلبات الشراء', 'danger')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleResolve = async (purchaseId, status) => {
    if (!adminId || busyId) return
    setBusyId(purchaseId)
    try {
      await resolvePurchase(purchaseId, status, adminId)
      notify(status === 'approved' ? 'تمت الموافقة على طلب الشراء وتفعيل الباقة للطالب! 🎉' : 'تم رفض طلب الشراء.', 'success')
      loadData()
    } catch (err) {
      console.error(err)
      notify(err.message || 'تعذر معالجة الطلب', 'danger')
    } finally {
      setBusyId(null)
    }
  }

  const counts = useMemo(() => {
    return {
      pending: purchases.filter(p => p.payment_status === 'pending').length,
      resolved: purchases.filter(p => p.payment_status !== 'pending').length,
      all: purchases.length
    }
  }, [purchases])

  const filteredPurchases = useMemo(() => {
    const list = purchases.filter(p => {
      const isPending = p.payment_status === 'pending'
      return activeTab === 'pending' ? isPending : !isPending
    })

    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase().trim()
    return list.filter(p => {
      const name = p.profiles?.name?.toLowerCase() || ''
      const phone = p.profiles?.phone || ''
      const pkgTitle = p.packages?.title?.toLowerCase() || ''
      return name.includes(q) || phone.includes(q) || pkgTitle.includes(q)
    })
  }, [purchases, activeTab, searchQuery])

  return (
    <section className="cp-panel">
      {onBack && (
        <button className="cp-back" type="button" onClick={onBack}>
          <i className="fas fa-arrow-right"></i> رجوع
        </button>
      )}

      <div className="cp-panel-header">
        <h2><i className="fas fa-receipt" style={{ color: '#f59e0b', marginInlineEnd: 8 }}></i> طلبات شراء الباقات الدراسية أونلاين</h2>
        <p>قم بمراجعة طلبات شراء الباقات المقدمة من طلاب الأونلاين وتأكد من إيصال التحويل البنكي أو المحفظة لتفعيل المحتوى.</p>
      </div>

      {/* KPI Stats widgets */}
      <div className="cpanel-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24, display: 'grid' }}>
        <div className="cpanel-stat" style={{ borderLeft: '4px solid #f59e0b', background: 'var(--cp-card-bg)', padding: 16, borderRadius: 12 }}>
          <div className="cpanel-stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', float: 'left', fontSize: 18 }}>
            <i className="fas fa-hourglass-half"></i>
          </div>
          <div style={{ marginInlineStart: 50 }}>
            <div className="cpanel-stat-value" style={{ fontSize: '1.25rem', fontWeight: 800 }}>{counts.pending}</div>
            <div className="cpanel-stat-label" style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)' }}>طلبات قيد المراجعة</div>
          </div>
        </div>

        <div className="cpanel-stat" style={{ borderLeft: '4px solid #10b981', background: 'var(--cp-card-bg)', padding: 16, borderRadius: 12 }}>
          <div className="cpanel-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669', width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', float: 'left', fontSize: 18 }}>
            <i className="fas fa-circle-check"></i>
          </div>
          <div style={{ marginInlineStart: 50 }}>
            <div className="cpanel-stat-value" style={{ fontSize: '1.25rem', fontWeight: 800 }}>{counts.resolved}</div>
            <div className="cpanel-stat-label" style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)' }}>طلبات تم معالجتها</div>
          </div>
        </div>
      </div>

      {/* Tabs and filters toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        
        {/* Tabs */}
        <div className="cpanel-tabs" style={{ display: 'flex', gap: 8, background: 'rgba(0,0,0,0.03)', padding: 4, borderRadius: 12 }}>
          <button 
            type="button"
            className={`cpanel-tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
            style={tabBtnStyle(activeTab === 'pending')}
          >
            الطلبات المعلقة <span style={badgeStyle('#f59e0b')}>{counts.pending}</span>
          </button>
          <button 
            type="button"
            className={`cpanel-tab-btn ${activeTab === 'resolved' ? 'active' : ''}`}
            onClick={() => setActiveTab('resolved')}
            style={tabBtnStyle(activeTab === 'resolved')}
          >
            الطلبات المعالجة <span style={badgeStyle('#64748b')}>{counts.resolved}</span>
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: '100%', maxWidth: 300 }}>
          <i className="fas fa-search" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}></i>
          <input 
            type="text" 
            placeholder="ابحث باسم الطالب، الهاتف، أو الباقة..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="cp-input"
            style={{ width: '100%', padding: '8px 38px 8px 14px', fontSize: '0.88rem' }}
          />
        </div>
      </div>

      <div className="cp-header-divider" />

      {/* Data Table */}
      {loading ? (
        <div className="cp-empty">
          <i className="fas fa-spinner fa-spin"></i>
          <p>جاري تحميل طلبات الشراء...</p>
        </div>
      ) : filteredPurchases.length > 0 ? (
        <div className="cpanel-table-wrap" style={{ overflowX: 'auto', background: 'var(--cp-card-bg, #ffffff)', borderRadius: 20, border: '1px solid var(--border-light, rgba(0,0,0,0.04))' }}>
          <table className="cpanel-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border-light, #f1f5f9)' }}>
                <th style={thStyle}>الطالب</th>
                <th style={thStyle}>الباقة المطلوبة</th>
                <th style={thStyle}>قيمة الدفع</th>
                <th style={thStyle}>الوسيلة</th>
                <th style={thStyle}>تاريخ الطلب</th>
                <th style={thStyle}>صورة الإيصال</th>
                <th style={thStyle}>حالة الطلب</th>
                <th style={thStyle}>الإجراءات والمراجعة</th>
              </tr>
            </thead>
            <tbody>
              {filteredPurchases.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border-light, #f1f5f9)' }}>
                  
                  {/* Student */}
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 700, color: 'var(--text-color)' }}>{p.profiles?.name || '—'}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', display: 'flex', gap: 6, marginTop: 4 }}>
                      <span>{p.profiles?.phone || '—'}</span>
                      <span style={{ color: 'var(--primary, #7c3aed)', fontWeight: 600 }}>
                        {GRADE_LABEL[p.profiles?.grade] || p.profiles?.grade}
                      </span>
                    </div>
                  </td>

                  {/* Package */}
                  <td style={tdStyle}>
                    <strong style={{ color: 'var(--text-color)' }}>{p.packages?.title || '—'}</strong>
                  </td>

                  {/* Price */}
                  <td style={tdStyle}>
                    <strong style={{ color: '#10b981', fontSize: '1.02rem' }}>{p.packages?.price || 0} ج.م</strong>
                  </td>

                  {/* Method */}
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 700,
                      color: p.payment_method === 'InstaPay' ? '#7c3aed' : p.payment_method === 'Cash' ? '#10b981' : '#dc2626'
                    }}>
                      {p.payment_method === 'InstaPay' ? (
                        <><i className="fas fa-bolt"></i> InstaPay</>
                      ) : p.payment_method === 'Cash' ? (
                        <><i className="fas fa-money-bill-wave"></i> نقدي</>
                      ) : (
                        <><i className="fas fa-mobile-screen"></i> محفظة إلكترونية</>
                      )}
                    </span>
                  </td>

                  {/* Date */}
                  <td style={tdStyle}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--cp-text-muted)' }}>{fmtDate(p.created_at)}</span>
                  </td>

                  {/* Receipt thumbnail */}
                  <td style={tdStyle}>
                    {p.screenshot_url ? (
                      <div 
                        onClick={() => { setRotateDeg(0); setPreviewUrl(p.screenshot_url); }}
                        style={{
                          width: 44, height: 44, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)',
                          cursor: 'zoom-in', background: '#fafafa', position: 'relative'
                        }}
                      >
                        <img 
                          src={p.screenshot_url} 
                          alt="Receipt" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', fontStyle: 'italic' }}>بدون صورة (نقدي)</span>
                    )}
                  </td>

                  {/* Status */}
                  <td style={tdStyle}>
                    <span style={statusPillStyle(p.payment_status)}>
                      {p.payment_status === 'pending' && 'قيد المراجعة'}
                      {p.payment_status === 'approved' && 'مقبول'}
                      {p.payment_status === 'rejected' && 'مرفوض'}
                    </span>
                  </td>

                  {/* Controls */}
                  <td style={tdStyle}>
                    {p.payment_status === 'pending' ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => handleResolve(p.id, 'approved')}
                          disabled={busyId !== null}
                          style={actionBtnStyle('#10b981')}
                        >
                          {busyId === p.id ? '...' : 'قبول وتفعيل'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolve(p.id, 'rejected')}
                          disabled={busyId !== null}
                          style={actionBtnStyle('#ef4444')}
                        >
                          رفض
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.85rem', color: 'var(--cp-text-muted)', fontStyle: 'italic' }}>
                        تمت المراجعة {p.approved_at && `في ${new Date(p.approved_at).toLocaleDateString('ar-EG')}`}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="cp-empty">
          <i className="fas fa-wallet" style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: 12 }}></i>
          <h3>لا توجد طلبات شراء</h3>
          <p>لا توجد طلبات شراء باقات مطابقة للتصفية الحالية.</p>
        </div>
      )}

      {/* ─────────── Receipt Screenshot Lightbox Modal ─────────── */}
      {previewUrl && (
        <div style={modalOverlayStyle} onClick={() => setPreviewUrl(null)}>
          <div style={modalContainerStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeadStyle}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>مراجعة إيصال التحويل</h4>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setRotateDeg(d => (d + 90) % 360)} style={modalIconBtnStyle}>
                  <i className="fas fa-rotate-right"></i> تدوير
                </button>
                <button onClick={() => setPreviewUrl(null)} style={modalIconBtnStyle}>
                  <i className="fas fa-xmark"></i> إغلاق
                </button>
              </div>
            </div>
            <div style={modalBodyStyle}>
              <img 
                src={previewUrl} 
                alt="Receipt screenshot" 
                style={{ 
                  maxHeight: '70vh', maxWidth: '100%', objectFit: 'contain', borderRadius: 8,
                  transform: `rotate(${rotateDeg}deg)`, transition: 'transform 0.2s ease-out' 
                }} 
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// Styling objects
const thStyle = {
  padding: '12px 14px',
  fontWeight: 700,
  fontSize: '0.85rem',
  color: 'var(--text-color)',
  fontFamily: 'Tajawal',
}

const tdStyle = {
  padding: '12px 14px',
  fontFamily: 'Tajawal',
  verticalAlign: 'middle',
}

const tabBtnStyle = (active) => ({
  border: 'none',
  padding: '6px 12px',
  borderRadius: 10,
  background: active ? 'var(--card-bg, #ffffff)' : 'transparent',
  color: active ? 'var(--primary, #7c3aed)' : '#64748b',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'Tajawal',
  fontSize: '0.85rem',
  boxShadow: active ? '0 4px 6px rgba(0,0,0,0.04)' : 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  transition: 'all 0.2s'
})

const badgeStyle = (color) => ({
  padding: '2px 6px',
  borderRadius: 999,
  background: `${color}1a`,
  color,
  fontSize: '0.75rem',
  fontWeight: 700,
})

const statusPillStyle = (status) => {
  const c = status === 'pending' ? '#d97706' : status === 'approved' ? '#059669' : '#dc2626'
  return {
    display: 'inline-flex',
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: '0.8rem',
    fontWeight: 700,
    background: `${c}1a`,
    color: c,
  }
}

const actionBtnStyle = (color) => ({
  border: 'none',
  padding: '6px 10px',
  borderRadius: 8,
  background: color,
  color: '#ffffff',
  fontWeight: 700,
  fontSize: '0.8rem',
  cursor: 'pointer',
  fontFamily: 'Tajawal',
  transition: 'opacity 0.2s',
})

const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.6)',
  backdropFilter: 'blur(4px)',
  zIndex: 99999,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: 20,
}

const modalContainerStyle = {
  background: 'var(--card-bg, #ffffff)',
  borderRadius: 24,
  width: '100%',
  maxWidth: 550,
  boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}

const modalHeadStyle = {
  padding: '16px 20px',
  borderBottom: '1px solid var(--border-light, #f1f5f9)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontFamily: 'Tajawal',
  color: 'var(--text-color)',
}

const modalIconBtnStyle = {
  border: 'none',
  background: 'rgba(0,0,0,0.04)',
  padding: '4px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: 'Tajawal',
  fontSize: '0.8rem',
  fontWeight: 700,
  color: '#475569',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
}

const modalBodyStyle = {
  padding: 20,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  background: 'var(--cp-hover-bg, #fafafa)',
  minHeight: 280,
  overflow: 'hidden',
}
