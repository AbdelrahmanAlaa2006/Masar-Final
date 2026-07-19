import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@backend/supabase'
import {
  getBizDashboard, postDueRecurring, getBizBilling, getBizKpis, getBizOperations,
  listBizTransactions, addBizTransaction, updateBizTransaction, voidBizTransaction, confirmBizTransaction,
  listBizAccounts, saveBizAccount, listBizCategories, saveBizCategory,
  listBizContracts, saveBizContract,
  listBizRecurring, saveBizRecurring, deleteBizRecurring,
} from '@backend/bizFinanceApi'
import DatePicker from '../../components/DatePicker'

/* ---------------------------------------------------------------------------
   BusinessPanel — the platform owner's Business Management System.
   SUPER ADMIN ONLY (UI gate here; the real gate is biz_* RLS + guarded RPCs
   — a forged client cannot read a single row).

   One tab = one aggregated RPC = one round trip. Charts are dependency-free
   inline SVG. Money is always ledger-derived; nothing here stores balances.
   --------------------------------------------------------------------------- */

const fmtMoney = (n) => `${Number(n || 0).toLocaleString('en-US')} ج.م`
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
const todayIso = () => new Date().toISOString().split('T')[0]
const monthStartIso = () => todayIso().slice(0, 8) + '01'
const yearStartIso = () => todayIso().slice(0, 5) + '01-01'
const fmtBytes = (b) => {
  const n = Number(b || 0)
  if (n > 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`
  return `${(n / 1024 ** 2).toFixed(1)} MB`
}
const MONTH_AR = { '01': 'يناير', '02': 'فبراير', '03': 'مارس', '04': 'أبريل', '05': 'مايو', '06': 'يونيو', '07': 'يوليو', '08': 'أغسطس', '09': 'سبتمبر', '10': 'أكتوبر', '11': 'نوفمبر', '12': 'ديسمبر' }
const monthLabel = (ym) => ym ? `${MONTH_AR[ym.slice(5, 7)] || ''} ${ym.slice(0, 4)}` : ''

const CONTRACT_TYPES = [
  { value: 'fixed_yearly', label: 'سنوي ثابت' },
  { value: 'upfront', label: 'دفعة مقدمة' },
  { value: 'per_student_monthly', label: 'شهري لكل طالب' },
  { value: 'hybrid', label: 'هجين (مقدم + شهري)' },
]
const CONTRACT_TYPE_LABEL = Object.fromEntries(CONTRACT_TYPES.map(t => [t.value, t.label]))
const CONTRACT_STATUS = { draft: 'مسودة', active: 'نشط', suspended: 'موقوف', ended: 'منتهي' }
const CADENCE_LABEL = { monthly: 'شهري', quarterly: 'ربع سنوي', yearly: 'سنوي' }
const TX_STATUS = { confirmed: 'مؤكدة', pending: 'متوقعة', void: 'ملغاة' }

const cardStyle = { background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '20px', boxShadow: 'var(--cp-card-shadow)' }
const labelStyle = { display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }

const csvDownload = (filename, headers, rows) => {
  const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`
  const content = '﻿' + [headers.map(cell).join(','), ...rows.map(r => r.map(cell).join(','))].join('\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const printTable = (title, subtitle, headers, rows) => {
  const w = window.open('', '_blank', 'width=1000,height=700')
  if (!w) return
  w.document.write(`
    <html dir="rtl"><head><title>${title}</title>
    <style>
      body { font-family: 'Tajawal', Arial, sans-serif; padding: 24px; color: #111; }
      h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 14px; color: #555; margin: 0 0 18px; font-weight: normal; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ccc; padding: 7px 9px; text-align: right; }
      th { background: #f1f5f9; }
      @media print { button { display: none } }
    </style></head><body>
    <h1>${title}</h1><h2>${subtitle}</h2>
    <table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c == null ? '—' : c}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <script>window.onload = () => setTimeout(() => window.print(), 250)</script>
    </body></html>`)
  w.document.close()
}

/* ── Tiny dependency-free charts ─────────────────────────────────────────── */

function StatCard({ label, value, color, icon, sub }) {
  return (
    <div style={{
      padding: '16px 20px', borderRadius: '14px',
      background: `color-mix(in srgb, ${color} 9%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
      display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0,
    }}>
      <div style={{ width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0, background: `color-mix(in srgb, ${color} 18%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <i className={`fas ${icon}`} style={{ color, fontSize: '1.05rem' }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--cp-text-muted)', display: 'block', fontWeight: 700 }}>{label}</span>
        <span style={{ color, fontSize: '1.25rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{value}</span>
        {sub && <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--cp-text-muted)' }}>{sub}</span>}
      </div>
    </div>
  )
}

// Grouped monthly bars (revenue vs expenses) with hover tooltips.
function MonthlyChart({ series }) {
  const data = series || []
  if (data.length === 0) {
    return <div style={{ textAlign: 'center', color: 'var(--cp-text-muted)', padding: '2rem 0' }}>لا توجد بيانات شهرية بعد</div>
  }
  const W = 760, H = 240, PAD = 8, LBL = 22
  const max = Math.max(1, ...data.map(m => Math.max(Number(m.revenue || 0), Number(m.expenses || 0))))
  const groupW = (W - PAD * 2) / data.length
  const barW = Math.min(26, groupW * 0.32)
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H + LBL}`} style={{ width: '100%', minWidth: 480, direction: 'ltr' }}>
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={PAD} x2={W - PAD} y1={H - H * f} y2={H - H * f} stroke="var(--cp-divider, #333)" strokeDasharray="4 5" strokeWidth="0.6" />
        ))}
        {data.map((m, i) => {
          const cx = PAD + groupW * i + groupW / 2
          const rh = (Number(m.revenue || 0) / max) * (H - 12)
          const eh = (Number(m.expenses || 0) / max) * (H - 12)
          return (
            <g key={m.month}>
              <rect x={cx - barW - 2} y={H - rh} width={barW} height={Math.max(rh, 1)} rx="4" fill="#10b981">
                <title>{`${monthLabel(m.month)} — إيرادات: ${fmtMoney(m.revenue)}`}</title>
              </rect>
              <rect x={cx + 2} y={H - eh} width={barW} height={Math.max(eh, 1)} rx="4" fill="#ef4444">
                <title>{`${monthLabel(m.month)} — مصروفات: ${fmtMoney(m.expenses)}`}</title>
              </rect>
              <text x={cx} y={H + 15} textAnchor="middle" fontSize="10" fill="var(--cp-text-muted, #94a3b8)">{m.month.slice(5)}/{m.month.slice(2, 4)}</text>
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700 }}>
        <span><i className="fas fa-square" style={{ color: '#10b981', marginInlineEnd: 5 }} />الإيرادات</span>
        <span><i className="fas fa-square" style={{ color: '#ef4444', marginInlineEnd: 5 }} />المصروفات</span>
      </div>
    </div>
  )
}

// Horizontal proportional breakdown bars.
function HBarList({ items, color = '#3b82f6', empty = 'لا توجد بيانات' }) {
  const list = items || []
  if (list.length === 0) return <div style={{ color: 'var(--cp-text-muted)', fontSize: '0.85rem', padding: '1rem 0', textAlign: 'center' }}>{empty}</div>
  const max = Math.max(1, ...list.map(i => Number(i.total || 0)))
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {list.map((it, idx) => (
        <div key={idx}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 700, marginBottom: 4 }}>
            <span>{it.name || it.category || it.tenant_name}</span>
            <span style={{ color }}>{fmtMoney(it.total)}</span>
          </div>
          <div style={{ height: 8, borderRadius: 6, background: 'color-mix(in srgb, currentColor 8%, transparent)' }}>
            <div style={{ height: '100%', width: `${(Number(it.total || 0) / max) * 100}%`, borderRadius: 6, background: color }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Main panel ──────────────────────────────────────────────────────────── */

export default function BusinessPanel({ flash }) {
  const [tab, setTab] = useState('overview')

  // Shared lookups (loaded once)
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [tenants, setTenants] = useState([])

  // Range filter shared by overview/costs/reports
  const [rangePreset, setRangePreset] = useState('year')
  const [fromDate, setFromDate] = useState(yearStartIso())
  const [toDate, setToDate] = useState(todayIso())

  // Per-tab data (each = ONE rpc)
  const [dash, setDash] = useState(null)
  const [dashLoading, setDashLoading] = useState(false)
  const [dueManual, setDueManual] = useState([])
  const [billing, setBilling] = useState(null)
  const [kpis, setKpis] = useState(null)
  const [ops, setOps] = useState(null)
  const [contracts, setContracts] = useState(null)
  const [recurring, setRecurring] = useState(null)

  // Ledger tab
  const [ledger, setLedger] = useState({ rows: [], total: 0 })
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerPage, setLedgerPage] = useState(1)
  const [ledgerFilters, setLedgerFilters] = useState({ direction: '', categoryId: '', tenantId: '', status: '' })

  // Modals
  const [txForm, setTxForm] = useState(null)       // {} for new | row for edit
  const [contractForm, setContractForm] = useState(null)
  const [recForm, setRecForm] = useState(null)
  const [showCatManager, setShowCatManager] = useState(false)
  const [newCat, setNewCat] = useState({ name: '', kind: 'expense' })
  const [newAccount, setNewAccount] = useState('')
  const [saving, setSaving] = useState(false)

  const applyPreset = (p) => {
    setRangePreset(p)
    if (p === 'month') { setFromDate(monthStartIso()); setToDate(todayIso()) }
    else if (p === '3m') {
      const d = new Date(); d.setMonth(d.getMonth() - 2);
      setFromDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`); setToDate(todayIso())
    }
    else if (p === 'year') { setFromDate(yearStartIso()); setToDate(todayIso()) }
  }

  // Lookups once
  useEffect(() => {
    listBizAccounts().then(setAccounts).catch(() => {})
    listBizCategories().then(setCategories).catch(() => {})
    supabase.from('tenants').select('id, name, slug').order('name')
      .then(({ data }) => setTenants(data || []))
  }, [])

  const reloadDash = useCallback(async () => {
    setDashLoading(true)
    try {
      // Materialize due recurring templates first, then read the dashboard —
      // exactly two round trips per visit.
      const posted = await postDueRecurring().catch(() => null)
      if (posted?.due_manual) setDueManual(posted.due_manual)
      if (posted?.posted > 0) flash?.(`تم تسجيل ${posted.posted} مصروف دوري مستحق تلقائياً`, 'success')
      setDash(await getBizDashboard(fromDate, toDate))
    } catch (err) {
      console.error(err)
      flash?.('فشل تحميل لوحة الأعمال: ' + (err.message || ''), 'error')
    } finally { setDashLoading(false) }
  }, [fromDate, toDate])

  useEffect(() => {
    if (tab === 'overview' || tab === 'costs') reloadDash()
  }, [tab, reloadDash])

  const reloadLedger = useCallback(async () => {
    setLedgerLoading(true)
    try {
      setLedger(await listBizTransactions({
        from: fromDate, to: toDate, page: ledgerPage, limit: 25,
        direction: ledgerFilters.direction || undefined,
        categoryId: ledgerFilters.categoryId || undefined,
        tenantId: ledgerFilters.tenantId || undefined,
        status: ledgerFilters.status || undefined,
      }))
    } catch (err) { flash?.('فشل تحميل السجل: ' + (err.message || ''), 'error') }
    finally { setLedgerLoading(false) }
  }, [fromDate, toDate, ledgerPage, ledgerFilters])

  useEffect(() => { if (tab === 'ledger') reloadLedger() }, [tab, reloadLedger])

  useEffect(() => {
    if (tab === 'contracts' && contracts === null) {
      Promise.all([listBizContracts(), getBizBilling()])
        .then(([c, b]) => { setContracts(c); setBilling(b) })
        .catch((e) => flash?.('فشل تحميل العقود: ' + (e.message || ''), 'error'))
      listBizRecurring({ includeInactive: true }).then(setRecurring).catch(() => {})
    }
    if (tab === 'billing' && billing === null) {
      getBizBilling().then(setBilling).catch((e) => flash?.('فشل تحميل الفوترة: ' + (e.message || ''), 'error'))
    }
    if (tab === 'kpis' && kpis === null) {
      getBizKpis().then(setKpis).catch((e) => flash?.('فشل تحميل المؤشرات: ' + (e.message || ''), 'error'))
    }
    if (tab === 'operations' && ops === null) {
      getBizOperations().then(setOps).catch((e) => flash?.('فشل تحميل التشغيل: ' + (e.message || ''), 'error'))
    }
  }, [tab])

  const collectedByContract = useMemo(() => {
    const m = new Map()
    for (const r of billing?.rows || []) m.set(r.id, r)
    return m
  }, [billing])

  /* ── Actions ── */

  const submitTx = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const f = txForm
      const payload = {
        occurredOn: f.occurred_on, direction: f.direction, amount: Number(f.amount),
        categoryId: f.category_id || null, accountId: f.account_id || null,
        tenantId: f.tenant_id || null, contractId: f.contract_id || null,
        status: f.status || 'confirmed', description: f.description || '',
        counterparty: f.counterparty || null, notes: f.notes || null,
      }
      if (f.id) await updateBizTransaction(f.id, {
        occurred_on: payload.occurredOn, direction: payload.direction, amount: payload.amount,
        category_id: payload.categoryId, account_id: payload.accountId, tenant_id: payload.tenantId,
        status: payload.status, description: payload.description, counterparty: payload.counterparty, notes: payload.notes,
      })
      else await addBizTransaction(payload)
      flash?.(f.id ? 'تم تحديث المعاملة' : 'تم تسجيل المعاملة', 'success')
      setTxForm(null)
      reloadLedger(); setDash(null); setBilling(null)
      if (tab === 'overview' || tab === 'costs') reloadDash()
    } catch (err) { flash?.('فشل الحفظ: ' + (err.message || ''), 'error') }
    finally { setSaving(false) }
  }

  const submitContract = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const f = contractForm
      const terms = {}
      if (f.yearly_amount) terms.yearly_amount = Number(f.yearly_amount)
      if (f.upfront_amount) terms.upfront_amount = Number(f.upfront_amount)
      if (f.monthly_per_student) terms.monthly_per_student = Number(f.monthly_per_student)
      if (f.expected_students) terms.expected_students = Number(f.expected_students)
      if (f.expected_total) terms.expected_total = Number(f.expected_total)
      await saveBizContract({
        id: f.id, tenantId: f.tenant_id || null, counterparty: f.counterparty,
        title: f.title || '', contractType: f.contract_type, status: f.status,
        startDate: f.start_date, endDate: f.end_date || null, terms, notes: f.notes || null,
      })
      flash?.('تم حفظ العقد', 'success')
      setContractForm(null); setContracts(null); setBilling(null); setTab('contracts')
      const [c, b] = await Promise.all([listBizContracts(), getBizBilling()])
      setContracts(c); setBilling(b)
    } catch (err) { flash?.('فشل حفظ العقد: ' + (err.message || ''), 'error') }
    finally { setSaving(false) }
  }

  const submitRecurring = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const f = recForm
      await saveBizRecurring({
        id: f.id, name: f.name, direction: f.direction || 'out', amount: Number(f.amount),
        categoryId: f.category_id || null, accountId: f.account_id || null,
        counterparty: f.counterparty || null, cadence: f.cadence, nextDueOn: f.next_due_on,
        autoPost: !!f.auto_post, isActive: f.is_active !== false, notes: f.notes || null,
      })
      flash?.('تم حفظ المصروف الدوري', 'success')
      setRecForm(null)
      listBizRecurring({ includeInactive: true }).then(setRecurring)
    } catch (err) { flash?.('فشل الحفظ: ' + (err.message || ''), 'error') }
    finally { setSaving(false) }
  }

  const exportReport = async (type, format) => {
    try {
      let title = '', headers = [], rows = []
      if (type === 'pnl') {
        const d = dash || await getBizDashboard(fromDate, toDate)
        title = 'تقرير الأرباح والخسائر الشهري'
        headers = ['الشهر', 'الإيرادات', 'المصروفات', 'الصافي']
        rows = (d.monthly || []).map(m => [monthLabel(m.month), m.revenue, m.expenses, m.net])
      } else if (type === 'revenue' || type === 'expenses') {
        const { rows: txs } = await listBizTransactions({ from: fromDate, to: toDate, direction: type === 'revenue' ? 'in' : 'out', limit: 1000 })
        title = type === 'revenue' ? 'تقرير الإيرادات' : 'تقرير المصروفات'
        headers = ['التاريخ', 'البيان', 'التصنيف', 'الطرف', 'القيمة', 'الحالة']
        rows = txs.map(t => [fmtDate(t.occurred_on), t.description, t.category?.name || '—', t.counterparty || t.tenant?.name || '—', t.amount, TX_STATUS[t.status] || t.status])
      } else if (type === 'teachers') {
        const d = dash || await getBizDashboard(fromDate, toDate)
        title = 'تقرير إيرادات المعلمين'
        headers = ['المعلم / المنصة', 'الإيراد']
        rows = (d.revenue_by_tenant || []).map(r => [r.tenant_name, r.total])
      } else if (type === 'billing') {
        const b = billing || await getBizBilling()
        title = 'تقرير الاشتراكات والفوترة'
        headers = ['المعلم', 'نوع العقد', 'المتوقع', 'المحصل', 'المتبقي', 'آخر دفعة', 'متأخر؟']
        rows = (b.rows || []).map(r => [r.tenant_name || r.counterparty, CONTRACT_TYPE_LABEL[r.contract_type] || r.contract_type, r.expected, r.collected, r.remaining, fmtDate(r.last_payment_on), r.overdue ? 'نعم' : 'لا'])
      } else if (type === 'cashflow') {
        const { rows: txs } = await listBizTransactions({ from: fromDate, to: toDate, limit: 1000 })
        title = 'تقرير التدفق النقدي'
        headers = ['التاريخ', 'البيان', 'وارد', 'منصرف', 'الحساب']
        rows = txs.filter(t => t.status === 'confirmed').map(t => [fmtDate(t.occurred_on), t.description, t.direction === 'in' ? t.amount : '', t.direction === 'out' ? t.amount : '', t.account?.name || '—'])
      }
      const subtitle = `من ${fmtDate(fromDate)} إلى ${fmtDate(toDate)}`
      if (format === 'csv' || format === 'excel') csvDownload(`biz-${type}-${todayIso()}.csv`, headers, rows)
      else printTable(title, subtitle, headers, rows)
    } catch (err) { flash?.('فشل إنشاء التقرير: ' + (err.message || ''), 'error') }
  }

  /* ── Render helpers ── */

  const rangeBar = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {[['month', 'هذا الشهر'], ['3m', 'آخر 3 أشهر'], ['year', 'هذه السنة'], ['custom', 'مخصص']].map(([k, l]) => (
        <button key={k} onClick={() => applyPreset(k)}
          className={`cp-btn ${rangePreset === k ? 'cp-btn-info' : 'cp-btn-secondary'}`}
          style={{ padding: '7px 14px', fontSize: '0.82rem', fontWeight: 700 }}>{l}</button>
      ))}
      {rangePreset === 'custom' && (
        <>
          <DatePicker value={fromDate} onChange={(v) => setFromDate(v || yearStartIso())} placeholder="من" />
          <DatePicker value={toDate} onChange={(v) => setToDate(v || todayIso())} placeholder="إلى" />
        </>
      )}
    </div>
  )

  const revCats = (dash?.by_category || []).filter(c => c.direction === 'in')
  const expCats = (dash?.by_category || []).filter(c => c.direction === 'out')
  const cashTotal = (dash?.accounts || []).reduce((s, a) => s + Number(a.balance || 0), 0)

  const TABS = [
    ['overview', 'نظرة عامة', 'fa-chart-pie'],
    ['ledger', 'السجل المالي', 'fa-book'],
    ['contracts', 'العقود', 'fa-file-signature'],
    ['billing', 'الفوترة والاشتراكات', 'fa-file-invoice-dollar'],
    ['kpis', 'مؤشرات الأداء', 'fa-gauge-high'],
    ['costs', 'تحليل التكاليف', 'fa-money-bill-trend-up'],
    ['operations', 'التشغيل', 'fa-server'],
    ['reports', 'التقارير', 'fa-file-export'],
  ]

  return (
    <div>
      {/* Tabs */}
      <div className="cp-subtabs" style={{ display: 'flex', gap: 8, margin: '0 0 22px', borderBottom: '1px solid var(--cp-divider)', paddingBottom: 12, flexWrap: 'wrap' }}>
        {TABS.map(([k, l, icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`cp-btn ${tab === k ? 'cp-btn-info' : 'cp-btn-secondary'}`}
            style={{ padding: '8px 14px', fontSize: '0.84rem', fontWeight: 700 }}>
            <i className={`fas ${icon}`} style={{ marginLeft: 6 }} />{l}
          </button>
        ))}
      </div>

      {/* ═══ Overview ═══ */}
      {tab === 'overview' && (
        dashLoading || !dash ? (
          <div className="cp-empty"><i className="fas fa-spinner fa-spin" /><p>جاري تحميل لوحة الأعمال...</p></div>
        ) : (
          <div style={{ display: 'grid', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {rangeBar}
              <button onClick={() => setTxForm({ occurred_on: todayIso(), direction: 'in', status: 'confirmed' })} className="cp-btn cp-btn-success" style={{ padding: '8px 16px', fontWeight: 700 }}>
                <i className="fas fa-plus" style={{ marginLeft: 6 }} /> تسجيل معاملة
              </button>
            </div>

            {dueManual.length > 0 && (
              <div style={{ ...cardStyle, borderColor: 'rgba(245, 158, 11, 0.4)', background: 'rgba(245, 158, 11, 0.06)' }}>
                <strong style={{ color: '#f59e0b' }}><i className="fas fa-bell" style={{ marginLeft: 6 }} />مصروفات دورية مستحقة تحتاج تأكيداً يدوياً:</strong>
                <span style={{ marginInlineStart: 8, fontSize: '0.88rem' }}>
                  {dueManual.map(d => `${d.name} (${fmtMoney(d.amount)})`).join('، ')}
                </span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
              <StatCard label="الإيرادات" value={fmtMoney(dash.totals?.revenue)} color="#10b981" icon="fa-arrow-trend-up" />
              <StatCard label="المصروفات" value={fmtMoney(dash.totals?.expenses)} color="#ef4444" icon="fa-arrow-trend-down" />
              <StatCard label="صافي الربح" value={fmtMoney(dash.totals?.net)} color={Number(dash.totals?.net) >= 0 ? '#3b82f6' : '#ef4444'} icon="fa-scale-balanced" />
              <StatCard label="الرصيد النقدي" value={fmtMoney(cashTotal)} color="#f59e0b" icon="fa-sack-dollar" sub="من واقع السجل — كل الحسابات" />
              <StatCard label="مبالغ متوقعة" value={fmtMoney(dash.pending?.expected_in)} color="#8b5cf6" icon="fa-hourglass-half" sub="معاملات معلقة داخل الفترة" />
            </div>

            <div style={{ ...cardStyle }}>
              <h3 style={{ margin: '0 0 14px', fontSize: '1.05rem', fontWeight: 800 }}><i className="fas fa-chart-column" style={{ color: '#3b82f6', marginLeft: 8 }} />الأداء الشهري (إيرادات × مصروفات)</h3>
              <MonthlyChart series={dash.monthly} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 20 }}>
              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 800, color: '#10b981' }}>الإيرادات حسب التصنيف</h3>
                <HBarList items={revCats.map(c => ({ name: c.category, total: c.total }))} color="#10b981" />
              </div>
              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 800, color: '#ef4444' }}>المصروفات حسب التصنيف</h3>
                <HBarList items={expCats.map(c => ({ name: c.category, total: c.total }))} color="#ef4444" />
              </div>
              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 800, color: '#3b82f6' }}>الإيرادات حسب المعلم</h3>
                <HBarList items={(dash.revenue_by_tenant || []).map(r => ({ name: r.tenant_name, total: r.total }))} color="#3b82f6" />
              </div>
              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 800, color: '#f59e0b' }}>أرصدة الحسابات</h3>
                <HBarList items={(dash.accounts || []).map(a => ({ name: a.name, total: a.balance }))} color="#f59e0b" empty="أضف حساباً من السجل المالي" />
              </div>
            </div>
          </div>
        )
      )}

      {/* ═══ Ledger ═══ */}
      {tab === 'ledger' && (
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            {rangeBar}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setShowCatManager(true)} className="cp-btn cp-btn-secondary" style={{ padding: '8px 14px', fontWeight: 700 }}>
                <i className="fas fa-tags" style={{ marginLeft: 6 }} />التصنيفات والحسابات
              </button>
              <button onClick={() => setTxForm({ occurred_on: todayIso(), direction: 'out', status: 'confirmed' })} className="cp-btn cp-btn-success" style={{ padding: '8px 16px', fontWeight: 700 }}>
                <i className="fas fa-plus" style={{ marginLeft: 6 }} />تسجيل معاملة
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <div>
              <label style={labelStyle}>الاتجاه</label>
              <select className="cp-input" value={ledgerFilters.direction} onChange={(e) => { setLedgerPage(1); setLedgerFilters(f => ({ ...f, direction: e.target.value })) }} style={{ width: '100%' }}>
                <option value="">الكل</option><option value="in">وارد</option><option value="out">منصرف</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>التصنيف</label>
              <select className="cp-input" value={ledgerFilters.categoryId} onChange={(e) => { setLedgerPage(1); setLedgerFilters(f => ({ ...f, categoryId: e.target.value })) }} style={{ width: '100%' }}>
                <option value="">الكل</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.kind === 'revenue' ? '↑ ' : '↓ '}{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>المعلم / المنصة</label>
              <select className="cp-input" value={ledgerFilters.tenantId} onChange={(e) => { setLedgerPage(1); setLedgerFilters(f => ({ ...f, tenantId: e.target.value })) }} style={{ width: '100%' }}>
                <option value="">الكل</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>الحالة</label>
              <select className="cp-input" value={ledgerFilters.status} onChange={(e) => { setLedgerPage(1); setLedgerFilters(f => ({ ...f, status: e.target.value })) }} style={{ width: '100%' }}>
                <option value="">الكل (عدا الملغاة)</option>
                <option value="confirmed">مؤكدة</option><option value="pending">متوقعة</option><option value="void">ملغاة</option>
              </select>
            </div>
          </div>

          <div className="cp-table-card" style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            {ledgerLoading ? (
              <div className="cp-empty"><i className="fas fa-spinner fa-spin" /><p>جاري التحميل...</p></div>
            ) : ledger.rows.length === 0 ? (
              <div className="cp-empty"><i className="fas fa-book-open" /><p>لا توجد معاملات مطابقة</p></div>
            ) : (
              <div className="cp-table-container" style={{ overflowX: 'auto' }}>
                <table className="cp-table" style={{ width: '100%' }}>
                  <thead><tr>
                    <th>التاريخ</th><th>البيان</th><th>التصنيف</th><th>الطرف</th><th>وارد</th><th>منصرف</th><th>الحالة</th><th></th>
                  </tr></thead>
                  <tbody>
                    {ledger.rows.map(t => (
                      <tr key={t.id} style={{ opacity: t.status === 'void' ? 0.45 : 1 }}>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.occurred_on)}</td>
                        <td style={{ fontWeight: 700 }}>{t.description || '—'}</td>
                        <td><span className="cp-id-pill">{t.category?.name || '—'}</span></td>
                        <td>{t.tenant?.name || t.counterparty || '—'}</td>
                        <td style={{ color: '#10b981', fontWeight: 700 }}>{t.direction === 'in' ? fmtMoney(t.amount) : ''}</td>
                        <td style={{ color: '#ef4444', fontWeight: 700 }}>{t.direction === 'out' ? fmtMoney(t.amount) : ''}</td>
                        <td>
                          <span className={`cp-badge cp-badge-${t.status === 'confirmed' ? 'success' : t.status === 'pending' ? 'warning' : 'danger'}`}>
                            {TX_STATUS[t.status] || t.status}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            {t.status === 'pending' && (
                              <button onClick={async () => { await confirmBizTransaction(t.id); reloadLedger(); setDash(null) }} className="cp-btn cp-btn-success" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>تأكيد</button>
                            )}
                            <button onClick={() => setTxForm({ ...t, category_id: t.category?.id || '', account_id: t.account?.id || '', tenant_id: t.tenant?.id || '' })} className="cp-btn cp-btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>تعديل</button>
                            {t.status !== 'void' && (
                              <button onClick={async () => { if (window.confirm('إلغاء هذه المعاملة؟ ستبقى في السجل ولن تُحتسب في التقارير.')) { await voidBizTransaction(t.id); reloadLedger(); setDash(null) } }}
                                className="cp-btn" style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>إلغاء</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {ledger.total > 25 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, padding: 14, alignItems: 'center' }}>
                <button disabled={ledgerPage <= 1} onClick={() => setLedgerPage(p => p - 1)} className="cp-btn cp-btn-secondary" style={{ padding: '6px 12px' }}>السابق</button>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{ledgerPage} / {Math.ceil(ledger.total / 25)}</span>
                <button disabled={ledgerPage >= Math.ceil(ledger.total / 25)} onClick={() => setLedgerPage(p => p + 1)} className="cp-btn cp-btn-secondary" style={{ padding: '6px 12px' }}>التالي</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Contracts ═══ */}
      {tab === 'contracts' && (
        contracts === null ? (
          <div className="cp-empty"><i className="fas fa-spinner fa-spin" /><p>جاري تحميل العقود...</p></div>
        ) : (
          <div style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <h3 style={{ margin: 0, fontWeight: 800 }}>عقود المعلمين ({contracts.length})</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setRecForm({ direction: 'out', cadence: 'monthly', next_due_on: todayIso(), auto_post: true, is_active: true })} className="cp-btn cp-btn-secondary" style={{ padding: '8px 14px', fontWeight: 700 }}>
                  <i className="fas fa-rotate" style={{ marginLeft: 6 }} />مصروف دوري جديد
                </button>
                <button onClick={() => setContractForm({ contract_type: 'per_student_monthly', status: 'active', start_date: todayIso() })} className="cp-btn cp-btn-success" style={{ padding: '8px 16px', fontWeight: 700 }}>
                  <i className="fas fa-plus" style={{ marginLeft: 6 }} />عقد جديد
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {contracts.length === 0 && <div className="cp-empty" style={{ gridColumn: '1/-1' }}><i className="fas fa-file-signature" /><p>لا توجد عقود بعد — أنشئ أول عقد لمعلم</p></div>}
              {contracts.map(c => {
                const bill = collectedByContract.get(c.id)
                return (
                  <div key={c.id} style={cardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <strong style={{ fontSize: '1.02rem' }}>{c.tenant?.name || c.counterparty}</strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--cp-text-muted)' }}>{CONTRACT_TYPE_LABEL[c.contract_type] || c.contract_type} · منذ {fmtDate(c.start_date)}</div>
                      </div>
                      <span className={`cp-badge cp-badge-${c.status === 'active' ? 'success' : c.status === 'ended' ? 'danger' : 'warning'}`}>{CONTRACT_STATUS[c.status] || c.status}</span>
                    </div>
                    {bill && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: '0.8rem', fontWeight: 700, marginBottom: 12 }}>
                        <div>المتوقع<br /><span style={{ color: '#3b82f6' }}>{fmtMoney(bill.expected)}</span></div>
                        <div>المحصل<br /><span style={{ color: '#10b981' }}>{fmtMoney(bill.collected)}</span></div>
                        <div>المتبقي<br /><span style={{ color: bill.remaining > 0 ? '#ef4444' : 'var(--cp-text-muted)' }}>{fmtMoney(bill.remaining)}</span></div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setTxForm({ occurred_on: todayIso(), direction: 'in', status: 'confirmed', contract_id: c.id, tenant_id: c.tenant?.id || '', counterparty: c.counterparty, description: `دفعة عقد — ${c.tenant?.name || c.counterparty}`, category_id: categories.find(x => x.name === 'دفعات تعاقد')?.id || '' })}
                        className="cp-btn cp-btn-success" style={{ padding: '6px 12px', fontSize: '0.8rem', flex: 1 }}>تسجيل دفعة</button>
                      <button onClick={() => setContractForm({ ...c, tenant_id: c.tenant?.id || '', yearly_amount: c.terms?.yearly_amount || '', upfront_amount: c.terms?.upfront_amount || '', monthly_per_student: c.terms?.monthly_per_student || '', expected_students: c.terms?.expected_students || '', expected_total: c.terms?.expected_total || '' })}
                        className="cp-btn cp-btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>تعديل</button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Recurring templates */}
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--cp-divider)', fontWeight: 800 }}>
                <i className="fas fa-rotate" style={{ color: '#8b5cf6', marginLeft: 8 }} />المصروفات والاشتراكات الدورية (Supabase, Claude, نطاقات…)
              </div>
              {(recurring || []).length === 0 ? (
                <div className="cp-empty"><i className="fas fa-rotate" /><p>لا توجد بنود دورية بعد</p></div>
              ) : (
                <div className="cp-table-container" style={{ overflowX: 'auto' }}>
                  <table className="cp-table" style={{ width: '100%' }}>
                    <thead><tr><th>البند</th><th>القيمة</th><th>الدورية</th><th>الاستحقاق القادم</th><th>تلقائي؟</th><th>نشط؟</th><th></th></tr></thead>
                    <tbody>
                      {(recurring || []).map(r => (
                        <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.5 }}>
                          <td style={{ fontWeight: 700 }}>{r.name}<div style={{ fontSize: '0.72rem', color: 'var(--cp-text-muted)' }}>{r.category?.name || ''}</div></td>
                          <td style={{ fontWeight: 700, color: r.direction === 'out' ? '#ef4444' : '#10b981' }}>{fmtMoney(r.amount)}{r.original_amount ? <span style={{ fontSize: '0.72rem', color: 'var(--cp-text-muted)' }}> ({r.original_amount} {r.original_currency})</span> : null}</td>
                          <td>{CADENCE_LABEL[r.cadence]}</td>
                          <td>{fmtDate(r.next_due_on)}</td>
                          <td>{r.auto_post ? '✅' : '—'}</td>
                          <td>{r.is_active ? '✅' : '⏸️'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button onClick={() => setRecForm({ ...r, category_id: r.category?.id || '', account_id: r.account?.id || '' })} className="cp-btn cp-btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>تعديل</button>
                              <button onClick={async () => { if (window.confirm('حذف هذا البند الدوري؟ المعاملات المسجلة منه تبقى في السجل.')) { await deleteBizRecurring(r.id); listBizRecurring({ includeInactive: true }).then(setRecurring) } }}
                                className="cp-btn" style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>حذف</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* ═══ Billing ═══ */}
      {tab === 'billing' && (
        billing === null ? (
          <div className="cp-empty"><i className="fas fa-spinner fa-spin" /><p>جاري تحميل مركز الفوترة...</p></div>
        ) : (
          <div style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
              <StatCard label="إجمالي المتوقع" value={fmtMoney(billing.summary?.expected_total)} color="#3b82f6" icon="fa-file-invoice-dollar" />
              <StatCard label="إجمالي المحصل" value={fmtMoney(billing.summary?.collected_total)} color="#10b981" icon="fa-circle-check" />
              <StatCard label="إجمالي المتبقي" value={fmtMoney(billing.summary?.remaining_total)} color="#ef4444" icon="fa-hand-holding-dollar" />
              <StatCard label="اشتراكات متأخرة" value={billing.summary?.overdue_count ?? 0} color="#f59e0b" icon="fa-triangle-exclamation" />
            </div>

            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              {(billing.rows || []).length === 0 ? (
                <div className="cp-empty"><i className="fas fa-file-invoice-dollar" /><p>لا توجد عقود نشطة — أنشئ العقود من تبويب «العقود»</p></div>
              ) : (
                <div className="cp-table-container" style={{ overflowX: 'auto' }}>
                  <table className="cp-table" style={{ width: '100%' }}>
                    <thead><tr>
                      <th>المعلم</th><th>نوع العقد</th><th>المتوقع</th><th>المحصل</th><th>المتبقي</th><th>آخر دفعة</th><th>الدفعة القادمة</th><th>الحالة</th><th></th>
                    </tr></thead>
                    <tbody>
                      {billing.rows.map(r => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 700 }}>{r.tenant_name || r.counterparty}</td>
                          <td><span className="cp-id-pill">{CONTRACT_TYPE_LABEL[r.contract_type] || r.contract_type}</span></td>
                          <td style={{ fontWeight: 700 }}>{fmtMoney(r.expected)}</td>
                          <td style={{ color: '#10b981', fontWeight: 700 }}>{fmtMoney(r.collected)}</td>
                          <td style={{ color: r.remaining > 0 ? '#ef4444' : 'var(--cp-text-muted)', fontWeight: 700 }}>{fmtMoney(r.remaining)}</td>
                          <td>{fmtDate(r.last_payment_on)}</td>
                          <td>{fmtDate(r.next_payment_on)}</td>
                          <td>
                            {r.overdue
                              ? <span className="cp-badge cp-badge-danger"><i className="fas fa-triangle-exclamation" style={{ marginInlineEnd: 5 }} />متأخر</span>
                              : <span className="cp-badge cp-badge-success">منتظم</span>}
                          </td>
                          <td>
                            <button onClick={() => { setTab('ledger'); setLedgerFilters({ direction: '', categoryId: '', tenantId: '', status: '' }); setLedgerPage(1) }}
                              className="cp-btn cp-btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>سجل الدفعات</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* ═══ KPIs ═══ */}
      {tab === 'kpis' && (
        kpis === null ? (
          <div className="cp-empty"><i className="fas fa-spinner fa-spin" /><p>جاري تحميل المؤشرات...</p></div>
        ) : (
          <div style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
              <StatCard label="الإيراد الشهري المتكرر (MRR)" value={fmtMoney(kpis.mrr)} color="#10b981" icon="fa-repeat" />
              <StatCard label="الإيراد السنوي المتكرر (ARR)" value={fmtMoney(kpis.arr)} color="#3b82f6" icon="fa-calendar-check" />
              <StatCard label="معلمون نشطون" value={kpis.active_teachers ?? 0} color="#8b5cf6" icon="fa-chalkboard-user" />
              <StatCard label="متوسط الإيراد لكل معلم" value={fmtMoney(kpis.arpt)} color="#06b6d4" icon="fa-user-tag" sub="شهرياً" />
              <StatCard label="معدل الفقد (Churn)" value={`${kpis.churn_rate ?? 0}%`} color="#ef4444" icon="fa-user-minus" sub="آخر 90 يوماً" />
              <StatCard label="نمو شهري" value={kpis.mom_growth == null ? '—' : `${kpis.mom_growth}%`} color={Number(kpis.mom_growth) >= 0 ? '#10b981' : '#ef4444'} icon="fa-chart-line"
                sub={`${fmtMoney(kpis.revenue_prev_month)} ← ${fmtMoney(kpis.revenue_this_month)}`} />
            </div>

            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: '1.05rem', fontWeight: 800 }}><i className="fas fa-chart-column" style={{ color: '#3b82f6', marginLeft: 8 }} />آخر 12 شهراً</h3>
              <MonthlyChart series={kpis.by_month} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 20 }}>
              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 800, color: '#3b82f6' }}>الإيرادات حسب المعلم (آخر سنة)</h3>
                <HBarList items={kpis.revenue_by_tenant} color="#3b82f6" />
              </div>
              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 800, color: '#10b981' }}>الإيرادات حسب المنتج / التصنيف</h3>
                <HBarList items={kpis.revenue_by_category} color="#10b981" />
              </div>
            </div>
          </div>
        )
      )}

      {/* ═══ Costs ═══ */}
      {tab === 'costs' && (
        dashLoading || !dash ? (
          <div className="cp-empty"><i className="fas fa-spinner fa-spin" /><p>جاري تحميل تحليل التكاليف...</p></div>
        ) : (() => {
          const rev = Number(dash.totals?.revenue || 0)
          const exp = Number(dash.totals?.expenses || 0)
          const months = Math.max(1, (dash.monthly || []).length)
          const burn = exp / months
          return (
            <div style={{ display: 'grid', gap: 18 }}>
              {rangeBar}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
                <StatCard label="الإيرادات (الفترة)" value={fmtMoney(rev)} color="#10b981" icon="fa-arrow-trend-up" />
                <StatCard label="التكاليف (الفترة)" value={fmtMoney(exp)} color="#ef4444" icon="fa-arrow-trend-down" />
                <StatCard label="إجمالي الربح" value={fmtMoney(rev - exp)} color={rev - exp >= 0 ? '#3b82f6' : '#ef4444'} icon="fa-scale-balanced" />
                <StatCard label="معدل الحرق الشهري" value={fmtMoney(burn)} color="#f59e0b" icon="fa-fire" sub={`متوسط ${months} ${months > 1 ? 'أشهر' : 'شهر'}`} />
                <StatCard label="التزامات شهرية دورية" value={fmtMoney(dash.recurring_monthly_burn)} color="#8b5cf6" icon="fa-rotate" sub="اشتراكات نشطة (مطبّعة شهرياً)" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 20 }}>
                <div style={cardStyle}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 800, color: '#ef4444' }}>التكاليف حسب البند (Supabase / Claude / نطاقات…)</h3>
                  <HBarList items={expCats.map(c => ({ name: c.category, total: c.total }))} color="#ef4444" />
                </div>
                <div style={cardStyle}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 800 }}>الإيراد مقابل التكلفة شهرياً</h3>
                  <MonthlyChart series={dash.monthly} />
                </div>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', margin: 0 }}>
                <i className="fas fa-circle-info" style={{ marginLeft: 6 }} />
                مؤشر Runway (كم شهراً يغطي الرصيد الحالي معدل الحرق) سيُفعّل مستقبلاً عند اكتمال بيانات الرصيد الافتتاحي.
              </p>
            </div>
          )
        })()
      )}

      {/* ═══ Operations ═══ */}
      {tab === 'operations' && (
        ops === null ? (
          <div className="cp-empty"><i className="fas fa-spinner fa-spin" /><p>جاري تحميل بيانات التشغيل...</p></div>
        ) : (
          <div style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <h3 style={{ margin: 0, fontWeight: 800 }}>حالة المنصة والتشغيل</h3>
              <button onClick={() => { setOps(null); getBizOperations().then(setOps) }} className="cp-btn cp-btn-secondary" style={{ padding: '8px 14px', fontWeight: 700 }}>
                <i className="fas fa-rotate-right" style={{ marginLeft: 6 }} />تحديث
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
              <StatCard label="إجمالي المنصات" value={ops.tenants?.total ?? 0} color="#3b82f6" icon="fa-building" sub={`${ops.tenants?.with_students ?? 0} منصة بها طلاب نشطون`} />
              <StatCard label="الطلاب النشطون" value={(ops.users?.students_active ?? 0).toLocaleString('en-US')} color="#10b981" icon="fa-user-graduate" sub={`من إجمالي ${(ops.users?.students_total ?? 0).toLocaleString('en-US')}`} />
              <StatCard label="أولياء أمور مسجلون" value={(ops.users?.with_parent_phone ?? 0).toLocaleString('en-US')} color="#8b5cf6" icon="fa-people-roof" sub="طلاب لديهم رقم ولي أمر" />
              <StatCard label="مساعدون" value={ops.users?.assistants ?? 0} color="#06b6d4" icon="fa-user-gear" sub={`${ops.users?.admins ?? 0} أدمن`} />
              <StatCard label="حجم قاعدة البيانات" value={fmtBytes(ops.db_size_bytes)} color="#f59e0b" icon="fa-database" />
            </div>

            {(() => {
              const wa = ops.whatsapp || {}
              const total7 = Number(wa.sent_7d || 0) + Number(wa.failed_7d || 0)
              const successRate = total7 > 0 ? Math.round(Number(wa.sent_7d || 0) * 100 / total7) : null
              return (
                <div style={cardStyle}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 800 }}><i className="fab fa-whatsapp" style={{ color: '#10b981', marginLeft: 8 }} />طابور الواتساب والإشعارات</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
                    <StatCard label="قيد الانتظار" value={(wa.pending ?? 0).toLocaleString('en-US')} color="#f59e0b" icon="fa-clock" />
                    <StatCard label="مرسلة (الإجمالي)" value={(wa.sent_total ?? 0).toLocaleString('en-US')} color="#10b981" icon="fa-check-double" />
                    <StatCard label="فاشلة (الإجمالي)" value={(wa.failed_total ?? 0).toLocaleString('en-US')} color="#ef4444" icon="fa-circle-xmark" />
                    <StatCard label="نسبة النجاح (7 أيام)" value={successRate == null ? '—' : `${successRate}%`} color={successRate >= 90 ? '#10b981' : '#f59e0b'} icon="fa-gauge-high" sub={`${wa.sent_7d ?? 0} نجحت / ${wa.failed_7d ?? 0} فشلت`} />
                  </div>
                  {wa.oldest_pending_at && (
                    <p style={{ margin: '12px 0 0', fontSize: '0.8rem', color: 'var(--cp-text-muted)' }}>
                      أقدم رسالة معلقة منذ: {fmtDate(wa.oldest_pending_at)} — المحرك الذكي يستأنف تلقائياً كل 10 دقائق داخل ساعات العمل.
                    </p>
                  )}
                </div>
              )
            })()}
            <p style={{ fontSize: '0.78rem', color: 'var(--cp-text-muted)', margin: 0 }}>
              <i className="fas fa-circle-info" style={{ marginLeft: 6 }} />
              استهلاك التخزين الخارجي (R2) وزمن الاستجابة يتطلبان أدوات قياس خارج قاعدة البيانات — ضمن التحسينات المستقبلية.
            </p>
          </div>
        )
      )}

      {/* ═══ Reports ═══ */}
      {tab === 'reports' && (
        <div style={{ display: 'grid', gap: 18 }}>
          {rangeBar}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {[
              ['pnl', 'الأرباح والخسائر الشهري', 'fa-scale-balanced', '#3b82f6'],
              ['revenue', 'تقرير الإيرادات', 'fa-arrow-trend-up', '#10b981'],
              ['expenses', 'تقرير المصروفات', 'fa-arrow-trend-down', '#ef4444'],
              ['teachers', 'إيرادات المعلمين', 'fa-chalkboard-user', '#8b5cf6'],
              ['billing', 'الاشتراكات والفوترة', 'fa-file-invoice-dollar', '#f59e0b'],
              ['cashflow', 'التدفق النقدي', 'fa-money-bill-transfer', '#06b6d4'],
            ].map(([key, label, icon, color]) => (
              <div key={key} style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: `color-mix(in srgb, ${color} 15%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className={`fas ${icon}`} style={{ color }} />
                  </div>
                  <strong>{label}</strong>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => exportReport(key, 'pdf')} className="cp-btn cp-btn-secondary" style={{ padding: '7px 12px', fontSize: '0.8rem', flex: 1 }}><i className="fas fa-print" style={{ marginLeft: 5 }} />PDF / طباعة</button>
                  <button onClick={() => exportReport(key, 'csv')} className="cp-btn cp-btn-secondary" style={{ padding: '7px 12px', fontSize: '0.8rem', flex: 1 }}><i className="fas fa-file-csv" style={{ marginLeft: 5 }} />CSV / Excel</button>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', margin: 0 }}>
            <i className="fas fa-circle-info" style={{ marginLeft: 6 }} />
            كل التقارير تُبنى لحظياً من سجل المعاملات (المؤكدة فقط) للفترة المحددة أعلاه. ملفات CSV تفتح مباشرة في Excel.
          </p>
        </div>
      )}

      {/* ═══ Transaction modal ═══ */}
      {txForm && (
        <div className="cp-modal-overlay" onClick={() => setTxForm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <form onSubmit={submitTx} onClick={(e) => e.stopPropagation()} style={{ ...cardStyle, width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto', display: 'grid', gap: 12 }}>
            <h3 style={{ margin: 0, fontWeight: 800 }}>{txForm.id ? 'تعديل معاملة' : 'تسجيل معاملة جديدة'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>الاتجاه</label>
                <select className="cp-input" value={txForm.direction} onChange={(e) => setTxForm(f => ({ ...f, direction: e.target.value }))} style={{ width: '100%' }}>
                  <option value="in">وارد (إيراد)</option><option value="out">منصرف (مصروف)</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>القيمة (ج.م)</label>
                <input required type="number" min="0.01" step="0.01" className="cp-input" value={txForm.amount || ''} onChange={(e) => setTxForm(f => ({ ...f, amount: e.target.value }))} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={labelStyle}>التاريخ</label>
                <DatePicker value={txForm.occurred_on} onChange={(v) => setTxForm(f => ({ ...f, occurred_on: v || todayIso() }))} />
              </div>
              <div>
                <label style={labelStyle}>الحالة</label>
                <select className="cp-input" value={txForm.status || 'confirmed'} onChange={(e) => setTxForm(f => ({ ...f, status: e.target.value }))} style={{ width: '100%' }}>
                  <option value="confirmed">مؤكدة</option><option value="pending">متوقعة (لم تُحصّل بعد)</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>التصنيف</label>
                <select required className="cp-input" value={txForm.category_id || ''} onChange={(e) => setTxForm(f => ({ ...f, category_id: e.target.value }))} style={{ width: '100%' }}>
                  <option value="">اختر تصنيفاً…</option>
                  {categories.filter(c => (txForm.direction === 'in' ? c.kind === 'revenue' : c.kind === 'expense')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>الحساب</label>
                <select className="cp-input" value={txForm.account_id || ''} onChange={(e) => setTxForm(f => ({ ...f, account_id: e.target.value }))} style={{ width: '100%' }}>
                  <option value="">—</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>المعلم / المنصة (للإيرادات)</label>
                <select className="cp-input" value={txForm.tenant_id || ''} onChange={(e) => setTxForm(f => ({ ...f, tenant_id: e.target.value }))} style={{ width: '100%' }}>
                  <option value="">—</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>البيان</label>
                <input className="cp-input" value={txForm.description || ''} onChange={(e) => setTxForm(f => ({ ...f, description: e.target.value }))} style={{ width: '100%' }} placeholder="مثال: اشتراك شهر يوليو — منصة باور" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>ملاحظات</label>
                <input className="cp-input" value={txForm.notes || ''} onChange={(e) => setTxForm(f => ({ ...f, notes: e.target.value }))} style={{ width: '100%' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setTxForm(null)} className="cp-btn cp-btn-secondary" style={{ padding: '9px 18px' }}>إلغاء</button>
              <button type="submit" disabled={saving} className="cp-btn cp-btn-success" style={{ padding: '9px 22px', fontWeight: 700 }}>{saving ? 'جارٍ الحفظ…' : 'حفظ'}</button>
            </div>
          </form>
        </div>
      )}

      {/* ═══ Contract modal ═══ */}
      {contractForm && (
        <div className="cp-modal-overlay" onClick={() => setContractForm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <form onSubmit={submitContract} onClick={(e) => e.stopPropagation()} style={{ ...cardStyle, width: 'min(600px, 100%)', maxHeight: '90vh', overflowY: 'auto', display: 'grid', gap: 12 }}>
            <h3 style={{ margin: 0, fontWeight: 800 }}>{contractForm.id ? 'تعديل عقد' : 'عقد معلم جديد'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>المعلم / المنصة</label>
                <select className="cp-input" value={contractForm.tenant_id || ''} onChange={(e) => {
                  const t = tenants.find(x => x.id === e.target.value)
                  setContractForm(f => ({ ...f, tenant_id: e.target.value, counterparty: f.counterparty || t?.name || '' }))
                }} style={{ width: '100%' }}>
                  <option value="">بدون ربط بمنصة</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>اسم المتعاقد</label>
                <input required className="cp-input" value={contractForm.counterparty || ''} onChange={(e) => setContractForm(f => ({ ...f, counterparty: e.target.value }))} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={labelStyle}>نوع العقد</label>
                <select className="cp-input" value={contractForm.contract_type} onChange={(e) => setContractForm(f => ({ ...f, contract_type: e.target.value }))} style={{ width: '100%' }}>
                  {CONTRACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>الحالة</label>
                <select className="cp-input" value={contractForm.status} onChange={(e) => setContractForm(f => ({ ...f, status: e.target.value }))} style={{ width: '100%' }}>
                  {Object.entries(CONTRACT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>تاريخ البدء</label>
                <DatePicker value={contractForm.start_date} onChange={(v) => setContractForm(f => ({ ...f, start_date: v || todayIso() }))} />
              </div>
              <div>
                <label style={labelStyle}>تاريخ الانتهاء (اختياري)</label>
                <DatePicker value={contractForm.end_date || ''} onChange={(v) => setContractForm(f => ({ ...f, end_date: v }))} />
              </div>
              {(contractForm.contract_type === 'fixed_yearly' || contractForm.contract_type === 'hybrid') && (
                <div>
                  <label style={labelStyle}>المبلغ السنوي (ج.م)</label>
                  <input type="number" min="0" className="cp-input" value={contractForm.yearly_amount || ''} onChange={(e) => setContractForm(f => ({ ...f, yearly_amount: e.target.value }))} style={{ width: '100%' }} />
                </div>
              )}
              {(contractForm.contract_type === 'upfront' || contractForm.contract_type === 'hybrid') && (
                <div>
                  <label style={labelStyle}>الدفعة المقدمة (ج.م)</label>
                  <input type="number" min="0" className="cp-input" value={contractForm.upfront_amount || ''} onChange={(e) => setContractForm(f => ({ ...f, upfront_amount: e.target.value }))} style={{ width: '100%' }} />
                </div>
              )}
              {(contractForm.contract_type === 'per_student_monthly' || contractForm.contract_type === 'hybrid') && (
                <>
                  <div>
                    <label style={labelStyle}>شهرياً لكل طالب (ج.م)</label>
                    <input type="number" min="0" step="0.5" className="cp-input" value={contractForm.monthly_per_student || ''} onChange={(e) => setContractForm(f => ({ ...f, monthly_per_student: e.target.value }))} style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label style={labelStyle}>عدد الطلاب المتوقع</label>
                    <input type="number" min="0" className="cp-input" value={contractForm.expected_students || ''} onChange={(e) => setContractForm(f => ({ ...f, expected_students: e.target.value }))} style={{ width: '100%' }} />
                  </div>
                </>
              )}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>المتوقع الإجمالي — تجاوز يدوي (اختياري، يلغي الحساب التلقائي)</label>
                <input type="number" min="0" className="cp-input" value={contractForm.expected_total || ''} onChange={(e) => setContractForm(f => ({ ...f, expected_total: e.target.value }))} style={{ width: '100%' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>ملاحظات / شروط إضافية</label>
                <textarea className="cp-input" rows={2} value={contractForm.notes || ''} onChange={(e) => setContractForm(f => ({ ...f, notes: e.target.value }))} style={{ width: '100%', resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setContractForm(null)} className="cp-btn cp-btn-secondary" style={{ padding: '9px 18px' }}>إلغاء</button>
              <button type="submit" disabled={saving} className="cp-btn cp-btn-success" style={{ padding: '9px 22px', fontWeight: 700 }}>{saving ? 'جارٍ الحفظ…' : 'حفظ العقد'}</button>
            </div>
          </form>
        </div>
      )}

      {/* ═══ Recurring modal ═══ */}
      {recForm && (
        <div className="cp-modal-overlay" onClick={() => setRecForm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <form onSubmit={submitRecurring} onClick={(e) => e.stopPropagation()} style={{ ...cardStyle, width: 'min(540px, 100%)', maxHeight: '90vh', overflowY: 'auto', display: 'grid', gap: 12 }}>
            <h3 style={{ margin: 0, fontWeight: 800 }}>{recForm.id ? 'تعديل بند دوري' : 'مصروف / اشتراك دوري جديد'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>الاسم</label>
                <input required className="cp-input" value={recForm.name || ''} onChange={(e) => setRecForm(f => ({ ...f, name: e.target.value }))} style={{ width: '100%' }} placeholder="Supabase Pro / Claude Code / دومين…" />
              </div>
              <div>
                <label style={labelStyle}>القيمة (ج.م)</label>
                <input required type="number" min="0" step="0.01" className="cp-input" value={recForm.amount || ''} onChange={(e) => setRecForm(f => ({ ...f, amount: e.target.value }))} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={labelStyle}>الدورية</label>
                <select className="cp-input" value={recForm.cadence} onChange={(e) => setRecForm(f => ({ ...f, cadence: e.target.value }))} style={{ width: '100%' }}>
                  <option value="monthly">شهري</option><option value="quarterly">ربع سنوي</option><option value="yearly">سنوي</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>الاستحقاق القادم</label>
                <DatePicker value={recForm.next_due_on} onChange={(v) => setRecForm(f => ({ ...f, next_due_on: v || todayIso() }))} />
              </div>
              <div>
                <label style={labelStyle}>التصنيف</label>
                <select className="cp-input" value={recForm.category_id || ''} onChange={(e) => setRecForm(f => ({ ...f, category_id: e.target.value }))} style={{ width: '100%' }}>
                  <option value="">—</option>
                  {categories.filter(c => c.kind === (recForm.direction === 'in' ? 'revenue' : 'expense')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 18, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!recForm.auto_post} onChange={(e) => setRecForm(f => ({ ...f, auto_post: e.target.checked }))} />
                  تسجيل تلقائي عند الاستحقاق
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                  <input type="checkbox" checked={recForm.is_active !== false} onChange={(e) => setRecForm(f => ({ ...f, is_active: e.target.checked }))} />
                  نشط
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setRecForm(null)} className="cp-btn cp-btn-secondary" style={{ padding: '9px 18px' }}>إلغاء</button>
              <button type="submit" disabled={saving} className="cp-btn cp-btn-success" style={{ padding: '9px 22px', fontWeight: 700 }}>{saving ? 'جارٍ الحفظ…' : 'حفظ'}</button>
            </div>
          </form>
        </div>
      )}

      {/* ═══ Categories & accounts manager ═══ */}
      {showCatManager && (
        <div className="cp-modal-overlay" onClick={() => setShowCatManager(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...cardStyle, width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto', display: 'grid', gap: 16 }}>
            <h3 style={{ margin: 0, fontWeight: 800 }}>التصنيفات والحسابات</h3>
            <div>
              <label style={labelStyle}>إضافة تصنيف</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="cp-input" value={newCat.name} onChange={(e) => setNewCat(c => ({ ...c, name: e.target.value }))} placeholder="اسم التصنيف" style={{ flex: 1 }} />
                <select className="cp-input" value={newCat.kind} onChange={(e) => setNewCat(c => ({ ...c, kind: e.target.value }))}>
                  <option value="expense">مصروف</option><option value="revenue">إيراد</option>
                </select>
                <button className="cp-btn cp-btn-success" style={{ padding: '8px 16px' }} onClick={async () => {
                  if (!newCat.name.trim()) return
                  try { await saveBizCategory({ name: newCat.name.trim(), kind: newCat.kind }); setNewCat({ name: '', kind: newCat.kind }); listBizCategories().then(setCategories) }
                  catch (e) { flash?.('فشل: ' + e.message, 'error') }
                }}>إضافة</button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                {categories.map(c => (
                  <span key={c.id} className="cp-id-pill" style={{ borderColor: c.kind === 'revenue' ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.35)' }}>
                    {c.kind === 'revenue' ? '↑' : '↓'} {c.name}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <label style={labelStyle}>إضافة حساب (بنك / محفظة / خزنة)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="cp-input" value={newAccount} onChange={(e) => setNewAccount(e.target.value)} placeholder="اسم الحساب" style={{ flex: 1 }} />
                <button className="cp-btn cp-btn-success" style={{ padding: '8px 16px' }} onClick={async () => {
                  if (!newAccount.trim()) return
                  try { await saveBizAccount({ name: newAccount.trim() }); setNewAccount(''); listBizAccounts().then(setAccounts) }
                  catch (e) { flash?.('فشل: ' + e.message, 'error') }
                }}>إضافة</button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                {accounts.map(a => <span key={a.id} className="cp-id-pill">{a.name}</span>)}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCatManager(false)} className="cp-btn cp-btn-secondary" style={{ padding: '9px 18px' }}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
