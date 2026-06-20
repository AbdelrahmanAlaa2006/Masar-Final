import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { listGroups, createGroup, updateGroup, deleteGroup } from '@backend/groupsApi'
import { listBranches } from '@backend/branchesApi'
import { listAcademicYears } from '@backend/academicYearsApi'
import { GRADE_LABEL, GRADE_ORDER } from './shared'
import ConfirmDeleteDialog from '../../components/ConfirmDeleteDialog'

export default function GroupsPanel({ onBack, flash }) {
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
  const [grade, setGrade] = useState('first-prep')
  const [branchId, setBranchId] = useState('')
  const [academicYearId, setAcademicYearId] = useState('')

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
    setGrade('first-prep')
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
          <p>إضافة وتعديل وحذف المجموعات الدراسية لكل مرحلة وفرع دراسي.</p>
        </div>
        <button className="cp-btn cp-btn-success" onClick={handleOpenAdd}>
          <i className="fas fa-plus"></i> إضافة مجموعة جديدة
        </button>
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
            {Object.entries(GRADE_LABEL).map(([val, lbl]) => (
              <option key={val} value={val}>{lbl}</option>
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
                  {Object.entries(GRADE_LABEL).map(([val, lbl]) => (
                    <option key={val} value={val} style={{ background: '#0f172a', color: '#fff' }}>{lbl}</option>
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
    </section>
  )
}
