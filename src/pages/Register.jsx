import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI, tokenAPI } from '@backend/authApi'
import { useTenant } from '../contexts/TenantContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '@backend/supabase'
// getTenantThemeConfig is now dynamically resolved inside TenantContext
import { GRADE_LABEL } from './ControlPanel/shared'
import './Register.css'
import './login-styles.css'

const translations = {
  ar: {
    register: 'إنشاء حساب جديد',
    'student-name': 'الاسم الكامل للطالب',
    phone: 'رقم الهاتف الخاص بك',
    'parent-phone': 'رقم هاتف ولي الأمر (واتساب)',
    password: 'كلمة المرور',
    'confirm-password': 'تأكيد كلمة المرور',
    'register-btn': 'إنشاء الحساب',
    'have-account': 'لديك حساب بالفعل؟',
    'login-btn-link': 'سجل دخولك',
    'register-success-title': 'تم إنشاء الحساب بنجاح',
    'register-success-sub': 'جارٍ تحويلك إلى صفحة الدفع وتفعيل الحساب...'
  },
  en: {
    register: 'Create New Account',
    'student-name': 'Full Student Name',
    phone: 'Your Phone Number',
    'parent-phone': "Parent's Phone (WhatsApp)",
    password: 'Password',
    'confirm-password': 'Confirm Password',
    'register-btn': 'Create Account',
    'have-account': 'Already have an account?',
    'login-btn-link': 'Log In',
    'register-success-title': 'Registration Successful',
    'register-success-sub': 'Redirecting to activation page...'
  }
}

