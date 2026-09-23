import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { getStudentDevices, setStudentMaxDevices, revokeStudentDevice } from '@backend/deviceApi'

/* Student Device Limit — per-student device management (AccountsPanel → «الأجهزة»).
   Everything is decided server-side (admin_* RPCs check the caller's role,
   'students' permission and tenant); this dialog only displays and requests. */

const MAX_ALLOWED = 10

const PLATFORM_ICON = {
  Windows: 'fab fa-windows',
  macOS: 'fab fa-apple',
  iPhone: 'fab fa-apple',
  iPad: 'fab fa-apple',
  Android: 'fab fa-android',
  Linux: 'fab fa-linux',
  ChromeOS: 'fab fa-chrome',
}

const fmtDateTime = (iso) => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return '—' }
}

const card = { background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '14px 16px' }
const muted = { color: '#94a3b8', fontSize: '0.8rem' }

export default function StudentDevicesDialog({ student, onClose, flash }) {
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [maxDraft, setMaxDraft] = useState(1)
  const [saving, setSaving] = useState(false)
  const [confirmId, setConfirmId] = useState(null)
  const [revokingId, setRevokingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await getStudentDevices(student.id)
      setInfo(data)
      setMaxDraft(data?.max_devices || 1)
    } catch (err) {
      setError(err.message || 'تعذر تحميل أجهزة الطالب')
    } finally {
      setLoading(false)
    }
  }, [student.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const saveMax = async () => {
    setSaving(true)
    try {
      await setStudentMaxDevices(student.id, maxDraft)
      flash?.(`تم تحديد عدد الأجهزة المسموحة للطالب: ${maxDraft}`, 'success')
      await load()
    } catch (err) {
      flash?.(err.message || 'تعذر حفظ عدد الأجهزة', 'error')
    } finally {
      setSaving(false)
    }
  }

  const revoke = async (deviceId) => {
    setRevokingId(deviceId)
    try {
      await revokeStudentDevice(deviceId)
      flash?.('تم إلغاء تسجيل الجهاز. يمكن للطالب الآن تسجيل جهاز جديد إن كان لديه مكان متاح.', 'success')
      setConfirmId(null)
      await load()
    } catch (err) {
      flash?.(err.message || 'تعذر إلغاء تسجيل الجهاز', 'error')
    } finally {
      setRevokingId(null)
    }
  }

  const active = info?.active_count ?? 0
  const max = info?.max_devices ?? 1
  const full = active >= max
  const devices = info?.devices || []

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 24, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto', color: '#fff', direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12, marginBottom: 16 }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
            <i className="fas fa-mobile-screen-button" style={{ marginInlineEnd: 8, color: '#818cf8' }} />
            الأجهزة المسجلة: {student.name}
          </h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.1rem', cursor: 'pointer' }}>
            <i className="fas fa-times" />
          </button>
        </div>

        {loading && !info ? (
          <div style={{ textAlign: 'center', padding: 30, ...muted }}><i className="fas fa-spinner fa-spin" /> جاري التحميل...</div>
        ) : error ? (
          <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', padding: '12px 14px', borderRadius: 12 }}>{error}</div>
        ) : (
          <>
            {/* Allowance */}
            <div style={{ ...card, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>الأجهزة المسموحة</div>
                <div style={muted}>المسجلة حالياً: <b style={{ color: full ? '#fbbf24' : '#34d399' }}>{active} / {max}</b></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" className="cp-btn cp-btn-sm cp-btn-secondary" onClick={() => setMaxDraft(v => Math.max(1, v - 1))} disabled={maxDraft <= 1 || saving} aria-label="تقليل">
                  <i className="fas fa-minus" />
                </button>
                <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 800, fontSize: '1.1rem' }}>{maxDraft}</span>
                <button type="button" className="cp-btn cp-btn-sm cp-btn-secondary" onClick={() => setMaxDraft(v => Math.min(MAX_ALLOWED, v + 1))} disabled={maxDraft >= MAX_ALLOWED || saving} aria-label="زيادة">
                  <i className="fas fa-plus" />
                </button>
                <button type="button" className="cp-btn cp-btn-sm cp-btn-success" onClick={saveMax} disabled={saving || maxDraft === max}>
                  {saving ? 'جاري الحفظ...' : 'حفظ'}
                </button>
              </div>
            </div>

            {maxDraft < active && maxDraft !== max && (
              <div style={{ ...muted, marginBottom: 12, color: '#fbbf24' }}>
                <i className="fas fa-circle-info" style={{ marginInlineEnd: 6 }} />
                تقليل العدد لا يحذف الأجهزة المسجلة حالياً؛ فقط لن يُقبل أي جهاز جديد حتى يصبح عدد الأجهزة أقل من الحد.
              </div>
            )}

            {/* Why is the student blocked? */}
            {full && (
              <div style={{ ...card, borderColor: 'rgba(251,191,36,0.35)', background: 'rgba(251,191,36,0.07)', marginBottom: 12, fontSize: '0.85rem', lineHeight: 1.7 }}>
                <i className="fas fa-lock" style={{ marginInlineEnd: 6, color: '#fbbf24' }} />
                وصل الطالب إلى الحد المسموح، وأي دخول من جهاز جديد سيتم رفضه.
                لتسجيل جهاز جديد: ألغِ تسجيل جهاز قديم أو زِد عدد الأجهزة المسموحة.
                {info?.last_denied_at && (
                  <div style={{ marginTop: 6, ...muted }}>
                    آخر محاولة مرفوضة: {info.last_denied_label || 'جهاز غير معروف'} — {fmtDateTime(info.last_denied_at)}
                  </div>
                )}
              </div>
            )}

            {!info?.enabled && (
              <div style={{ ...muted, marginBottom: 12 }}>
                <i className="fas fa-circle-info" style={{ marginInlineEnd: 6 }} />
                ميزة تحديد الأجهزة غير مفعّلة حالياً لهذه المنصة، لذلك لا يتم تطبيق هذا الحد.
              </div>
            )}

            {/* Devices */}
            {devices.length === 0 ? (
              <div style={{ ...card, textAlign: 'center', ...muted, padding: 22 }}>
                لم يسجّل الطالب أي جهاز بعد. سيُسجَّل الجهاز تلقائياً عند أول دخول له.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {devices.map((d, i) => {
                  const isActive = d.status === 'active'
                  return (
                    <div key={d.id} style={{ ...card, opacity: isActive ? 1 : 0.6, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                      <i className={PLATFORM_ICON[d.platform] || 'fas fa-display'} style={{ fontSize: '1.5rem', color: isActive ? '#818cf8' : '#64748b', width: 28, textAlign: 'center' }} />
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontWeight: 700 }}>
                          جهاز {i + 1} <span style={{ ...muted, fontWeight: 400 }}>· {d.platform} · {d.browser}</span>
                        </div>
                        <div style={muted}>آخر نشاط: {fmtDateTime(d.last_seen_at)}</div>
                        <div style={muted}>
                          {isActive ? `تاريخ التسجيل: ${fmtDateTime(d.created_at)}` : `أُلغي التسجيل: ${fmtDateTime(d.revoked_at)}`}
                        </div>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: isActive ? 'rgba(16,185,129,0.15)' : 'rgba(100,116,139,0.2)', color: isActive ? '#34d399' : '#94a3b8' }}>
                        {isActive ? 'نشط' : 'ملغى'}
                      </span>
                      {isActive && (
                        confirmId === d.id ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" className="cp-btn cp-btn-sm cp-btn-danger" onClick={() => revoke(d.id)} disabled={revokingId === d.id}>
                              {revokingId === d.id ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
                            </button>
                            <button type="button" className="cp-btn cp-btn-sm cp-btn-secondary" onClick={() => setConfirmId(null)} disabled={revokingId === d.id}>تراجع</button>
                          </div>
                        ) : (
                          <button type="button" className="cp-btn cp-btn-sm cp-btn-danger" onClick={() => setConfirmId(d.id)} title="سيتم تسجيل خروج الطالب من هذا الجهاز فوراً">
                            <i className="fas fa-ban" style={{ marginInlineEnd: 4 }} /> إلغاء التسجيل
                          </button>
                        )
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <p style={{ ...muted, marginTop: 14, lineHeight: 1.7, marginBottom: 0 }}>
              الجهاز هو المتصفح الذي دخل منه الطالب. مسح بيانات المتصفح أو استخدام متصفح آخر أو وضع التصفح الخاص يُعتبر جهازاً جديداً.
            </p>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
