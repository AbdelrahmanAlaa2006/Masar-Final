import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@backend/supabase'
import { invalidateAll } from '../../utils/cache'
import SeasonalThemePanel from './SeasonalThemePanel'
import DevToolsViolationsPanel from './DevToolsViolationsPanel'

// Company finance & business management — heavy module, super admin only,
// lazy-loaded so it never weighs on the shared bundle.
const BusinessPanel = lazy(() => import('./BusinessPanel'))
import { GRADE_LABEL } from './shared'
import { uploadAvatarImage } from '@backend/r2'
import { DEFAULT_ANNOUNCEMENTS } from '../../utils/announcements'

/* Subject → theme mapping. getTenantFolder() in src/tenants/brandOverrides.js
   resolves the theme chunk from config.subject, so picking a subject here is
   what gives a button-created tenant a real theme without any code change. */
const SUBJECT_OPTIONS = [
  { value: 'arabic', label: 'لغة عربية / عام (الثيم الافتراضي)' },
  { value: 'chemistry', label: 'كيمياء' },
  { value: 'physics', label: 'فيزياء' },
  { value: 'math', label: 'رياضيات' },
  { value: 'biology', label: 'أحياء' },
  { value: 'science', label: 'علوم' },
  { value: 'geology', label: 'جيولوجيا' },
  { value: 'english', label: 'لغة إنجليزية' },
  { value: 'humanities', label: 'مواد أدبية (جغرافيا / تاريخ)' },
  { value: 'programming', label: 'برمجة وحاسب آلي' },
]

/* Feature keys actually consumed by isFeatureEnabled() across the app. */
const FEATURE_DEFS = [
  { key: 'videos', label: 'الفيديوهات' },
  { key: 'exams', label: 'الامتحانات' },
  { key: 'homework', label: 'الواجبات' },
  { key: 'payments', label: 'المدفوعات والباقات' },
  { key: 'reports', label: 'التقارير' },
  { key: 'chat', label: 'الدردشة' },
  { key: 'notifications', label: 'الإشعارات' },
  { key: 'attendance', label: 'الحضور والغياب (سنتر)' },
  { key: 'grades', label: 'الدرجات والتقييمات (سنتر)' },
  { key: 'qr_attendance', label: 'بطاقة الباركود الرقمية' },
]

/* Default stage/grade tree in the exact schema TenantContext.gradesList
   consumes (config.stages). Matches the legacy behavior: prep + secondary
   enabled, primary + baccalaureate off until the tenant enables them. */
const buildStagesTemplate = () => ([
  { id: 'primary', name: 'المرحلة الابتدائية', enabled: false, grades: ['primary-1', 'primary-2', 'primary-3', 'primary-4', 'primary-5', 'primary-6'].map(id => ({ id, name: GRADE_LABEL[id], enabled: true })) },
  { id: 'preparatory', name: 'المرحلة الإعدادية', enabled: true, grades: ['first-prep', 'second-prep', 'third-prep'].map(id => ({ id, name: GRADE_LABEL[id], enabled: true })) },
  { id: 'secondary', name: 'المرحلة الثانوية', enabled: true, grades: ['first-sec', 'second-sec', 'third-sec'].map(id => ({ id, name: GRADE_LABEL[id], enabled: true })) },
  { id: 'baccalaureate', name: 'مرحلة البكالوريا', enabled: false, grades: ['bac-1', 'bac-2', 'bac-3'].map(id => ({ id, name: GRADE_LABEL[id], enabled: true })) },
])

/* Login landing sections a tenant can show/hide (config.login_sections). */
const LOGIN_SECTION_DEFS = [
  { key: 'teacher', label: 'بطاقة المعلم في الواجهة' },
  { key: 'about', label: 'قسم «عن المعلم»' },
  { key: 'packages', label: 'قسم الباقات' },
  { key: 'features', label: 'قسم المميزات' },
  { key: 'steps', label: 'قسم «كيف تبدأ»' },
  { key: 'location', label: 'قسم الموقع والعنوان' },
]

/* Detailed teacher fields (config.teacher) shown on the login/landing page.
   Plain strings are fine — getLocalized() accepts both strings and {ar,en}. */
const TEACHER_EXTRA_DEFS = [
  { key: 'bio', label: 'نبذة عن المعلم', textarea: true },
  { key: 'quote', label: 'اقتباس / رسالة المعلم', textarea: true },
  { key: 'experience', label: 'سنوات الخبرة (مثال: +10)' },
  { key: 'students_count', label: 'عدد الطلاب (مثال: +3,500)' },
  { key: 'satisfaction', label: 'نسبة الرضا (مثال: 98%)' },
  { key: 'target_stage', label: 'المراحل المستهدفة (مثال: الإعدادية والثانوية)' },
  { key: 'learning_system', label: 'نظام التعلم (مثال: أونلاين تفاعلي)' },
  { key: 'image_base', label: 'صورة المعلم', ltr: true, upload: true },
  { key: 'image_hover', label: 'صورة المعلم (عند التمرير)', ltr: true, upload: true },
]

/* Section-level location fields (config.location) — the heading of the
   location section on the login page plus shared links. */
const LOCATION_DEFS = [
  { key: 'title', label: 'عنوان قسم الموقع' },
  { key: 'description', label: 'وصف قسم الموقع', textarea: true },
  { key: 'whatsapp_link', label: 'رابط واتساب (زر «راسلنا واتساب»)', ltr: true },
]

/* Per-branch fields (config.location.branches[]) — a tenant can have any
   number of locations; every field optional, empty fields don't render. */
