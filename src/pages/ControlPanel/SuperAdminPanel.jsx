import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@backend/supabase'
import { invalidateAll } from '../../utils/cache'
import SeasonalThemePanel from './SeasonalThemePanel'
import DevToolsViolationsPanel from './DevToolsViolationsPanel'

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
  const [activeSubSection, setActiveSubSection] = useState(null)

  // Database diagnostics state
  const [dbStats, setDbStats] = useState({
    videos: 0,
    exams: 0,
    homeworks: 0,
    attempts: 0,
    submissions: 0,
    payments: 0
  })

  // Viewport resize state
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Platform search filter state
  const [searchPlatformQuery, setSearchPlatformQuery] = useState('')

  const filteredTenants = useMemo(() => {
    if (!searchPlatformQuery.trim()) return tenants
    const query = searchPlatformQuery.toLowerCase().trim()
    return tenants.filter(t => 
      (t.name || '').toLowerCase().includes(query) || 
      (t.slug || '').toLowerCase().includes(query)
    )
  }, [tenants, searchPlatformQuery])


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

  // Scroll to top on active sub-section change (e.g. going to Seasonal Themes)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [activeSubSection])

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

  if (activeSubSection === 'violations') {
    return (
      <div className="cp-panel-container" style={{ direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fas fa-shield-halved" style={{ color: '#ef4444' }}></i>
              <span>سجلات الحماية الأمنية</span>
            </h2>
            <p style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', margin: '6px 0 0' }}>استعرض تفاصيل محاولات اختراق الحماية ومحاولات فتح أدوات المطور (DevTools) المسجلة أوتوماتيكيًا.</p>
          </div>
          <div>
            <button onClick={() => setActiveSubSection(null)} className="cp-btn cp-btn-secondary">
              رجوع للوحة السوبر أدمن
            </button>
          </div>
        </div>
        <DevToolsViolationsPanel onBack={() => setActiveSubSection(null)} flash={flash} />
      </div>
    )
  }

  if (activeSubSection === 'seasons') {
    return (
      <div className="cp-panel-container" style={{ direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fas fa-moon" style={{ color: 'var(--primary, #7c3aed)' }}></i>
              <span>السمات الموسمية</span>
            </h2>
            <p style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', margin: '6px 0 0' }}>التحكم في تزيين المنصات التلقائي وإجبار سمة معينة أو تعطيل التزيين لكافة المدرسين</p>
          </div>
          <div>
            <button onClick={() => setActiveSubSection(null)} className="cp-btn cp-btn-secondary">
              رجوع للوحة السوبر أدمن
            </button>
          </div>
        </div>
        <SeasonalThemePanel />
      </div>
    )
  }

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
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--primary, #7c3aed)', color: '#fff', height: '42px' }}
          >
            <i className="fas fa-plus"></i>
            <span>إنشاء منصة جديدة</span>
          </button>
          <button onClick={onBack} className="cp-btn cp-btn-secondary" style={{ height: '42px' }}>
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
          <div className="cp-sa-stats-grid">
            <div className="cp-sa-stat-card cp-sa-violet">
              <div className="cp-sa-stat-icon">
                <i className="fas fa-cubes"></i>
              </div>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-color)' }}>{globalStats.tenants}</div>
                <div style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', fontWeight: 600 }}>المنصات الفعالة</div>
              </div>
            </div>

            <div className="cp-sa-stat-card cp-sa-emerald">
              <div className="cp-sa-stat-icon">
                <i className="fas fa-graduation-cap"></i>
              </div>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-color)' }}>{globalStats.students}</div>
                <div style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', fontWeight: 600 }}>إجمالي الطلاب</div>
              </div>
            </div>

            <div className="cp-sa-stat-card cp-sa-amber">
              <div className="cp-sa-stat-icon">
                <i className="fas fa-users-cog"></i>
              </div>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-color)' }}>{globalStats.assistants}</div>
                <div style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', fontWeight: 600 }}>المساعدين المشتركين</div>
              </div>
            </div>

            <div className="cp-sa-stat-card cp-sa-rose">
              <div className="cp-sa-stat-icon">
                <i className="fas fa-user-tie"></i>
              </div>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-color)' }}>{globalStats.admins}</div>
                <div style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', fontWeight: 600 }}>المشرفين والمعلمين</div>
              </div>
            </div>
          </div>

          <div className="cp-sa-grid">
            
            {/* Left Side: Tenants Management List */}
            <div>
              {/* Header and Platform Search */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>المنصات والمدرسين المشتركين ({filteredTenants.length})</h3>
                <div className="cp-search" style={{ margin: 0, maxWidth: '280px', width: '100%' }}>
                  <i className="fas fa-search" style={{ right: '12px' }}></i>
                  <input
                    type="text"
                    placeholder="البحث باسم المنصة أو المعرف..."
                    value={searchPlatformQuery}
                    onChange={(e) => setSearchPlatformQuery(e.target.value)}
                    style={{ padding: '8px 12px 8px 36px', fontSize: '0.88rem' }}
                  />
                  {searchPlatformQuery && (
                    <button onClick={() => setSearchPlatformQuery('')} className="cp-search-clear" style={{ left: '6px' }}>
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                </div>
              </div>
              
              {/* Desktop View (Table) */}
              <div className="cp-sa-desktop-view">
                <div className="cp-sa-table-card">
                  <div className="cp-sa-table-wrapper">
                    <table className="cp-sa-table">
                      <colgroup>
                        <col style={{ width: '32%' }} />
                        <col style={{ width: '22%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '16%' }} />
                      </colgroup>
                      <thead>
                        <tr style={{ background: 'rgba(99, 102, 241, 0.03)' }}>
                          <th style={{ textAlign: 'right' }}>اسم المنصة</th>
                          <th style={{ textAlign: 'right' }}>المعرف السريع (Slug)</th>
                          <th style={{ textAlign: 'center' }}>الطلاب</th>
                          <th style={{ textAlign: 'center' }}>المساعدين</th>
                          <th style={{ textAlign: 'center' }}>المشرفين</th>
                          <th style={{ textAlign: 'center' }}>خيارات التحكم والصيانة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTenants.map((t) => (
                          <tr key={t.id}>
                            <td style={{ fontWeight: 700 }}>{t.name}</td>
                            <td>
                              <code className="cp-sa-color-badge">{t.slug}</code>
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--primary, #7c3aed)' }}>{t.studentsCount}</td>
                            <td style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>{t.assistantsCount}</td>
                            <td style={{ textAlign: 'center', color: '#f59e0b', fontWeight: 'bold' }}>{t.adminsCount}</td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
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
                                  <span>إدارة</span>
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
                              </div>
                            </td>
                          </tr>
                        ))}
                        {filteredTenants.length === 0 && (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--cp-text-muted)' }}>
                              <i className="fas fa-search-minus" style={{ fontSize: '24px', marginBottom: '8px', display: 'block', opacity: 0.6 }}></i>
                              <span>لا توجد منصات تطابق البحث حالياً.</span>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Mobile View (Responsive Cards) */}
              <div className="cp-sa-mobile-view">
                <div className="cp-sa-mobile-stack">
                  {filteredTenants.map((t) => (
                    <div key={t.id} className="cp-sa-mobile-card">
                      <div className="cp-sa-mobile-card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: `linear-gradient(135deg, ${t.primary_color || '#7c3aed'}, ${t.secondary_color || '#06b6d4'})`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: '14px'
                          }}>
                            <i className="fas fa-server"></i>
                          </div>
                          <h4 className="cp-sa-mobile-card-title">{t.name}</h4>
                        </div>
                        <code className="cp-sa-color-badge">{t.slug}</code>
                      </div>

                      <div className="cp-sa-mobile-stats-grid">
                        <div className="cp-sa-mobile-stat-box">
                          <span className="cp-sa-mobile-stat-val" style={{ color: 'var(--primary, #7c3aed)' }}>{t.studentsCount}</span>
                          <span className="cp-sa-mobile-stat-lbl">الطلاب</span>
                        </div>
                        <div className="cp-sa-mobile-stat-box" style={{ borderRight: '1px solid var(--cp-divider)', borderLeft: '1px solid var(--cp-divider)' }}>
                          <span className="cp-sa-mobile-stat-val" style={{ color: '#10b981' }}>{t.assistantsCount}</span>
                          <span className="cp-sa-mobile-stat-lbl">المساعدين</span>
                        </div>
                        <div className="cp-sa-mobile-stat-box">
                          <span className="cp-sa-mobile-stat-val" style={{ color: '#f59e0b' }}>{t.adminsCount}</span>
                          <span className="cp-sa-mobile-stat-lbl">المشرفين</span>
                        </div>
                      </div>

                      <div className="cp-sa-mobile-card-actions">
                        <button
                          onClick={() => openManageTenant(t)}
                          className="cp-btn"
                          style={{
                            padding: '10px',
                            background: 'rgba(99, 102, 241, 0.08)',
                            color: '#6366f1',
                            border: '1px solid rgba(99, 102, 241, 0.2)',
                            borderRadius: '12px',
                            fontSize: '0.85rem',
                            fontWeight: 'bold',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            height: '44px',
                            cursor: 'pointer'
                          }}
                        >
                          <i className="fas fa-gears"></i>
                          <span>إدارة</span>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedTenantForWipe(t)
                            setShowWipeModal(true)
                          }}
                          className="cp-btn"
                          style={{
                            padding: '10px',
                            background: 'rgba(239, 68, 68, 0.08)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            borderRadius: '12px',
                            fontSize: '0.85rem',
                            fontWeight: 'bold',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            height: '44px',
                            cursor: 'pointer'
                          }}
                        >
                          <i className="fas fa-trash-can"></i>
                          <span>تصفير</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  {filteredTenants.length === 0 && (
                    <div className="cp-sa-mobile-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--cp-text-muted)', borderStyle: 'dashed' }}>
                      <i className="fas fa-search-minus" style={{ fontSize: '24px', marginBottom: '8px', display: 'block', opacity: 0.6 }}></i>
                      <span>لا توجد منصات تطابق البحث حالياً.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Side: Security Wiping Tool */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Database Usage Statistics */}
              <div className="cp-sa-sidebar-card">
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <i className="fas fa-server" style={{ color: '#06b6d4' }}></i>
                  <span>مراقبة حجم قاعدة البيانات</span>
                </h3>
                
                {(() => {
                  const maxRecords = Math.max(dbStats.videos, dbStats.exams + dbStats.homeworks, dbStats.attempts + dbStats.submissions, dbStats.payments, 10)
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '4px' }}>
                          <span style={{ color: 'var(--cp-text-muted)' }}>الملفات والفيديوهات</span>
                          <strong style={{ color: 'var(--cp-text-main)' }}>{dbStats.videos} سجل</strong>
                        </div>
                        <div className="cp-sa-progress-bar-container">
                          <div className="cp-sa-progress-bar-fill" style={{ width: `${(dbStats.videos / maxRecords) * 100}%`, background: 'linear-gradient(90deg, #6366f1, #7c3aed)' }} />
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '4px' }}>
                          <span style={{ color: 'var(--cp-text-muted)' }}>الامتحانات والواجبات</span>
                          <strong style={{ color: 'var(--cp-text-main)' }}>{dbStats.exams + dbStats.homeworks} سجل</strong>
                        </div>
                        <div className="cp-sa-progress-bar-container">
                          <div className="cp-sa-progress-bar-fill" style={{ width: `${((dbStats.exams + dbStats.homeworks) / maxRecords) * 100}%`, background: 'linear-gradient(90deg, #10b981, #059669)' }} />
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '4px' }}>
                          <span style={{ color: 'var(--cp-text-muted)' }}>المحاولات والحلول</span>
                          <strong style={{ color: 'var(--cp-text-main)' }}>{dbStats.attempts + dbStats.submissions} حلّ</strong>
                        </div>
                        <div className="cp-sa-progress-bar-container">
                          <div className="cp-sa-progress-bar-fill" style={{ width: `${((dbStats.attempts + dbStats.submissions) / maxRecords) * 100}%`, background: 'linear-gradient(90deg, #f59e0b, #d97706)' }} />
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '4px' }}>
                          <span style={{ color: 'var(--cp-text-muted)' }}>إيصالات المدفوعات</span>
                          <strong style={{ color: 'var(--cp-text-main)' }}>{dbStats.payments} إيصال</strong>
                        </div>
                        <div className="cp-sa-progress-bar-container">
                          <div className="cp-sa-progress-bar-fill" style={{ width: `${(dbStats.payments / maxRecords) * 100}%`, background: 'linear-gradient(90deg, #ec4899, #db2777)' }} />
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Database Wipe Tool Widget */}
              <div className="cp-sa-danger-card">
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', marginBottom: '16px' }}>
                  <i className="fas fa-dumpster-fire"></i>
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ef4444', margin: '0 0 10px' }}>صيانة وقاعدة البيانات</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--cp-text-muted)', margin: '0 0 20px', lineHeight: '1.6' }}>
                  أداة تنظيف وتفريغ قاعدة البيانات بشكل آمن. ستقوم بمسح جميع حسابات الطلاب والمساعدين، وجميع الواجبات، التقييمات، والامتحانات للتخلص من بيانات التجارب والبدء من جديد.
                </p>
                
                <button 
                  onClick={() => {
                    setSelectedTenantForWipe(null)
                    setShowWipeModal(true)
                  }}
                  className="cp-btn cp-btn-danger"
                  style={{ width: '100%', padding: '12px 14px', background: '#ef4444', color: '#fff', fontWeight: 'bold', justifyContent: 'center', borderRadius: 12, height: '44px', cursor: 'pointer' }}
                >
                  تفريغ شامل لكافة المنصات (Global Wipe)
                </button>
              </div>

              {/* Security Violations Widget */}
              <div className="cp-sa-sidebar-card">
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', marginBottom: '16px' }}>
                  <i className="fas fa-shield-halved"></i>
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--text-color)', margin: '0 0 8px' }}>سجلات الحماية الأمنية</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--cp-text-muted)', margin: '0 0 20px', lineHeight: '1.5' }}>
                  عرض محاولات اختراق أدوات المطور (DevTools) المسجلة أوتوماتيكياً لحماية محتوى منصات المدرسين.
                </p>
                <button 
                  onClick={() => setActiveSubSection('violations')}
                  className="cp-btn cp-btn-secondary"
                  style={{ width: '100%', justifyContent: 'center', border: '1px solid #ef4444', color: '#ef4444', height: '44px', cursor: 'pointer' }}
                >
                  عرض سجلات الاختراق
                </button>
              </div>

              {/* Seasonal Themes Manager Widget */}
              <div className="cp-sa-sidebar-card">
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(124, 58, 237, 0.1)', color: 'var(--primary, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', marginBottom: '16px' }}>
                  <i className="fas fa-moon"></i>
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--text-color)', margin: '0 0 8px' }}>السمات الموسمية</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--cp-text-muted)', margin: '0 0 20px', lineHeight: '1.5' }}>
                  التحكم في تزيين المنصة التلقائي (رمضان، الأعياد، الشتاء) وإجبار سمة معينة أو تعطيل التزيين لكافة المدرسين.
                </p>
                <button 
                  onClick={() => setActiveSubSection('seasons')}
                  className="cp-btn cp-btn-secondary"
                  style={{ width: '100%', justifyContent: 'center', border: '1px solid var(--primary, #7c3aed)', color: 'var(--primary, #7c3aed)', height: '44px', cursor: 'pointer' }}
                >
                  إدارة السمات الموسمية
                </button>
              </div>

              {/* General diagnostics */}
              <div className="cp-sa-sidebar-card">
                <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', margin: '0 0 12px' }}>معلومات الاتصال بالمطور</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--cp-text-muted)', margin: '0 0 6px' }}>بريدك الإلكتروني المسجل بالمطور:</p>
                <strong style={{ fontSize: '0.9rem', color: 'var(--cp-text-main)', display: 'block', wordBreak: 'break-all' }}>{currentUserEmail || 'جاري التحميل...'}</strong>
              </div>

            </div>

          </div>
        </>
      )}

      {/* Wipe Database Confirmation Modal */}
      {showWipeModal && createPortal(
        <div className="cp-portal-overlay">
          <div className="cp-portal-modal" style={{ maxWidth: '480px' }}>
            <button 
              onClick={() => {
                setShowWipeModal(false)
                setConfirmEmailInput('')
              }}
              style={{ position: 'absolute', top: 20, left: 20, background: 'none', border: 'none', color: 'var(--cp-text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              <i className="fas fa-times"></i>
            </button>

            <div style={{ color: '#ef4444', fontSize: '2.5rem', marginBottom: '16px', textAlign: 'center' }}>
              <i className="fas fa-triangle-exclamation"></i>
            </div>
            
            <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#ef4444', textAlign: 'center', margin: '0 0 12px' }}>
              {selectedTenantForWipe ? `تأكيد مسح بيانات منصة (${selectedTenantForWipe.name})` : 'تأكيد مسح البيانات بالكامل'}
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', textAlign: 'center', lineHeight: '1.6', margin: '0 0 24px' }}>
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
              <code style={{ background: 'var(--cp-bg)', border: '1px solid var(--cp-divider)', padding: '3px 8px', borderRadius: 6, display: 'inline-block', marginTop: 8, color: 'var(--cp-text-main)', fontWeight: 'bold' }}>{currentUserEmail}</code>
            </p>

            <form onSubmit={handleWipeDatabase}>
              <div style={{ marginBottom: '20px' }}>
                <input 
                  type="text"
                  value={confirmEmailInput}
                  onChange={(e) => setConfirmEmailInput(e.target.value)}
                  placeholder="اكتب البريد الإلكتروني للتأكيد..."
                  className="cp-input"
                  style={{ width: '100%', padding: '12px 14px', border: '1.5px solid rgba(239, 68, 68, 0.2)', color: 'var(--cp-text-main)', background: 'var(--cp-input-bg)', direction: 'ltr' }}
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
                    gap: '8px',
                    height: '44px'
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
                  className="cp-btn cp-btn-secondary"
                  style={{
                    padding: '12px 24px',
                    borderRadius: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    height: '44px'
                  }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Create Tenant Modal */}
      {showCreateModal && createPortal(
        <div className="cp-portal-overlay">
          <div className="cp-portal-modal" style={{ maxWidth: '520px' }}>
            <button 
              onClick={() => {
                setShowCreateModal(false)
                setNewName('')
                setNewSlug('')
                setNewDomain('')
              }}
              style={{ position: 'absolute', top: 20, left: 20, background: 'none', border: 'none', color: 'var(--cp-text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}
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
                  style={{ width: '100%', padding: '12px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 'bold', marginBottom: '6px' }}>المعرف السريع (Slug) *</label>
                <input 
                  type="text"
                  required
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  placeholder="مثال: ahmed-physics"
                  className="cp-input"
                  style={{ width: '100%', padding: '12px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)', direction: 'ltr' }}
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
                  style={{ width: '100%', padding: '12px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)', direction: 'ltr' }}
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
                    <code className="cp-sa-color-badge">{newPrimaryColor}</code>
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
                    <code className="cp-sa-color-badge">{newSecondaryColor}</code>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="submit"
                  disabled={creating}
                  className="cp-btn cp-btn-primary"
                  style={{ flex: 1, padding: '12px', background: 'var(--primary, #7c3aed)', color: '#fff', fontWeight: 'bold', justifyContent: 'center', height: '44px' }}
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
                  style={{ padding: '12px 24px', height: '44px' }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Manage Tenant Modal */}
      {selectedTenantForManage && createPortal(
        <div className="cp-portal-overlay">
          <div className="cp-portal-modal" style={{ maxWidth: '760px' }}>
            <button 
              onClick={() => setSelectedTenantForManage(null)}
              style={{ position: 'absolute', top: 20, left: 20, background: 'none', border: 'none', color: 'var(--cp-text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              <i className="fas fa-times"></i>
            </button>

            <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-sliders-h" style={{ color: 'var(--primary, #7c3aed)' }}></i>
              <span>إدارة منصة ({selectedTenantForManage.name})</span>
            </h3>

            {/* 1. Edit Tenant Settings Form */}
            <form onSubmit={handleUpdateTenant} style={{ borderBottom: '1px solid var(--cp-divider)', paddingBottom: '24px', marginBottom: '24px' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '14px', color: 'var(--primary, #7c3aed)' }}>إعدادات الهوية والنطاق</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>اسم المنصة *</label>
                  <input 
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="cp-input"
                    style={{ width: '100%', padding: '10px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }}
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
                    style={{ width: '100%', padding: '10px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)', direction: 'ltr' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '16px', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>اللون الأساسي</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input 
                      type="color"
                      value={editPrimaryColor}
                      onChange={(e) => setEditPrimaryColor(e.target.value)}
                      style={{ width: '36px', height: '36px', padding: 0, border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                    />
                    <code className="cp-sa-color-badge">{editPrimaryColor}</code>
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
                    <code className="cp-sa-color-badge">{editSecondaryColor}</code>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: isMobile ? 'stretch' : 'flex-end', paddingTop: isMobile ? '8px' : '18px' }}>
                  <button
                    type="submit"
                    disabled={savingTenant}
                    className="cp-btn cp-btn-primary"
                    style={{ width: isMobile ? '100%' : 'auto', padding: '10px 20px', background: 'var(--primary, #7c3aed)', color: '#fff', fontWeight: 'bold', height: '44px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
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
                <div style={{ position: 'relative', maxWidth: isMobile ? '100%' : '240px', width: '100%' }}>
                  <input 
                    type="text"
                    placeholder="البحث باسم المستخدم أو رقم الهاتف..."
                    value={searchUserQuery}
                    onChange={(e) => setSearchUserQuery(e.target.value)}
                    className="cp-input"
                    style={{ width: '100%', padding: '8px 12px 8px 30px', fontSize: '0.82rem', border: '1.5px solid var(--cp-input-border)', background: 'var(--cp-input-bg)', color: 'var(--cp-input-text)' }}
                  />
                  <i className="fas fa-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '12px' }}></i>
                </div>
              </div>

              {filteredUsers.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', border: '1px dashed var(--cp-divider)', borderRadius: '16px', color: 'var(--cp-text-muted)' }}>
                  <i className="fas fa-users-slash" style={{ fontSize: '24px', marginBottom: '8px', display: 'block', opacity: 0.6 }}></i>
                  <span>لا يوجد مستخدمين مسجلين يطابقون البحث.</span>
                </div>
              ) : (
                <div style={{ border: '1px solid var(--cp-divider)', borderRadius: '14px', overflow: 'hidden', background: 'var(--cp-card-bg)' }}>
                  <div style={{ maxHeight: '240px', overflowY: 'auto' }} className="cp-sa-table-wrapper">
                    <table style={{ width: '100%', fontSize: '0.88rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'rgba(99, 102, 241, 0.03)', borderBottom: '1px solid var(--cp-divider)' }}>
                          <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 'bold', color: 'var(--cp-text-muted)' }}>الاسم</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 'bold', color: 'var(--cp-text-muted)' }}>رقم الهاتف</th>
                          <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 'bold', color: 'var(--cp-text-muted)' }}>الصلاحية الحالية</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map(u => (
                          <tr key={u.id} style={{ borderBottom: '1px solid var(--cp-divider)' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 600 }}>{u.name}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--cp-text-muted)', direction: 'ltr', textAlign: 'right' }}>{u.phone}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <select
                                value={u.role}
                                onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                                disabled={userRoleUpdating === u.id}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '8px',
                                  border: '1.5px solid var(--cp-input-border)',
                                  background: 'var(--cp-input-bg)',
                                  color: 'var(--cp-input-text)',
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
        </div>,
        document.body
      )}
    </div>
  )
}

