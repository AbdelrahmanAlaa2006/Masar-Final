import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { listGroups, createGroup, updateGroup, deleteGroup, listStudentsByGroup, transferStudentGroup } from '@backend/groupsApi'
import { listBranches } from '@backend/branchesApi'
import { listAcademicYears } from '@backend/academicYearsApi'
import { GRADE_LABEL, GRADE_ORDER } from './shared'
import ConfirmDeleteDialog from '../../components/ConfirmDeleteDialog'
import { useTenant } from '../../contexts/TenantContext'


export default function GroupsPanel({ onBack, flash }) {
  const { gradesList } = useTenant()
  const [groups, setGroups] = useState([])
  const [branches, setBranches] = useState([])
  const [academicYears, setAcademicYears] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [deletingGroup, setDeletingGroup] = useState(null)

  // Filters
  const [selectedGrade, setSelectedGrade] = useState('all')
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [query, setQuery] = useState('')

  // Add / Edit Modal states
  const [showFormModal, setShowFormModal] = useState(false)
  const [modalMode, setModalMode] = useState('create') // 'create' | 'edit'
  const [editingGroupId, setEditingGroupId] = useState(null)
  
  // Form fields
  const [name, setName] = useState('')
  const [grade, setGrade] = useState(() => gradesList?.[0]?.id || 'first-prep')
  const [branchId, setBranchId] = useState('')
  const [academicYearId, setAcademicYearId] = useState('')

  // Transfer Modal states
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferGrade, setTransferGrade] = useState(() => gradesList?.[0]?.id || 'first-prep')
  const [transferBranchId, setTransferBranchId] = useState('')
  const [transferSourceGroupId, setTransferSourceGroupId] = useState('')
  const [transferStudentId, setTransferStudentId] = useState('')
  const [transferTargetGroupId, setTransferTargetGroupId] = useState('')
  const [transferStudents, setTransferStudents] = useState([])
  const [transferLoadingStudents, setTransferLoadingStudents] = useState(false)
  const [transferStudentQuery, setTransferStudentQuery] = useState('')
  const [transferBusy, setTransferBusy] = useState(false)

  // Reset transfer modal states when grade or branch changes
  const handleTransferGradeBranchChange = (newGrade, newBranchId) => {
    setTransferGrade(newGrade)
    setTransferBranchId(newBranchId)
    setTransferSourceGroupId('')
    setTransferStudentId('')
    setTransferTargetGroupId('')
    setTransferStudents([])
  }

  // Load students for the selected source group
  useEffect(() => {
    if (!transferSourceGroupId) {
      setTransferStudents([])
      return
    }
    let active = true
    setTransferLoadingStudents(true)
    ;(async () => {
      try {
        const list = await listStudentsByGroup(transferSourceGroupId)
        if (!active) return
        setTransferStudents(list || [])
      } catch (err) {
        console.error(err)
        flash('تعذر تحميل طلاب المجموعة المصدر', 'error')
      } finally {
        if (active) setTransferLoadingStudents(false)
      }
    })()
    return () => { active = false }
  }, [transferSourceGroupId])

  const handleExecuteTransfer = async (e) => {
    e.preventDefault()
    if (!transferStudentId) {
      flash('يرجى اختيار الطالب المراد نقله', 'warning')
      return
    }
    if (!transferTargetGroupId) {
      flash('يرجى اختيار المجموعة المستهدفة للنقل', 'warning')
      return
    }
    setTransferBusy(true)
    try {
      await transferStudentGroup(transferStudentId, transferSourceGroupId, transferTargetGroupId)
      flash('تم نقل الطالب بنجاح وإزالته من المجموعة القديمة', 'success')
      
      // Refresh students of source group
      const list = await listStudentsByGroup(transferSourceGroupId)
      setTransferStudents(list || [])
      setTransferStudentId('')
      setTransferTargetGroupId('')
    } catch (err) {
      console.error(err)
      flash('فشل نقل الطالب: ' + err.message, 'error')
    } finally {
      setTransferBusy(false)
    }
  }

  const loadData = async () => {
    try {
      setLoading(true)
      const [groupsData, branchesData, yearsData] = await Promise.all([
        listGroups(),
        listBranches(),
        listAcademicYears()
      ])
      setGroups(groupsData || [])
      setBranches(branchesData || [])
      setAcademicYears(yearsData || [])
    } catch (err) {
      setError(err.message || 'تعذر تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleOpenAdd = () => {
    setModalMode('create')
    setEditingGroupId(null)
    setName('')
    setGrade(gradesList?.[0]?.id || 'first-prep')
    setBranchId(branches[0]?.id || '')
    setAcademicYearId(academicYears[0]?.id || '')
    setShowFormModal(true)
  }

  const handleOpenEdit = (group) => {
    setModalMode('edit')
    setEditingGroupId(group.id)
    setName(group.name)
    setGrade(group.grade || 'first-prep')
    setBranchId(group.branch_id || '')
    setAcademicYearId(group.academic_year_id || '')
    setShowFormModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      flash('يرجى إدخال اسم المجموعة', 'warning')
      return
    }
    setBusyId('modal')
    try {
      if (modalMode === 'create') {
        const newGrp = await createGroup({
          name: name.trim(),
          grade,
          branchId: branchId || null,
          academicYearId: academicYearId || null
        })
        flash('تم إنشاء المجموعة بنجاح', 'success')
      } else {
        await updateGroup(editingGroupId, {
          name: name.trim(),
          grade,
          branchId: branchId || null,
          academicYearId: academicYearId || null
        })
        flash('تم تعديل المجموعة بنجاح', 'success')
      }
      setShowFormModal(false)
      // Reload lists
      const freshGroups = await listGroups()
      setGroups(freshGroups || [])
    } catch (err) {
      console.error(err)
      flash(err.message || 'حدث خطأ أثناء حفظ المجموعة', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const confirmDeleteGroup = async () => {
    if (!deletingGroup) return
    const group = deletingGroup
    setDeletingGroup(null)
    setBusyId(group.id)
    try {
      await deleteGroup(group.id)
      setGroups(prev => prev.filter(g => g.id !== group.id))
      flash('تم حذف المجموعة بنجاح', 'success')
    } catch (err) {
      console.error(err)
      flash(err.message || 'تعذر حذف المجموعة', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const filteredGroups = groups.filter(g => {
    if (selectedGrade !== 'all' && g.grade !== selectedGrade) return false
    if (selectedBranch !== 'all' && g.branch_id !== selectedBranch) return false
    if (query.trim()) {
      return g.name.toLowerCase().includes(query.trim().toLowerCase())
    }
    return true
  })

  return (
    <section className="cp-panel" style={{ direction: 'rtl' }}>
      {onBack && (
        <button className="cp-back" type="button" onClick={onBack}>
          <i className="fas fa-arrow-right"></i> رجوع
        </button>
      )}

      <div className="cp-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2><i className="fas fa-user-group" style={{ color: '#6366f1' }}></i> إدارة المجموعات الدراسية</h2>
          <p>إضافة وتعديل وحذف المجموعات الدراسية لكل مرحلة وفرع دراسي، ونقل الطلاب بين المجموعات.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="cp-btn cp-btn-info" onClick={() => setShowTransferModal(true)}>
            <i className="fas fa-right-left"></i> نقل الطلاب
          </button>
          <button className="cp-btn cp-btn-success" onClick={handleOpenAdd}>
            <i className="fas fa-plus"></i> إضافة مجموعة جديدة
          </button>
        </div>
      </div>

      {/* Filters Row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="cp-search" style={{ flex: 1, minWidth: 260, marginBottom: 0 }}>
          <i className="fas fa-search"></i>
          <input
            type="text"
            placeholder="ابحث باسم المجموعة..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div>
          <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)} style={{ padding: '10px 14px', borderRadius: '10px', border: '1.5px solid rgba(99, 102, 241, 0.18)', background: 'var(--card-bg, #fff)', color: 'var(--text-color)', cursor: 'pointer' }}>
            <option value="all">جميع المراحل</option>
            {gradesList.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        <div>
          <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} style={{ padding: '10px 14px', borderRadius: '10px', border: '1.5px solid rgba(99, 102, 241, 0.18)', background: 'var(--card-bg, #fff)', color: 'var(--text-color)', cursor: 'pointer' }}>
            <option value="all">جميع الفروع</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <button className="cp-icon-btn" onClick={loadData} title="تحديث القائمة" style={{ height: 42, width: 42 }}>
          <i className="fas fa-rotate"></i>
        </button>
      </div>

      {error && (
        <div className="cp-empty" style={{ color: '#ef4444' }}>
          <i className="fas fa-circle-exclamation"></i>
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="cp-empty">
          <i className="fas fa-spinner fa-spin"></i>
          <p>جاري تحميل المجموعات...</p>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="cp-empty">
          <i className="fas fa-user-slash"></i>
          <p>لا يوجد مجموعات مطابقة للتصفية</p>
        </div>
      ) : (
        <div style={{ borderRadius: 16, border: '1px solid var(--border-light, #e2e8f0)', background: 'var(--card-bg, #fff)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.92rem' }}>
            <thead>
              <tr style={{ background: 'rgba(99, 102, 241, 0.05)', borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '14px 16px' }}>اسم المجموعة</th>
                <th style={{ padding: '14px 16px' }}>المرحلة الدراسية</th>
                <th style={{ padding: '14px 16px' }}>الفرع الدراسي</th>
                <th style={{ padding: '14px 16px' }}>العام الدراسي</th>
                <th style={{ padding: '14px 16px', textAlign: 'center' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map((group) => {
                const isBusy = busyId === group.id
                const branchName = group.branches?.name || 'الفرع الرئيسي'
                const yearName = group.academic_years?.name || 'غير محدد'
                
                return (
                  <tr key={group.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>{group.name}</td>
                    <td style={{ padding: '12px 16px' }}>{GRADE_LABEL[group.grade] || group.grade}</td>
                    <td style={{ padding: '12px 16px' }}>{branchName}</td>
                    <td style={{ padding: '12px 16px' }}>{yearName}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          className="cp-btn cp-btn-info cp-btn-sm"
                          onClick={() => handleOpenEdit(group)}
                          disabled={isBusy}
                        >
                          <i className="fas fa-edit" /> تعديل
                        </button>
                        <button
                          className="cp-btn cp-btn-danger cp-btn-sm"
                          onClick={() => setDeletingGroup(group)}
                          disabled={isBusy}
                        >
                          <i className="fas fa-trash" /> حذف
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

      {deletingGroup && (
        <ConfirmDeleteDialog
          title="تأكيد حذف المجموعة"
          itemLabel={deletingGroup.name}
          message="سيتم حذف هذه المجموعة نهائياً من المنصة. هل أنت متأكد؟ لا يمكن التراجع عن هذا الإجراء."
          confirmText="نعم، احذف المجموعة"
          cancelText="إلغاء"
          onConfirm={confirmDeleteGroup}
          onCancel={() => setDeletingGroup(null)}
        />
      )}

      {/* Add / Edit Group Modal */}
      {showFormModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <form onSubmit={handleSubmit} style={{ background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '24px', padding: '30px', maxWidth: '480px', width: '100%', color: '#fff', direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              {modalMode === 'create' ? 'إضافة مجموعة جديدة' : 'تعديل المجموعة'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '28px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>اسم المجموعة</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  className="cp-input" 
                  style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} 
                  placeholder="مثال: مجموعة السبت 4م"
                  required 
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>المرحلة الدراسية</label>
                <select 
                  value={grade} 
                  onChange={(e) => setGrade(e.target.value)} 
                  className="cp-input" 
                  style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  {gradesList.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>الفرع الدراسي</label>
                <select 
                  value={branchId} 
                  onChange={(e) => setBranchId(e.target.value)} 
                  className="cp-input" 
                  style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <option style={{ background: '#0f172a', color: '#fff' }} value="">بدون فرع (عام)</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id} style={{ background: '#0f172a', color: '#fff' }}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>العام الدراسي</label>
                <select 
                  value={academicYearId} 
                  onChange={(e) => setAcademicYearId(e.target.value)} 
                  className="cp-input" 
                  style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <option style={{ background: '#0f172a', color: '#fff' }} value="">اختر العام الدراسي...</option>
                  {academicYears.map(y => (
                    <option key={y.id} value={y.id} style={{ background: '#0f172a', color: '#fff' }}>{y.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                onClick={() => setShowFormModal(false)} 
                className="cp-btn cp-btn-secondary"
                disabled={busyId === 'modal'}
              >
                إلغاء
              </button>
              <button 
                type="submit" 
                className="cp-btn cp-btn-success"
                disabled={busyId === 'modal'}
              >
                {busyId === 'modal' ? 'جاري الحفظ...' : 'حفظ التغييرات'}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* Transfer Students Modal */}
      {showTransferModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <form onSubmit={handleExecuteTransfer} style={{ background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '24px', padding: '30px', maxWidth: '520px', width: '100%', color: '#fff', direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              <i className="fas fa-right-left" style={{ color: '#38bdf8', marginInlineEnd: 8 }}></i> نقل الطلاب بين المجموعات الدراسية
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '28px' }}>
              {/* Grade and Branch Filter */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>المرحلة الدراسية</label>
                  <select 
                    value={transferGrade} 
                    onChange={(e) => handleTransferGradeBranchChange(e.target.value, transferBranchId)} 
                    className="cp-input" 
                    style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    {gradesList.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>المقر / الفرع</label>
                  <select 
                    value={transferBranchId} 
                    onChange={(e) => handleTransferGradeBranchChange(transferGrade, e.target.value)} 
                    className="cp-input" 
                    style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <option value="">بدون فرع (عام)</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Source Group */}
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>من مجموعة (المجموعة الحالية)</label>
                <select
                  value={transferSourceGroupId}
                  onChange={(e) => {
                    setTransferSourceGroupId(e.target.value)
                    setTransferStudentId('')
                  }}
                  className="cp-input"
                  style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                  required
                >
                  <option value="">اختر المجموعة المصدر...</option>
                  {groups.filter(g => g.grade === transferGrade && (!transferBranchId || g.branch_id === transferBranchId)).map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              {/* Student Search and Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>البحث عن الطالب</label>
                <input
                  type="text"
                  placeholder={transferSourceGroupId ? "ابحث باسم الطالب داخل المجموعة..." : "اختر المجموعة المصدر أولاً لتفعيل البحث"}
                  value={transferStudentQuery}
                  onChange={(e) => setTransferStudentQuery(e.target.value)}
                  className="cp-input"
                  style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', marginBottom: 8 }}
                  disabled={!transferSourceGroupId}
                />
                
                <select
                  value={transferStudentId}
                  onChange={(e) => setTransferStudentId(e.target.value)}
                  className="cp-input"
                  style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                  required
                  disabled={!transferSourceGroupId || transferLoadingStudents || transferStudents.length === 0}
                >
                  {!transferSourceGroupId ? (
                    <option value="">اختر مجموعة لعرض الطلاب...</option>
                  ) : transferLoadingStudents ? (
                    <option value="">جاري تحميل الطلاب...</option>
                  ) : transferStudents.length === 0 ? (
                    <option value="">لا يوجد طلاب في هذه المجموعة</option>
                  ) : (
                    <>
                      <option value="">اختر الطالب...</option>
                      {transferStudents
                        .filter(s => s.name.toLowerCase().includes(transferStudentQuery.toLowerCase()))
                        .map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.phone || 'بدون هاتف'})</option>
                        ))}
                    </>
                  )}
                </select>
              </div>

              {/* Target Group */}
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: '#94a3b8' }}>إلى مجموعة (المجموعة الجديدة)</label>
                <select
                  value={transferTargetGroupId}
                  onChange={(e) => setTransferTargetGroupId(e.target.value)}
                  className="cp-input"
                  style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                  required
                  disabled={!transferSourceGroupId}
                >
                  <option value="">اختر المجموعة المستهدفة...</option>
                  {groups
                    .filter(g => g.grade === transferGrade && (!transferBranchId || g.branch_id === transferBranchId) && g.id !== transferSourceGroupId)
                    .map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                onClick={() => setShowTransferModal(false)} 
                className="cp-btn cp-btn-secondary"
                disabled={transferBusy}
              >
                إلغاء
              </button>
              <button 
                type="submit" 
                className="cp-btn cp-btn-info"
                disabled={transferBusy || !transferStudentId || !transferTargetGroupId}
              >
                {transferBusy ? 'جاري النقل...' : 'تأكيد النقل الآن'}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </section>
  )
}
