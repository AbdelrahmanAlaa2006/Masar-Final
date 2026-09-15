import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@backend/supabase'
import { whatsappReplyLink } from '../company/contact'

/* Teachers who asked for a platform through gitfekra.com, plus what visitors
   did on the site. Super admin only — the RLS policy on both tables checks
   is_super_admin(), so this panel shows nothing to anyone else.

   Replying is a click-to-chat link that opens WhatsApp with the message ready:
   a human presses send. Nothing is sent automatically from here. */

const STATUSES = [
  { id: 'new', label: 'جديد', color: '#3b82f6' },
  { id: 'contacted', label: 'اتكلمنا معاه', color: '#8b5cf6' },
  { id: 'negotiating', label: 'بنتفاوض', color: '#f59e0b' },
  { id: 'won', label: 'اتعاقدنا ✅', color: '#10b981' },
  { id: 'lost', label: 'مش مهتم', color: '#6b7280' },
]

const EVENT_LABELS = {
  page_view: 'زيارات الصفحة',
  cta_click: 'ضغط على زرار «اطلب منصتك»',
  whatsapp_click: 'ضغط على واتساب',
  lead_submitted: 'سابوا بياناتهم',
  contact_email_click: 'ضغط على الإيميل',
  work_card_click: 'فتح منصة من أعمالنا',
  tour_open: 'فتح صور الجولة',
}

