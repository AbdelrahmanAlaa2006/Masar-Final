import React, { useState, useEffect } from 'react'
import { listBranches, createBranch, updateBranch, deleteBranch } from '@backend/branchesApi'
import { useAuth } from '../../contexts/AuthContext'
import ConfirmDeleteDialog from '../../components/ConfirmDeleteDialog'

export default function BranchesPanel({ onBack, flash }) {
  const { user, hasPermission } = useAuth()

  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingBranch, setDeletingBranch] = useState(null)

  // Form states
  const [showAddForm, setShowAddForm] = useState(false)
  const [name, setName] = useState('')

  // Edit states
  const [editingBranch, setEditingBranch] = useState(null)

  // Permissions checks
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const canEdit = isAdmin || hasPermission('branches:edit')
  const canView = isAdmin || hasPermission('branches:view') || hasPermission('branches:edit')

  const loadData = async () => {
    setLoading(true)
    try {
      const data = await listBranches()
      setBranches(data || [])
    } catch (err) {
      console.error(err)
      flash('فشل تحميل قائمة الفروع: ' + (err.message || ''), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (canView) {
      loadData()
    }
  }, [canView])

  const handleAddBranch = async (e) => {
    e.preventDefault()
    if (!canEdit) {
      flash('غير مصرح لك بإضافة الفروع', 'error')
      return
    }
    if (!name.trim()) {
      flash('يرجى إدخال اسم الفرع', 'warning')
      return
    }

    setSaving(true)
    try {
      await createBranch(name.trim())
      flash('تم إضافة الفرع الجديد بنجاح.', 'success')
      setName('')
      setShowAddForm(false)
      loadData()
    } catch (err) {
      console.error(err)
      flash('فشل إضافة الفرع: ' + (err.message || ''), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleEditClick = (branch) => {
    setEditingBranch(branch)
    setName(branch.name)
  }

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!canEdit) {
      flash('غير مصرح لك بتعديل الفروع', 'error')
      return
    }
    if (!name.trim()) {
      flash('يرجى إدخال اسم الفرع', 'warning')
      return
    }

    setSaving(true)
    try {
      await updateBranch(editingBranch.id, name.trim())
      flash('تم تحديث اسم الفرع بنجاح.', 'success')
      setEditingBranch(null)
      setName('')
      loadData()
    } catch (err) {
      console.error(err)
      flash('فشل تعديل الفرع: ' + (err.message || ''), 'error')
    } finally {
      setSaving(false)
    }
  }

  const confirmDeleteBranch = async () => {
    if (!deletingBranch) return
    const { id } = deletingBranch
    setDeletingBranch(null)
    try {
      await deleteBranch(id)
      flash('تم حذف الفرع بنجاح.', 'success')
      loadData()
    } catch (err) {
      console.error(err)
      flash('فشل حذف الفرع: ' + (err.message || 'قد يكون هذا الفرع مرتبطاً بمجموعات أو طلاب نشطين'), 'error')
    }
  }

  if (!canView) {
    return (
      <div className="cp-empty" style={{ color: '#ef4444' }}>
        <i className="fas fa-shield-halved"></i>
        <p>عذراً، لا تملك صلاحيات كافية لاستعراض الفروع الدراسية.</p>
      </div>
    )
  }

  return (
    <div className="cp-panel-container">
      {/* Header Panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>إدارة الفروع الدراسية</h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', margin: '4px 0 0' }}>قم بإضافة وتعديل الفروع الجغرافية أو الأكاديمية التابعة للمنصة التعليمية</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {canEdit && !showAddForm && !editingBranch && (
            <button
              onClick={() => {
                setName('')
                setShowAddForm(true)
              }}
              className="cp-btn cp-btn-success"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
            >
              <i className="fas fa-plus" />
              إضافة فرع جديد
            </button>
          )}
          <button onClick={onBack} className="cp-btn cp-btn-secondary">
            رجوع للوحة التحكم
          </button>
        </div>
      </div>

      {/* Add Branch Form */}
      {showAddForm && (
        <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '24px', marginBottom: '24px', boxShadow: 'var(--cp-card-shadow)', animation: 'cpFadeUp 0.3s ease' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: '0 0 16px', color: 'var(--cp-text-main)' }}>
            <i className="fas fa-plus" style={{ marginInlineEnd: '8px', color: '#10b981' }} />
            إضافة فرع جديد
          </h3>
          <form onSubmit={handleAddBranch}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>اسم الفرع الدراسي *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: فرع وسط البلد، فرع أكتوبر، أونلاين..."
                className="cp-input"
                style={{ width: '100%' }}
                required
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={saving} className="cp-btn cp-btn-success" style={{ padding: '10px 24px' }}>
                {saving ? <i className="fas fa-spinner fa-spin"></i> : 'حفظ الفرع الجديد'}
              </button>
              <button type="button" onClick={() => setShowAddForm(false)} className="cp-btn cp-btn-secondary">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Branch Form */}
      {editingBranch && (
        <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '24px', marginBottom: '24px', boxShadow: 'var(--cp-card-shadow)', animation: 'cpFadeUp 0.3s ease' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: '0 0 16px', color: 'var(--cp-text-main)' }}>
            <i className="fas fa-edit" style={{ marginInlineEnd: '8px', color: '#3b82f6' }} />
            تعديل بيانات الفرع: {editingBranch.name}
          </h3>
          <form onSubmit={handleSaveEdit}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>الاسم الجديد للفرع *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="cp-input"
                style={{ width: '100%' }}
                required
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={saving} className="cp-btn cp-btn-info" style={{ padding: '10px 24px' }}>
                {saving ? <i className="fas fa-spinner fa-spin"></i> : 'حفظ التعديلات'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingBranch(null)
                  setName('')
                }}
                className="cp-btn cp-btn-secondary"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Branches List Table */}
      {loading ? (
        <div className="cp-empty">
          <i className="fas fa-spinner fa-spin"></i>
          <p>جاري تحميل قائمة الفروع الدراسية...</p>
        </div>
      ) : branches.length === 0 ? (
        <div className="cp-empty">
          <i className="fas fa-map-marker-alt"></i>
          <p>لا يوجد فروع دراسية مسجلة حالياً بالمنصة. اضغط على إضافة فرع جديد لبدء الإعداد.</p>
        </div>
      ) : (
        <div style={{ borderRadius: 16, border: '1px solid var(--cp-card-border, #e2e8f0)', background: 'var(--cp-card-bg, #fff)', overflowX: 'auto', boxShadow: 'var(--cp-card-shadow)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.92rem' }}>
            <thead>
              <tr style={{ background: 'rgba(99, 102, 241, 0.04)', borderBottom: '1px solid var(--cp-card-border)' }}>
                <th style={{ padding: '14px 16px', color: 'var(--cp-text-main)' }}>اسم الفرع الدراسي</th>
                <th style={{ padding: '14px 16px', color: 'var(--cp-text-main)' }}>تاريخ الإضافة</th>
                {canEdit && <th style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--cp-text-main)' }}>الإجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => {
                const formattedDate = b.created_at
                  ? new Date(b.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
                  : 'غير معروف'

                return (
                  <tr key={b.id} style={{ borderBottom: '1px solid var(--cp-card-border)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 'bold', color: 'var(--cp-text-main)' }}>{b.name}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--cp-text-muted)' }}>{formattedDate}</td>
                    {canEdit && (
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            className="cp-btn cp-btn-info cp-btn-sm"
                            onClick={() => handleEditClick(b)}
                            style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <i className="fas fa-edit" />
                            تعديل
                          </button>
                          <button
                            className="cp-btn cp-btn-danger cp-btn-sm"
                            onClick={() => setDeletingBranch({ id: b.id, name: b.name })}
                            style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', boxShadow: 'none' }}
                          >
                            <i className="fas fa-trash-can" />
                            حذف
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {deletingBranch && (
        <ConfirmDeleteDialog
          title="تأكيد حذف الفرع"
          itemLabel={deletingBranch.name}
          message="هل أنت متأكد من حذف هذا الفرع الدراسي؟ سيؤدي ذلك لإزالة أي ارتباط مجموعات أو طلاب بهذا الفرع."
          confirmText="نعم، احذف الفرع"
          cancelText="إلغاء"
          onConfirm={confirmDeleteBranch}
          onCancel={() => setDeletingBranch(null)}
        />
      )}
    </div>
  )
}
