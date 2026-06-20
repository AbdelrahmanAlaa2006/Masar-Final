import React, { useState, useEffect } from 'react'
import { listAssistants, createAssistant, updateAssistant, deleteAssistant } from '@backend/assistantsApi'
import { useTenant } from '../../contexts/TenantContext'
import ConfirmDeleteDialog from '../../components/ConfirmDeleteDialog'

export default function AssistantsPanel({ onBack, flash }) {
  const { tenantId } = useTenant()

  const [assistants, setAssistants] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingAssistant, setDeletingAssistant] = useState(null)

  // Form states
  const [showAddForm, setShowAddForm] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [selectedPermissions, setSelectedPermissions] = useState([])

  // Edit states
  const [editingAssistant, setEditingAssistant] = useState(null)
  const [showEditForm, setShowEditForm] = useState(false)

  // Detailed permissions mapping for assistant cards
  const SHORT_LABELS = {
    'attendance:view': 'عرض الحضور',
    'attendance:take': 'تسجيل الحضور',
    'attendance:delete': 'حذف الحضور',
    'grades:view': 'عرض الدرجات',
    'grades:edit': 'رصد الدرجات',
    'videos:view': 'سجل الفيديوهات',
    'videos:edit': 'إدارة الفيديوهات',
    'exams:view': 'نتائج الامتحانات',
    'exams:edit': 'إدارة الامتحانات',
    'homework:view': 'تسليمات الواجب',
    'homework:edit': 'إدارة الواجبات',
    'students:view': 'عرض الطلاب',
    'students:activate': 'تفعيل الطلاب',
    'students:edit': 'تعديل الطلاب',
    'students:delete': 'حذف الطلاب',
    'students:reset_pass': 'استعادة الباسورد',
    'chats:view': 'قراءة الدردشة',
    'chats:reply': 'الرد على الدردشة',
    'payments:view': 'عرض الماليات',
    'payments:edit': 'إدارة الماليات',
    'whatsapp:view': 'طابور الواتساب',
    'reports:view': 'التقارير العامة',
    'branches:view': 'عرض الفروع',
    'branches:edit': 'إدارة الفروع',
    // Fallbacks for legacy coarse permissions
    'attendance': 'حضور كامل',
    'grades': 'درجات كامل',
    'homework': 'واجبات كامل',
    'videos': 'فيديوهات كامل',
    'exams': 'امتحانات كامل',
    'students': 'طلاب كامل',
    'payments': 'اشتراكات كامل',
    'reports': 'تقارير كامل',
    'whatsapp': 'واتساب كامل',
    'branches': 'الفروع كامل'
  }

  // Grouped and categorized permissions for the form checkboxes
  const PERMISSIONS_CATEGORIES = [
    {
      title: 'الحضور والغياب',
      icon: 'fa-calendar-check',
      accent: 'teal',
      items: [
        { key: 'attendance:view', label: 'عرض سجل الحضور والغياب' },
        { key: 'attendance:take', label: 'تسجيل الحضور اليومي للطلاب' },
        { key: 'attendance:delete', label: 'حذف وتعديل جلسات وسجلات الحضور' }
      ]
    },
    {
      title: 'رصد الدرجات والتقييم',
      icon: 'fa-star',
      accent: 'gold',
      items: [
        { key: 'grades:view', label: 'عرض كشوف الدرجات والتقييمات' },
        { key: 'grades:edit', label: 'رصد وتعديل درجات الطلاب وتقييماتهم' }
      ]
    },
    {
      title: 'الفيديوهات والمحاضرات',
      icon: 'fa-play-circle',
      accent: 'blue',
      items: [
        { key: 'videos:view', label: 'عرض سجل مشاهدات الفيديوهات' },
        { key: 'videos:edit', label: 'إدارة محاولات المشاهدة ومدة الإتاحة' }
      ]
    },
    {
      title: 'الامتحانات والنتائج',
      icon: 'fa-file-alt',
      accent: 'orange',
      items: [
        { key: 'exams:view', label: 'عرض نتائج وإجابات الطلاب' },
        { key: 'exams:edit', label: 'إدارة المحاولات، الإتاحة، وإظهار النتائج' }
      ]
    },
    {
      title: 'الواجبات والأنشطة',
      icon: 'fa-book-open',
      accent: 'purple',
      items: [
        { key: 'homework:view', label: 'عرض وإحصائيات تسليم الواجبات' },
        { key: 'homework:edit', label: 'تعديل درجات الواجبات وإظهار نتائجها' }
      ]
    },
    {
      title: 'شؤون الطلاب والملفات الشخصية',
      icon: 'fa-user-check',
      accent: 'green',
      items: [
        { key: 'students:view', label: 'عرض وقائمة الطلاب والبحث' },
        { key: 'students:activate', label: 'تفعيل حسابات الطلاب الجديدة (الموافقة)' },
        { key: 'students:edit', label: 'تعديل بيانات الطلاب والملف الشخصي' },
        { key: 'students:delete', label: 'حذف حسابات الطلاب نهائياً' },
        { key: 'students:reset_pass', label: 'الموافقة على طلبات استعادة الباسورد' }
      ]
    },
    {
      title: 'الدردشة والدعم الفني',
      icon: 'fa-comments',
      accent: 'teal',
      items: [
        { key: 'chats:view', label: 'قراءة محادثات واستفسارات الطلاب' },
        { key: 'chats:reply', label: 'الرد على محادثات واستفسارات الطلاب' }
      ]
    },
    {
      title: 'الماليات والاشتراكات',
      icon: 'fa-wallet',
      accent: 'violet',
      items: [
        { key: 'payments:view', label: 'عرض السجل المالي والتحصيل' },
        { key: 'payments:edit', label: 'تسجيل الاشتراكات وتعديل العمليات المالية' }
      ]
    },
    {
      title: 'إدارة الفروع والمجموعات',
      icon: 'fa-map-marker-alt',
      accent: 'violet',
      items: [
        { key: 'branches:view', label: 'عرض الفروع الدراسية التابعة للمنصة' },
        { key: 'branches:edit', label: 'إدارة وتعديل الفروع الدراسية (إضافة/حذف)' }
      ]
    },
    {
      title: 'الواتساب والتقارير العامة',
      icon: 'fa-comments-dollar',
      accent: 'red',
      items: [
        { key: 'whatsapp:view', label: 'متابعة طابور رسائل الواتساب' },
        { key: 'reports:view', label: 'عرض التقارير والإحصائيات العامة' }
      ]
    }
  ]

  const getOtherAssistantsWithPermission = (permKey, currentId = null) => {
    const parentKey = permKey.includes(':') ? permKey.split(':')[0] : null
    return assistants
      .filter(as => {
        if (as.id === currentId) return false
        if (!as.permissions) return false
        return as.permissions.includes(permKey) || (parentKey && as.permissions.includes(parentKey))
      })
      .map(as => as.name)
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
      setSelectedPermissions([])
      loadData()
    } catch (err) {
      console.error(err)
      flash('فشل تحديث بيانات المساعد: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Delete assistant confirm callback
  const confirmDeleteAssistant = async () => {
    if (!deletingAssistant) return
    const { id, name } = deletingAssistant
    setDeletingAssistant(null)
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
              <label style={{ display: 'block', fontSize: '0.92rem', fontWeight: 'bold', marginBottom: '16px', color: 'var(--cp-text-main)' }}>
                تحديد الصلاحيات الممنوحة للمساعد بالتفصيل:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {PERMISSIONS_CATEGORIES.map(category => (
                  <div 
                    key={category.title} 
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.01)', 
                      border: '1px solid var(--cp-card-border)', 
                      borderRadius: '16px', 
                      padding: '16px' 
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h4 style={{ fontSize: '0.92rem', fontWeight: '700', margin: 0, color: 'var(--cp-text-main)' }}>
                          <i className={`fas ${category.icon}`} style={{ marginInlineEnd: '6px', color: '#8c72db' }} />
                          {category.title}
                        </h4>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          type="button" 
                          onClick={() => {
                            const keys = category.items.map(item => item.key)
                            setSelectedPermissions(prev => {
                              const filtered = prev.filter(p => !keys.includes(p))
                              return [...filtered, ...keys]
                            })
                          }} 
                          style={{ fontSize: '0.72rem', background: 'rgba(20, 184, 166, 0.1)', color: '#14b8a6', border: 'none', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          تحديد الكل
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            const keys = category.items.map(item => item.key)
                            setSelectedPermissions(prev => prev.filter(p => !keys.includes(p)))
                          }} 
                          style={{ fontSize: '0.72rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          إلغاء الكل
                        </button>
                      </div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                      {category.items.map(item => {
                        const checked = selectedPermissions.includes(item.key)
                        const holders = getOtherAssistantsWithPermission(item.key)
                        return (
                          <label 
                            key={item.key} 
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'space-between',
                              gap: '10px', 
                              padding: '12px 14px', 
                              borderRadius: '12px', 
                              border: '1px solid ' + (checked ? 'rgba(140, 114, 219, 0.25)' : 'var(--cp-card-border)'), 
                              background: checked ? 'rgba(140, 114, 219, 0.04)' : 'transparent', 
                              cursor: 'pointer',
                              fontSize: '0.82rem',
                              fontWeight: '600',
                              color: checked ? 'var(--cp-text-main)' : 'var(--cp-text-muted)',
                              transition: 'all 0.2s',
                              flexWrap: 'wrap'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <input 
                                type="checkbox" 
                                checked={checked} 
                                onChange={() => handlePermissionToggle(item.key)}
                                style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                              />
                              <span>{item.label}</span>
                            </div>
                            {holders.length > 0 && (
                              <span style={{ 
                                fontSize: '0.7rem', 
                                color: 'var(--cp-text-muted)', 
                                padding: '2px 6px', 
                                borderRadius: '6px', 
                                background: 'var(--cp-hover-bg, rgba(0,0,0,0.04))',
                                fontWeight: 'normal'
                              }}>
                                (ممنوحة لـ: {holders.join('، ')})
                              </span>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={saving} className="cp-btn cp-btn-success" style={{ padding: '10px 24px' }}>
                {saving ? <i className="fas fa-spinner fa-spin"></i> : 'إضافة المساعد والحفظ'}
              </button>
              <button type="button" onClick={() => { setShowAddForm(false); setSelectedPermissions([]); }} className="cp-btn cp-btn-secondary">إلغاء</button>
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
              <label style={{ display: 'block', fontSize: '0.92rem', fontWeight: 'bold', marginBottom: '16px', color: 'var(--cp-text-main)' }}>
                تحديث الصلاحيات الممنوحة للمساعد بالتفصيل:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {PERMISSIONS_CATEGORIES.map(category => (
                  <div 
                    key={category.title} 
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.01)', 
                      border: '1px solid var(--cp-card-border)', 
                      borderRadius: '16px', 
                      padding: '16px' 
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h4 style={{ fontSize: '0.92rem', fontWeight: '700', margin: 0, color: 'var(--cp-text-main)' }}>
                          <i className={`fas ${category.icon}`} style={{ marginInlineEnd: '6px', color: '#8c72db' }} />
                          {category.title}
                        </h4>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          type="button" 
                          onClick={() => {
                            const keys = category.items.map(item => item.key)
                            setSelectedPermissions(prev => {
                              const filtered = prev.filter(p => !keys.includes(p))
                              return [...filtered, ...keys]
                            })
                          }} 
                          style={{ fontSize: '0.72rem', background: 'rgba(20, 184, 166, 0.1)', color: '#14b8a6', border: 'none', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          تحديد الكل
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            const keys = category.items.map(item => item.key)
                            setSelectedPermissions(prev => prev.filter(p => !keys.includes(p)))
                          }} 
                          style={{ fontSize: '0.72rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          إلغاء الكل
                        </button>
                      </div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                      {category.items.map(item => {
                        const checked = selectedPermissions.includes(item.key)
                        const holders = getOtherAssistantsWithPermission(item.key, editingAssistant.id)
                        return (
                          <label 
                            key={item.key} 
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'space-between',
                              gap: '10px', 
                              padding: '12px 14px', 
                              borderRadius: '12px', 
                              border: '1px solid ' + (checked ? 'rgba(140, 114, 219, 0.25)' : 'var(--cp-card-border)'), 
                              background: checked ? 'rgba(140, 114, 219, 0.04)' : 'transparent', 
                              cursor: 'pointer',
                              fontSize: '0.82rem',
                              fontWeight: '600',
                              color: checked ? 'var(--cp-text-main)' : 'var(--cp-text-muted)',
                              transition: 'all 0.2s',
                              flexWrap: 'wrap'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <input 
                                type="checkbox" 
                                checked={checked} 
                                onChange={() => handlePermissionToggle(item.key)}
                                style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                              />
                              <span>{item.label}</span>
                            </div>
                            {holders.length > 0 && (
                              <span style={{ 
                                fontSize: '0.7rem', 
                                color: 'var(--cp-text-muted)', 
                                padding: '2px 6px', 
                                borderRadius: '6px', 
                                background: 'var(--cp-hover-bg, rgba(0,0,0,0.04))',
                                fontWeight: 'normal'
                              }}>
                                (ممنوحة لـ: {holders.join('، ')})
                              </span>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={saving} className="cp-btn cp-btn-success" style={{ padding: '10px 24px' }}>
                {saving ? <i className="fas fa-spinner fa-spin"></i> : 'تحديث وصيانة الصلاحيات'}
              </button>
              <button type="button" onClick={() => { setShowEditForm(false); setEditingAssistant(null); setSelectedPermissions([]); }} className="cp-btn cp-btn-secondary">إلغاء</button>
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
                          {SHORT_LABELS[p] || p}
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
                  onClick={() => setDeletingAssistant({ id: assistant.id, name: assistant.name })}
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

      {deletingAssistant && (
        <ConfirmDeleteDialog
          title="تأكيد حذف المساعد"
          itemLabel={deletingAssistant.name}
          message="هل أنت متأكد من حذف حساب المساعد؟ لن يتمكن من تسجيل الدخول مجدداً."
          confirmText="نعم، احذف المساعد"
          cancelText="إلغاء"
          onConfirm={confirmDeleteAssistant}
          onCancel={() => setDeletingAssistant(null)}
        />
      )}
    </div>
  )
}
