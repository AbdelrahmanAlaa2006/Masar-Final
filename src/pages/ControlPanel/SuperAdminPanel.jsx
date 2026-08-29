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
import { getTenantFolder } from '../../tenants/brandOverrides'

/* Subject → theme mapping. getTenantFolder() in src/tenants/brandOverrides.js
   resolves the theme chunk from config.subject, so picking a subject here is
   what gives a button-created tenant a real theme without any code change. */
const SUBJECT_OPTIONS = [
  { value: 'arabic', label: 'لغة عربية / عام (الثيم الافتراضي)' },
  { value: 'primary-multi', label: 'تأسيس ومواد المرحلة الابتدائية (متعدد المواد)' },
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

import { PLATFORM_FEATURES, FEATURE_CATEGORIES, FEATURE_PRESETS } from '../../config/features'

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
  { key: 'bio', label: 'نبذة عن المعلم (ظهرت في كارت عن المعلم والواجهة)', textarea: true, placeholder: 'مثال: بشرح اللغة العربية بأسلوب بسيط وحديث يقرّب القواعد والنحو والأدب لذهن الطالب. هدفي إن كل طالب يطلع من الدرس فاهم ومستمتع — مش بس حافظ.' },
  { key: 'quote', label: 'اقتباس / رسالة المعلم', textarea: true, placeholder: 'مثال: «اللغة العربية مش صعبة — محتاجة بس حد يقدّمها بطريقة صح.»' },
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

  // Add Admin to existing Tenant modal states
  const [showAddAdminModal, setShowAddAdminModal] = useState(false)
  const [addAdminTenant, setAddAdminTenant] = useState(null)
  const [addAdminName, setAddAdminName] = useState('')
  const [addAdminPhone, setAddAdminPhone] = useState('')
  const [addAdminPassword, setAddAdminPassword] = useState('')
  const [addingAdmin, setAddingAdmin] = useState(false)

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
  const [editHeroTitleB, setEditHeroTitleB] = useState('')
  const [editHeroSub, setEditHeroSub] = useState('')
  const [editFeatures, setEditFeatures] = useState({})
  const [searchFeatureQuery, setSearchFeatureQuery] = useState('')
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
  const [activeMainTab, setActiveMainTab] = useState('tenants')
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'table'
  const [manageActiveTab, setManageActiveTab] = useState('branding')
  const [tenantFilterCategory, setTenantFilterCategory] = useState('all')

  // Resolve tenant logo from config, db, or static fallbacks
  const resolveTenantLogo = (t) => {
    if (!t) return null
    if (t.logo_url && typeof t.logo_url === 'string' && t.logo_url.trim()) return t.logo_url
    if (t.config?.branding?.logo && typeof t.config.branding.logo === 'string' && t.config.branding.logo.trim()) return t.config.branding.logo
    if (t.config?.logo_url && typeof t.config.logo_url === 'string' && t.config.logo_url.trim()) return t.config.logo_url

    const slug = (t.slug || '').toLowerCase()
    const name = (t.name || '').toLowerCase()

    if (slug.includes('mohamed-abdella') || slug.includes('power') || slug.includes('cyber') || slug.includes('prog') || name.includes('باور') || name.includes('عبدالله') || name.includes('عبد الله')) {
      return '/images/Power Logo.png'
    }
    if (slug.includes('yasser') || name.includes('ياسر')) {
      return '/images/Logo Mr Mohamed Yasser.png'
    }
    if (slug.includes('english') || slug.includes('waled') || slug.includes('sherif-english') || name.includes('miracle') || name.includes('انجليزي') || name.includes('إنجليزي')) {
      return '/images/Logo The Miracle.png'
    }
    if (slug.includes('eldad') || slug.includes('khalid') || name.includes('الضاد')) {
      return '/images/Logo Eldad Arabic Without BG.png'
    }
    if (slug.includes('belqadar') || slug.includes('mahmoud') || name.includes('البلقدار')) {
      return '/images/logo elbeliqdar cropped.png'
    }
    if (slug.includes('elsharawy') || slug.includes('elshaarawy') || name.includes('الشعراوي')) {
      return '/images/Elshaarawy Logo.png'
    }

    return null
  }

  // Quick helper to copy tenant login link
  const handleCopyTenantLink = (slug, domain) => {
    const url = domain ? `https://${domain}` : `${window.location.origin}/login?tenant=${slug}`
    navigator.clipboard.writeText(url)
    flash(`تم نسخ رابط منصة (${slug}) بنجاح!`, 'success')
  }

  // Quick helper to preview tenant in new tab
  const handlePreviewTenant = (slug, domain) => {
    const url = domain ? `https://${domain}` : `/login?tenant=${slug}`
    window.open(url, '_blank')
  }

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
    let list = tenants
    if (searchPlatformQuery.trim()) {
      const query = searchPlatformQuery.toLowerCase().trim()
      list = list.filter(t => 
        (t.name || '').toLowerCase().includes(query) || 
        (t.slug || '').toLowerCase().includes(query)
      )
    }

    if (tenantFilterCategory === 'primary') {
      list = list.filter(t => {
        const stages = t.config?.stages || []
        const hasPrimary = stages.some(s => s.id === 'primary' && s.enabled !== false)
        return hasPrimary || t.config?.subject === 'primary-multi'
      })
    } else if (tenantFilterCategory === 'prep-sec') {
      list = list.filter(t => {
        const stages = t.config?.stages || []
        const hasPrepSec = stages.some(s => (s.id === 'preparatory' || s.id === 'secondary' || s.id === 'baccalaureate') && s.enabled !== false)
        return hasPrepSec || t.config?.subject !== 'primary-multi'
      })
    } else if (tenantFilterCategory === 'top-students') {
      list = [...list].sort((a, b) => (b.studentsCount || 0) - (a.studentsCount || 0))
    }

    return list
  }, [tenants, searchPlatformQuery, tenantFilterCategory])


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

      // 3. Fetch all profiles to calculate user counts (paginated to bypass Supabase 1000 row REST limit)
      let profilesList = []
      let page = 0
      const PAGE_SIZE = 1000
      let fetchMore = true

      while (fetchMore) {
        const { data: chunk, error: pErr } = await supabase
          .from('profiles')
          .select('id, tenant_id, role, name, phone, created_at')
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

        if (pErr) throw pErr

        if (chunk && chunk.length > 0) {
          profilesList = profilesList.concat(chunk)
          if (chunk.length < PAGE_SIZE) {
            fetchMore = false
          } else {
            page++
          }
        } else {
          fetchMore = false
        }
      }

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

  // Scroll to top on active tab change
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [activeMainTab])

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
  const openManageTenant = async (tenant) => {
    setSelectedTenantForManage(tenant)
    setEditName(tenant.name)
    setEditDomain(tenant.domain || '')
    setEditPrimaryColor(tenant.primary_color || '#7c3aed')
    setEditSecondaryColor(tenant.secondary_color || '#06b6d4')
    setSearchUserQuery('')

    // Try to load any preconfigured code theme module for this tenant
    let codeCfg = {}
    try {
      const folder = getTenantFolder(tenant)
      if (folder && folder !== 'default') {
        const mod = await import(`../../tenants/${folder}/config.js`)
        codeCfg = mod.default || mod.config || {}
      }
    } catch (e) {
      console.warn('Could not load code config for tenant in SuperAdminPanel', e)
    }

    // Hydrate customization fields from the tenant's config JSONB with code defaults as fallback
    const cfg = tenant.config || {}
    const asText = (v) => (typeof v === 'object' && v !== null) ? (v.ar || v.en || '') : (v || '')

    const resolveField = (dbVal, codeVal, isTeacherName = false) => {
      if (isTeacherName && dbVal === 'Admin' && codeVal) return asText(codeVal)
      if (dbVal !== undefined && dbVal !== null && dbVal !== '') return asText(dbVal)
      return asText(codeVal)
    }

    setEditSubject(cfg.subject || codeCfg.subject || 'arabic')
    setEditTeacherName(resolveField(cfg.teacher?.name, codeCfg.teacher?.name, true))
    setEditTeacherRole(resolveField(cfg.teacher?.role, codeCfg.teacher?.role))
    setEditContactPhone(cfg.contact?.phone || codeCfg.contact?.phone || '')
    setEditContactEmail(cfg.contact?.email || codeCfg.contact?.email || '')
    setEditContactAddress(cfg.contact?.address || codeCfg.contact?.address || '')

    const resolvedSocials = { ...(codeCfg.socials || {}), ...(cfg.socials || {}) }
    setEditSocials({
      facebook: resolvedSocials.facebook && resolvedSocials.facebook !== '#' ? resolvedSocials.facebook : '',
      youtube: resolvedSocials.youtube && resolvedSocials.youtube !== '#' ? resolvedSocials.youtube : '',
      instagram: resolvedSocials.instagram && resolvedSocials.instagram !== '#' ? resolvedSocials.instagram : '',
      telegram: resolvedSocials.telegram && resolvedSocials.telegram !== '#' ? resolvedSocials.telegram : '',
      whatsapp: resolvedSocials.whatsapp && resolvedSocials.whatsapp !== '#' ? resolvedSocials.whatsapp : ''
    })

    setEditHeroTitle(resolveField(cfg.branding?.hero_title_a || cfg.branding?.hero_title, codeCfg.branding?.hero_title_a || codeCfg.branding?.hero_title))
    setEditHeroTitleB(resolveField(cfg.branding?.hero_title_b, codeCfg.branding?.hero_title_b))
    setEditHeroSub(resolveField(cfg.branding?.hero_sub || cfg.branding?.hero_subtitle, codeCfg.branding?.hero_sub || codeCfg.branding?.hero_subtitle))

    // Feature toggles: missing key = enabled (same default as isFeatureEnabled)
    const feats = {}
    PLATFORM_FEATURES.forEach(f => {
      const dbFeat = cfg.features?.[f.key]
      const codeFeat = codeCfg.features?.[f.key]
      feats[f.key] = dbFeat !== undefined ? dbFeat !== false : (codeFeat !== undefined ? codeFeat !== false : f.defaultEnabled !== false)
    })
    setEditFeatures(feats)

    setEditLogoUrl(tenant.logo_url || codeCfg.logoUrl || '')

    const teacherExtra = {}
    TEACHER_EXTRA_DEFS.forEach(f => {
      teacherExtra[f.key] = resolveField(cfg.teacher?.[f.key], codeCfg.teacher?.[f.key])
    })
    setEditTeacherExtra(teacherExtra)

    const locationData = {}
    LOCATION_DEFS.forEach(f => {
      locationData[f.key] = resolveField(cfg.location?.[f.key], codeCfg.location?.[f.key])
    })
    setEditLocation(locationData)

    // Branches: existing list, or codeCfg branches, or migrated legacy
    const branchesSrc = (Array.isArray(cfg.location?.branches) && cfg.location.branches.length > 0)
      ? cfg.location.branches
      : (Array.isArray(codeCfg.location?.branches) && codeCfg.location.branches.length > 0 ? codeCfg.location.branches : null)

    const locObj = (cfg.location && (cfg.location.address || cfg.location.map_iframe_url || cfg.location.phone || cfg.location.directions_link))
      ? cfg.location
      : (codeCfg.location || {})

    if (branchesSrc) {
      setEditLocBranches(branchesSrc.map(b => {
        const entry = {}
        BRANCH_DEFS.forEach(f => { entry[f.key] = asText(b?.[f.key]) })
        return entry
      }))
    } else if (locObj.address || locObj.map_iframe_url || locObj.phone || locObj.directions_link) {
      const legacy = {}
      BRANCH_DEFS.forEach(f => { legacy[f.key] = asText(locObj[f.key]) })
      if (!legacy.name) legacy.name = asText(locObj.title) || 'المقر الرئيسي (السنتر)'
      setEditLocBranches([legacy])
    } else {
      setEditLocBranches([])
    }

    setEditTheme({
      bg_light: cfg.theme?.bg_light || codeCfg.theme?.bg_light || cfg.bg_color || '',
      card_light: cfg.theme?.card_light || codeCfg.theme?.card_light || '',
      text_light: cfg.theme?.text_light || codeCfg.theme?.text_light || '',
      bg_dark: cfg.theme?.bg_dark || codeCfg.theme?.bg_dark || '',
      card_dark: cfg.theme?.card_dark || codeCfg.theme?.card_dark || '',
      text_dark: cfg.theme?.text_dark || codeCfg.theme?.text_dark || '',
      border_accent: cfg.theme?.border_accent || codeCfg.theme?.border_accent || ''
    })
    const sections = {}
    LOGIN_SECTION_DEFS.forEach(s => {
      const dbSec = cfg.login_sections?.[s.key]
      const codeSec = codeCfg.login_sections?.[s.key]
      sections[s.key] = dbSec !== undefined ? dbSec !== false : (codeSec !== undefined ? codeSec !== false : true)
    })
    setEditLoginSections(sections)

    // Announcements strip: tenant list, or the shared defaults on first edit
    setEditAnnouncements(
      Array.isArray(cfg.announcements)
        ? cfg.announcements.map(a => ({ icon: a?.icon || '', text: a?.text || '' }))
        : (Array.isArray(codeCfg.announcements) ? codeCfg.announcements : DEFAULT_ANNOUNCEMENTS.map(a => ({ ...a })))
    )
    // Stages: ALWAYS show the full 4-stage template in the editor so the admin
    // can enable any stage later — even a tenant currently limited to one stage
    // (e.g. البكالوريا only). The tenant's saved enabled-state and custom grades
    // are merged in; a stage the tenant never configured appears OFF. Saving is
    // non-destructive: a disabled stage isn't shown to students, so existing
    // tenants keep behaving exactly as before.
    const saved = Array.isArray(cfg.stages) ? cfg.stages : []
    const savedById = new Map(saved.map(st => [st.id, st]))
    setEditStages(
      buildStagesTemplate().map(tpl => {
        const s = savedById.get(tpl.id)
        if (!s) return { ...tpl, enabled: false } // never offered → off by default
        // Merge saved grades onto the template so newly-added grades still show.
        const savedGradeById = new Map((s.grades || []).map(g => [g.id, g]))
        return {
          ...tpl,
          enabled: s.enabled !== false,
          grades: (tpl.grades || []).map(g => {
            const sg = savedGradeById.get(g.id)
            return sg ? { ...g, enabled: sg.enabled !== false } : g
          }),
        }
      })
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
        branding: cleaned({ ...(prevConfig.branding || {}), hero_title_a: editHeroTitle, hero_title_b: editHeroTitleB, hero_sub: editHeroSub }),
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

  // Open modal to add a brand-new admin directly to any selected tenant
  const handleOpenAddAdmin = (tenant) => {
    setAddAdminTenant(tenant)
    setAddAdminName('')
    setAddAdminPhone('')
    setAddAdminPassword('')
    setShowAddAdminModal(true)
  }

  // Create brand new admin user server-side for the chosen tenant
  const handleAddAdminSubmit = async (e) => {
    e.preventDefault()
    if (!addAdminTenant) return
    const name = addAdminName.trim()
    const phone = addAdminPhone.trim()
    const pwd = addAdminPassword.trim()

    if (!name || !phone) {
      flash('اسم ورقم هاتف المدير مطلوبان', 'warning')
      return
    }
    if (pwd.length < 6) {
      flash('كلمة المرور يجب ألا تقل عن 6 أحرف', 'warning')
      return
    }

    setAddingAdmin(true)
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke('create-tenant-admin', {
        body: {
          tenant_id: addAdminTenant.id,
          admin_name: name,
          admin_phone: phone,
          admin_password: pwd,
        },
      })
      if (fnError || fnData?.error) {
        throw new Error(fnData?.error || fnError?.message || 'فشل إنشاء حساب المدير')
      }

      flash(`تم إنشاء حساب المدير (${name}) لمنصة (${addAdminTenant.name}) بنجاح!`, 'success')
      setShowAddAdminModal(false)
      setAddAdminName('')
      setAddAdminPhone('')
      setAddAdminPassword('')
      setAddAdminTenant(null)
      fetchStats()
    } catch (err) {
      console.error(err)
      flash('فشل إنشاء حساب المدير: ' + (err.message || 'خطأ غير متوقع'), 'error')
    } finally {
      setAddingAdmin(false)
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
    <div className="cp-panel-container" style={{ direction: 'rtl', fontFamily: 'Tajawal, sans-serif', maxWidth: '100%' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="fas fa-user-ninja" style={{ color: '#ec4899' }}></i>
            <span>لوحة المطور والـ Super Admin</span>
          </h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', margin: '6px 0 0' }}>إدارة منصات المدرسين ومراقبة حجم قاعدة البيانات والأمان والعمليات المالية</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {activeMainTab === 'tenants' && (
            <button 
              onClick={() => setShowCreateModal(true)} 
              className="cp-btn cp-btn-primary" 
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--primary, #7c3aed)', color: '#fff', height: '42px', fontWeight: 700 }}
            >
              <i className="fas fa-plus"></i>
              <span>إنشاء منصة جديدة</span>
            </button>
          )}
          <button onClick={onBack} className="cp-btn cp-btn-secondary" style={{ height: '42px' }}>
            رجوع للوحة التحكم
          </button>
        </div>
      </div>

      {/* Main Top Navigation Tabs */}
      <div className="cp-sa-nav-bar">
        {[
          { id: 'tenants', label: `المنصات والمدرسين (${tenants.length})`, icon: 'fa-cubes' },
          { id: 'database', label: 'صيانة وقاعدة البيانات', icon: 'fa-server' },
          { id: 'business', label: 'إدارة الأعمال والمالية', icon: 'fa-briefcase' },
          { id: 'security', label: 'سجلات الحماية والأمان', icon: 'fa-shield-halved' },
          { id: 'themes', label: 'السمات الموسمية', icon: 'fa-moon' },
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`cp-sa-nav-tab ${activeMainTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveMainTab(tab.id)}
          >
            <i className={`fas ${tab.icon}`}></i>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="cp-empty">
          <i className="fas fa-spinner fa-spin"></i>
          <p>جاري تحميل بيانات النظام...</p>
        </div>
      ) : error ? (
        <div className="cp-empty" style={{ color: '#ef4444' }}>
          <i className="fas fa-triangle-exclamation"></i>
          <p>{error}</p>
        </div>
      ) : (
        <>
          {/* TAB 1: TENANTS & TEACHERS MANAGEMENT */}
          {activeMainTab === 'tenants' && (
            <div>
              {/* Global Statistics Cards */}
              <div className="cp-sa-stats-grid">
                <div className="cp-sa-stat-card cp-sa-violet">
                  <div className="cp-sa-stat-icon">
                    <i className="fas fa-cubes"></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-color)' }}>{globalStats.tenants}</div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', fontWeight: 600 }}>المنصات الفعالة</div>
                  </div>
                </div>

                <div className="cp-sa-stat-card cp-sa-emerald">
                  <div className="cp-sa-stat-icon">
                    <i className="fas fa-graduation-cap"></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-color)' }}>{globalStats.students}</div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', fontWeight: 600 }}>إجمالي الطلاب</div>
                  </div>
                </div>

                <div className="cp-sa-stat-card cp-sa-amber">
                  <div className="cp-sa-stat-icon">
                    <i className="fas fa-users-cog"></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-color)' }}>{globalStats.assistants}</div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', fontWeight: 600 }}>المساعدين المشتركين</div>
                  </div>
                </div>

                <div className="cp-sa-stat-card cp-sa-rose">
                  <div className="cp-sa-stat-icon">
                    <i className="fas fa-user-tie"></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-color)' }}>{globalStats.admins}</div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--cp-text-muted)', fontWeight: 600 }}>المشرفين والمعلمين</div>
                  </div>
                </div>
              </div>

              {/* Toolbar: Filters & View Switcher */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Category Filter Pills */}
                  <div style={{
                    display: 'flex',
                    gap: '4px',
                    background: 'var(--cp-card-bg)',
                    padding: '4px',
                    borderRadius: '12px',
                    border: '1px solid var(--cp-divider)'
                  }}>
                    {[
                      { id: 'all', label: `الكل (${tenants.length})` },
                      { id: 'primary', label: 'ابتدائي' },
                      { id: 'prep-sec', label: 'إعدادي/ثانوي' },
                      { id: 'top-students', label: 'الأعلى طلاباً 🏆' },
                    ].map(pill => {
                      const isActive = tenantFilterCategory === pill.id
                      return (
                        <button
                          key={pill.id}
                          type="button"
                          onClick={() => setTenantFilterCategory(pill.id)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            fontWeight: isActive ? 800 : 600,
                            background: isActive ? 'var(--primary, #7c3aed)' : 'transparent',
                            color: isActive ? '#fff' : 'var(--cp-text-muted)',
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {pill.label}
                        </button>
                      )
                    })}
                  </div>

                  {/* Search Input */}
                  <div className="cp-search" style={{ margin: 0, width: '250px' }}>
                    <i className="fas fa-search" style={{ right: '12px', fontSize: '0.82rem' }}></i>
                    <input
                      type="text"
                      placeholder="بحث بالاسم أو المعرف..."
                      value={searchPlatformQuery}
                      onChange={(e) => setSearchPlatformQuery(e.target.value)}
                      style={{ padding: '8px 36px 8px 30px', fontSize: '0.84rem', height: '38px', borderRadius: '10px' }}
                    />
                    {searchPlatformQuery && (
                      <button onClick={() => setSearchPlatformQuery('')} className="cp-search-clear" style={{ left: '6px' }}>
                        <i className="fas fa-times"></i>
                      </button>
                    )}
                  </div>
                </div>

                {/* View Switcher Controls (Desktop) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '0.84rem', color: 'var(--cp-text-muted)' }}>
                    تم العثور على <strong>{filteredTenants.length}</strong> منصة
                  </span>
                  
                  <div className="cp-sa-view-toggle">
                    <button
                      type="button"
                      className={`cp-sa-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                      onClick={() => setViewMode('grid')}
                      title="عرض شبكة البطاقات"
                    >
                      <i className="fas fa-grid-2"></i>
                      <span>بطاقات</span>
                    </button>
                    <button
                      type="button"
                      className={`cp-sa-view-btn ${viewMode === 'table' ? 'active' : ''}`}
                      onClick={() => setViewMode('table')}
                      title="عرض الجدول المنسق"
                    >
                      <i className="fas fa-table-list"></i>
                      <span>جدول</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* VIEW 1: MODERN CARDS GRID */}
              {viewMode === 'grid' && (
                <div className="cp-sa-cards-grid">
                  {filteredTenants.map((t) => {
                    const resolvedLogo = resolveTenantLogo(t)
                    return (
                      <div key={t.id} className="cp-sa-tenant-card">
                        {/* Header: Logo + Title + Links */}
                        <div>
                          <div className="cp-sa-tenant-card-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                              <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '14px',
                                background: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                border: '1.5px solid var(--cp-divider)',
                                boxShadow: '0 4px 10px rgba(0,0,0,0.06)',
                                padding: '3px',
                                flexShrink: 0
                              }}>
                                {resolvedLogo ? (
                                  <img src={resolvedLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                ) : (
                                  <div style={{
                                    width: '100%',
                                    height: '100%',
                                    borderRadius: '10px',
                                    background: `linear-gradient(135deg, ${t.primary_color || '#7c3aed'}, ${t.secondary_color || '#06b6d4'})`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#fff',
                                    fontSize: '18px'
                                  }}>
                                    <i className="fas fa-server"></i>
                                  </div>
                                )}
                              </div>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <h4 style={{ margin: '0 0 2px', fontSize: '1.02rem', fontWeight: 800, color: 'var(--cp-text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {t.name}
                                </h4>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <code className="cp-sa-color-badge" style={{ fontSize: '0.75rem', padding: '2px 6px' }}>{t.slug}</code>
                                  {t.domain && (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--cp-text-muted)', direction: 'ltr' }}>{t.domain}</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                              <button
                                type="button"
                                onClick={() => handleCopyTenantLink(t.slug, t.domain)}
                                title="نسخ رابط المنصة"
                                style={{
                                  background: 'rgba(124, 58, 237, 0.08)',
                                  border: '1px solid rgba(124, 58, 237, 0.2)',
                                  color: 'var(--primary, #7c3aed)',
                                  cursor: 'pointer',
                                  padding: '6px 8px',
                                  borderRadius: '8px',
                                  fontSize: '0.82rem',
                                  display: 'inline-flex',
                                  alignItems: 'center'
                                }}
                              >
                                <i className="fas fa-copy"></i>
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePreviewTenant(t.slug, t.domain)}
                                title="معاينة المنصة"
                                style={{
                                  background: 'rgba(6, 182, 212, 0.08)',
                                  border: '1px solid rgba(6, 182, 212, 0.2)',
                                  color: '#06b6d4',
                                  cursor: 'pointer',
                                  padding: '6px 8px',
                                  borderRadius: '8px',
                                  fontSize: '0.82rem',
                                  display: 'inline-flex',
                                  alignItems: 'center'
                                }}
                              >
                                <i className="fas fa-arrow-up-right-from-square"></i>
                              </button>
                            </div>
                          </div>

                          {/* Stats Metrics Grid */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '8px',
                            background: 'var(--cp-bg)',
                            borderRadius: '14px',
                            padding: '12px 10px',
                            margin: '14px 0',
                            border: '1px solid var(--cp-divider)'
                          }}>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--primary, #7c3aed)' }}>{t.studentsCount}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--cp-text-muted)', fontWeight: 600 }}>الطلاب</div>
                            </div>
                            <div style={{ textAlign: 'center', borderRight: '1px solid var(--cp-divider)', borderLeft: '1px solid var(--cp-divider)' }}>
                              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10b981' }}>{t.assistantsCount}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--cp-text-muted)', fontWeight: 600 }}>المساعدين</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f59e0b' }}>{t.adminsCount}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--cp-text-muted)', fontWeight: 600 }}>المشرفين</div>
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons Footer */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                          <button
                            onClick={() => handleOpenAddAdmin(t)}
                            className="cp-btn"
                            style={{
                              padding: '8px 10px',
                              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.1) 100%)',
                              color: '#10b981',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              borderRadius: '10px',
                              fontSize: '0.82rem',
                              fontWeight: 'bold',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              height: '38px',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            <i className="fas fa-user-plus" style={{ fontSize: '0.75rem' }}></i>
                            <span>+ مدير</span>
                          </button>
                          
                          <button
                            onClick={() => openManageTenant(t)}
                            className="cp-btn"
                            style={{
                              padding: '8px 10px',
                              background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.15) 0%, rgba(99, 102, 241, 0.1) 100%)',
                              color: 'var(--primary, #7c3aed)',
                              border: '1px solid rgba(124, 58, 237, 0.3)',
                              borderRadius: '10px',
                              fontSize: '0.82rem',
                              fontWeight: 'bold',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              height: '38px',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            <i className="fas fa-gears" style={{ fontSize: '0.75rem' }}></i>
                            <span>إدارة وتخصيص</span>
                          </button>

                          <button
                            onClick={() => {
                              setSelectedTenantForWipe(t)
                              setShowWipeModal(true)
                            }}
                            title="تصفير بيانات المنصة"
                            style={{
                              padding: '8px 10px',
                              background: 'rgba(239, 68, 68, 0.08)',
                              color: '#ef4444',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              borderRadius: '10px',
                              fontSize: '0.82rem',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              height: '38px'
                            }}
                          >
                            <i className="fas fa-trash-can"></i>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* VIEW 2: CLEAN FULL-WIDTH DATA TABLE */}
              {viewMode === 'table' && (
                <div className="cp-sa-table-card">
                  <div className="cp-sa-table-wrapper" style={{ maxHeight: '650px' }}>
                    <table className="cp-sa-table">
                      <colgroup>
                        <col style={{ width: '32%' }} />
                        <col style={{ width: '18%' }} />
                        <col style={{ width: '8%' }} />
                        <col style={{ width: '8%' }} />
                        <col style={{ width: '8%' }} />
                        <col style={{ width: '26%' }} />
                      </colgroup>
                      <thead>
                        <tr style={{ background: 'rgba(99, 102, 241, 0.03)' }}>
                          <th style={{ textAlign: 'right', padding: '16px 20px' }}>اسم المنصة والمعلم</th>
                          <th style={{ textAlign: 'right', padding: '16px 18px' }}>المعرف السريع (Slug)</th>
                          <th style={{ textAlign: 'center', padding: '16px 12px' }}>الطلاب</th>
                          <th style={{ textAlign: 'center', padding: '16px 12px' }}>المساعدين</th>
                          <th style={{ textAlign: 'center', padding: '16px 12px' }}>المشرفين</th>
                          <th style={{ textAlign: 'center', padding: '16px 20px' }}>خيارات التحكم والصيانة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTenants.map((t) => {
                          const resolvedLogo = resolveTenantLogo(t)
                          return (
                            <tr key={t.id}>
                              <td style={{ textAlign: 'right', padding: '14px 20px' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '14px', textAlign: 'right' }}>
                                  <div style={{
                                    width: '44px',
                                    height: '44px',
                                    borderRadius: '12px',
                                    background: '#ffffff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    overflow: 'hidden',
                                    border: '1.5px solid var(--cp-divider)',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                                    padding: '3px'
                                  }}>
                                    {resolvedLogo ? (
                                      <img src={resolvedLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                    ) : (
                                      <div style={{
                                        width: '100%',
                                        height: '100%',
                                        borderRadius: '8px',
                                        background: `linear-gradient(135deg, ${t.primary_color || '#7c3aed'}, ${t.secondary_color || '#06b6d4'})`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#fff',
                                        fontSize: '15px'
                                      }}>
                                        <i className="fas fa-server"></i>
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '0.96rem', fontWeight: 800, color: 'var(--cp-text-main)', lineHeight: 1.3 }}>{t.name}</div>
                                    {t.domain ? (
                                      <div style={{ fontSize: '0.76rem', color: 'var(--cp-text-muted)', direction: 'ltr', textAlign: 'right', marginTop: '2px' }}>
                                        {t.domain}
                                      </div>
                                    ) : (
                                      <div style={{ fontSize: '0.76rem', color: 'var(--cp-text-muted)', marginTop: '2px' }}>
                                        منصة تعليمية
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td style={{ textAlign: 'right', padding: '14px 18px' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                  <code className="cp-sa-color-badge" style={{ fontSize: '0.82rem', padding: '4px 8px' }}>{t.slug}</code>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyTenantLink(t.slug, t.domain)}
                                    title="نسخ رابط المنصة"
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: 'var(--cp-text-muted)',
                                      cursor: 'pointer',
                                      padding: '4px',
                                      fontSize: '0.85rem',
                                      display: 'inline-flex',
                                      alignItems: 'center'
                                    }}
                                  >
                                    <i className="fas fa-copy"></i>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handlePreviewTenant(t.slug, t.domain)}
                                    title="معاينة المنصة"
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: 'var(--primary, #7c3aed)',
                                      cursor: 'pointer',
                                      padding: '4px',
                                      fontSize: '0.85rem',
                                      display: 'inline-flex',
                                      alignItems: 'center'
                                    }}
                                  >
                                    <i className="fas fa-arrow-up-right-from-square"></i>
                                  </button>
                                </div>
                              </td>
                              <td style={{ textAlign: 'center', padding: '14px 8px' }}>
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  minWidth: '34px',
                                  padding: '4px 10px',
                                  borderRadius: '12px',
                                  background: 'rgba(124, 58, 237, 0.1)',
                                  color: 'var(--primary, #7c3aed)',
                                  fontWeight: 800,
                                  fontSize: '0.9rem'
                                }}>
                                  {t.studentsCount}
                                </span>
                              </td>
                              <td style={{ textAlign: 'center', padding: '14px 8px' }}>
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  minWidth: '34px',
                                  padding: '4px 10px',
                                  borderRadius: '12px',
                                  background: 'rgba(16, 185, 129, 0.1)',
                                  color: '#10b981',
                                  fontWeight: 800,
                                  fontSize: '0.9rem'
                                }}>
                                  {t.assistantsCount}
                                </span>
                              </td>
                              <td style={{ textAlign: 'center', padding: '14px 8px' }}>
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  minWidth: '34px',
                                  padding: '4px 10px',
                                  borderRadius: '12px',
                                  background: 'rgba(245, 158, 11, 0.1)',
                                  color: '#f59e0b',
                                  fontWeight: 800,
                                  fontSize: '0.9rem'
                                }}>
                                  {t.adminsCount}
                                </span>
                              </td>
                              <td style={{ textAlign: 'center', padding: '14px 20px' }}>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center', flexWrap: 'nowrap' }}>
                                  <button
                                    onClick={() => handleOpenAddAdmin(t)}
                                    className="cp-btn"
                                    style={{
                                      padding: '6px 12px',
                                      background: 'rgba(16, 185, 129, 0.12)',
                                      color: '#10b981',
                                      border: '1px solid rgba(16, 185, 129, 0.28)',
                                      borderRadius: '8px',
                                      fontSize: '0.8rem',
                                      fontWeight: 'bold',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '6px',
                                      whiteSpace: 'nowrap',
                                      lineHeight: 1,
                                      height: '34px'
                                    }}
                                    title="إضافة حساب مدير جديد لهذه المنصة"
                                  >
                                    <i className="fas fa-user-plus" style={{ fontSize: '0.75rem' }}></i>
                                    <span>+ مدير</span>
                                  </button>
                                  
                                  <button
                                    onClick={() => openManageTenant(t)}
                                    className="cp-btn"
                                    style={{
                                      padding: '6px 12px',
                                      background: 'rgba(99, 102, 241, 0.12)',
                                      color: '#6366f1',
                                      border: '1px solid rgba(99, 102, 241, 0.28)',
                                      borderRadius: '8px',
                                      fontSize: '0.8rem',
                                      fontWeight: 'bold',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '6px',
                                      whiteSpace: 'nowrap',
                                      lineHeight: 1,
                                      height: '34px'
                                    }}
                                  >
                                    <i className="fas fa-gears" style={{ fontSize: '0.75rem' }}></i>
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
                                      background: 'rgba(239, 68, 68, 0.12)',
                                      color: '#ef4444',
                                      border: '1px solid rgba(239, 68, 68, 0.28)',
                                      borderRadius: '8px',
                                      fontSize: '0.8rem',
                                      fontWeight: 'bold',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '6px',
                                      whiteSpace: 'nowrap',
                                      lineHeight: 1,
                                      height: '34px'
                                    }}
                                    title="تصفير بيانات المنصة"
                                  >
                                    <i className="fas fa-trash-can" style={{ fontSize: '0.75rem' }}></i>
                                    <span>تصفير</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                        {filteredTenants.length === 0 && (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--cp-text-muted)' }}>
                              <i className="fas fa-search-minus" style={{ fontSize: '24px', marginBottom: '8px', display: 'block', opacity: 0.6 }}></i>
                              <span>لا توجد منصات تطابق البحث أو الفلتر حالياً.</span>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DATABASE USAGE & MAINTENANCE CENTER */}
          {activeMainTab === 'database' && (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 380px', gap: '24px', alignItems: 'start' }}>
              <div>
                {/* Database Metrics Grid */}
                <div className="cp-sa-sidebar-card" style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <i className="fas fa-database" style={{ color: '#06b6d4' }}></i>
                      <span>إحصائيات استهلاك قاعدة البيانات والمحتوى</span>
                    </h3>
                    <button onClick={() => fetchStats()} className="cp-btn cp-btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                      <i className="fas fa-arrows-rotate"></i>
                      <span>تحديث الأرقام</span>
                    </button>
                  </div>

                  {(() => {
                    const maxRecords = Math.max(dbStats.videos, dbStats.exams + dbStats.homeworks, dbStats.attempts + dbStats.submissions, dbStats.payments, 10)
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '18px' }}>
                        <div style={{ background: 'var(--cp-bg)', padding: '16px', borderRadius: '16px', border: '1px solid var(--cp-divider)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '8px' }}>
                            <span style={{ color: 'var(--cp-text-muted)', fontWeight: 600 }}>الفيديوهات والملفات</span>
                            <strong style={{ color: '#6366f1' }}>{dbStats.videos} سجل</strong>
                          </div>
                          <div className="cp-sa-progress-bar-container">
                            <div className="cp-sa-progress-bar-fill" style={{ width: `${(dbStats.videos / maxRecords) * 100}%`, background: 'linear-gradient(90deg, #6366f1, #7c3aed)' }} />
                          </div>
                        </div>

                        <div style={{ background: 'var(--cp-bg)', padding: '16px', borderRadius: '16px', border: '1px solid var(--cp-divider)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '8px' }}>
                            <span style={{ color: 'var(--cp-text-muted)', fontWeight: 600 }}>الامتحانات والواجبات</span>
                            <strong style={{ color: '#10b981' }}>{dbStats.exams + dbStats.homeworks} سجل</strong>
                          </div>
                          <div className="cp-sa-progress-bar-container">
                            <div className="cp-sa-progress-bar-fill" style={{ width: `${((dbStats.exams + dbStats.homeworks) / maxRecords) * 100}%`, background: 'linear-gradient(90deg, #10b981, #059669)' }} />
                          </div>
                        </div>

                        <div style={{ background: 'var(--cp-bg)', padding: '16px', borderRadius: '16px', border: '1px solid var(--cp-divider)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '8px' }}>
                            <span style={{ color: 'var(--cp-text-muted)', fontWeight: 600 }}>إجابات وحلول الطلاب</span>
                            <strong style={{ color: '#f59e0b' }}>{dbStats.attempts + dbStats.submissions} حلّ</strong>
                          </div>
                          <div className="cp-sa-progress-bar-container">
                            <div className="cp-sa-progress-bar-fill" style={{ width: `${((dbStats.attempts + dbStats.submissions) / maxRecords) * 100}%`, background: 'linear-gradient(90deg, #f59e0b, #d97706)' }} />
                          </div>
                        </div>

                        <div style={{ background: 'var(--cp-bg)', padding: '16px', borderRadius: '16px', border: '1px solid var(--cp-divider)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '8px' }}>
                            <span style={{ color: 'var(--cp-text-muted)', fontWeight: 600 }}>إيصالات وعمليات الدفع</span>
                            <strong style={{ color: '#ec4899' }}>{dbStats.payments} إيصال</strong>
                          </div>
                          <div className="cp-sa-progress-bar-container">
                            <div className="cp-sa-progress-bar-fill" style={{ width: `${(dbStats.payments / maxRecords) * 100}%`, background: 'linear-gradient(90deg, #ec4899, #db2777)' }} />
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>

                {/* Per-Tenant Quick Maintenance Table */}
                <div className="cp-sa-table-card">
                  <h4 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 16px', color: 'var(--cp-text-main)' }}>
                    صيانة وتصفير منصات المدرسين الفردية
                  </h4>
                  <div className="cp-sa-table-wrapper" style={{ maxHeight: '360px' }}>
                    <table className="cp-sa-table">
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'right' }}>المنصة</th>
                          <th style={{ textAlign: 'right' }}>المعرف</th>
                          <th style={{ textAlign: 'center' }}>الطلاب</th>
                          <th style={{ textAlign: 'center' }}>إجراء الصيانة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenants.map(t => (
                          <tr key={t.id}>
                            <td style={{ fontWeight: 700 }}>{t.name}</td>
                            <td><code className="cp-sa-color-badge">{t.slug}</code></td>
                            <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--primary, #7c3aed)' }}>{t.studentsCount || 0}</td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                onClick={() => {
                                  setSelectedTenantForWipe(t)
                                  setShowWipeModal(true)
                                }}
                                className="cp-btn"
                                style={{
                                  padding: '6px 14px',
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  color: '#ef4444',
                                  border: '1px solid rgba(239, 68, 68, 0.25)',
                                  borderRadius: '8px',
                                  fontSize: '0.8rem',
                                  fontWeight: 'bold',
                                  cursor: 'pointer'
                                }}
                              >
                                <i className="fas fa-trash-can" style={{ marginInlineEnd: '6px' }}></i>
                                <span>تصفير بيانات هذه المنصة</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Danger Zone: Global Database Wipe */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="cp-sa-danger-card" style={{ padding: '24px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', marginBottom: '16px' }}>
                    <i className="fas fa-dumpster-fire"></i>
                  </div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ef4444', margin: '0 0 10px' }}>تصفير وتفريغ قاعدة البيانات الشامل</h3>
                  <p style={{ fontSize: '0.84rem', color: 'var(--cp-text-muted)', margin: '0 0 20px', lineHeight: '1.6' }}>
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

                <div className="cp-sa-sidebar-card">
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 10px', color: 'var(--cp-text-main)' }}>معلومات حساب المطور</h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--cp-text-muted)', margin: '0 0 6px' }}>البريد الإلكتروني الحالي:</p>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--primary, #7c3aed)', display: 'block', wordBreak: 'break-all' }}>{currentUserEmail || 'جاري التحميل...'}</strong>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BUSINESS & FINANCE MANAGEMENT */}
          {activeMainTab === 'business' && (
            <div>
              <Suspense fallback={<div className="cp-empty"><i className="fas fa-spinner fa-spin" /><p>جاري تحميل لوحة الأعمال والمالية...</p></div>}>
                <BusinessPanel flash={flash} />
              </Suspense>
            </div>
          )}

          {/* TAB 4: SECURITY & DEVTOOLS VIOLATIONS */}
          {activeMainTab === 'security' && (
            <div>
              <Suspense fallback={<div className="cp-empty"><i className="fas fa-spinner fa-spin" /><p>جاري تحميل سجلات الحماية والأمان...</p></div>}>
                <DevToolsViolationsPanel flash={flash} />
              </Suspense>
            </div>
          )}

          {/* TAB 5: SEASONAL THEMES MANAGER */}
          {activeMainTab === 'themes' && (
            <div>
              <SeasonalThemePanel flash={flash} />
            </div>
          )}
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
          <div className="cp-portal-modal" style={{ maxWidth: '820px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <button 
              onClick={() => setSelectedTenantForManage(null)}
              style={{ position: 'absolute', top: 20, left: 20, background: 'none', border: 'none', color: 'var(--cp-text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              <i className="fas fa-times"></i>
            </button>

            {/* Modal Header */}
            <div style={{ marginBottom: '16px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: `linear-gradient(135deg, ${selectedTenantForManage.primary_color || '#7c3aed'}, ${selectedTenantForManage.secondary_color || '#06b6d4'})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '15px'
                }}>
                  <i className="fas fa-sliders-h"></i>
                </div>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>إدارة وتخصيص ({selectedTenantForManage.name})</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)' }}>المعرف: <code className="cp-sa-color-badge">{selectedTenantForManage.slug}</code></span>
                </div>
              </div>
            </div>

            {/* Navigation Tabs Bar */}
            <div style={{
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              paddingBottom: '10px',
              marginBottom: '16px',
              borderBottom: '1px solid var(--cp-divider)',
              flexShrink: 0
            }}>
              {[
                { id: 'branding', label: 'الهوية والألوان', icon: 'fa-palette' },
                { id: 'teacher', label: 'المعلم والواجهة', icon: 'fa-chalkboard-user' },
                { id: 'stages', label: 'المراحل والصفوف', icon: 'fa-layer-group' },
                { id: 'features', label: 'الميزات المفعلة', icon: 'fa-toggle-on' },
                { id: 'team', label: 'المدراء والمستخدمين', icon: 'fa-users-gear' },
              ].map(tab => {
                const isActive = manageActiveTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setManageActiveTab(tab.id)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '10px',
                      border: isActive ? '1px solid var(--primary, #7c3aed)' : '1px solid transparent',
                      background: isActive ? 'rgba(124, 58, 237, 0.12)' : 'var(--cp-card-bg)',
                      color: isActive ? 'var(--primary, #7c3aed)' : 'var(--cp-text-muted)',
                      fontWeight: isActive ? 800 : 600,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <i className={`fas ${tab.icon}`} style={{ fontSize: '0.85rem' }}></i>
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Modal Body Container with Scroll */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '2px' }} className="cp-sa-table-wrapper">
              
              {/* Form wrapping settings tabs (branding, teacher, stages, features) */}
              {manageActiveTab !== 'team' && (
                <form id="manage-tenant-form" onSubmit={handleUpdateTenant} style={{ padding: '4px 2px' }}>
                  
                  {/* TAB 1: BRANDING & THEME */}
                  {manageActiveTab === 'branding' && (
                    <div>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '14px', color: 'var(--primary, #7c3aed)' }}>
                        <i className="fas fa-palette" style={{ marginInlineEnd: 6 }} /> البيانات الأساسية والألوان
                      </h4>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
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

                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>اللون الأساسي (Primary Color)</label>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input 
                              type="color"
                              value={editPrimaryColor}
                              onChange={(e) => setEditPrimaryColor(e.target.value)}
                              style={{ width: '38px', height: '38px', padding: 0, border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                            />
                            <code className="cp-sa-color-badge">{editPrimaryColor}</code>
                          </div>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>اللون الفرعي (Secondary Color)</label>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input 
                              type="color"
                              value={editSecondaryColor}
                              onChange={(e) => setEditSecondaryColor(e.target.value)}
                              style={{ width: '38px', height: '38px', padding: 0, border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                            />
                            <code className="cp-sa-color-badge">{editSecondaryColor}</code>
                          </div>
                        </div>
                      </div>

                      {/* Logo Uploader */}
                      <div style={{ marginBottom: '18px' }}>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>شعار المنصة (Logo)</label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          {editLogoUrl && <img src={editLogoUrl} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--cp-divider)', background: '#fff' }} />}
                          <input type="text" value={editLogoUrl} onChange={(e) => setEditLogoUrl(e.target.value)} dir="ltr"
                            placeholder="ارفع صورة من جهازك أو الصق رابطاً" className="cp-input"
                            style={{ flex: 1, padding: '10px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                          <label className="cp-btn cp-btn-secondary" style={{ padding: '9px 14px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className={`fas ${uploadingImage === 'logo' ? 'fa-spinner fa-spin' : 'fa-upload'}`} />
                            <span>رفع شعار</span>
                            <input type="file" accept="image/*" hidden disabled={uploadingImage === 'logo'}
                              onChange={(e) => handleImageUpload(e, 'logo', (url) => setEditLogoUrl(url))} />
                          </label>
                        </div>
                      </div>

                      {/* Hero Titles & Announcements */}
                      <h4 style={{ fontSize: '0.92rem', fontWeight: 800, margin: '20px 0 12px', color: 'var(--primary, #7c3aed)' }}>
                        <i className="fas fa-bullhorn" style={{ marginInlineEnd: 6 }} /> نصوص الواجهة وشريط الإعلانات
                      </h4>

                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>عنوان الصفحة الرئيسية (السطر الأول)</label>
                          <input type="text" value={editHeroTitle} onChange={(e) => setEditHeroTitle(e.target.value)}
                            placeholder="مثال: اللغة العربية" className="cp-input"
                            style={{ width: '100%', padding: '10px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>عنوان الصفحة الرئيسية (السطر الثاني)</label>
                          <input type="text" value={editHeroTitleB} onChange={(e) => setEditHeroTitleB(e.target.value)}
                            placeholder="مثال: لغة الضاد بطعم جديد" className="cp-input"
                            style={{ width: '100%', padding: '10px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                        </div>
                      </div>

                      <div style={{ marginBottom: '14px' }}>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>الوصف التعريفي للمنصة</label>
                        <textarea value={editHeroSub} onChange={(e) => setEditHeroSub(e.target.value)} rows={2}
                          placeholder="وصف قصير يظهر في الصفحة الرئيسية أسفل العنوان" className="cp-input"
                          style={{ width: '100%', padding: '10px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)', resize: 'vertical' }} />
                      </div>

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
                        style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px dashed rgba(16, 185, 129, 0.4)', color: '#10b981', padding: '9px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 'bold', cursor: 'pointer', width: '100%', marginBottom: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <i className="fas fa-plus" /> إضافة إعلان للشريط العلوي
                      </button>

                      {/* Social Media & Contact */}
                      <h4 style={{ fontSize: '0.92rem', fontWeight: 800, margin: '20px 0 12px', color: 'var(--primary, #7c3aed)' }}>
                        <i className="fas fa-share-nodes" style={{ marginInlineEnd: 6 }} /> وسائل التواصل والمساعدة
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '18px' }}>
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
                              style={{ flex: 1, padding: '8px 10px', fontSize: '0.82rem', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                          </div>
                        ))}
                      </div>

                      {/* Advanced theme tokens */}
                      <h4 style={{ fontSize: '0.92rem', fontWeight: 800, margin: '20px 0 10px', color: 'var(--primary, #7c3aed)' }}>
                        <i className="fas fa-sliders" style={{ marginInlineEnd: 6 }} /> تخصيص الثيم المتقدم (خلفيات وكروت)
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                        {THEME_TOKEN_DEFS.map(tk => (
                          <div key={tk.key}>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 'bold', marginBottom: '2px' }}>{tk.label}</label>
                            {tk.hint && <div style={{ fontSize: '0.68rem', color: 'var(--cp-text-muted)', marginBottom: '4px', lineHeight: 1.3 }}>{tk.hint}</div>}
                            {tk.type === 'color' ? (
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <input type="color" value={editTheme[tk.key] || tk.fallback}
                                  onChange={(e) => setEditTheme(prev => ({ ...prev, [tk.key]: e.target.value }))}
                                  style={{ width: '34px', height: '34px', padding: 0, border: 'none', borderRadius: '6px', cursor: 'pointer' }} />
                                <input type="text" value={editTheme[tk.key]} dir="ltr" placeholder={tk.fallback}
                                  onChange={(e) => setEditTheme(prev => ({ ...prev, [tk.key]: e.target.value }))}
                                  className="cp-input"
                                  style={{ flex: 1, padding: '7px 9px', fontSize: '0.8rem', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                              </div>
                            ) : (
                              <input type="text" value={editTheme[tk.key]} dir="ltr"
                                placeholder="#0f0f23 أو gradient"
                                onChange={(e) => setEditTheme(prev => ({ ...prev, [tk.key]: e.target.value }))}
                                className="cp-input"
                                style={{ width: '100%', padding: '8px', fontSize: '0.8rem', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: TEACHER & LANDING PAGE */}
                  {manageActiveTab === 'teacher' && (
                    <div>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '14px', color: 'var(--primary, #7c3aed)' }}>
                        <i className="fas fa-chalkboard-user" style={{ marginInlineEnd: 6 }} /> بيانات المعلم وصفحة تسجيل الدخول
                      </h4>

                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>اسم المعلم *</label>
                          <input type="text" value={editTeacherName} onChange={(e) => setEditTeacherName(e.target.value)}
                            placeholder="مثال: الأستاذ أحمد محمد" className="cp-input"
                            style={{ width: '100%', padding: '10px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '6px' }}>وصف المعلم / التخصص</label>
                          <input type="text" value={editTeacherRole} onChange={(e) => setEditTeacherRole(e.target.value)}
                            placeholder="مثال: مدرّس أول الفيزياء للثانوية العامة" className="cp-input"
                            style={{ width: '100%', padding: '10px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                        </div>
                      </div>

                      {/* Detailed Teacher Profile Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                        {TEACHER_EXTRA_DEFS.map(f => (
                          <div key={f.key} style={f.textarea ? { gridColumn: isMobile ? 'auto' : 'span 2' } : undefined}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '6px' }}>{f.label}</label>
                            {f.textarea ? (
                              <textarea value={editTeacherExtra[f.key] || ''} rows={2}
                                onChange={(e) => setEditTeacherExtra(prev => ({ ...prev, [f.key]: e.target.value }))}
                                placeholder={f.placeholder || ''}
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
                                placeholder={f.placeholder || ''}
                                className="cp-input"
                                style={{ width: '100%', padding: '10px', fontSize: '0.82rem', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Login landing sections toggles */}
                      <h4 style={{ fontSize: '0.92rem', fontWeight: 800, margin: '20px 0 10px', color: 'var(--primary, #7c3aed)' }}>
                        <i className="fas fa-eye" style={{ marginInlineEnd: 6 }} /> أقسام صفحة الهبوط (تسجيل الدخول)
                      </h4>
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

                      {/* Branches / locations */}
                      <h4 style={{ fontSize: '0.92rem', fontWeight: 800, margin: '20px 0 10px', color: 'var(--primary, #7c3aed)' }}>
                        <i className="fas fa-location-dot" style={{ marginInlineEnd: 6 }} /> الفروع والمقرات السناتر
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '12px' }}>
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
                        style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px dashed rgba(16, 185, 129, 0.4)', color: '#10b981', padding: '10px', borderRadius: '10px', fontSize: '0.84rem', fontWeight: 'bold', cursor: 'pointer', width: '100%', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <i className="fas fa-plus" /> إضافة فرع / سنتر جديد
                      </button>
                    </div>
                  )}

                  {/* TAB 3: STAGES & GRADES */}
                  {manageActiveTab === 'stages' && (
                    <div>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '14px', color: 'var(--primary, #7c3aed)' }}>
                        <i className="fas fa-layer-group" style={{ marginInlineEnd: 6 }} /> تحديد المادة والمراحل الدراسية المفعلة
                      </h4>

                      <div style={{ marginBottom: '20px', maxWidth: '400px' }}>
                        <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 'bold', marginBottom: '6px' }}>المادة الدراسية للمنصة (تحدد الثيم والتخصص)</label>
                        <select value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="cp-input"
                          style={{ width: '100%', padding: '10px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }}>
                          {SUBJECT_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                        {editStages.map((stage, si) => (
                          <div key={stage.id} style={{ border: '1px solid var(--cp-divider)', borderRadius: '12px', padding: '14px', background: stage.enabled !== false ? 'rgba(99, 102, 241, 0.02)' : 'transparent', opacity: stage.enabled === false ? 0.55 : 1 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', marginBottom: '12px' }}>
                              <input type="checkbox" checked={stage.enabled !== false}
                                onChange={(e) => setEditStages(prev => prev.map((s, i) => i === si ? { ...s, enabled: e.target.checked } : s))}
                                style={{ accentColor: 'var(--primary, #7c3aed)', width: 16, height: 16 }} />
                              <span>{stage.name}</span>
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                                    style={{ flex: 1, padding: '6px 8px', fontSize: '0.8rem', border: '1px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }} />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TAB 4: FEATURES TOGGLES */}
                  {manageActiveTab === 'features' && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                        <div>
                          <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 4px', color: 'var(--primary, #7c3aed)' }}>
                            <i className="fas fa-sliders" style={{ marginInlineEnd: 8 }} />
                            التحكم في ميزات وباقات المنصة (Granular Capability Entitlements)
                          </h4>
                          <p style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)', margin: 0, lineHeight: 1.5 }}>
                            تحكم تفصيلي شامل في كل صفحة وزر وخاصية للمنصة. الميزة المعطلة تختفي تماماً دون أي أخطاء.
                          </p>
                        </div>

                        {/* Search Filter */}
                        <div style={{ position: 'relative', minWidth: '220px' }}>
                          <input
                            type="text"
                            placeholder="بحث في الميزات والصلاحيات..."
                            value={searchFeatureQuery}
                            onChange={(e) => setSearchFeatureQuery(e.target.value)}
                            className="cp-input"
                            style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: '0.82rem' }}
                          />
                          <i className="fas fa-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--cp-text-muted)', fontSize: '0.8rem' }} />
                        </div>
                      </div>

                      {/* 1-Click Provisioning Presets */}
                      <div style={{ marginBottom: '20px', padding: '14px', background: 'rgba(124, 58, 237, 0.04)', border: '1px solid rgba(124, 58, 237, 0.15)', borderRadius: '16px' }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--cp-text-main)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <i className="fas fa-wand-magic-sparkles" style={{ color: 'var(--primary, #7c3aed)' }}></i>
                          <span>باقات الإعداد السريع (1-Click Presets):</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '10px' }}>
                          {FEATURE_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => {
                                setEditFeatures(prev => ({ ...prev, ...preset.features }))
                                flash(`تم تطبيق قالب: ${preset.nameAr}`, 'info')
                              }}
                              style={{
                                padding: '10px 14px',
                                borderRadius: '12px',
                                border: `1px solid ${preset.color}40`,
                                background: `${preset.color}0d`,
                                textAlign: 'right',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = `${preset.color}1a`
                                e.currentTarget.style.transform = 'translateY(-1px)'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = `${preset.color}0d`
                                e.currentTarget.style.transform = 'translateY(0)'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: preset.color, fontWeight: 800, fontSize: '0.85rem' }}>
                                <i className={`fas ${preset.icon}`}></i>
                                <span>{preset.nameAr}</span>
                              </div>
                              <span style={{ fontSize: '0.73rem', color: 'var(--cp-text-muted)', lineHeight: 1.4 }}>
                                {preset.descriptionAr}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Categorized Features Grid */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
                        {FEATURE_CATEGORIES.map((category) => {
                          const categoryFeatures = PLATFORM_FEATURES.filter(f => {
                            if (f.category !== category.id) return false
                            if (!searchFeatureQuery) return true
                            const q = searchFeatureQuery.trim().toLowerCase()
                            return (
                              (f.nameAr && f.nameAr.toLowerCase().includes(q)) ||
                              (f.nameEn && f.nameEn.toLowerCase().includes(q)) ||
                              (f.descriptionAr && f.descriptionAr.toLowerCase().includes(q)) ||
                              (f.key && f.key.toLowerCase().includes(q))
                            )
                          })

                          if (categoryFeatures.length === 0) return null
                          const activeCount = categoryFeatures.filter(f => editFeatures[f.key] !== false).length

                          return (
                            <div key={category.id} style={{ border: '1px solid var(--cp-divider)', borderRadius: '16px', padding: '16px', background: 'var(--cp-card-bg, #fff)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--cp-divider)', paddingBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '0.9rem', color: 'var(--cp-text-main)' }}>
                                  <i className={`fas ${category.icon}`} style={{ color: 'var(--primary, #7c3aed)' }}></i>
                                  <span>{category.nameAr}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updates = {}
                                      categoryFeatures.forEach(f => { updates[f.key] = true })
                                      setEditFeatures(prev => ({ ...prev, ...updates }))
                                    }}
                                    style={{ border: 'none', background: 'none', color: '#10b981', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                  >
                                    تفعيل القسم
                                  </button>
                                  <span style={{ color: 'var(--cp-divider)' }}>|</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updates = {}
                                      categoryFeatures.forEach(f => { updates[f.key] = false })
                                      setEditFeatures(prev => ({ ...prev, ...updates }))
                                    }}
                                    style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                  >
                                    تعطيل القسم
                                  </button>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: activeCount > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(100, 116, 139, 0.12)', color: activeCount > 0 ? '#10b981' : '#64748b' }}>
                                    {activeCount} / {categoryFeatures.length} مفعّل
                                  </span>
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '12px' }}>
                                {categoryFeatures.map((f) => {
                                  const isParentDisabled = f.parentKey && editFeatures[f.parentKey] === false
                                  const isChecked = editFeatures[f.key] !== false && !isParentDisabled

                                  return (
                                    <label
                                      key={f.key}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '12px',
                                        padding: '12px 14px',
                                        border: f.isParent 
                                          ? (isChecked ? '1.5px solid #8b5cf6' : '1.5px solid var(--cp-divider)')
                                          : (isChecked ? '1px solid rgba(16, 185, 129, 0.45)' : '1px solid var(--cp-divider)'),
                                        borderRadius: '14px',
                                        background: f.isParent
                                          ? (isChecked ? 'rgba(139, 92, 246, 0.06)' : 'var(--cp-bg, #f8fafc)')
                                          : (isChecked ? 'rgba(16, 185, 129, 0.05)' : 'var(--cp-bg, #f8fafc)'),
                                        cursor: isParentDisabled ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s ease',
                                        userSelect: 'none',
                                        opacity: isParentDisabled ? 0.55 : 1,
                                        marginInlineStart: f.parentKey ? '12px' : '0'
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={editFeatures[f.key] !== false}
                                        disabled={isParentDisabled}
                                        onChange={(e) => setEditFeatures(prev => ({ ...prev, [f.key]: e.target.checked }))}
                                        style={{ accentColor: f.isParent ? '#8b5cf6' : '#10b981', width: 18, height: 18, marginTop: '2px', cursor: isParentDisabled ? 'not-allowed' : 'pointer', flexShrink: 0 }}
                                      />
                                      <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
                                          {f.parentKey && <span style={{ color: 'var(--cp-text-muted)', fontSize: '0.8rem' }}>└─</span>}
                                          <i className={`fas ${f.icon}`} style={{ fontSize: '0.85rem', color: isChecked ? (f.isParent ? '#8b5cf6' : '#10b981') : 'var(--cp-text-muted)' }}></i>
                                          <span style={{ fontSize: '0.86rem', fontWeight: 700, color: isChecked ? 'var(--cp-text-main)' : 'var(--cp-text-muted)' }}>
                                            {f.nameAr}
                                          </span>
                                          {f.isParent && (
                                            <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '6px', background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', fontWeight: 800 }}>
                                              رئيسي
                                            </span>
                                          )}
                                          {isParentDisabled && (
                                            <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontWeight: 700 }}>
                                              معطل لتعطيل الرئيسي
                                            </span>
                                          )}
                                        </div>
                                        <p style={{ fontSize: '0.74rem', color: 'var(--cp-text-muted)', margin: 0, lineHeight: 1.45 }}>
                                          {f.descriptionAr}
                                        </p>
                                      </div>
                                    </label>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Sticky Footer Save Button for Tabs 1-4 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--cp-divider)' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--cp-text-muted)' }}>
                      <i className="fas fa-info-circle" style={{ marginInlineEnd: '6px', color: 'var(--primary)' }}></i>
                      اضغط حفظ لتثبيت كافة تعديلات المنصة فوراً.
                    </span>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedTenantForManage(null)}
                        className="cp-btn cp-btn-secondary"
                        style={{ padding: '8px 18px', height: '40px', fontSize: '0.84rem' }}
                      >
                        إلغاء
                      </button>
                      <button
                        type="submit"
                        disabled={savingTenant}
                        className="cp-btn cp-btn-primary"
                        style={{ padding: '8px 22px', background: 'var(--primary, #7c3aed)', color: '#fff', fontWeight: 'bold', height: '40px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
                      >
                        {savingTenant ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>}
                        <span>{savingTenant ? 'جاري الحفظ...' : 'حفظ التعديلات'}</span>
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* TAB 5: ADMINS & USERS MANAGEMENT */}
              {manageActiveTab === 'team' && (
                <div style={{ padding: '4px 2px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--primary, #7c3aed)' }}>
                        <i className="fas fa-users-gear" style={{ marginInlineEnd: 6 }} /> إدارة صلاحيات المستخدمين والمدراء
                      </h4>
                      <button
                        type="button"
                        onClick={() => handleOpenAddAdmin(selectedTenantForManage)}
                        className="cp-btn"
                        style={{
                          padding: '7px 14px',
                          fontSize: '0.82rem',
                          fontWeight: 'bold',
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          color: '#fff',
                          borderRadius: '8px',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)'
                        }}
                      >
                        <i className="fas fa-user-plus"></i>
                        <span>+ إضافة مدير جديد</span>
                      </button>
                    </div>
                    <div style={{ position: 'relative', maxWidth: isMobile ? '100%' : '260px', width: '100%' }}>
                      <input 
                        type="text"
                        placeholder="البحث باسم المستخدم أو الهاتف..."
                        value={searchUserQuery}
                        onChange={(e) => setSearchUserQuery(e.target.value)}
                        className="cp-input"
                        style={{ width: '100%', padding: '9px 12px 9px 34px', fontSize: '0.82rem', border: '1.5px solid var(--cp-input-border)', background: 'var(--cp-input-bg)', color: 'var(--cp-input-text)' }}
                      />
                      <i className="fas fa-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '12px' }}></i>
                    </div>
                  </div>

                  {filteredUsers.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', border: '1px dashed var(--cp-divider)', borderRadius: '16px', color: 'var(--cp-text-muted)' }}>
                      <i className="fas fa-users-slash" style={{ fontSize: '28px', marginBottom: '10px', display: 'block', opacity: 0.6 }}></i>
                      <span>لا يوجد مستخدمين مسجلين يطابقون البحث في هذه المنصة.</span>
                    </div>
                  ) : (
                    <div style={{ border: '1px solid var(--cp-divider)', borderRadius: '14px', overflow: 'hidden', background: 'var(--cp-card-bg)' }}>
                      <div style={{ maxHeight: '360px', overflowY: 'auto' }} className="cp-sa-table-wrapper">
                        <table style={{ width: '100%', fontSize: '0.88rem', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: 'rgba(99, 102, 241, 0.04)', borderBottom: '1px solid var(--cp-divider)' }}>
                              <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 'bold', color: 'var(--cp-text-muted)' }}>الاسم</th>
                              <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 'bold', color: 'var(--cp-text-muted)' }}>رقم الهاتف</th>
                              <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 'bold', color: 'var(--cp-text-muted)' }}>الصلاحية الحالية</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredUsers.map(u => (
                              <tr key={u.id} style={{ borderBottom: '1px solid var(--cp-divider)' }}>
                                <td style={{ padding: '12px 14px', fontWeight: 600 }}>{u.name}</td>
                                <td style={{ padding: '12px 14px', color: 'var(--cp-text-muted)', direction: 'ltr', textAlign: 'right' }}>{u.phone}</td>
                                <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                  <select
                                    value={u.role}
                                    onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                                    disabled={userRoleUpdating === u.id}
                                    style={{
                                      padding: '6px 14px',
                                      borderRadius: '8px',
                                      border: '1.5px solid var(--cp-input-border)',
                                      background: 'var(--cp-input-bg)',
                                      color: 'var(--cp-input-text)',
                                      fontSize: '0.82rem',
                                      fontWeight: '600',
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
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add New Admin to Tenant Modal */}
      {showAddAdminModal && addAdminTenant && createPortal(
        <div className="cp-portal-overlay">
          <div className="cp-portal-modal" style={{ maxWidth: '480px' }}>
            <button 
              onClick={() => {
                setShowAddAdminModal(false)
                setAddAdminName('')
                setAddAdminPhone('')
                setAddAdminPassword('')
                setAddAdminTenant(null)
              }}
              style={{ position: 'absolute', top: 20, left: 20, background: 'none', border: 'none', color: 'var(--cp-text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              <i className="fas fa-times"></i>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.12)',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem'
              }}>
                <i className="fas fa-user-shield"></i>
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>إضافة مدير جديد للمنصة</h3>
                <span style={{ fontSize: '0.82rem', color: 'var(--primary, #7c3aed)', fontWeight: 600 }}>{addAdminTenant.name} ({addAdminTenant.slug})</span>
              </div>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--cp-text-muted)', lineHeight: '1.5', margin: '12px 0 20px' }}>
              سيتم إنشاء حساب مدير بصلاحية كاملة (Admin) على منصة <strong>({addAdminTenant.name})</strong> مباشرة وبدون الحاجة لترقية حساب طالب سابق.
            </p>

            <form onSubmit={handleAddAdminSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px' }}>اسم المدير *</label>
                <input 
                  type="text"
                  required
                  value={addAdminName}
                  onChange={(e) => setAddAdminName(e.target.value)}
                  placeholder="مثال: أ. محمد أحمد"
                  className="cp-input"
                  style={{ width: '100%', padding: '12px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)' }}
                  disabled={addingAdmin}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px' }}>رقم الهاتف (لتسجيل الدخول) *</label>
                <input 
                  type="tel"
                  required
                  value={addAdminPhone}
                  onChange={(e) => setAddAdminPhone(e.target.value.replace(/\s+/g, ''))}
                  placeholder="01012345678"
                  className="cp-input"
                  style={{ width: '100%', padding: '12px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)', direction: 'ltr', textAlign: 'right' }}
                  disabled={addingAdmin}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px' }}>كلمة المرور *</label>
                <input 
                  type="text"
                  required
                  minLength={6}
                  value={addAdminPassword}
                  onChange={(e) => setAddAdminPassword(e.target.value)}
                  placeholder="6 أحرف أو أرقام على الأقل"
                  className="cp-input"
                  style={{ width: '100%', padding: '12px', border: '1.5px solid var(--cp-input-border)', color: 'var(--cp-input-text)', background: 'var(--cp-input-bg)', direction: 'ltr' }}
                  disabled={addingAdmin}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="submit"
                  disabled={addingAdmin}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '12px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    height: '46px',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                  }}
                >
                  {addingAdmin ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-user-plus"></i>}
                  <span>{addingAdmin ? 'جاري إنشاء الحساب...' : 'إنشاء حساب المدير الآن'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddAdminModal(false)
                    setAddAdminName('')
                    setAddAdminPhone('')
                    setAddAdminPassword('')
                    setAddAdminTenant(null)
                  }}
                  disabled={addingAdmin}
                  className="cp-btn cp-btn-secondary"
                  style={{
                    padding: '12px 20px',
                    borderRadius: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    height: '46px'
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
    </div>
  )
}

