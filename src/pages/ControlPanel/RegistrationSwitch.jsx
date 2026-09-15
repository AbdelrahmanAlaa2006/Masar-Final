import React, { useEffect, useState } from 'react'
import { supabase } from '@backend/supabase'
import { useTenant } from '../../contexts/TenantContext'
import { isRegistrationClosed } from '../../utils/registration'

/* Open / close the public «إنشاء حساب» page, optionally with a closing time.
   Stored in tenants.config.registration = { open, closes_at }.

   This only hides the sign-up page. The real gate for who gets in is still
   approval in this panel, so a student who registered anyway stays pending. */

// ISO → the "YYYY-MM-DDTHH:mm" local string a datetime-local input expects.
const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const fmt = (iso) => {
  try {
    return new Date(iso).toLocaleString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

export default function RegistrationSwitch() {
  const { tenantId } = useTenant()
  const [registration, setRegistration] = useState(null)
  const [closesAtInput, setClosesAtInput] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    supabase.from('tenants').select('config').eq('id', tenantId).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const reg = data?.config?.registration || null
        setRegistration(reg)
        setClosesAtInput(toLocalInput(reg?.closes_at))
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [tenantId])

  // Re-read the config right before writing and change only `registration`,
  // so settings saved elsewhere since this panel loaded are not overwritten.
  const save = async (next) => {
    setSaving(true)
    setMessage(null)
    try {
      const { data: row, error: readError } = await supabase
        .from('tenants').select('config').eq('id', tenantId).single()
      if (readError) throw readError
      const config = { ...(row?.config || {}), registration: next }
      const { data: updated, error } = await supabase
        .from('tenants').update({ config }).eq('id', tenantId).select('id')
      if (error) throw error
      // RLS refuses silently (0 rows), so check that the row really changed.
      if (!updated || updated.length === 0) throw new Error('مش مسموح لحسابك يغيّر الإعداد ده.')
      setRegistration(next)
      setClosesAtInput(toLocalInput(next.closes_at))
      setMessage({ ok: true, text: 'اتحفظ ✔' })
    } catch (err) {
      setMessage({ ok: false, text: err.message || 'حصلت مشكلة في الحفظ، حاول تاني.' })
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return null

  const closed = isRegistrationClosed(registration)
  const closesAt = registration?.open !== false ? registration?.closes_at : null
  const scheduled = !closed && closesAt

  let status
  if (closed) {
    status = registration?.open === false
      ? 'التسجيل مقفول — محدش يقدر يعمل حساب جديد.'
      : `التسجيل اتقفل تلقائي يوم ${fmt(registration.closes_at)}.`
  } else if (scheduled) {
    status = `التسجيل مفتوح، وهيتقفل تلقائي يوم ${fmt(closesAt)}.`
  } else {
    status = 'التسجيل مفتوح — أي طالب يقدر يعمل حساب جديد.'
  }

  return (
    <div
      style={{
        border: `2px solid ${closed ? 'rgba(239,68,68,.45)' : 'rgba(16,185,129,.45)'}`,
        background: closed ? 'rgba(239,68,68,.08)' : 'rgba(16,185,129,.08)',
        borderRadius: 16, padding: 16, marginBottom: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 4 }}>
            {closed ? '🔒' : '🟢'} صفحة «إنشاء حساب» للطلاب
          </div>
          <div style={{ opacity: .85, lineHeight: 1.7 }}>{status}</div>
        </div>
        <button
          type="button"
          className={`cp-btn ${closed ? 'cp-btn-info-active' : 'cp-btn-info'}`}
          disabled={saving}
          onClick={() => save(closed ? { open: true, closes_at: null } : { open: false, closes_at: null })}
          style={{ fontWeight: 800 }}
        >
          {closed ? 'افتح التسجيل' : 'اقفل التسجيل دلوقتي'}
        </button>
      </div>

      {!closed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <label htmlFor="reg-closes-at" style={{ fontWeight: 700 }}>اقفله تلقائي في:</label>
          <input
            id="reg-closes-at"
            type="datetime-local"
            value={closesAtInput}
            onChange={(e) => setClosesAtInput(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 10, font: 'inherit', direction: 'ltr' }}
          />
          <button
            type="button"
            className="cp-btn cp-btn-info"
            disabled={saving || !closesAtInput}
            onClick={() => {
              const d = new Date(closesAtInput)
              if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
                setMessage({ ok: false, text: 'اختار ميعاد لسه مجاش.' })
                return
              }
              save({ open: true, closes_at: d.toISOString() })
            }}
          >
            حفظ الميعاد
          </button>
          {scheduled && (
            <button type="button" className="cp-btn cp-btn-info" disabled={saving}
              onClick={() => save({ open: true, closes_at: null })}>
              إلغاء الميعاد
            </button>
          )}
        </div>
      )}

      {message && (
        <div style={{ marginTop: 10, fontWeight: 700, color: message.ok ? '#10b981' : '#ef4444' }}>{message.text}</div>
      )}
    </div>
  )
}
