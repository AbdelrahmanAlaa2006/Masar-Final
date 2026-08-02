import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@backend/supabase'
import { listStudentsByPhones } from '@backend/profilesApi'
import { cached, invalidate as invalidateCache, invalidatePrefix, LIST_TTL } from '../../utils/cache'
import { initials } from './shared'
import { useTenant } from '../../contexts/TenantContext'
import { generateTenantPassword } from '../../utils/tenantPassword'

export default function ResetRequestsPanel({ onBack, flash }) {
  const { tenant, tenantSlug } = useTenant()
  const [requests, setRequests] = useState([])
  // Only the students referenced by pending requests are loaded (by phone),
  // keyed by normalized phone — never the whole roster.
  const [studentsByPhone, setStudentsByPhone] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [query, setQuery] = useState('')
  const [copiedId, setCopiedId] = useState(null)
  const [copiedPassId, setCopiedPassId] = useState(null)
  const [showGuide, setShowGuide] = useState(true)
  const [tempPasswords, setTempPasswords] = useState({})
  
  // Custom password reset modal state
  const [resetModalStudent, setResetModalStudent] = useState(null)
  const [customPasswordInput, setCustomPasswordInput] = useState('')
  const [showCustomPasswordText, setShowCustomPasswordText] = useState(true)

  // Load pending password reset requests
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const fetchRequests = async () => {
          const { data, error: fetchError } = await supabase
            .from('password_reset_requests')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
          if (fetchError) throw fetchError
          return data || []
        }
        const data = await cached('password_reset_requests', LIST_TTL, fetchRequests)
        if (!cancelled) setRequests(data || [])

        // Resolve only the students referenced by these requests (by phone).
        const phones = [...new Set((data || []).map((r) => r.phone).filter(Boolean))]
        if (phones.length > 0) {
          const matched = await listStudentsByPhones(phones)
          if (!cancelled) {
            const getKey = (val) => {
              const str = String(val || '').trim().toLowerCase()
              return /^\d+$/.test(str) ? str.replace(/^0+/, '') : str
            }
            const map = {}
            for (const s of matched) map[getKey(s.phone)] = s
            setStudentsByPhone(map)
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'تعذّر تحميل البيانات')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Filter requests by search query
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return requests
    return requests.filter((r) =>
      [r.full_name, r.phone].filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [requests, query])

  const copyToClipboard = (text, id, type = 'phone') => {
    navigator.clipboard.writeText(text)
    if (type === 'password') {
      setCopiedPassId(id)
      setTimeout(() => setCopiedPassId(null), 2000)
    } else {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  const handleResolve = async (req) => {
    if (busyId) return
    setBusyId(req.id)
    try {
      const { error: updateError } = await supabase
        .from('password_reset_requests')
        .update({ status: 'resolved' })
        .eq('id', req.id)

      if (updateError) throw updateError

      invalidatePrefix('password_reset_requests')
      setRequests((prev) => prev.filter((r) => r.id !== req.id))
      flash(`تم وضع علامة "تم الحل" على طلب الطالب: ${req.full_name}`, 'success')
    } catch (e) {
      flash(e.message || 'تعذّر تحديث حالة الطلب', 'warning')
    } finally {
      setBusyId(null)
    }
  }

  const handleReject = async (req) => {
    if (busyId) return
    setBusyId(req.id)
    try {
      const { error: updateError } = await supabase
        .from('password_reset_requests')
        .update({ status: 'rejected' })
        .eq('id', req.id)

      if (updateError) throw updateError

      invalidatePrefix('password_reset_requests')
      setRequests((prev) => prev.filter((r) => r.id !== req.id))
      flash(`تم رفض طلب الطالب: ${req.full_name}`, 'warning')
    } catch (e) {
      flash(e.message || 'تعذّر تحديث حالة الطلب', 'warning')
    } finally {
      setBusyId(null)
    }
  }

  const handleResetPassword = async (req, studentId, customPass = null) => {
    if (busyId) return
    setBusyId(req.id)
    
    const newPass = customPass || generateTenantPassword(tenant || tenantSlug)

    try {
      const { error: rpcError } = await supabase.rpc('reset_student_password', {
        p_student_id: studentId,
        p_new_password: newPass
      })
      if (rpcError) throw rpcError

      setTempPasswords((prev) => ({ ...prev, [req.id]: newPass }))
      flash(`تم تحديث كلمة مرور الطالب بنجاح: ${newPass} (تم نسخها تلقائياً)`, 'success')
      navigator.clipboard.writeText(newPass)
      setResetModalStudent(null)
    } catch (e) {
      console.error(e)
      flash(e.message || 'تعذّر إعادة تعيين كلمة المرور.', 'warning')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="cp-panel">
      {onBack && (
        <button className="cp-back" type="button" onClick={onBack}>
          <i className="fas fa-arrow-right"></i> رجوع
        </button>
      )}

      <div className="cp-panel-header">
        <h2><i className="fas fa-key"></i> طلبات استعادة الحساب</h2>
        <p>استعرض طلبات الطلاب لاستعادة حساباتهم واكشف كلمتهم المرورية الأصلية دون الحاجة لإعادة تعيينها.</p>
      </div>

      {/* Stats row */}
      <div className="cp-stats-row" style={{ marginBottom: 20 }}>
        <div className="cp-stat cp-stat-bad">
          <i className="fas fa-hourglass-half"></i>
          <div>
            <div className="cp-stat-val">{requests.length}</div>
            <div className="cp-stat-lbl">طلبات معلقة</div>
          </div>
        </div>
      </div>

      {/* Guide instructions */}
      <div className="reset-guide-card">
        <button className="reset-guide-header" type="button" onClick={() => setShowGuide(!showGuide)}>
          <span>
            <i className="fas fa-circle-info"></i>
            دليل إرشادي سريع: كيف تقوم بتسليم كلمة المرور للطالب؟
          </span>
          <i className={`fas ${showGuide ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
        </button>
        {showGuide && (
          <div className="reset-guide-body">
            <ol>
              <li>تصفح الطلبات المعلقة بالأسفل لمشاهدة كلمة المرور الخاصة بكل طالب.</li>
              <li>إذا كان الحساب قد تم إنشاؤه يدوياً من الطالب (تظهر كلمة المرور "غير مسجلة")، اضغط على زر <strong>"توليد كلمة مرور مؤقتة"</strong> لتعيين كلمة مرور جديدة له تلقائياً.</li>
              <li>اضغط على زر <strong>"نسخ كلمة المرور"</strong> لإرسالها إلى الطالب عبر الواتساب أو غيره.</li>
              <li>بعد تسليم كلمة المرور بنجاح، اضغط على زر <strong>"تم حل الطلب"</strong> لأرشفة الطلب تلقائياً.</li>
            </ol>
          </div>
        )}
      </div>

      {/* Search Input */}
      <div className="cp-search">
        <i className="fas fa-search"></i>
        <input
          type="text"
          placeholder="ابحث باسم الطالب أو رقم الهاتف..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="cp-search-clear" type="button" onClick={() => setQuery('')}>
            <i className="fas fa-times"></i>
          </button>
        )}
      </div>

      {loading ? (
        <div className="cp-empty">
          <i className="fas fa-spinner fa-spin"></i>
          <p>جارٍ تحميل الطلبات...</p>
        </div>
      ) : error ? (
        <div className="cp-empty" style={{ color: '#c53030' }}>
          <i className="fas fa-circle-exclamation"></i>
          <p>{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="cp-empty">
          <i className="fas fa-envelope-open"></i>
          <p>لا توجد طلبات استعادة معلقة حالياً.</p>
        </div>
      ) : (
        <ul className="cp-items" style={{ marginTop: 15 }}>
          {filtered.map((req) => {
            const isBusy = busyId === req.id
            
            // Find student matching phone or code (ignoring format variances)
            const getKey = (val) => {
              const str = String(val || '').trim().toLowerCase()
              return /^\d+$/.test(str) ? str.replace(/^0+/, '') : str
            }
            const studentMatch = studentsByPhone[getKey(req.phone)]
            const currentPassword = tempPasswords[req.id] || studentMatch?.password || 'غير مسجلة (تمت إضافته يدويًا)'
            const isManualNoPassword = !studentMatch?.password && !tempPasswords[req.id]

            return (
              <li key={req.id} className="cp-item">
                <div className="cp-item-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                  <i className="fas fa-user-lock"></i>
                </div>

                <div className="cp-item-body">
                  <div className="cp-item-title">
                    <span style={{ fontWeight: 600 }}>{req.full_name}</span>
                  </div>
                  <div className="cp-item-meta">
                    <span><i className="fas fa-phone"></i> {req.phone}</span>
                    <span><i className="fas fa-key" style={{ color: 'var(--season-accent, #6366f1)' }}></i> كلمة المرور: <strong style={{ color: '#f59e0b', fontSize: '1.05rem', letterSpacing: '0.5px' }}>{currentPassword}</strong></span>
                    <span><i className="fas fa-clock"></i> {new Date(req.created_at).toLocaleString('ar-EG')}</span>
                  </div>
                </div>

                <div className="cp-item-controls" style={{ gap: 8, flexWrap: 'wrap' }}>
                  {studentMatch && (
                    <button
                      className="cp-btn cp-btn-info cp-btn-sm"
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setResetModalStudent({ req, studentId: studentMatch.id, name: req.full_name })
                        setCustomPasswordInput(generateTenantPassword(tenant || tenantSlug))
                        setShowCustomPasswordText(true)
                      }}
                      title="تعيين أو كتابة كلمة مرور جديدة لـ الطالب"
                      style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', borderColor: 'rgba(99, 102, 241, 0.3)', fontWeight: 'bold' }}
                    >
                      <i className="fas fa-key"></i>
                      تعيين كلمة مرور جديدة
                    </button>
                  )}

                  {!isManualNoPassword && (
                    <button
                      className="cp-btn cp-btn-info cp-btn-sm"
                      type="button"
                      onClick={() => copyToClipboard(currentPassword, req.id, 'password')}
                      title="نسخ كلمة مرور الطالب"
                    >
                      <i className={`fas ${copiedPassId === req.id ? 'fa-check' : 'fa-copy'}`}></i>
                      {copiedPassId === req.id ? 'تم النسخ' : 'نسخ كلمة المرور'}
                    </button>
                  )}

                  <button
                    className="cp-btn cp-btn-ghost cp-btn-sm"
                    type="button"
                    onClick={() => copyToClipboard(req.phone, req.id, 'phone')}
                    title="نسخ رقم جوال الطالب"
                  >
                    <i className={`fas ${copiedId === req.id ? 'fa-check' : 'fa-copy'}`}></i>
                    {copiedId === req.id ? 'تم النسخ' : 'نسخ الجوال'}
                  </button>

                  <button
                    className="cp-btn cp-btn-success cp-btn-sm"
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleResolve(req)}
                  >
                    {isBusy && busyId === req.id ? (
                      <i className="fas fa-spinner fa-spin"></i>
                    ) : (
                      <i className="fas fa-check-double"></i>
                    )}
                    تم حل الطلب
                  </button>

                  <button
                    className="cp-btn cp-btn-danger cp-btn-sm"
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleReject(req)}
                  >
                    <i className="fas fa-ban"></i>
                    رفض الطلب
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Manual / Custom Reset Password Modal */}
      {resetModalStudent && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <form 
            onSubmit={(e) => {
              e.preventDefault()
              if (!customPasswordInput.trim()) return
              handleResetPassword(resetModalStudent.req, resetModalStudent.studentId, customPasswordInput.trim())
            }} 
            style={{ background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '24px', padding: '28px', maxWidth: '480px', width: '100%', color: '#fff', direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}
          >
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              <i className="fas fa-key" style={{ marginInlineEnd: 8, color: '#38bdf8' }}></i>
              إعادة تعيين كلمة المرور: {resetModalStudent.name}
            </h3>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#94a3b8' }}>أدخل كلمة المرور الجديدة *</label>
                <button
                  type="button"
                  onClick={() => setCustomPasswordInput(generateTenantPassword(tenant || tenantSlug))}
                  style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  <i className="fas fa-magic" style={{ marginInlineEnd: 4 }}></i> توليد تلقائي
                </button>
              </div>

              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showCustomPasswordText ? 'text' : 'password'}
                  value={customPasswordInput}
                  onChange={(e) => setCustomPasswordInput(e.target.value)}
                  placeholder="أكتب كلمة المرور التي تريدها هنا..."
                  className="cp-input"
                  style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', paddingLeft: '38px', fontSize: '1rem', fontWeight: 600 }}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowCustomPasswordText(!showCustomPasswordText)}
                  tabIndex={-1}
                  title={showCustomPasswordText ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  style={{ position: 'absolute', left: '10px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.95rem', padding: 4 }}
                >
                  <i className={`fas ${showCustomPasswordText ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
              <small style={{ display: 'block', marginTop: '6px', color: '#64748b', fontSize: '0.78rem' }}>
                يمكنك كتابة أي كلمة مرور تختارها بنفسك، أو الضغط على "توليد تلقائي".
              </small>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" disabled={!customPasswordInput.trim() || busyId} className="cp-btn cp-btn-success" style={{ flex: 1, padding: '10px', fontWeight: 'bold' }}>
                {busyId ? 'جاري الحفظ...' : 'حفظ وتحديث كلمة المرور'}
              </button>
              <button type="button" onClick={() => setResetModalStudent(null)} className="cp-btn cp-btn-secondary" style={{ padding: '10px 20px' }}>
                إلغاء
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </section>
  )
}
