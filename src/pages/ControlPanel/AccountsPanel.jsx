import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { listStudentsPaged, getStudentStatusCounts, updateStudentStatus, updateStudentProfile } from '@backend/profilesApi'
import { listBranches } from '@backend/branchesApi'
import { listAcademicYears } from '@backend/academicYearsApi'
import { createNotification } from '@backend/notificationsApi'
import { listGroups, assignStudentToGroup } from '@backend/groupsApi'
import { initials, GRADE_LABEL } from './shared'
import { invalidate as invalidateCache } from '../../utils/cache'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '@backend/supabase'
import ConfirmDeleteDialog from '../../components/ConfirmDeleteDialog'
import { useTenant } from '../../contexts/TenantContext'

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

export default function AccountsPanel({ onBack, flash }) {
  const { user: currentUser } = useAuth()
  const { gradesList } = useTenant()
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
  const [statusTab, setStatusTab] = useState('pending')

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

  // Load one page of students for the active tab/grade/search. Server-side
  // filtering + .range() means we never pull the whole roster into the browser.
  const loadPage = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      const { rows, count } = await listStudentsPaged({
        page, pageSize: PAGE_SIZE, statusTab, grade: selectedGrade, search: debouncedQuery
      })
      setStudents(rows)
      setTotalCount(count)
    } catch (e) {
      setError(e.message || 'تعذّر تحميل قائمة الطلاب')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [page, statusTab, selectedGrade, debouncedQuery])

  // Tab badge counts come from cheap head-only COUNT queries (constant size).
  const reloadCounts = useCallback(async () => {
    try {
      setCounts(await getStudentStatusCounts({ grade: selectedGrade }))
    } catch { /* badges are non-critical */ }
  }, [selectedGrade])

  useEffect(() => { loadPage() }, [loadPage])
  useEffect(() => { reloadCounts() }, [reloadCounts])

  // Debounce the search box and reset to the first page on a new term.
  useEffect(() => {
    const id = setTimeout(() => { setDebouncedQuery(query); setPage(0) }, 350)
    return () => clearTimeout(id)
  }, [query])

  // Reset to the first page whenever the tab or grade filter changes.
  useEffect(() => { setPage(0) }, [statusTab, selectedGrade])

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
      
      // Update group if changed
      if (editStudent.selectedGroupId !== editStudent.currentGroupId) {
        if (editStudent.selectedGroupId) {
          await assignStudentToGroup(editStudent.id, editStudent.selectedGroupId)
        } else {
          await supabase.from('student_groups').delete().eq('student_id', editStudent.id)
          await supabase.from('profiles').update({ "group": null }).eq('id', editStudent.id)
        }
      }

      const matchedGroup = groups.find(g => g.id === editStudent.selectedGroupId)
      const groupName = matchedGroup ? matchedGroup.name : ''
      const updatedGroups = editStudent.selectedGroupId ? [{ group_id: editStudent.selectedGroupId }] : []
      
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

  const handlePrint = () => {
    if (!selectedQrStudent) return
    const printWindow = window.open('', '_blank')
    const origin = window.location.origin
    const qrUrl = `${origin}/public-report?id=${selectedQrStudent.id}&token=${selectedQrStudent.qr_token || ''}`
    const qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrl)}`
    const barcodeToken = selectedQrStudent.barcode_token || ''
    const barcodeApiUrl = barcodeToken 
      ? `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(barcodeToken)}&scale=3&rotate=N&includetext=true` 
      : ''
    
    printWindow.document.write(`
      <html>
        <head>
          <title>بطاقة هوية الطالب - ${selectedQrStudent.name}</title>
          <style>
            body { font-family: 'Tajawal', sans-serif; text-align: center; padding: 30px; direction: rtl; background: #fff; color: #000; }
            .card { border: 2px solid #ccc; border-radius: 16px; padding: 24px; max-width: 440px; margin: 0 auto; box-shadow: 0 4px 10px rgba(0,0,0,0.06); }
            h2 { margin: 0 0 8px; font-size: 1.5rem; color: #1e293b; }
            p { margin: 6px 0; color: #475569; font-size: 1rem; }
            .codes-grid { display: flex; flex-direction: column; gap: 20px; align-items: center; margin: 24px 0; }
            .qr-image { width: 200px; height: 200px; }
            .barcode-image { width: 100%; max-width: 300px; height: auto; }
            .logo { font-weight: 800; font-size: 1.3rem; color: #6366f1; margin-bottom: 16px; border-bottom: 2px solid #f1f5f9; padding-bottom: 12px; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="card">
            <div class="logo">منصة مسار التعليمية</div>
            <h2>بطاقة هوية الطالب الكودية</h2>
            <p><strong>الاسم:</strong> ${selectedQrStudent.name}</p>
            <p><strong>المرحلة:</strong> ${GRADE_LABEL[selectedQrStudent.grade] || selectedQrStudent.grade}</p>
            <div class="codes-grid">
              <div>
                <p style="font-size: 0.85rem; font-weight: bold; margin-bottom: 8px; color: #64748b;">كود QR للتقرير الرقمي</p>
                <img src="${qrCodeApiUrl}" class="qr-image" alt="QR Code" />
              </div>
              ${barcodeApiUrl ? `
              <div style="width: 100%; display: flex; flex-direction: column; align-items: center;">
                <p style="font-size: 0.85rem; font-weight: bold; margin-bottom: 8px; color: #64748b;">رمز الباركود للتحضير السريع</p>
                <img src="${barcodeApiUrl}" class="barcode-image" alt="Barcode" />
              </div>
              ` : ''}
            </div>
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

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

        <button className="cp-icon-btn" onClick={refreshList} title="تحديث القائمة" style={{ height: 42, width: 42 }}>
          <i className="fas fa-rotate"></i>
        </button>
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
                  <tr key={student.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>
                      {student.name}
                      {student.flags && student.flags.map(flag => (
                        <span key={flag} style={{ marginInlineStart: '6px', padding: '2px 6px', fontSize: '0.7rem', borderRadius: '4px', background: '#ef444420', color: '#ef4444', fontWeight: 'bold' }}>
                          {flag}
                        </span>
                      ))}
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
                        {student.enrollment_type || 'CENTER'}
                      </span>
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
                            const curGroupId = student.student_groups?.[0]?.group_id || ''
                            setEditStudent({ 
                              ...student, 
                              currentGroupId: curGroupId, 
                              selectedGroupId: curGroupId 
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
                  <option style={{ background: '#0f172a', color: '#fff' }} value="CENTER">CENTER (حضور سنتر)</option>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="ONLINE">ONLINE (منصة الكترونية)</option>
                  <option style={{ background: '#0f172a', color: '#fff' }} value="HYBRID">HYBRID (مدمج سنتر + اونلاين)</option>
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
                <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '4px', color: '#94a3b8' }}>المجموعة الدراسية</label>
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
            </div>

            {/* Warning Flags */}
            <h4 style={{ fontSize: '0.98rem', fontWeight: 'bold', marginBottom: '12px', color: '#ef4444', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>العلامات والتحذيرات الذكية (Smart Flags)</h4>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '28px' }}>
              {['debt', 'excessive_absences', 'blocked', 'scholarship', 'VIP'].map(flag => {
                const currentFlags = editStudent.flags || []
                const hasFlag = currentFlags.includes(flag)
                const flagLabels = { debt: 'مديونية مالية', excessive_absences: 'غياب متكرر', blocked: 'حساب محظور', scholarship: 'طالب منحة', VIP: 'طالب VIP' }
                return (
                  <label key={flag} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', cursor: 'pointer', background: 'rgba(255,255,255,0.02)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <input 
                      type="checkbox" 
                      checked={hasFlag} 
                      onChange={(e) => {
                        const nextFlags = e.target.checked
                          ? [...currentFlags, flag]
                          : currentFlags.filter(f => f !== flag)
                        setEditStudent({ ...editStudent, flags: nextFlags })
                      }}
                      style={{ accentColor: '#ef4444' }}
                    />
                    <span>{flagLabels[flag]}</span>
                  </label>
                )
              })}
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

      {/* QR Lightbox */}
      {showQrModal && selectedQrStudent && (() => {
        const origin = window.location.origin;
        const qrUrl = `${origin}/public-report?id=${selectedQrStudent.id}&token=${selectedQrStudent.qr_token || ''}`;
        const qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrUrl)}`;
        const barcodeToken = selectedQrStudent.barcode_token || '';
        const barcodeApiUrl = barcodeToken 
          ? `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(barcodeToken)}&scale=3&rotate=N&includetext=true` 
          : '';
        const gradeText = GRADE_LABEL[selectedQrStudent.grade] || selectedQrStudent.grade || 'غير محدد';
        
        return createPortal(
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 20 }}>
            <div style={{ background: 'rgba(30, 41, 59, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 24, padding: 32, maxWidth: 480, width: '100%', color: '#fff', textAlign: 'center', position: 'relative', direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}>
              <button onClick={() => { setShowQrModal(false); setSelectedQrStudent(null); }} style={{ position: 'absolute', top: 20, left: 20, background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }} title="إغلاق">
                <i className="fas fa-times"></i>
              </button>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 16 }}>بطاقة أكواد الطالب للتحضير والتقارير</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', marginBottom: 24 }}>
                {/* QR Code */}
                <div style={{ background: '#fff', padding: 12, borderRadius: 16, display: 'inline-block' }}>
                  <img src={qrCodeApiUrl} alt="QR Code" style={{ width: 160, height: 160, display: 'block' }} />
                </div>
                
                {/* Barcode */}
                {barcodeToken && (
                  <div style={{ background: '#fff', padding: '12px 16px', borderRadius: 16, display: 'inline-block', width: '100%', maxWidth: '280px' }}>
                    <img src={barcodeApiUrl} alt="Barcode" style={{ width: '100%', height: 'auto', maxHeight: '70px', display: 'block' }} />
                  </div>
                )}
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: 16, padding: 16, marginBottom: 24, textAlign: 'right' }}>
                <div style={{ marginBottom: 6 }}><span style={{ color: '#94a3b8' }}>اسم الطالب: </span><span style={{ fontWeight: 600 }}>{selectedQrStudent.name}</span></div>
                <div style={{ marginBottom: 6 }}><span style={{ color: '#94a3b8' }}>المرحلة الدراسية: </span><span>{gradeText}</span></div>
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
    </section>
  )
}
