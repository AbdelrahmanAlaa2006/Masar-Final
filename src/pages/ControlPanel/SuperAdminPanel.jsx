import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@backend/supabase'
import { invalidateAll } from '../../utils/cache'

export default function SuperAdminPanel({ onBack, flash }) {
  const [tenants, setTenants] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  
  // Wipe database states
  const [showWipeModal, setShowWipeModal] = useState(false)
  const [confirmEmailInput, setConfirmEmailInput] = useState('')
  const [wiping, setWiping] = useState(false)
  const [selectedTenantForWipe, setSelectedTenantForWipe] = useState(null)

  // Create Tenant states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [newPrimaryColor, setNewPrimaryColor] = useState('#7c3aed')
  const [newSecondaryColor, setNewSecondaryColor] = useState('#06b6d4')
  const [creating, setCreating] = useState(false)

  // Manage Tenant & User states
  const [selectedTenantForManage, setSelectedTenantForManage] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDomain, setEditDomain] = useState('')
  const [editPrimaryColor, setEditPrimaryColor] = useState('')
  const [editSecondaryColor, setEditSecondaryColor] = useState('')
  const [savingTenant, setSavingTenant] = useState(false)
  const [userRoleUpdating, setUserRoleUpdating] = useState(null)
  const [searchUserQuery, setSearchUserQuery] = useState('')

  // Database diagnostics state
  const [dbStats, setDbStats] = useState({
    videos: 0,
    exams: 0,
    homeworks: 0,
    attempts: 0,
    submissions: 0,
    payments: 0
  })

  // Load SaaS summary data and db diagnostics
  const fetchStats = async (active = true) => {
    try {
      setLoading(true)
      
      // 1. Get logged-in user email
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (active && authUser?.email) {
        setCurrentUserEmail(authUser.email)
      }

      // 2. Fetch all tenants
      const { data: tenantsList, error: tErr } = await supabase
        .from('tenants')
        .select('*')
        .order('name')
      if (tErr) throw tErr

      // 3. Fetch all profiles to calculate user counts
      const { data: profilesList, error: pErr } = await supabase
        .from('profiles')
        .select('id, tenant_id, role, name, phone, created_at')
      if (pErr) throw pErr

      // 4. Fetch DB diagnostics stats (head count only, lightweight)
      const [vCount, eCount, hCount, attCount, subCount, pCount] = await Promise.all([
        supabase.from('videos').select('*', { count: 'exact', head: true }),
        supabase.from('exams').select('*', { count: 'exact', head: true }),
        supabase.from('homeworks').select('*', { count: 'exact', head: true }),
        supabase.from('exam_attempts').select('*', { count: 'exact', head: true }),
        supabase.from('homework_submissions').select('*', { count: 'exact', head: true }),
        supabase.from('payments').select('*', { count: 'exact', head: true })
      ])

      if (!active) return

      setProfiles(profilesList || [])

      setDbStats({
        videos: vCount.count || 0,
        exams: eCount.count || 0,
        homeworks: hCount.count || 0,
        attempts: attCount.count || 0,
        submissions: subCount.count || 0,
        payments: pCount.count || 0
      })

      // Calculate user counts per tenant
      const mappedTenants = (tenantsList || []).map(t => {
        const tenantProfiles = (profilesList || []).filter(p => p.tenant_id === t.id)
        const studentsCount = tenantProfiles.filter(p => p.role === 'student').length
        const assistantsCount = tenantProfiles.filter(p => p.role === 'assistant').length
        const adminsCount = tenantProfiles.filter(p => p.role === 'admin').length

        return {
          ...t,
          studentsCount,
          assistantsCount,
          adminsCount
        }
      })

      setTenants(mappedTenants)
    } catch (err) {
      console.error(err)
      if (active) setError(err.message || 'تعذر تحميل إحصائيات السوبر أدمن')
    } finally {
      if (active) setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    fetchStats(active)
    return () => { active = false }
  }, [])

  // Global counts memo
  const globalStats = useMemo(() => {
    return {
      tenants: tenants.length,
      students: profiles.filter(p => p.role === 'student').length,
      assistants: profiles.filter(p => p.role === 'assistant').length,
      admins: profiles.filter(p => p.role === 'admin').length,
    }
  }, [tenants, profiles])

  // Execute database wipe
  const handleWipeDatabase = async (e) => {
    e.preventDefault()
    if (!confirmEmailInput.trim()) {
      flash('يرجى إدخال البريد الإلكتروني للتأكيد', 'warning')
      return
    }

    if (confirmEmailInput.trim() !== currentUserEmail) {
      flash('البريد الإلكتروني المدخل لا يطابق حسابك الحالي!', 'error')
      return
    }

    setWiping(true)
    try {
      const { error: rpcErr } = await supabase.rpc('wipe_all_test_data', {
        p_confirm_email: currentUserEmail.trim(),
        p_tenant_id: selectedTenantForWipe ? selectedTenantForWipe.id : null
      })
      if (rpcErr) throw rpcErr

      if (selectedTenantForWipe) {
        flash(`تم تنظيف بيانات منصة (${selectedTenantForWipe.name}) بنجاح! 🎉`, 'success')
      } else {
        flash('تم تنظيف قاعدة البيانات بالكامل بنجاح ومسح جميع بيانات التجارب! 🎉', 'success')
      }
      invalidateAll()
      setShowWipeModal(false)
      setConfirmEmailInput('')
      
      // Reload page to re-authenticate or clear session
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch (err) {
      console.error(err)
      flash('fشل تنظيف قاعدة البيانات: ' + err.message, 'error')
    } finally {
      setWiping(false)
    }
  }

  // Create Platform/Tenant handler
  const handleCreateTenant = async (e) => {
    e.preventDefault()
    if (!newName.trim() || !newSlug.trim()) {
      flash('يرجى ملء الحقول المطلوبة (الاسم والمعرف)', 'warning')
      return
    }
    
    // Slug validation
    const slugRegex = /^[a-z0-9-]+$/
    if (!slugRegex.test(newSlug.trim())) {
      flash('المعرف السريع يجب أن يحتوي على أحرف صغيرة وأرقام وواصلات (-) فقط بدون مسافات', 'error')
      return
    }

    // Check duplicate slug
    if (tenants.some(t => t.slug === newSlug.trim())) {
      flash('المعرف السريع مستخدم بالفعل لمنصة أخرى!', 'error')
      return
    }

    setCreating(true)
    try {
      const { error } = await supabase
        .from('tenants')
        .insert({
          name: newName.trim(),
          slug: newSlug.trim(),
          domain: newDomain.trim() || null,
          primary_color: newPrimaryColor,
          secondary_color: newSecondaryColor,
          config: {
            branding: {
              hero_title: `طور مهاراتك مع منصة ${newName.trim()}`,
              hero_subtitle: 'أكتشف مجموعة واسعة من المحاضرات والامتحانات والفيديوهات التعليمية المصممة خصيصًا لمساعدتك على التفوق وتحقيق أهدافك الدراسية.'
            },
            features: {
              chat: true,
              payments: true,
              notifications: true
            }
          }
        })

      if (error) throw error

      flash(`تم إنشاء منصة (${newName.trim()}) بنجاح!`, 'success')
      
      // Reset form
      setNewName('')
      setNewSlug('')
      setNewDomain('')
      setNewPrimaryColor('#7c3aed')
      setNewSecondaryColor('#06b6d4')
      setShowCreateModal(false)

      // Refresh data
      fetchStats()
    } catch (err) {
      console.error(err)
      flash('فشل إنشاء المنصة: ' + err.message, 'error')
    } finally {
      setCreating(false)
    }
  }

  // Setup Edit settings states
  const openManageTenant = (tenant) => {
    setSelectedTenantForManage(tenant)
    setEditName(tenant.name)
    setEditDomain(tenant.domain || '')
    setEditPrimaryColor(tenant.primary_color || '#7c3aed')
    setEditSecondaryColor(tenant.secondary_color || '#06b6d4')
    setSearchUserQuery('')
  }

  // Save Tenant settings update
  const handleUpdateTenant = async (e) => {
    e.preventDefault()
    if (!editName.trim()) {
      flash('اسم المنصة مطلوب', 'warning')
      return
    }

    setSavingTenant(true)
    try {
      const { error } = await supabase
        .from('tenants')
        .update({
          name: editName.trim(),
          domain: editDomain.trim() || null,
          primary_color: editPrimaryColor,
          secondary_color: editSecondaryColor
        })
        .eq('id', selectedTenantForManage.id)

      if (error) throw error

      flash('تم تحديث إعدادات المنصة بنجاح!', 'success')
      
      setSelectedTenantForManage(null)
      fetchStats()
    } catch (err) {
      console.error(err)
      flash('فشل تحديث المنصة: ' + err.message, 'error')
    } finally {
      setSavingTenant(false)
    }
  }

  // Update user role handler
  const handleUpdateUserRole = async (userId, newRole) => {
    setUserRoleUpdating(userId)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId)

      if (error) throw error

      flash('تم تغيير صلاحيات المستخدم بنجاح!', 'success')
      
      // Update local profiles list state
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, role: newRole } : p))
      
      // Refresh statistics locally
      fetchStats()
    } catch (err) {
      console.error(err)
      flash('فشل تحديث صلاحيات المستخدم: ' + err.message, 'error')
    } finally {
      setUserRoleUpdating(null)
    }
  }

  // Filtered users memo for the selected tenant modal
  const filteredUsers = useMemo(() => {
    if (!selectedTenantForManage) return []
    const tenantUsers = profiles.filter(p => p.tenant_id === selectedTenantForManage.id)
    if (!searchUserQuery.trim()) return tenantUsers
    
    const query = searchUserQuery.toLowerCase().trim()
    return tenantUsers.filter(u => 
      (u.name || '').toLowerCase().includes(query) || 
      (u.phone || '').toLowerCase().includes(query)
    )
  }, [profiles, selectedTenantForManage, searchUserQuery])

  return (
    <div className="cp-panel-container" style={{ direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="fas fa-user-ninja" style={{ color: '#ec4899' }}></i>
            <span>لوحة المطور والـ Super Admin</span>
          </h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', margin: '6px 0 0' }}>إدارة منصات المدرسين ومراقبة حجم قاعدة البيانات وإجراء عمليات الصيانة الشاملة</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="cp-btn cp-btn-primary" 
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--primary, #7c3aed)', color: '#fff' }}
          >
            <i className="fas fa-plus"></i>
            <span>إنشاء منصة جديدة</span>
          </button>
          <button onClick={onBack} className="cp-btn cp-btn-secondary">
            رجوع للوحة التحكم
          </button>
        </div>
      </div>

      {loading ? (
        <div className="cp-empty">
          <i className="fas fa-spinner fa-spin"></i>
          <p>جاري تحميل إحصائيات النظام ومجموعات المدرسين...</p>
        </div>
      ) : error ? (
        <div className="cp-empty" style={{ color: '#ef4444' }}>
          <i className="fas fa-triangle-exclamation"></i>
          <p>{error}</p>
        </div>
      ) : (
        <>
          {/* Global Statistics Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '28px'
          }}>
            <div style={{ background: 'var(--cp-card-bg, #fff)', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                <i className="fas fa-cubes"></i>
              </div>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-color)' }}>{globalStats.tenants}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)' }}>المنصات الفعالة</div>
              </div>
            </div>

            <div style={{ background: 'var(--cp-card-bg, #fff)', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                <i className="fas fa-graduation-cap"></i>
              </div>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-color)' }}>{globalStats.students}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)' }}>إجمالي الطلاب</div>
              </div>
            </div>

            <div style={{ background: 'var(--cp-card-bg, #fff)', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                <i className="fas fa-users-cog"></i>
              </div>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-color)' }}>{globalStats.assistants}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)' }}>المساعدين المشتركين</div>
              </div>
            </div>

            <div style={{ background: 'var(--cp-card-bg, #fff)', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                <i className="fas fa-user-tie"></i>
              </div>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-color)' }}>{globalStats.admins}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)' }}>المشرفين والمعلمين</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px', alignItems: 'start' }}>
            
            {/* Left Side: Tenants Management List */}
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', marginBottom: '16px' }}>المنصات والمدرسين المشتركين ({tenants.length})</h3>
              
              <div className="sync-tech-table-wrapper" style={{ borderRadius: 16, border: '1px solid var(--border-light, #e2e8f0)', background: 'var(--card-bg, #fff)', overflowX: 'auto', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <table className="sync-tech-table" style={{ width: '100%', minWidth: 600 }}>
                  <thead>
                    <tr style={{ background: 'rgba(99, 102, 241, 0.04)' }}>
                      <th style={{ padding: '14px 16px', color: 'var(--text-color)', fontSize: '0.88rem', fontWeight: 'bold', textAlign: 'right' }}>اسم المنصة</th>
                      <th style={{ padding: '14px 16px', color: 'var(--text-color)', fontSize: '0.88rem', fontWeight: 'bold', textAlign: 'right' }}>المعرف السريع (Slug)</th>
                      <th style={{ padding: '14px 16px', color: 'var(--text-color)', fontSize: '0.88rem', fontWeight: 'bold', textAlign: 'center' }}>الطلاب</th>
                      <th style={{ padding: '14px 16px', color: 'var(--text-color)', fontSize: '0.88rem', fontWeight: 'bold', textAlign: 'center' }}>المساعدين</th>
                      <th style={{ padding: '14px 16px', color: 'var(--text-color)', fontSize: '0.88rem', fontWeight: 'bold', textAlign: 'center' }}>المشرفين</th>
                      <th style={{ padding: '14px 16px', color: 'var(--text-color)', fontSize: '0.88rem', fontWeight: 'bold', textAlign: 'center' }}>خيارات التحكم والصيانة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((t) => (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--border-light, #f1f5f9)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-color)' }}>{t.name}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}><code style={{ background: 'rgba(99,102,241,0.06)', padding: '3px 8px', borderRadius: 6, fontSize: '0.8rem' }}>{t.slug}</code></td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 'bold', color: 'var(--primary)' }}>{t.studentsCount}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>{t.assistantsCount}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', color: '#f59e0b', fontWeight: 'bold' }}>{t.adminsCount}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            onClick={() => openManageTenant(t)}
                            className="cp-btn"
                            style={{
                              padding: '6px 12px',
                              background: 'rgba(99, 102, 241, 0.08)',
                              color: '#6366f1',
                              border: '1px solid rgba(99, 102, 241, 0.2)',
                              borderRadius: '8px',
                              fontSize: '0.8rem',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              transition: 'all 0.2s'
                            }}
                          >
                            <i className="fas fa-gears"></i>
                            <span>إدارة المنصة</span>
                          </button>
                          
                          <button
                            onClick={() => {
                              setSelectedTenantForWipe(t)
                              setShowWipeModal(true)
                            }}
                            className="cp-btn"
                            style={{
                              padding: '6px 12px',
                              background: 'rgba(239, 68, 68, 0.08)',
                              color: '#ef4444',
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                              borderRadius: '8px',
                              fontSize: '0.8rem',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              transition: 'all 0.2s'
                            }}
                          >
                            <i className="fas fa-trash-can"></i>
                            <span>تصفير</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Side: Security Wiping Tool */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Database Usage Statistics */}
              <div style={{ background: 'var(--cp-card-bg, #fff)', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '24px', padding: '24px', boxShadow: '0 4px 6px rgba(0,0,0,0.01)' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fas fa-server" style={{ color: '#06b6d4' }}></i>
                  <span>مراقبة حجم قاعدة البيانات</span>
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--cp-text-muted)' }}>الملفات والفيديوهات</span>
                    <strong style={{ color: 'var(--cp-text-main)' }}>{dbStats.videos} سجل</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--cp-text-muted)' }}>الامتحانات والواجبات</span>
                    <strong style={{ color: 'var(--cp-text-main)' }}>{dbStats.exams + dbStats.homeworks} سجل</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--cp-text-muted)' }}>المحاولات والحلول</span>
                    <strong style={{ color: 'var(--cp-text-main)' }}>{dbStats.attempts + dbStats.submissions} حلّ</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--cp-text-muted)' }}>إيصالات المدفوعات</span>
                    <strong style={{ color: 'var(--cp-text-main)' }}>{dbStats.payments} إيصال</strong>
                  </div>
                </div>
              </div>

              {/* Database Wipe Tool Widget */}
              <div style={{
                background: 'rgba(239, 68, 68, 0.03)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                borderRadius: '24px',
                padding: '24px',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.02)'
              }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', marginBottom: '16px' }}>
                  <i className="fas fa-dumpster-fire"></i>
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#b91c1c', margin: '0 0 8px' }}>صيانة وقاعدة البيانات</h3>
                <p style={{ fontSize: '0.82rem', color: '#7f1d1d', margin: '0 0 20px', lineHeight: '1.5', opacity: 0.9 }}>
                  أداة تنظيف وتفريغ قاعدة البيانات بشكل آمن. ستقوم بمسح جميع حسابات الطلاب والمساعدين، وجميع الواجبات، التقييمات، والامتحانات للتخلص من بيانات التجارب والبدء من جديد.
                </p>
                
                <button 
                  onClick={() => {
                    setSelectedTenantForWipe(null)
                    setShowWipeModal(true)
                  }}
                  className="cp-btn cp-btn-danger"
                  style={{ width: '100%', padding: '10px 14px', background: '#ef4444', color: '#fff', fontWeight: 'bold', justifyContent: 'center', borderRadius: 12 }}
                >
                  تفريغ شامل لكافة المنصات (Global Wipe)
                </button>
              </div>

              {/* General diagnostics */}
              <div style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--cp-card-border)', borderRadius: '24px', padding: '24px' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', margin: '0 0 12px' }}>معلومات الاتصال بالمطور</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--cp-text-muted)', margin: '0 0 6px' }}>بريدك الإلكتروني المسجل بالمطور:</p>
                <strong style={{ fontSize: '0.9rem', color: 'var(--cp-text-main)', display: 'block', wordBreak: 'break-all' }}>{currentUserEmail || 'جاري التحميل...'}</strong>
              </div>

            </div>

          </div>
        </>
      )}

      {/* Wipe Database Confirmation Modal */}
      {showWipeModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: 20
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '24px',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            padding: '32px',
            maxWidth: '480px',
            width: '100%',
            color: '#1e293b',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            position: 'relative'
          }}>
            <button 
              onClick={() => {
                setShowWipeModal(false)
                setConfirmEmailInput('')
              }}
              style={{ position: 'absolute', top: 20, left: 20, background: 'none', border: 'none', color: '#64748b', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              <i className="fas fa-times"></i>
            </button>

            <div style={{ color: '#ef4444', fontSize: '2.5rem', marginBottom: '16px', textAlign: 'center' }}>
              <i className="fas fa-triangle-exclamation"></i>
            </div>
            
            <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#b91c1c', textAlign: 'center', margin: '0 0 12px' }}>
              {selectedTenantForWipe ? `تأكيد مسح بيانات منصة (${selectedTenantForWipe.name})` : 'تأكيد مسح البيانات بالكامل'}
            </h3>
            <p style={{ fontSize: '0.88rem', color: '#475569', textAlign: 'center', lineHeight: '1.6', margin: '0 0 24px' }}>
              ⚠️ <strong>تحذير خطير:</strong>{' '}
              {selectedTenantForWipe ? (
                <span>
                  هذا الإجراء سيقوم بحذف كافة بيانات الطلاب والمساعدين ونتائج الواجبات والامتحانات والحضور والمدفوعات الخاصة بـمنصة{' '}
                  <strong>({selectedTenantForWipe.name})</strong> فقط. لن تتأثر بقية المنصات. لا يمكن التراجع عن هذا الإجراء!
                </span>
              ) : (
                <span>
                  هذا الإجراء سيقوم بحذف كافة بيانات الطلاب والمساعدين وجميع الواجبات والامتحانات والحضور والمدفوعات لجميع المدرسين والمنصات بلا استثناء. لا يمكن التراجع عن هذا الإجراء!
                </span>
              )}
              <br />
              <br />
              لتأكيد رغبتك بالمسح، يرجى كتابة بريدك الإلكتروني الحالي أدناه:
              <br />
              <code style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: 6, display: 'inline-block', marginTop: 8, color: '#334155', fontWeight: 'bold' }}>{currentUserEmail}</code>
            </p>

            <form onSubmit={handleWipeDatabase}>
              <div style={{ marginBottom: '20px' }}>
                <input 
                  type="text"
                  value={confirmEmailInput}
                  onChange={(e) => setConfirmEmailInput(e.target.value)}
                  placeholder="اكتب البريد الإلكتروني للتأكيد..."
                  className="cp-input"
                  style={{ width: '100%', padding: '12px 14px', border: '1.5px solid rgba(239, 68, 68, 0.2)', color: '#000', direction: 'ltr' }}
                  disabled={wiping}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="submit"
                  disabled={wiping}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '12px',
                    border: 'none',
                    background: '#ef4444',
                    color: '#fff',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  {wiping ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-trash-can"></i>}
                  <span>{wiping ? 'جاري تهيئة قاعدة البيانات...' : 'نعم، امسح البيانات'}</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    setShowWipeModal(false)
                    setConfirmEmailInput('')
                  }}
                  disabled={wiping}
                  style={{
                    padding: '12px 24px',
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    background: 'transparent',
                    color: '#475569',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Tenant Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: 20
        }}>
          <div style={{
            background: 'var(--card-bg, #ffffff)',
            borderRadius: '24px',
            border: '1px solid var(--border-color, rgba(99, 102, 241, 0.2))',
            padding: '32px',
            maxWidth: '520px',
            width: '100%',
            color: 'var(--text-color)',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            position: 'relative'
          }}>
            <button 
              onClick={() => {
                setShowCreateModal(false)
                setNewName('')
                setNewSlug('')
                setNewDomain('')
              }}
              style={{ position: 'absolute', top: 20, left: 20, background: 'none', border: 'none', color: '#64748b', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              <i className="fas fa-times"></i>
            </button>

            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-plus" style={{ color: 'var(--primary, #7c3aed)' }}></i>
              <span>إنشاء منصة تعليمية جديدة</span>
            </h3>

            <form onSubmit={handleCreateTenant}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 'bold', marginBottom: '6px' }}>اسم المنصة (المعلم/المركز) *</label>
                <input 
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value)
                    if (!newSlug) {
                      const auto = e.target.value.toLowerCase()
                        .replace(/[^\u0621-\u064A\u0660-\u0669a-zA-Z0-9\s-]/g, '')
                        .replace(/\s+/g, '-')
                      setNewSlug(auto)
                    }
                  }}
                  placeholder="مثال: الأستاذ أحمد - فيزياء"
                  className="cp-input"
                  style={{ width: '100%', padding: '12px', border: '1.5px solid var(--border-color, #e2e8f0)', color: 'var(--text-color)', background: 'var(--card-bg, #fff)' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 'bold', marginBottom: '6px' }}>المعرف السريع (Slug) *</label>
                <input 
                  type="text"
                  required
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  placeholder="مثال: ahmed-physics (أحرف صغيرة وواصلات فقط)"
                  className="cp-input"
                  style={{ width: '100%', padding: '12px', border: '1.5px solid var(--border-color, #e2e8f0)', color: 'var(--text-color)', background: 'var(--card-bg, #fff)', direction: 'ltr' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 'bold', marginBottom: '6px' }}>النطاق المخصص (Domain - اختياري)</label>
                <input 
                  type="text"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value.toLowerCase().trim())}
                  placeholder="مثال: physics-ahmed.com"
                  className="cp-input"
                  style={{ width: '100%', padding: '12px', border: '1.5px solid var(--border-color, #e2e8f0)', color: 'var(--text-color)', background: 'var(--card-bg, #fff)', direction: 'ltr' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 'bold', marginBottom: '6px' }}>اللون الأساسي</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input 
                      type="color"
                      value={newPrimaryColor}
                      onChange={(e) => setNewPrimaryColor(e.target.value)}
                      style={{ width: '40px', height: '40px', padding: 0, border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                    />
                    <code style={{ fontSize: '0.85rem' }}>{newPrimaryColor}</code>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 'bold', marginBottom: '6px' }}>اللون الفرعي</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input 
                      type="color"
                      value={newSecondaryColor}
                      onChange={(e) => setNewSecondaryColor(e.target.value)}
                      style={{ width: '40px', height: '40px', padding: 0, border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                    />
                    <code style={{ fontSize: '0.85rem' }}>{newSecondaryColor}</code>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="submit"
                  disabled={creating}
                  className="cp-btn cp-btn-primary"
                  style={{ flex: 1, padding: '12px', background: 'var(--primary, #7c3aed)', color: '#fff', fontWeight: 'bold', justifyContent: 'center' }}
                >
                  {creating ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check"></i>}
                  <span>{creating ? 'جاري إنشاء المنصة...' : 'تأكيد إنشاء المنصة'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false)
                    setNewName('')
                    setNewSlug('')
                    setNewDomain('')
                  }}
                  className="cp-btn cp-btn-secondary"
                  style={{ padding: '12px 24px' }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Tenant Modal */}
      {selectedTenantForManage && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: 20
        }}>
          <div style={{
            background: 'var(--card-bg, #ffffff)',
            borderRadius: '24px',
            border: '1px solid var(--border-color, rgba(99, 102, 241, 0.2))',
            padding: '32px',
            maxWidth: '760px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            color: 'var(--text-color)',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            position: 'relative'
          }}>
            <button 
              onClick={() => setSelectedTenantForManage(null)}
              style={{ position: 'absolute', top: 20, left: 20, background: 'none', border: 'none', color: '#64748b', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              <i className="fas fa-times"></i>
            </button>

            <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-sliders-h" style={{ color: 'var(--primary, #7c3aed)' }}></i>
              <span>إدارة منصة ({selectedTenantForManage.name})</span>
            </h3>

            {/* 1. Edit Tenant Settings Form */}
            <form onSubmit={handleUpdateTenant} style={{ borderBottom: '1px solid var(--border-light, #e2e8f0)', paddingBottom: '24px', marginBottom: '24px' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '14px', color: 'var(--primary, #7c3aed)' }}>إعدادات الهوية والنطاق</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>اسم المنصة *</label>
                  <input 
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="cp-input"
                    style={{ width: '100%', padding: '10px', border: '1.5px solid var(--border-color, #e2e8f0)', color: 'var(--text-color)', background: 'var(--card-bg, #fff)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>النطاق المخصص (Domain)</label>
                  <input 
                    type="text"
                    value={editDomain}
                    onChange={(e) => setEditDomain(e.target.value.toLowerCase().trim())}
                    placeholder="مثال: subdomain.domain.com"
                    className="cp-input"
                    style={{ width: '100%', padding: '10px', border: '1.5px solid var(--border-color, #e2e8f0)', color: 'var(--text-color)', background: 'var(--card-bg, #fff)', direction: 'ltr' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>اللون الأساسي</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input 
                      type="color"
                      value={editPrimaryColor}
                      onChange={(e) => setEditPrimaryColor(e.target.value)}
                      style={{ width: '36px', height: '36px', padding: 0, border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                    />
                    <code style={{ fontSize: '0.8rem' }}>{editPrimaryColor}</code>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>اللون الفرعي</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input 
                      type="color"
                      value={editSecondaryColor}
                      onChange={(e) => setEditSecondaryColor(e.target.value)}
                      style={{ width: '36px', height: '36px', padding: 0, border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                    />
                    <code style={{ fontSize: '0.8rem' }}>{editSecondaryColor}</code>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '18px' }}>
                  <button
                    type="submit"
                    disabled={savingTenant}
                    className="cp-btn cp-btn-primary"
                    style={{ padding: '10px 20px', background: 'var(--primary, #7c3aed)', color: '#fff', fontWeight: 'bold' }}
                  >
                    {savingTenant ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>}
                    <span style={{ marginInlineStart: '6px' }}>حفظ التعديلات</span>
                  </button>
                </div>
              </div>
            </form>

            {/* 2. User Management list */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 'bold', margin: 0, color: 'var(--primary, #7c3aed)' }}>إدارة صلاحيات المستخدمين</h4>
                <div style={{ position: 'relative', maxWidth: '240px', width: '100%' }}>
                  <input 
                    type="text"
                    placeholder="البحث باسم المستخدم أو رقم الهاتف..."
                    value={searchUserQuery}
                    onChange={(e) => setSearchUserQuery(e.target.value)}
                    className="cp-input"
                    style={{ width: '100%', padding: '6px 12px 6px 30px', fontSize: '0.82rem', border: '1.5px solid var(--border-color, #e2e8f0)', background: 'var(--card-bg, #fff)' }}
                  />
                  <i className="fas fa-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '12px' }}></i>
                </div>
              </div>

              {filteredUsers.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', border: '1px dashed var(--border-light, #e2e8f0)', borderRadius: '16px', color: 'var(--cp-text-muted)' }}>
                  <i className="fas fa-users-slash" style={{ fontSize: '24px', marginBottom: '8px', display: 'block', opacity: 0.6 }}></i>
                  <span>لا يوجد مستخدمين مسجلين يطابقون البحث.</span>
                </div>
              ) : (
                <div style={{ border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '14px', overflow: 'hidden', background: 'var(--card-bg, #fff)' }}>
                  <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.88rem' }}>
                      <thead>
                        <tr style={{ background: 'rgba(99, 102, 241, 0.03)', borderBottom: '1px solid var(--border-light, #e2e8f0)' }}>
                          <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 'bold' }}>الاسم</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 'bold' }}>رقم الهاتف</th>
                          <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 'bold' }}>الصلاحية الحالية</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map(u => (
                          <tr key={u.id} style={{ borderBottom: '1px solid var(--border-light, #f1f5f9)' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 600 }}>{u.name}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--cp-text-muted)', direction: 'ltr', textAlign: 'right' }}>{u.phone}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <select
                                value={u.role}
                                onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                                disabled={userRoleUpdating === u.id}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '8px',
                                  border: '1.5px solid var(--border-color, #e2e8f0)',
                                  background: 'var(--card-bg, #fff)',
                                  color: 'var(--text-color)',
                                  fontSize: '0.8rem',
                                  fontWeight: '500',
                                  cursor: 'pointer'
                                }}
                              >
                                <option value="student">طالب</option>
                                <option value="assistant">مساعد</option>
                                <option value="admin">مشرف/معلم</option>
                                <option value="super_admin">سوبر أدمن</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
