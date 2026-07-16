import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  listBooklets, createBooklet, updateBooklet, deleteBooklet, setBookletStatus,
  syncBookletAssignments, listStudentBooklets, markBookletsPaid,
  revertBookletPayment, getBookletReport,
  BOOKLET_SCOPE_LABEL, BOOKLET_TERM_LABEL, bookletScopeLabel,
} from '@backend/bookletsApi'
import { listBranches } from '@backend/branchesApi'
import { listGroups } from '@backend/groupsApi'
import { listStudentsPaged } from '@backend/profilesApi'
import { useTenant } from '../../contexts/TenantContext'
import ConfirmDeleteDialog from '../../components/ConfirmDeleteDialog'
import DatePicker from '../../components/DatePicker'
import { GRADE_LABEL, GRADE_ORDER, initials } from './shared'

/* ---------------------------------------------------------------------------
   Booklets — three screens living inside the Payment (finance) page:
     mode="manage"  : create / edit / archive / delete booklets; every save
                      auto-assigns the booklet to all matching students.
     mode="payment" : filter → find student → view assigned booklets → mark
                      one or more as paid (transactional, duplicate-proof).
     mode="reports" : filtered report + totals cards + sorting + CSV/print.
   --------------------------------------------------------------------------- */

const fmtMoney = (n) => `${Number(n || 0).toLocaleString('ar-EG')} ج.م`
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

const labelStyle = { display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }
const cardStyle = { background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '20px', boxShadow: 'var(--cp-card-shadow)' }
const thStyle = { padding: '13px 14px', fontWeight: 'bold', whiteSpace: 'nowrap' }
const tdStyle = { padding: '11px 14px', verticalAlign: 'middle' }

const statusPill = (paid) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px',
  borderRadius: 999, fontSize: '0.8rem', fontWeight: 700,
  background: paid ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.1)',
  color: paid ? '#059669' : '#dc2626',
})

// CSV download with the UTF-8 BOM Excel needs for Arabic (repo convention).
const csvCell = (val) => `"${String(val == null ? '' : val).replace(/"/g, '""')}"`
const downloadCsv = (name, headers, rows) => {
  const content = '﻿' + [headers.map(csvCell).join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

// ── Shared filter selects (stage / branch / group / scope / term) ───────────

function ScopeTermFilters({ scope, term, onScope, onTerm, allowAll = true }) {
  return (
    <>
      <div>
        <label style={labelStyle}>النطاق الأكاديمي</label>
        <select value={scope} onChange={(e) => { onScope(e.target.value); if (e.target.value !== 'term') onTerm('') }} className="cp-input" style={{ width: '100%' }}>
          {allowAll && <option value="">الكل</option>}
          <option value="year">{BOOKLET_SCOPE_LABEL.year}</option>
          <option value="term">{BOOKLET_SCOPE_LABEL.term}</option>
        </select>
      </div>
      {scope === 'term' && (
        <div>
          <label style={labelStyle}>الترم</label>
          <select value={term} onChange={(e) => onTerm(e.target.value)} className="cp-input" style={{ width: '100%' }}>
            {allowAll && <option value="">الترمان</option>}
            <option value="first">{BOOKLET_TERM_LABEL.first}</option>
            <option value="second">{BOOKLET_TERM_LABEL.second}</option>
          </select>
        </div>
      )}
    </>
  )
}

export default function BookletsPanel({ mode, flash }) {
  const { isGradeEnabled } = useTenant()

  const [branches, setBranches] = useState([])
  const [groups, setGroups] = useState([])

  useEffect(() => {
    listBranches().then(setBranches).catch(() => {})
    listGroups().then(setGroups).catch(() => {})
  }, [])

  const activeGrades = useMemo(() => GRADE_ORDER.filter(isGradeEnabled), [isGradeEnabled])

  const gradeOptions = (value, onChange, allLabel = 'كل المراحل') => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="cp-input" style={{ width: '100%' }}>
      {allLabel !== null && <option value="">{allLabel}</option>}
      {activeGrades.map(g => <option key={g} value={g}>{GRADE_LABEL[g]}</option>)}
    </select>
  )

  const branchOptions = (value, onChange, allLabel) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="cp-input" style={{ width: '100%' }}>
      <option value="">{allLabel}</option>
      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  )

  const groupOptions = (value, onChange, { grade, branchId, allLabel }) => {
    const list = groups.filter(g =>
      (!grade || g.grade === grade) &&
      (!branchId || !g.branch_id || g.branch_id === branchId)
    )
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="cp-input" style={{ width: '100%' }}>
        <option value="">{allLabel}</option>
        {list.map(g => <option key={g.id} value={g.id}>{g.name}{g.branches?.name ? ` — ${g.branches.name}` : ''}</option>)}
      </select>
    )
  }

  const shared = { flash, branches, groups, gradeOptions, branchOptions, groupOptions }

  if (mode === 'manage') return <ManageBooklets {...shared} />
  if (mode === 'payment') return <BookletPayment {...shared} />
  return <BookletReports {...shared} />
}

/* ═══════════════════════════ 1) Manage Booklets ═══════════════════════════ */

