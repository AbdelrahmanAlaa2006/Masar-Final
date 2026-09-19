import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@backend/supabase'
import { listStudentsByGroup } from '@backend/groupsApi'
import { listStudentsByGrade, listStudentsForCards } from '@backend/profilesApi'
import { useTenant } from '../../contexts/TenantContext'
import { CARD_LAYOUTS, DEFAULT_CARD_LAYOUT, PASSWORD_NOTE, generateCardPassword, printLoginCards } from '../../utils/loginCards'
import { GRADE_LABEL } from './shared'

/* Print login cards for students: name, login code, password, parent phone.

   The password is the whole difficulty. It is stored as a one-way hash, so it
   can never be read back. A card can therefore show a real password only when
   the app holds a readable copy — a student who registered after 2026-09-19,
   a student an admin created, or a student the admin generates a new password
   for right here. Everyone else prints with a short note instead.

   Generating is deliberately explicit: it changes the student's real password
   and signs them out of every device, so the dialog always states how many
   students it will affect before anything happens. */

const SCOPES = {
  selected: 'الطلاب المحددين',
  page: 'طلاب الصفحة الحالية',
  group: 'مجموعة كاملة',
  grade: 'كل طلاب المرحلة',
}

const MODES = {
  as_is: 'من غير تغيير — اطبع كلمات المرور المعروفة فقط',
  missing: 'اعمل كلمة مرور جديدة للطلاب اللي مش معروفة كلمتهم',
  all: 'اعمل كلمة مرور جديدة لكل الطلاب المختارين',
}