const fmtDateTime = (iso) => {
  try {
    return new Date(iso).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

const sourceLabel = (s) => ({
  site_form: 'فورم الموقع', whatsapp: 'واتساب', phone: 'مكالمة', referral: 'ترشيح', other: 'أخرى',
}[s] || s)

export default function LeadsPanel({ flash }) {
  const [leads, setLeads] = useState([])
  const [summary, setSummary] = useState([])
  const [days, setDays] = useState(30)
  const [statusTab, setStatusTab] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [noteDraft, setNoteDraft] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [{ data: rows, error: leadsError }, { data: stats, error: statsError }] = await Promise.all([
        supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(300),
        supabase.rpc('site_events_summary', { p_days: days }),
      ])
      if (leadsError) throw leadsError
      if (statsError) throw statsError
      setLeads(rows || [])
      setSummary(stats || [])
    } catch (err) {
      console.error('Failed to load leads:', err)
      setError(err.message || 'تعذّر تحميل البيانات.')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  const counts = useMemo(() => {
    const acc = { all: leads.length }
    for (const s of STATUSES) acc[s.id] = leads.filter((l) => l.status === s.id).length
    return acc
  }, [leads])

  const visible = useMemo(
    () => (statusTab === 'all' ? leads : leads.filter((l) => l.status === statusTab)),
    [leads, statusTab]
  )

  const patchLead = async (lead, patch) => {
    setBusyId(lead.id)
    try {
      const { data, error: err } = await supabase
        .from('leads')
        .update({ ...patch, handled_at: new Date().toISOString() })
        .eq('id', lead.id)
        .select()
      if (err) throw err
      if (!data || data.length === 0) throw new Error('مش مسموح لحسابك يعدّل هنا.')
      setLeads((list) => list.map((l) => (l.id === lead.id ? data[0] : l)))
      flash?.('تم الحفظ', 'success')
    } catch (err) {
      console.error('Failed to update lead:', err)
      flash?.(err.message || 'تعذّر الحفظ', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const newCount = counts.new || 0

  return (
    <div style={{ direction: 'rtl' }}>
      <div className="cp-panel-header">
        <h2><i className="fas fa-bullhorn" style={{ color: '#f59e0b' }}></i> العملاء المحتملين (مدرّسين سألوا عن منصة)</h2>
        <p>كل مدرّس ساب بياناته على موقع الشركة، وإحصائيات زوّار الموقع. البيانات دي بتوصل من gitfekra.com.</p>
      </div>

      {/* Visitor activity */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontWeight: 800 }}>نشاط الموقع آخر:</span>
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" className={`cp-btn ${days === d ? 'cp-btn-info-active' : 'cp-btn-info'}`} onClick={() => setDays(d)}>
            {d} يوم
          </button>
        ))}
      </div>

      <div className="cp-sa-stats-grid" style={{ marginBottom: 24 }}>
        {summary.length === 0 && !loading && (
          <div className="cp-empty" style={{ gridColumn: '1 / -1' }}>
            <i className="fas fa-chart-simple"></i>
            <p>لسه مفيش بيانات زيارات في الفترة دي.</p>
          </div>
        )}
        {summary.map((row) => (
          <div className="cp-sa-stat-card" key={row.name}>
            <div className="cp-sa-stat-info">
              <span className="cp-sa-stat-label">{EVENT_LABELS[row.name] || row.name}</span>
              <span className="cp-sa-stat-value">{Number(row.total).toLocaleString('ar-EG')}</span>
              <span style={{ fontSize: '.8rem', opacity: .75 }}>
                {Number(row.sessions).toLocaleString('ar-EG')} زائر مختلف
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Status tabs */}
      <div className="cp-subtabs" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <button className={`cp-btn ${statusTab === 'all' ? 'cp-btn-info-active' : 'cp-btn-info'}`} onClick={() => setStatusTab('all')}>
          الكل ({counts.all})
        </button>
        {STATUSES.map((s) => (
          <button key={s.id} className={`cp-btn ${statusTab === s.id ? 'cp-btn-info-active' : 'cp-btn-info'}`} onClick={() => setStatusTab(s.id)}>
            {s.label} ({counts[s.id] || 0})
          </button>
        ))}
        <button className="cp-btn cp-btn-secondary" onClick={load} disabled={loading}>
          <i className="fas fa-rotate"></i> تحديث
        </button>
      </div>

      {newCount > 0 && statusTab === 'all' && (
        <div style={{ padding: '12px 16px', borderRadius: 12, marginBottom: 16, fontWeight: 800, background: 'rgba(59,130,246,.12)', border: '1px solid rgba(59,130,246,.4)' }}>
          فيه {newCount} مدرّس لسه محدش كلّمه.
        </div>
      )}

      {loading ? (
        <div className="cp-empty"><i className="fas fa-spinner fa-spin"></i><p>جاري التحميل...</p></div>
      ) : error ? (
        <div className="cp-empty" style={{ color: '#ef4444' }}><i className="fas fa-triangle-exclamation"></i><p>{error}</p></div>
      ) : visible.length === 0 ? (
        <div className="cp-empty">
          <i className="fas fa-inbox"></i>
          <p>مفيش طلبات هنا لسه.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {visible.map((lead) => {
            const wa = whatsappReplyLink(lead.phone, `أهلاً ${lead.name}، معاك فريق جِت فِكرة بخصوص طلبك لمنصة تعليمية.`)
            const status = STATUSES.find((s) => s.id === lead.status)
            return (
              <div key={lead.id} style={{ border: '1px solid rgba(148,163,184,.3)', borderRadius: 14, padding: 16 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{lead.name}</div>
                    <div dir="ltr" style={{ fontWeight: 700, letterSpacing: '.5px', textAlign: 'start' }}>{lead.phone}</div>
                    {lead.subject && <div style={{ opacity: .85 }}>{lead.subject}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ padding: '4px 10px', borderRadius: 99, fontSize: '.8rem', fontWeight: 800, color: '#fff', background: status?.color || '#6b7280' }}>
                      {status?.label || lead.status}
                    </span>
                    {wa && (
                      <a className="cp-btn cp-btn-success" href={wa} target="_blank" rel="noopener noreferrer"
                        onClick={() => { if (lead.status === 'new') patchLead(lead, { status: 'contacted' }) }}>
                        <i className="fab fa-whatsapp"></i> كلّمه على واتساب
                      </a>
                    )}
                  </div>
                </div>

                {lead.message && (
                  <p style={{ margin: '10px 0', padding: 10, borderRadius: 10, background: 'rgba(148,163,184,.12)', lineHeight: 1.8 }}>
                    {lead.message}
                  </p>
                )}

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '.85rem', opacity: .8, marginTop: 8 }}>
                  <span><i className="fas fa-clock"></i> {fmtDateTime(lead.created_at)}</span>
                  <span><i className="fas fa-location-arrow"></i> {sourceLabel(lead.source)}</span>
                  {lead.utm?.utm_source && <span><i className="fas fa-bullseye"></i> إعلان: {lead.utm.utm_source}{lead.utm.utm_campaign ? ` / ${lead.utm.utm_campaign}` : ''}</span>}
                  {lead.referrer && <span dir="ltr" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.referrer}</span>}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
                  <select
                    value={lead.status}
                    disabled={busyId === lead.id}
                    onChange={(e) => patchLead(lead, { status: e.target.value })}
                    style={{ padding: '8px 10px', borderRadius: 10, font: 'inherit' }}
                  >
                    {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  <input
                    type="text"
                    placeholder="ملاحظات (مثال: عايز يبدأ بعد الامتحانات)"
                    defaultValue={lead.notes || ''}
                    onChange={(e) => setNoteDraft((d) => ({ ...d, [lead.id]: e.target.value }))}
                    style={{ flex: '1 1 260px', padding: '8px 10px', borderRadius: 10, font: 'inherit' }}
                  />
                  <button
                    type="button"
                    className="cp-btn cp-btn-info"
                    disabled={busyId === lead.id || noteDraft[lead.id] === undefined}
                    onClick={() => patchLead(lead, { notes: noteDraft[lead.id] })}
                  >
                    حفظ الملاحظة
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
