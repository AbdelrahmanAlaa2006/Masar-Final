import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { listStudentsPaged, getStudentStatusCounts, listStudentsByGrade, updateStudentStatus, updateStudentProfile, createStudentByAdmin } from '@backend/profilesApi'
import { listBranches } from '@backend/branchesApi'
import { listAcademicYears } from '@backend/academicYearsApi'
import { createNotification } from '@backend/notificationsApi'
import { listGroups, assignStudentToGroup, setStudentGroups, listStudentsByGroup } from '@backend/groupsApi'
import { getBulkInitialPaymentsPreview, registerBulkInitialPayments, removeBulkInitialPayments } from '@backend/paymentsApi'
import { initials, GRADE_LABEL } from './shared'
import { printStudentLabels, LABEL_SIZE_OPTIONS, DEFAULT_LABEL_SIZE, barcodeImageUrl } from '../../utils/barcodeLabels'
import { buildStudentExportRows, downloadStudentsCsv, printStudentsList } from '../../utils/studentsExport'
import { invalidate as invalidateCache } from '../../utils/cache'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '@backend/supabase'
import ConfirmDeleteDialog from '../../components/ConfirmDeleteDialog'
import { useTenant } from '../../contexts/TenantContext'
import { generateTenantPassword } from '../../utils/tenantPassword'

const fmtMoney = (n) => `${Number(n || 0).toLocaleString('ar-EG')} ج.م`

const fmtDate = (iso) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return ''
  }
}

const fmtDateTime = (iso) => {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return ''
  }
}

