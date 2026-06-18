import React, { useState, useEffect } from 'react'
import { listAssistants, createAssistant, updateAssistant, deleteAssistant } from '@backend/assistantsApi'
import { useTenant } from '../../contexts/TenantContext'

export default function AssistantsPanel({ onBack, flash }) {
  const { tenantId } = useTenant()

  const [assistants, setAssistants] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form states
  const [showAddForm, setShowAddForm] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [selectedPermissions, setSelectedPermissions] = useState([])

  // Edit states
  const [editingAssistant, setEditingAssistant] = useState(null)
  const [showEditForm, setShowEditForm] = useState(false)

  // Available permissions list (Internal name -> Arabic label)
  const PERMISSIONS_LIST = {
    'attendance': 'إدارة الحضور والغياب',
    'grades': 'رصد الدرجات والتقييمات',
    'homework': 'إدارة الواجبات والأنشطة',
    'videos': 'إدارة الفيديوهات والمحاضرات',
    'exams': 'إدارة الامتحانات والنتائج',
    'students': 'إدارة حسابات الطلاب والتفعيل',
    'payments': 'إدارة الاشتراكات والمدفوعات',
    'reports': 'عرض التقارير والإحصائيات',
    'whatsapp': 'متابعة إشعارات الواتساب والـ SMS'
  }

  // Load assistants on mount
  const loadData = async () => {
    setLoading(true)
    try {
      const data = await listAssistants()
      setAssistants(data)
    } catch (err) {
      console.error(err)
      flash('فشل تحميل قائمة المساعدين', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Toggle permission selection
  const handlePermissionToggle = (perm) => {
    setSelectedPermissions(prev => 
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    )
  }

  // Add assistant
  const handleAddAssistant = async (e) => {
    e.preventDefault()
    if (!name.trim() || !phone.trim() || !password.trim()) {
      flash('يرجى ملء جميع الحقول المطلوبة', 'warning')
      return
    }

    if (password.length < 6) {
      flash('كلمة المرور يجب أن لا تقل عن 6 أحرف', 'warning')
      return
    }

    setSaving(true)
    try {
      await createAssistant(
        name.trim(),
        phone.trim(),
        password,
        selectedPermissions,
        tenantId
      )
      flash('تم إنشاء حساب المساعد وتعيين الصلاحيات بنجاح.', 'success')
      
      // Reset form
      setName('')
      setPhone('')
      setPassword('')
      setSelectedPermissions([])
      setShowAddForm(false)
      
      // Reload
      loadData()
    } catch (err) {
      console.error(err)
      flash('فشل إنشاء حساب المساعد: ' + (err.message || 'رقم الهاتف قد يكون مستخدماً بالفعل في هذه المنصة'), 'error')
    } finally {
      setSaving(false)
    }
  }

  // Open edit permissions form
  const handleEditClick = (assistant) => {
    setEditingAssistant(assistant)
    setName(assistant.name)
    setPhone(assistant.phone)
    setSelectedPermissions(assistant.permissions || [])
    setShowEditForm(true)
  }

  // Save edits
  const handleEditAssistant = async (e) => {
    e.preventDefault()
    if (!editingAssistant) return

    setSaving(true)
    try {
      await updateAssistant(
        editingAssistant.id,
        name.trim(),
        phone.trim(),
        selectedPermissions,
        tenantId
      )
      flash('تم تحديث بيانات المساعد وصلاحياته بنجاح.', 'success')
      setShowEditForm(false)
      setEditingAssistant(null)
      loadData()
    } catch (err) {
      console.error(err)
      flash('فشل تحديث بيانات المساعد: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Delete assistant
  const handleDeleteClick = async (id, assistantName) => {
    if (!window.confirm(`هل أنت متأكد من حذف حساب المساعد "${assistantName}"؟ لن يتمكن من تسجيل الدخول مجدداً.`)) {
      return
    }

    try {
      await deleteAssistant(id)
      flash('تم حذف حساب المساعد بنجاح.', 'success')
      loadData()
    } catch (err) {
      console.error(err)
      flash('فشل حذف حساب المساعد: ' + err.message, 'error')
    }
  }

  return (
    <div className="cp-panel-container">
      
      {/* Header Panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>إدارة حسابات المساعدين والمشرفين (RBAC)</h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', margin: '4px 0 0' }}>قم بإنشاء حسابات فرعية لمساعديك وحدد لهم الصلاحيات المناسبة لكل قسم</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {!showAddForm && !showEditForm && (
            <button 
              onClick={() => {
                setName('')
                setPhone('')
                setPassword('')
                setSelectedPermissions([])
                setShowAddForm(true)
              }}
              className="cp-btn cp-btn-success"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
            >
              <i className="fas fa-plus" />
              إضافة مساعد جديد
            </button>
          )}
          <button onClick={onBack} className="cp-btn cp-btn-secondary">
            رجوع للوحة التحكم
          </button>
        </div>
      </div>

      {/* Add Assistant Form */}
      {showAddForm && (
        <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '24px', marginBottom: '24px', boxShadow: 'var(--cp-card-shadow)', animation: 'cpFadeUp 0.3s ease' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: '0 0 16px', color: 'var(--cp-text-main)' }}>
            <i className="fas fa-user-plus" style={{ marginInlineEnd: '8px' }} />
            إنشاء حساب مساعد جديد
          </h3>
          <form onSubmit={handleAddAssistant}>
            <div className="cp-home-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>الاسم الكامل *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: أسامة أحمد" className="cp-input" style={{ width: '100%' }} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>رقم الهاتف (لتسجيل الدخول) *</label>
                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="مثال: 01012345678" className="cp-input" style={{ width: '100%' }} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>كلمة المرور *</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6 أحرف على الأقل" className="cp-input" style={{ width: '100%' }} required />
              </div>
            </div>

            {/* Permissions Checkbox Grid */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '0.86rem', fontWeight: 'bold', marginBottom: '12px', color: 'var(--cp-text-muted)' }}>تحديد الصلاحيات والأقسام المتاحة للمساعد:</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                {Object.entries(PERMISSIONS_LIST).map(([key, label]) => {
                  const checked = selectedPermissions.includes(key)
                  return (
                    <label 
                      key={key} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px', 
                        padding: '12px 16px', 
                        borderRadius: '12px', 
                        border: '1px solid ' + (checked ? 'rgba(140, 114, 219, 0.3)' : 'var(--cp-card-border)'), 
                        background: checked ? 'rgba(140, 114, 219, 0.06)' : 'var(--cp-bg)', 
                        cursor: 'pointer',
                        fontSize: '0.88rem',
                        fontWeight: '600',
                        color: checked ? 'var(--cp-text-main)' : 'var(--cp-text-muted)',
                        transition: 'all 0.2s'
                      }}
                    >
                      <input 
                        type="checkbox" 
                        checked={checked} 
                        onChange={() => handlePermissionToggle(key)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span>{label}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={saving} className="cp-btn cp-btn-success" style={{ padding: '10px 24px' }}>
                {saving ? <i className="fas fa-spinner fa-spin"></i> : 'إضافة المساعد والحفظ'}
              </button>
              <button type="button" onClick={() => setShowAddForm(false)} className="cp-btn cp-btn-secondary">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Assistant Form */}
      {showEditForm && editingAssistant && (
        <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '16px', padding: '24px', marginBottom: '24px', boxShadow: 'var(--cp-card-shadow)', animation: 'cpFadeUp 0.3s ease' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: '0 0 16px', color: 'var(--cp-text-main)' }}>
            <i className="fas fa-user-pen" style={{ marginInlineEnd: '8px' }} />
            تعديل صلاحيات وبيانات المساعد: {editingAssistant.name}
          </h3>
          <form onSubmit={handleEditAssistant}>
            <div className="cp-home-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>الاسم الكامل *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="cp-input" style={{ width: '100%' }} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--cp-text-muted)' }}>رقم الهاتف *</label>
                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="cp-input" style={{ width: '100%' }} required />
              </div>
            </div>

            {/* Permissions Checkbox Grid */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '0.86rem', fontWeight: 'bold', marginBottom: '12px', color: 'var(--cp-text-muted)' }}>تحديث الصلاحيات الممنوحة:</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                {Object.entries(PERMISSIONS_LIST).map(([key, label]) => {
                  const checked = selectedPermissions.includes(key)
                  return (
                    <label 
                      key={key} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px', 
                        padding: '12px 16px', 
                        borderRadius: '12px', 
                        border: '1px solid ' + (checked ? 'rgba(140, 114, 219, 0.3)' : 'var(--cp-card-border)'), 
                        background: checked ? 'rgba(140, 114, 219, 0.06)' : 'var(--cp-bg)', 
                        cursor: 'pointer',
                        fontSize: '0.88rem',
                        fontWeight: '600',
                        color: checked ? 'var(--cp-text-main)' : 'var(--cp-text-muted)',
                        transition: 'all 0.2s'
                      }}
                    >
                      <input 
                        type="checkbox" 
                        checked={checked} 
                        onChange={() => handlePermissionToggle(key)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span>{label}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={saving} className="cp-btn cp-btn-success" style={{ padding: '10px 24px' }}>
                {saving ? <i className="fas fa-spinner fa-spin"></i> : 'تحديث وصيانة الصلاحيات'}
              </button>
              <button type="button" onClick={() => { setShowEditForm(false); setEditingAssistant(null); }} className="cp-btn cp-btn-secondary">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {/* Assistants List Grid */}
      {loading ? (
        <div className="cp-empty">
          <i className="fas fa-spinner fa-spin"></i>
          <p>جاري تحميل قائمة المساعدين وصلاحياتهم...</p>
        </div>
      ) : assistants.length === 0 ? (
        <div className="cp-empty">
          <i className="fas fa-user-shield"></i>
          <p>لا يوجد مساعدين مضافين للمنصة حالياً. قم بإضافة مساعدك الأول للبدء في تقسيم المهام!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {assistants.map((assistant) => (
            <div 
              key={assistant.id}
              style={{
                background: 'var(--cp-card-bg)',
                border: '1px solid var(--cp-card-border)',
                borderRadius: '20px',
                padding: '24px',
                boxShadow: 'var(--cp-card-shadow)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '16px',
                animation: 'cpFadeUp 0.3s ease'
              }}
            >
              {/* Header profile */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'linear-gradient(135deg, #14b8a6, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>
                    {assistant.name.trim().charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 style={{ fontSize: '1.05rem', fontWeight: 'bold', margin: 0, color: 'var(--cp-text-main)' }}>{assistant.name}</h4>
                    <span style={{ fontSize: '0.82rem', color: 'var(--cp-text-muted)', direction: 'ltr', display: 'inline-block' }}>{assistant.phone}</span>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--cp-divider)', paddingTop: '12px' }}>
                  <span style={{ fontSize: '0.84rem', fontWeight: 'bold', color: 'var(--cp-text-muted)', display: 'block', marginBottom: '8px' }}>الصلاحيات الفعالة:</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {assistant.permissions && assistant.permissions.length > 0 ? (
                      assistant.permissions.map(p => (
                        <span 
                          key={p} 
                          className="cp-id-pill"
                          style={{ background: 'rgba(140, 114, 219, 0.08)', border: '1px solid rgba(140, 114, 219, 0.15)', color: '#8c72db', fontSize: '0.74rem', padding: '3px 8px' }}
                        >
                          {p === 'attendance' ? 'حضور' : p === 'grades' ? 'درجات' : p === 'homework' ? 'واجبات' : p === 'videos' ? 'فيديوهات' : p === 'exams' ? 'امتحانات' : p === 'students' ? 'طلاب' : p === 'payments' ? 'اشتراكات' : p === 'reports' ? 'تقارير' : 'واتساب'}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', fontStyle: 'italic' }}>لا توجد صلاحيات معينة (حساب مجمد)</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--cp-divider)', paddingTop: '12px', justifyContent: 'flex-end' }}>
                <button 
                  onClick={() => handleEditClick(assistant)}
                  className="cp-btn cp-btn-info" 
                  style={{ padding: '6px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <i className="fas fa-key" />
                  صيانة الصلاحيات
                </button>
                <button 
                  onClick={() => handleDeleteClick(assistant.id, assistant.name)}
                  className="cp-btn cp-btn-danger" 
                  style={{ padding: '6px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', boxShadow: 'none' }}
                >
                  <i className="fas fa-trash-can" />
                  حذف الحساب
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
