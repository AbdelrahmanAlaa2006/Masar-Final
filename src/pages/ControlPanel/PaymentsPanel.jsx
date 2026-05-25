import React, { useState, useEffect, useMemo } from 'react'
import { listPayments, resolvePayment } from '@backend/paymentsApi'
import { useAuth } from '../../contexts/AuthContext'
import { notify } from '../../utils/notify'

const fmtDate = (d) => {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date)) return '—'
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
}

const GRADE_SHORT = {
  'first-prep':  'أولى إعدادي',
  'second-prep': 'تانية إعدادي',
  'third-prep':  'تالتة إعدادي',
}

export default function PaymentsPanel() {
  const { user } = useAuth()
  const adminId = user?.id || null

  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pending') // 'pending' | 'resolved'
  const [searchQuery, setSearchQuery] = useState('')
  const [resolvingId, setResolvingId] = useState(null)
  
  // Note inputs per payment ID
  const [notesMap, setNotesMap] = useState({})
  
  // Modal screenshot preview
  const [previewUrl, setPreviewUrl] = useState(null)
  const [rotateDeg, setRotateDeg] = useState(0)

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await listPayments()
      setPayments(data)
    } catch (err) {
      console.error('Failed to load payments:', err)
      notify('فشل تحميل كشف المدفوعات', 'danger')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleResolve = async (paymentId, status, studentId) => {
    if (!adminId) return
    const notes = notesMap[paymentId] || ''
    
    setResolvingId(paymentId)
    try {
      await resolvePayment(paymentId, {
        status,
        adminNotes: notes,
        adminId,
        studentId,
      })
      
      notify(status === 'approved' ? 'تم قبول الدفع وتفعيل حساب الطالب بنجاح! 🎉' : 'تم رفض طلب الدفع بنجاح.', 'success')
      
      // Clear note input
      setNotesMap(prev => {
        const next = { ...prev }
        delete next[paymentId]
        return next
      })

      // Reload
      loadData()
    } catch (err) {
      console.error('Resolve payment error:', err)
      notify(err.message || 'فشل معالجة طلب الدفع', 'danger')
    } finally {
      setResolvingId(null)
    }
  }

  // Count summaries
  const stats = useMemo(() => {
    return {
      pending: payments.filter(p => p.status === 'pending').length,
      approved: payments.filter(p => p.status === 'approved').length,
      rejected: payments.filter(p => p.status === 'rejected').length,
    }
  }, [payments])

  const filteredPayments = useMemo(() => {
    const list = payments.filter((p) => {
      const isPending = p.status === 'pending'
      return activeTab === 'pending' ? isPending : !isPending
    })

    if (!searchQuery.trim()) return list

    const q = searchQuery.toLowerCase().trim()
    return list.filter((p) => {
      const name = p.profiles?.name?.toLowerCase() || ''
      const phone = p.profiles?.phone || ''
      return name.includes(q) || phone.includes(q)
    })
  }, [payments, activeTab, searchQuery])

  const handleRotate = () => {
    setRotateDeg(d => (d + 90) % 360)
  }

  const openPreview = (url) => {
    setRotateDeg(0)
    setPreviewUrl(url)
  }

  return (
    <div className="cpanel-section">
      
      {/* ─────────── Summary Widgets (KPIs) ─────────── */}
      <div className="cpanel-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 24 }}>
        
        <div className="cpanel-stat" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div className="cpanel-stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#d97706' }}>
            <i className="fas fa-hourglass-half"></i>
          </div>
          <div>
            <div className="cpanel-stat-value">{stats.pending}</div>
            <div className="cpanel-stat-label">طلبات معلقة للمراجعة</div>
          </div>
        </div>

        <div className="cpanel-stat" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="cpanel-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669' }}>
            <i className="fas fa-circle-check"></i>
          </div>
          <div>
            <div className="cpanel-stat-value">{stats.approved}</div>
            <div className="cpanel-stat-label">إجمالي المقبولة</div>
          </div>
        </div>

        <div className="cpanel-stat" style={{ borderLeft: '4px solid #ef4444' }}>
          <div className="cpanel-stat-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626' }}>
            <i className="fas fa-circle-xmark"></i>
          </div>
          <div>
            <div className="cpanel-stat-value">{stats.rejected}</div>
            <div className="cpanel-stat-label">إجمالي المرفوضة</div>
          </div>
        </div>

      </div>

      {/* ─────────── Tabs & Filters ─────────── */}
      <div className="cpanel-toolbar" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        
        {/* Active Tabs */}
        <div className="cpanel-tabs" style={{ display: 'flex', gap: 8, background: 'rgba(0,0,0,0.03)', padding: 4, borderRadius: 12 }}>
          <button 
            className={`cpanel-tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
            style={tabBtnStyle(activeTab === 'pending')}
          >
            الطلبات المعلقة <span style={badgeStyle('#f59e0b')}>{stats.pending}</span>
          </button>
          <button 
            className={`cpanel-tab-btn ${activeTab === 'resolved' ? 'active' : ''}`}
            onClick={() => setActiveTab('resolved')}
            style={tabBtnStyle(activeTab === 'resolved')}
          >
            الطلبات المعالجة <span style={badgeStyle('#64748b')}>{stats.approved + stats.rejected}</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="cpanel-search-box" style={{ position: 'relative', width: '100%', maxWidth: 300 }}>
          <i className="fas fa-search" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}></i>
          <input 
            type="text" 
            placeholder="ابحث باسم الطالب أو رقم الهاتف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 38px 10px 14px',
              borderRadius: 12,
              border: '1px solid rgba(0,0,0,0.08)',
              outline: 'none',
              fontFamily: 'Cairo',
              fontSize: '0.9rem',
            }}
          />
        </div>

      </div>

      {/* ─────────── Content Table / List ─────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b', fontFamily: 'Cairo' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#7c3aed', marginBottom: 12 }}></i>
          <div>جاري تحميل كشف التحويلات...</div>
        </div>
      ) : filteredPayments.length > 0 ? (
        <div className="cpanel-table-wrap" style={{ overflowX: 'auto', background: '#ffffff', borderRadius: 20, border: '1px solid rgba(0,0,0,0.04)' }}>
          <table className="cpanel-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                <th style={thStyle}>الطالب</th>
                <th style={thStyle}>قيمة الدفع</th>
                <th style={thStyle}>الوسيلة</th>
                <th style={thStyle}>التاريخ</th>
                <th style={thStyle}>صورة الإيصال</th>
                <th style={thStyle}>حالة الطلب</th>
                <th style={thStyle}>الإجراءات والملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  {/* Profile */}
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 700, color: '#1e1b4b' }}>{p.profiles?.name || '—'}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', gap: 6, marginTop: 4 }}>
                      <span>{p.profiles?.phone || '—'}</span>
                      <span style={{ color: '#7c3aed', fontWeight: 600 }}>
                        {GRADE_SHORT[p.profiles?.grade] || p.profiles?.grade}
                      </span>
                    </div>
                  </td>
                  
                  {/* Amount */}
                  <td style={tdStyle}>
                    <strong style={{ color: '#10b981', fontSize: '1.05rem' }}>{p.amount} ج.م</strong>
                  </td>

                  {/* Method */}
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 700,
                      color: p.payment_method === 'InstaPay' ? '#7c3aed' : '#dc2626'
                    }}>
                      {p.payment_method === 'InstaPay' ? (
                        <><i className="fas fa-bolt"></i> InstaPay</>
                      ) : (
                        <><i className="fas fa-mobile-screen"></i> فودافون كاش</>
                      )}
                    </span>
                  </td>

                  {/* Date */}
                  <td style={tdStyle}>
                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{fmtDate(p.created_at)}</span>
                  </td>

                  {/* Screenshot Thumbnail */}
                  <td style={tdStyle}>
                    <div 
                      onClick={() => openPreview(p.screenshot_url)}
                      style={{
                        width: 50, height: 50, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)',
                        cursor: 'zoom-in', background: '#fafafa', position: 'relative'
                      }}
                    >
                      <img 
                        src={p.screenshot_url} 
                        alt="Receipt" 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      />
                      <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', display: 'flex', 
                        justifyContent: 'center', alignItems: 'center', color: '#fff', opacity: 0, transition: 'opacity 0.2s'
                      }} className="thumb-hover">
                        <i className="fas fa-search-plus" style={{ fontSize: '0.9rem' }}></i>
                      </div>
                    </div>
                  </td>

                  {/* Status */}
                  <td style={tdStyle}>
                    <span style={statusPillStyle(p.status)}>
                      {p.status === 'pending' && 'قيد المراجعة'}
                      {p.status === 'approved' && 'مقبول'}
                      {p.status === 'rejected' && 'مرفوض'}
                    </span>
                  </td>

                  {/* Actions & Notes */}
                  <td style={tdStyle}>
                    {p.status === 'pending' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
                        <input
                          type="text"
                          placeholder="ملاحظات اختيارية (مثال: الإيصال غير واضح)"
                          value={notesMap[p.id] || ''}
                          onChange={(e) => setNotesMap(prev => ({ ...prev, [p.id]: e.target.value }))}
                          disabled={resolvingId === p.id}
                          style={{
                            padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)',
                            fontSize: '0.85rem', outline: 'none', fontFamily: 'Cairo'
                          }}
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => handleResolve(p.id, 'approved', p.student_id)}
                            disabled={resolvingId !== null}
                            style={actionBtnStyle('#10b981')}
                          >
                            {resolvingId === p.id ? 'جاري التفعيل...' : 'قبول وتفعيل'}
                          </button>
                          <button
                            onClick={() => handleResolve(p.id, 'rejected', p.student_id)}
                            disabled={resolvingId !== null}
                            style={actionBtnStyle('#ef4444')}
                          >
                            رفض الطلب
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        {p.admin_notes ? (
                          <>
                            <strong>ملاحظة:</strong> {p.admin_notes}
                          </>
                        ) : (
                          <span style={{ fontStyle: 'italic' }}>لا توجد ملاحظات إضافية</span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          textAlign: 'center', padding: '60px 20px', background: '#ffffff', borderRadius: 20, 
          border: '1px solid rgba(0,0,0,0.04)', color: '#64748b', fontFamily: 'Cairo'
        }}>
          <i className="fas fa-wallet" style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: 12 }}></i>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1e1b4b', marginBottom: 6 }}>لا توجد تحويلات</h3>
          <p style={{ fontSize: '0.9rem', color: '#64748b' }}>لا توجد طلبات تحويل دفع مطابقة في هذا التصنيف حاليًا.</p>
        </div>
      )}

      {/* ─────────── Fullscreen Screenshot Modal ─────────── */}
      {previewUrl && (
        <div style={modalOverlayStyle} onClick={() => setPreviewUrl(null)}>
          <div style={modalContainerStyle} onClick={(e) => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div style={modalHeadStyle}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>مراجعة إيصال التحويل</h4>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={handleRotate} style={modalIconBtnStyle} title="تدوير الصورة">
                  <i className="fas fa-rotate-right"></i> تدوير
                </button>
                <button onClick={() => setPreviewUrl(null)} style={modalIconBtnStyle} title="إغلاق">
                  <i className="fas fa-xmark"></i> إغلاق
                </button>
              </div>
            </div>

            {/* Modal Body Image */}
            <div style={modalBodyStyle}>
              <img 
                src={previewUrl} 
                alt="Full receipt" 
                style={{ 
                  maxHeight: '75vh', maxWidth: '100%', objectFit: 'contain',
                  transform: `rotate(${rotateDeg}deg)`, transition: 'transform 0.2s ease-out' 
                }} 
              />
            </div>

          </div>
        </div>
      )}

      {/* Hover thumbnail classes helper */}
      <style>{`
        .thumb-hover:hover { opacity: 1 !important; }
      `}</style>

    </div>
  )
}

// ── Shared Styling Helper Objects ──
const thStyle = {
  padding: '14px 18px',
  fontWeight: 700,
  fontSize: '0.85rem',
  color: '#475569',
  fontFamily: 'Cairo',
}

const tdStyle = {
  padding: '14px 18px',
  fontFamily: 'Cairo',
  verticalAlign: 'middle',
}

const tabBtnStyle = (active) => ({
  border: 'none',
  padding: '8px 16px',
  borderRadius: 10,
  background: active ? '#ffffff' : 'transparent',
  color: active ? '#7c3aed' : '#64748b',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'Cairo',
  fontSize: '0.85rem',
  boxShadow: active ? '0 4px 6px rgba(0,0,0,0.04)' : 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  transition: 'all 0.2s'
})

const badgeStyle = (color) => ({
  padding: '2px 8px',
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
  padding: '8px 12px',
  borderRadius: 8,
  background: color,
  color: '#ffffff',
  fontWeight: 700,
  fontSize: '0.85rem',
  cursor: 'pointer',
  fontFamily: 'Cairo',
  transition: 'opacity 0.2s, transform 0.2s',
  flex: 1,
})

// Modal Styling
const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.6)',
  backdropFilter: 'blur(4px)',
  zIndex: 9999,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: 20,
}

const modalContainerStyle = {
  background: '#ffffff',
  borderRadius: 24,
  width: '100%',
  maxWidth: 600,
  boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}

const modalHeadStyle = {
  padding: '16px 24px',
  borderBottom: '1px solid #f1f5f9',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontFamily: 'Cairo',
  color: '#1e1b4b',
}

const modalIconBtnStyle = {
  border: 'none',
  background: 'rgba(0,0,0,0.04)',
  padding: '6px 12px',
  borderRadius: 8,
  cursor: 'pointer',
  fontFamily: 'Cairo',
  fontSize: '0.85rem',
  fontWeight: 700,
  color: '#475569',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const modalBodyStyle = {
  padding: 24,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  background: '#fafafa',
  minHeight: 300,
  overflow: 'hidden',
}
