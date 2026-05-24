import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@backend/supabase'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../../utils/cache'
import ConfirmDeleteDialog from '../../components/ConfirmDeleteDialog'

export default function DevToolsViolationsPanel({ onBack, flash }) {
  const [violations, setViolations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [clearing, setClearing] = useState(false)
  const [query, setQuery] = useState('')
  const [copiedId, setCopiedId] = useState(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const loadViolations = async () => {
    try {
      setLoading(true)
      const fetchViolations = async () => {
        const { data, error: fetchError } = await supabase
          .from('devtools_violations')
          .select('*')
          .order('created_at', { ascending: false })
        if (fetchError) throw fetchError
        return data || []
      }
      const data = await cached('devtools_violations', LIST_TTL, fetchViolations)
      setViolations(data || [])
    } catch (e) {
      setError(e.message || 'تعذّر تحميل سجلات الحماية')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadViolations()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return violations
    return violations.filter((v) =>
      [v.username, v.ip_address, v.page].filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [violations, query])

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleDelete = async (id) => {
    if (busyId) return
    setBusyId(id)
    try {
      const { error: deleteError } = await supabase
        .from('devtools_violations')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      invalidateCache('devtools_violations')
      setViolations((prev) => prev.filter((v) => v.id !== id))
      flash('تم حذف سجل الانتهاك بنجاح', 'success')
    } catch (e) {
      flash(e.message || 'تعذّر حذف السجل', 'warning')
    } finally {
      setBusyId(null)
    }
  }

  const handleClearAll = async () => {
    setClearing(true)
    try {
      const { error: deleteError } = await supabase
        .from('devtools_violations')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // delete everything

      if (deleteError) throw deleteError

      invalidateCache('devtools_violations')
      setViolations([])
      flash('تم مسح جميع سجلات الانتهاكات الأمنية بنجاح', 'success')
    } catch (e) {
      flash(e.message || 'تعذّر مسح السجلات', 'warning')
    } finally {
      setClearing(false)
      setShowClearConfirm(false)
    }
  }

  return (
    <section className="cp-panel">
      {showClearConfirm && (
        <ConfirmDeleteDialog
          title="تأكيد مسح جميع السجلات"
          itemLabel="جميع سجلات محاولات اختراق أدوات المطور"
          message="هل أنت متأكد من رغبتك في حذف جميع السجلات؟ لا يمكن التراجع عن هذا الإجراء."
          confirmText="نعم، امسح الكل"
          cancelText="إلغاء"
          onConfirm={handleClearAll}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        {onBack && (
          <button className="cp-back" type="button" onClick={onBack} style={{ margin: 0 }}>
            <i className="fas fa-arrow-right"></i> رجوع
          </button>
        )}

        {violations.length > 0 && (
          <button 
            className="cp-btn cp-btn-danger" 
            type="button"
            disabled={clearing} 
            onClick={() => setShowClearConfirm(true)}
          >
            <i className="fas fa-trash-can"></i> مسح جميع السجلات
          </button>
        )}
      </div>

      <div className="cp-panel-header">
        <h2><i className="fas fa-shield-halved"></i> سجلات الحماية الأمنية</h2>
        <p>استعرض تفاصيل محاولات اختراق الحماية ومحاولات فتح أدوات المطور (DevTools) المسجلة أوتوماتيكيًا.</p>
      </div>

      {/* Stats row */}
      <div className="cp-stats-row" style={{ marginBottom: 20 }}>
        <div className="cp-stat cp-stat-bad">
          <i className="fas fa-triangle-exclamation"></i>
          <div>
            <div className="cp-stat-val">{violations.length}</div>
            <div className="cp-stat-lbl">إجمالي الانتهاكات</div>
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="cp-search">
        <i className="fas fa-search"></i>
        <input
          type="text"
          placeholder="ابحث باسم المستخدم، عنوان IP، أو الصفحة..."
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
          <p>جارٍ تحميل سجلات الحماية...</p>
        </div>
      ) : error ? (
        <div className="cp-empty" style={{ color: '#c53030' }}>
          <i className="fas fa-circle-exclamation"></i>
          <p>{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="cp-empty">
          <i className="fas fa-shield-check" style={{ color: '#10b981' }}></i>
          <p>السجل نظيف. لا توجد محاولات انتهاك مسجلة.</p>
        </div>
      ) : (
        <ul className="cp-items" style={{ marginTop: 15 }}>
          {filtered.map((v) => {
            const isBusy = busyId === v.id
            return (
              <li key={v.id} className="cp-item">
                <div className="cp-item-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                  <i className="fas fa-user-ninja"></i>
                </div>

                <div className="cp-item-body">
                  <div className="cp-item-title">
                    <span style={{ fontWeight: 600 }}>{v.username || 'غير مسجل الدخول'}</span>
                  </div>
                  <div className="cp-item-meta" style={{ flexWrap: 'wrap' }}>
                    <span><i className="fas fa-globe"></i> IP: <strong className="ltr-text" style={{ color: '#3b82f6' }}>{v.ip_address}</strong></span>
                    <span><i className="fas fa-link"></i> الصفحة: <code className="ltr-text" style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>{v.page}</code></span>
                    <span><i className="fas fa-clock"></i> {new Date(v.created_at).toLocaleString('ar-EG')}</span>
                    <span style={{ width: '100%', marginTop: 4, opacity: 0.85, fontSize: '0.82rem' }}>
                      <i className="fas fa-laptop-code"></i> {v.user_agent}
                    </span>
                  </div>
                </div>

                <div className="cp-item-controls" style={{ gap: 8 }}>
                  <button
                    className="cp-btn cp-btn-ghost cp-btn-sm"
                    type="button"
                    onClick={() => copyToClipboard(v.ip_address, v.id)}
                    title="نسخ عنوان IP الخاص بالطالب"
                  >
                    <i className={`fas ${copiedId === v.id ? 'fa-check' : 'fa-copy'}`}></i>
                    {copiedId === v.id ? 'تم النسخ' : 'نسخ الـ IP'}
                  </button>

                  <button
                    className="cp-btn cp-btn-danger cp-btn-sm"
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleDelete(v.id)}
                  >
                    {isBusy && busyId === v.id ? (
                      <i className="fas fa-spinner fa-spin"></i>
                    ) : (
                      <i className="fas fa-trash-can"></i>
                    )}
                    حذف السجل
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