export default function LoginCardsDialog({ open, onClose, students = [], selectedIds, groups = [], selectedGrade = 'all', flash }) {
  const { tenantId, tenantName, tenant } = useTenant()

  const [scope, setScope] = useState('selected')
  const [groupId, setGroupId] = useState('')
  const [mode, setMode] = useState('as_is')
  const [layout, setLayout] = useState(DEFAULT_CARD_LAYOUT)
  const [prefix, setPrefix] = useState('')
  const [rows, setRows] = useState(null)      // students of the chosen scope, with passwords
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const savedPrefix = tenant?.config?.card_password?.prefix || ''

  useEffect(() => {
    if (!open) return
    setScope(selectedIds?.size > 0 ? 'selected' : 'page')
    setMode('as_is')
    setRows(null)
    setError('')
    setPrefix(savedPrefix || '')
  }, [open, selectedIds, savedPrefix])

  // Re-check the scope whenever it changes: the summary must match what prints.
  useEffect(() => { setRows(null); setError('') }, [scope, groupId])

  const siteUrl = useMemo(() => {
    if (tenant?.domain) return tenant.domain
    try { return window.location.host } catch { return '' }
  }, [tenant])

  if (!open) return null

  const scopeIds = async () => {
    if (scope === 'selected') return Array.from(selectedIds || [])
    if (scope === 'page') return students.map((s) => s.id)
    if (scope === 'group') {
      if (!groupId) throw new Error('اختار المجموعة الأول.')
      const list = await listStudentsByGroup(groupId)
      return list.map((s) => s.id)
    }
    if (selectedGrade === 'all') throw new Error('اختار مرحلة من الفلتر الأول، أو اختار مجموعة.')
    const list = await listStudentsByGrade(selectedGrade)
    return list.map((s) => s.id)
  }

  const prepare = async () => {
    setBusy(true)
    setError('')
    try {
      const ids = await scopeIds()
      if (ids.length === 0) throw new Error('مفيش طلاب في الاختيار ده.')
      const data = await listStudentsForCards(ids)
      setRows(data)
    } catch (err) {
      setError(err.message || 'تعذر تحضير الكروت.')
      setRows(null)
    } finally {
      setBusy(false)
    }
  }

  const known = rows ? rows.filter((r) => (r.password || '').trim()).length : 0
  const unknown = rows ? rows.length - known : 0
  const toGenerate = mode === 'all' ? (rows?.length || 0) : mode === 'missing' ? unknown : 0

  const savePrefix = async (value) => {
    try {
      const { data: row } = await supabase.from('tenants').select('config').eq('id', tenantId).single()
      const config = { ...(row?.config || {}), card_password: { ...(row?.config?.card_password || {}), prefix: value } }
      await supabase.from('tenants').update({ config }).eq('id', tenantId)
    } catch {
      /* not fatal: the cards still print with the prefix typed this time */
    }
  }

  const doPrint = async () => {
    if (!rows || busy) return
    if (toGenerate > 0 && !prefix.trim()) {
      setError('اكتب بداية كلمة المرور (مثال: miracle).')
      return
    }
    setBusy(true)
    setError('')
    try {
      let list = rows
      if (toGenerate > 0) {
        const targets = mode === 'all' ? rows : rows.filter((r) => !(r.password || '').trim())
        const items = targets.map((r) => ({ id: r.id, password: generateCardPassword(prefix) }))
        const { data: count, error: rpcError } = await supabase.rpc('admin_set_student_passwords', { p_items: items })
        if (rpcError) throw rpcError
        const byId = new Map(items.map((i) => [i.id, i.password]))
        list = rows.map((r) => (byId.has(r.id) ? { ...r, password: byId.get(r.id) } : r))
        setRows(list)
        if (prefix.trim() !== savedPrefix) savePrefix(prefix.trim())
        flash?.(`تم عمل كلمة مرور جديدة لعدد ${count || items.length} طالب.`, 'success')
      }

      const printed = printLoginCards(
        list.map((r) => ({
          name: r.name,
          login: r.phone,
          password: (r.password || '').trim(),
          parentPhone: r.parent_phone || '',
          siteUrl,
        })),
        {
          layout,
          brandName: tenantName || '',
          siteUrl,
          title: `كروت الدخول (${list.length})`,
          onError: (reason) => {
            if (reason === 'popup-blocked') flash?.('متصفحك منع نافذة الطباعة. اسمح بالنوافذ المنبثقة وحاول تاني.', 'warning')
            else flash?.('مفيش كروت للطباعة.', 'warning')
          },
        }
      )
      if (printed > 0) onClose?.()
    } catch (err) {
      console.error('Login cards failed:', err)
      setError(err.message || 'تعذر طباعة الكروت.')
    } finally {
      setBusy(false)
    }
  }

  const box = { padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,.3)', font: 'inherit', width: '100%' }

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.8)', backdropFilter: 'blur(6px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose?.() }}
    >
      <div className="cp-panel" style={{ width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto', direction: 'rtl', padding: '1.5rem' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '1.2rem', fontWeight: 800 }}>
          <i className="fas fa-id-card" style={{ color: '#5bc2e7', marginInlineEnd: 8 }}></i>
          كروت دخول الطلاب
        </h2>
        <p style={{ margin: '0 0 18px', color: 'var(--cp-text-muted)', lineHeight: 1.8 }}>
          كارت لكل طالب فيه اسمه، كود الدخول، كلمة المرور، ورقم ولي الأمر — تطبعه وتقصّه وتوزّعه.
        </p>

        {/* Scope */}
        <label style={{ fontWeight: 800, display: 'block', marginBottom: 8 }}>اطبع لمين؟</label>
        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          {Object.entries(SCOPES).map(([id, label]) => {
            const count = id === 'selected' ? (selectedIds?.size || 0) : id === 'page' ? students.length : null
            const disabled = (id === 'selected' && !(selectedIds?.size > 0)) || (id === 'grade' && selectedGrade === 'all')
            return (
              <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: disabled ? 0.5 : 1 }}>
                <input type="radio" name="cards-scope" value={id} checked={scope === id} disabled={disabled} onChange={() => setScope(id)} />
                <span>{label}{count != null ? ` (${count})` : ''}</span>
                {id === 'grade' && selectedGrade !== 'all' && <span style={{ color: 'var(--cp-text-muted)' }}>— {GRADE_LABEL[selectedGrade] || selectedGrade}</span>}
              </label>
            )
          })}
        </div>
        {scope === 'group' && (
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={{ ...box, marginBottom: 14 }}>
            <option value="">— اختار المجموعة —</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}

        {/* Password handling */}
        <label style={{ fontWeight: 800, display: 'block', marginBottom: 8 }}>كلمات المرور</label>
        <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
          {Object.entries(MODES).map(([id, label]) => (
            <label key={id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.7 }}>
              <input type="radio" name="cards-mode" value={id} checked={mode === id} onChange={() => setMode(id)} style={{ marginTop: 6 }} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <p style={{ margin: '0 0 14px', fontSize: '.85rem', color: 'var(--cp-text-muted)', lineHeight: 1.8 }}>
          كلمة المرور محفوظة مشفّرة، فمحدش يقدر يقراها — حتى إحنا. الطالب اللي مش معروفة كلمته هيطبع في كارته: «{PASSWORD_NOTE}».
          أي طالب هتعمله كلمة مرور جديدة هيخرج من كل الأجهزة وهيدخل بالكارت الجديد.
        </p>

        {(mode === 'missing' || mode === 'all') && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontWeight: 700, display: 'block', marginBottom: 6 }}>بداية كلمة المرور (بتاعة منصتك)</label>
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="miracle" dir="ltr" style={box} />
            <div style={{ fontSize: '.8rem', color: 'var(--cp-text-muted)', marginTop: 6 }}>
              كل طالب هياخد الكلمة دي + ٤ أرقام عشوائية (مثال: {generateCardPassword(prefix || 'miracle')}) — عشان محدش يخمّن كلمة زميله.
            </div>
          </div>
        )}

        {/* Layout */}
        <label style={{ fontWeight: 800, display: 'block', marginBottom: 6 }}>شكل الصفحة</label>
        <select value={layout} onChange={(e) => setLayout(e.target.value)} style={{ ...box, marginBottom: 16 }}>
          {Object.values(CARD_LAYOUTS).map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>

        {/* Summary */}
        {rows && (
          <div style={{ padding: 12, borderRadius: 12, background: 'rgba(91,194,231,.1)', border: '1px solid rgba(91,194,231,.35)', marginBottom: 14, lineHeight: 1.9 }}>
            <div><b>{rows.length}</b> طالب في الاختيار ده.</div>
            <div>كلمة المرور معروفة لـ <b>{known}</b>، ومش معروفة لـ <b>{unknown}</b>.</div>
            {toGenerate > 0
              ? <div style={{ color: '#f59e0b', fontWeight: 800 }}>هيتعمل كلمة مرور جديدة لـ {toGenerate} طالب.</div>
              : <div style={{ color: '#10b981', fontWeight: 800 }}>مفيش أي كلمة مرور هتتغير.</div>}
          </div>
        )}

        {error && (
          <div style={{ padding: 12, borderRadius: 12, background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.4)', color: '#ef4444', fontWeight: 700, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {!rows ? (
            <button className="cp-btn cp-btn-info" onClick={prepare} disabled={busy}>
              {busy ? 'جاري التحضير...' : 'جهّز الكروت'}
            </button>
          ) : (
            <button className="cp-btn cp-btn-success" onClick={doPrint} disabled={busy}>
              <i className="fas fa-print"></i> {busy ? 'جاري...' : toGenerate > 0 ? `اعمل كلمات المرور واطبع (${rows.length})` : `اطبع (${rows.length})`}
            </button>
          )}
          <button className="cp-btn cp-btn-secondary" onClick={() => !busy && onClose?.()} disabled={busy}>إلغاء</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