function ManageBooklets({ flash, gradeOptions, branchOptions, groupOptions }) {
  const [booklets, setBooklets] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [filterGrade, setFilterGrade] = useState('')
  const [filterScope, setFilterScope] = useState('')
  const [filterTerm, setFilterTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Form
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [fName, setFName] = useState('')
  const [fDescription, setFDescription] = useState('')
  const [fGrade, setFGrade] = useState('')
  const [fBranchId, setFBranchId] = useState('')
  const [fGroupId, setFGroupId] = useState('')
  const [fScope, setFScope] = useState('year')
  const [fTerm, setFTerm] = useState('first')
  const [fPrice, setFPrice] = useState('')
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setBooklets(await listBooklets({
        search,
        grade: filterGrade || null,
        scope: filterScope || null,
        term: filterScope === 'term' ? (filterTerm || null) : null,
        status: filterStatus || null,
      }))
    } catch (err) {
      flash('فشل تحميل الملازم: ' + (err.message || ''), 'error')
    } finally {
      setLoading(false)
    }
  }, [search, filterGrade, filterScope, filterTerm, filterStatus])

  useEffect(() => {
    const t = setTimeout(reload, search ? 350 : 0)
    return () => clearTimeout(t)
  }, [reload])

  const openForm = (row = null) => {
    setEditing(row)
    setFName(row?.name || '')
    setFDescription(row?.description || '')
    setFGrade(row?.grade || '')
    setFBranchId(row?.branch_id || '')
    setFGroupId(row?.group_id || '')
    setFScope(row?.academic_scope || 'year')
    setFTerm(row?.term || 'first')
    setFPrice(row ? String(row.price) : '')
    setShowForm(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        name: fName,
        description: fDescription,
        grade: fGrade,
        branchId: fBranchId,
        groupId: fGroupId,
        academicScope: fScope,
        term: fTerm,
        price: fPrice,
        status: editing?.status || 'active',
      }
      const { assignment } = editing?.id
        ? await updateBooklet(editing.id, payload)
        : await createBooklet(payload)
      flash(
        editing
          ? `تم تعديل الملزمة وتحديث التعيينات (+${assignment.added} طالب)`
          : `تم إنشاء الملزمة وتعيينها لـ ${assignment.added} طالب تلقائياً`,
        'success'
      )
      setShowForm(false)
      setEditing(null)
      reload()
    } catch (err) {
      flash(err.message || 'فشل حفظ الملزمة', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async (row) => {
    setBusyId(row.id)
    try {
      const next = row.status === 'active' ? 'archived' : 'active'
      await setBookletStatus(row.id, next)
      if (next === 'active') {
        const res = await syncBookletAssignments(row.id)
        flash(`تم تفعيل الملزمة وتحديث التعيينات (+${res.added} طالب)`, 'success')
      } else {
        flash('تمت أرشفة الملزمة — لن تُعيَّن لطلاب جدد', 'success')
      }
      reload()
    } catch (err) {
      flash(err.message || 'فشل تغيير الحالة', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleSync = async (row) => {
    setBusyId(row.id)
    try {
      const res = await syncBookletAssignments(row.id)
      flash(`تمت المزامنة: +${res.added} تعيين جديد${res.removed ? `، حذف ${res.removed} غير مطابق` : ''}`, 'success')
      reload()
    } catch (err) {
      flash(err.message || 'فشلت المزامنة', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleConfirmedDelete = async () => {
    const row = deleteTarget
    setDeleteTarget(null)
    if (!row) return
    try {
      await deleteBooklet(row.id)
      flash('تم حذف الملزمة وجميع تعييناتها', 'success')
      reload()
    } catch (err) {
      flash(err.message || 'فشل الحذف', 'error')
    }
  }

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {/* Toolbar: filters + create */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: '200px' }}>
          <label style={labelStyle}>بحث</label>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم الملزمة..." className="cp-input" style={{ width: '100%' }} />
        </div>
        <div style={{ flex: 1, minWidth: '150px' }}>
          <label style={labelStyle}>المرحلة</label>
          {gradeOptions(filterGrade, setFilterGrade)}
        </div>
        <div style={{ flex: 1, minWidth: '140px' }}>
          <ScopeTermFilters scope={filterScope} term={filterTerm} onScope={setFilterScope} onTerm={setFilterTerm} />
        </div>
        <div style={{ flex: 1, minWidth: '130px' }}>
          <label style={labelStyle}>الحالة</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="cp-input" style={{ width: '100%' }}>
            <option value="">الكل</option>
            <option value="active">نشط</option>
            <option value="archived">مؤرشف</option>
          </select>
        </div>
        <button onClick={() => openForm()} className="cp-btn cp-btn-success" style={{ fontWeight: 'bold' }}>
          <i className="fas fa-plus" style={{ marginInlineEnd: 6 }} /> إنشاء ملزمة جديدة
        </button>
      </div>

      {/* Create / edit form */}
      {showForm && (
        <form onSubmit={handleSave} style={{ ...cardStyle, animation: 'cpFadeUp 0.2s ease' }}>
          <h4 style={{ margin: '0 0 16px', fontWeight: 'bold' }}>{editing ? 'تعديل ملزمة' : 'إنشاء ملزمة جديدة'}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>اسم الملزمة *</label>
              <input type="text" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="مثال: ملزمة الجبر" className="cp-input" style={{ width: '100%' }} required />
            </div>
            <div>
              <label style={labelStyle}>المرحلة الدراسية *</label>
              <select value={fGrade} onChange={(e) => { setFGrade(e.target.value); setFGroupId('') }} className="cp-input" style={{ width: '100%' }} required>
                <option value="">اختر المرحلة...</option>
                {GRADE_ORDER.map(g => <option key={g} value={g}>{GRADE_LABEL[g]}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>الفرع</label>
              {branchOptions(fBranchId, (v) => { setFBranchId(v); setFGroupId('') }, 'كل الفروع')}
            </div>
            <div>
              <label style={labelStyle}>المجموعة (اختياري)</label>
              {groupOptions(fGroupId, setFGroupId, { grade: fGrade, branchId: fBranchId, allLabel: 'كل المجموعات' })}
            </div>
            <div>
              <label style={labelStyle}>النطاق الأكاديمي *</label>
              <select value={fScope} onChange={(e) => setFScope(e.target.value)} className="cp-input" style={{ width: '100%' }}>
                <option value="year">{BOOKLET_SCOPE_LABEL.year}</option>
                <option value="term">{BOOKLET_SCOPE_LABEL.term}</option>
              </select>
            </div>
            {fScope === 'term' && (
              <div>
                <label style={labelStyle}>الترم *</label>
                <select value={fTerm} onChange={(e) => setFTerm(e.target.value)} className="cp-input" style={{ width: '100%' }} required>
                  <option value="first">{BOOKLET_TERM_LABEL.first}</option>
                  <option value="second">{BOOKLET_TERM_LABEL.second}</option>
                </select>
              </div>
            )}
            <div>
              <label style={labelStyle}>السعر (ج.م) *</label>
              <input type="number" min="0" step="0.01" value={fPrice} onChange={(e) => setFPrice(e.target.value)} className="cp-input" style={{ width: '100%' }} required />
            </div>
          </div>
          <label style={labelStyle}>الوصف (اختياري)</label>
          <input type="text" value={fDescription} onChange={(e) => setFDescription(e.target.value)} placeholder="وصف مختصر للملزمة..." className="cp-input" style={{ width: '100%', marginBottom: '14px' }} />
          <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.2)', fontSize: '0.83rem', marginBottom: '14px' }}>
            <i className="fas fa-wand-magic-sparkles" style={{ marginInlineEnd: 6, color: '#06b6d4' }} />
            عند الحفظ ستُعيَّن الملزمة تلقائياً لكل الطلاب المطابقين (حالة الدفع: غير مدفوع)، وسيحصل عليها أي طالب جديد مطابق تلقائياً.
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" disabled={saving} className="cp-btn cp-btn-success" style={{ fontWeight: 'bold' }}>
              {saving ? 'جاري الحفظ...' : 'حفظ وتعيين للطلاب'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null) }} className="cp-btn cp-btn-secondary">إلغاء</button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="cp-empty"><i className="fas fa-spinner fa-spin" /><p>جاري تحميل الملازم...</p></div>
      ) : booklets.length === 0 ? (
        <div className="cp-empty"><i className="fas fa-book" /><p>لا توجد ملازم مطابقة — أنشئ أول ملزمة من الزر أعلاه</p></div>
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: 'var(--cp-list-header-bg)', borderBottom: '1px solid var(--cp-divider)' }}>
                  <th style={thStyle}>الملزمة</th>
                  <th style={thStyle}>المرحلة</th>
                  <th style={thStyle}>الفرع</th>
                  <th style={thStyle}>المجموعة</th>
                  <th style={thStyle}>النطاق</th>
                  <th style={thStyle}>السعر</th>
                  <th style={thStyle}>الطلاب</th>
                  <th style={thStyle}>الحالة</th>
                  <th style={{ ...thStyle, width: '210px' }}></th>
                </tr>
              </thead>
              <tbody>
                {booklets.map(b => (
                  <tr key={b.id} style={{ borderBottom: '1px solid var(--cp-list-item-border)', opacity: b.status === 'active' ? 1 : 0.55 }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 700 }}>{b.name}</div>
                      {b.description && <div style={{ fontSize: '0.78rem', color: 'var(--cp-text-muted)', marginTop: 2 }}>{b.description}</div>}
                    </td>
                    <td style={tdStyle}>{GRADE_LABEL[b.grade] || b.grade}</td>
                    <td style={tdStyle}>{b.branches?.name || 'كل الفروع'}</td>
                    <td style={tdStyle}><span className="cp-id-pill">{b.groups?.name || 'كل المجموعات'}</span></td>
                    <td style={tdStyle}>
                      <span className="cp-id-pill" style={{ background: b.academic_scope === 'year' ? 'rgba(139, 92, 246, 0.12)' : 'rgba(6, 182, 212, 0.12)', color: b.academic_scope === 'year' ? '#8b5cf6' : '#0891b2' }}>
                        {bookletScopeLabel(b.academic_scope, b.term)}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 800, color: '#10b981' }}>{fmtMoney(b.price)}</td>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 700 }}>
                        <i className="fas fa-user-group" style={{ marginInlineEnd: 5, color: 'var(--cp-text-muted)', fontSize: '0.78rem' }} />
                        {b.student_booklets?.[0]?.count ?? 0}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={statusPill(b.status === 'active')}>
                        {b.status === 'active' ? 'نشط' : 'مؤرشف'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button onClick={() => openForm(b)} className="cp-btn cp-btn-secondary" style={{ padding: '4px 10px', fontSize: '0.76rem' }}>تعديل</button>
                        <button onClick={() => handleSync(b)} disabled={busyId === b.id} className="cp-btn cp-btn-info" style={{ padding: '4px 10px', fontSize: '0.76rem' }} title="إعادة تعيين الملزمة لكل الطلاب المطابقين">
                          {busyId === b.id ? '...' : 'مزامنة'}
                        </button>
                        <button onClick={() => handleToggleStatus(b)} disabled={busyId === b.id} className="cp-btn cp-btn-secondary" style={{ padding: '4px 10px', fontSize: '0.76rem' }}>
                          {b.status === 'active' ? 'أرشفة' : 'تفعيل'}
                        </button>
                        <button onClick={() => setDeleteTarget(b)} className="cp-btn" style={{ padding: '4px 10px', fontSize: '0.76rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}>حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDeleteDialog
          title="تأكيد حذف الملزمة"
          itemLabel={deleteTarget.name}
          message="سيتم حذف الملزمة وجميع تعييناتها للطلاب. سجلات المدفوعات السابقة تبقى محفوظة في سجل التدقيق والدفتر المالي."
          confirmText="نعم، احذف"
          cancelText="إلغاء"
          onConfirm={handleConfirmedDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════ 2) Booklet Payment ═══════════════════════════ */

function BookletPayment({ flash, gradeOptions, branchOptions, groupOptions }) {
  // Filters
  const [grade, setGrade] = useState('')
  const [branchId, setBranchId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [scope, setScope] = useState('')
  const [term, setTerm] = useState('')

  // Student search
  const [search, setSearch] = useState('')
  const [students, setStudents] = useState([])
  const [searching, setSearching] = useState(false)
  const [student, setStudent] = useState(null)

  // Assignments
  const [items, setItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [notes, setNotes] = useState('')
  const [paying, setPaying] = useState(false)
  const [revertTarget, setRevertTarget] = useState(null)

  // Debounced server-side student search with the shared filters.
  useEffect(() => {
    if (!search.trim() && !grade && !branchId && !groupId) { setStudents([]); return }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const { rows } = await listStudentsPaged({
          page: 0, pageSize: 25,
          grade: grade || 'all',
          branchId: branchId || 'all',
          groupId: groupId || 'all',
          search,
        })
        if (!cancelled) setStudents(rows)
      } catch (err) {
        if (!cancelled) flash('فشل البحث عن الطلاب: ' + (err.message || ''), 'error')
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [search, grade, branchId, groupId])

  const loadItems = useCallback(async (st = student) => {
    if (!st) return
    setItemsLoading(true)
    setSelected(new Set())
    try {
      setItems(await listStudentBooklets(st.id, { scope: scope || null, term: term || null }))
    } catch (err) {
      flash('فشل تحميل ملازم الطالب: ' + (err.message || ''), 'error')
    } finally {
      setItemsLoading(false)
    }
  }, [student, scope, term])

  useEffect(() => { if (student) loadItems() }, [student, scope, term])

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const unpaidItems = items.filter(i => i.payment_status === 'unpaid')
  const selectedTotal = items
    .filter(i => selected.has(i.id))
    .reduce((sum, i) => sum + Number(i.price || 0), 0)

  const handlePay = async () => {
    if (selected.size === 0) { flash('اختر ملزمة واحدة على الأقل', 'warning'); return }
    setPaying(true)
    try {
      const res = await markBookletsPaid([...selected], notes)
      if (res.updated > 0) {
        flash(`تم تسجيل دفع ${res.updated} ملزمة بإجمالي ${fmtMoney(res.total_amount)} 🎉`, 'success')
      } else {
        flash('لم يتم تحديث أي ملزمة — ربما تم دفعها بالفعل', 'warning')
      }
      setNotes('')
      loadItems()
    } catch (err) {
      flash(err.message || 'فشل تسجيل الدفع', 'error')
    } finally {
      setPaying(false)
    }
  }

  const handleConfirmedRevert = async () => {
    const row = revertTarget
    setRevertTarget(null)
    if (!row) return
    try {
      await revertBookletPayment(row.id)
      flash('تم إلغاء الدفع وإرجاع الملزمة لغير مدفوعة (مسجل في الدفتر)', 'success')
      loadItems()
    } catch (err) {
      flash(err.message || 'فشل إلغاء الدفع', 'error')
    }
  }

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {/* Filters */}
      <div style={cardStyle}>
        <h4 style={{ margin: '0 0 14px', fontWeight: 'bold' }}>
          <i className="fas fa-filter" style={{ marginInlineEnd: 6, color: '#06b6d4' }} /> تصفية ثم البحث عن الطالب
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px' }}>
          <div>
            <label style={labelStyle}>المرحلة الدراسية</label>
            {gradeOptions(grade, (v) => { setGrade(v); setGroupId(''); setStudent(null) })}
          </div>
          <div>
            <label style={labelStyle}>الفرع</label>
            {branchOptions(branchId, (v) => { setBranchId(v); setGroupId(''); setStudent(null) }, 'كل الفروع')}
          </div>
          <div>
            <label style={labelStyle}>المجموعة</label>
            {groupOptions(groupId, (v) => { setGroupId(v); setStudent(null) }, { grade, branchId, allLabel: 'كل المجموعات' })}
          </div>
          <ScopeTermFilters scope={scope} term={term} onScope={setScope} onTerm={setTerm} />
        </div>
        <div style={{ marginTop: '14px' }}>
          <label style={labelStyle}>بحث باسم الطالب</label>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setStudent(null) }}
            placeholder="اكتب اسم الطالب..."
            className="cp-input"
            style={{ width: '100%', maxWidth: '420px' }}
          />
        </div>
      </div>

      {/* Student results */}
      {!student && (
        searching ? (
          <div className="cp-empty"><i className="fas fa-spinner fa-spin" /><p>جاري البحث...</p></div>
        ) : students.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
            {students.map(s => (
              <button key={s.id} onClick={() => setStudent(s)} className="cp-target cp-target-student" style={{ padding: 12, borderRadius: 12, textAlign: 'start' }}>
                <div className="cp-avatar cp-avatar-purple">{initials(s.name)}</div>
                <div className="cp-target-body">
                  <div className="cp-target-name"><span>{s.name}</span></div>
                  <div className="cp-target-sub">
                    <span><i className="fas fa-graduation-cap"></i> {GRADE_LABEL[s.grade] || s.grade}</span>
                    {s.group && <span className="cp-id-pill">{s.group}</span>}
                  </div>
                </div>
                <i className="fas fa-arrow-left cp-target-arrow"></i>
              </button>
            ))}
          </div>
        ) : (search.trim() || grade || branchId || groupId) ? (
          <div className="cp-empty"><i className="fas fa-user-slash" /><p>لا يوجد طلاب مطابقون لهذا البحث</p></div>
        ) : (
          <div className="cp-empty"><i className="fas fa-magnifying-glass" /><p>حدد المرشحات أو اكتب اسم الطالب لعرض النتائج</p></div>
        )
      )}

      {/* Selected student + booklets */}
      {student && (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--cp-divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="cp-avatar cp-avatar-purple">{initials(student.name)}</div>
              <div>
                <div style={{ fontWeight: 800 }}>{student.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)' }}>
                  {GRADE_LABEL[student.grade] || student.grade}{student.group ? ` — ${student.group}` : ''}
                </div>
              </div>
            </div>
            <button onClick={() => setStudent(null)} className="cp-btn cp-btn-secondary" style={{ fontSize: '0.8rem' }}>
              <i className="fas fa-arrow-rotate-right" style={{ marginInlineEnd: 6 }} /> اختيار طالب آخر
            </button>
          </div>

          {itemsLoading ? (
            <div className="cp-empty"><i className="fas fa-spinner fa-spin" /><p>جاري تحميل الملازم...</p></div>
          ) : items.length === 0 ? (
            <div className="cp-empty"><i className="fas fa-book-open" /><p>لا توجد ملازم معيّنة لهذا الطالب ضمن النطاق المحدد</p></div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--cp-list-header-bg)', borderBottom: '1px solid var(--cp-divider)' }}>
                      <th style={{ ...thStyle, width: '44px' }}>
                        <input
                          type="checkbox"
                          checked={unpaidItems.length > 0 && unpaidItems.every(i => selected.has(i.id))}
                          onChange={(e) => setSelected(e.target.checked ? new Set(unpaidItems.map(i => i.id)) : new Set())}
                          title="تحديد كل غير المدفوع"
                        />
                      </th>
                      <th style={thStyle}>الملزمة</th>
                      <th style={thStyle}>النطاق</th>
                      <th style={thStyle}>السعر</th>
                      <th style={thStyle}>حالة الدفع</th>
                      <th style={thStyle}>تاريخ الدفع</th>
                      <th style={{ ...thStyle, width: '110px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(i => (
                      <tr key={i.id} style={{ borderBottom: '1px solid var(--cp-list-item-border)' }}>
                        <td style={tdStyle}>
                          {i.payment_status === 'unpaid' && (
                            <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} />
                          )}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 700 }}>{i.booklets?.name}</div>
                          {i.booklets?.description && <div style={{ fontSize: '0.76rem', color: 'var(--cp-text-muted)' }}>{i.booklets.description}</div>}
                        </td>
                        <td style={tdStyle}>
                          <span className="cp-id-pill">{bookletScopeLabel(i.booklets?.academic_scope, i.booklets?.term)}</span>
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 800, color: '#10b981' }}>{fmtMoney(i.price)}</td>
                        <td style={tdStyle}>
                          <span style={statusPill(i.payment_status === 'paid')}>
                            <i className={`fas ${i.payment_status === 'paid' ? 'fa-circle-check' : 'fa-hourglass-half'}`} />
                            {i.payment_status === 'paid' ? 'مدفوع' : 'غير مدفوع'}
                          </span>
                        </td>
                        <td style={tdStyle}>{fmtDate(i.payment_date)}</td>
                        <td style={tdStyle}>
                          {i.payment_status === 'paid' && (
                            <button onClick={() => setRevertTarget(i)} className="cp-btn" style={{ padding: '4px 10px', fontSize: '0.74rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                              إلغاء الدفع
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Payment footer */}
              <div style={{ padding: '14px 20px', borderTop: '1px solid var(--cp-divider)', display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '220px' }}>
                  <label style={labelStyle}>ملاحظات (اختياري)</label>
                  <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: دفع نقدي في السنتر" className="cp-input" style={{ width: '100%' }} />
                </div>
                <div style={{ fontWeight: 800, fontSize: '1rem', padding: '8px 14px', borderRadius: 10, background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  المحدد: {selected.size} ملزمة — <span style={{ color: '#10b981' }}>{fmtMoney(selectedTotal)}</span>
                </div>
                <button
                  onClick={handlePay}
                  disabled={paying || selected.size === 0}
                  className="cp-btn cp-btn-success"
                  style={{ fontWeight: 'bold', opacity: selected.size === 0 ? 0.55 : 1 }}
                >
                  {paying ? (
                    <><i className="fas fa-spinner fa-spin" style={{ marginInlineEnd: 6 }} /> جاري التسجيل...</>
                  ) : (
                    <><i className="fas fa-money-check-dollar" style={{ marginInlineEnd: 6 }} /> تسجيل الدفع</>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {revertTarget && (
        <ConfirmDeleteDialog
          title="إلغاء دفع ملزمة"
          itemLabel={revertTarget.booklets?.name || 'الملزمة'}
          message="ستعود الملزمة إلى حالة غير مدفوعة، مع تسجيل عملية عكسية في الدفتر المالي وسجل التدقيق. لا يتم حذف أي سجل."
          confirmText="نعم، ألغِ الدفع"
          cancelText="تراجع"
          onConfirm={handleConfirmedRevert}
          onCancel={() => setRevertTarget(null)}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════ 3) Booklet Reports ═══════════════════════════ */

const SORTS = {
  student: (a, b) => (a.student_name || '').localeCompare(b.student_name || '', 'ar'),
  booklet: (a, b) => (a.booklet_name || '').localeCompare(b.booklet_name || '', 'ar'),
  payment_date: (a, b) => new Date(a.payment_date || 0) - new Date(b.payment_date || 0),
  price: (a, b) => Number(a.price || 0) - Number(b.price || 0),
  status: (a, b) => (a.payment_status || '').localeCompare(b.payment_status || ''),
}

function BookletReports({ flash, gradeOptions, branchOptions, groupOptions }) {
  // Filters
  const [search, setSearch] = useState('')
  const [grade, setGrade] = useState('')
  const [branchId, setBranchId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [scope, setScope] = useState('')
  const [term, setTerm] = useState('')
  const [bookletId, setBookletId] = useState('')
  const [status, setStatus] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [bookletChoices, setBookletChoices] = useState([])
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  const [sortKey, setSortKey] = useState('student')
  const [sortDir, setSortDir] = useState(1)

  // Inline payment-status editing from the report: a student who paid late is
  // marked paid; a mistaken payment is reverted to unpaid. Both reuse the same
  // transactional, audit-logged RPCs as the payment screen.
  const [statusTarget, setStatusTarget] = useState(null) // the row being toggled
  const [busyId, setBusyId] = useState(null)

  // Booklet filter dropdown follows the stage/scope filters.
  useEffect(() => {
    listBooklets({ grade: grade || null, scope: scope || null, term: scope === 'term' ? (term || null) : null })
      .then(setBookletChoices)
      .catch(() => {})
  }, [grade, scope, term])

  const filters = { search, grade, branchId, groupId, scope, term, bookletId, status, from: fromDate || null, to: toDate || null }

  const runReport = useCallback(async () => {
    setLoading(true)
    try {
      setReport(await getBookletReport(filters))
    } catch (err) {
      flash('فشل تحميل التقرير: ' + (err.message || ''), 'error')
    } finally {
      setLoading(false)
    }
  }, [search, grade, branchId, groupId, scope, term, bookletId, status, fromDate, toDate])

  useEffect(() => {
    const t = setTimeout(runReport, search ? 400 : 0)
    return () => clearTimeout(t)
  }, [runReport])

  const rows = useMemo(() => {
    const list = [...(report?.rows || [])]
    list.sort((a, b) => sortDir * SORTS[sortKey](a, b))
    return list
  }, [report, sortKey, sortDir])

  const totals = report?.totals || { assigned: 0, paid: 0, unpaid: 0, paid_amount: 0, remaining_amount: 0 }

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(1) }
  }

  const sortIcon = (key) => sortKey !== key ? 'fa-sort' : sortDir === 1 ? 'fa-sort-up' : 'fa-sort-down'

  // Flip one assignment's payment status, then refresh the report + totals.
  const handleConfirmedToggle = async () => {
    const row = statusTarget
    setStatusTarget(null)
    if (!row) return
    setBusyId(row.id)
    try {
      if (row.payment_status === 'paid') {
        await revertBookletPayment(row.id)
        flash('تم إرجاع الملزمة إلى غير مدفوعة (مسجل في الدفتر وسجل التدقيق)', 'success')
      } else {
        const res = await markBookletsPaid([row.id])
        flash(res.updated > 0
          ? `تم تسجيل دفع الملزمة (${fmtMoney(row.price)}) 🎉`
          : 'لم يتغير شيء — ربما تم دفعها بالفعل', res.updated > 0 ? 'success' : 'warning')
      }
      await runReport()
    } catch (err) {
      flash(err.message || 'فشل تعديل حالة الدفع', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const exportRows = () => rows.map(r => [
    r.student_name,
    GRADE_LABEL[r.grade] || r.grade || '—',
    r.branch_name || '—',
    r.group_name || '—',
    r.booklet_name,
    r.academic_scope === 'year' ? BOOKLET_SCOPE_LABEL.year : BOOKLET_SCOPE_LABEL.term,
    r.term ? BOOKLET_TERM_LABEL[r.term] : '—',
    r.price,
    r.payment_status === 'paid' ? 'مدفوع' : 'غير مدفوع',
    r.payment_date ? fmtDate(r.payment_date) : '—',
  ])

  const exportCsv = () => {
    downloadCsv(
      `booklets-report-${new Date().toISOString().split('T')[0]}.csv`,
      ['الطالب', 'المرحلة', 'الفرع', 'المجموعة', 'الملزمة', 'النطاق', 'الترم', 'السعر', 'الحالة', 'تاريخ الدفع'],
      exportRows()
    )
  }

  // Printable (PDF-ready) report — same print-window pattern the finance
  // ledger uses; the user prints or saves as PDF from the dialog.
  const printReport = () => {
    const win = window.open('', '_blank')
    if (!win) { flash('اسمح بالنوافذ المنبثقة لطباعة التقرير', 'warning'); return }
    const rowsHtml = exportRows().map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        ${r.map((c, idx) => `<td${idx === 0 || idx === 4 ? ' style="text-align:right"' : ''}>${idx === 7 ? Number(c).toLocaleString('ar-EG') : c}</td>`).join('')}
      </tr>`).join('')
    win.document.write(`
      <html dir="rtl"><head><title>تقرير الملازم</title>
      <style>
        body { font-family: 'Tajawal', Arial, sans-serif; padding: 24px; color: #1e293b; }
        h1 { font-size: 20px; text-align: center; margin: 0 0 4px; }
        h2 { font-size: 13px; text-align: center; color: #64748b; margin: 0 0 20px; font-weight: normal; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: center; }
        th { background: #f8fafc; font-weight: bold; }
        .kpis { display:flex; gap: 10px; justify-content: space-between; margin-bottom: 16px; }
        .kpi { flex:1; padding: 10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius: 8px; text-align:center; font-size: 12px; }
        .kpi strong { display:block; font-size: 15px; margin-top: 4px; }
      </style></head>
      <body onload="window.print(); window.close();">
        <h1>تقرير رسوم الملازم</h1>
        <h2>${fromDate || toDate ? `الفترة: ${fromDate || '...'} — ${toDate || '...'}` : `حتى تاريخ ${new Date().toLocaleDateString('ar-EG')}`}</h2>
        <div class="kpis">
          <div class="kpi">إجمالي التعيينات<strong>${totals.assigned}</strong></div>
          <div class="kpi">مدفوع<strong style="color:#10b981">${totals.paid}</strong></div>
          <div class="kpi">غير مدفوع<strong style="color:#ef4444">${totals.unpaid}</strong></div>
          <div class="kpi">إجمالي المحصَّل<strong style="color:#10b981">${Number(totals.paid_amount).toLocaleString('ar-EG')} ج.م</strong></div>
          <div class="kpi">المتبقي<strong style="color:#ef4444">${Number(totals.remaining_amount).toLocaleString('ar-EG')} ج.م</strong></div>
        </div>
        <table>
          <thead><tr><th>#</th><th>الطالب</th><th>المرحلة</th><th>الفرع</th><th>المجموعة</th><th>الملزمة</th><th>النطاق</th><th>الترم</th><th>السعر</th><th>الحالة</th><th>تاريخ الدفع</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body></html>`)
    win.document.close()
  }

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {/* Filters */}
      <div style={cardStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '14px' }}>
          <div>
            <label style={labelStyle}>بحث باسم الطالب</label>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم الطالب..." className="cp-input" style={{ width: '100%' }} />
          </div>
          <div>
            <label style={labelStyle}>المرحلة</label>
            {gradeOptions(grade, (v) => { setGrade(v); setGroupId(''); setBookletId('') })}
          </div>
          <div>
            <label style={labelStyle}>الفرع</label>
            {branchOptions(branchId, (v) => { setBranchId(v); setGroupId('') }, 'كل الفروع')}
          </div>
          <div>
            <label style={labelStyle}>المجموعة</label>
            {groupOptions(groupId, setGroupId, { grade, branchId, allLabel: 'كل المجموعات' })}
          </div>
          <ScopeTermFilters scope={scope} term={term} onScope={(v) => { setScope(v); setBookletId('') }} onTerm={(v) => { setTerm(v); setBookletId('') }} />
          <div>
            <label style={labelStyle}>الملزمة</label>
            <select value={bookletId} onChange={(e) => setBookletId(e.target.value)} className="cp-input" style={{ width: '100%' }}>
              <option value="">كل الملازم</option>
              {bookletChoices.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>حالة الدفع</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="cp-input" style={{ width: '100%' }}>
              <option value="">الكل</option>
              <option value="paid">مدفوع</option>
              <option value="unpaid">غير مدفوع</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>من تاريخ (الدفع)</label>
            <DatePicker value={fromDate} onChange={setFromDate} placeholder="من" style={{ width: '100%' }} />
          </div>
          <div>
            <label style={labelStyle}>إلى تاريخ (الدفع)</label>
            <DatePicker value={toDate} onChange={setToDate} placeholder="إلى" style={{ width: '100%' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
          <button onClick={runReport} className="cp-btn cp-btn-info" style={{ fontWeight: 'bold' }}>
            <i className="fas fa-rotate" style={{ marginInlineEnd: 6 }} /> تحديث التقرير
          </button>
          <button onClick={exportCsv} disabled={rows.length === 0} className="cp-btn cp-btn-info" style={{ fontWeight: 'bold' }}>
            <i className="fas fa-file-excel" style={{ marginInlineEnd: 6 }} /> Excel (CSV)
          </button>
          <button onClick={printReport} disabled={rows.length === 0} className="cp-btn cp-btn-info" style={{ fontWeight: 'bold' }}>
            <i className="fas fa-print" style={{ marginInlineEnd: 6 }} /> طباعة / PDF
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="cp-home-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
        {[
          ['إجمالي التعيينات', totals.assigned, '#06b6d4', false],
          ['ملازم مدفوعة', totals.paid, '#10b981', false],
          ['ملازم غير مدفوعة', totals.unpaid, '#ef4444', false],
          ['إجمالي المحصَّل', totals.paid_amount, '#10b981', true],
          ['المبلغ المتبقي', totals.remaining_amount, '#f59e0b', true],
        ].map(([label, value, color, money]) => (
          <div key={label} style={{ ...cardStyle, padding: '16px', textAlign: 'center', borderTop: `4px solid ${color}` }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', fontWeight: 'bold' }}>{label}</span>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '8px', color }}>
              {money ? fmtMoney(value) : Number(value || 0).toLocaleString('ar-EG')}
            </div>
          </div>
        ))}
      </div>

      {/* Result table */}
      {loading ? (
        <div className="cp-empty"><i className="fas fa-spinner fa-spin" /><p>جاري إعداد التقرير...</p></div>
      ) : rows.length === 0 ? (
        <div className="cp-empty"><i className="fas fa-file-invoice" /><p>لا توجد نتائج مطابقة للمرشحات المحددة</p></div>
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--cp-divider)', fontSize: '0.85rem', fontWeight: 'bold' }}>
            {rows.length} نتيجة
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ background: 'var(--cp-list-header-bg)', borderBottom: '1px solid var(--cp-divider)' }}>
                  <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('student')}>الطالب <i className={`fas ${sortIcon('student')}`} /></th>
                  <th style={thStyle}>المرحلة</th>
                  <th style={thStyle}>الفرع</th>
                  <th style={thStyle}>المجموعة</th>
                  <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('booklet')}>الملزمة <i className={`fas ${sortIcon('booklet')}`} /></th>
                  <th style={thStyle}>النطاق</th>
                  <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('price')}>السعر <i className={`fas ${sortIcon('price')}`} /></th>
                  <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('status')}>الحالة <i className={`fas ${sortIcon('status')}`} /></th>
                  <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('payment_date')}>تاريخ الدفع <i className={`fas ${sortIcon('payment_date')}`} /></th>
                  <th style={{ ...thStyle, width: '130px' }}>تعديل الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--cp-list-item-border)' }}>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{r.student_name}</td>
                    <td style={tdStyle}>{GRADE_LABEL[r.grade] || r.grade || '—'}</td>
                    <td style={tdStyle}>{r.branch_name || '—'}</td>
                    <td style={tdStyle}><span className="cp-id-pill">{r.group_name || '—'}</span></td>
                    <td style={tdStyle}>{r.booklet_name}</td>
                    <td style={tdStyle}>
                      <span className="cp-id-pill" style={{ background: r.academic_scope === 'year' ? 'rgba(139, 92, 246, 0.12)' : 'rgba(6, 182, 212, 0.12)', color: r.academic_scope === 'year' ? '#8b5cf6' : '#0891b2' }}>
                        {bookletScopeLabel(r.academic_scope, r.term)}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 800, color: '#10b981' }}>{fmtMoney(r.price)}</td>
                    <td style={tdStyle}>
                      <span style={statusPill(r.payment_status === 'paid')}>
                        {r.payment_status === 'paid' ? 'مدفوع' : 'غير مدفوع'}
                      </span>
                    </td>
                    <td style={tdStyle}>{fmtDate(r.payment_date)}</td>
                    <td style={tdStyle}>
                      {r.payment_status === 'paid' ? (
                        <button
                          onClick={() => setStatusTarget(r)}
                          disabled={busyId === r.id}
                          className="cp-btn"
                          style={{ padding: '4px 10px', fontSize: '0.74rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                          title="إرجاع الملزمة إلى غير مدفوعة"
                        >
                          {busyId === r.id ? '...' : <><i className="fas fa-rotate-left" style={{ marginInlineEnd: 5 }} /> إلغاء الدفع</>}
                        </button>
                      ) : (
                        <button
                          onClick={() => setStatusTarget(r)}
                          disabled={busyId === r.id}
                          className="cp-btn cp-btn-success"
                          style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                          title="تسجيل أن الطالب دفع قيمة الملزمة"
                        >
                          {busyId === r.id ? '...' : <><i className="fas fa-check" style={{ marginInlineEnd: 5 }} /> تسجيل كدفع</>}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {statusTarget && (
        <ConfirmDeleteDialog
          title={statusTarget.payment_status === 'paid' ? 'إلغاء دفع ملزمة' : 'تسجيل دفع ملزمة'}
          itemLabel={`${statusTarget.student_name} — ${statusTarget.booklet_name} (${fmtMoney(statusTarget.price)})`}
          message={statusTarget.payment_status === 'paid'
            ? 'ستعود الملزمة إلى حالة غير مدفوعة، مع تسجيل عملية عكسية في الدفتر المالي وسجل التدقيق. لا يتم حذف أي سجل.'
            : 'سيتم تسجيل أن الطالب دفع قيمة الملزمة الآن، مع إضافة الإيراد للدفتر المالي وسجل التدقيق.'}
          confirmText={statusTarget.payment_status === 'paid' ? 'نعم، ألغِ الدفع' : 'نعم، سجّل الدفع'}
          cancelText="تراجع"
          onConfirm={handleConfirmedToggle}
          onCancel={() => setStatusTarget(null)}
        />
      )}
    </div>
  )
}
