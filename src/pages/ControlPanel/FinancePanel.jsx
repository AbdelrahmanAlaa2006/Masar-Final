import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  listFinanceCategories, createFinanceCategory, updateFinanceCategory, deleteFinanceCategory,
  addFinanceTransaction, updateFinanceTransaction, deleteFinanceTransaction,
  updateLedgerEntry, getDailyLedger, getFinanceReport, getCashBalance, getOutstandingBalances,
} from '@backend/financeApi'
import { deletePayment, removeBulkInitialPayments } from '@backend/paymentsApi'
import { supabase } from '@backend/supabase'
import { useAuth } from '../../contexts/AuthContext'
import ConfirmDeleteDialog from '../../components/ConfirmDeleteDialog'
import DatePicker from '../../components/DatePicker'
import MonthPicker from '../../components/MonthPicker'
import BookletsPanel from './BookletsPanel'
import { GRADE_LABEL } from './shared'

const todayIso = () => new Date().toISOString().split('T')[0]
const monthStartIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
// Arabic month/weekday names with WESTERN digits (1234567890) — matches the
// financial report's numeral style.
const AR_LATN = 'ar-EG-u-nu-latn'
const fmtMoney = (n) => `${Number(n || 0).toLocaleString('en-US')} ج.م`
const fmtDate = (d) => d ? new Date(d).toLocaleDateString(AR_LATN, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
const fmtDayLong = (d) => d ? new Date(`${d}T00:00:00`).toLocaleDateString(AR_LATN, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '—'
const fmtMonthLong = (m) => m ? new Date(`${m}-01T00:00:00`).toLocaleDateString(AR_LATN, { month: 'long', year: 'numeric' }) : '—'
const addDaysIso = (iso, delta) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const thisMonthIso = () => todayIso().slice(0, 7) // YYYY-MM
const addMonthsIso = (ym, delta) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const monthLastDayIso = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m, 0) // day 0 of next month = last day of this month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const labelStyle = { display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }
const cardStyle = { background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '20px', boxShadow: 'var(--cp-card-shadow)' }

export default function FinancePanel({ onBack, flash }) {
  const { user: currentUser } = useAuth()

  const [activeTab, setActiveTab] = useState('ledger') // ledger | categories | reports | debts
  const [cashBalance, setCashBalance] = useState(null)

  const [showRevertModal, setShowRevertModal] = useState(false)
  const [revertForm, setRevertForm] = useState({
    removeMonthly: false,
    removeBooklet: false,
    monthlyMonth: ''
  })
  const [submittingRevert, setSubmittingRevert] = useState(false)

  // The ledger shows one period at a time: a single day (default: today) or a
  // whole month — the RPC's opening balance carries everything before it.
  const [ledgerScope, setLedgerScope] = useState('day') // day | month
  const [ledgerDate, setLedgerDate] = useState(todayIso())
  const [ledgerMonth, setLedgerMonth] = useState(thisMonthIso())

  // Date range for the reports tab
  const [fromDate, setFromDate] = useState(monthStartIso())
  const [toDate, setToDate] = useState(todayIso())

  // Ledger
  const [ledger, setLedger] = useState({ opening_balance: 0, entries: [] })
  const [ledgerLoading, setLedgerLoading] = useState(false)

  // Categories
  const [categories, setCategories] = useState([])
  const [newCatName, setNewCatName] = useState('')
  const [newCatKind, setNewCatKind] = useState('expense')

  // Entry form (add / edit)
  const [showEntryForm, setShowEntryForm] = useState(false)
  const [entryEditing, setEntryEditing] = useState(null) // finance_transactions row being edited
  const [entryDirection, setEntryDirection] = useState('out')
  const [entryCategoryId, setEntryCategoryId] = useState('')
  const [entryAmount, setEntryAmount] = useState('')
  const [entryDescription, setEntryDescription] = useState('')
  const [entryDate, setEntryDate] = useState(todayIso())
  const [entrySaving, setEntrySaving] = useState(false)

  // Editing a student-ledger row (amount/date only — integrity preserved)
  const [ledgerEditRow, setLedgerEditRow] = useState(null)
  const [ledgerEditAmount, setLedgerEditAmount] = useState('')
  const [ledgerEditDate, setLedgerEditDate] = useState('')

  // Reports
  const [report, setReport] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)

  // Debts
  const [debts, setDebts] = useState([])
  const [debtsLoading, setDebtsLoading] = useState(false)
  const [debtSearch, setDebtSearch] = useState('')

  const [deleteTarget, setDeleteTarget] = useState(null) // { kind: 'tx'|'ledger'|'category', row }

  const refreshBalance = () => { getCashBalance().then(setCashBalance).catch(() => {}) }
  const reloadCategories = () => {
    listFinanceCategories({ includeInactive: true }).then(setCategories).catch(() => {})
  }

  useEffect(() => { refreshBalance(); reloadCategories() }, [])

  const handleRevertSubmit = async (e) => {
    e.preventDefault()
    if (revertForm.removeMonthly && !revertForm.monthlyMonth) {
      flash('يجب اختيار شهر الاشتراك لإزالة الدفعات', 'warning')
      return
    }
    setSubmittingRevert(true)
    try {
      await removeBulkInitialPayments({
        studentIds: null, // Revert globally for all students
        removeMonthly: revertForm.removeMonthly,
        removeBooklet: revertForm.removeBooklet,
        monthlyMonth: revertForm.monthlyMonth
      })
      flash('تمت إزالة الدفعات لجميع طلاب المنصة وتحديث الحسابات بنجاح', 'success')
      setShowRevertModal(false)
      reloadLedger()
      refreshBalance()
    } catch (err) {
      console.error(err)
      flash('حدث خطأ أثناء إزالة الدفعات: ' + (err.message || ''), 'error')
    } finally {
      setSubmittingRevert(false)
    }
  }

  const handleWipeTestingData = async () => {
    if (!window.confirm("⚠️ هل أنت متأكد من مسح جميع دفعات التجربة واسترجاعاتها؟ هذا الإجراء سيمسح جميع المعاملات التجريبية الخاصة بك فقط ولن يؤثر على أي بيانات أخرى.")) {
      return
    }
    
    setSubmittingRevert(true)
    try {
      const tenantId = currentUser.tenant_id
      if (!tenantId) throw new Error("لم يتم العثور على معرّف المنصة")

      // 1. Fetch test profiles to get their IDs
      const testNames = [
        'lolo', 
        'test adding by the admin', 
        'Test WhatsApp Student 3', 
        'test not real number', 
        'eyad atef', 
        'Test Notification', 
        'test not real number 2'
      ]
      
      const { data: testStudents, error: profilesError } = await supabase
        .from('profiles')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('name', testNames)
      if (profilesError) throw profilesError
      
      const testStudentIds = (testStudents || []).map(s => s.id)

      // 2. Delete entries from finance_transactions
      if (testStudentIds.length > 0) {
        const { error: deleteFtError } = await supabase
          .from('finance_transactions')
          .delete()
          .eq('tenant_id', tenantId)
          .or(`student_id.in.(${testStudentIds.join(',')}),description.like.كتيب:%,description.like.%استرجاع%كتيب%`)
        if (deleteFtError) throw deleteFtError
      } else {
        const { error: deleteFtError } = await supabase
          .from('finance_transactions')
          .delete()
          .eq('tenant_id', tenantId)
          .or(`description.like.كتيب:%,description.like.%استرجاع%كتيب%`)
        if (deleteFtError) throw deleteFtError
      }

      // 3. Delete entries from student_ledger
      if (testStudentIds.length > 0) {
        const { error: deleteSlError } = await supabase
          .from('student_ledger')
          .delete()
          .eq('tenant_id', tenantId)
          .or(`student_id.in.(${testStudentIds.join(',')}),description.like.اشتراك شهر يوليو%,description.like.اشتراك شهر أغسطس%`)
        if (deleteSlError) throw deleteSlError
      } else {
        const { error: deleteSlError } = await supabase
          .from('student_ledger')
          .delete()
          .eq('tenant_id', tenantId)
          .or(`description.like.اشتراك شهر يوليو%,description.like.اشتراك شهر أغسطس%`)
        if (deleteSlError) throw deleteSlError
      }

      // 4. Revert booklet status back to unpaid
      if (testStudentIds.length > 0) {
        const { error: sbError } = await supabase
          .from('student_booklets')
          .update({
            payment_status: 'unpaid',
            payment_date: null,
            paid_by: null,
            updated_at: new Date().toISOString()
          })
          .eq('tenant_id', tenantId)
          .in('student_id', testStudentIds)
        if (sbError) throw sbError

        // Delete logs
        await supabase
          .from('booklet_payment_logs')
          .delete()
          .eq('tenant_id', tenantId)
          .in('student_id', testStudentIds)

        // Delete attendance
        await supabase
          .from('attendance_records')
          .delete()
          .eq('tenant_id', tenantId)
          .in('student_id', testStudentIds)
      }

      flash('تم مسح جميع عمليات التجربة والمدفوعات الزائفة وتصفير الحسابات بنجاح', 'success')
      reloadLedger()
      refreshBalance()
    } catch (err) {
      console.error(err)
      flash('حدث خطأ أثناء تنظيف البيانات: ' + (err.message || ''), 'error')
    } finally {
      setSubmittingRevert(false)
    }
  }

  // The from/to actually queried, depending on the day/month scope.
  const ledgerPeriod = ledgerScope === 'day'
    ? { from: ledgerDate, to: ledgerDate }
    : { from: `${ledgerMonth}-01`, to: monthLastDayIso(ledgerMonth) }

  const reloadLedger = async () => {
    // A cleared date picker yields '' — never send that to the date RPC.
    if (!ledgerPeriod.from || !ledgerPeriod.to) return
    setLedgerLoading(true)
    try {
      setLedger(await getDailyLedger(ledgerPeriod.from, ledgerPeriod.to))
    } catch (err) {
      console.error(err)
      flash('فشل تحميل الدفتر اليومي: ' + (err.message || ''), 'error')
    } finally {
      setLedgerLoading(false)
    }
  }

  useEffect(() => { if (activeTab === 'ledger') reloadLedger() }, [activeTab, ledgerScope, ledgerDate, ledgerMonth])

  // Show the period that contains a just-saved (possibly backdated) entry.
  const jumpToDate = (dateIso) => {
    if (!dateIso) { reloadLedger(); return }
    if (ledgerScope === 'day') {
      if (dateIso !== ledgerDate) setLedgerDate(dateIso)
      else reloadLedger()
    } else {
      const ym = dateIso.slice(0, 7)
      if (ym !== ledgerMonth) setLedgerMonth(ym)
      else reloadLedger()
    }
  }

  useEffect(() => {
    if (activeTab !== 'reports') return
    if (!fromDate || !toDate) return
    setReportLoading(true)
    getFinanceReport(fromDate, toDate)
      .then(setReport)
      .catch((err) => flash('فشل تحميل التقرير: ' + (err.message || ''), 'error'))
      .finally(() => setReportLoading(false))
  }, [activeTab, fromDate, toDate])

  useEffect(() => {
    if (activeTab !== 'debts') return
    setDebtsLoading(true)
    getOutstandingBalances()
      .then(setDebts)
      .catch((err) => flash('فشل تحميل المتأخرات: ' + (err.message || ''), 'error'))
      .finally(() => setDebtsLoading(false))
  }, [activeTab])

  const activeCategories = useMemo(
    () => categories.filter(c => c.is_active && c.kind === (entryDirection === 'in' ? 'revenue' : 'expense')),
    [categories, entryDirection]
  )

  // Running balance is computed chronologically, then the list is reversed so
  // the LAST operation of the day sits at the top of the table.
  const entriesWithRunning = useMemo(() => {
    const opening = Number(ledger.opening_balance || 0)
    return (ledger.entries || [])
      .map(e => ({ ...e, running: opening + Number(e.period_running || 0) }))
      .reverse()
  }, [ledger])

  // Totals of the selected day (وارد/منصرف/رصيد نهاية اليوم).
  const dayTotals = useMemo(() => {
    let dayIn = 0, dayOut = 0
    for (const e of ledger.entries || []) {
      if (e.direction === 'in') dayIn += Number(e.amount || 0)
      else dayOut += Number(e.amount || 0)
    }
    const opening = Number(ledger.opening_balance || 0)
    return { dayIn, dayOut, closing: opening + dayIn - dayOut }
  }, [ledger])

  const openEntryForm = (row = null) => {
    setEntryEditing(row)
    setEntryDirection(row?.direction || 'out')
    setEntryCategoryId(row?.category_id || '')
    setEntryAmount(row ? String(row.amount) : '')
    setEntryDescription(row?.description || '')
    setEntryDate(row?.transaction_date || todayIso())
    setShowEntryForm(true)
  }

  const handleSaveEntry = async (e) => {
    e.preventDefault()
    if (!(parseFloat(entryAmount) > 0)) { flash('أدخل مبلغاً صالحاً', 'warning'); return }
    setEntrySaving(true)
    try {
      if (entryEditing?.id) {
        await updateFinanceTransaction(entryEditing.id, {
          categoryId: entryCategoryId || null,
          direction: entryDirection,
          amount: entryAmount,
          description: entryDescription,
          transactionDate: entryDate,
        }, { actorId: currentUser?.id })
        flash('تم تعديل العملية بنجاح', 'success')
      } else {
        await addFinanceTransaction({
          categoryId: entryCategoryId || null,
          direction: entryDirection,
          amount: entryAmount,
          description: entryDescription,
          transactionDate: entryDate,
          createdBy: currentUser?.id,
        })
        flash('تم تسجيل العملية بنجاح', 'success')
      }
      setShowEntryForm(false)
      setEntryEditing(null)
      refreshBalance()
      // If the entry was recorded on another day (backdated), jump the ledger
      // to the period containing it so the admin sees what was just saved.
      jumpToDate(entryDate)
    } catch (err) {
      flash('فشل الحفظ: ' + (err.message || ''), 'error')
    } finally {
      setEntrySaving(false)
    }
  }

  const handleSaveLedgerEdit = async () => {
    if (!ledgerEditRow) return
    if (!(parseFloat(ledgerEditAmount) > 0)) { flash('أدخل مبلغاً صالحاً', 'warning'); return }
    try {
      await updateLedgerEntry(ledgerEditRow.id, {
        amount: ledgerEditAmount,
        transactionDate: ledgerEditDate,
      }, { actorId: currentUser?.id })
      flash('تم تعديل الدفعة بنجاح', 'success')
      setLedgerEditRow(null)
      refreshBalance()
      jumpToDate(ledgerEditDate)
    } catch (err) {
      flash('فشل التعديل: ' + (err.message || ''), 'error')
    }
  }

  const handleConfirmedDelete = async () => {
    const t = deleteTarget
    setDeleteTarget(null)
    if (!t) return
    try {
      if (t.kind === 'tx') await deleteFinanceTransaction(t.row.id, { actorId: currentUser?.id })
      else if (t.kind === 'ledger') await deletePayment(t.row.id)
      else if (t.kind === 'category') { await deleteFinanceCategory(t.row.id); reloadCategories() }
      flash('تم الحذف بنجاح', 'success')
      refreshBalance()
      if (activeTab === 'ledger') reloadLedger()
    } catch (err) {
      flash('فشل الحذف: ' + (err.message || ''), 'error')
    }
  }

  const handleAddCategory = async (e) => {
    e.preventDefault()
    if (!newCatName.trim()) return
    try {
      await createFinanceCategory({ name: newCatName, kind: newCatKind })
      setNewCatName('')
      reloadCategories()
      flash('تم إضافة التصنيف', 'success')
    } catch (err) {
      flash(err.message || 'فشل إضافة التصنيف', 'error')
    }
  }

  // ── Exports ──────────────────────────────────────────────────────────────
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

  const exportLedgerCsv = () => {
    downloadCsv(
      `ledger-${ledgerScope === 'day' ? ledgerDate : ledgerMonth}.csv`,
      ['التاريخ', 'النوع', 'التصنيف', 'البيان', 'الطالب', 'وارد', 'منصرف', 'الرصيد'],
      entriesWithRunning.map(e => [
        e.transaction_date,
        e.direction === 'in' ? 'إيراد' : 'مصروف',
        e.category,
        e.description,
        e.student_name || '—',
        e.direction === 'in' ? e.amount : '',
        e.direction === 'out' ? e.amount : '',
        e.running,
      ])
    )
  }

  const exportDebtsCsv = () => {
    downloadCsv(
      'outstanding-balances.csv',
      ['اسم الطالب', 'المرحلة', 'المجموعة', 'هاتف ولي الأمر', 'الرصيد المتبقي'],
      filteredDebts.map(d => [d.name, GRADE_LABEL[d.grade] || d.grade, d.group || '—', d.parent_phone || '—', d.balance])
    )
  }

  // Printable (PDF-ready) report — same print-window pattern the attendance
  // history sheet uses; the user prints or saves as PDF from the dialog.
  const printLedger = () => {
    const win = window.open('', '_blank')
    if (!win) { flash('اسمح بالنوافذ المنبثقة لطباعة التقرير', 'warning'); return }
    const rowsHtml = entriesWithRunning.map((e, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${e.transaction_date}</td>
        <td>${e.direction === 'in' ? 'إيراد' : 'مصروف'}</td>
        <td>${e.category || ''}</td>
        <td style="text-align:right">${e.description || ''}${e.student_name ? ` — ${e.student_name}` : ''}</td>
        <td style="color:#10b981">${e.direction === 'in' ? Number(e.amount).toLocaleString('en-US') : ''}</td>
        <td style="color:#ef4444">${e.direction === 'out' ? Number(e.amount).toLocaleString('en-US') : ''}</td>
        <td style="font-weight:bold">${Number(e.running).toLocaleString('en-US')}</td>
      </tr>`).join('')
    win.document.write(`
      <html dir="rtl"><head><title>الدفتر المالي ${ledgerScope === 'day' ? ledgerDate : ledgerMonth}</title>
      <style>
        body { font-family: 'Tajawal', Arial, sans-serif; padding: 24px; color: #1e293b; }
        h1 { font-size: 20px; text-align: center; margin: 0 0 4px; }
        h2 { font-size: 13px; text-align: center; color: #64748b; margin: 0 0 20px; font-weight: normal; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: center; }
        th { background: #f8fafc; font-weight: bold; }
        .totals { display:flex; justify-content: space-around; margin: 0 0 18px; padding: 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius: 8px; font-size: 13px; }
      </style></head>
      <body onload="window.print(); window.close();">
        <h1>${ledgerScope === 'day' ? 'الدفتر المالي اليومي' : 'الدفتر المالي الشهري'}</h1>
        <h2>${ledgerScope === 'day' ? fmtDayLong(ledgerDate) : `شهر ${fmtMonthLong(ledgerMonth)}`}</h2>
        <div class="totals">
          <div>رصيد بداية ${ledgerScope === 'day' ? 'اليوم' : 'الشهر'}<br/><strong>${Number(ledger.opening_balance).toLocaleString('en-US')} ج.م</strong></div>
          <div>إجمالي الوارد<br/><strong style="color:#10b981">${dayTotals.dayIn.toLocaleString('en-US')} ج.م</strong></div>
          <div>إجمالي المنصرف<br/><strong style="color:#ef4444">${dayTotals.dayOut.toLocaleString('en-US')} ج.م</strong></div>
          <div>رصيد نهاية ${ledgerScope === 'day' ? 'اليوم' : 'الشهر'}<br/><strong>${dayTotals.closing.toLocaleString('en-US')} ج.م</strong></div>
          <div>عدد العمليات<br/><strong>${entriesWithRunning.length}</strong></div>
        </div>
        <table>
          <thead><tr><th>#</th><th>التاريخ</th><th>النوع</th><th>التصنيف</th><th>البيان</th><th>وارد</th><th>منصرف</th><th>الرصيد</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body></html>`)
    win.document.close()
  }

  const printReport = () => {
    if (!report) return
    const win = window.open('', '_blank')
    if (!win) { flash('اسمح بالنوافذ المنبثقة لطباعة التقرير', 'warning'); return }
    const catRows = (list) => (list || []).map(r => `<tr><td style="text-align:right">${r.category}</td><td>${Number(r.total).toLocaleString('en-US')} ج.م</td></tr>`).join('')
    win.document.write(`
      <html dir="rtl"><head><title>التقرير المالي ${fromDate} — ${toDate}</title>
      <style>
        body { font-family: 'Tajawal', Arial, sans-serif; padding: 24px; color: #1e293b; }
        h1 { font-size: 20px; text-align: center; margin: 0 0 4px; }
        h2 { font-size: 13px; text-align: center; color: #64748b; margin: 0 0 20px; font-weight: normal; }
        h3 { font-size: 15px; margin: 22px 0 8px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: center; }
        th { background: #f8fafc; }
        .kpis { display:flex; gap: 12px; justify-content: space-between; margin-bottom: 12px; }
        .kpi { flex:1; padding: 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius: 8px; text-align:center; font-size: 13px; }
        .kpi strong { display:block; font-size: 17px; margin-top: 4px; }
      </style></head>
      <body onload="window.print(); window.close();">
        <h1>التقرير المالي</h1>
        <h2>من ${fromDate} إلى ${toDate}</h2>
        <div class="kpis">
          <div class="kpi">إجمالي الإيرادات<strong style="color:#10b981">${Number(report.revenue_total).toLocaleString('en-US')} ج.م</strong></div>
          <div class="kpi">اشتراكات الطلاب<strong>${Number(report.subscriptions_total).toLocaleString('en-US')} ج.م</strong></div>
          <div class="kpi">إيرادات أخرى<strong>${Number(report.other_revenue_total).toLocaleString('en-US')} ج.م</strong></div>
          <div class="kpi">المصروفات<strong style="color:#ef4444">${Number(report.expenses_total).toLocaleString('en-US')} ج.م</strong></div>
          <div class="kpi">صافي الدخل<strong style="color:${Number(report.net_income) >= 0 ? '#10b981' : '#ef4444'}">${Number(report.net_income).toLocaleString('en-US')} ج.م</strong></div>
        </div>
        <h3>الإيرادات الأخرى حسب التصنيف</h3>
        <table><thead><tr><th>التصنيف</th><th>الإجمالي</th></tr></thead><tbody>${catRows(report.other_revenue_by_category) || '<tr><td colspan="2">لا يوجد</td></tr>'}</tbody></table>
        <h3>المصروفات حسب التصنيف</h3>
        <table><thead><tr><th>التصنيف</th><th>الإجمالي</th></tr></thead><tbody>${catRows(report.expenses_by_category) || '<tr><td colspan="2">لا يوجد</td></tr>'}</tbody></table>
      </body></html>`)
    win.document.close()
  }

  const filteredDebts = useMemo(() => {
    const q = debtSearch.trim().toLowerCase()
    if (!q) return debts
    return debts.filter(d => (d.name || '').toLowerCase().includes(q) || (d.parent_phone || '').includes(q))
  }, [debts, debtSearch])

  return (
    <div className="cp-panel-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>الدفتر المالي والمصروفات</h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', margin: '4px 0 0' }}>
            دفتر يومي شامل للإيرادات والمصروفات مع الرصيد الجاري والتقارير
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {cashBalance !== null && (
            <div style={{ padding: '10px 18px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', fontWeight: 800 }}>
              <span style={{ fontSize: '0.76rem', color: 'var(--cp-text-muted)', display: 'block' }}>الرصيد النقدي الحالي</span>
              <span style={{ color: '#10b981', fontSize: '1.15rem' }}>{fmtMoney(cashBalance)}</span>
            </div>
          )}
          <button onClick={onBack} className="cp-btn cp-btn-secondary">رجوع للوحة التحكم</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="cp-subtabs" style={{ display: 'flex', gap: 8, margin: '0 0 24px 0', borderBottom: '1px solid var(--cp-divider)', paddingBottom: '12px', flexWrap: 'wrap' }}>
        {[
          ['ledger', 'fa-book', 'الدفتر اليومي'],
          ['categories', 'fa-tags', 'التصنيفات'],
          ['reports', 'fa-chart-pie', 'التقارير'],
          ['debts', 'fa-hand-holding-dollar', 'مديونيات الطلاب'],
          ['booklets_manage', 'fa-book-open', 'إدارة الملازم'],
          ['booklets_reports', 'fa-file-invoice-dollar', 'تقارير الملازم'],
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

      {/* Day navigator (ledger) / date range (reports) */}
      {(activeTab === 'ledger' || activeTab === 'reports') && (
        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '20px' }}>
          {activeTab === 'ledger' && (
            <div>
              <label style={labelStyle}>فترة الدفتر</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--cp-divider)' }}>
                  <button
                    onClick={() => setLedgerScope('day')}
                    className={`cp-btn ${ledgerScope === 'day' ? 'cp-btn-info-active' : 'cp-btn-secondary'}`}
                    style={{ padding: '8px 16px', fontWeight: 'bold', borderRadius: 0, border: 'none' }}
                  >يوم</button>
                  <button
                    onClick={() => setLedgerScope('month')}
                    className={`cp-btn ${ledgerScope === 'month' ? 'cp-btn-info-active' : 'cp-btn-secondary'}`}
                    style={{ padding: '8px 16px', fontWeight: 'bold', borderRadius: 0, border: 'none' }}
                  >شهر</button>
                </div>
                {ledgerScope === 'day' ? (
                  <>
                    <button
                      onClick={() => setLedgerDate(d => addDaysIso(d || todayIso(), -1))}
                      className="cp-btn cp-btn-secondary" style={{ padding: '8px 12px', fontWeight: 'bold' }}
                      title="اليوم السابق"
                    ><i className="fas fa-chevron-right" /></button>
                    <DatePicker value={ledgerDate} onChange={(v) => setLedgerDate(v || todayIso())} placeholder="اليوم" />
                    <button
                      onClick={() => setLedgerDate(d => addDaysIso(d || todayIso(), 1))}
                      className="cp-btn cp-btn-secondary" style={{ padding: '8px 12px', fontWeight: 'bold' }}
                      title="اليوم التالي"
                    ><i className="fas fa-chevron-left" /></button>
                    {ledgerDate !== todayIso() && (
                      <button onClick={() => setLedgerDate(todayIso())} className="cp-btn cp-btn-info" style={{ padding: '8px 14px', fontWeight: 'bold' }}>
                        اليوم
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setLedgerMonth(m => addMonthsIso(m || thisMonthIso(), -1))}
                      className="cp-btn cp-btn-secondary" style={{ padding: '8px 12px', fontWeight: 'bold' }}
                      title="الشهر السابق"
                    ><i className="fas fa-chevron-right" /></button>
                    <MonthPicker value={ledgerMonth} onChange={(v) => setLedgerMonth(v || thisMonthIso())} placeholder="الشهر" />
                    <button
                      onClick={() => setLedgerMonth(m => addMonthsIso(m || thisMonthIso(), 1))}
                      className="cp-btn cp-btn-secondary" style={{ padding: '8px 12px', fontWeight: 'bold' }}
                      title="الشهر التالي"
                    ><i className="fas fa-chevron-left" /></button>
                    {ledgerMonth !== thisMonthIso() && (
                      <button onClick={() => setLedgerMonth(thisMonthIso())} className="cp-btn cp-btn-info" style={{ padding: '8px 14px', fontWeight: 'bold' }}>
                        الشهر الحالي
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          {activeTab === 'reports' && (
            <>
              <div>
                <label style={labelStyle}>من تاريخ</label>
                <DatePicker value={fromDate} onChange={setFromDate} placeholder="من" />
              </div>
              <div>
                <label style={labelStyle}>إلى تاريخ</label>
                <DatePicker value={toDate} onChange={setToDate} placeholder="إلى" />
              </div>
            </>
          )}
          {activeTab === 'ledger' && (
            <div style={{ display: 'flex', gap: '8px', marginInlineStart: 'auto' }}>
              <button onClick={handleWipeTestingData} className="cp-btn" style={{ fontWeight: 'bold', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)' }} title="حذف كافة المعاملات التجريبية والاشتراكات والكتب التي تم إنشاؤها أثناء التجربة">
                <i className="fas fa-eraser" style={{ marginInlineEnd: 6 }} /> تنظيف بيانات التجربة
              </button>
              <button onClick={() => {
                setRevertForm({ removeMonthly: false, removeBooklet: false, monthlyMonth: '' });
                setShowRevertModal(true);
              }} className="cp-btn" style={{ fontWeight: 'bold', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <i className="fas fa-trash-can" style={{ marginInlineEnd: 6 }} /> إلغاء دفعات الطلاب
              </button>
              <button onClick={() => openEntryForm()} className="cp-btn cp-btn-success" style={{ fontWeight: 'bold' }}>
                <i className="fas fa-plus" style={{ marginInlineEnd: 6 }} /> تسجيل إيراد / مصروف
              </button>
              <button onClick={exportLedgerCsv} className="cp-btn cp-btn-info" style={{ fontWeight: 'bold' }}>
                <i className="fas fa-file-csv" style={{ marginInlineEnd: 6 }} /> CSV
              </button>
              <button onClick={printLedger} className="cp-btn cp-btn-info" style={{ fontWeight: 'bold' }}>
                <i className="fas fa-print" style={{ marginInlineEnd: 6 }} /> طباعة / PDF
              </button>
            </div>
          )}
          {activeTab === 'reports' && (
            <button onClick={printReport} className="cp-btn cp-btn-info" style={{ fontWeight: 'bold', marginInlineStart: 'auto' }}>
              <i className="fas fa-print" style={{ marginInlineEnd: 6 }} /> طباعة / PDF
            </button>
          )}
        </div>
      )}

      {/* Entry form */}
      {showEntryForm && (
        <form onSubmit={handleSaveEntry} style={{ ...cardStyle, marginBottom: '20px', animation: 'cpFadeUp 0.2s ease' }}>
          <h4 style={{ margin: '0 0 16px', fontWeight: 'bold' }}>{entryEditing ? 'تعديل عملية' : 'تسجيل عملية جديدة'}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>نوع العملية</label>
              <select value={entryDirection} onChange={(e) => { setEntryDirection(e.target.value); setEntryCategoryId('') }} className="cp-input" style={{ width: '100%' }}>
                <option value="in">إيراد (وارد)</option>
                <option value="out">مصروف (منصرف)</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>التصنيف</label>
              <select value={entryCategoryId} onChange={(e) => setEntryCategoryId(e.target.value)} className="cp-input" style={{ width: '100%' }}>
                <option value="">بدون تصنيف</option>
                {activeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>المبلغ (ج.م)</label>
              <input type="number" min="0" step="0.01" value={entryAmount} onChange={(e) => setEntryAmount(e.target.value)} className="cp-input" style={{ width: '100%' }} required />
            </div>
            <div>
              <label style={labelStyle}>تاريخ العملية الفعلي (يدعم تواريخ سابقة)</label>
              <DatePicker value={entryDate} onChange={setEntryDate} style={{ width: '100%' }} placeholder="التاريخ" />
            </div>
          </div>
          <label style={labelStyle}>البيان / الوصف</label>
          <input type="text" value={entryDescription} onChange={(e) => setEntryDescription(e.target.value)} placeholder="مثال: فاتورة كهرباء شهر يوليو" className="cp-input" style={{ width: '100%', marginBottom: '14px' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" disabled={entrySaving} className="cp-btn cp-btn-success" style={{ fontWeight: 'bold' }}>
              {entrySaving ? 'جاري الحفظ...' : 'حفظ العملية'}
            </button>
            <button type="button" onClick={() => { setShowEntryForm(false); setEntryEditing(null) }} className="cp-btn cp-btn-secondary">إلغاء</button>
          </div>
        </form>
      )}

      {/* ── Daily ledger ── */}
      {activeTab === 'ledger' && (
        ledgerLoading ? (
          <div className="cp-empty"><i className="fas fa-spinner fa-spin" /><p>جاري تحميل الدفتر...</p></div>
        ) : (
          <>
          {/* Period totals — premium stat cards (same family as the cash-balance chip) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            {[
              [`رصيد بداية ${ledgerScope === 'day' ? 'اليوم' : 'الشهر'}`, ledger.opening_balance, '#06b6d4', 'fa-wallet'],
              [`إجمالي وارد ${ledgerScope === 'day' ? 'اليوم' : 'الشهر'}`, dayTotals.dayIn, '#10b981', 'fa-arrow-trend-up'],
              [`إجمالي منصرف ${ledgerScope === 'day' ? 'اليوم' : 'الشهر'}`, dayTotals.dayOut, '#ef4444', 'fa-arrow-trend-down'],
              [`رصيد نهاية ${ledgerScope === 'day' ? 'اليوم' : 'الشهر'}`, dayTotals.closing, '#f59e0b', 'fa-sack-dollar'],
            ].map(([label, value, color, icon]) => (
              <div key={label} style={{
                padding: '16px 20px', borderRadius: '14px',
                background: `color-mix(in srgb, ${color} 9%, transparent)`,
                border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
                display: 'flex', alignItems: 'center', gap: '14px'
              }}>
                <div style={{
                  width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0,
                  background: `color-mix(in srgb, ${color} 18%, transparent)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <i className={`fas ${icon}`} style={{ color, fontSize: '1.05rem' }} />
                </div>
                <div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--cp-text-muted)', display: 'block', fontWeight: 700 }}>{label}</span>
                  <span style={{ color, fontSize: '1.3rem', fontWeight: 800 }}>{fmtMoney(value)}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--cp-divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', fontSize: '0.86rem', fontWeight: 'bold' }}>
              <span style={{ color: 'var(--cp-text-muted)' }}>
                <i className={`fas ${ledgerScope === 'day' ? 'fa-calendar-day' : 'fa-calendar-days'}`} style={{ marginInlineEnd: 6 }} />
                {ledgerScope === 'day' ? fmtDayLong(ledgerDate) : `شهر ${fmtMonthLong(ledgerMonth)}`}
              </span>
              <span>{entriesWithRunning.length} عملية</span>
            </div>
            {entriesWithRunning.length === 0 ? (
              <div className="cp-empty"><i className="fas fa-book-open" /><p>{ledgerScope === 'day' ? 'لا توجد عمليات مالية في هذا اليوم' : 'لا توجد عمليات مالية في هذا الشهر'}</p></div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--cp-list-header-bg)', borderBottom: '1px solid var(--cp-divider)' }}>
                      <th style={{ padding: '13px 16px', fontWeight: 'bold' }}>التاريخ</th>
                      <th style={{ padding: '13px', fontWeight: 'bold' }}>التصنيف</th>
                      <th style={{ padding: '13px', fontWeight: 'bold' }}>البيان</th>
                      <th style={{ padding: '13px', fontWeight: 'bold', color: '#10b981' }}>وارد</th>
                      <th style={{ padding: '13px', fontWeight: 'bold', color: '#ef4444' }}>منصرف</th>
                      <th style={{ padding: '13px', fontWeight: 'bold' }}>الرصيد</th>
                      <th style={{ padding: '13px 16px', fontWeight: 'bold', width: '110px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entriesWithRunning.map((e) => (
                      <tr key={`${e.source}-${e.id}`} style={{ borderBottom: '1px solid var(--cp-list-item-border)' }}>
                        <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>{fmtDate(e.transaction_date)}</td>
                        <td style={{ padding: '11px' }}><span className="cp-id-pill">{e.category}</span></td>
                        <td style={{ padding: '11px' }}>
                          {e.description}
                          {e.student_name && <span style={{ color: 'var(--cp-text-muted)', fontSize: '0.8rem' }}> — {e.student_name}</span>}
                        </td>
                        <td style={{ padding: '11px', color: '#10b981', fontWeight: 'bold' }}>{e.direction === 'in' ? fmtMoney(e.amount) : ''}</td>
                        <td style={{ padding: '11px', color: '#ef4444', fontWeight: 'bold' }}>{e.direction === 'out' ? fmtMoney(e.amount) : ''}</td>
                        <td style={{ padding: '11px', fontWeight: 800 }}>{fmtMoney(e.running)}</td>
                        <td style={{ padding: '11px 16px' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => {
                                if (e.source === 'finance_transactions') {
                                  // The ledger RPC returns the category NAME — resolve it
                                  // back to its id so editing doesn't clear the category.
                                  const cat = categories.find(c => c.name === e.category)
                                  openEntryForm({ id: e.id, direction: e.direction, category_id: cat?.id || null, amount: e.amount, description: e.description, transaction_date: e.transaction_date })
                                } else {
                                  setLedgerEditRow(e)
                                  setLedgerEditAmount(String(e.amount))
                                  setLedgerEditDate(e.transaction_date)
                                }
                              }}
                              className="cp-btn cp-btn-secondary" style={{ padding: '4px 10px', fontSize: '0.76rem' }}
                            >تعديل</button>
                            <button
                              onClick={() => setDeleteTarget({ kind: e.source === 'finance_transactions' ? 'tx' : 'ledger', row: e })}
                              className="cp-btn" style={{ padding: '4px 10px', fontSize: '0.76rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                            >حذف</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </>
        )
      )}

      {/* ── Categories ── */}
      {activeTab === 'categories' && (
        <div style={{ display: 'grid', gap: '20px' }}>
          <form onSubmit={handleAddCategory} style={{ ...cardStyle, display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '200px' }}>
              <label style={labelStyle}>اسم التصنيف الجديد</label>
              <input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="مثال: بيع كتب، صيانة..." className="cp-input" style={{ width: '100%' }} required />
            </div>
            <div style={{ flex: 1, minWidth: '140px' }}>
              <label style={labelStyle}>النوع</label>
              <select value={newCatKind} onChange={(e) => setNewCatKind(e.target.value)} className="cp-input" style={{ width: '100%' }}>
                <option value="revenue">إيراد</option>
                <option value="expense">مصروف</option>
              </select>
            </div>
            <button type="submit" className="cp-btn cp-btn-success" style={{ fontWeight: 'bold' }}>إضافة تصنيف</button>
          </form>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {['revenue', 'expense'].map(kind => (
              <div key={kind} style={{ ...cardStyle }}>
                <h4 style={{ margin: '0 0 14px', fontWeight: 'bold', color: kind === 'revenue' ? '#10b981' : '#ef4444' }}>
                  <i className={`fas ${kind === 'revenue' ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}`} style={{ marginInlineEnd: 6 }} />
                  تصنيفات {kind === 'revenue' ? 'الإيرادات' : 'المصروفات'}
                </h4>
                {categories.filter(c => c.kind === kind).map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--cp-divider)', gap: '8px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '0.9rem', opacity: c.is_active ? 1 : 0.45 }}>{c.name}</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => updateFinanceCategory(c.id, { is_active: !c.is_active }).then(reloadCategories).catch(err => flash(err.message, 'error'))}
                        className="cp-btn cp-btn-secondary" style={{ padding: '3px 10px', fontSize: '0.74rem' }}
                      >{c.is_active ? 'تعطيل' : 'تفعيل'}</button>
                      <button
                        onClick={() => setDeleteTarget({ kind: 'category', row: c })}
                        className="cp-btn" style={{ padding: '3px 10px', fontSize: '0.74rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                      >حذف</button>
                    </div>
                  </div>
                ))}
                {categories.filter(c => c.kind === kind).length === 0 && (
                  <p style={{ color: 'var(--cp-text-muted)', fontSize: '0.85rem' }}>لا توجد تصنيفات بعد</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Reports ── */}
      {activeTab === 'reports' && (
        reportLoading ? (
          <div className="cp-empty"><i className="fas fa-spinner fa-spin" /><p>جاري إعداد التقرير...</p></div>
        ) : report ? (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div className="cp-home-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px' }}>
              {[
                ['إجمالي الإيرادات', report.revenue_total, '#10b981'],
                ['اشتراكات الطلاب', report.subscriptions_total, '#06b6d4'],
                ['إيرادات أخرى', report.other_revenue_total, '#8b5cf6'],
                ['المصروفات', report.expenses_total, '#ef4444'],
                ['صافي الدخل', report.net_income, Number(report.net_income) >= 0 ? '#10b981' : '#ef4444'],
              ].map(([label, value, color]) => (
                <div key={label} style={{ ...cardStyle, padding: '16px', textAlign: 'center', borderTop: `4px solid ${color}` }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', fontWeight: 'bold' }}>{label}</span>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '8px', color }}>{fmtMoney(value)}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {[
                ['الإيرادات الأخرى حسب التصنيف', report.other_revenue_by_category, '#8b5cf6'],
                ['المصروفات حسب التصنيف', report.expenses_by_category, '#ef4444'],
              ].map(([heading, list, color]) => (
                <div key={heading} style={cardStyle}>
                  <h4 style={{ margin: '0 0 14px', fontWeight: 'bold', color }}>{heading}</h4>
                  {(list || []).length === 0 ? (
                    <p style={{ color: 'var(--cp-text-muted)', fontSize: '0.85rem' }}>لا توجد عمليات في هذه الفترة</p>
                  ) : (
                    (list || []).map(r => (
                      <div key={r.category} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--cp-divider)', fontSize: '0.9rem' }}>
                        <span style={{ fontWeight: 'bold' }}>{r.category}</span>
                        <span style={{ fontWeight: 800, color }}>{fmtMoney(r.total)}</span>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null
      )}

      {/* ── Booklets (manage / reports) — Booklet Payment lives on the
             Payment Confirmation page (Payments.jsx) beside manual payment. ── */}
      {activeTab === 'booklets_manage' && <BookletsPanel mode="manage" flash={flash} />}
      {activeTab === 'booklets_reports' && <BookletsPanel mode="reports" flash={flash} />}

      {/* ── Debts ── */}
      {activeTab === 'debts' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={debtSearch}
              onChange={(e) => setDebtSearch(e.target.value)}
              placeholder="ابحث باسم الطالب أو هاتف ولي الأمر..."
              className="cp-input"
              style={{ flex: 1, minWidth: '220px', maxWidth: '400px' }}
            />
            <button onClick={exportDebtsCsv} className="cp-btn cp-btn-info" style={{ fontWeight: 'bold' }}>
              <i className="fas fa-file-csv" style={{ marginInlineEnd: 6 }} /> تصدير CSV
            </button>
          </div>
          {debtsLoading ? (
            <div className="cp-empty"><i className="fas fa-spinner fa-spin" /><p>جاري تحميل المتأخرات...</p></div>
          ) : filteredDebts.length === 0 ? (
            <div className="cp-empty"><i className="fas fa-circle-check" /><p>لا توجد مديونيات متأخرة 🎉</p></div>
          ) : (
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--cp-list-header-bg)', borderBottom: '1px solid var(--cp-divider)' }}>
                      <th style={{ padding: '13px 16px', fontWeight: 'bold' }}>اسم الطالب</th>
                      <th style={{ padding: '13px', fontWeight: 'bold' }}>المرحلة</th>
                      <th style={{ padding: '13px', fontWeight: 'bold' }}>المجموعة</th>
                      <th style={{ padding: '13px', fontWeight: 'bold' }}>هاتف ولي الأمر</th>
                      <th style={{ padding: '13px 16px', fontWeight: 'bold' }}>المبلغ المتبقي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDebts.map(d => (
                      <tr key={d.student_id} style={{ borderBottom: '1px solid var(--cp-list-item-border)' }}>
                        <td style={{ padding: '11px 16px', fontWeight: 'bold' }}>{d.name}</td>
                        <td style={{ padding: '11px' }}>{GRADE_LABEL[d.grade] || d.grade || '—'}</td>
                        <td style={{ padding: '11px' }}><span className="cp-id-pill">{d.group || '—'}</span></td>
                        <td style={{ padding: '11px', direction: 'ltr' }}>{d.parent_phone || '—'}</td>
                        <td style={{ padding: '11px 16px', fontWeight: 800, color: '#ef4444' }}>{fmtMoney(d.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit student-ledger payment modal */}
      {ledgerEditRow && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(6px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setLedgerEditRow(null)}>
          <div style={{ ...cardStyle, maxWidth: '420px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ margin: '0 0 6px', fontWeight: 'bold' }}>تعديل دفعة طالب</h4>
            <p style={{ margin: '0 0 16px', fontSize: '0.84rem', color: 'var(--cp-text-muted)' }}>
              {ledgerEditRow.description} {ledgerEditRow.student_name ? `— ${ledgerEditRow.student_name}` : ''}
            </p>
            <label style={labelStyle}>المبلغ (ج.م)</label>
            <input type="number" min="0" step="0.01" value={ledgerEditAmount} onChange={(e) => setLedgerEditAmount(e.target.value)} className="cp-input" style={{ width: '100%', marginBottom: '12px' }} />
            <label style={labelStyle}>تاريخ العملية الفعلي</label>
            <DatePicker value={ledgerEditDate} onChange={setLedgerEditDate} style={{ width: '100%' }} placeholder="التاريخ" />
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={handleSaveLedgerEdit} className="cp-btn cp-btn-success" style={{ fontWeight: 'bold' }}>حفظ التعديل</button>
              <button onClick={() => setLedgerEditRow(null)} className="cp-btn cp-btn-secondary">إلغاء</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {deleteTarget && (
        <ConfirmDeleteDialog
          title="تأكيد الحذف"
          itemLabel={deleteTarget.row.description || deleteTarget.row.name || 'هذا العنصر'}
          message={deleteTarget.kind === 'category'
            ? 'سيتم حذف التصنيف؛ العمليات المسجلة عليه تبقى محفوظة بدون تصنيف.'
            : 'سيتم حذف هذه العملية المالية نهائياً وستتأثر الأرصدة والتقارير فوراً.'}
          confirmText="نعم، احذف"
          cancelText="إلغاء"
          onConfirm={handleConfirmedDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {/* Revert student payments modal */}
      {showRevertModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(6px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setShowRevertModal(false)}>
          <form onSubmit={handleRevertSubmit} style={{ ...cardStyle, maxWidth: '440px', width: '100%', color: '#fff', direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px', color: '#ef4444' }}>
              <i className="fas fa-trash-can" style={{ marginInlineEnd: 8, color: '#ef4444' }}></i>
              إلغاء وحذف الدفعات لجميع طلاب المنصة
            </h3>

            <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', fontSize: '0.88rem', color: '#fca5a5' }}>
              <strong style={{ color: '#f87171' }}>⚠️ سيتم إلغاء وحذف الدفعات لجميع طلاب المنصة بالكامل!</strong>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', opacity: 0.85 }}>سيقوم النظام بإلغاء المدفوعات المسجلة وإرجاعها لحالة غير مدفوع.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--cp-text-main)' }}>
                  <input 
                    type="checkbox" 
                    checked={revertForm.removeMonthly} 
                    onChange={(e) => setRevertForm({ ...revertForm, removeMonthly: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: '#ef4444' }}
                  />
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>إلغاء وحذف الاشتراك الشهري (Monthly Payment)</span>
                </label>
              </div>

              {revertForm.removeMonthly && (
                <div style={{ paddingInlineStart: '28px', marginBottom: '4px' }}>
                  <label style={{ ...labelStyle, marginBottom: '4px' }}>الشهر المراد إلغاؤه *</label>
                  <select 
                    value={revertForm.monthlyMonth} 
                    onChange={(e) => setRevertForm({ ...revertForm, monthlyMonth: e.target.value })} 
                    className="cp-input" 
                    style={{ width: '200px', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                    required
                  >
                    <option style={{ background: '#0f172a', color: '#fff' }} value="">اختر الشهر...</option>
                    {['سبتمبر','أكتوبر','نوفمبر','ديسمبر','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس'].map(m => (
                      <option key={m} style={{ background: '#0f172a', color: '#fff' }} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--cp-text-main)' }}>
                  <input 
                    type="checkbox" 
                    checked={revertForm.removeBooklet} 
                    onChange={(e) => setRevertForm({ ...revertForm, removeBooklet: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: '#ef4444' }}
                  />
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>إلغاء دفع الملازم (Revert Booklet Payment)</span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="submit" disabled={submittingRevert || (!revertForm.removeMonthly && !revertForm.removeBooklet)} className="cp-btn" style={{ flex: 1, padding: '12px', fontWeight: 'bold', background: '#ef4444', color: '#fff', border: 'none' }}>
                {submittingRevert ? 'جاري الإلغاء والحذف...' : 'تأكيد الحذف والإلغاء'}
              </button>
              <button type="button" onClick={() => setShowRevertModal(false)} className="cp-btn cp-btn-secondary" style={{ padding: '12px 24px' }}>
                إلغاء
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </div>
  )
}