export default function Register() {
  const { login } = useAuth()
  const { tenant, tenantId, tenantSlug, tenantName, isGradeEnabled, gradesList, themeConfig } = useTenant()
  const navigate = useNavigate()

  // Every tenant may sign a student up with a short alphanumeric login code
  // instead of a phone (the parent's WhatsApp phone stays required). This is
  // purely additive — a normal phone (>=8 digits) still works everywhere.
  const codeLoginEnabled = true
  const isValidHandle = (h) => h.length >= 8 || /^[a-zA-Z0-9]{4,20}$/.test(h)

  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'ar')
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const t = translations[lang]

  useEffect(() => {
    if (theme === 'dark') document.body.classList.add('dark')
    else document.body.classList.remove('dark')
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('theme', next)
  }

  const switchLang = newLang => {
    setLang(newLang)
    localStorage.setItem('lang', newLang)
  }

  // Form states
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [grade, setGrade] = useState('first-prep')
  const [enrollmentType, setEnrollmentType] = useState('CENTER')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const groupedGrades = useMemo(() => {
    const acc = {}
    for (const g of gradesList || []) {
      const stageName = lang === 'ar' ? g.stageName : (g.stageId === 'preparatory' ? 'Preparatory' : g.stageId === 'secondary' ? 'Secondary' : g.stageId === 'primary' ? 'Primary' : g.stageId === 'baccalaureate' ? 'Egyptian Baccalaureate' : g.stageId)
      if (!acc[stageName]) acc[stageName] = []
      acc[stageName].push(g)
    }
    return acc
  }, [gradesList, lang])

  useEffect(() => {
    if (gradesList && gradesList.length > 0) {
      const exists = gradesList.some(g => g.id === grade)
      if (!exists) {
        setGrade(gradesList[0].id)
      }
    }
  }, [gradesList])

  // Toggle password visibility
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Loaded metadata
  const [branches, setBranches] = useState([])
  const [groups, setGroups] = useState([])
  const [branchId, setBranchId] = useState('')
  const [groupId, setGroupId] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Resolve dynamic teacher branding
  const getLocalized = (val, arFallback, enFallback) => {
    if (!val) return lang === 'ar' ? arFallback : enFallback
    if (typeof val === 'object') {
      return val[lang] || val['ar'] || arFallback
    }
    return val
  }

  const teacherName = getLocalized(themeConfig.teacher?.name || tenant?.config?.teacher?.name, 'عبدالرحمن علاء', 'Abdelrahman Alaa')
  const teacherRole = getLocalized(themeConfig.teacher?.role || tenant?.config?.teacher?.role, 'مدرّس اللغة العربية', 'Arabic Language Teacher')
  const teacherImageBase = themeConfig.teacher?.image_base || tenant?.config?.teacher?.image_base || "/images/profile.png"
  const teacherExp = getLocalized(themeConfig.teacher?.experience || tenant?.config?.teacher?.experience, '+10', '+10')
  const teacherStudents = (themeConfig.teacher?.students_count || tenant?.config?.teacher?.students_count)
    ? getLocalized(themeConfig.teacher?.students_count || tenant?.config?.teacher?.students_count, null, null)
    : null
  const teacherSatisfaction = getLocalized(themeConfig.teacher?.satisfaction || tenant?.config?.teacher?.satisfaction, '98%', '98%')
  const teacherTargetStage = getLocalized(
    themeConfig.teacher?.target_stage || tenant?.config?.teacher?.target_stage,
    'البرمجة والذكاء الاصطناعي',
    'Programming & AI'
  )
  const teacherTargetStageLabel = getLocalized(
    themeConfig.teacher?.target_stage_label || tenant?.config?.teacher?.target_stage_label,
    'التخصص',
    'Specialty'
  )

  const isDefaultTenant = !tenantSlug || tenantSlug === 'default'
  const dbLogo = tenant?.logo_url && !tenant.logo_url.includes('3081840') ? tenant.logo_url : null
  const brandLogo = themeConfig.logoUrl || (isDefaultTenant ? "/images/logo.white.png" : (dbLogo || "/images/logo.white.png"))
  const brandShort = isDefaultTenant 
    ? (lang === 'ar' ? 'جِت فِكرة' : 'GitFekra') 
    : getLocalized(themeConfig.branding?.brand_short || tenant?.config?.branding?.brand_short, tenantName, tenantName)

  // Fetch branches for registration
  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    const fetchBranches = async () => {
      try {
        const { data, error } = await supabase.rpc('get_public_branches', { p_tenant_id: tenantId })
        if (error) throw error
        if (!cancelled) {
          setBranches(data || [])
          if (data && data.length > 0) {
            setBranchId(data[0].id)
          } else {
            setBranchId('')
          }
        }
      } catch (err) {
        console.error('Failed to load branches for registration:', err)
      }
    }
    fetchBranches()
    return () => { cancelled = true }
  }, [tenantId])

  // Fetch groups for registration
  useEffect(() => {
    if (!tenantId || !grade) return
    let cancelled = false
    const fetchGroups = async () => {
      try {
        const { data, error } = await supabase.rpc('get_public_groups', { p_tenant_id: tenantId, p_grade: grade })
        if (error) throw error
        if (!cancelled) {
          setGroups(data || [])
          const filtered = (data || []).filter(g => !g.branch_id || g.branch_id === branchId)
          if (filtered.length > 0) {
            setGroupId(filtered[0].id)
          } else {
            setGroupId('')
          }
        }
      } catch (err) {
        console.error('Failed to load groups for registration:', err)
      }
    }
    fetchGroups()
    return () => { cancelled = true }
  }, [tenantId, grade, branchId])

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    if (name.trim().length < 3) { setError(lang === 'ar' ? 'الاسم يجب أن يكون 3 أحرف على الأقل' : 'Name must be at least 3 characters'); return }
    if (!isValidHandle(phone.trim())) { setError(lang === 'ar' ? (codeLoginEnabled ? 'رقم الهاتف أو الكود غير صحيح' : 'رقم الهاتف غير صحيح') : (codeLoginEnabled ? 'Invalid phone or code' : 'Invalid phone number')); return }
    if (parentPhone.trim().length < 8) { setError(lang === 'ar' ? 'رقم هاتف ولي الأمر غير صحيح' : 'Invalid parent phone number'); return }
    if (phone.trim() === parentPhone.trim()) { setError(lang === 'ar' ? 'رقم هاتف الطالب لا يمكن أن يكون هو نفسه رقم هاتف ولي الأمر' : 'Student phone number cannot be the same as parent phone number'); return }
    if (password.length < 6) { setError(lang === 'ar' ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters'); return }
    if (password !== confirmPassword) { setError(lang === 'ar' ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match'); return }

    const isOnline = enrollmentType === 'ONLINE'
    const selectedGroup = !isOnline ? groups.find(g => g.id === groupId) : null
    const groupName = selectedGroup ? selectedGroup.name : ''
    const regGroupId = !isOnline ? groupId : null

    setLoading(true)
    try {
      // Check if parent phone is registered as a user (any role) in this tenant
      const { data: parentIsUser, error: checkError } = await supabase.rpc('check_student_phone_exists', {
        p_phone: parentPhone.trim(),
        p_tenant_id: tenantId
      })
      if (checkError) throw checkError
      if (parentIsUser) {
        throw new Error(lang === 'ar' ? 'رقم هاتف ولي الأمر مسجل بالفعل كمستخدم في المنصة' : 'The parent phone number is already registered as a user account')
      }

      const response = await authAPI.register(
        name.trim(),
        phone.trim(),
        password,
        tenantId,
        grade,
        parentPhone.trim(),
        enrollmentType,
        branchId || null,
        regGroupId || null,
        groupName || null
      )
      if (!response.user) throw new Error('Invalid response from server')
      
      // Success flow
      setError('')
      setLoading(false)
      if (response.token) {
        login(response.token, response.user)
        const pendingPkg = localStorage.getItem('pendingCheckoutPkgId')
        if (pendingPkg) {
          localStorage.removeItem('pendingCheckoutPkgId')
          window.location.href = '/shop?packageId=' + pendingPkg
        } else {
          window.location.href = '/'
        }
      } else {
        navigate('/login')
      }
    } catch (err) {
      console.error('Registration error:', err)
      setError(err.message || (lang === 'ar' ? 'فشل إنشاء الحساب' : 'Registration failed'))
      setLoading(false)
    }
  }

  return (
    <div className={`aa-page ${themeConfig.themeClass || ''}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* ─────────── NAVBAR ─────────── */}
      <header className="aa-nav">
        <div className="aa-nav-inner">
          <div className="aa-brand">
            <img src={brandLogo} alt="Logo" className="aa-brand-logo" />
            <span className="aa-brand-name">{brandShort}</span>
          </div>

          <div className="aa-nav-actions">
            <button onClick={toggleTheme} className="aa-icon-btn" aria-label="theme">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button onClick={() => switchLang(lang === 'ar' ? 'en' : 'ar')} className="aa-icon-btn aa-lang">
              🌐 <span>{lang === 'ar' ? 'EN' : 'ع'}</span>
            </button>
            <Link to="/login" className="aa-btn aa-btn-ghost">{lang === 'ar' ? 'تسجيل الدخول' : 'Sign In'}</Link>
          </div>
        </div>
      </header>

      <main className="register-page-wrapper" style={{ minHeight: 'calc(100vh - 64px)' }}>
        <div className="register-constellation" />
        <div className="register-container">
        
        {/* Form Column */}
        <section className="register-form-col">
          <h2>{t.register}</h2>
          <p className="register-subtitle">
            {lang === 'ar' ? 'سجل بياناتك للانضمام إلى منصتنا التعليمية وبدء الدراسة.' : 'Register to join our educational platform.'}
          </p>

          {error && <div className="error-message show" style={{ marginBottom: 16 }}>{error}</div>}

          <form onSubmit={handleRegister}>
            <div className="register-input-group">
              
              <div className="register-input-wrapper register-full-width">
                <i className="fas fa-user"></i>
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  required 
                  placeholder={t['student-name']} 
                />
              </div>

              {/* Permanent labels on the two phone fields: with placeholders
                  only, a filled field gives no clue which phone it holds —
                  students kept registering their own number as the parent's. */}
              <div className="register-input-wrapper">
                <label style={{ position: 'absolute', top: '-9px', insetInlineStart: '14px', fontSize: '0.7rem', fontWeight: 700, padding: '0 6px', borderRadius: '4px', background: 'var(--card-bg, rgba(255,255,255,0.9))', color: 'var(--primary, #7c3aed)', zIndex: 1, lineHeight: '1.4' }}>
                  {t.phone}
                </label>
                <i className="fas fa-mobile-screen-button"></i>
                <input
                  type={codeLoginEnabled ? 'text' : 'tel'}
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  required
                  placeholder={codeLoginEnabled ? (lang === 'ar' ? 'رقم الهاتف أو الكود' : 'Phone or code') : t.phone}
                  dir="ltr"
                  autoComplete="tel"
                />
              </div>

              <div className="register-input-wrapper">
                <label style={{ position: 'absolute', top: '-9px', insetInlineStart: '14px', fontSize: '0.7rem', fontWeight: 700, padding: '0 6px', borderRadius: '4px', background: 'var(--card-bg, rgba(255,255,255,0.9))', color: 'var(--primary, #7c3aed)', zIndex: 1, lineHeight: '1.4' }}>
                  {t['parent-phone']}
                </label>
                <i className="fab fa-whatsapp"></i>
                <input
                  type="tel"
                  value={parentPhone}
                  onChange={e => setParentPhone(e.target.value)}
                  required
                  placeholder={t['parent-phone']}
                  dir="ltr"
                  autoComplete="off"
                />
              </div>

              <div className="register-input-wrapper">
                <i className="fas fa-graduation-cap"></i>
                <select value={grade} onChange={e => setGrade(e.target.value)} required>
                  {Object.entries(groupedGrades).map(([stageName, list]) => (
                    <optgroup key={stageName} label={stageName}>
                      {list.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="register-input-wrapper">
                <i className="fas fa-laptop-house"></i>
                <select value={enrollmentType} onChange={e => setEnrollmentType(e.target.value)} required>
                  <option value="CENTER">{lang === 'ar' ? 'حضور بالسنتر (CENTER)' : 'Center Presence (CENTER)'}</option>
                  <option value="ONLINE">{lang === 'ar' ? 'دراسة أونلاين (ONLINE)' : 'Online Studying (ONLINE)'}</option>
                  <option value="HYBRID">{lang === 'ar' ? 'مدمج سنتر + أونلاين (HYBRID)' : 'Hybrid Center & Online (HYBRID)'}</option>
                </select>
              </div>

              {/* Branch Selection */}
              {branches.length > 0 && (
                <div className="register-input-wrapper register-full-width">
                  <i className="fas fa-map-marker-alt"></i>
                  <select value={branchId} onChange={e => setBranchId(e.target.value)} required>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Group Selection */}
              {enrollmentType !== 'ONLINE' && (
                <div className="register-input-wrapper register-full-width">
                  <i className="fas fa-user-group"></i>
                  <select 
                    value={groupId} 
                    onChange={e => setGroupId(e.target.value)} 
                    required={groups.filter(g => !g.branch_id || g.branch_id === branchId).length > 0}
                  >
                    {groups.filter(g => !g.branch_id || g.branch_id === branchId).length === 0 ? (
                      <option value="">{lang === 'ar' ? 'لا يوجد مجموعات متاحة حالياً' : 'No groups available'}</option>
                    ) : (
                      <>
                        <option value="">{lang === 'ar' ? 'اختر المجموعة...' : 'Select group...'}</option>
                        {groups.filter(g => !g.branch_id || g.branch_id === branchId).map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
              )}

              <div className="register-input-wrapper register-password-wrapper register-full-width">
                <i className="fas fa-lock"></i>
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  required 
                  placeholder={t.password} 
                  minLength="6" 
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="register-password-toggle">
                  <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>

              <div className="register-input-wrapper register-password-wrapper register-full-width">
                <i className="fas fa-lock"></i>
                <input 
                  type={showConfirmPassword ? 'text' : 'password'} 
                  value={confirmPassword} 
                  onChange={e => setConfirmPassword(e.target.value)} 
                  required 
                  placeholder={t['confirm-password']} 
                  minLength="6" 
                />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="register-password-toggle">
                  <i className={`fas ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>

            </div>

            <div className="register-actions">
              <button type="submit" className="modern-btn" disabled={loading}>
                <span className="btn-text">{t['register-btn']}</span>
                {loading && <span className="btn-loader"><span className="spinner"></span></span>}
              </button>

              <div className="register-toggle-link">
                <span>{t['have-account']}</span>
                <Link to="/login">{t['login-btn-link']}</Link>
              </div>
            </div>
          </form>
        </section>

        {/* Teacher Portrait Column */}
        <section className="register-portrait-col">
          <div className="register-portrait-img-wrap">
            <img src={teacherImageBase} alt={teacherName} className="register-portrait-img" />
            <div className="register-portrait-gradient" />
          </div>

          <div className="register-teacher-info">
            <span className="register-teacher-badge">{lang === 'ar' ? 'المعلم المعتمد' : 'Certified Teacher'}</span>
            <h3 className="register-teacher-name">{teacherName}</h3>
            <p className="register-teacher-role">{teacherRole}</p>

            <div className="register-teacher-stats">
              <div className="register-stat-item">
                <div className="register-stat-label">{lang === 'ar' ? 'الخبرة' : 'Experience'}</div>
                <div className="register-stat-value">{teacherExp}</div>
              </div>

              {teacherStudents && (
                <div className="register-stat-item">
                  <div className="register-stat-label">{lang === 'ar' ? 'الطلاب المستفيدين' : 'Students taught'}</div>
                  <div className="register-stat-value">{teacherStudents}</div>
                </div>
              )}

              <div className="register-stat-item">
                <div className="register-stat-label">{teacherTargetStageLabel}</div>
                <div className="register-stat-value">{teacherTargetStage}</div>
              </div>
            </div>
          </div>
        </section>

      </div>
    </main>
    </div>
  )
}