export default function AccountsPanel({ onBack, flash }) {
  const { user: currentUser } = useAuth()
  const { gradesList, tenantId, tenantName, tenant, tenantSlug } = useTenant()
  const [students, setStudents] = useState([])
  const [branches, setBranches] = useState([])
  const [academicYears, setAcademicYears] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  
  // Search and filters
  const [query, setQuery] = useState('')
  const [selectedGrade, setSelectedGrade] = useState('all')
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [selectedGroup, setSelectedGroup] = useState('all')
  const [statusTab, setStatusTab] = useState('pending')
  const [sortBy, setSortBy] = useState('created_at_desc')

  // Selected label size + multi-select state (checkboxes in the table).
  const [labelSize, setLabelSize] = useState(DEFAULT_LABEL_SIZE)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkPrinting, setBulkPrinting] = useState(false)
  const [printGroupId, setPrintGroupId] = useState('')
  const [exporting, setExporting] = useState(false)

  // Server-side pagination state (replaces loading the whole tenant roster).
  const PAGE_SIZE = 50
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [counts, setCounts] = useState({ pending: 0, active: 0, inactive: 0, suspended: 0, total: 0 })

  // Modals
  const [showQrModal, setShowQrModal] = useState(false)
  const [selectedQrStudent, setSelectedQrStudent] = useState(null)
  
  const [showEditModal, setShowEditModal] = useState(false)
  const [editStudent, setEditStudent] = useState(null)
  const [deletingStudent, setDeletingStudent] = useState(null)

  // Add student modal and state
  const [showAddModal, setShowAddModal] = useState(false)
  const [showAddPassword, setShowAddPassword] = useState(false)
  const [addStudentForm, setAddStudentForm] = useState({
    name: '',
    phone: '',
    password: '',
    grade: '',
    branch_id: '',
    selectedGroupId: '',
    hasSecondGroup: false,
    secondaryGroupId: '',
    enrollment_type: 'CENTER',
    status: 'active',
    subscription_discount: 0,
    parent_phone: '',
    registerMonthly: false,
    monthlyMonth: '',
    registerBooklet: false
  })

  // Bulk pay / remove modals and states
  const [showBulkPayModal, setShowBulkPayModal] = useState(false)
  const [bulkPayForm, setBulkPayForm] = useState({
    registerMonthly: false,
    registerBooklet: false,
    monthlyMonth: ''
  })
  const [bulkPreview, setBulkPreview] = useState(null)
  const [loadingBulkPreview, setLoadingBulkPreview] = useState(false)
  const [bulkPaySummary, setBulkPaySummary] = useState(null)

  const [showBulkRemoveModal, setShowBulkRemoveModal] = useState(false)
  const [bulkRemoveForm, setBulkRemoveForm] = useState({
    removeMonthly: false,
    removeBooklet: false,
    monthlyMonth: ''
  })
  const [submittingBulkAction, setSubmittingBulkAction] = useState(false)

  // Branches / years / groups are small and stable — load once (cached).
  useEffect(() => {
    ;(async () => {
      try {
        const [branchesData, yearsData, groupsData] = await Promise.all([
          listBranches(),
          listAcademicYears(),
          listGroups()
        ])
        setBranches(branchesData || [])
        setAcademicYears(yearsData || [])
        setGroups(groupsData || [])
      } catch (e) {
        setError(e.message || 'تعذّر تحميل الفروع أو المجموعات')
      }
    })()
  }, [])

  // Load one page of students for the active tab/grade/search/sort. Server-side
  // filtering + .range() means we never pull the whole roster into the browser.
  const loadPage = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      let sortCol = 'created_at'
      let sortDir = 'desc'
      if (sortBy === 'created_at_asc') { sortCol = 'created_at'; sortDir = 'asc' }
      else if (sortBy === 'name_asc') { sortCol = 'name'; sortDir = 'asc' }
      else if (sortBy === 'name_desc') { sortCol = 'name'; sortDir = 'desc' }

      const { rows, count } = await listStudentsPaged({
        page, pageSize: PAGE_SIZE, statusTab, grade: selectedGrade, branchId: selectedBranch, groupId: selectedGroup, search: debouncedQuery, sortBy: sortCol, sortOrder: sortDir
      })
      setStudents(rows)
      setTotalCount(count)
    } catch (e) {
      setError(e.message || 'تعذّر تحميل قائمة الطلاب')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [page, statusTab, selectedGrade, selectedBranch, selectedGroup, debouncedQuery, sortBy])

  // Tab badge counts come from cheap head-only COUNT queries (constant size).
  const reloadCounts = useCallback(async () => {
    try {
      setCounts(await getStudentStatusCounts({ grade: selectedGrade, branchId: selectedBranch, groupId: selectedGroup }))
    } catch { /* badges are non-critical */ }
  }, [selectedGrade, selectedBranch, selectedGroup])

  useEffect(() => { loadPage() }, [loadPage])
  useEffect(() => { reloadCounts() }, [reloadCounts])

  // Debounce the search box and reset to the first page on a new term.
  useEffect(() => {
    const id = setTimeout(() => { setDebouncedQuery(query); setPage(0) }, 350)
    return () => clearTimeout(id)
  }, [query])

  // Reset to the first page whenever the tab, grade, or sort filter changes.
  useEffect(() => { setPage(0) }, [statusTab, selectedGrade, selectedBranch, selectedGroup, sortBy])

  // If the selected group or print group doesn't belong to the newly selected grade or branch, reset it
  useEffect(() => {
    if (selectedGroup !== 'all') {
      const activeGroupObj = groups.find(g => g.id === selectedGroup)
      if (activeGroupObj) {
        const matchesGrade = selectedGrade === 'all' || activeGroupObj.grade === selectedGrade
        const matchesBranch = selectedBranch === 'all' || activeGroupObj.branch_id === selectedBranch
        if (!matchesGrade || !matchesBranch) {
          setSelectedGroup('all')
        }
      }
    }
    if (printGroupId) {
      const activeGroupObj = groups.find(g => g.id === printGroupId)
      if (activeGroupObj) {
        const matchesGrade = selectedGrade === 'all' || activeGroupObj.grade === selectedGrade
        const matchesBranch = selectedBranch === 'all' || activeGroupObj.branch_id === selectedBranch
        if (!matchesGrade || !matchesBranch) {
          setPrintGroupId('')
        }
      }
    }
  }, [selectedGrade, selectedBranch, groups, selectedGroup, printGroupId])

  // After a mutation, refresh the current page rows + tab counts quietly.
  const softRefresh = useCallback(() => {
    reloadCounts()
    loadPage({ silent: true })
  }, [reloadCounts, loadPage])

  const refreshList = async () => {
    await Promise.all([loadPage({ silent: true }), reloadCounts()])
  }

  const handleUpdateStatus = async (student, is_approved, is_active) => {
    if (busyId) return
    setBusyId(student.id)
    try {
      await updateStudentStatus(student.id, { is_approved, is_active })
      
      // Dispatch database notifications
      if (is_approved && is_active) {
        try {
          await createNotification({
            title: 'تم تفعيل حسابك بنجاح!',
            message: 'مرحباً بك! لقد قام المسؤول بالموافقة على حسابك وتفعيله. يمكنك الآن مشاهدة المحتوى وحل الواجبات والامتحانات بحرية.',
            scope: 'student',
            targetStudent: student.id,
            level: 'success',
            createdBy: currentUser?.id
          })
        } catch (err) {
          console.error(err)
        }
      }
      
      // Update local state
      setStudents(prev => prev.map(s => s.id === student.id ? { ...s, is_approved, is_active, status: is_approved && is_active ? 'active' : 'inactive' } : s))
      flash(`تم تحديث حالة الطالب: ${student.name}`, 'success')
      softRefresh()
    } catch (e) {
      flash(e.message || 'تعذّر تحديث حالة الطالب', 'warning')
    } finally {
      setBusyId(null)
    }
  }

  const confirmDeleteStudent = async () => {
    if (!deletingStudent) return
    const student = deletingStudent
    setDeletingStudent(null)
    setBusyId(student.id)
    try {
      const { error: rpcError } = await supabase.rpc('delete_student_account', {
        p_student_id: student.id
      })
      if (rpcError) throw rpcError
      
      setStudents(prev => prev.filter(s => s.id !== student.id))
      invalidateCache('students')
      flash(`تم حذف حساب الطالب "${student.name}" بنجاح.`, 'success')
      softRefresh()
    } catch (e) {
      flash(e.message || 'تعذّر حذف حساب الطالب', 'warning')
    } finally {
      setBusyId(null)
    }
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!editStudent) return
    setBusyId(editStudent.id)
    try {
      const updated = await updateStudentProfile(editStudent.id, editStudent)
      
      // Update group assignments in student_groups join table
      const primaryGId = editStudent.selectedGroupId || null
      const secGId = (editStudent.hasSecondGroup && editStudent.secondaryGroupId) ? editStudent.secondaryGroupId : null
      
      await setStudentGroups(editStudent.id, {
        primaryGroupId: primaryGId,
        secondaryGroupId: secGId
      })

      const primaryGroupObj = groups.find(g => g.id === primaryGId)
      const groupName = primaryGroupObj ? primaryGroupObj.name : ''
      const updatedGroups = []
      if (primaryGId) updatedGroups.push({ group_id: primaryGId, is_primary: true })
      if (secGId) updatedGroups.push({ group_id: secGId, is_primary: false })
      
      setStudents(prev => prev.map(s => s.id === editStudent.id ? { 
        ...s, 
        ...updated, 
        group: groupName, 
        student_groups: updatedGroups 
      } : s))

      flash('تم تحديث بيانات الطالب وحفظ التغييرات بنجاح', 'success')
      setShowEditModal(false)
      setEditStudent(null)
      softRefresh()
    } catch (err) {
      console.error(err)
      flash('حدث خطأ أثناء تعديل بيانات الطالب: ' + err.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const loadBulkPreview = async (form = bulkPayForm) => {
    setLoadingBulkPreview(true)
    try {
      const res = await getBulkInitialPaymentsPreview({
        studentIds: Array.from(selectedIds),
        registerMonthly: form.registerMonthly,
        registerBooklet: form.registerBooklet,
        monthlyMonth: form.monthlyMonth
      })
      setBulkPreview(res)
    } catch (e) {
      console.error('Failed to load bulk payments preview:', e)
    } finally {
      setLoadingBulkPreview(false)
    }
  }

  useEffect(() => {
    if (showBulkPayModal && selectedIds.size > 0) {
      loadBulkPreview()
    }
  }, [showBulkPayModal, selectedIds, bulkPayForm.registerMonthly, bulkPayForm.registerBooklet, bulkPayForm.monthlyMonth])

  const handleAddSubmit = async (e) => {
    e.preventDefault()
    if (!addStudentForm.phone.trim()) {
      flash('رقم هاتف أو كود الطالب مطلوب', 'warning')
      return
    }
    if (!addStudentForm.parent_phone.trim()) {
      flash('رقم هاتف ولي الأمر مطلوب', 'warning')
      return
    }
    if (addStudentForm.parent_phone.trim().length < 4) {
      flash('رقم هاتف ولي الأمر غير صحيح (يجب أن يكون 4 أرقام على الأقل)', 'warning')
      return
    }
    if (addStudentForm.password.length < 6) {
      flash('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'warning')
      return
    }
    if (addStudentForm.registerMonthly && !addStudentForm.monthlyMonth) {
      flash('يجب اختيار شهر الاشتراك للمدفوعات الشهرية', 'warning')
      return
    }

    setBusyId('new-student')
    try {
      const groupObj = addStudentForm.selectedGroupId ? groups.find(g => g.id === addStudentForm.selectedGroupId) : null
      
      await createStudentByAdmin({
        name: addStudentForm.name,
        phone: addStudentForm.phone,
        password: addStudentForm.password,
        grade: addStudentForm.grade,
        parentPhone: addStudentForm.parent_phone,
        enrollmentType: addStudentForm.enrollment_type,
        branchId: addStudentForm.branch_id || null,
        groupId: addStudentForm.selectedGroupId || null,
        secondaryGroupId: (addStudentForm.hasSecondGroup && addStudentForm.secondaryGroupId) ? addStudentForm.secondaryGroupId : null,
        groupName: groupObj ? groupObj.name : '',
        status: addStudentForm.status,
        subscriptionDiscount: addStudentForm.subscription_discount,
        tenantId: tenantId,
        registerMonthly: addStudentForm.registerMonthly,
        monthlyMonth: addStudentForm.monthlyMonth,
        registerBooklet: addStudentForm.registerBooklet,
        adminId: currentUser.id
      })

      flash('تم إنشاء حساب الطالب وتسجيل المدفوعات المحددة بنجاح', 'success')
      setShowAddModal(false)
      softRefresh()
    } catch (err) {
      console.error(err)
      flash('فشل إنشاء حساب الطالب: ' + (err.message || ''), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleBulkPaySubmit = async (e) => {
    e.preventDefault()
    if (bulkPayForm.registerMonthly && !bulkPayForm.monthlyMonth) {
      flash('يجب اختيار شهر الاشتراك', 'warning')
      return
    }
    setSubmittingBulkAction(true)
    try {
      const result = await registerBulkInitialPayments({
        studentIds: Array.from(selectedIds),
        registerMonthly: bulkPayForm.registerMonthly,
        registerBooklet: bulkPayForm.registerBooklet,
        monthlyMonth: bulkPayForm.monthlyMonth,
        adminId: currentUser.id
      })
      setBulkPaySummary(result)
      setShowBulkPayModal(false)
      setSelectedIds(new Set()) // clear selection
      softRefresh()
    } catch (err) {
      console.error(err)
      flash('حدث خطأ أثناء تسجيل الدفعات: ' + (err.message || ''), 'error')
    } finally {
      setSubmittingBulkAction(false)
    }
  }

  const handleBulkRemoveSubmit = async (e) => {
    e.preventDefault()
    if (bulkRemoveForm.removeMonthly && !bulkRemoveForm.monthlyMonth) {
      flash('يجب اختيار شهر الاشتراك لإزالة الدفعات', 'warning')
      return
    }
    setSubmittingBulkAction(true)
    try {
      await removeBulkInitialPayments({
        studentIds: selectedIds.size > 0 ? Array.from(selectedIds) : null,
        removeMonthly: bulkRemoveForm.removeMonthly,
        removeBooklet: bulkRemoveForm.removeBooklet,
        monthlyMonth: bulkRemoveForm.monthlyMonth
      })
      flash(selectedIds.size > 0 ? 'تمت إزالة الدفعات المحددة للطلاب المحددين بنجاح' : 'تمت إزالة الدفعات لجميع طلاب المنصة بنجاح', 'success')
      setShowBulkRemoveModal(false)
      setSelectedIds(new Set()) // clear selection
      softRefresh()
    } catch (err) {
      console.error(err)
      flash('حدث خطأ أثناء إزالة الدفعات: ' + (err.message || ''), 'error')
    } finally {
      setSubmittingBulkAction(false)
    }
  }

  // Resolve a student's current group name (so a printed barcode always shows
  // the latest group — if an admin moves the student, the next print updates).
  const getGroupName = (student) => {
    if (student?.student_groups && student.student_groups.length > 0) {
      const names = student.student_groups
        .map(sg => groups.find(g => g.id === sg.group_id)?.name)
        .filter(Boolean)
      if (names.length > 0) return names.join(' + ')
    }
    if (student?.group) return student.group
    return ''
  }

  // Map a student row to the fields a thermal label needs. Tenant-aware: grade
  // uses the tenant's GRADE_LABEL and group resolves the student's live group.
  const resolveLabel = (student) => ({
    name: student.name || '',
    grade: GRADE_LABEL[student.grade] || student.grade || '',
    group: getGroupName(student),
    token: student.barcode_token || '',
  })

  // Shared entry point: send a list of students to the thermal-label engine.
  const printLabels = (list, title) => {
    const count = printStudentLabels(list, {
      resolve: resolveLabel,
      size: labelSize,
      title,
      onError: (reason) => {
        if (reason === 'popup-blocked') {
          flash('متصفحك منع فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة وحاول مجدداً.', 'warning')
        } else {
          flash('لا يوجد طلاب بأكواد باركود للطباعة.', 'warning')
        }
      },
    })
    return count
  }

  // 1) Single student (from the card modal).
  const handlePrint = () => {
    if (!selectedQrStudent) return
    printLabels([selectedQrStudent], `باركود - ${selectedQrStudent.name}`)
  }

  // 2) Selected students (checkboxes) on the current page.
  const handlePrintSelected = () => {
    const chosen = students.filter(s => selectedIds.has(s.id))
    if (chosen.length === 0) { flash('لم يتم تحديد أي طالب.', 'warning'); return }
    printLabels(chosen, `باركودات (${chosen.length})`)
  }

  // 3) The whole current page of students.
  const handlePrintPage = () => {
    printLabels(students, `باركودات الصفحة (${students.length})`)
  }

  // 4) A whole group.
  const handlePrintGroup = async () => {
    if (!printGroupId) { flash('اختر مجموعة أولاً.', 'warning'); return }
    if (bulkPrinting) return
    setBulkPrinting(true)
    try {
      const list = await listStudentsByGroup(printGroupId)
      const groupName = groups.find(g => g.id === printGroupId)?.name || 'مجموعة'
      printLabels(list, `باركودات مجموعة ${groupName} (${list.length})`)
    } catch (e) {
      flash('تعذر تحضير باركودات المجموعة: ' + (e.message || ''), 'warning')
    } finally {
      setBulkPrinting(false)
    }
  }

  // 5) Every barcode for the selected grade (or all grades). Unchanged behavior,
  // now routed through the same thermal-label engine.
  const handlePrintAllBarcodes = async () => {
    if (bulkPrinting) return
    setBulkPrinting(true)
    try {
      let all = []
      if (selectedGrade !== 'all') {
        all = await listStudentsByGrade(selectedGrade)
      } else {
        const gradeIds = (gradesList || []).map(g => g.id)
        const results = await Promise.all(gradeIds.map(g => listStudentsByGrade(g)))
        all = results.flat()
      }
      const gradeLabel = selectedGrade !== 'all' ? (GRADE_LABEL[selectedGrade] || selectedGrade) : 'كل المراحل'
      printLabels(all, `باركودات ${gradeLabel}`)
    } catch (e) {
      flash('تعذر تحضير الباركودات للطباعة: ' + (e.message || ''), 'warning')
    } finally {
      setBulkPrinting(false)
    }
  }

  /* ── Export the roster (CSV / printable PDF) ──────────────────────────────
     Exports EVERY student matching the CURRENT filters (tab, grade, branch,
     group, search) — not just the visible page. The table is server-paginated,
     so we page through in chunks instead of pulling the whole tenant roster. */
  const fetchAllFiltered = async () => {
    const CHUNK = 500
    const out = []
    for (let p = 0; p < 200; p++) { // hard stop — 100k rows, never an infinite loop
      const { rows, count } = await listStudentsPaged({
        page: p,
        pageSize: CHUNK,
        statusTab,
        grade: selectedGrade,
        branchId: selectedBranch,
        groupId: selectedGroup,
        search: debouncedQuery,
      })
      out.push(...(rows || []))
      if ((rows || []).length < CHUNK || out.length >= (count || 0)) break
    }
    return out
  }

  // Human-readable description of the active filters, printed under the title.
  const exportSubtitle = () => {
    const parts = [selectedGrade !== 'all' ? (GRADE_LABEL[selectedGrade] || selectedGrade) : 'كل المراحل']
    if (selectedBranch !== 'all') parts.push(branches.find(b => b.id === selectedBranch)?.name)
    if (selectedGroup !== 'all') parts.push(groups.find(g => g.id === selectedGroup)?.name)
    if (debouncedQuery) parts.push(`بحث: ${debouncedQuery}`)
    parts.push(new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }))
    return parts.filter(Boolean).join(' • ')
  }

  const handleExport = async (format) => {
    if (exporting) return
    setExporting(true)
    try {
      const all = await fetchAllFiltered()
      if (all.length === 0) {
        flash('لا يوجد طلاب مطابقون للفلاتر الحالية.', 'warning')
        return
      }
      const rows = buildStudentExportRows(all, { groups, branches, gradeLabel: GRADE_LABEL })

      if (format === 'csv') {
        downloadStudentsCsv(rows, `students-${new Date().toISOString().slice(0, 10)}.csv`)
        flash(`تم تصدير ${rows.length} طالب إلى ملف CSV.`, 'success')
      } else {
        printStudentsList(rows, {
          title: `كشف الطلاب — ${tenantName || 'المنصة'}`,
          subtitle: exportSubtitle(),
          onError: (reason) => flash(
            reason === 'popup-blocked'
              ? 'متصفحك منع فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة وحاول مجدداً.'
              : 'لا يوجد طلاب للطباعة.',
            'warning'
          ),
        })
        flash(`تم تجهيز ${rows.length} طالب للطباعة — اختر «حفظ كـ PDF» من نافذة الطباعة.`, 'success')
      }
    } catch (e) {
      flash('تعذّر التصدير: ' + (e.message || ''), 'warning')
    } finally {
      setExporting(false)
    }
  }

  // Selection helpers (scoped to the current page of `students`).
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const pageIds = students.map(s => s.id)
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id))
  const toggleSelectAllPage = () => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allPageSelected) pageIds.forEach(id => next.delete(id))
      else pageIds.forEach(id => next.add(id))
      return next
    })
  }
  // Drop selections that are no longer on the visible page (page/filter change).
  useEffect(() => {
    setSelectedIds(prev => {
      const visible = new Set(pageIds)
      const next = new Set([...prev].filter(id => visible.has(id)))
      return next.size === prev.size ? prev : next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students])

  // Tab badge counts now come from the server (see reloadCounts).
  const stats = counts

  // The server already returns exactly the rows for the active tab/grade/search,
  // so the rendered list is simply the current page.
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <section className="cp-panel" style={{ direction: 'rtl' }}>
      {onBack && (
        <button className="cp-back" type="button" onClick={onBack}>
          <i className="fas fa-arrow-right"></i> رجوع
        </button>
      )}

      <div className="cp-panel-header">
        <h2><i className="fas fa-user-check" style={{ color: '#10b981' }}></i> حسابات الطلاب والتفعيل</h2>
        <p>مراجعة وتعديل بيانات الطلاب، تفاصيل أولياء الأمور، الفروع والأعوام الدراسية.</p>
      </div>

      {/* Tabs Row */}
      <div className="cp-subtabs" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '24px' }}>
        <button className={`cp-btn ${statusTab === 'pending' ? 'cp-btn-info-active' : 'cp-btn-info'}`} onClick={() => setStatusTab('pending')}>
          <i className="fas fa-hourglass-half"></i> معلقين ({stats.pending})
        </button>
        <button className={`cp-btn ${statusTab === 'active' ? 'cp-btn-info-active' : 'cp-btn-info'}`} onClick={() => setStatusTab('active')}>
          <i className="fas fa-check-circle"></i> نشطين ({stats.active})
        </button>
        <button className={`cp-btn ${statusTab === 'inactive' ? 'cp-btn-info-active' : 'cp-btn-info'}`} onClick={() => setStatusTab('inactive')}>
          <i className="fas fa-user-slash"></i> غير مشتركين ({stats.inactive})
        </button>
        <button className={`cp-btn ${statusTab === 'suspended' ? 'cp-btn-info-active' : 'cp-btn-info'}`} onClick={() => setStatusTab('suspended')}>
          <i className="fas fa-ban"></i> موقوفين ({stats.suspended})
        </button>
        <button className={`cp-btn ${statusTab === 'all' ? 'cp-btn-info-active' : 'cp-btn-info'}`} onClick={() => setStatusTab('all')}>
          <i className="fas fa-users"></i> الكل ({stats.total})
        </button>
      </div>

      {/* Search & Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="cp-search" style={{ flex: 1, minWidth: 260, marginBottom: 0 }}>
          <i className="fas fa-search"></i>
          <input
            type="text"
            placeholder="ابحث باسم الطالب أو رقم الهاتف..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div>
          <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)} style={{ padding: '10px 14px', borderRadius: '10px', border: '1.5px solid rgba(99, 102, 241, 0.18)', background: 'var(--card-bg, #fff)', color: 'var(--text-color)', cursor: 'pointer' }}>
            <option value="all">جميع المراحل</option>
            {(gradesList || []).map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        <div>
          <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} style={{ padding: '10px 14px', borderRadius: '10px', border: '1.5px solid rgba(99, 102, 241, 0.18)', background: 'var(--card-bg, #fff)', color: 'var(--text-color)', cursor: 'pointer' }}>
            <option value="all">جميع الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)} style={{ padding: '10px 14px', borderRadius: '10px', border: '1.5px solid rgba(99, 102, 241, 0.18)', background: 'var(--card-bg, #fff)', color: 'var(--text-color)', cursor: 'pointer' }}>
            <option value="all">جميع المجموعات</option>
            {groups
              .filter(g => (selectedGrade === 'all' || g.grade === selectedGrade) && (selectedBranch === 'all' || g.branch_id === selectedBranch))
              .map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
          </select>
        </div>

        <div>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: '10px 14px', borderRadius: '10px', border: '1.5px solid rgba(99, 102, 241, 0.18)', background: 'var(--card-bg, #fff)', color: 'var(--text-color)', cursor: 'pointer', fontWeight: '500' }}>
            <option value="created_at_desc">📅 الترتيب: الأحدث تسجيلاً أولاً</option>
            <option value="created_at_asc">📅 الترتيب: الأقدم تسجيلاً أولاً</option>
            <option value="name_asc">🔤 الترتيب: اسم الطالب (أ - ي)</option>
            <option value="name_desc">🔤 الترتيب: اسم الطالب (ي - أ)</option>
          </select>
        </div>

        <button className="cp-icon-btn" onClick={refreshList} title="تحديث القائمة" style={{ height: 42, width: 42 }}>
          <i className="fas fa-rotate"></i>
        </button>

        <button className="cp-btn cp-btn-success" onClick={() => {
          setAddStudentForm({
            name: '',
            phone: '',
            password: '',
            grade: gradesList?.[0]?.id || '',
            branch_id: branches?.[0]?.id || '',
            selectedGroupId: '',
            enrollment_type: 'CENTER',
            status: 'active',
            parent_phone: '',
            registerMonthly: false,
            monthlyMonth: '',
            registerBooklet: false
          });
          setShowAddModal(true);
        }} style={{ height: 42, fontWeight: 'bold', marginInlineStart: 'auto' }}>
          <i className="fas fa-plus" style={{ marginInlineEnd: 6 }} /> إضافة طالب جديد
        </button>
      </div>

      {/* ── Barcode label printing toolbar (thermal / XPrinter) ───────────────
          Label size is configurable; the four print modes all route through the
          same thermal-label engine (src/utils/barcodeLabels.js). */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center', padding: '12px 14px', borderRadius: 12, background: 'rgba(99, 102, 241, 0.04)', border: '1px solid rgba(99, 102, 241, 0.12)' }}>
        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-color)' }}>
          <i className="fas fa-barcode" style={{ marginInlineEnd: 6, color: '#6366f1' }}></i>
          طباعة الباركود:
        </span>

        {/* Configurable label size */}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-color)' }}>
          مقاس الملصق
          <select value={labelSize} onChange={(e) => setLabelSize(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid rgba(99, 102, 241, 0.18)', background: 'var(--card-bg, #fff)', color: 'var(--text-color)', cursor: 'pointer' }}>
            {LABEL_SIZE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        {/* Selected students */}
        <button className="cp-btn cp-btn-info" onClick={handlePrintSelected} disabled={selectedIds.size === 0} title="طباعة باركود الطلاب المحددين" style={{ height: 40, opacity: selectedIds.size === 0 ? 0.5 : 1 }}>
          <i className="fas fa-print"></i> طباعة المحدد ({selectedIds.size})
        </button>

        <button className="cp-btn cp-btn-success" onClick={() => {
          setBulkPayForm({ registerMonthly: false, registerBooklet: false, monthlyMonth: '' });
          setBulkPreview(null);
          setShowBulkPayModal(true);
        }} disabled={selectedIds.size === 0} title="تسجيل دفعات أولية للطلاب المحددين" style={{ height: 40, opacity: selectedIds.size === 0 ? 0.5 : 1 }}>
          <i className="fas fa-money-bill-wave" style={{ marginInlineEnd: 6 }}></i> تسجيل دفعات أولية ({selectedIds.size})
        </button>

        <button className="cp-btn" onClick={() => {
          setBulkRemoveForm({ removeMonthly: false, removeBooklet: false, monthlyMonth: '' });
          setShowBulkRemoveModal(true);
        }} title="إلغاء الدفعات للطلاب" style={{ height: 40, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <i className="fas fa-trash-can" style={{ marginInlineEnd: 6 }}></i> 
          {selectedIds.size > 0 ? `إلغاء الدفعات للمحددين (${selectedIds.size})` : 'إلغاء دفعات جميع الطلاب'}
        </button>

        {/* Current page */}
        <button className="cp-btn cp-btn-info" onClick={handlePrintPage} disabled={students.length === 0} title="طباعة باركودات هذه الصفحة" style={{ height: 40 }}>
          <i className="fas fa-file-lines"></i> طباعة الصفحة
        </button>

        {/* Whole group */}
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <select value={printGroupId} onChange={(e) => setPrintGroupId(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid rgba(99, 102, 241, 0.18)', background: 'var(--card-bg, #fff)', color: 'var(--text-color)', cursor: 'pointer' }}>
            <option value="">— اختر مجموعة —</option>
            {groups
              .filter(g => (selectedGrade === 'all' || g.grade === selectedGrade) && (selectedBranch === 'all' || g.branch_id === selectedBranch))
              .map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button className="cp-btn cp-btn-info" onClick={handlePrintGroup} disabled={!printGroupId || bulkPrinting} title="طباعة باركودات المجموعة كاملة" style={{ height: 40, opacity: (!printGroupId || bulkPrinting) ? 0.5 : 1 }}>
            <i className="fas fa-users"></i> طباعة المجموعة
          </button>
        </span>

        {/* Whole grade / all grades */}
        <button className="cp-btn cp-btn-info" onClick={handlePrintAllBarcodes} disabled={bulkPrinting} title={selectedGrade !== 'all' ? 'طباعة باركودات هذه المرحلة' : 'طباعة باركودات كل المراحل'} style={{ height: 40, opacity: bulkPrinting ? 0.6 : 1 }}>
          <i className={`fas ${bulkPrinting ? 'fa-spinner fa-spin' : 'fa-graduation-cap'}`}></i>
          {bulkPrinting ? ' جارٍ التحضير...' : (selectedGrade !== 'all' ? ' طباعة المرحلة' : ' طباعة كل المراحل')}
        </button>
      </div>

      {/* Export the roster — always follows the filters selected above */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center', padding: '12px 14px', borderRadius: 12, background: 'var(--primary-soft)', border: '1px solid var(--primary-glow)' }}>
        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-color)' }}>
          <i className="fas fa-file-export" style={{ marginInlineEnd: 6, color: 'var(--primary)' }}></i>
          تصدير بيانات الطلاب:
        </span>

        <button
          className="cp-btn cp-btn-success"
          onClick={() => handleExport('csv')}
          disabled={exporting}
          title="تصدير ملف CSV يفتح في Excel لكل الطلاب المطابقين للفلاتر الحالية"
          style={{ height: 40, opacity: exporting ? 0.6 : 1 }}
        >
          <i className={`fas ${exporting ? 'fa-spinner fa-spin' : 'fa-file-csv'}`} style={{ marginInlineEnd: 6 }}></i>
          {exporting ? 'جارٍ التحضير...' : 'تصدير CSV (Excel)'}
        </button>

        <button
          className="cp-btn cp-btn-info"
          onClick={() => handleExport('pdf')}
          disabled={exporting}
          title="كشف مطبوع — اختر «حفظ كـ PDF» من نافذة الطباعة"
          style={{ height: 40, opacity: exporting ? 0.6 : 1 }}
        >
          <i className={`fas ${exporting ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`} style={{ marginInlineEnd: 6 }}></i>
          {exporting ? 'جارٍ التحضير...' : 'تصدير PDF'}
        </button>

        <span style={{ fontSize: '0.78rem', color: 'var(--cp-text-muted)' }}>
          يشمل: الاسم، هاتف الطالب، هاتف ولي الأمر، المرحلة، الفرع، النوع، والمجموعات — لكل الطلاب المطابقين للفلاتر الحالية ({totalCount}).
        </span>
      </div>

      {/* Grid Table */}
      {loading ? (
        <div className="cp-empty">
          <i className="fas fa-spinner fa-spin"></i>
          <p>جاري تحميل قائمة الطلاب...</p>
        </div>
      ) : students.length === 0 ? (
        <div className="cp-empty">
          <i className="fas fa-user-slash"></i>
          <p>لا يوجد نتائج مطابقة</p>
        </div>
      ) : (
        <div style={{ borderRadius: 16, border: '1px solid var(--border-light, #e2e8f0)', background: 'var(--card-bg, #fff)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.92rem' }}>
            <thead>
              <tr style={{ background: 'rgba(99, 102, 241, 0.05)', borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '14px 12px', width: 44, textAlign: 'center' }}>
                  <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAllPage} title="تحديد كل الصفحة" style={{ width: 16, height: 16, cursor: 'pointer' }} />
                </th>
                <th style={{ padding: '14px 16px' }}>اسم الطالب</th>
                <th style={{ padding: '14px 16px' }}>أرقام الهواتف</th>
                <th style={{ padding: '14px 16px' }}>المرحلة</th>
                <th style={{ padding: '14px 16px' }}>الفرع</th>
                <th style={{ padding: '14px 16px' }}>النوع والوضع</th>
                <th style={{ padding: '14px 16px', textAlign: 'center' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const isBusy = busyId === student.id
                const branchName = branches.find(b => b.id === student.branch_id)?.name || 'الفرع الرئيسي'
                const academicYearName = academicYears.find(y => y.id === student.academic_year_id)?.name || ''
                const statusColors = {
                  active: '#10b981',
                  inactive: '#64748b',
                  suspended: '#ef4444',
                  graduated: '#3b82f6',
                  archived: '#a855f7'
                }
                const currentStatus = student.status || 'inactive'
                
                return (
                  <tr key={student.id} style={{ borderBottom: '1px solid #f1f5f9', background: selectedIds.has(student.id) ? 'rgba(99, 102, 241, 0.06)' : 'transparent' }}>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <input type="checkbox" checked={selectedIds.has(student.id)} onChange={() => toggleSelect(student.id)} style={{ width: 16, height: 16, cursor: 'pointer' }} title={student.barcode_token ? 'تحديد للطباعة' : 'لا يوجد باركود لهذا الطالب'} />
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>
                      {student.name}
                      {student.flags && student.flags.map(flag => (
                        <span key={flag} style={{ marginInlineStart: '6px', padding: '2px 6px', fontSize: '0.7rem', borderRadius: '4px', background: '#ef444420', color: '#ef4444', fontWeight: 'bold' }}>
                          {flag}
                        </span>
                      ))}
                      {student.created_at && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 'normal', marginTop: '2px' }}>
                          <i className="far fa-clock" style={{ marginInlineEnd: 4, fontSize: '0.7rem' }}></i>
                          تاريخ التسجيل: {fmtDateTime(student.created_at)}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.82rem' }}>
                        <span>الطالب: {student.phone}</span>
                        {student.parent_phone && <span>ولي الأمر: {student.parent_phone}</span>}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>{GRADE_LABEL[student.grade] || student.grade}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div>{branchName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{academicYearName}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: '0.8rem', padding: '2px 8px', borderRadius: '4px', background: `${statusColors[currentStatus]}20`, color: statusColors[currentStatus], fontWeight: 'bold' }}>
                        {currentStatus.toUpperCase()}
                      </span>
                      <span style={{ marginInlineStart: '6px', fontSize: '0.8rem', color: '#64748b' }}>
                        {student.enrollment_type === 'HYBRID' ? 'سنتر وأونلاين' : student.enrollment_type === 'ONLINE' ? 'أونلاين' : 'سنتر'}
                      </span>
                      {Number(student.subscription_discount) > 0 && (
                        <span style={{ marginInlineStart: '6px', fontSize: '0.78rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 'bold' }} title="خصم دائم للطالب من قيمة الاشتراك">
                          🏷️ خصم دائم: {student.subscription_discount} ج.م
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        {student.is_approved === false ? (
                          <>
                            <button
                              className="cp-btn cp-btn-sm"
                              onClick={() => handleUpdateStatus(student, true, true)}
                              disabled={isBusy}
                              style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: 'none', fontWeight: 'bold' }}
                              title="موافقة وتنشيط الحساب فوراً"
                            >
                              <i className="fas fa-check-double" style={{ marginInlineEnd: 4 }} /> موافقة وتنشيط
                            </button>
                            <button
                              className="cp-btn cp-btn-sm"
                              onClick={() => handleUpdateStatus(student, true, false)}
                              disabled={isBusy}
                              style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: 'none', fontWeight: 'bold' }}
                              title="موافقة على التسجيل فقط بدون تفعيل الاشتراك"
                            >
                              <i className="fas fa-check" style={{ marginInlineEnd: 4 }} /> موافقة فقط
                            </button>
                          </>
                        ) : (student.is_active === false || student.status === 'suspended' || student.status === 'archived' || student.status === 'graduated') ? (
                          <button
                            className="cp-btn cp-btn-sm"
                            onClick={() => handleUpdateStatus(student, true, true)}
                            disabled={isBusy}
                            style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: 'none', fontWeight: 'bold' }}
                            title="تنشيط وتفعيل اشتراك الطالب"
                          >
                            <i className="fas fa-power-off" style={{ marginInlineEnd: 4 }} /> تنشيط
                          </button>
                        ) : (
                          <button
                            className="cp-btn cp-btn-sm"
                            onClick={() => handleUpdateStatus(student, true, false)}
                            disabled={isBusy}
                            style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', fontWeight: 'bold' }}
                            title="إلغاء تنشيط وتجميد حساب الطالب"
                          >
                            <i className="fas fa-ban" style={{ marginInlineEnd: 4 }} /> إيقاف
                          </button>
                        )}
                        <button
                          className="cp-btn cp-btn-info cp-btn-sm"
                          onClick={() => {
                            const primaryG = student.student_groups?.find(sg => sg.is_primary) || student.student_groups?.[0]
                            const secG = student.student_groups?.find(sg => !sg.is_primary && sg.group_id !== primaryG?.group_id)
                            const curGroupId = primaryG?.group_id || ''
                            const secGroupId = secG?.group_id || ''
                            setEditStudent({ 
                              ...student, 
                              currentGroupId: curGroupId, 
                              selectedGroupId: curGroupId,
                              hasSecondGroup: Boolean(secGroupId),
                              secondaryGroupId: secGroupId
                            })
                            setShowEditModal(true)
                          }}
                        >
                          <i className="fas fa-edit" /> تعديل
                        </button>
                        <button
                          className="cp-btn cp-btn-sm"
                          onClick={() => {
                            setSelectedQrStudent(student)
                            setShowQrModal(true)
                          }}
                          style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}
                        >
                          <i className="fas fa-qrcode" /> كارت
                        </button>
                        <button
                          className="cp-btn cp-btn-danger cp-btn-sm"
                          onClick={() => setDeletingStudent(student)}
                          disabled={isBusy}
                        >
                          <i className="fas fa-trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination controls — only shown when results span more than one page */}
      {!loading && totalCount > PAGE_SIZE && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 18, flexWrap: 'wrap' }}>
          <button
            className="cp-btn cp-btn-info"
            disabled={page <= 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            style={{ opacity: page <= 0 ? 0.5 : 1 }}
          >
            <i className="fas fa-chevron-right"></i> السابق
          </button>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-color)' }}>
            صفحة {page + 1} من {totalPages} · {totalCount} طالب
          </span>
          <button
            className="cp-btn cp-btn-info"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            style={{ opacity: page >= totalPages - 1 ? 0.5 : 1 }}
          >
            التالي <i className="fas fa-chevron-left"></i>
          </button>
        </div>
      )}

      {deletingStudent && (
        <ConfirmDeleteDialog
          title="تأكيد حذف حساب الطالب"
          itemLabel={deletingStudent.name}
          message="هل أنت متأكد من رغبتك في حذف حساب الطالب نهائياً؟ لا يمكن التراجع عن هذا الإجراء."
          confirmText="نعم، احذف الطالب"
          cancelText="إلغاء"
          onConfirm={confirmDeleteStudent}
          onCancel={() => setDeletingStudent(null)}
        />
      )}

      {/* Edit Student Modal */}
      {showEditModal && editStudent && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <form onSubmit={handleEditSubmit} style={{ background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '24px', padding: '30px', maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto', color: '#fff', direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>تعديل الملف الشخصي للطالب: {editStudent.name}</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>الاسم بالكامل</label>
                <input type="text" value={editStudent.name} onChange={(e) => setEditStudent({ ...editStudent, name: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} required />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>رقم هاتف الطالب</label>
                <input type="text" value={editStudent.phone} onChange={(e) => setEditStudent({ ...editStudent, phone: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} required />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>حالة الطالب</label>
                <select value={editStudent.status || 'inactive'} onChange={(e) => setEditStudent({ ...editStudent, status: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="active">نشط (مفعل)</option>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="inactive">غير نشط (غير مشترك)</option>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="suspended">موقوف</option>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="graduated">خريج</option>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="archived">مؤرشف</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>نوع التسجيل والاشتراك</label>
                <select value={editStudent.enrollment_type || 'CENTER'} onChange={(e) => setEditStudent({ ...editStudent, enrollment_type: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="CENTER">سنتر (حضور سنتر)</option>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="ONLINE">أونلاين (منصة إلكترونية)</option>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="HYBRID">سنتر وأونلاين (حضور سنتر + منصة)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>الفرع الدراسي</label>
                <select value={editStudent.branch_id || ''} onChange={(e) => setEditStudent({ ...editStudent, branch_id: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="">اختر الفرع...</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id} style={{ background: '#0f172a', color: '#fff' }}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>العام الدراسي</label>
                <select value={editStudent.academic_year_id || ''} onChange={(e) => setEditStudent({ ...editStudent, academic_year_id: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="">اختر العام...</option>
                  {academicYears.map(y => (
                    <option key={y.id} value={y.id} style={{ background: '#0f172a', color: '#fff' }}>{y.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Parent contact Section */}
            <h4 style={{ fontSize: '0.98rem', fontWeight: 'bold', marginBottom: '12px', color: '#38bdf8', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>بيانات ولي الأمر والمجموعة</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '4px', color: '#94a3b8' }}>رقم هاتف ولي الأمر</label>
                <input type="text" value={editStudent.parent_phone || ''} onChange={(e) => setEditStudent({ ...editStudent, parent_phone: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '4px', color: '#94a3b8' }}>المجموعة الدراسية (الأساسية)</label>
                <select 
                  value={editStudent.selectedGroupId || ''} 
                  onChange={(e) => setEditStudent({ ...editStudent, selectedGroupId: e.target.value })} 
                  className="cp-input" 
                  style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <option style={{ background: '#0f172a', color: '#fff' }} value="">بدون مجموعة...</option>
                  {groups
                    .filter(g => g.grade === editStudent.grade && (!editStudent.branch_id || g.branch_id === editStudent.branch_id))
                    .map(g => (
                      <option key={g.id} value={g.id} style={{ background: '#0f172a', color: '#fff' }}>{g.name}</option>
                    ))
                  }
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1', marginTop: '-4px' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.86rem', color: '#38bdf8', fontWeight: 600 }}>
                  <input 
                    type="checkbox" 
                    checked={Boolean(editStudent.hasSecondGroup)} 
                    onChange={(e) => {
                      const checked = e.target.checked
                      setEditStudent({ 
                        ...editStudent, 
                        hasSecondGroup: checked, 
                        secondaryGroupId: checked ? editStudent.secondaryGroupId : '' 
                      })
                    }}
                    style={{ width: 16, height: 16, accentColor: '#38bdf8' }}
                  />
                  <span>إضافة مجموعة ثانية للطالب (للغياب والحضور)</span>
                </label>
              </div>

              {editStudent.hasSecondGroup && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '4px', color: '#38bdf8', fontWeight: 'bold' }}>المجموعة الدراسية الثانية (للغياب والحضور)</label>
                  <select 
                    value={editStudent.secondaryGroupId || ''} 
                    onChange={(e) => setEditStudent({ ...editStudent, secondaryGroupId: e.target.value })} 
                    className="cp-input" 
                    style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid #38bdf8' }}
                  >
                    <option style={{ background: '#0f172a', color: '#fff' }} value="">اختر المجموعة الثانية...</option>
                    {groups
                      .filter(g => g.grade === editStudent.grade && (!editStudent.branch_id || g.branch_id === editStudent.branch_id) && g.id !== editStudent.selectedGroupId)
                      .map(g => (
                        <option key={g.id} value={g.id} style={{ background: '#0f172a', color: '#fff' }}>{g.name}</option>
                      ))
                    }
                  </select>
                </div>
              )}
            </div>

            {/* Permanent Discount Section */}
            <div style={{ marginBottom: '24px', background: 'rgba(16, 185, 129, 0.05)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <label style={{ display: 'block', fontSize: '0.86rem', fontWeight: 'bold', marginBottom: '6px', color: '#10b981' }}>
                <i className="fas fa-tag" style={{ marginInlineEnd: 6 }}></i>
                الخصم الدائم للطالب (جنيه مصري)
              </label>
              <input 
                type="number" 
                min="0"
                step="10"
                value={editStudent.subscription_discount ?? 0}
                onChange={(e) => setEditStudent({ ...editStudent, subscription_discount: e.target.value })}
                placeholder="0"
                className="cp-input"
                style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: 'bold', fontSize: '0.98rem' }}
              />
              <span style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginTop: 6 }}>
                مبلغ الخصم يُخصم تلقائياً وبشكل دائم من قيمة الاشتراك المعتادة للطالب عند تسديد أي شهر.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="submit" disabled={busyId === editStudent.id} className="cp-btn cp-btn-success" style={{ flex: 1, padding: '12px', fontWeight: 'bold' }}>
                {busyId === editStudent.id ? 'جاري الحفظ...' : 'حفظ التغييرات'}
              </button>
              <button type="button" onClick={() => { setShowEditModal(false); setEditStudent(null); }} className="cp-btn cp-btn-secondary" style={{ padding: '12px 24px' }}>
                إلغاء
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* Barcode card lightbox (QR removed — barcode only) */}
      {showQrModal && selectedQrStudent && (() => {
        const barcodeToken = selectedQrStudent.barcode_token || '';
        const barcodeApiUrl = barcodeToken ? barcodeImageUrl(barcodeToken) : '';
        const gradeText = GRADE_LABEL[selectedQrStudent.grade] || selectedQrStudent.grade || 'غير محدد';
        const groupText = getGroupName(selectedQrStudent);

        return createPortal(
          <div style={{ position: 'fixed', inset: 0, background: 'var(--cp-overlay, rgba(15, 23, 42, 0.8))', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 20 }}>
            <div style={{ background: 'rgba(30, 41, 59, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 24, padding: 32, maxWidth: 480, width: '100%', color: '#fff', textAlign: 'center', position: 'relative', direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}>
              <button onClick={() => { setShowQrModal(false); setSelectedQrStudent(null); }} style={{ position: 'absolute', top: 20, left: 20, background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }} title="إغلاق">
                <i className="fas fa-times"></i>
              </button>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 16 }}>بطاقة باركود الطالب للتحضير والتقارير</h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', marginBottom: 24 }}>
                {/* Barcode only */}
                {barcodeToken ? (
                  <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 16, display: 'inline-block', width: '100%', maxWidth: '300px' }}>
                    <img src={barcodeApiUrl} alt="Barcode" style={{ width: '100%', height: 'auto', maxHeight: '90px', display: 'block', imageRendering: 'crisp-edges' }} />
                  </div>
                ) : (
                  <div style={{ color: '#94a3b8' }}>لا يوجد كود باركود لهذا الطالب</div>
                )}
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: 16, padding: 16, marginBottom: 24, textAlign: 'right' }}>
                <div style={{ marginBottom: 6 }}><span style={{ color: '#94a3b8' }}>اسم الطالب: </span><span style={{ fontWeight: 600 }}>{selectedQrStudent.name}</span></div>
                <div style={{ marginBottom: 6 }}><span style={{ color: '#94a3b8' }}>المرحلة الدراسية: </span><span>{gradeText}</span></div>
                {groupText && (
                  <div style={{ marginBottom: 6 }}><span style={{ color: '#94a3b8' }}>المجموعة: </span><span style={{ fontWeight: 600 }}>{groupText}</span></div>
                )}
                {barcodeToken && (
                  <div><span style={{ color: '#94a3b8' }}>كود الباركود: </span><span style={{ fontFamily: 'monospace', color: '#8c72db', fontWeight: 'bold' }}>{barcodeToken}</span></div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={handlePrint} style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: '#fff', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><i className="fas fa-print"></i> طباعة البطاقة</button>
                <button onClick={() => { setShowQrModal(false); setSelectedQrStudent(null); }} style={{ padding: '12px 24px', borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.15)', background: 'transparent', color: '#fff', fontSize: '1rem', fontWeight: 700, cursor: 'pointer' }}>إغلاق</button>
              </div>
            </div>
          </div>,
          document.body
        )
      })()}

      {/* Add Student Modal */}
      {showAddModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <form onSubmit={handleAddSubmit} autoComplete="off" style={{ background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '24px', padding: '30px', maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto', color: '#fff', direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}>
            {/* Hidden dummy inputs to block aggressive browser credential autofill */}
            <input type="text" name="prevent_autofill_username" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
            <input type="password" name="prevent_autofill_password" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              <i className="fas fa-user-plus" style={{ marginInlineEnd: 8, color: '#10b981' }}></i>
              إضافة طالب جديد
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>الاسم بالكامل *</label>
                <input type="text" name="new_student_fullname" autoComplete="off" value={addStudentForm.name} onChange={(e) => setAddStudentForm({ ...addStudentForm, name: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} required />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>رقم هاتف الطالب *</label>
                <input type="text" name="new_student_phone" autoComplete="off" data-lpignore="true" data-1p-ignore="true" value={addStudentForm.phone} onChange={(e) => setAddStudentForm({ ...addStudentForm, phone: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} required />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.84rem', fontWeight: 'bold', color: '#94a3b8' }}>كلمة المرور *</label>
                  <button 
                    type="button" 
                    onClick={() => {
                      const generated = generateTenantPassword(tenant || tenantSlug)
                      setAddStudentForm(prev => ({ ...prev, password: generated }))
                      setShowAddPassword(true)
                    }}
                    style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    <i className="fas fa-magic" style={{ marginInlineEnd: 4 }}></i> توليد كلمة مرور
                  </button>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input 
                    type={showAddPassword ? 'text' : 'password'} 
                    name="new_student_password" 
                    autoComplete="new-password" 
                    data-lpignore="true" 
                    data-1p-ignore="true" 
                    value={addStudentForm.password} 
                    onChange={(e) => setAddStudentForm({ ...addStudentForm, password: e.target.value })} 
                    className="cp-input" 
                    style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', paddingLeft: '38px' }} 
                    required 
                    minLength={6} 
                  />
                  <button
                    type="button"
                    onClick={() => setShowAddPassword(!showAddPassword)}
                    tabIndex={-1}
                    title={showAddPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    style={{
                      position: 'absolute',
                      left: '10px',
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '0.95rem',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'center'
                    }}
                  >
                    <i className={`fas ${showAddPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>رقم هاتف ولي الأمر *</label>
                <input type="text" name="new_student_parent_phone" autoComplete="off" data-lpignore="true" data-1p-ignore="true" value={addStudentForm.parent_phone} onChange={(e) => setAddStudentForm({ ...addStudentForm, parent_phone: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} required />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>المرحلة الدراسية *</label>
                <select value={addStudentForm.grade} onChange={(e) => setAddStudentForm({ ...addStudentForm, grade: e.target.value, selectedGroupId: '' })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} required>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="">اختر المرحلة...</option>
                  {(gradesList || []).map(g => (
                    <option key={g.id} style={{ background: '#0f172a', color: '#fff' }} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>الفرع الدراسي</label>
                <select value={addStudentForm.branch_id} onChange={(e) => setAddStudentForm({ ...addStudentForm, branch_id: e.target.value, selectedGroupId: '' })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="">اختر الفرع...</option>
                  {branches.map(b => (
                    <option key={b.id} style={{ background: '#0f172a', color: '#fff' }} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>المجموعة الدراسية (الأساسية)</label>
                <select 
                  value={addStudentForm.selectedGroupId} 
                  onChange={(e) => setAddStudentForm({ ...addStudentForm, selectedGroupId: e.target.value })} 
                  className="cp-input" 
                  style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <option style={{ background: '#0f172a', color: '#fff' }} value="">بدون مجموعة...</option>
                  {groups
                    .filter(g => g.grade === addStudentForm.grade && (!addStudentForm.branch_id || g.branch_id === addStudentForm.branch_id))
                    .map(g => (
                      <option key={g.id} style={{ background: '#0f172a', color: '#fff' }} value={g.id}>{g.name}</option>
                    ))
                  }
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1', marginTop: '-4px' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem', color: '#38bdf8', fontWeight: 600 }}>
                  <input 
                    type="checkbox" 
                    checked={addStudentForm.hasSecondGroup} 
                    onChange={(e) => {
                      const checked = e.target.checked
                      setAddStudentForm({ 
                        ...addStudentForm, 
                        hasSecondGroup: checked, 
                        secondaryGroupId: checked ? addStudentForm.secondaryGroupId : '' 
                      })
                    }}
                    style={{ width: 16, height: 16, accentColor: '#38bdf8' }}
                  />
                  <span>إضافة مجموعة ثانية للطالب (للغياب والحضور)</span>
                </label>
              </div>

              {addStudentForm.hasSecondGroup && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#38bdf8' }}>
                    المجموعة الدراسية الثانية (للغياب والحضور)
                  </label>
                  <select 
                    value={addStudentForm.secondaryGroupId} 
                    onChange={(e) => setAddStudentForm({ ...addStudentForm, secondaryGroupId: e.target.value })} 
                    className="cp-input" 
                    style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid #38bdf8' }}
                  >
                    <option style={{ background: '#0f172a', color: '#fff' }} value="">اختر المجموعة الثانية...</option>
                    {groups
                      .filter(g => g.grade === addStudentForm.grade && (!addStudentForm.branch_id || g.branch_id === addStudentForm.branch_id) && g.id !== addStudentForm.selectedGroupId)
                      .map(g => (
                        <option key={g.id} style={{ background: '#0f172a', color: '#fff' }} value={g.id}>{g.name}</option>
                      ))
                    }
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>نوع التسجيل والاشتراك</label>
                <select value={addStudentForm.enrollment_type} onChange={(e) => setAddStudentForm({ ...addStudentForm, enrollment_type: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="CENTER">سنتر (حضور سنتر)</option>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="ONLINE">أونلاين (منصة إلكترونية)</option>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="HYBRID">سنتر وأونلاين (حضور سنتر + منصة)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>حالة الطالب</label>
                <select value={addStudentForm.status} onChange={(e) => setAddStudentForm({ ...addStudentForm, status: e.target.value })} className="cp-input" style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="active">نشط (مفعل)</option>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="inactive">غير نشط (غير مشترك)</option>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="suspended">موقوف</option>
                </select>
              </div>
            </div>

            {/* Permanent Discount Section */}
            <div style={{ marginBottom: '24px', background: 'rgba(16, 185, 129, 0.05)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <label style={{ display: 'block', fontSize: '0.86rem', fontWeight: 'bold', marginBottom: '6px', color: '#10b981' }}>
                <i className="fas fa-tag" style={{ marginInlineEnd: 6 }}></i>
                الخصم الدائم للطالب (اختياري - جنيه مصري)
              </label>
              <input 
                type="number" 
                min="0"
                step="10"
                value={addStudentForm.subscription_discount ?? 0}
                onChange={(e) => setAddStudentForm({ ...addStudentForm, subscription_discount: e.target.value })}
                placeholder="0"
                className="cp-input"
                style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: 'bold', fontSize: '0.98rem' }}
              />
              <span style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginTop: 6 }}>
                يُخصم هذا المبلغ تلقائياً وبشكل دائم من مصاريف الاشتراكات الشهرية لهذا الطالب عند تحصيل الدفعات.
              </span>
            </div>



            {/* Configurable automatic payment registration checkboxes */}
            <h4 style={{ fontSize: '0.98rem', fontWeight: 'bold', marginBottom: '12px', color: '#38bdf8', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
              تسجيل المدفوعات الأولية تلقائياً
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={addStudentForm.registerMonthly} 
                    onChange={(e) => setAddStudentForm({ ...addStudentForm, registerMonthly: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: '#10b981' }}
                  />
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>تسجيل اشتراك شهري (Monthly Payment)</span>
                </label>
              </div>
              
              {addStudentForm.registerMonthly && (
                <div style={{ paddingInlineStart: '28px', marginBottom: '8px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '4px', color: '#94a3b8' }}>شهر الاشتراك *</label>
                  <select 
                    value={addStudentForm.monthlyMonth} 
                    onChange={(e) => setAddStudentForm({ ...addStudentForm, monthlyMonth: e.target.value })} 
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
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={addStudentForm.registerBooklet} 
                    onChange={(e) => setAddStudentForm({ ...addStudentForm, registerBooklet: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: '#10b981' }}
                  />
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>تسجيل دفع الملزمة (Booklet Payment)</span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="submit" disabled={busyId === 'new-student'} className="cp-btn cp-btn-success" style={{ flex: 1, padding: '12px', fontWeight: 'bold' }}>
                {busyId === 'new-student' ? 'جاري إنشاء الحساب...' : 'حفظ وإنشاء الحساب'}
              </button>
              <button type="button" onClick={() => { setShowAddModal(false); }} className="cp-btn cp-btn-secondary" style={{ padding: '12px 24px' }}>
                إلغاء
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* Bulk Register Payments Modal */}
      {showBulkPayModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <form onSubmit={handleBulkPaySubmit} style={{ background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '24px', padding: '30px', maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto', color: '#fff', direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              <i className="fas fa-money-bill-wave" style={{ marginInlineEnd: 8, color: '#10b981' }}></i>
              تسجيل دفعات أولية جماعية للطلاب المحددين
            </h3>

            <div style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.15)', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', fontSize: '0.88rem' }}>
              عدد الطلاب المحددين: <strong>{selectedIds.size} طالب</strong>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={bulkPayForm.registerMonthly} 
                    onChange={(e) => setBulkPayForm({ ...bulkPayForm, registerMonthly: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: '#10b981' }}
                  />
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>تسجيل اشتراك شهري (Monthly Payment)</span>
                </label>
              </div>

              {bulkPayForm.registerMonthly && (
                <div style={{ paddingInlineStart: '28px', marginBottom: '4px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '4px', color: '#94a3b8' }}>اختر الشهر *</label>
                  <select 
                    value={bulkPayForm.monthlyMonth} 
                    onChange={(e) => setBulkPayForm({ ...bulkPayForm, monthlyMonth: e.target.value })} 
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
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={bulkPayForm.registerBooklet} 
                    onChange={(e) => setBulkPayForm({ ...bulkPayForm, registerBooklet: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: '#10b981' }}
                  />
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>تسجيل دفع الملازم (Booklet Payment)</span>
                </label>
              </div>
            </div>

            {/* Preview of prices and grand total */}
            {(bulkPayForm.registerMonthly || bulkPayForm.registerBooklet) && (
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '16px', marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 'bold', color: '#38bdf8' }}>
                  تفاصيل وتكلفة الدفعات المقترحة:
                </h4>
                {loadingBulkPreview ? (
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                    <i className="fas fa-spinner fa-spin" style={{ marginInlineEnd: 6 }}></i>
                    جاري حساب إجمالي الدفعات...
                  </div>
                ) : bulkPreview ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.88rem' }}>
                    {bulkPayForm.registerMonthly && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>إجمالي الاشتراكات الشهرية:</span>
                        <span style={{ fontWeight: 'bold', color: '#10b981' }}>{fmtMoney(bulkPreview.monthlyAmount)}</span>
                      </div>
                    )}
                    {bulkPayForm.registerBooklet && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>إجمالي ثمن الملازم:</span>
                        <span style={{ fontWeight: 'bold', color: '#10b981' }}>{fmtMoney(bulkPreview.bookletAmount)}</span>
                      </div>
                    )}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 'bold' }}>
                      <span>المبلغ الإجمالي المستحق:</span>
                      <span style={{ color: '#06b6d4' }}>{fmtMoney(bulkPreview.grandTotal)}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="submit" disabled={submittingBulkAction || loadingBulkPreview || (!bulkPayForm.registerMonthly && !bulkPayForm.registerBooklet)} className="cp-btn cp-btn-success" style={{ flex: 1, padding: '12px', fontWeight: 'bold' }}>
                {submittingBulkAction ? 'جاري التسجيل...' : 'تأكيد وتسجيل الدفعات'}
              </button>
              <button type="button" onClick={() => setShowBulkPayModal(false)} className="cp-btn cp-btn-secondary" style={{ padding: '12px 24px' }}>
                إلغاء
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* Bulk Remove Payments Modal */}
      {showBulkRemoveModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <form onSubmit={handleBulkRemoveSubmit} style={{ background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '24px', padding: '30px', maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto', color: '#fff', direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px', color: '#ef4444' }}>
              <i className="fas fa-trash-can" style={{ marginInlineEnd: 8, color: '#ef4444' }}></i>
              {selectedIds.size > 0 ? 'إلغاء وحذف الدفعات للطلاب المحددين' : 'إلغاء وحذف الدفعات لجميع طلاب المنصة'}
            </h3>

            <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', fontSize: '0.88rem', color: '#fca5a5' }}>
              {selectedIds.size > 0 ? (
                <>عدد الطلاب المحددين: <strong>{selectedIds.size} طالب</strong></>
              ) : (
                <strong style={{ color: '#f87171' }}>⚠️ سيتم إلغاء وحذف الدفعات لجميع طلاب المنصة بالكامل!</strong>
              )}
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', opacity: 0.85 }}>سيقوم النظام بإلغاء المدفوعات المسجلة وإرجاعها لحالة غير مدفوع.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={bulkRemoveForm.removeMonthly} 
                    onChange={(e) => setBulkRemoveForm({ ...bulkRemoveForm, removeMonthly: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: '#ef4444' }}
                  />
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>إلغاء وحذف الاشتراك الشهري (Monthly Payment)</span>
                </label>
              </div>

              {bulkRemoveForm.removeMonthly && (
                <div style={{ paddingInlineStart: '28px', marginBottom: '4px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '4px', color: '#94a3b8' }}>الشهر المراد إلغاؤه *</label>
                  <select 
                    value={bulkRemoveForm.monthlyMonth} 
                    onChange={(e) => setBulkRemoveForm({ ...bulkRemoveForm, monthlyMonth: e.target.value })} 
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
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={bulkRemoveForm.removeBooklet} 
                    onChange={(e) => setBulkRemoveForm({ ...bulkRemoveForm, removeBooklet: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: '#ef4444' }}
                  />
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>إلغاء دفع الملازم (Revert Booklet Payment)</span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="submit" disabled={submittingBulkAction || (!bulkRemoveForm.removeMonthly && !bulkRemoveForm.removeBooklet)} className="cp-btn" style={{ flex: 1, padding: '12px', fontWeight: 'bold', background: '#ef4444', color: '#fff', border: 'none' }}>
                {submittingBulkAction ? 'جاري الإلغاء والحذف...' : 'تأكيد الحذف والإلغاء'}
              </button>
              <button type="button" onClick={() => setShowBulkRemoveModal(false)} className="cp-btn cp-btn-secondary" style={{ padding: '12px 24px' }}>
                إلغاء
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* Bulk Pay Summary Modal */}
      {bulkPaySummary && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '24px', padding: '30px', maxWidth: '480px', width: '100%', color: '#fff', direction: 'rtl', fontFamily: 'Tajawal, sans-serif', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 20px' }}>
              <i className="fas fa-check-double"></i>
            </div>
            
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '16px' }}>ملخص عملية تسجيل الدفعات</h3>
            
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '16px', padding: '20px', marginBottom: '24px', textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.94rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>إجمالي الطلاب المحددين:</span>
                <span style={{ fontWeight: 'bold' }}>{bulkPaySummary.totalSelected} طلاب</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>تم التسجيل بنجاح:</span>
                <span style={{ fontWeight: 'bold', color: '#10b981' }}>{bulkPaySummary.registeredCount} طلاب</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px' }}>
                <span style={{ color: '#94a3b8' }}>تم التخطي (مسددين مسبقاً):</span>
                <span style={{ fontWeight: 'bold', color: '#fca5a5' }}>{bulkPaySummary.skippedCount} طلاب</span>
              </div>
            </div>

            {/* List of registered student names */}
            {bulkPaySummary.registeredNames && bulkPaySummary.registeredNames.length > 0 && (
              <div style={{ marginBottom: '16px', textAlign: 'right' }}>
                <h4 style={{ fontSize: '0.85rem', color: '#10b981', margin: '0 0 6px' }}>الطلاب الذين تم التسجيل لهم:</h4>
                <div style={{ maxHeight: '80px', overflowY: 'auto', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: '8px', padding: '8px 12px', fontSize: '0.82rem', color: '#a7f3d0', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {bulkPaySummary.registeredNames.map((name, i) => (
                    <span key={i} style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>{name}</span>
                  ))}
                </div>
              </div>
            )}

            {/* List of skipped student names */}
            {bulkPaySummary.skippedNames && bulkPaySummary.skippedNames.length > 0 && (
              <div style={{ marginBottom: '24px', textAlign: 'right' }}>
                <h4 style={{ fontSize: '0.85rem', color: '#fca5a5', margin: '0 0 6px' }}>الطلاب الذين تم تخطيهم (مسددين مسبقاً):</h4>
                <div style={{ maxHeight: '80px', overflowY: 'auto', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '8px', padding: '8px 12px', fontSize: '0.82rem', color: '#fca5a5', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {bulkPaySummary.skippedNames.map((name, i) => (
                    <span key={i} style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>{name}</span>
                  ))}
                </div>
              </div>
            )}

            <button 
              type="button" 
              onClick={() => {
                setBulkPaySummary(null)
                softRefresh()
              }} 
              className="cp-btn cp-btn-success" 
              style={{ width: '100%', padding: '12px', fontWeight: 'bold', fontSize: '1rem' }}
            >
              حسناً
            </button>
          </div>
        </div>,
        document.body
      )}
    </section>
  )
}