const BRANCH_DEFS = [
  { key: 'name', label: 'اسم المقر / الفرع' },
  { key: 'address', label: 'العنوان التفصيلي' },
  { key: 'phone', label: 'هاتف المقر', ltr: true },
  { key: 'map_iframe_url', label: 'خريطة Google — رابط تضمين (مشاركة ← تضمين خريطة) أو رابط طويل بإحداثيات. الروابط المختصرة goo.gl لا تعمل هنا', ltr: true },
  { key: 'directions_link', label: 'رابط الاتجاهات (أي رابط Google Maps حتى المختصر)', ltr: true },
  { key: 'hours_days', label: 'أيام العمل (مثال: السبت – الخميس)' },
  { key: 'hours_time', label: 'ساعات العمل (مثال: ٩ صباحًا – ٩ مساءً)' },
]

/* Theme tokens (config.theme) applied as CSS variables in utils/theme.js.
   These restyle the whole app (pages, cards, login) per tenant — no code. */
const THEME_TOKEN_DEFS = [
  { key: 'bg_light', label: 'خلفية الصفحات (الوضع الفاتح)', type: 'color', fallback: '#f5f3ee', hint: 'لون خلفية كل صفحات التطبيق في الوضع الفاتح' },
  { key: 'card_light', label: 'لون الكروت (فاتح)', type: 'color', fallback: '#fdfbf6', hint: 'خلفية البطاقات والقوائم والحقول' },
  { key: 'text_light', label: 'لون النص (فاتح)', type: 'color', fallback: '#0f172a', hint: 'لون الكتابة الأساسية على الخلفية الفاتحة' },
  { key: 'bg_dark', label: 'خلفية الصفحات (الوضع الداكن)', type: 'text', fallback: '', hint: 'لون أو تدرّج (gradient) لخلفية الوضع الداكن' },
  { key: 'card_dark', label: 'لون الكروت (داكن)', type: 'color', fallback: '#0d1527', hint: 'خلفية البطاقات في الوضع الداكن — يستبدل الأزرق الكحلي الافتراضي' },
  { key: 'text_dark', label: 'لون النص (داكن)', type: 'color', fallback: '#f8fafc', hint: 'لون الكتابة الأساسية على الخلفية الداكنة' },
  { key: 'border_accent', label: 'لون الحدود/الفواصل', type: 'text', fallback: '', hint: 'لون حدود البطاقات والفواصل — مثال rgba(168,110,40,0.28)' },
]

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
  const [newSubject, setNewSubject] = useState('arabic')
  // First-admin account for the new platform (created server-side so the super
  // admin's own session is never disturbed).
  const [newAdminName, setNewAdminName] = useState('')
  const [newAdminPhone, setNewAdminPhone] = useState('')
  const [newAdminPassword, setNewAdminPassword] = useState('')
  const [creating, setCreating] = useState(false)

  // Manage Tenant & User states
  const [selectedTenantForManage, setSelectedTenantForManage] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDomain, setEditDomain] = useState('')
  const [editPrimaryColor, setEditPrimaryColor] = useState('')
  const [editSecondaryColor, setEditSecondaryColor] = useState('')
  // Customization (persisted into tenants.config JSONB)
  const [editSubject, setEditSubject] = useState('arabic')
  const [editTeacherName, setEditTeacherName] = useState('')
  const [editTeacherRole, setEditTeacherRole] = useState('')
  const [editContactPhone, setEditContactPhone] = useState('')
  const [editContactEmail, setEditContactEmail] = useState('')
  const [editContactAddress, setEditContactAddress] = useState('')
  const [editSocials, setEditSocials] = useState({ facebook: '', youtube: '', instagram: '', telegram: '', whatsapp: '' })
  const [editHeroTitle, setEditHeroTitle] = useState('')
  const [editHeroSub, setEditHeroSub] = useState('')
  const [editFeatures, setEditFeatures] = useState({})
  const [editLogoUrl, setEditLogoUrl] = useState('')
  const [editTeacherExtra, setEditTeacherExtra] = useState({})
  const [editLocation, setEditLocation] = useState({})
  const [editLocBranches, setEditLocBranches] = useState([])
  const [editTheme, setEditTheme] = useState({ bg_light: '', card_light: '', text_light: '', bg_dark: '', card_dark: '', text_dark: '', border_accent: '' })
  const [editLoginSections, setEditLoginSections] = useState({})
  const [editStages, setEditStages] = useState([])
  const [editAnnouncements, setEditAnnouncements] = useState([])
  const [uploadingImage, setUploadingImage] = useState(null)

  // Upload an image from the device to R2 and apply its public URL to a field
  const handleImageUpload = async (e, fieldKey, apply) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingImage(fieldKey)
    try {
      const { publicUrl } = await uploadAvatarImage(file)
      apply(publicUrl)
      flash('تم رفع الصورة بنجاح — احفظ التعديلات لتثبيتها', 'success')
    } catch (err) {
      console.error(err)
      flash('فشل رفع الصورة: ' + (err.message || 'خطأ غير معروف'), 'error')
    } finally {
      setUploadingImage(null)
    }
  }
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

    // First-admin account is required so the new platform is usable immediately.
    if (!newAdminName.trim() || !newAdminPhone.trim() || newAdminPassword.length < 6) {
      flash('يرجى إدخال اسم ورقم هاتف المدير وكلمة مرور (6 أحرف على الأقل)', 'warning')
      return
    }

    setCreating(true)
    let createdTenantId = null
    try {
      // 1) Create the tenant row (and capture its id for the admin step).
      const { data: tenantRow, error } = await supabase
        .from('tenants')
        .insert({
          name: newName.trim(),
          slug: newSlug.trim(),
          domain: newDomain.trim() || null,
          primary_color: newPrimaryColor,
          secondary_color: newSecondaryColor,
          config: {
            // subject drives which theme chunk (src/tenants/<folder>) loads
            subject: newSubject,
            branding: {
              brand_short: newName.trim(),
              hero_title_a: newName.trim(),
              hero_sub: 'أكتشف مجموعة واسعة من المحاضرات والامتحانات والفيديوهات التعليمية المصممة خصيصًا لمساعدتك على التفوق وتحقيق أهدافك الدراسية.'
            },
            // The first admin is usually the teacher — a real editable default
            // instead of showing another platform's teacher identity.
            teacher: {
              name: newAdminName.trim()
            },
            features: {
              chat: true,
              payments: true,
              notifications: true
            }
          }
        })
        .select('id')
        .single()

      if (error) throw error
      createdTenantId = tenantRow.id

      // 2) Create the first admin + seed default branch/year (server-side).
      const { data: fnData, error: fnError } = await supabase.functions.invoke('create-tenant-admin', {
        body: {
          tenant_id: createdTenantId,
          admin_name: newAdminName.trim(),
          admin_phone: newAdminPhone.trim(),
          admin_password: newAdminPassword,
        },
      })
      if (fnError || fnData?.error) {
        throw new Error(fnData?.error || fnError.message || 'فشل إنشاء حساب المدير')
      }

      flash(`تم إنشاء منصة (${newName.trim()}) وحساب المدير بنجاح!`, 'success')

      // Reset form
      setNewName(''); setNewSlug(''); setNewDomain(''); setNewSubject('arabic')
      setNewPrimaryColor('#7c3aed'); setNewSecondaryColor('#06b6d4')
      setNewAdminName(''); setNewAdminPhone(''); setNewAdminPassword('')
      setShowCreateModal(false)

      fetchStats()
    } catch (err) {
      console.error(err)
      // If the tenant was created but the admin failed, tell the super admin so
      // they can retry the admin step rather than end up with an empty platform.
      if (createdTenantId) {
        flash('أُنشئت المنصة لكن تعذّر إنشاء حساب المدير: ' + err.message + ' — يمكنك حذف المنصة والمحاولة مجدداً.', 'error')
      } else {
        flash('فشل إنشاء المنصة: ' + err.message, 'error')
      }
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

    // Hydrate customization fields from the tenant's config JSONB
    const cfg = tenant.config || {}
    const asText = (v) => (typeof v === 'object' && v !== null) ? (v.ar || v.en || '') : (v || '')
    setEditSubject(cfg.subject || 'arabic')
    setEditTeacherName(asText(cfg.teacher?.name))
    setEditTeacherRole(asText(cfg.teacher?.role))
    setEditContactPhone(cfg.contact?.phone || '')
    setEditContactEmail(cfg.contact?.email || '')
    setEditContactAddress(cfg.contact?.address || '')
    setEditSocials({
      facebook: cfg.socials?.facebook && cfg.socials.facebook !== '#' ? cfg.socials.facebook : '',
      youtube: cfg.socials?.youtube && cfg.socials.youtube !== '#' ? cfg.socials.youtube : '',
      instagram: cfg.socials?.instagram && cfg.socials.instagram !== '#' ? cfg.socials.instagram : '',
      telegram: cfg.socials?.telegram && cfg.socials.telegram !== '#' ? cfg.socials.telegram : '',
      whatsapp: cfg.socials?.whatsapp && cfg.socials.whatsapp !== '#' ? cfg.socials.whatsapp : ''
    })
    setEditHeroTitle(asText(cfg.branding?.hero_title_a) || asText(cfg.branding?.hero_title))
    setEditHeroSub(asText(cfg.branding?.hero_sub) || asText(cfg.branding?.hero_subtitle))
    // Feature toggles: missing key = enabled (same default as isFeatureEnabled)
    const feats = {}
    FEATURE_DEFS.forEach(f => { feats[f.key] = cfg.features?.[f.key] !== false })
    setEditFeatures(feats)

    setEditLogoUrl(tenant.logo_url || '')
    const teacherExtra = {}
    TEACHER_EXTRA_DEFS.forEach(f => { teacherExtra[f.key] = asText(cfg.teacher?.[f.key]) })
    setEditTeacherExtra(teacherExtra)
    const locationData = {}
    LOCATION_DEFS.forEach(f => { locationData[f.key] = asText(cfg.location?.[f.key]) })
    setEditLocation(locationData)
    // Branches: existing list, or a single entry migrated from the legacy
    // top-level location fields so nothing already configured is lost.
    if (Array.isArray(cfg.location?.branches) && cfg.location.branches.length > 0) {
      setEditLocBranches(cfg.location.branches.map(b => {
        const entry = {}
        BRANCH_DEFS.forEach(f => { entry[f.key] = asText(b?.[f.key]) })
        return entry
      }))
    } else if (cfg.location && (cfg.location.address || cfg.location.map_iframe_url || cfg.location.phone)) {
      const legacy = {}
      BRANCH_DEFS.forEach(f => { legacy[f.key] = asText(cfg.location[f.key]) })
      if (!legacy.name) legacy.name = asText(cfg.location.title)
      setEditLocBranches([legacy])
    } else {
      setEditLocBranches([])
    }
    setEditTheme({
      bg_light: cfg.theme?.bg_light || cfg.bg_color || '',
      card_light: cfg.theme?.card_light || '',
      text_light: cfg.theme?.text_light || '',
      bg_dark: cfg.theme?.bg_dark || '',
      card_dark: cfg.theme?.card_dark || '',
      text_dark: cfg.theme?.text_dark || '',
      border_accent: cfg.theme?.border_accent || ''
    })
    const sections = {}
    LOGIN_SECTION_DEFS.forEach(s => { sections[s.key] = cfg.login_sections?.[s.key] !== false })
    setEditLoginSections(sections)
    // Announcements strip: tenant list, or the shared defaults on first edit
    setEditAnnouncements(
      Array.isArray(cfg.announcements)
        ? cfg.announcements.map(a => ({ icon: a?.icon || '', text: a?.text || '' }))
        : DEFAULT_ANNOUNCEMENTS.map(a => ({ ...a }))
    )
    // Stages: use the tenant's configured tree, otherwise the standard template
    setEditStages(
      Array.isArray(cfg.stages) && cfg.stages.length > 0
        ? cfg.stages.map(st => ({ ...st, grades: (st.grades || []).map(g => ({ ...g })) }))
        : buildStagesTemplate()
    )
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
      // Merge customization into the existing config JSONB without clobbering
      // keys we don't manage here (stages, grades, etc.).
      const prevConfig = selectedTenantForManage.config || {}
      const cleaned = (obj) => {
        const out = {}
        Object.entries(obj).forEach(([k, v]) => {
          const val = typeof v === 'string' ? v.trim() : v
          if (val) out[k] = val
        })
        return out
      }

      const mergedConfig = {
        ...prevConfig,
        subject: editSubject,
        teacher: cleaned({ ...(prevConfig.teacher || {}), name: editTeacherName, role: editTeacherRole, ...editTeacherExtra }),
        location: (() => {
          const top = cleaned({ ...(prevConfig.location || {}), ...editLocation })
          // These per-branch fields now live in branches[]; leaving stale
          // copies at top level would resurrect a deleted location through
          // the legacy single-location fallback on the login page.
          for (const k of ['address', 'phone', 'map_iframe_url', 'directions_link', 'hours_days', 'hours_time']) delete top[k]
          return {
            ...top,
            // Every field optional; all-empty branches are dropped entirely
            branches: editLocBranches.map(b => cleaned(b)).filter(b => Object.keys(b).length > 0)
          }
        })(),
        contact: cleaned({ ...(prevConfig.contact || {}), phone: editContactPhone, email: editContactEmail, address: editContactAddress }),
        socials: cleaned({ ...(prevConfig.socials || {}), ...editSocials }),
        branding: cleaned({ ...(prevConfig.branding || {}), hero_title_a: editHeroTitle, hero_sub: editHeroSub }),
        features: { ...(prevConfig.features || {}), ...editFeatures },
        theme: cleaned({ ...(prevConfig.theme || {}), ...editTheme }),
        login_sections: { ...(prevConfig.login_sections || {}), ...editLoginSections },
        stages: editStages,
        // Empty array is meaningful — it hides the home marquee entirely
        announcements: editAnnouncements
          .map(a => ({ icon: (a.icon || '').trim(), text: (a.text || '').trim() }))
          .filter(a => a.text)
      }

      const { error } = await supabase
        .from('tenants')
        .update({
          name: editName.trim(),
          domain: editDomain.trim() || null,
          logo_url: editLogoUrl.trim() || null,
          primary_color: editPrimaryColor,
          secondary_color: editSecondaryColor,
          config: mergedConfig
        })
        .eq('id', selectedTenantForManage.id)

      if (error) throw error

      // Drop cached tenant configs so the changes show without waiting for TTL
      invalidateAll()

      flash('تم تحديث إعدادات المنصة والتخصيص بنجاح!', 'success')

      setSelectedTenantForManage(null)
      fetchStats()
    } catch (err) {
      console.error(err)
      flash('فشل تحديث المنصة: ' + err.message, 'error')
    } finally {
      setSavingTenant(false)
    }
  }

  // Update user role handler. Promoting to a staff role also ACTIVATES the
  // account (an inactive/pending user can't function as an admin) and lets the
  // super admin optionally set a known login password so the new admin/assistant
  // can sign in right away.
  const handleUpdateUserRole = async (userId, newRole) => {
    setUserRoleUpdating(userId)
    try {
      const isStaff = newRole === 'admin' || newRole === 'assistant'
      const patch = { role: newRole }
      if (isStaff) {
        patch.is_active = true
        patch.is_approved = true
        patch.status = 'active'
      }

      const { error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', userId)

      if (error) throw error

      // Optional password set on promotion (empty = keep their current password).
      if (isStaff) {
        const pwd = window.prompt('كلمة مرور تسجيل الدخول لهذا الحساب (6 أحرف على الأقل — اتركها فارغة للإبقاء على كلمة المرور الحالية):')
        if (pwd && pwd.trim().length >= 6) {
          const { error: pErr } = await supabase.rpc('super_admin_set_password', {
            p_user_id: userId,
            p_password: pwd.trim(),
          })
          if (pErr) throw pErr
          flash('تم تعيين كلمة المرور الجديدة لهذا المدير.', 'success')
        } else if (pwd && pwd.trim().length > 0) {
          flash('كلمة المرور قصيرة (6 أحرف على الأقل) — لم يتم تغييرها.', 'warning')
        }
      }

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

  if (activeSubSection === 'business') {
    return (
      <div className="cp-panel-container" style={{ direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fas fa-briefcase" style={{ color: '#10b981' }}></i>
              <span>إدارة الأعمال والمالية</span>
            </h2>
            <p style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', margin: '6px 0 0' }}>حسابات الشركة: الإيرادات والمصروفات والعقود والاشتراكات ومؤشرات الأداء — منفصلة تماماً عن حسابات المدرسين</p>
          </div>
          <div>
            <button onClick={() => setActiveSubSection(null)} className="cp-btn cp-btn-secondary">
              رجوع للوحة السوبر أدمن
            </button>
          </div>
        </div>
        <Suspense fallback={<div className="cp-empty"><i className="fas fa-spinner fa-spin" /><p>جاري تحميل لوحة الأعمال...</p></div>}>
          <BusinessPanel flash={flash} />
        </Suspense>
      </div>
    )
  }

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

              {/* Business Management Widget */}
              <div className="cp-sa-sidebar-card">
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', marginBottom: '16px' }}>
                  <i className="fas fa-briefcase"></i>
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--text-color)', margin: '0 0 8px' }}>إدارة الأعمال والمالية</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--cp-text-muted)', margin: '0 0 20px', lineHeight: '1.5' }}>
                  حسابات الشركة الكاملة: الإيرادات والمصروفات والعقود والاشتراكات ومؤشرات الأداء والتقارير — منفصلة تماماً عن حسابات المدرسين.
                </p>
                <button
                  onClick={() => setActiveSubSection('business')}
                  className="cp-btn cp-btn-secondary"
                  style={{ width: '100%', justifyContent: 'center', border: '1px solid #10b981', color: '#10b981', height: '44px', cursor: 'pointer' }}
                >
                  فتح لوحة الأعمال
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

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 'bold', marginBottom: '6px' }}>المادة الدراسية (تحدد ثيم المنصة) *</label>
                <select
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="cp-input"
                  style={{ width: '100%', padding: '12px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }}
                >
                  {SUBJECT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p style={{ fontSize: '0.75rem', color: 'var(--cp-text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
                  اختيار المادة يفعّل الثيم المناسب (ألوان وخلفيات وأيقونات) تلقائياً، ويمكن تخصيص باقي الهوية لاحقاً من «إدارة المنصة».
                </p>
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

              {/* First admin account — makes the new platform usable immediately */}
              <div style={{ borderTop: '1px dashed var(--cp-divider)', paddingTop: 18, marginBottom: 8 }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fas fa-user-shield" style={{ color: 'var(--primary)' }} /> حساب مدير المنصة الأول
                </h4>
                <p style={{ fontSize: '0.78rem', color: 'var(--cp-text-muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
                  سيُنشأ هذا الحساب تلقائياً ليدير المنصة الجديدة (يُنشأ أيضاً فرع رئيسي وعام دراسي فعّال). يسجّل الدخول برقم الهاتف وكلمة المرور.
                </p>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 'bold', marginBottom: '6px' }}>اسم المدير *</label>
                  <input type="text" value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)}
                    placeholder="مثال: الأستاذ أحمد محمد" className="cp-input"
                    style={{ width: '100%', padding: '12px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 'bold', marginBottom: '6px' }}>رقم هاتف المدير *</label>
                    <input type="text" value={newAdminPhone} onChange={(e) => setNewAdminPhone(e.target.value)}
                      placeholder="مثال: 01012345678" className="cp-input"
                      style={{ width: '100%', padding: '12px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)', direction: 'ltr' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 'bold', marginBottom: '6px' }}>كلمة المرور *</label>
                    <input type="text" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)}
                      placeholder="6 أحرف على الأقل" className="cp-input"
                      style={{ width: '100%', padding: '12px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)', direction: 'ltr' }} />
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

              {/* Theme & identity customization (persisted in config JSONB) */}
              <h4 style={{ fontSize: '1rem', fontWeight: 'bold', margin: '4px 0 14px', color: 'var(--primary, #7c3aed)' }}>تخصيص الهوية والمحتوى</h4>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>المادة الدراسية (الثيم)</label>
                  <select value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="cp-input"
                    style={{ width: '100%', padding: '10px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }}>
                    {SUBJECT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>اسم المعلم</label>
                  <input type="text" value={editTeacherName} onChange={(e) => setEditTeacherName(e.target.value)}
                    placeholder="مثال: الأستاذ أحمد محمد" className="cp-input"
                    style={{ width: '100%', padding: '10px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>وصف المعلم / التخصص</label>
                  <input type="text" value={editTeacherRole} onChange={(e) => setEditTeacherRole(e.target.value)}
                    placeholder="مثال: مدرّس الفيزياء للثانوية العامة" className="cp-input"
                    style={{ width: '100%', padding: '10px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>عنوان الصفحة الرئيسية (Hero)</label>
                  <input type="text" value={editHeroTitle} onChange={(e) => setEditHeroTitle(e.target.value)}
                    placeholder="مثال: الفيزياء بطعم جديد" className="cp-input"
                    style={{ width: '100%', padding: '10px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>الوصف التعريفي للمنصة</label>
                <textarea value={editHeroSub} onChange={(e) => setEditHeroSub(e.target.value)} rows={2}
                  placeholder="وصف قصير يظهر في الصفحة الرئيسية أسفل العنوان" className="cp-input"
                  style={{ width: '100%', padding: '10px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)', resize: 'vertical' }} />
              </div>

              {/* Detailed teacher profile (login landing page) */}
              <h5 style={{ fontSize: '0.88rem', fontWeight: 800, margin: '0 0 10px' }}>
                <i className="fas fa-chalkboard-user" style={{ marginInlineEnd: 6, color: 'var(--primary)' }} />
                بيانات المعلم التفصيلية (صفحة الهبوط)
              </h5>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                {TEACHER_EXTRA_DEFS.map(f => (
                  <div key={f.key} style={f.textarea ? { gridColumn: isMobile ? 'auto' : 'span 2' } : undefined}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '6px' }}>{f.label}</label>
                    {f.textarea ? (
                      <textarea value={editTeacherExtra[f.key] || ''} rows={2}
                        onChange={(e) => setEditTeacherExtra(prev => ({ ...prev, [f.key]: e.target.value }))}
                        className="cp-input"
                        style={{ width: '100%', padding: '10px', fontSize: '0.82rem', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)', resize: 'vertical' }} />
                    ) : f.upload ? (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {editTeacherExtra[f.key] && <img src={editTeacherExtra[f.key]} alt="" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--cp-divider)' }} />}
                        <input type="text" value={editTeacherExtra[f.key] || ''} dir="ltr"
                          onChange={(e) => setEditTeacherExtra(prev => ({ ...prev, [f.key]: e.target.value }))}
                          placeholder="ارفع صورة أو الصق رابطاً" className="cp-input"
                          style={{ flex: 1, padding: '10px', fontSize: '0.82rem', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                        <label className="cp-btn cp-btn-secondary" style={{ padding: '8px 12px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                          <i className={`fas ${uploadingImage === f.key ? 'fa-spinner fa-spin' : 'fa-upload'}`} />
                          <span>رفع</span>
                          <input type="file" accept="image/*" hidden disabled={uploadingImage === f.key}
                            onChange={(e) => handleImageUpload(e, f.key, (url) => setEditTeacherExtra(prev => ({ ...prev, [f.key]: url })))} />
                        </label>
                      </div>
                    ) : (
                      <input type="text" value={editTeacherExtra[f.key] || ''} dir={f.ltr ? 'ltr' : undefined}
                        onChange={(e) => setEditTeacherExtra(prev => ({ ...prev, [f.key]: e.target.value }))}
                        className="cp-input"
                        style={{ width: '100%', padding: '10px', fontSize: '0.82rem', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                    )}
                  </div>
                ))}
              </div>

              {/* Center / location details (login landing page) */}
              <h5 style={{ fontSize: '0.88rem', fontWeight: 800, margin: '0 0 10px' }}>
                <i className="fas fa-location-dot" style={{ marginInlineEnd: 6, color: 'var(--primary)' }} />
                بيانات المقر والموقع (قسم الموقع في صفحة الهبوط)
              </h5>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                {LOCATION_DEFS.map(f => (
                  <div key={f.key} style={f.textarea ? { gridColumn: isMobile ? 'auto' : 'span 2' } : undefined}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '6px' }}>{f.label}</label>
                    {f.textarea ? (
                      <textarea value={editLocation[f.key] || ''} rows={2}
                        onChange={(e) => setEditLocation(prev => ({ ...prev, [f.key]: e.target.value }))}
                        className="cp-input"
                        style={{ width: '100%', padding: '10px', fontSize: '0.82rem', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)', resize: 'vertical' }} />
                    ) : (
                      <input type="text" value={editLocation[f.key] || ''} dir={f.ltr ? 'ltr' : undefined}
                        onChange={(e) => setEditLocation(prev => ({ ...prev, [f.key]: e.target.value }))}
                        className="cp-input"
                        style={{ width: '100%', padding: '10px', fontSize: '0.82rem', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                    )}
                  </div>
                ))}
              </div>

              {/* Multiple branches/locations — all fields optional; an empty
                  field simply doesn't render, an empty branch is removed. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '8px' }}>
                {editLocBranches.map((branch, bi) => (
                  <div key={bi} style={{ border: '1px solid var(--cp-divider)', borderRadius: '12px', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '0.84rem', fontWeight: 800 }}>
                        <i className="fas fa-building" style={{ marginInlineEnd: 6, color: 'var(--primary)' }} />
                        المقر {bi + 1}{branch.name ? ` — ${branch.name}` : ''}
                      </span>
                      <button type="button"
                        onClick={() => setEditLocBranches(prev => prev.filter((_, i) => i !== bi))}
                        style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444', padding: '5px 12px', borderRadius: '8px', fontSize: '0.76rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <i className="fas fa-trash-can" /> حذف المقر
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
                      {BRANCH_DEFS.map(f => (
                        <div key={f.key}>
                          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 'bold', marginBottom: '4px', color: 'var(--cp-text-muted)' }}>{f.label}</label>
                          <input type="text" value={branch[f.key] || ''} dir={f.ltr ? 'ltr' : undefined}
                            onChange={(e) => setEditLocBranches(prev => prev.map((b, i) => i === bi ? { ...b, [f.key]: e.target.value } : b))}
                            className="cp-input"
                            style={{ width: '100%', padding: '8px 10px', fontSize: '0.8rem', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button type="button"
                onClick={() => setEditLocBranches(prev => [...prev, {}])}
                style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px dashed rgba(16, 185, 129, 0.4)', color: '#10b981', padding: '10px', borderRadius: '10px', fontSize: '0.84rem', fontWeight: 'bold', cursor: 'pointer', width: '100%', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <i className="fas fa-plus" /> إضافة مقر / فرع جديد
              </button>
              <p style={{ fontSize: '0.74rem', color: 'var(--cp-text-muted)', margin: '-12px 0 20px', lineHeight: 1.5 }}>
                جميع الحقول اختيارية — الحقل الفارغ لا يظهر للطالب، وإذا لم يوجد أي مقر يختفي قسم الموقع بالكامل من صفحة الهبوط.
              </p>

              {/* Student-facing contact channels (footer + help page) */}
              <h5 style={{ fontSize: '0.88rem', fontWeight: 800, margin: '0 0 10px' }}>
                <i className="fas fa-headset" style={{ marginInlineEnd: 6, color: 'var(--primary)' }} />
                قنوات تواصل الطلاب (تظهر في الفوتر وصفحة المساعدة)
              </h5>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <input type="text" value={editContactPhone} onChange={(e) => setEditContactPhone(e.target.value)}
                  placeholder="رقم الهاتف" className="cp-input" dir="ltr"
                  style={{ padding: '10px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                <input type="text" value={editContactEmail} onChange={(e) => setEditContactEmail(e.target.value)}
                  placeholder="البريد الإلكتروني" className="cp-input" dir="ltr"
                  style={{ padding: '10px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                <input type="text" value={editContactAddress} onChange={(e) => setEditContactAddress(e.target.value)}
                  placeholder="العنوان" className="cp-input"
                  style={{ padding: '10px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
              </div>

              <h5 style={{ fontSize: '0.88rem', fontWeight: 800, margin: '0 0 10px' }}>
                <i className="fas fa-share-nodes" style={{ marginInlineEnd: 6, color: 'var(--primary)' }} />
                روابط السوشيال ميديا (تظهر للطلاب فقط)
              </h5>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                {[
                  { key: 'facebook', icon: 'fab fa-facebook-f', label: 'Facebook' },
                  { key: 'youtube', icon: 'fab fa-youtube', label: 'YouTube' },
                  { key: 'instagram', icon: 'fab fa-instagram', label: 'Instagram' },
                  { key: 'telegram', icon: 'fab fa-telegram-plane', label: 'Telegram' },
                  { key: 'whatsapp', icon: 'fab fa-whatsapp', label: 'WhatsApp' },
                ].map(s => (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className={s.icon} style={{ width: 18, textAlign: 'center', color: 'var(--cp-text-muted)' }} />
                    <input type="text" value={editSocials[s.key]} dir="ltr"
                      onChange={(e) => setEditSocials(prev => ({ ...prev, [s.key]: e.target.value }))}
                      placeholder={`رابط ${s.label}`} className="cp-input"
                      style={{ flex: 1, padding: '10px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                  </div>
                ))}
              </div>

              {/* Home page announcements strip */}
              <h5 style={{ fontSize: '0.88rem', fontWeight: 800, margin: '0 0 10px' }}>
                <i className="fas fa-bullhorn" style={{ marginInlineEnd: 6, color: 'var(--primary)' }} />
                شريط إعلانات الصفحة الرئيسية
              </h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                {editAnnouncements.map((a, ai) => (
                  <div key={ai} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input type="text" value={a.icon} maxLength={4}
                      onChange={(e) => setEditAnnouncements(prev => prev.map((x, i) => i === ai ? { ...x, icon: e.target.value } : x))}
                      placeholder="🎁" className="cp-input"
                      style={{ width: '58px', textAlign: 'center', padding: '9px 6px', fontSize: '0.9rem', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                    <input type="text" value={a.text}
                      onChange={(e) => setEditAnnouncements(prev => prev.map((x, i) => i === ai ? { ...x, text: e.target.value } : x))}
                      placeholder="نص الإعلان" className="cp-input"
                      style={{ flex: 1, padding: '9px 12px', fontSize: '0.84rem', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                    <button type="button"
                      onClick={() => setEditAnnouncements(prev => prev.filter((_, i) => i !== ai))}
                      style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444', width: 36, height: 36, borderRadius: '8px', cursor: 'pointer', flexShrink: 0 }}
                      title="حذف الإعلان">
                      <i className="fas fa-trash-can" />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button"
                onClick={() => setEditAnnouncements(prev => [...prev, { icon: '', text: '' }])}
                style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px dashed rgba(16, 185, 129, 0.4)', color: '#10b981', padding: '9px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 'bold', cursor: 'pointer', width: '100%', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <i className="fas fa-plus" /> إضافة إعلان
              </button>
              <p style={{ fontSize: '0.74rem', color: 'var(--cp-text-muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
                احذف جميع الإعلانات لإخفاء الشريط بالكامل من الصفحة الرئيسية.
              </p>

              {/* Logo + advanced theme tokens */}
              <h5 style={{ fontSize: '0.88rem', fontWeight: 800, margin: '0 0 10px' }}>
                <i className="fas fa-palette" style={{ marginInlineEnd: 6, color: 'var(--primary)' }} />
                الشعار والمظهر المتقدم (خلفيات وكروت)
              </h5>
              <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px', fontSize: '0.78rem', lineHeight: 1.7, color: 'var(--cp-text-muted)' }}>
                <strong style={{ color: 'var(--cp-text-main)' }}><i className="fas fa-circle-info" style={{ marginInlineEnd: 6, color: '#3b82f6' }} />كيف تلوّن المنصة بالكامل؟</strong>
                <div style={{ marginTop: 6 }}>
                  الألوان هنا تغيّر شكل التطبيق كله لهذه المنصة فقط: الصفحات، البطاقات، النصوص، وصفحة تسجيل الدخول — بدون أي برمجة.
                  استخدم <strong>«اللون الأساسي/الثانوي»</strong> بالأعلى للأزرار والعناصر المميّزة، وحقول <strong>«المظهر المتقدم»</strong> بالأسفل للخلفيات والكروت والنصوص.
                  <br />• لكل وضع (فاتح/داكن) خلفية + كرت + نص منفصل — اختر ألواناً متباينة (خلفية داكنة ↔ نص فاتح) لتظل الكتابة واضحة.
                  <br />• أي حقل تتركه فارغاً يعود للافتراضي المحسوب تلقائياً من اللون الأساسي.
                </div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>شعار المنصة (Logo)</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {editLogoUrl && <img src={editLogoUrl} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--cp-divider)', background: '#fff' }} />}
                  <input type="text" value={editLogoUrl} onChange={(e) => setEditLogoUrl(e.target.value)} dir="ltr"
                    placeholder="ارفع صورة من جهازك أو الصق رابطاً" className="cp-input"
                    style={{ flex: 1, padding: '10px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                  <label className="cp-btn cp-btn-secondary" style={{ padding: '9px 14px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className={`fas ${uploadingImage === 'logo' ? 'fa-spinner fa-spin' : 'fa-upload'}`} />
                    <span>رفع من الجهاز</span>
                    <input type="file" accept="image/*" hidden disabled={uploadingImage === 'logo'}
                      onChange={(e) => handleImageUpload(e, 'logo', (url) => setEditLogoUrl(url))} />
                  </label>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                {THEME_TOKEN_DEFS.map(tk => (
                  <div key={tk.key}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '2px' }}>{tk.label}</label>
                    {tk.hint && <div style={{ fontSize: '0.68rem', color: 'var(--cp-text-muted)', marginBottom: '6px', lineHeight: 1.4 }}>{tk.hint}</div>}
                    {tk.type === 'color' ? (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input type="color" value={editTheme[tk.key] || tk.fallback}
                          onChange={(e) => setEditTheme(prev => ({ ...prev, [tk.key]: e.target.value }))}
                          style={{ width: '36px', height: '36px', padding: 0, border: 'none', borderRadius: '6px', cursor: 'pointer' }} />
                        <input type="text" value={editTheme[tk.key]} dir="ltr" placeholder={tk.fallback}
                          onChange={(e) => setEditTheme(prev => ({ ...prev, [tk.key]: e.target.value }))}
                          className="cp-input"
                          style={{ flex: 1, padding: '8px 10px', fontSize: '0.8rem', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                      </div>
                    ) : (
                      <input type="text" value={editTheme[tk.key]} dir="ltr"
                        placeholder="#0f0f23 أو linear-gradient(135deg, #0f0f23, #1a1a2e)"
                        onChange={(e) => setEditTheme(prev => ({ ...prev, [tk.key]: e.target.value }))}
                        className="cp-input"
                        style={{ width: '100%', padding: '10px', fontSize: '0.8rem', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                    )}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '0.74rem', color: 'var(--cp-text-muted)', margin: '-10px 0 20px', lineHeight: 1.5 }}>
                اترك أي حقل فارغاً لاستخدام الافتراضي المحسوب من اللون الأساسي.
              </p>

              {/* Stages & grades */}
              <h5 style={{ fontSize: '0.88rem', fontWeight: 800, margin: '0 0 10px' }}>
                <i className="fas fa-layer-group" style={{ marginInlineEnd: 6, color: 'var(--primary)' }} />
                المراحل والصفوف الدراسية المتاحة
              </h5>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                {editStages.map((stage, si) => (
                  <div key={stage.id} style={{ border: '1px solid var(--cp-divider)', borderRadius: '12px', padding: '12px', opacity: stage.enabled === false ? 0.55 : 1 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', marginBottom: '10px' }}>
                      <input type="checkbox" checked={stage.enabled !== false}
                        onChange={(e) => setEditStages(prev => prev.map((s, i) => i === si ? { ...s, enabled: e.target.checked } : s))}
                        style={{ accentColor: 'var(--primary, #7c3aed)', width: 16, height: 16 }} />
                      <span>{stage.name}</span>
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {(stage.grades || []).map((g, gi) => (
                        <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input type="checkbox" checked={g.enabled !== false} disabled={stage.enabled === false}
                            onChange={(e) => setEditStages(prev => prev.map((s, i) => i === si
                              ? { ...s, grades: s.grades.map((gr, j) => j === gi ? { ...gr, enabled: e.target.checked } : gr) }
                              : s))}
                            style={{ accentColor: '#10b981', width: 14, height: 14 }} />
                          <input type="text" value={g.name} disabled={stage.enabled === false}
                            onChange={(e) => setEditStages(prev => prev.map((s, i) => i === si
                              ? { ...s, grades: s.grades.map((gr, j) => j === gi ? { ...gr, name: e.target.value } : gr) }
                              : s))}
                            className="cp-input"
                            style={{ flex: 1, padding: '6px 8px', fontSize: '0.78rem', border: '1px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Login landing sections */}
              <h5 style={{ fontSize: '0.88rem', fontWeight: 800, margin: '0 0 10px' }}>
                <i className="fas fa-eye" style={{ marginInlineEnd: 6, color: 'var(--primary)' }} />
                أقسام صفحة الهبوط (تسجيل الدخول)
              </h5>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                {LOGIN_SECTION_DEFS.map(s => (
                  <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', padding: '8px 10px', border: '1px solid var(--cp-divider)', borderRadius: '10px', background: editLoginSections[s.key] ? 'rgba(99, 102, 241, 0.05)' : 'transparent' }}>
                    <input type="checkbox" checked={!!editLoginSections[s.key]}
                      onChange={(e) => setEditLoginSections(prev => ({ ...prev, [s.key]: e.target.checked }))}
                      style={{ accentColor: 'var(--primary, #7c3aed)', width: 16, height: 16, cursor: 'pointer' }} />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>

              {/* Feature toggles */}
              <h5 style={{ fontSize: '0.88rem', fontWeight: 800, margin: '0 0 6px' }}>
                <i className="fas fa-toggle-on" style={{ marginInlineEnd: 6, color: 'var(--primary)' }} />
                ميزات المنصة المفعّلة
              </h5>
              <p style={{ fontSize: '0.74rem', color: 'var(--cp-text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
                إلغاء تفعيل أي ميزة <strong>يُخفيها تماماً</strong> من المنصة (القائمة، الصفحة الرئيسية، والروابط) — لا يظهر الطالب أنها ممنوعة، بل تختفي كأنها غير موجودة.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: '10px', marginBottom: '24px' }}>
                {FEATURE_DEFS.map(f => (
                  <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', padding: '8px 10px', border: '1px solid var(--cp-divider)', borderRadius: '10px', background: editFeatures[f.key] ? 'rgba(16, 185, 129, 0.05)' : 'transparent' }}>
                    <input type="checkbox" checked={!!editFeatures[f.key]}
                      onChange={(e) => setEditFeatures(prev => ({ ...prev, [f.key]: e.target.checked }))}
                      style={{ accentColor: '#10b981', width: 16, height: 16, cursor: 'pointer' }} />
                    <span>{f.label}</span>
                  </label>
                ))}
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

