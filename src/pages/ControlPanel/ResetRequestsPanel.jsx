import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@backend/supabase'
import { listStudentsByPhones } from '@backend/profilesApi'
import { cached, invalidate as invalidateCache, invalidatePrefix, LIST_TTL } from '../../utils/cache'
import { initials } from './shared'

export default function ResetRequestsPanel({ onBack, flash }) {
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
            const clean = (num) => String(num || '').replace(/\D/g, '').replace(/^0+/, '')
            const map = {}
            for (const s of matched) map[clean(s.phone)] = s
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

  const handleResetPassword = async (req, studentId) => {
    if (busyId) return
    setBusyId(req.id)
    const newPass = 'masar' + Math.floor(1000 + Math.random() * 9000)
    try {
      const { error: rpcError } = await supabase.rpc('reset_student_password', {
        p_student_id: studentId,
        p_new_password: newPass
      })
      if (rpcError) throw rpcError

      setTempPasswords((prev) => ({ ...prev, [req.id]: newPass }))
      flash(`تم تعيين كلمة مرور مؤقتة للطالب بنجاح: ${newPass} (تم نسخها تلقائياً)`, 'success')
      navigator.clipboard.writeText(newPass)
    } catch (e) {
      console.error(e)
      flash(e.message || 'تعذّر إعادة تعيين كلمة المرور. يرجى التأكد من تشغيل ملف SQL في قاعدة البيانات أولاً.', 'warning')
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
            
            // Find student matching phone (ignoring format variances)
            const getCleanPhone = (num) => String(num || '').replace(/\D/g, '').replace(/^0+/, '')
            const reqPhoneClean = getCleanPhone(req.phone)
            const studentMatch = studentsByPhone[reqPhoneClean]
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
                  {studentMatch && isManualNoPassword && (
                    <button
                      className="cp-btn cp-btn-success cp-btn-sm"
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleResetPassword(req, studentMatch.id)}
                      title="إنشاء كلمة مرور مؤقتة وتحديث حساب الطالب بها"
                      style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.3)' }}
                    >
                      <i className="fas fa-magic"></i>
                      توليد كلمة مرور مؤقتة
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
    </section>
  )
}
