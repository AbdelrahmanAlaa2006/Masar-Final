import React, { useState, useEffect, useMemo } from 'react'
import { listGroups } from '@backend/groupsApi'
import { searchStudents } from '@backend/profilesApi'
import {
  listTemplates, createTemplate, updateTemplate, deleteTemplate,
  sendAnnouncement, listAnnouncements, resolveRecipients, isRealPhone,
} from '@backend/announcementsApi'
import { useTenant } from '../../contexts/TenantContext'
import { useAuth } from '../../contexts/AuthContext'
import ConfirmDeleteDialog from '../../components/ConfirmDeleteDialog'
import { GRADE_LABEL } from './shared'

const SCOPE_LABELS = {
  all: 'جميع الطلاب',
  grade: 'مرحلة دراسية',
  group: 'مجموعة داخل مرحلة',
  student: 'طالب واحد',
}

const PLACEHOLDERS = [
  { token: '{{student_name}}', label: 'اسم الطالب' },
  { token: '{{grade}}', label: 'المرحلة' },
  { token: '{{group}}', label: 'المجموعة' },
]

export default function AnnouncementsPanel({ onBack, flash }) {
  const { gradesList } = useTenant()
  const { user: currentUser } = useAuth()

  const [activeTab, setActiveTab] = useState('compose') // compose | saved | history

  // ── Compose state ──────────────────────────────────────────────────────
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [scope, setScope] = useState('all')
  const [targetGrade, setTargetGrade] = useState(() => gradesList?.[0]?.id || '')
  const [targetGroupId, setTargetGroupId] = useState('')
  const [studentQuery, setStudentQuery] = useState('')
  const [studentResults, setStudentResults] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [channelPortal, setChannelPortal] = useState(true)
  const [channelWhatsapp, setChannelWhatsapp] = useState(true)
  const [sending, setSending] = useState(false)
  const [preview, setPreview] = useState(null) // { total, withParentPhone, withOwnPhone }
  const [lastResult, setLastResult] = useState(null)

  // ── Shared data ────────────────────────────────────────────────────────
  const [groups, setGroups] = useState([])
  const [templates, setTemplates] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateSearch, setTemplateSearch] = useState('')
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // ── Saved-message editor state ─────────────────────────────────────────
  const [editingTemplate, setEditingTemplate] = useState(null) // null | {} | row
  const [tplTitle, setTplTitle] = useState('')
  const [tplBody, setTplBody] = useState('')
  const [tplCategory, setTplCategory] = useState('')
  const [tplKind, setTplKind] = useState('saved')
  const [tplSaving, setTplSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    listGroups().then(setGroups).catch(() => {})
    reloadTemplates()
  }, [])

  useEffect(() => {
    if (activeTab !== 'history') return
    setHistoryLoading(true)
    listAnnouncements()
      .then(setHistory)
      .catch(() => flash('فشل تحميل سجل الإعلانات', 'error'))
      .finally(() => setHistoryLoading(false))
  }, [activeTab])

  const reloadTemplates = (search = '') => {
    setTemplatesLoading(true)
    listTemplates({ search })
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setTemplatesLoading(false))
  }

  // Debounced saved-message search
  useEffect(() => {
    const t = setTimeout(() => reloadTemplates(templateSearch), 300)
    return () => clearTimeout(t)
  }, [templateSearch])

  // Debounced student picker search
  useEffect(() => {
    if (scope !== 'student') return
    const t = setTimeout(async () => {
      try { setStudentResults(await searchStudents(studentQuery, 12)) } catch { /* noop */ }
    }, 300)
    return () => clearTimeout(t)
  }, [scope, studentQuery])

  // Audience preview — resolves recipients (one lean query) so the sender
  // sees exactly how many WhatsApp messages will be queued before sending.
  useEffect(() => {
    setPreview(null)
    const groupRow = groups.find(g => g.id === targetGroupId)
    if (scope === 'group' && !groupRow) return
    if (scope === 'student' && !selectedStudent) return
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const recipients = await resolveRecipients({
          scope,
          targetGrade: scope === 'grade' || scope === 'group' ? targetGrade : null,
          targetGroupName: scope === 'group' ? groupRow?.name : null,
          targetStudentId: scope === 'student' ? selectedStudent?.id : null,
        })
        if (cancelled) return
        setPreview({
          total: recipients.length,
          withParentPhone: recipients.filter(r => isRealPhone(r.parent_phone)).length,
          withOwnPhone: recipients.filter(r => isRealPhone(r.phone)).length,
        })
      } catch { /* preview is best-effort */ }
    }, 400)
    return () => { cancelled = true; clearTimeout(t) }
  }, [scope, targetGrade, targetGroupId, selectedStudent, groups])

  const gradeGroups = useMemo(
    () => groups.filter(g => g.grade === targetGrade),
    [groups, targetGrade]
  )

  const insertPlaceholder = (token) => setBody(prev => prev + token)

  const applyTemplate = (tpl) => {
    setTitle(prev => prev || tpl.title)
    setBody(tpl.body)
    setActiveTab('compose')
    flash('تم إدراج الرسالة — يمكنك تعديلها قبل الإرسال', 'success')
  }

  const handleSend = async () => {
    if (!title.trim()) { flash('أدخل عنوان الرسالة', 'warning'); return }
    if (!body.trim()) { flash('أدخل نص الرسالة', 'warning'); return }
    if (scope === 'group' && !targetGroupId) { flash('اختر المجموعة المستهدفة', 'warning'); return }
    if (scope === 'student' && !selectedStudent) { flash('اختر الطالب المستهدف', 'warning'); return }
    if (!channelPortal && !channelWhatsapp) { flash('اختر وسيلة إرسال واحدة على الأقل', 'warning'); return }

    const groupRow = groups.find(g => g.id === targetGroupId)
    setSending(true)
    setLastResult(null)
    try {
      const result = await sendAnnouncement({
        title,
        body,
        scope,
        targetGrade: scope === 'grade' || scope === 'group' ? targetGrade : null,
        targetGroupName: scope === 'group' ? groupRow?.name : null,
        targetGroupId: scope === 'group' ? targetGroupId : null,
        targetStudentId: scope === 'student' ? selectedStudent?.id : null,
        channels: [
          ...(channelPortal ? ['portal'] : []),
          ...(channelWhatsapp ? ['whatsapp'] : []),
        ],
        gradeLabel: GRADE_LABEL,
        createdBy: currentUser?.id,
      })
      setLastResult(result)
      flash(
        `تم الإرسال إلى ${result.recipientsTotal} طالب` +
        (result.whatsappQueued ? ` — ${result.whatsappQueued} رسالة واتساب في قائمة الانتظار` : ''),
        'success'
      )
      setTitle('')
      setBody('')
    } catch (err) {
      console.error(err)
      flash('فشل إرسال الإعلان: ' + (err.message || ''), 'error')
    } finally {
      setSending(false)
    }
  }

  // ── Saved messages CRUD ────────────────────────────────────────────────
  const openTemplateEditor = (row = null) => {
    setEditingTemplate(row || {})
    setTplTitle(row?.title || '')
    setTplBody(row?.body || '')
    setTplCategory(row?.category || '')
    setTplKind(row?.kind || 'saved')
  }

  const handleSaveTemplate = async (e) => {
    e.preventDefault()
    if (!tplTitle.trim() || !tplBody.trim()) { flash('العنوان والنص مطلوبان', 'warning'); return }
    setTplSaving(true)
    try {
      if (editingTemplate?.id) {
        await updateTemplate(editingTemplate.id, { title: tplTitle, body: tplBody, category: tplCategory || null, kind: tplKind })
        flash('تم تحديث الرسالة المحفوظة', 'success')
      } else {
        await createTemplate({ title: tplTitle, body: tplBody, category: tplCategory || null, kind: tplKind, createdBy: currentUser?.id })
        flash('تم حفظ الرسالة', 'success')
      }
      setEditingTemplate(null)
      reloadTemplates(templateSearch)
    } catch (err) {
      flash('فشل الحفظ: ' + (err.message || ''), 'error')
    } finally {
      setTplSaving(false)
    }
  }

  const handleDeleteTemplate = async () => {
    if (!deleteTarget) return
    try {
      await deleteTemplate(deleteTarget.id)
      flash('تم حذف الرسالة', 'success')
      reloadTemplates(templateSearch)
    } catch (err) {
      flash('فشل الحذف: ' + (err.message || ''), 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  const scopeSummary = (a) => {
    if (a.scope === 'all') return SCOPE_LABELS.all
    if (a.scope === 'grade') return GRADE_LABEL[a.target_grade] || a.target_grade
    if (a.scope === 'group') {
      const g = groups.find(x => x.id === a.target_group_id)
      return `${GRADE_LABEL[a.target_grade] || a.target_grade || ''} — ${g?.name || 'مجموعة'}`
    }
    return 'طالب واحد'
  }

  const inputStyle = { width: '100%' }
  const labelStyle = { display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }
  const cardStyle = { background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '20px', boxShadow: 'var(--cp-card-shadow)' }

  return (
    <div className="cp-panel-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>الإعلانات والرسائل الجماعية</h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', margin: '4px 0 0' }}>
            أرسل إعلانات يدوية للطلاب وأولياء الأمور عبر الواتساب وإشعارات المنصة
          </p>
        </div>
        <button onClick={onBack} className="cp-btn cp-btn-secondary">رجوع للوحة التحكم</button>
      </div>

      {/* Tabs */}
      <div className="cp-subtabs" style={{ display: 'flex', gap: 8, margin: '0 0 24px 0', borderBottom: '1px solid var(--cp-divider)', paddingBottom: '12px', flexWrap: 'wrap' }}>
        {[
          ['compose', 'fa-paper-plane', 'إرسال إعلان'],
          ['saved', 'fa-bookmark', 'الرسائل المحفوظة والقوالب'],
          ['history', 'fa-clock-rotate-left', 'سجل الإرسال'],
        ].map(([key, icon, label]) => (
          <button
            key={key}
            className={`cp-btn ${activeTab === key ? 'cp-btn-info-active' : 'cp-btn-info'}`}
            onClick={() => setActiveTab(key)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}
          >
            <i className={`fas ${icon}`} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Compose ── */}
      {activeTab === 'compose' && (
        <div style={{ display: 'grid', gap: '20px' }}>
          <div style={cardStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>الجمهور المستهدف</label>
                <select value={scope} onChange={(e) => setScope(e.target.value)} className="cp-input" style={inputStyle}>
                  {Object.entries(SCOPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              {(scope === 'grade' || scope === 'group') && (
                <div>
                  <label style={labelStyle}>المرحلة الدراسية</label>
                  <select value={targetGrade} onChange={(e) => { setTargetGrade(e.target.value); setTargetGroupId('') }} className="cp-input" style={inputStyle}>
                    {gradesList.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              )}

              {scope === 'group' && (
                <div>
                  <label style={labelStyle}>المجموعة</label>
                  <select value={targetGroupId} onChange={(e) => setTargetGroupId(e.target.value)} className="cp-input" style={inputStyle}>
                    <option value="">اختر المجموعة...</option>
                    {gradeGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              )}

              {scope === 'student' && (
                <div style={{ position: 'relative' }}>
                  <label style={labelStyle}>الطالب</label>
                  {selectedStudent ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="cp-id-pill" style={{ fontWeight: 'bold' }}>{selectedStudent.name}</span>
                      <button onClick={() => { setSelectedStudent(null); setStudentQuery('') }} className="cp-btn cp-btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>تغيير</button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={studentQuery}
                        onChange={(e) => setStudentQuery(e.target.value)}
                        placeholder="ابحث بالاسم أو الهاتف..."
                        className="cp-input"
                        style={inputStyle}
                      />
                      {studentResults.length > 0 && studentQuery.trim() && (
                        <div style={{ position: 'absolute', top: '100%', insetInlineStart: 0, insetInlineEnd: 0, zIndex: 30, background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '10px', maxHeight: '220px', overflowY: 'auto', boxShadow: 'var(--cp-card-shadow)' }}>
                          {studentResults.map(s => (
                            <button
                              key={s.id}
                              onClick={() => { setSelectedStudent(s); setStudentResults([]) }}
                              style={{ display: 'block', width: '100%', textAlign: 'right', padding: '10px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--cp-divider)', cursor: 'pointer', color: 'inherit' }}
                            >
                              <strong>{s.name}</strong>
                              <span style={{ fontSize: '0.78rem', color: 'var(--cp-text-muted)', marginInlineStart: 8 }}>
                                {GRADE_LABEL[s.grade] || s.grade} {s.group ? `— ${s.group}` : ''}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Audience preview */}
            {preview && (
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '10px 16px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '16px' }}>
                <span><i className="fas fa-users" style={{ marginInlineEnd: 6 }} />{preview.total} طالب مستهدف</span>
                <span style={{ color: '#10b981' }}><i className="fab fa-whatsapp" style={{ marginInlineEnd: 6 }} />{preview.withParentPhone} ولي أمر برقم واتساب</span>
                <span style={{ color: '#06b6d4' }}><i className="fas fa-mobile-screen" style={{ marginInlineEnd: 6 }} />{preview.withOwnPhone} طالب برقم خاص</span>
                {preview.total - preview.withOwnPhone > 0 && (
                  <span style={{ color: 'var(--cp-text-muted)' }}>
                    {preview.total - preview.withOwnPhone} طالب بدون رقم — سيصلهم إشعار المنصة فقط
                  </span>
                )}
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>عنوان الرسالة</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: تنبيه هام بخصوص موعد الحصة" className="cp-input" style={inputStyle} />
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>نص الرسالة</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={'مثال:\nالسيد ولي الأمر،\nنحيطكم علماً بأن {{student_name}} ...'}
                className="cp-input"
                rows={6}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>

            {/* Placeholder chips + insert saved message */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', fontWeight: 'bold' }}>متغيرات القالب:</span>
              {PLACEHOLDERS.map(p => (
                <button key={p.token} onClick={() => insertPlaceholder(p.token)} className="cp-btn" style={{ padding: '4px 10px', fontSize: '0.78rem', background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                  {p.label} <code style={{ direction: 'ltr' }}>{p.token}</code>
                </button>
              ))}
              {templates.length > 0 && (
                <select
                  value=""
                  onChange={(e) => { const tpl = templates.find(t => t.id === e.target.value); if (tpl) applyTemplate(tpl) }}
                  className="cp-input"
                  style={{ padding: '6px 10px', fontSize: '0.8rem', maxWidth: '260px' }}
                >
                  <option value="">إدراج رسالة محفوظة / قالب...</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.kind === 'template' ? '📋 ' : '💬 '}{t.title}</option>)}
                </select>
              )}
            </div>

            {/* Channels + send */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderTop: '1px solid var(--cp-divider)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 'bold' }}>
                  <input type="checkbox" checked={channelWhatsapp} onChange={(e) => setChannelWhatsapp(e.target.checked)} style={{ accentColor: '#10b981' }} />
                  <i className="fab fa-whatsapp" style={{ color: '#10b981' }} /> واتساب (ولي الأمر + الطالب إن وُجد رقم)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 'bold' }}>
                  <input type="checkbox" checked={channelPortal} onChange={(e) => setChannelPortal(e.target.checked)} style={{ accentColor: '#06b6d4' }} />
                  <i className="fas fa-bell" style={{ color: '#06b6d4' }} /> إشعار داخل المنصة
                </label>
              </div>
              <button onClick={handleSend} disabled={sending} className="cp-btn cp-btn-success" style={{ padding: '10px 28px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {sending ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-paper-plane" />}
                {sending ? 'جاري الإرسال...' : 'إرسال الإعلان'}
              </button>
            </div>

            {lastResult && (
              <div style={{ marginTop: '14px', padding: '10px 16px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.25)', color: '#10b981', borderRadius: '10px', fontSize: '0.86rem', fontWeight: 'bold' }}>
                <i className="fas fa-check-circle" style={{ marginInlineEnd: 6 }} />
                تم الإرسال إلى {lastResult.recipientsTotal} طالب — {lastResult.whatsappQueued} رسالة واتساب في قائمة الانتظار.
                {lastResult.whatsappQueued > 0 && ' افتح قسم «إشعارات أولياء الأمور» لمعالجة القائمة.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Saved messages & templates ── */}
      {activeTab === 'saved' && (
        <div style={{ display: 'grid', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              placeholder="ابحث في الرسائل المحفوظة..."
              className="cp-input"
              style={{ flex: 1, minWidth: '220px', maxWidth: '400px' }}
            />
            <button onClick={() => openTemplateEditor()} className="cp-btn cp-btn-success" style={{ fontWeight: 'bold' }}>
              <i className="fas fa-plus" style={{ marginInlineEnd: 6 }} /> رسالة محفوظة جديدة
            </button>
          </div>

          {editingTemplate !== null && (
            <form onSubmit={handleSaveTemplate} style={{ ...cardStyle, animation: 'cpFadeUp 0.2s ease' }}>
              <h4 style={{ margin: '0 0 16px', fontWeight: 'bold' }}>{editingTemplate?.id ? 'تعديل الرسالة' : 'رسالة محفوظة جديدة'}</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={labelStyle}>العنوان</label>
                  <input type="text" value={tplTitle} onChange={(e) => setTplTitle(e.target.value)} className="cp-input" style={inputStyle} required />
                </div>
                <div>
                  <label style={labelStyle}>التصنيف (اختياري)</label>
                  <input type="text" value={tplCategory} onChange={(e) => setTplCategory(e.target.value)} placeholder="مثال: إجازات، مواعيد..." className="cp-input" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>النوع</label>
                  <select value={tplKind} onChange={(e) => setTplKind(e.target.value)} className="cp-input" style={inputStyle}>
                    <option value="saved">رسالة جاهزة</option>
                    <option value="template">قالب بمتغيرات</option>
                  </select>
                </div>
              </div>
              <label style={labelStyle}>نص الرسالة</label>
              <textarea value={tplBody} onChange={(e) => setTplBody(e.target.value)} rows={4} className="cp-input" style={{ ...inputStyle, resize: 'vertical', marginBottom: '14px' }} required />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" disabled={tplSaving} className="cp-btn cp-btn-success" style={{ fontWeight: 'bold' }}>
                  {tplSaving ? 'جاري الحفظ...' : 'حفظ'}
                </button>
                <button type="button" onClick={() => setEditingTemplate(null)} className="cp-btn cp-btn-secondary">إلغاء</button>
              </div>
            </form>
          )}

          {templatesLoading ? (
            <div className="cp-empty"><i className="fas fa-spinner fa-spin" /><p>جاري التحميل...</p></div>
          ) : templates.length === 0 ? (
            <div className="cp-empty">
              <i className="fas fa-bookmark" />
              <p>لا توجد رسائل محفوظة بعد — احفظ رسائلك المتكررة مثل «غداً إجازة» لإعادة استخدامها بنقرة</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
              {templates.map(t => (
                <div key={t.id} style={{ ...cardStyle, padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <strong style={{ fontSize: '0.95rem' }}>{t.kind === 'template' ? '📋' : '💬'} {t.title}</strong>
                    {t.category && <span className="cp-id-pill" style={{ fontSize: '0.72rem' }}>{t.category}</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--cp-text-muted)', whiteSpace: 'pre-wrap', maxHeight: '80px', overflow: 'hidden' }}>{t.body}</p>
                  <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', paddingTop: '8px' }}>
                    <button onClick={() => applyTemplate(t)} className="cp-btn cp-btn-info" style={{ padding: '5px 12px', fontSize: '0.78rem', fontWeight: 'bold' }}>استخدام</button>
                    <button onClick={() => openTemplateEditor(t)} className="cp-btn cp-btn-secondary" style={{ padding: '5px 12px', fontSize: '0.78rem' }}>تعديل</button>
                    <button onClick={() => setDeleteTarget(t)} className="cp-btn" style={{ padding: '5px 12px', fontSize: '0.78rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}>حذف</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── History ── */}
      {activeTab === 'history' && (
        historyLoading ? (
          <div className="cp-empty"><i className="fas fa-spinner fa-spin" /><p>جاري تحميل السجل...</p></div>
        ) : history.length === 0 ? (
          <div className="cp-empty"><i className="fas fa-inbox" /><p>لم يتم إرسال أي إعلانات بعد</p></div>
        ) : (
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: 'var(--cp-list-header-bg)', borderBottom: '1px solid var(--cp-divider)' }}>
                    <th style={{ padding: '14px 18px', fontWeight: 'bold' }}>العنوان</th>
                    <th style={{ padding: '14px', fontWeight: 'bold' }}>الجمهور</th>
                    <th style={{ padding: '14px', fontWeight: 'bold', width: '110px' }}>المستلمون</th>
                    <th style={{ padding: '14px', fontWeight: 'bold', width: '130px' }}>واتساب</th>
                    <th style={{ padding: '14px', fontWeight: 'bold', width: '150px' }}>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--cp-list-item-border)' }}>
                      <td style={{ padding: '12px 18px' }}>
                        <strong>{a.title}</strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--cp-text-muted)', maxWidth: '380px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.body}</div>
                      </td>
                      <td style={{ padding: '12px 14px' }}><span className="cp-id-pill">{scopeSummary(a)}</span></td>
                      <td style={{ padding: '12px 14px', fontWeight: 'bold' }}>{a.recipients_total}</td>
                      <td style={{ padding: '12px 14px', color: '#10b981', fontWeight: 'bold' }}>
                        {a.channels?.includes('whatsapp') ? `${a.whatsapp_queued} رسالة` : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--cp-text-muted)', fontSize: '0.82rem' }}>
                        {new Date(a.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {deleteTarget && (
        <ConfirmDeleteDialog
          title="حذف الرسالة المحفوظة"
          itemLabel={deleteTarget.title}
          message="سيتم حذف هذه الرسالة المحفوظة نهائياً."
          confirmText="نعم، احذف"
          cancelText="إلغاء"
          onConfirm={handleDeleteTemplate}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
